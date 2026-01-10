
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MissionType } from '../types';
import { Footprints, Dumbbell, Brain, Zap, AlertCircle, Volume2, Moon, Lock, Grid, Radio } from 'lucide-react';
import { getWakeUpCallAudio } from '../services/geminiService';

interface MissionUIProps {
  type: MissionType;
  target: number;
  onComplete: () => void;
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

const MissionUI: React.FC<MissionUIProps> = ({ 
  type, 
  target, 
  onComplete, 
  onSnooze, 
  isHardcore, 
  soundUrl,
  gradualVolumeDuration 
}) => {
  const [current, setCurrent] = useState(0);
  const [mathProblem, setMathProblem] = useState({ q: '', a: 0 });
  const [mathInput, setMathInput] = useState('');
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [isAiVoicePlaying, setIsAiVoicePlaying] = useState(false);
  const [snoozeHoldProgress, setSnoozeHoldProgress] = useState(0);

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

  const decodeAndPlay = async (base64: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const dataInt16 = new Int16Array(bytes.buffer);
      const frameCount = dataInt16.length;
      const buffer = ctx.createBuffer(1, frameCount, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsAiVoicePlaying(false);
      setIsAiVoicePlaying(true);
      source.start();
    } catch (e) {
      console.error("Failed to play AI voice", e);
    }
  };

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

    siren.play().catch(e => console.log("Audio play blocked", e));
    sirenRef.current = siren;

    const playViralMotivation = async () => {
      const audioData = await getWakeUpCallAudio();
      if (audioData) decodeAndPlay(audioData);
    };
    const timer = setTimeout(playViralMotivation, 1000);

    return () => {
      siren.pause();
      clearTimeout(timer);
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [soundUrl, gradualVolumeDuration]);

  // Initializers
  const initMemory = useCallback(() => {
    const symbols = ['🔥', '⚡', '🧠', '💪', '🚀', '⭐'];
    const chosen = symbols.slice(0, target / 2 || 3);
    const deck = [...chosen, ...chosen]
      .sort(() => Math.random() - 0.5)
      .map((val, id) => ({ id, val, flipped: false, matched: false }));
    setMemoryTiles(deck);
    setCurrent(0);
  }, [target]);

  const initMorse = useCallback(() => {
    const chars = Object.keys(MORSE_DICTIONARY);
    const char = chars[Math.floor(Math.random() * chars.length)];
    setMorseTarget({ char, pattern: MORSE_DICTIONARY[char] });
    setMorseInput('');
  }, []);

  const generateMath = useCallback(() => {
    const num1 = Math.floor(Math.random() * 20) + 10;
    const num2 = Math.floor(Math.random() * 20) + 10;
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

  // Handlers
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
      if (next >= target) onComplete();
      else setTimeout(initMorse, 500);
    } else if (!morseTarget.pattern.startsWith(newInput)) {
      setMorseInput(''); // Reset if wrong sequence
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
        const matchCount = newTiles.filter(t => t.matched).length / 2;
        setCurrent(matchCount);
        if (matchCount >= memoryTiles.length / 2) onComplete();
      } else {
        setTimeout(() => {
          newTiles[first].flipped = false;
          newTiles[second].flipped = false;
          setMemoryTiles(newTiles);
          setSelectedTiles([]);
        }, 1000);
      }
    }
  };

  const handleMathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(mathInput) === mathProblem.a) {
      const next = current + 1;
      setCurrent(next);
      if (next >= target) onComplete();
      else generateMath();
    } else {
      setMathInput('');
    }
  };

  useEffect(() => {
    if ([MissionType.MATH, MissionType.MEMORY, MissionType.MORSE].includes(type)) return;
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
        setCurrent(prev => {
          const next = prev + 1;
          if (next >= target) {
            window.removeEventListener('devicemotion', handleMotion);
            setTimeout(onComplete, 300);
          }
          return next;
        });
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [type, target, onComplete]);

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 text-center overflow-hidden">
      <div className="absolute inset-0 bg-rose-600/10 animate-pulse pointer-events-none"></div>

      {isHardcore && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-rose-500/20 text-rose-400 px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
          <Lock className="w-3 h-3" /> Mission Locked
        </div>
      )}

      <div className="absolute top-0 inset-x-0 h-2 bg-slate-800">
        <div 
          className="h-full bg-rose-500 transition-all duration-300 shadow-[0_0_15px_rgba(244,63,94,0.6)]" 
          style={{ width: `${progress}%` }} 
        />
      </div>

      <div className="mb-8 relative mt-10">
        <div className="w-24 h-24 rounded-full border-4 border-rose-500/30 flex items-center justify-center animate-pulse">
           {type === MissionType.MATH && <Brain className="w-12 h-12 text-indigo-400" />}
           {type === MissionType.STEPS && <Footprints className="w-12 h-12 text-emerald-400" />}
           {type === MissionType.SQUATS && <Dumbbell className="w-12 h-12 text-orange-400" />}
           {type === MissionType.SHAKE && <Zap className="w-12 h-12 text-yellow-400" />}
           {type === MissionType.MEMORY && <Grid className="w-12 h-12 text-purple-400" />}
           {type === MissionType.MORSE && <Radio className="w-12 h-12 text-cyan-400" />}
        </div>
      </div>

      <h2 className="text-3xl font-black mb-1 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-orange-400">
        {type === MissionType.MEMORY ? 'MEMORY SYNC' : type === MissionType.MORSE ? 'MORSE COMMS' : 'WAKE UP HERO'}
      </h2>
      
      <p className="text-slate-400 mb-6 font-bold uppercase text-xs tracking-widest">
        {type === MissionType.MEMORY ? 'MATCH ALL PAIRS' : 
         type === MissionType.MORSE ? `SIGNAL: ${morseTarget.char} (${morseTarget.pattern})` :
         `${current}/${target} PROGRESS`}
      </p>

      {/* Main Content Areas */}
      {type === MissionType.MEMORY && (
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mb-8">
          {memoryTiles.map(tile => (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile.id)}
              className={`aspect-square rounded-2xl flex items-center justify-center text-3xl transition-all duration-500 transform ${tile.flipped || tile.matched ? 'bg-indigo-600/20 border-indigo-500 rotate-y-180 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-slate-900 border-slate-800' } border-2`}
            >
              {(tile.flipped || tile.matched) ? tile.val : '?'}
            </button>
          ))}
        </div>
      )}

      {type === MissionType.MORSE && (
        <div className="flex flex-col items-center gap-8 mb-8">
          <div className="flex gap-2 text-4xl font-mono text-cyan-400 tracking-widest bg-slate-900 px-6 py-4 rounded-3xl border-2 border-slate-800">
            {morseTarget.pattern.split('').map((c, i) => (
              <span key={i} className={i < morseInput.length ? 'text-cyan-400' : 'text-slate-700'}>{c}</span>
            ))}
          </div>
          <button
            onMouseDown={handleMorseTapStart}
            onMouseUp={handleMorseTapEnd}
            onTouchStart={handleMorseTapStart}
            onTouchEnd={handleMorseTapEnd}
            className={`w-32 h-32 rounded-full border-8 transition-all ${morseDownTime ? 'bg-cyan-500 border-cyan-400 scale-95' : 'bg-slate-900 border-slate-800 scale-100'} shadow-2xl flex items-center justify-center`}
          >
            <div className={`w-8 h-8 rounded-full ${morseDownTime ? 'bg-white' : 'bg-cyan-900'} transition-colors`} />
          </button>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">TAP = . | HOLD = -</p>
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
              placeholder="Result"
            />
          </div>
        </form>
      )}

      {/* Stats Display for simple missions */}
      {![MissionType.MATH, MissionType.MEMORY, MissionType.MORSE].includes(type) && (
        <div className="text-8xl font-black mb-12 text-white tabular-nums tracking-tighter">
          {current}<span className="text-3xl text-slate-700 ml-2">/{target}</span>
        </div>
      )}

      {![MissionType.MATH, MissionType.MEMORY, MissionType.MORSE].includes(type) && (
         <div className="flex flex-col items-center gap-4 w-full max-w-xs mb-8">
            <div className="flex items-center gap-2 text-rose-400 animate-bounce">
                <AlertCircle className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">INTENSITY: {Math.round(shakeIntensity)}</span>
            </div>
         </div>
      )}

      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        {!isHardcore && (
          <button 
            onMouseDown={startSnoozeHold}
            onMouseUp={stopSnoozeHold}
            onMouseLeave={stopSnoozeHold}
            onTouchStart={startSnoozeHold}
            onTouchEnd={stopSnoozeHold}
            className="group relative w-full py-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-800 overflow-hidden transition-all"
          >
            <div className="absolute inset-0 bg-indigo-500/20 transition-all duration-75 origin-left" style={{ transform: `scaleX(${snoozeHoldProgress / 100})` }} />
            <div className="relative flex items-center justify-center gap-2 font-bold text-slate-400 group-active:text-white group-active:scale-95 transition-all">
              <Moon className="w-5 h-5" />
              <span>HOLD TO SNOOZE (PENALTY +5)</span>
            </div>
          </button>
        )}
      </div>

      <div className="mt-auto pt-10 text-slate-600 text-[10px] font-black uppercase tracking-[0.4em]">
        WAKEUP HERO • BY ANY MEANS NECESSARY
      </div>
    </div>
  );
};

export default MissionUI;
