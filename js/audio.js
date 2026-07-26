/* audio.js — Web Audio 程序化合成音效（零音频资源文件）
 * 落子/吃子/将军/胜负/非法/按钮，带全局静音开关。
 * 浏览器自动播放策略：首次用户交互后初始化并 resume。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var ctx = null;
  var master = null;
  var muted = false;

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

  // 噪声爆裂（用于吃子金属感）
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
    check: function () {
      tone({ freq: 880, dur: 0.12, type: 'sawtooth', gain: 0.25 });
      tone({ freq: 1175, dur: 0.14, type: 'sawtooth', gain: 0.25, delay: 0.12 });
    },
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
    unlock: function () { ensure(); },
    play: function (name) { if (SOUNDS[name]) SOUNDS[name](); },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    toggle: function () { muted = !muted; return muted; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
