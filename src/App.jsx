import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Minus, Volume2, Info, Check, HelpCircle } from 'lucide-react';

export default function App() {
  // --- 状态管理 ---
  const [bpm, setBpm] = useState(150);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundType, setSoundType] = useState('wood'); // wood (木鱼), electronic (电子音), drum (鼓点)
  const [accentMode, setAccentMode] = useState(true); // 强弱交替，模拟左右脚落地轻重平衡
  const [visualBeat, setVisualBeat] = useState(0); // 用于前端视觉闪烁同步
  const [showHelp, setShowHelp] = useState(false);
  const [vibrate, setVibrate] = useState(false); // 振动开关 (部分兼容手机)

  // --- 音频时钟核心 Ref 变量 ---
  const audioCtxRef = useRef(null);
  const timerIdRef = useRef(null);
  const nextTickTimeRef = useRef(0.0);
  const currentBeatRef = useRef(0);
  const silentAudioRef = useRef(null);

  // 保证高频定时器能实时拿到最新的 BPM 和设置，防止闭包失效
  const bpmRef = useRef(bpm);
  const soundTypeRef = useRef(soundType);
  const accentModeRef = useRef(accentMode);
  const isPlayingRef = useRef(isPlaying);
  const vibrateRef = useRef(vibrate);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { soundTypeRef.current = soundType; }, [soundType]);
  useEffect(() => { accentModeRef.current = accentMode; }, [accentMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { vibrateRef.current = vibrate; }, [vibrate]);

  // --- 初始化后台保活无声轨道 ---
  useEffect(() => {
    // 1秒极小无声 WAV 音频 Base64 数据，iOS 触发保活必需
    const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAGRhdGEAAAAA';
    const audio = new Audio(SILENT_WAV);
    audio.loop = true;
    silentAudioRef.current = audio;

    return () => {
      if (audio) {
        audio.pause();
      }
      if (timerIdRef.current) clearTimeout(timerIdRef.current);
    };
  }, []);

  // --- 测速计算器 (Tap-to-Tempo) ---
  const lastTapsRef = useRef([]);
  const handleTapTempo = () => {
    const now = Date.now();
    // 过滤掉超过2.5秒的点击
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
        artist: '后台保活稳定运行中',
        album: '可与 Apple Music 完美混音',
        artwork: [
          { src: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=512&h=512&fit=crop', sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      // 绑定物理耳机线控或锁屏面板上的暂停/播放按钮
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlayingRef.current) startMetronome();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlayingRef.current) stopMetronome();
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

    if (type === 'wood') {
      // 传统木鱼清脆敲击声
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 850 : 650, time);
      osc.frequency.exponentialRampToValueAtTime(120, time + 0.05);

      gainNode.gain.setValueAtTime(isAccent ? 0.95 : 0.6, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

      osc.start(time);
      osc.stop(time + 0.06);
    } else if (type === 'drum') {
      // 动感鼓点，适合配合重低音曲目
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isAccent ? 120 : 85, time);
      osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);

      gainNode.gain.setValueAtTime(isAccent ? 1.0 : 0.65, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc.start(time);
      osc.stop(time + 0.13);
    } else {
      // 穿透力极强的电子音，适合户外嘈杂街道
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isAccent ? 1800 : 1400, time);

      // 加一个简单的带通滤波器降低毛刺感，保留穿透力
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isAccent ? 1800 : 1400;
      filter.Q.value = 2.0;

      osc.disconnect(gainNode);
      osc.connect(filter);
      filter.connect(gainNode);

      gainNode.gain.setValueAtTime(isAccent ? 0.3 : 0.18, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      osc.start(time);
      osc.stop(time + 0.05);
    }
  };

  // --- 高精准度后台调度器线程 ---
  const scheduleAheadTime = 0.12; // 预载窗口长度 (秒)
  const lookahead = 30.0; // 调度轮询检查间隔 (毫秒)

  const metronomeScheduler = () => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isPlayingRef.current) return;

    while (nextTickTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      const scheduledTime = nextTickTimeRef.current;
      const beat = currentBeatRef.current;

      // 在精准的时间打点发声
      scheduleTick(scheduledTime, beat);

      // 计算并更新下一个节拍的触发时间
      const secondsPerBeat = 60.0 / bpmRef.current;
      nextTickTimeRef.current += secondsPerBeat;

      // 同步触发 React 前端视觉闪烁和轻震，利用精确的推迟 setTimeout
      const delayMs = Math.max(0, (scheduledTime - ctx.currentTime) * 1000);
      setTimeout(() => {
        if (isPlayingRef.current) {
          setVisualBeat(prev => (prev + 1) % 2);
          if (vibrateRef.current) {
            triggerVibration();
          }
        }
      }, delayMs);

      // 切换强弱节拍索引
      currentBeatRef.current = (currentBeatRef.current + 1) % 2;
    }

    // 尾递归轮询
    timerIdRef.current = setTimeout(metronomeScheduler, lookahead);
  };

  // --- 节拍器启动逻辑 ---
  const startMetronome = async () => {
    try {
      // 1. 启动或恢复 Web Audio Context (iOS 必须在点击等手势内部触发)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 2. 唤醒并播放后台保活静音音轨 (骗过 iOS 后台挂起机制)
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(e => console.log("静音轨道保活被阻止：", e));
      }

      // 3. 配置锁屏媒体控制器
      setupMediaSession();

      // 4. 重置时钟参数
      nextTickTimeRef.current = ctx.currentTime + 0.05;
      currentBeatRef.current = 0;

      // 5. 切换运行状态，启动调度器
      setIsPlaying(true);
      isPlayingRef.current = true;
      metronomeScheduler();

      // 给一个轻微物理反馈，暗示成功开启
      triggerVibration();
    } catch (error) {
      console.error("启动节拍器失败:", error);
    }
  };

  // --- 节拍器暂停逻辑 ---
  const stopMetronome = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;

    // 清除定时轮询
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }

    // 暂停后台静音音轨
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }

    // 释放锁屏暂停控制状态
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
            <li><strong>如何混音：</strong>先开启 Apple Music 或网易云放歌，然后打开本页面，点击 <span className="text-lime-400">START</span> 即可同时听到音乐和节拍！</li>
            <li><strong>后台不挂断：</strong>开始播放后，直接切回桌面、手机锁屏或者去其他 App，节拍器都会在后台持续响。</li>
            <li><strong>锁屏控制：</strong>支持耳机线控暂停/播放，以及锁屏界面的媒体面板控制。</li>
            <li>如果锁屏播放时音乐变小，请稍微调大手机系统音量。</li>
          </ul>
        </div>
      )}

      {/* 中部：BPM 主显示区 + 动态炫光圆盘 */}
      <main className="flex-1 flex flex-col justify-center items-center py-8">
        <div className="relative flex items-center justify-center w-64 h-64 mb-6">
          
          {/* 外圈光环 - 与节奏实时闪烁同步 */}
          <div className={`absolute inset-0 rounded-full border-4 transition-all duration-75 ${
            isPlaying 
              ? (visualBeat === 0 ? 'border-lime-500 scale-105 opacity-80 shadow-[0_0_30px_rgba(132,204,22,0.4)]' : 'border-lime-700 scale-100 opacity-45')
              : 'border-zinc-800 opacity-20'
          }`}></div>

          {/* 内圈大卡片 */}
          <div className="absolute inset-4 rounded-full bg-zinc-900 border border-zinc-800 flex flex-col justify-center items-center shadow-inner">
            <span className="text-xs font-bold text-zinc-500 tracking-widest uppercase">CADENCE</span>
            <span className="text-7xl font-black text-white tracking-tighter my-1 tabular-nums">
              {bpm}
            </span>
            <span className="text-sm font-semibold text-lime-400 tracking-wider">BPM (步/分)</span>
          </div>
        </div>

        {/* 节奏类型微调器 (BPM Increments) */}
        <div className="w-full max-w-sm flex items-center justify-between space-x-3 mb-6">
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
        <div className="w-full max-w-sm grid grid-cols-3 gap-3 mb-8">
          <button 
            onClick={() => { setBpm(120); updateMediaSessionBpm(120); }}
            className={`p-4 rounded-2xl flex flex-col items-center transition ${
              bpm === 120 ? 'bg-zinc-100 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span className="text-xl">🚶‍♂️</span>
            <span className="text-sm mt-1">120</span>
            <span className="text-[10px] opacity-70">慢步恢复</span>
          </button>
          <button 
            onClick={() => { setBpm(150); updateMediaSessionBpm(150); }}
            className={`p-4 rounded-2xl flex flex-col items-center transition ${
              bpm === 150 ? 'bg-zinc-100 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span className="text-xl">🏃‍♂️</span>
            <span className="text-sm mt-1">150</span>
            <span className="text-[10px] opacity-70">快速健走</span>
          </button>
          <button 
            onClick={() => { setBpm(180); updateMediaSessionBpm(180); }}
            className={`p-4 rounded-2xl flex flex-col items-center transition ${
              bpm === 180 ? 'bg-zinc-100 text-zinc-950 font-bold' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
            }`}
          >
            <span className="text-xl">🚀</span>
            <span className="text-sm mt-1">180</span>
            <span className="text-[10px] opacity-70">黄金慢跑</span>
          </button>
        </div>

        {/* 高级控制设置：音色、强弱、震动 */}
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
          
          {/* 音响音效切换 */}
          <div className="flex items-center justify-between">
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
          <div className="flex items-center justify-between pt-1">
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
      <footer className="w-full max-w-sm mx-auto pb-8">
        <button 
          onClick={togglePlayback}
          className={`w-full py-6 rounded-2xl font-black text-2xl tracking-widest uppercase transition-all duration-150 active:scale-95 flex items-center justify-center shadow-lg ${
            isPlaying 
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-900/20' 
              : 'bg-lime-500 hover:bg-lime-400 text-zinc-950 shadow-lime-900/20'
          }`}
        >
          {isPlaying ? (
            <>
              <Square size={26} className="mr-2 fill-current" />
              <span>STOP</span>
            </>
          ) : (
            <>
              <Play size={26} className="mr-2 fill-current" />
              <span>START</span>
            </>
          )}
        </button>
        <p className="text-center text-[10px] text-zinc-600 mt-4 tracking-wide">
          跑步、快走步频辅助器 • H5 后台完美存活版
        </p>
      </footer>

    </div>
  );
}
