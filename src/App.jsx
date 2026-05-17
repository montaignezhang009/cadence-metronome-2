import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Minus, Volume2, Info, Check, HelpCircle, Music, Pause } from 'lucide-react';

// 采用兼容性更好、长度更长、音量极微弱的 2秒静音 WAV 数据
const SILENT_WAV = 'data:audio/wav;base64,UklGRpwAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAAGRhdGEAYAAAAP8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//H/8f/x//';

export default function App() {
  // --- 状态管理 ---
  const [bpm, setBpm] = useState(150);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundType, setSoundType] = useState('wood'); // wood (木鱼), electronic (电子音), drum (鼓点)
  const [accentMode, setAccentMode] = useState(true); // 强弱交替，模拟左右脚落地轻重平衡
  const [visualBeat, setVisualBeat] = useState(0); // 用于前端视觉闪烁同步
  const [showHelp, setShowHelp] = useState(false);
  const [vibrate, setVibrate] = useState(false); // 振动开关 (部分兼容手机)
  const [volumeBoost, setVolumeBoost] = useState(true); // 户外超强音量开关，默认开启！

  // --- 本地音乐播放状态 ---
  const [localFile, setLocalFile] = useState(null);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localVolume, setLocalVolume] = useState(0.6); // 默认60%音量，便于平衡节拍声
  const [localProgress, setLocalProgress] = useState(0);
  const [localDuration, setLocalDuration] = useState('00:00');
  const [localCurrentTime, setLocalCurrentTime] = useState('00:00');

  // --- 音频时钟核心 Ref 变量 ---
  const audioCtxRef = useRef(null);
  const timerIdRef = useRef(null);
  const nextTickTimeRef = useRef(0.0);
  const currentBeatRef = useRef(0);
  const silentAudioRef = useRef(null);
  const localAudioRef = useRef(null); // 本地音乐播放器 HTML5 Audio 指针

  // 保证高频定时器能实时拿到最新的 BPM 和设置，防止闭包失效
  const bpmRef = useRef(bpm);
  const soundTypeRef = useRef(soundType);
  const accentModeRef = useRef(accentMode);
  const isPlayingRef = useRef(isPlaying);
  const vibrateRef = useRef(vibrate);
  const volumeBoostRef = useRef(volumeBoost);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { soundTypeRef.current = soundType; }, [soundType]);
  useEffect(() => { accentModeRef.current = accentMode; }, [accentMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { vibrateRef.current = vibrate; }, [vibrate]);
  useEffect(() => { volumeBoostRef.current = volumeBoost; }, [volumeBoost]);

  // 时间格式化辅助函数 (秒 -> MM:SS)
  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- 初始化与注销清理 ---
  useEffect(() => {
    // 绑定本地音乐播放器的事件监听
    const audio = localAudioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setLocalProgress((audio.currentTime / audio.duration) * 100);
        setLocalCurrentTime(formatTime(audio.currentTime));
      }
    };

    const handleLoadedMetadata = () => {
      setLocalDuration(formatTime(audio.duration));
    };

    const handleEnded = () => {
      setLocalPlaying(false);
      setLocalProgress(0);
      setLocalCurrentTime('00:00');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      if (timerIdRef.current) clearTimeout(timerIdRef.current);
      if (silentAudioRef.current) {
        try {
          silentAudioRef.current.pause();
        } catch (e) {}
        silentAudioRef.current = null;
      }
      if (audio) {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('ended', handleEnded);
      }
    };
  }, []);

  // --- 处理本地音乐文件加载 ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLocalFile(file);
      const fileURL = URL.createObjectURL(file);
      if (localAudioRef.current) {
        localAudioRef.current.src = fileURL;
        localAudioRef.current.volume = localVolume;
        localAudioRef.current.load();
        setLocalPlaying(false);
        setLocalProgress(0);
        setLocalCurrentTime('00:00');
      }
    }
  };

  // --- 播放/暂停本地音乐 ---
  const toggleLocalMusic = () => {
    const audio = localAudioRef.current;
    if (!audio || !localFile) return;

    if (localPlaying) {
      audio.pause();
      setLocalPlaying(false);
    } else {
      // 激活音频上下文，确保跟 Web Audio 同步
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      audio.play().catch(err => {
        console.warn("播放本地音乐失败:", err);
      });
      setLocalPlaying(true);
    }
    triggerVibration();
  };

  // --- 调整本地音乐音量 ---
  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    setLocalVolume(vol);
    if (localAudioRef.current) {
      localAudioRef.current.volume = vol;
    }
  };

  // --- 本地音乐进度条拖动 ---
  const handleProgressChange = (e) => {
    const pct = parseFloat(e.target.value);
    const audio = localAudioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = (pct / 100) * audio.duration;
      setLocalProgress(pct);
    }
  };

  // --- 测速计算器 (Tap-to-Tempo) ---
  const lastTapsRef = useRef([]);
  const handleTapTempo = () => {
    const now = Date.now();
    const lastTaps = lastTapsRef.current.filter(t => now - t < 2500);
    lastTaps.push(now);
    lastTapsRef.current = lastTaps;

    if (lastTaps.length >= 2) {
      const deltas = [];
      for (let i = 1; i < lastTaps.length; i++) {
        deltas.push(lastTaps[i] - lastTaps[i - 1]);
      }
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const calculatedBpm = Math.round(60000 / avgDelta);
      if (calculatedBpm >= 40 && calculatedBpm <= 250) {
        setBpm(calculatedBpm);
      }
    }
  };

  // --- 系统锁屏 MediaSession 媒体控制项同步 ---
  const setupMediaSession = () => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `🏃‍♂️ 步频节拍器: ${bpmRef.current} BPM`,
        artist: localFile ? `伴跑音乐: ${localFile.name}` : '后台保活稳定运行中',
        album: '可与伴跑音乐/外部音频完美混音',
        artwork: [
          { src: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=512&h=512&fit=crop', sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlayingRef.current) startMetronome();
        if (localFile && !localPlaying) toggleLocalMusic();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlayingRef.current) stopMetronome();
        if (localPlaying) toggleLocalMusic();
      });
    }
  };

  const updateMediaSessionBpm = (currentBpm) => {
    if ('mediaSession' in navigator && isPlayingRef.current) {
      navigator.mediaSession.metadata.title = `🏃‍♂️ 步频节拍器: ${currentBpm} BPM`;
    }
  };

  // 步频调整
  const changeBpm = (amount) => {
    setBpm(prev => {
      const next = Math.max(40, Math.min(250, prev + amount));
      updateMediaSessionBpm(next);
      return next;
    });
  };

  // 振动反馈控制
  const triggerVibration = () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(12); // 短促轻微震动
    }
  };

  // --- 音频发声合成器 ---
  const scheduleTick = (time, beatNumber) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const type = soundTypeRef.current;
    const isAccent = accentModeRef.current && (beatNumber % 2 === 0);
    
    // 超强音量增益倍率 (2.2倍，故意制造轻微削波，使敲击声在耳机里极度清脆和穿透)
    const boost = volumeBoostRef.current ? 2.2 : 1.0;

    if (type === 'wood') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 950 : 700, time);
      osc.frequency.exponentialRampToValueAtTime(120, time + 0.05);

      gainNode.gain.setValueAtTime((isAccent ? 0.95 : 0.6) * boost, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

      osc.start(time);
      osc.stop(time + 0.06);
    } else if (type === 'drum') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isAccent ? 140 : 100, time);
      osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);

      gainNode.gain.setValueAtTime((isAccent ? 1.0 : 0.65) * boost, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc.start(time);
      osc.stop(time + 0.13);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 1900 : 1500, time);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isAccent ? 1900 : 1500;
      filter.Q.value = 2.0;

      osc.disconnect(gainNode);
      osc.connect(filter);
      filter.connect(gainNode);

      gainNode.gain.setValueAtTime((isAccent ? 0.6 : 0.35) * boost, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      osc.start(time);
      osc.stop(time + 0.05);
    }
  };

  // --- 高精准度后台调度器线程 ---
  const scheduleAheadTime = 0.12; 
  const lookahead = 30.0; 

  const metronomeScheduler = () => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isPlayingRef.current) return;

    while (nextTickTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      const scheduledTime = nextTickTimeRef.current;
      const beat = currentBeatRef.current;

      scheduleTick(scheduledTime, beat);

      const secondsPerBeat = 60.0 / bpmRef.current;
      nextTickTimeRef.current += secondsPerBeat;

      const delayMs = Math.max(0, (scheduledTime - ctx.currentTime) * 1000);
      setTimeout(() => {
        if (isPlayingRef.current) {
          setVisualBeat(prev => (prev + 1) % 2);
          if (vibrateRef.current) {
            triggerVibration();
          }
        }
      }, delayMs);

      currentBeatRef.current = (currentBeatRef.current + 1) % 2;
    }

    timerIdRef.current = setTimeout(metronomeScheduler, lookahead);
  };

  // --- 节拍器启动逻辑 ---
  const startMetronome = () => {
    try {
      // 1. 彻底销毁和重置任何历史音频上下文，避免挂起锁定
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {}
        audioCtxRef.current = null;
      }
      if (silentAudioRef.current) {
        try {
          silentAudioRef.current.pause();
        } catch (e) {}
        silentAudioRef.current = null;
      }

      // 2. 创建全新的混音音频环境
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;

      // 3. 必须在同步点击手势回调的第一时间，创建并播放 Audio 标签
      const audio = new Audio(SILENT_WAV);
      audio.loop = true;
      audio.volume = 0.05; // 微弱音量使系统保活器保持活跃
      silentAudioRef.current = audio;

      // 4. 【核心保活混音机制】：
      // 将 HTML5 的无声 Audio 节点重定向挂载到 Web Audio 图中！
      // 只要挂载了，iOS 系统就会将该媒体播放降级为“音效/Ambient”级别，从而绝不暂停伴跑音乐，实现完美混音！
      const source = ctx.createMediaElementSource(audio);
      source.connect(ctx.destination);

      // 5. 同步播放
      audio.play().catch(e => {
        console.warn("同步手势保活播放受阻，尝试恢复：", e);
      });

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      setupMediaSession();

      nextTickTimeRef.current = ctx.currentTime + 0.05;
      currentBeatRef.current = 0;

      setIsPlaying(true);
      isPlayingRef.current = true;
      metronomeScheduler();

      // 如果导入了音乐但未播放，在点START时可同步开启伴跑音乐，带来丝滑体验
      if (localFile && !localPlaying && localAudioRef.current) {
        localAudioRef.current.play().catch(() => {});
        setLocalPlaying(true);
      }

      triggerVibration();
    } catch (error) {
      console.error("启动节拍器失败:", error);
    }
  };

  // --- 节拍器暂停逻辑 ---
  const stopMetronome = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;

    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }

    // 释放保活静音音频
    if (silentAudioRef.current) {
      try {
        silentAudioRef.current.pause();
      } catch (e) {}
      silentAudioRef.current = null;
    }

    // 暂停时立刻释放 Web Audio 上下文，防止其状态在手机底层挂起锁死
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }

    // 暂停节拍器时，可选择同步暂停本地伴跑音乐
    if (localPlaying && localAudioRef.current) {
      localAudioRef.current.pause();
      setLocalPlaying(false);
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    
    triggerVibration();
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopMetronome();
    } else {
      startMetronome();
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between pt-safe pb-safe bg-zinc-950 px-6 font-sans">
      
      {/* 隐藏的 HTML5 本地音频播放器标签 */}
      <audio ref={localAudioRef} />

      {/* 顶部：简易标题与帮助指南 */}
      <header className="flex items-center justify-between pt-4">
        <div className="flex items-center space-x-2">
          <div className="h-3 w-3 rounded-full bg-lime-500 animate-pulse"></div>
          <span className="text-sm font-semibold tracking-wider text-zinc-400">CADENCE ACTIVE</span>
        </div>
        <button 
          onClick={() => setShowHelp(!showHelp)} 
          className="p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900 border border-zinc-800 transition"
        >
          <HelpCircle size={20} />
        </button>
      </header>

      {/* 帮助详情折叠卡片 */}
      {showHelp && (
        <div className="mt-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm leading-relaxed text-zinc-300">
          <h3 className="font-bold text-lime-400 mb-2 flex items-center">
            <Info size={16} className="mr-1" /> 后台完美共存指南
          </h3>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-400">
            <li><strong>外部播放：</strong>先开启 Apple Music 或网易云放歌，然后打开本页面，点击 <span className="text-lime-400">START</span> 即可混音！</li>
            <li><strong>完美伴跑本地音乐：</strong>如果你播放的是保存在手机中的 MP3 文件，请使用下方专有的“本地音乐伴跑”面板，直接导入播放。这样声音绝对不会冲突，且后台更稳定！</li>
            <li><strong>遇到无声：</strong>如果切出再切回时无声，直接点击 <span className="text-red-400">STOP</span> 再点 <span className="text-lime-400">START</span>，系统会自动重构音频引擎，无需重启网页。</li>
          </ul>
        </div>
      )}

      {/* 中部：BPM 主显示区 + 动态炫光圆盘 */}
      <main className="flex-1 flex flex-col justify-center items-center py-6">
        <div className="relative flex items-center justify-center w-56 h-56 mb-5">
          
          {/* 外圈光环 - 与节奏实时闪烁同步 */}
          <div className={`absolute inset-0 rounded-full border-4 transition-all duration-75 ${
            isPlaying 
              ? (visualBeat === 0 ? 'border-lime-500 scale-105 opacity-80 shadow-[0_0_30px_rgba(132,204,22,0.4)]' : 'border-lime-700 scale-100 opacity-45')
              : 'border-zinc-800 opacity-20'
          }`}></div>

          {/* 内圈大卡片 */}
          <div className="absolute inset-4 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col justify-center items-center shadow-inner">
            <span className="text-xs font-bold text-zinc-500 tracking-widest uppercase">CADENCE</span>
            <span className="text-6xl font-black text-white tracking-tighter my-0.5 tabular-nums">
              {bpm}
            </span>
            <span className="text-xs font-semibold text-lime-400 tracking-wider">BPM (步/分)</span>
          </div>
        </div>

        {/* 节奏类型微调器 (BPM Increments) */}
        <div className="w-full max-w-sm flex items-center justify-between space-x-3 mb-5">
          <button 
            onClick={() => changeBpm(-5)} 
            className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold transition active:scale-95"
          >
            -5
          </button>
          <button 
            onClick={() => changeBpm(-1)} 
            className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold transition active:scale-95"
          >
            <Minus size={20} className="mx-auto" />
          </button>
          
          {/* 手动脚踏测速按钮 (Tap Tempo) */}
          <button 
            onClick={handleTapTempo}
            className="flex-[1.5] py-3 bg-zinc-900 hover:bg-zinc-800 border border-lime-950 text-lime-400 rounded-xl font-bold text-xs tracking-wider transition active:scale-95 flex flex-col items-center justify-center"
          >
            <span>TAP TEMPO</span>
            <span className="text-[9px] text-zinc-500 mt-0.5">连续踩点测步频</span>
          </button>

          <button 
            onClick={() => changeBpm(1)} 
            className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold transition active:scale-95"
          >
            <Plus size={20} className="mx-auto" />
          </button>
          <button 
            onClick={() => changeBpm(5)} 
            className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold transition active:scale-95"
          >
            +5
          </button>
        </div>

        {/* 快速预设模式按钮 - 大块设计利于盲操作 */}
        <div className="w-full max-w-sm grid grid-cols-3 gap-3 mb-5">
          <button 
            onClick={() => { setBpm(120); updateMediaSessionBpm(120); }}
            className={`p-3 rounded-2xl flex flex-col items-center transition ${
              bpm === 120 ? 'bg-zinc-100 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span className="text-lg">🚶‍♂️</span>
            <span className="text-sm mt-0.5">120</span>
            <span className="text-[9px] opacity-70">慢步恢复</span>
          </button>
          <button 
            onClick={() => { setBpm(150); updateMediaSessionBpm(150); }}
            className={`p-3 rounded-2xl flex flex-col items-center transition ${
              bpm === 150 ? 'bg-zinc-100 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span className="text-lg">🏃‍♂️</span>
            <span className="text-sm mt-0.5">150</span>
            <span className="text-[9px] opacity-70">快速健走</span>
          </button>
          <button 
            onClick={() => { setBpm(180); updateMediaSessionBpm(180); }}
            className={`p-3 rounded-2xl flex flex-col items-center transition ${
              bpm === 180 ? 'bg-zinc-100 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span className="text-lg">🚀</span>
            <span className="text-sm mt-0.5">180</span>
            <span className="text-[9px] opacity-70">黄金慢跑</span>
          </button>
        </div>

        {/* 核心升级：本地伴跑音乐播放面板 */}
        <div className="w-full max-w-sm bg-gradient-to-b from-zinc-900 to-zinc-950 border border-lime-500/20 rounded-2xl p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-lime-400 flex items-center tracking-wide">
              <Music size={14} className="mr-1.5 animate-bounce" /> 本地音乐伴跑 (极速混音)
            </span>
            <label className="cursor-pointer text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium px-2.5 py-1.5 rounded-lg border border-zinc-700 transition active:scale-95">
              📂 导入本地音频
              <input 
                type="file" 
                accept="audio/*, .mp3, .m4a, .wav, .aac, .ogg, audio/mpeg, audio/mp4, audio/x-m4a, audio/x-wav" 
                onChange={handleFileChange} 
                className="hidden" 
              />
            </label>
          </div>

          {!localFile ? (
            <div className="text-center py-2 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40">
              <p className="text-[10px] text-zinc-500">
                可导入存储在手机“文件”中的 MP3，实现完美共存
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 文件信息及播放控制 */}
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-xs text-zinc-300 truncate font-medium">
                    {localFile.name}
                  </p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">
                    {localCurrentTime} / {localDuration}
                  </p>
                </div>
                <button
                  onClick={toggleLocalMusic}
                  className="p-2.5 bg-lime-500 hover:bg-lime-400 text-zinc-950 rounded-full transition active:scale-90 shadow-md shadow-lime-500/10"
                >
                  {localPlaying ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
                </button>
              </div>

              {/* 音乐播放进度条 */}
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localProgress}
                  onChange={handleProgressChange}
                  className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-lime-500"
                />
              </div>

              {/* 音乐独立音量控制：调低音乐音量，可以清晰听到木鱼节拍 */}
              <div className="flex items-center justify-between bg-zinc-950/80 p-2 rounded-xl border border-zinc-800/40">
                <span className="text-[10px] text-zinc-500 flex items-center">
                  <Volume2 size={12} className="mr-1" /> 伴跑歌量
                </span>
                <div className="flex items-center space-x-2 flex-1 max-w-[150px] ml-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={localVolume}
                    onChange={handleVolumeChange}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-lime-500"
                  />
                  <span className="text-[9px] text-lime-400 font-mono w-6 text-right">
                    {Math.round(localVolume * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 高级控制设置：音色、强弱、震动 */}
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
          
          {/* 户外超强音量开关（高分贝爆破音色） */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-lime-400 flex items-center">
                🔥 户外超强音量加倍
              </span>
              <span className="text-[10px] text-zinc-500">极速穿透背景音乐声</span>
            </div>
            <button
              onClick={() => setVolumeBoost(!volumeBoost)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                volumeBoost ? 'bg-lime-500' : 'bg-zinc-750'
              }`}
            >
              <div className="bg-zinc-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 translate-x-5"></div>
            </button>
          </div>

          {/* 音响音效切换 */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
            <span className="text-xs font-semibold text-zinc-400 flex items-center">
              <Volume2 size={14} className="mr-1.5" /> 节拍音色
            </span>
            <div className="flex space-x-1.5 bg-zinc-950 p-1 rounded-lg">
              <button 
                onClick={() => setSoundType('wood')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  soundType === 'wood' ? 'bg-lime-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                木鱼
              </button>
              <button 
                onClick={() => setSoundType('electronic')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  soundType === 'electronic' ? 'bg-lime-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                电子
              </button>
              <button 
                onClick={() => setSoundType('drum')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  soundType === 'drum' ? 'bg-lime-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                鼓点
              </button>
            </div>
          </div>

          {/* 强弱音设置 */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-400">强弱音平衡 (左右脚交替)</span>
              <span className="text-[10px] text-zinc-500">交替强音可检测左右脚步幅平衡</span>
            </div>
            <button
              onClick={() => setAccentMode(!accentMode)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                accentMode ? 'bg-lime-500' : 'bg-zinc-750'
              }`}
            >
              <div className={`bg-zinc-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                accentMode ? 'translate-x-5' : 'translate-x-0'
              }`}></div>
            </button>
          </div>

          {/* 震动开关 */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-400">手机触觉震动</span>
              <span className="text-[10px] text-zinc-500">跟随节奏轻震 (部分移动设备支持)</span>
            </div>
            <button
              onClick={() => {
                setVibrate(!vibrate);
                if(!vibrate) triggerVibration();
              }}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                vibrate ? 'bg-lime-500' : 'bg-zinc-750'
              }`}
            >
              <div className={`bg-zinc-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                vibrate ? 'translate-x-5' : 'translate-x-0'
              }`}></div>
            </button>
          </div>

        </div>
      </main>

      {/* 底部：占据约 1/3 高度的超大操作按钮 */}
      <footer className="w-full max-w-sm mx-auto pb-6">
        <button 
          onClick={togglePlayback}
          className={`w-full py-5 rounded-2xl font-black text-2xl tracking-widest uppercase transition-all duration-150 active:scale-95 flex items-center justify-center shadow-lg ${
            isPlaying 
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-900/20' 
              : 'bg-lime-500 hover:bg-lime-400 text-zinc-950 shadow-lime-900/20'
          }`}
        >
          {isPlaying ? (
            <>
              <Square size={24} className="mr-2 fill-current" />
              <span>STOP</span>
            </>
          ) : (
            <>
              <Play size={24} className="mr-2 fill-current" />
              <span>START</span>
            </>
          )}
        </button>
        <p className="text-center text-[10px] text-zinc-600 mt-3 tracking-wide">
          跑步、快走步频辅助器 • H5 后台完美存活版
        </p>
      </footer>

    </div>
  );
}
