/* audio.js — 音效：落子/吃子/胜负/非法/按钮为程序化合成；
 * 将军(check) 与 游戏结束(checkmate) 由玩家指定音频文件驱动。
 * 文件缺失或播放失败则回退到合成音。带全局静音开关。
 * 浏览器自动播放策略：首次用户交互后初始化并 resume。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var ctx = null;
  var master = null;
  var muted = false;

  // 文件音效：将军 / 游戏结束，由玩家指定音频文件驱动
  // —— 加载失败（如旧浏览器不支持或文件缺失）时回退到合成音，不影响其他音效
  var checkAudio = null;
  try {
    checkAudio = new Audio('assets/男人man1_爱给网_aigei_com.mp3');
    checkAudio.preload = 'auto';
  } catch (e) { checkAudio = null; }

  var checkmateAudio = null;
  try {
    checkmateAudio = new Audio('assets/曼巴熬.mp4');
    checkmateAudio.preload = 'auto';
  } catch (e) { checkmateAudio = null; }

  // 文件优先播放；失败/缺失则调用 fallback（合成音）
  function playFile(audio, fallback) {
    if (muted) return;
    if (audio && typeof audio.play === 'function') {
      try {
        audio.currentTime = 0;
        var p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function () { if (fallback) fallback(); });
        }
        return;
      } catch (e) { /* 落到合成音 */ }
    }
    if (fallback) fallback();
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  }

  // 基础音：振荡器 + 包络
  function tone(opt) {
    if (muted || !ensure()) return;
    var t0 = ctx.currentTime + (opt.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.freqEnd) osc.frequency.exponentialRampToValueAtTime(opt.freqEnd, t0 + opt.dur);
    var peak = opt.gain == null ? 0.3 : opt.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + opt.dur + 0.02);
  }

  // 噪声爆裂（用于吃子金属感 / 冲击）
  function noise(opt) {
    if (muted || !ensure()) return;
    var t0 = ctx.currentTime + (opt.delay || 0);
    var len = Math.floor(ctx.sampleRate * opt.dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = opt.freq || 1800; bp.Q.value = 0.8;
    var g = ctx.createGain(); g.gain.value = opt.gain == null ? 0.35 : opt.gain;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + opt.dur);
  }

  var SOUNDS = {
    move: function () {
      // 木石落子：短促主音 + 轻微接触噪声
      tone({ freq: 520, freqEnd: 90, dur: 0.07, type: 'square', gain: 0.24 });
      noise({ freq: 2200, dur: 0.035, gain: 0.07 });
    },
    capture: function () {
      // 吃子：低沉闷响 + 金属擦刮感 + 短促回弹
      noise({ freq: 900, dur: 0.16, gain: 0.42 });
      tone({ freq: 190, freqEnd: 60, dur: 0.14, type: 'sawtooth', gain: 0.28 });
      tone({ freq: 300, freqEnd: 110, dur: 0.11, type: 'square', gain: 0.16, delay: 0.05 });
    },
    // 将军（check）：文件音效 assets/男人man1_爱给网_aigei_com.mp3；加载失败回退合成警报音
    '将军': function () {
      playFile(checkAudio, function () {
        tone({ freq: 660, freqEnd: 880, dur: 0.09, type: 'square', gain: 0.22 });
        tone({ freq: 880, freqEnd: 1175, dur: 0.11, type: 'square', gain: 0.24, delay: 0.09 });
        noise({ freq: 3500, dur: 0.025, gain: 0.06 });
      });
    },
    check: function () { SOUNDS['将军'](); },
    // 游戏结束/绝杀（checkmate）：文件音效 assets/曼巴熬.mp4；加载失败回退合成终结音
    '绝杀': function () {
      playFile(checkmateAudio, function () {
        tone({ freq: 1200, freqEnd: 200, dur: 0.22, type: 'sawtooth', gain: 0.30 });
        noise({ freq: 1500, dur: 0.18, gain: 0.32 });
        tone({ freq: 130, freqEnd: 70, dur: 0.20, type: 'sine', gain: 0.30, delay: 0.04 });
        tone({ freq: 523, dur: 0.26, type: 'triangle', gain: 0.20, delay: 0.10 });
      });
    },
    checkmate: function () { SOUNDS['绝杀'](); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.3, delay: i * 0.12 });
      });
    },
    lose: function () {
      [440, 349, 262].forEach(function (f, i) {
        tone({ freq: f, dur: 0.28, type: 'sine', gain: 0.3, delay: i * 0.16 });
      });
    },
    illegal: function () { tone({ freq: 140, dur: 0.14, type: 'square', gain: 0.22 }); },
    click: function () { tone({ freq: 600, dur: 0.05, type: 'sine', gain: 0.18 }); }
  };

  XQ.Audio = {
    // 首次交互时调用，解锁音频
    unlock: function () {
      ensure();
    },
    play: function (name) { if (SOUNDS[name]) SOUNDS[name](); },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    toggle: function () { muted = !muted; return muted; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
