import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alarm, MissionType, MissionState, UserStats, MissionConfig } from './types';
import AlarmCard from './components/AlarmCard';
import MissionUI from './components/MissionUI';
import { Plus, Bell, Settings, X, Sparkles, Brain, Footprints, Dumbbell, Zap, Volume2, Tag, Flame, Trophy, Grid, Radio, ShieldCheck, AlertTriangle, RotateCcw, ChevronRight, AlertCircle, Camera, Minus, Plus as PlusIcon, Trash2, GripVertical, Lock, ShieldAlert, Volume1, VolumeX, Music, Upload, Play, Square } from 'lucide-react';
import { getMotivationalMessage } from './services/geminiService';

const PREDEFINED_SOUNDS = [
  { name: 'Siren (Default)', url: 'https://actions.google.com/sounds/v1/alarms/alarm_clock_bleep.ogg' },
  { name: 'Digital', url: 'https://actions.google.com/sounds/v1/alarms/digital_alarm_clock.ogg' },
  { name: 'Bell', url: 'https://actions.google.com/sounds/v1/alarms/mechanical_clock_ring.ogg' },
  { name: 'Beep', url: 'https://www.soundjay.com/buttons/beep-01a.mp3' },
];

const MISSION_RANGES: Record<MissionType, { min: number, max: number, default: number, unit: string }> = {
  [MissionType.MATH]: { min: 3, max: 10, default: 3, unit: 'Problems' },
  [MissionType.STEPS]: { min: 10, max: 50, default: 20, unit: 'Steps' },
  [MissionType.SQUATS]: { min: 5, max: 20, default: 10, unit: 'Squats' },
  [MissionType.PUSHUPS]: { min: 5, max: 20, default: 5, unit: 'Reps' },
  [MissionType.SHAKE]: { min: 5, max: 30, default: 15, unit: 'Shakes' },
  [MissionType.SMILE]: { min: 1, max: 5, default: 1, unit: 'Photos' },
  [MissionType.MEMORY]: { min: 2, max: 10, default: 4, unit: 'Pairs' },
  [MissionType.MORSE]: { min: 1, max: 10, default: 3, unit: 'Characters' },
  [MissionType.NONE]: { min: 0, max: 0, default: 0, unit: '' }
};

const App: React.FC = () => {
  const [alarms, setAlarms] = useState<Alarm[]>(() => {
    const saved = localStorage.getItem('wakeup_alarms');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [stats, setStats] = useState<UserStats>(() => {
    const saved = localStorage.getItem('wakeup_stats');
    const defaultStats = { currentStreak: 0, bestStreak: 0 };
    if (!saved) return defaultStats;
    const parsed = JSON.parse(saved);
    const today = new Date().toISOString().split('T')[0];
    const lastDate = parsed.lastCompletionDate;
    if (lastDate) {
      const last = new Date(lastDate);
      const now = new Date(today);
      const diffTime = Math.abs(now.getTime() - last.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 1) return { ...parsed, currentStreak: 0 };
    }
    return parsed;
  });

  const [globalHardcore, setGlobalHardcore] = useState<boolean>(() => {
    return localStorage.getItem('wakeup_global_hardcore') === 'true';
  });

  const [defaultGradualDuration, setDefaultGradualDuration] = useState<number>(() => {
    const saved = localStorage.getItem('wakeup_default_gradual');
    return saved ? parseInt(saved) : 30;
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activeMission, setActiveMission] = useState<MissionState | null>(null);
  const [postMissionMessage, setPostMissionMessage] = useState<string | null>(null);
  const [hasSensorPermission, setHasSensorPermission] = useState(() => {
    return !('DeviceMotionEvent' in window) || !('requestPermission' in (DeviceMotionEvent as any));
  });
  
  const [newAlarm, setNewAlarm] = useState<Partial<Alarm>>({
    time: '07:00',
    days: [1, 2, 3, 4, 5],
    missions: [{ type: MissionType.MATH, count: 3 }],
    label: '',
    enabled: true,
    isHardcore: false,
    snoozeCount: 0,
    soundUrl: PREDEFINED_SOUNDS[0].url,
    gradualVolumeDuration: defaultGradualDuration
  });

  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    localStorage.setItem('wakeup_alarms', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    localStorage.setItem('wakeup_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('wakeup_global_hardcore', globalHardcore.toString());
  }, [globalHardcore]);

  useEffect(() => {
    localStorage.setItem('wakeup_default_gradual', defaultGradualDuration.toString());
  }, [defaultGradualDuration]);

  const requestSensorPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        if (permissionState === 'granted') setHasSensorPermission(true);
      } catch (e) {
        console.error('Sensor permission error', e);
      }
    } else {
      setHasSensorPermission(true);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentDay = now.getDay();
      
      alarms.forEach(alarm => {
        if (!alarm.enabled) return;
        const isTimeMatch = alarm.time === currentTime && alarm.days.includes(currentDay);
        const isSnoozeMatch = alarm.lastSnoozeTime && (now.getTime() - alarm.lastSnoozeTime >= 5 * 60000);

        if (isTimeMatch || isSnoozeMatch) {
          const lastFired = sessionStorage.getItem(`fired_${alarm.id}`);
          const firedKey = `${currentTime}_${alarm.id}_${alarm.lastSnoozeTime || '0'}`;
          
          if (lastFired !== firedKey) {
            sessionStorage.setItem(`fired_${alarm.id}`, firedKey);
            setActiveMission({
              isActive: true,
              alarmId: alarm.id,
              missions: alarm.missions,
              currentMissionIndex: 0,
              isHardcore: alarm.isHardcore || globalHardcore,
              soundUrl: alarm.soundUrl,
              gradualVolumeDuration: alarm.gradualVolumeDuration ?? 0
            });
          }
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [alarms, globalHardcore]);

  const handleResetStreak = () => {
    setStats(prev => ({ ...prev, currentStreak: 0 }));
    setShowResetConfirm(false);
  };

  const addAlarm = () => {
    if (!newAlarm.missions || newAlarm.missions.length === 0) {
      alert("Please add at least one mission!");
      return;
    }
    const alarm: Alarm = {
      id: Math.random().toString(36).substr(2, 9),
      time: newAlarm.time!,
      days: newAlarm.days!,
      enabled: true,
      missions: newAlarm.missions!,
      label: newAlarm.label || 'Alarm',
      isHardcore: !!newAlarm.isHardcore,
      snoozeCount: 0,
      soundUrl: newAlarm.soundUrl || PREDEFINED_SOUNDS[0].url,
      gradualVolumeDuration: newAlarm.gradualVolumeDuration ?? 0
    };
    setAlarms([...alarms, alarm]);
    setShowAddModal(false);
    stopPreview();
    setNewAlarm({
      time: '07:00',
      days: [1, 2, 3, 4, 5],
      missions: [{ type: MissionType.MATH, count: 3 }],
      label: '', enabled: true, isHardcore: false, snoozeCount: 0,
      soundUrl: PREDEFINED_SOUNDS[0].url, gradualVolumeDuration: defaultGradualDuration
    });
    if (!hasSensorPermission) requestSensorPermission();
  };

  const toggleAlarm = (id: string) => {
    setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled, lastSnoozeTime: undefined, snoozeCount: 0 } : a));
  };

  const deleteAlarm = (id: string) => setAlarms(alarms.filter(a => a.id !== id));

  const handleSnooze = useCallback(() => {
    if (!activeMission) return;
    const alarmId = activeMission.alarmId;
    setAlarms(prev => prev.map(a => a.id === alarmId ? { 
      ...a, 
      snoozeCount: a.snoozeCount + 1, 
      lastSnoozeTime: Date.now() 
    } : a));
    setActiveMission(null);
  }, [activeMission]);

  const handleMissionComplete = useCallback(async () => {
    if (!activeMission) return;
    
    if (activeMission.currentMissionIndex < activeMission.missions.length - 1) {
      setActiveMission({
        ...activeMission,
        currentMissionIndex: activeMission.currentMissionIndex + 1
      });
      return;
    }

    const alarmId = activeMission.alarmId;
    const today = new Date().toISOString().split('T')[0];
    setStats(prev => {
      if (prev.lastCompletionDate === today) return prev;
      const newStreak = prev.currentStreak + 1;
      return {
        currentStreak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
        lastCompletionDate: today
      };
    });

    setAlarms(prev => prev.map(a => a.id === alarmId ? { ...a, snoozeCount: 0, lastSnoozeTime: undefined } : a));
    setActiveMission(null);
    const msg = await getMotivationalMessage("ALL_MISSIONS");
    setPostMissionMessage(msg);
  }, [activeMission]);

  const addMissionToNewAlarm = () => {
    const currentMissions = newAlarm.missions || [];
    setNewAlarm({
      ...newAlarm,
      missions: [...currentMissions, { type: MissionType.MATH, count: MISSION_RANGES[MissionType.MATH].default }]
    });
  };

  const removeMissionFromNewAlarm = (index: number) => {
    const currentMissions = [...(newAlarm.missions || [])];
    currentMissions.splice(index, 1);
    setNewAlarm({ ...newAlarm, missions: currentMissions });
  };

  const updateMissionInNewAlarm = (index: number, updates: Partial<MissionConfig>) => {
    const currentMissions = [...(newAlarm.missions || [])];
    currentMissions[index] = { ...currentMissions[index], ...updates };
    if (updates.type) {
      currentMissions[index].count = MISSION_RANGES[updates.type].default;
    }
    setNewAlarm({ ...newAlarm, missions: currentMissions });
  };

  const handleCustomSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setNewAlarm({ ...newAlarm, soundUrl: base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePreview = () => {
    if (isPreviewing) {
      stopPreview();
    } else {
      if (newAlarm.soundUrl) {
        previewAudioRef.current = new Audio(newAlarm.soundUrl);
        previewAudioRef.current.play();
        setIsPreviewing(true);
        previewAudioRef.current.onended = () => setIsPreviewing(false);
      }
    }
  };

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPreviewing(false);
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      <header className="px-6 pt-12 pb-8 flex justify-between items-start z-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">WakeUp Hero</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 bg-orange-500/20 px-2 py-0.5 rounded-lg border border-orange-500/30">
              <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
              <span className="text-xs font-black text-orange-400 tabular-nums">{stats.currentStreak}d Streak</span>
            </div>
            {stats.bestStreak > 0 && (
              <div className="flex items-center gap-1 text-slate-500">
                <Trophy className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Best: {stats.bestStreak}</span>
              </div>
            )}
          </div>
        </div>
        <button onClick={() => setShowSettingsModal(true)} className="p-3 bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors border border-slate-800 text-slate-400">
          <Settings className="w-6 h-6" />
        </button>
      </header>

      <main className="flex-1 px-6 space-y-4 pb-32 z-10 overflow-y-auto custom-scrollbar">
        {alarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <Bell className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium text-white">No alarms set yet.</p>
          </div>
        ) : (
          alarms.map(alarm => (
            <AlarmCard key={alarm.id} alarm={alarm} onToggle={toggleAlarm} onDelete={deleteAlarm} isRinging={activeMission?.alarmId === alarm.id} globalHardcore={globalHardcore} />
          ))
        )}
      </main>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-20">
        <button onClick={() => {
            setNewAlarm(prev => ({ ...prev, gradualVolumeDuration: defaultGradualDuration }));
            setShowAddModal(true);
        }} className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 font-bold">
          <Plus className="w-6 h-6" />
          <span>New Alarm</span>
        </button>
      </div>

      {activeMission && (
        <MissionUI 
          missions={activeMission.missions}
          currentMissionIndex={activeMission.currentMissionIndex}
          onMissionComplete={handleMissionComplete} 
          onSnooze={handleSnooze}
          isHardcore={activeMission.isHardcore}
          soundUrl={activeMission.soundUrl}
          gradualVolumeDuration={activeMission.gradualVolumeDuration}
        />
      )}

      {postMissionMessage && (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full rounded-3xl p-8 border border-indigo-500/30 shadow-2xl text-center">
            <Sparkles className="w-12 h-12 text-indigo-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-4 text-white">Good Morning!</h2>
            <p className="text-slate-300 italic text-lg leading-relaxed mb-8">"{postMissionMessage}"</p>
            <button onClick={() => setPostMissionMessage(null)} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-white transition-all">Dismiss</button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 border-t border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar pb-8">
              <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">General</h3>
                <div className="space-y-4">
                  <div 
                    onClick={requestSensorPermission}
                    className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-700/30 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5 text-indigo-400" />
                      <span className="font-semibold text-slate-200 text-sm">Request Sensor Access</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                  
                  {/* Default Gradual Volume Control */}
                  <div className="p-2 space-y-3">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <Volume1 className="w-5 h-5 text-indigo-400" />
                          <span className="font-semibold text-slate-200 text-sm">Default Gradual Wake</span>
                       </div>
                       <span className="text-xs font-black text-indigo-400">{defaultGradualDuration}s</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="120" 
                      step="5"
                      value={defaultGradualDuration} 
                      onChange={e => setDefaultGradualDuration(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                    />
                  </div>
                </div>
              </div>

              {/* Master Hardcore Option */}
              <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-800">
                <div className="flex justify-between items-start mb-4">
                   <div>
                     <h3 className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-1">Mission Integrity</h3>
                     <p className="text-[10px] text-slate-500 font-medium">Enforce strict rules globally</p>
                   </div>
                   <ShieldAlert className={`w-5 h-5 ${globalHardcore ? 'text-rose-500' : 'text-slate-600'}`} />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-rose-500" />
                    <div>
                      <span className="block font-bold text-sm text-slate-100">Global Hardcore Mode</span>
                      <span className="text-[9px] text-slate-500 leading-tight block mt-0.5">Disables snooze/delete for ALL alarms.</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={globalHardcore} 
                      onChange={e => setGlobalHardcore(e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                  </label>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-4">Danger Zone</h3>
                <button 
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full flex items-center justify-between p-4 bg-rose-500/10 hover:bg-rose-500/20 rounded-2xl border border-rose-500/30 transition-all text-rose-400 group"
                >
                  <div className="flex items-center gap-3">
                    <RotateCcw className="w-5 h-5 group-hover:rotate-[-90deg] transition-transform" />
                    <span className="font-bold">Reset Current Streak</span>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {showResetConfirm && (
            <div className="fixed inset-0 z-[60] bg-slate-950/90 flex items-center justify-center p-6 backdrop-blur-sm">
              <div className="bg-slate-900 w-full max-w-sm rounded-[2rem] p-8 border-2 border-rose-500/50 animate-in zoom-in duration-200">
                <div className="flex justify-center mb-6">
                  <div className="p-4 bg-rose-500/20 rounded-full text-rose-500">
                    <AlertCircle className="w-12 h-12" />
                  </div>
                </div>
                <h3 className="text-xl font-black text-center mb-2 text-white">RESET STREAK?</h3>
                <p className="text-slate-400 text-center text-sm mb-8">
                  Are you sure you want to reset your streak?
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold">Cancel</button>
                  <button onClick={handleResetStreak} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-bold">Reset</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 border-t border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Config Alarm</h2>
              <button onClick={() => { setShowAddModal(false); stopPreview(); }} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar pb-10">
              <input type="time" value={newAlarm.time} onChange={e => setNewAlarm({...newAlarm, time: e.target.value})} className="bg-slate-800 border-2 border-indigo-500/20 text-white text-6xl font-black p-4 rounded-3xl focus:outline-none focus:border-indigo-500 w-full text-center" />
              
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Missions List</p>
                <div className="space-y-3">
                  {(newAlarm.missions || []).map((m, idx) => (
                    <div key={idx} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="bg-indigo-600 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full text-white">{idx + 1}</span>
                          <select 
                            value={m.type} 
                            onChange={e => updateMissionInNewAlarm(idx, { type: e.target.value as MissionType })}
                            className="bg-transparent text-white font-bold focus:outline-none cursor-pointer border-none"
                          >
                            {Object.values(MissionType).filter(t => t !== MissionType.NONE).map(t => (
                              <option key={t} value={t} className="bg-slate-900">{t.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => removeMissionFromNewAlarm(idx)} className="text-slate-500 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateMissionInNewAlarm(idx, { count: Math.max(MISSION_RANGES[m.type].min, m.count - 1) })} className="p-2 bg-slate-700 rounded-lg text-white"><Minus className="w-4 h-4" /></button>
                        <div className="flex-1 text-center">
                           <span className="text-sm font-black text-indigo-400">{m.count} {MISSION_RANGES[m.type].unit}</span>
                        </div>
                        <button onClick={() => updateMissionInNewAlarm(idx, { count: Math.min(MISSION_RANGES[m.type].max, m.count + 1) })} className="p-2 bg-slate-700 rounded-lg text-white"><PlusIcon className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addMissionToNewAlarm} className="w-full py-3 border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center gap-2 text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 transition-all font-bold text-sm">
                    <PlusIcon className="w-4 h-4" /> Add Task
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Days</p>
                <div className="flex justify-between">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                    <button key={idx} onClick={() => {
                      const days = newAlarm.days || [];
                      setNewAlarm({...newAlarm, days: days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx]});
                    }} className={`w-10 h-10 rounded-full font-bold transition-all text-xs ${newAlarm.days?.includes(idx) ? 'bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.4)]' : 'bg-slate-800 text-slate-400'}`}>{day}</button>
                  ))}
                </div>
              </div>

              {/* Sound Selection Section */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Alarm Sound</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-800 rounded-2xl border border-slate-700 flex items-center px-4">
                    <Music className="w-4 h-4 text-indigo-400 mr-3" />
                    <select 
                      value={PREDEFINED_SOUNDS.find(s => s.url === newAlarm.soundUrl)?.url || 'custom'} 
                      onChange={e => {
                        const val = e.target.value;
                        if (val !== 'custom') {
                          setNewAlarm({ ...newAlarm, soundUrl: val });
                          stopPreview();
                        }
                      }}
                      className="bg-transparent text-white font-bold focus:outline-none cursor-pointer border-none w-full py-3 text-sm"
                    >
                      {PREDEFINED_SOUNDS.map(s => (
                        <option key={s.url} value={s.url} className="bg-slate-900">{s.name}</option>
                      ))}
                      {!PREDEFINED_SOUNDS.find(s => s.url === newAlarm.soundUrl) && (
                        <option value="custom" className="bg-slate-900">Custom Upload</option>
                      )}
                    </select>
                  </div>
                  <button 
                    onClick={togglePreview}
                    className="aspect-square w-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-lg"
                  >
                    {isPreviewing ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-2xl border border-slate-700 transition-all flex items-center justify-center gap-2 group">
                    <Upload className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-300">Upload Custom MP3</span>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      className="hidden" 
                      onChange={handleCustomSoundUpload} 
                    />
                  </label>
                </div>
              </div>

              {/* Gradual Volume slider for this alarm */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Gradual Volume</p>
                  <span className="text-xs font-black text-indigo-400">{newAlarm.gradualVolumeDuration}s</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="120" 
                  step="5"
                  value={newAlarm.gradualVolumeDuration} 
                  onChange={e => setNewAlarm({...newAlarm, gradualVolumeDuration: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                />
                <p className="text-[10px] text-slate-500 italic">Increases from zero to max over {newAlarm.gradualVolumeDuration}s.</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Hardcore Mode</p>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={newAlarm.isHardcore} 
                      onChange={e => setNewAlarm({...newAlarm, isHardcore: e.target.checked})} 
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 italic">Disables snooze and deletion while ringing.</p>
              </div>

              <button onClick={addAlarm} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black text-lg shadow-xl transition-all">Save Alarm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;