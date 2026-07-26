#!/bin/sh
# 劳大象棋联机服务端启动器（自动检测 node / python3，零依赖）
PORT="${1:-3000}"
DIR=$(dirname "$0")

if command -v node >/dev/null 2>&1; then
  echo "使用 Node 启动服务端（端口 $PORT）..."
  node "$DIR/server.js" "$PORT"
elif command -v python3 >/dev/null 2>&1; then
  echo "使用 Python 启动服务端（端口 $PORT）..."
  python3 "$DIR/server.py" "$PORT"
else
  echo "未检测到 node 或 python3，请先安装其中之一。"
fi
