/* audio.js — 音效：落子/吃子/胜负/非法/按钮为程序化合成；将军使用音频文件
 * 带全局静音开关。
 * 浏览器自动播放策略：首次用户交互后初始化并 resume。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var ctx = null;
  var master = null;
  var muted = false;
  // 统一音效文件：将军 / 绝杀 均使用 assets/曼巴熬.mp4（玩家指定统一用此一份）
  var cueAudio = null;
  try {
    cueAudio = new Audio('assets/曼巴熬.mp4');
    cueAudio.preload = 'auto';
  } catch (e) { cueAudio = null; }

  var checkAudio = cueAudio;       // 将军提示音
  var checkmateAudio = cueAudio;   // 绝杀结算音

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
      // 将军提示音：优先播放统一音效文件 曼巴熬.mp4，其余音效保持合成
      if (muted) return;
      if (checkAudio) {
        try {
          checkAudio.currentTime = 0;
          var pr = checkAudio.play();
          if (pr && pr.catch) pr.catch(function () {});
          return;
        } catch (e) { /* 音频播放失败则回退到合成音 */ }
      }
      // 回退：音频不可用时仍用合成音，保证有将军提示
      tone({ freq: 880, dur: 0.12, type: 'sawtooth', gain: 0.25 });
      tone({ freq: 1175, dur: 0.14, type: 'sawtooth', gain: 0.25, delay: 0.12 });
    },
    checkmate: function () {
      // 绝杀结算音频：优先播放统一音效文件 曼巴熬.mp4；文件缺失/播放失败时回退到胜利合成音
      if (muted) return;
      if (checkmateAudio) {
        try {
          checkmateAudio.currentTime = 0;
          var pr = checkmateAudio.play();
          if (pr && pr.catch) pr.catch(function () {});
          return;
        } catch (e) { /* 回退到合成音 */ }
      }
      SOUNDS.win();
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
    unlock: function () {
      ensure();
      if (checkAudio) { try { checkAudio.load(); } catch (e) {} }
      if (checkmateAudio) { try { checkmateAudio.load(); } catch (e) {} }
    },
    play: function (name) { if (SOUNDS[name]) SOUNDS[name](); },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    toggle: function () { muted = !muted; return muted; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
