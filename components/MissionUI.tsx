import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MissionType, MissionConfig } from '../types';
import { Footprints, Dumbbell, Brain, Zap, AlertCircle, Volume2, Moon, Lock, Grid, Radio, MousePointer2, Camera, UserCheck, Flame, ChevronDown, Sparkles, BellRing, Play } from 'lucide-react';
import { getWakeUpCallAudio, verifySmile, verifyPushupPosition } from '../services/geminiService';

interface MissionUIProps {
  missions: MissionConfig[];
  currentMissionIndex: number;
  onMissionComplete: () => void;
  onSnooze: () => void;
  isHardcore: boolean;
  soundUrl: string;
  gradualVolumeDuration: number;
}

const MORSE_DICTIONARY: Record<string, string> = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....',
  'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.',
  'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..'
};

// PCM Decoding Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const MissionUI: React.FC<MissionUIProps> = ({ 
  missions,
  currentMissionIndex,
  onMissionComplete, 
  onSnooze, 
  isHardcore, 
  soundUrl,
  gradualVolumeDuration 
}) => {
  const mission = missions[currentMissionIndex];
  const type = mission.type;
  const target = mission.type === MissionType.MEMORY ? mission.count * 2 : mission.count;

  const [current, setCurrent] = useState(0);
  const [mathProblem, setMathProblem] = useState({ q: '', a: 0 });
  const [mathInput, setMathInput] = useState('');
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [snoozeHoldProgress, setSnoozeHoldProgress] = useState(0);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pushupState, setPushupState] = useState<'UP' | 'DOWN'>('UP');
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Memory Game State
  const [memoryTiles, setMemoryTiles] = useState<{id: number, val: string, flipped: boolean, matched: boolean}[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<number[]>([]);

  // Morse Code State
  const [morseTarget, setMorseTarget] = useState({ char: '', pattern: '' });
  const [morseInput, setMorseInput] = useState('');
  const [morseDownTime, setMorseDownTime] = useState<number | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sirenRef = useRef<HTMLAudioElement | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const snoozeHoldRef = useRef<number | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const sensorTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const verificationIntervalRef = useRef<number | null>(null);

  const playTTS = async (base64: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      
      const bytes = decode(base64);
      const audioBuffer = await decodeAudioData(bytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.error("Failed to play AI voice", e);
    }
  };

  const startAlarmAudio = useCallback(() => {
    if (sirenRef.current) {
      sirenRef.current.play().then(() => {
        setIsAudioBlocked(false);
      }).catch(e => {
        console.log("Audio play blocked", e);
        setIsAudioBlocked(true);
      });
    }
    setHasInteracted(true);
  }, []);

  useEffect(() => {
    const siren = new Audio(soundUrl);
    siren.loop = true;
    
    if (gradualVolumeDuration > 0) {
      siren.volume = 0;
      const intervalMs = 100;
      const totalSteps = (gradualVolumeDuration * 1000) / intervalMs;
      const volumeStep = 1 / totalSteps;
      
      volumeIntervalRef.current = window.setInterval(() => {
        if (siren.volume < 1) {
          siren.volume = Math.min(1, siren.volume + volumeStep);
        } else {
          if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
        }
      }, intervalMs);
    } else {
      siren.volume = 0.8;
    }

    sirenRef.current = siren;
    
    // Attempt autoplay
    siren.play().catch(e => {
      console.log("Initial autoplay blocked", e);
      setIsAudioBlocked(true);
    });

    const playViralMotivation = async () => {
      const audioData = await getWakeUpCallAudio();
      if (audioData) playTTS(audioData);
    };
    const timer = setTimeout(playViralMotivation, 2000);

    return () => {
      siren.pause();
      clearTimeout(timer);
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [soundUrl, gradualVolumeDuration]);

  const handleVisionVerification = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isVerifying) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    setIsVerifying(true);
    
    if (type === MissionType.SMILE) {
      const result = await verifySmile(base64Image);
      if (result) {
        setCurrent(prev => {
          const next = prev + 1;
          if (next >= target) onMissionComplete();
          return next;
        });
      }
    } else if (type === MissionType.PUSHUPS) {
      const isDown = await verifyPushupPosition(base64Image);
      if (isDown && pushupState === 'UP') {
        setPushupState('DOWN');
        setCurrent(prev => {
          const next = prev + 1;
          if (next >= target) onMissionComplete();
          return next;
        });
        setTimeout(() => setPushupState('UP'), 1500);
      }
    }
    setIsVerifying(false);
  }, [isVerifying, target, onMissionComplete, type, pushupState]);

  useEffect(() => {
    setCurrent(0);
    setShowManualFallback(false);
    
    if ([MissionType.STEPS, MissionType.SQUATS, MissionType.SHAKE, MissionType.SMILE, MissionType.PUSHUPS].includes(type)) {
      if (sensorTimerRef.current) clearTimeout(sensorTimerRef.current);
      sensorTimerRef.current = window.setTimeout(() => {
        setShowManualFallback(true);
      }, 7000); 
    }

    if (type === MissionType.SMILE || type === MissionType.PUSHUPS) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
          if (verificationIntervalRef.current) clearInterval(verificationIntervalRef.current);
          const interval = type === MissionType.PUSHUPS ? 2000 : 3000;
          verificationIntervalRef.current = window.setInterval(handleVisionVerification, interval);
        })
        .catch(err => {
          console.error("Camera error:", err);
          setCameraError("Camera access denied.");
          setShowManualFallback(true);
        });
    }

    return () => {
      if (verificationIntervalRef.current) clearInterval(verificationIntervalRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [type, handleVisionVerification]);

  const initMemory = useCallback(() => {
    const symbols = ['🔥', '⚡', '🧠', '💪', '🚀', '⭐', '🍀', '💎', '🌈', '🌙'];
    const chosen = symbols.slice(0, target / 2);
    const deck = [...chosen, ...chosen]
      .sort(() => Math.random() - 0.5)
      .map((val, id) => ({ id, val, flipped: false, matched: false }));
    setMemoryTiles(deck);
  }, [target]);

  const initMorse = useCallback(() => {
    const chars = Object.keys(MORSE_DICTIONARY);
    const char = chars[Math.floor(Math.random() * chars.length)];
    setMorseTarget({ char, pattern: MORSE_DICTIONARY[char] });
    setMorseInput('');
  }, []);

  const generateMath = useCallback(() => {
    const num1 = Math.floor(Math.random() * 30) + 10;
    const num2 = Math.floor(Math.random() * 30) + 10;
    const op = Math.random() > 0.5 ? '+' : '-';
    const ans = op === '+' ? num1 + num2 : num1 - num2;
    setMathProblem({ q: `${num1} ${op} ${num2}`, a: ans });
    setMathInput('');
  }, []);

  useEffect(() => {
    if (type === MissionType.MATH) generateMath();
    if (type === MissionType.MEMORY) initMemory();
    if (type === MissionType.MORSE) initMorse();
  }, [type, generateMath, initMemory, initMorse]);

  const handleMorseTapStart = () => setMorseDownTime(Date.now());
  const handleMorseTapEnd = () => {
    if (morseDownTime === null) return;
    const duration = Date.now() - morseDownTime;
    const char = duration > 300 ? '-' : '.';
    const newInput = morseInput + char;
    setMorseInput(newInput);
    setMorseDownTime(null);
    if (newInput === morseTarget.pattern) {
      const next = current + 1;
      setCurrent(next);
      if (next >= target) onMissionComplete();
      else setTimeout(initMorse, 500);
    } else if (!morseTarget.pattern.startsWith(newInput)) {
      setMorseInput('');
    }
  };

  const handleTileClick = (id: number) => {
    if (selectedTiles.length === 2 || memoryTiles[id].flipped || memoryTiles[id].matched) return;
    const newTiles = [...memoryTiles];
    newTiles[id].flipped = true;
    setMemoryTiles(newTiles);
    const nextSelected = [...selectedTiles, id];
    setSelectedTiles(nextSelected);

    if (nextSelected.length === 2) {
      const [first, second] = nextSelected;
      if (newTiles[first].val === newTiles[second].val) {
        newTiles[first].matched = true;
        newTiles[second].matched = true;
        setMemoryTiles(newTiles);
        setSelectedTiles([]);
        const matchCount = newTiles.filter(t => t.matched).length;
        setCurrent(matchCount);
        if (matchCount >= target) {
          setTimeout(onMissionComplete, 500);
        }
      } else {
        setTimeout(() => {
          newTiles[first].flipped = false;
          newTiles[second].flipped = false;
          setMemoryTiles(newTiles);
          setSelectedTiles([]);
        }, 800);
      }
    }
  };

  const handleMathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(mathInput) === mathProblem.a) {
      const next = current + 1;
      setCurrent(next);
      if (next >= target) onMissionComplete();
      else generateMath();
    } else {
      setMathInput('');
    }
  };

  const incrementCurrent = useCallback(() => {
    setCurrent(prev => {
      const next = prev + 1;
      if (next >= target) {
        setTimeout(onMissionComplete, 300);
      }
      return next;
    });
    setShowManualFallback(false);
  }, [target, onMissionComplete]);

  useEffect(() => {
    if ([MissionType.MATH, MissionType.MEMORY, MissionType.MORSE, MissionType.SMILE, MissionType.PUSHUPS].includes(type)) return;
    let threshold = 12;
    let debounceTime = 200;
    if (type === MissionType.SQUATS) { threshold = 18; debounceTime = 800; }
    if (type === MissionType.SHAKE) { threshold = 25; debounceTime = 120; }
    if (type === MissionType.STEPS) { threshold = 14; debounceTime = 400; }

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.acceleration || event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      const magnitude = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
      setShakeIntensity(prev => Math.max(magnitude, prev * 0.9)); 
      
      const now = Date.now();
      if (magnitude > threshold && (now - lastUpdateRef.current) > debounceTime) {
        lastUpdateRef.current = now;
        incrementCurrent();
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [type, incrementCurrent]);

  const startSnoozeHold = () => {
    if (isHardcore) return;
    const startTime = Date.now();
    snoozeHoldRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / 2000) * 100, 100);
      setSnoozeHoldProgress(progress);
      if (progress === 100) {
        stopSnoozeHold();
        onSnooze();
      }
    }, 50);
  };

  const stopSnoozeHold = () => {
    if (snoozeHoldRef.current) {
      clearInterval(snoozeHoldRef.current);
      snoozeHoldRef.current = null;
    }
    setSnoozeHoldProgress(0);
  };

  const progress = Math.min((current / target) * 100, 100);

  // Autoplay fallback UI
  if (isAudioBlocked || !hasInteracted) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="absolute inset-0 bg-rose-600/20 animate-pulse pointer-events-none"></div>
        <div className="relative mb-12">
          <div className="w-32 h-32 rounded-full border-4 border-rose-500 flex items-center justify-center animate-bounce shadow-[0_0_50px_rgba(244,63,94,0.4)]">
             <BellRing className="w-16 h-16 text-rose-500" />
          </div>
        </div>
        <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">WAKE UP HERO!</h2>
        <p className="text-slate-400 mb-12 font-bold uppercase tracking-widest text-sm leading-relaxed max-w-xs">
          Your mission awaits. Tap to begin the awakening process.
        </p>
        <button 
          onClick={startAlarmAudio}
          className="w-full max-w-xs py-6 bg-rose-600 hover:bg-rose-500 text-white rounded-3xl font-black text-xl shadow-[0_10px_40px_-10px_rgba(244,63,94,0.6)] transition-all active:scale-95 flex items-center justify-center gap-4"
        >
          <Play className="w-6 h-6 fill-current" />
          START MISSIONS
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 text-center overflow-hidden">
      <div className="absolute inset-0 bg-rose-600/10 animate-pulse pointer-events-none"></div>

      {isHardcore && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-rose-500/20 text-rose-400 px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-[0_0_20px_rgba(244,63,94,0.3)] border border-rose-500/30">
          <Lock className="w-3 h-3" /> Mission Locked
        </div>
      )}

      <div className="absolute top-0 inset-x-0 h-2 bg-slate-800 flex">
        {missions.map((_, i) => (
           <div key={i} className="flex-1 h-full border-r border-slate-950 relative last:border-r-0">
              <div 
                className={`h-full transition-all duration-300 ${i < currentMissionIndex ? 'bg-indigo-500' : i === currentMissionIndex ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]' : 'bg-transparent'}`}
                style={{ width: i === currentMissionIndex ? `${progress}%` : i < currentMissionIndex ? '100%' : '0%' }}
              />
           </div>
        ))}
      </div>

      <div className="mt-12 flex items-center gap-2 bg-slate-900/80 px-4 py-1.5 rounded-2xl border border-slate-800 shadow-xl">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">Mission {currentMissionIndex + 1} of {missions.length}</span>
      </div>

      <div className="mb-8 relative mt-6">
        <div className="w-24 h-24 rounded-full border-4 border-rose-500/30 flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(244,63,94,0.1)]">
           {type === MissionType.MATH && <Brain className="w-12 h-12 text-indigo-400" />}
           {type === MissionType.STEPS && <Footprints className="w-12 h-12 text-emerald-400" />}
           {type === MissionType.SQUATS && <Dumbbell className="w-12 h-12 text-orange-400" />}
           {type === MissionType.SHAKE && <Zap className="w-12 h-12 text-yellow-400" />}
           {type === MissionType.MEMORY && <Grid className="w-12 h-12 text-purple-400" />}
           {type === MissionType.MORSE && <Radio className="w-12 h-12 text-cyan-400" />}
           {type === MissionType.SMILE && <Camera className="w-12 h-12 text-rose-400" />}
           {type === MissionType.PUSHUPS && <Flame className="w-12 h-12 text-orange-500" />}
        </div>
      </div>

      <h2 className="text-3xl font-black mb-1 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-orange-400">
        {type.replace(/_/g, ' ')}
      </h2>
      
      <p className="text-slate-400 mb-6 font-bold uppercase text-xs tracking-widest">
        {type === MissionType.PUSHUPS ? 'PLACE PHONE ON FLOOR & GO LOW' :
         type === MissionType.SMILE ? 'SHOW US YOUR BRIGHTEST SMILE' :
         type === MissionType.MEMORY ? 'MATCH ALL PAIRS' : 
         type === MissionType.MORSE ? `SIGNAL: ${morseTarget.char} (${morseTarget.pattern})` :
         `${current}/${target} PROGRESS`}
      </p>

      {(type === MissionType.SMILE || type === MissionType.PUSHUPS) && (
        <div className="relative w-full max-w-sm aspect-video mb-8 rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black">
          <video ref={videoRef} className="w-full h-full object-cover mirror transform scale-x-[-1]" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          {type === MissionType.PUSHUPS && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-1/2 mt-auto bg-orange-500/10 border-t-2 border-orange-500/30 flex items-center justify-center">
                 <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest">Target Zone</span>
              </div>
            </div>
          )}
          {isVerifying && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
               <UserCheck className="w-12 h-12 text-white animate-bounce" />
               <span className="text-white font-black text-xs tracking-widest uppercase">Verifying...</span>
            </div>
          )}
        </div>
      )}

      {type === MissionType.MEMORY && (
        <div className="grid grid-cols-4 gap-2 w-full max-w-[300px] mb-8">
          {memoryTiles.map(tile => (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile.id)}
              className={`aspect-square rounded-xl flex items-center justify-center text-xl transition-all duration-300 transform ${tile.flipped || tile.matched ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-slate-900 border-slate-800' } border-2`}
            >
              {(tile.flipped || tile.matched) ? tile.val : '?'}
            </button>
          ))}
        </div>
      )}

      {type === MissionType.MORSE && (
        <div className="flex flex-col items-center gap-8 mb-8">
          <div className="flex gap-2 text-4xl font-mono text-cyan-400 tracking-widest bg-slate-900 px-6 py-4 rounded-3xl border-2 border-slate-800 shadow-xl">
            {morseTarget.pattern.split('').map((c, i) => (
              <span key={i} className={i < morseInput.length ? 'text-cyan-400' : 'text-slate-700'}>{c}</span>
            ))}
          </div>
          <button
            onMouseDown={handleMorseTapStart}
            onMouseUp={handleMorseTapEnd}
            onTouchStart={handleMorseTapStart}
            onTouchEnd={handleMorseTapEnd}
            className={`w-32 h-32 rounded-full border-8 transition-all ${morseDownTime ? 'bg-cyan-500 border-cyan-400 scale-95 shadow-[0_0_40px_rgba(34,211,238,0.4)]' : 'bg-slate-900 border-slate-800 scale-100 shadow-2xl'} flex items-center justify-center active:scale-90`}
          >
            <div className={`w-8 h-8 rounded-full ${morseDownTime ? 'bg-white' : 'bg-cyan-900'} transition-colors`} />
          </button>
        </div>
      )}

      {type === MissionType.MATH && (
        <form onSubmit={handleMathSubmit} className="w-full max-w-sm mb-8">
          <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
            <div className="text-4xl font-mono mb-6 tracking-tighter text-rose-400">{mathProblem.q} = ?</div>
            <input 
              type="number"
              value={mathInput}
              onChange={(e) => setMathInput(e.target.value)}
              autoFocus
              className="w-full bg-slate-800 border-2 border-rose-500/50 rounded-2xl p-4 text-center text-3xl font-bold focus:outline-none focus:border-rose-500 transition-all text-white"
            />
          </div>
        </form>
      )}

      {![MissionType.MATH, MissionType.MEMORY, MissionType.MORSE, MissionType.SMILE, MissionType.PUSHUPS].includes(type) && (
        <div className="flex flex-col items-center mb-12">
          <div className="text-8xl font-black text-white tabular-nums tracking-tighter">
            {current}<span className="text-3xl text-slate-700 ml-2">/{target}</span>
          </div>
        </div>
      )}

      {showManualFallback && (
        <button 
          onClick={incrementCurrent}
          className="mb-8 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl border border-slate-700 text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-2 shadow-xl"
        >
          <MousePointer2 className="w-3 h-3" />
          Mission help? Tap here
        </button>
      )}

      <div className="flex flex-col items-center gap-4 w-full max-w-xs mt-auto">
        {!isHardcore && (
          <button 
            onMouseDown={startSnoozeHold}
            onMouseUp={stopSnoozeHold}
            onMouseLeave={stopSnoozeHold}
            onTouchStart={startSnoozeHold}
            onTouchEnd={stopSnoozeHold}
            className="group relative w-full py-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-800 overflow-hidden shadow-lg active:scale-95"
          >
            <div className="absolute inset-0 bg-indigo-500/20 transition-all duration-75 origin-left" style={{ transform: `scaleX(${snoozeHoldProgress / 100})` }} />
            <div className="relative flex items-center justify-center gap-2 font-bold text-slate-400 group-active:text-white transition-all">
              <Moon className="w-5 h-5" />
              <span>HOLD TO SNOOZE</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default MissionUI;