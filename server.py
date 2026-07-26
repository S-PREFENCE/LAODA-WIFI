#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""server.py — 劳大象棋联机服务端（零依赖，仅用 Python 标准库）
功能（与 server.js 等价的主干）：
  1) 静态托管前端（index.html / css / js / assets）
  2) 手写最小 WebSocket：房间码配对 + 棋步中继 + 结构校验
说明：Python 无法复用前端的 JS 规则引擎，因此本版做「结构校验」（走子方颜色、
轮次、越界、不可自吃）+ 中继；完整「规则权威校验」由 Node 版 server.js 承担。
两者都零依赖、零外网，内网主机有任一运行时即可。
用法：python server.py [端口]   默认 3000
"""
import socket
import socketserver
import struct
import base64
import hashlib
import os
import sys
import json
import mimetypes
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}

rooms = {}          # code -> room dict
used_codes = set()
rooms_lock = threading.Lock()


def initial_board():
    b = [[None] * 9 for _ in range(10)]
    back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']
    for c in range(9):
        b[0][c] = ('black', back[c])
        b[9][c] = ('red', back[c])
    b[2][1] = ('black', 'C'); b[2][7] = ('black', 'C')
    b[7][1] = ('red', 'C');   b[7][7] = ('red', 'C')
    for c in range(0, 9, 2):
        b[3][c] = ('black', 'P')
        b[6][c] = ('red', 'P')
    return b


def gen_code():
    import random
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    while True:
        code = ''.join(random.choice(chars) for _ in range(6))
        if code not in used_codes:
            return code


def ser_piece(p):
    return None if p is None else (p[0][0] + p[1])


def serialize_board(board):
    return [[ser_piece(cell) for cell in row] for row in board]


def serialize_history(hist):
    return [{'from': h['from'], 'to': h['to'], 'side': h['side'], 'piece': ser_piece(h['piece'])} for h in hist]


def opposite(c):
    return 'black' if c == 'red' else 'red'


# ---------- WebSocket 帧编解码（RFC 6455，最小实现） ----------
def encode_frame(data, opcode=0x1):
    if isinstance(data, str):
        data = data.encode('utf-8')
    length = len(data)
    if length < 126:
        header = bytes([0x80 | opcode, length])
    elif length < 65536:
        header = bytes([0x80 | opcode, 126]) + struct.pack('>H', length)
    else:
        header = bytes([0x80 | opcode, 127]) + struct.pack('>Q', length)
    return header + data


def decode_frame(buf):
    if len(buf) < 2:
        return None
    b0, b1 = buf[0], buf[1]
    fin = (b0 & 0x80) != 0
    opcode = b0 & 0x0f
    masked = (b1 & 0x80) != 0
    length = b1 & 0x7f
    idx = 2
    if length == 126:
        if len(buf) < 4:
            return None
        length = struct.unpack('>H', buf[2:4])[0]; idx = 4
    elif length == 127:
        if len(buf) < 10:
            return None
        length = struct.unpack('>Q', buf[2:10])[0]; idx = 10
    if masked:
        if len(buf) < idx + 4:
            return None
        mask = buf[idx:idx + 4]; idx += 4
    if len(buf) < idx + length:
        return None
    payload = buf[idx:idx + length]
    if masked:
        payload = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))
    return (fin, opcode, payload, idx + length)


def send_json(sock, obj):
    try:
        sock.sendall(encode_frame(json.dumps(obj)))
    except Exception:
        pass


# ---------- 静态文件服务 ----------
def serve_static(conn, path):
    if path in ('/', ''):
        path = '/index.html'
    filepath = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
    if not filepath.startswith(ROOT) or not os.path.isfile(filepath):
        body = b'Not Found'
        conn.sendall(('HTTP/1.1 404 Not Found\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % len(body)).encode())
        conn.sendall(body)
        return
    ext = os.path.splitext(filepath)[1].lower()
    ctype = MIME.get(ext, mimetypes.guess_type(filepath)[0] or 'application/octet-stream')
    try:
        with open(filepath, 'rb') as f:
            body = f.read()
    except Exception:
        body = b'Not Found'
        conn.sendall(('HTTP/1.1 404 Not Found\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % len(body)).encode())
        conn.sendall(body)
        return
    header = ('HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % (ctype, len(body))).encode()
    conn.sendall(header)
    conn.sendall(body)


# ---------- 房间逻辑 ----------
def make_room():
    with rooms_lock:
        code = gen_code()
        room = {
            'code': code, 'sockets': [], 'colors': {}, 'board': initial_board(),
            'turn': 'red', 'started': False, 'finished': False, 'ply': 0,
            'history': [], 'captured_red': [], 'captured_black': [],
            'pending_draw': None, 'pending_undo': None,
        }
        rooms[code] = room
        used_codes.add(code)
    return room, code


def remove_socket(room, sock):
    with rooms_lock:
        if sock in room['sockets']:
            room['sockets'].remove(sock)
        room['pending_draw'] = None
        room['pending_undo'] = None
        if len(room['sockets']) == 0:
            # 仅当房间从未开局才彻底删除并释放房间码；
            # 已开局的对局保留房间与棋盘，允许凭房间码重连回归。
            if not room['started']:
                rooms.pop(room['code'], None)
                used_codes.discard(room['code'])
        else:
            for s in room['sockets']:
                send_json(s, {'type': 'opponent_left'})


def broadcast(room, obj, except_sock=None):
    for s in list(room['sockets']):
        if s is not except_sock:
            send_json(s, obj)


def handle_message(room, conn, msg):
    mtype = msg.get('type')

    if mtype == 'move':
        if not room['started'] or room['finished']:
            return
        if room['colors'][conn] != room['turn']:
            send_json(conn, {'type': 'error', 'msg': '还没轮到你'})
            return
        f = msg.get('from', {}); t = msg.get('to', {})
        fr, fc, tr, tc = f.get('r'), f.get('c'), t.get('r'), t.get('c')
        if not all(isinstance(v, int) for v in (fr, fc, tr, tc)):
            return
        if not (0 <= fr < 10 and 0 <= fc < 9 and 0 <= tr < 10 and 0 <= tc < 9):
            send_json(conn, {'type': 'error', 'msg': '非法走法'})
            return
        piece = room['board'][fr][fc]
        if piece is None or piece[0] != room['colors'][conn]:
            send_json(conn, {'type': 'error', 'msg': '非法走法'})
            return
        target = room['board'][tr][tc]
        if target is not None and target[0] == room['colors'][conn]:
            send_json(conn, {'type': 'error', 'msg': '不可自吃'})
            return
        # 应用（仅结构层面：搬子），规则合法性由客户端保证
        captured = room['board'][tr][tc]
        moved_piece = (piece[0], piece[1])
        room['board'][tr][tc] = piece
        room['board'][fr][fc] = None
        room['history'].append({
            'from': f, 'to': t, 'side': room['colors'][conn],
            'piece': moved_piece,
            'captured': captured,
        })
        if captured is not None:
            if captured[0] == 'black':
                room['captured_red'].append(captured)
            else:
                room['captured_black'].append(captured)
        room['ply'] += 1
        room['turn'] = 'black' if room['turn'] == 'red' else 'red'
        room['pending_draw'] = None
        room['pending_undo'] = None
        broadcast(room, {'type': 'move', 'from': f, 'to': t, 'color': room['colors'][conn], 'ply': room['ply']}, except_sock=conn)
        return

    if mtype == 'resign':
        if room['finished']:
            return
        room['finished'] = True
        winner = 'black' if room['colors'][conn] == 'red' else 'red'
        room['winner'] = winner
        broadcast(room, {'type': 'resigned', 'winner': winner})
        return

    # ---------- 求和（双方确认） ----------
    if mtype == 'draw_offer':
        if not room['started'] or room['finished']:
            return
        room['pending_draw'] = room['colors'][conn]
        broadcast(room, {'type': 'draw_offer', 'from': room['colors'][conn]}, except_sock=conn)
        return
    if mtype == 'draw_accept':
        if not room['started'] or room['finished'] or not room['pending_draw']:
            return
        room['finished'] = True
        room['winner'] = 'draw'
        room['pending_draw'] = None
        room['pending_undo'] = None
        broadcast(room, {'type': 'game_over', 'winner': 'draw'})
        return
    if mtype == 'draw_decline':
        room['pending_draw'] = None
        broadcast(room, {'type': 'draw_decline'}, except_sock=conn)
        return

    # ---------- 悔棋（双方确认，服务端权威回滚） ----------
    if mtype == 'undo_request':
        if not room['started'] or room['finished']:
            return
        if len(room['history']) == 0:
            send_json(conn, {'type': 'error', 'msg': '暂无可悔棋步'})
            return
        room['pending_undo'] = room['colors'][conn]
        broadcast(room, {'type': 'undo_request', 'from': room['colors'][conn]}, except_sock=conn)
        return
    if mtype == 'undo_accept':
        if not room['started'] or room['finished'] or not room['pending_undo']:
            return
        if len(room['history']) == 0:
            room['pending_undo'] = None
            return
        last = room['history'].pop()
        piece = last['piece']
        captured = last['captured']
        room['board'][last['to']['r']][last['to']['c']] = captured
        room['board'][last['from']['r']][last['from']['c']] = (piece[0], piece[1])
        room['turn'] = last['side']
        room['ply'] = max(0, room['ply'] - 1)
        if captured is not None:
            if captured[0] == 'black':
                room['captured_red'].pop()
            else:
                room['captured_black'].pop()
        room['pending_undo'] = None
        room['pending_draw'] = None
        st = {
            'type': 'state', 'board': serialize_board(room['board']), 'turn': room['turn'],
            'ply': room['ply'], 'history': serialize_history(room['history']),
            'captured_red': [ser_piece(p) for p in room['captured_red']],
            'captured_black': [ser_piece(p) for p in room['captured_black']],
            'finished': False, 'winner': None, 'appliedUndo': True, 'ready': True,
        }
        broadcast(room, st)
        return
    if mtype == 'undo_decline':
        room['pending_undo'] = None
        broadcast(room, {'type': 'undo_decline'}, except_sock=conn)
        return

    # ---------- 再来一局（房间复用） ----------
    if mtype == 'rematch':
        if not room['started']:
            return
        if len(room['sockets']) < 2:
            send_json(conn, {'type': 'error', 'msg': '对手已离开，无法再来一局'})
            return
        if not room['finished']:
            return
        room['board'] = initial_board()
        room['turn'] = 'red'
        room['ply'] = 0
        room['history'] = []
        room['captured_red'] = []
        room['captured_black'] = []
        room['finished'] = False
        room['pending_draw'] = None
        room['pending_undo'] = None
        for s in room['sockets']:
            send_json(s, {'type': 'start', 'color': room['colors'][s]})
        return


# ---------- 连接处理 ----------
def handle_conn(conn, addr):
    try:
        # 读 HTTP 请求头
        data = b''
        while b'\r\n\r\n' not in data:
            chunk = conn.recv(4096)
            if not chunk:
                conn.close(); return
            data += chunk
            if len(data) > 65536:
                break
        header_text = data.split(b'\r\n\r\n')[0].decode('utf-8', 'ignore')
        lines = header_text.split('\r\n')
        if not lines:
            conn.close(); return
        method, path, _ = lines[0].split(' ', 2) if len(lines[0].split(' ')) >= 2 else ('GET', '/', '')
        headers = {}
        for ln in lines[1:]:
            if ':' in ln:
                k, v = ln.split(':', 1)
                headers[k.strip().lower()] = v.strip()

        if headers.get('upgrade', '').lower() == 'websocket':
            key = headers.get('sec-websocket-key', '')
            accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
            resp = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Accept: %s\r\n\r\n" % accept
            ).encode()
            conn.sendall(resp)
            ws_loop(conn, addr)
        else:
            serve_static(conn, path)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


def ws_loop(conn, addr):
    room = None
    try:
        buf = b''
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                break
            buf += chunk
            while True:
                frame = decode_frame(buf)
                if not frame:
                    break
                _, opcode, payload, consumed = frame
                buf = buf[consumed:]
                if opcode == 0x8:      # close
                    return
                if opcode == 0x9:      # ping -> pong
                    conn.sendall(encode_frame(payload, 0xA))
                    continue
                if opcode != 0x1:      # 仅处理文本帧
                    continue
                try:
                    msg = json.loads(payload.decode('utf-8'))
                except Exception:
                    continue
                mtype = msg.get('type')
                if mtype == 'create':
                    if room is None:
                        room, _ = make_room()
                        room['sockets'].append(conn)
                        room['colors'][conn] = 'red'
                    send_json(conn, {'type': 'created', 'room': room['code'], 'color': 'red'})
                elif mtype == 'join':
                    target = rooms.get((msg.get('room') or '').upper())
                    if not target or len(target['sockets']) >= 2:
                        send_json(conn, {'type': 'error', 'msg': '房间不存在或已失效'})
                        continue
                    # 若此前自建过临时房间，先退出
                    if room and room is not target:
                        room['sockets'].remove(conn)
                        room['colors'].pop(conn, None)
                        if not room['sockets']:
                            rooms.pop(room['code'], None)
                            used_codes.discard(room['code'])
                    room = target
                    # 分配颜色：已有 1 人 → 占空缺颜色（支持凭码回归）；0 人 → 占红方
                    if len(room['sockets']) == 1:
                        existing = next(iter(room['sockets']))
                        assign_color = 'black' if room['colors'][existing] == 'red' else 'red'
                    else:
                        assign_color = 'red'
                    room['sockets'].append(conn)
                    room['colors'][conn] = assign_color
                    room['started'] = True
                    if len(room['sockets']) == 2:
                        # 先发 start(着色+可走)，再发 state(权威棋盘)，兼容首局与中途重连
                        for s in room['sockets']:
                            send_json(s, {'type': 'start', 'color': room['colors'][s]})
                        # 通知加入者其加入成功（房间码 + 颜色），与原单局流程一致
                        send_json(conn, {'type': 'joined', 'room': room['code'], 'color': assign_color})
                        if room['finished']:
                            room['board'] = initial_board()
                            room['turn'] = 'red'; room['ply'] = 0; room['history'] = []
                            room['captured_red'] = []; room['captured_black'] = []
                            room['finished'] = False
                            room['pending_draw'] = None; room['pending_undo'] = None
                        else:
                            st = {
                                'type': 'state', 'board': serialize_board(room['board']), 'turn': room['turn'],
                                'ply': room['ply'], 'history': serialize_history(room['history']),
                                'captured_red': [ser_piece(p) for p in room['captured_red']],
                                'captured_black': [ser_piece(p) for p in room['captured_black']],
                                'finished': False, 'winner': None, 'resumed': room['ply'] > 0, 'ready': True,
                            }
                            for s in room['sockets']:
                                send_json(s, st)
                    else:
                        # 仅一人凭码回归，等待对手：发 start(着色) + state(当前棋盘, 未就位)
                        send_json(conn, {'type': 'start', 'color': assign_color})
                        send_json(conn, {'type': 'state', 'board': serialize_board(room['board']), 'turn': room['turn'],
                            'ply': room['ply'], 'history': serialize_history(room['history']),
                            'captured_red': [ser_piece(p) for p in room['captured_red']],
                            'captured_black': [ser_piece(p) for p in room['captured_black']],
                            'finished': room['finished'], 'winner': room.get('winner'), 'resumed': True, 'ready': False})
                        send_json(conn, {'type': 'joined', 'room': room['code'], 'color': assign_color, 'waiting': True})
                else:
                    handle_message(room, conn, msg)
    except Exception:
        pass
    finally:
        if room:
            remove_socket(room, conn)


def main():
    import socket as _s
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', '3000'))
    srv_sock = _s.socket(_s.AF_INET, _s.SOCK_STREAM)
    srv_sock.setsockopt(_s.SOL_SOCKET, _s.SO_REUSEADDR, 1)
    srv_sock.bind(('0.0.0.0', port))
    srv_sock.listen(128)
    print('劳大象棋 · 联机服务端（Python）已启动')
    print('本机访问：  http://127.0.0.1:%d/' % port)
    try:
        import netifaces  # 可选，用于打印内网 IP
        for name, addrs in netifaces.ifaddresses().items():
            for a in addrs:
                if a.get('addr') and '.' in a['addr'] and a['addr'] != '127.0.0.1':
                    print('内网访问：  http://%s:%d/  （%s）' % (a['addr'], port, name))
    except Exception:
        pass
    try:
        while True:
            conn, addr = srv_sock.accept()
            t = threading.Thread(target=handle_conn, args=(conn, addr), daemon=True)
            t.start()
    except KeyboardInterrupt:
        pass
    finally:
        srv_sock.close()


if __name__ == '__main__':
    main()
