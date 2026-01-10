import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alarm, MissionType, MissionState, UserStats } from './types';
import AlarmCard from './components/AlarmCard';
import MissionUI from './components/MissionUI';
import { Plus, Bell, Settings, X, Sparkles, Brain, Footprints, Dumbbell, Zap, Volume2, Tag, Flame, Trophy, Grid, Radio, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getMotivationalMessage } from './services/geminiService';

const PREDEFINED_SOUNDS = [
  { name: 'Siren (Default)', url: 'https://actions.google.com/sounds/v1/alarms/alarm_clock_bleep.ogg' },
  { name: 'Digital', url: 'https://actions.google.com/sounds/v1/alarms/digital_alarm_clock.ogg' },
  { name: 'Bell', url: 'https://actions.google.com/sounds/v1/alarms/mechanical_clock_ring.ogg' },
  { name: 'Beep', url: 'https://www.soundjay.com/buttons/beep-01a.mp3' },
];

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
      
      if (diffDays > 1) {
        return { ...parsed, currentStreak: 0 };
      }
    }
    
    return parsed;
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [activeMission, setActiveMission] = useState<MissionState | null>(null);
  const [postMissionMessage, setPostMissionMessage] = useState<string | null>(null);
  const [hasSensorPermission, setHasSensorPermission] = useState(false);
  const [isHttps, setIsHttps] = useState(true);
  
  // Form State
  const [newAlarm, setNewAlarm] = useState<Partial<Alarm>>({
    time: '07:00',
    days: [1, 2, 3, 4, 5],
    missionType: MissionType.MATH,
    missionCount: 3,
    label: 'Morning Grind',
    enabled: true,
    isHardcore: false,
    snoozeCount: 0,
    soundUrl: PREDEFINED_SOUNDS[0].url,
    gradualVolumeDuration: 30
  });

  useEffect(() => {
    setIsHttps(window.location.protocol === 'https:');
    localStorage.setItem('wakeup_alarms', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    localStorage.setItem('wakeup_stats', JSON.stringify(stats));
  }, [stats]);

  const requestSensorPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        if (permissionState === 'granted') {
          setHasSensorPermission(true);
        }
      } catch (e) {
        console.error('Sensor permission denied', e);
      }
    } else {
      setHasSensorPermission(true);
    }
  };

  // Alarm Checker Logic
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
          if (lastFired !== currentTime + (alarm.lastSnoozeTime || '')) {
            sessionStorage.setItem(`fired_${alarm.id}`, currentTime + (alarm.lastSnoozeTime || ''));
            
            const penaltyTarget = alarm.missionCount + (alarm.snoozeCount * 5);

            setActiveMission({
              isActive: true,
              alarmId: alarm.id,
              type: alarm.missionType,
              targetCount: penaltyTarget,
              currentCount: 0,
              isHardcore: alarm.isHardcore,
              soundUrl: alarm.soundUrl,
              gradualVolumeDuration: alarm.gradualVolumeDuration || 0
            });
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [alarms]);

  const addAlarm = () => {
    const alarm: Alarm = {
      id: Math.random().toString(36).substr(2, 9),
      time: newAlarm.time!,
      days: newAlarm.days!,
      enabled: true,
      missionType: newAlarm.missionType!,
      missionCount: newAlarm.missionCount!,
      label: newAlarm.label || 'Alarm',
      isHardcore: !!newAlarm.isHardcore,
      snoozeCount: 0,
      soundUrl: newAlarm.soundUrl || PREDEFINED_SOUNDS[0].url,
      gradualVolumeDuration: newAlarm.gradualVolumeDuration || 0
    };
    setAlarms([...alarms, alarm]);
    setShowAddModal(false);
    if (!hasSensorPermission) requestSensorPermission();
  };

  const toggleAlarm = (id: string) => {
    setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled, lastSnoozeTime: undefined, snoozeCount: 0 } : a));
    if (!hasSensorPermission) requestSensorPermission();
  };

  const deleteAlarm = (id: string) => {
    setAlarms(alarms.filter(a => a.id !== id));
  };

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
    const alarmId = activeMission.alarmId;
    const type = activeMission.type;
    
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
    const msg = await getMotivationalMessage(type);
    setPostMissionMessage(msg);
  }, [activeMission]);

  return (
    <div className="min-h-screen max-w-md mx-auto bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-5%] left-[-5%] w-72 h-72 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <header className="px-6 pt-12 pb-8 flex justify-between items-start z-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">WakeUp Hero</h1>
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
        <button className="p-3 bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors border border-slate-800">
          <Settings className="w-6 h-6 text-slate-400" />
        </button>
      </header>

      {/* Warnings & Permissions */}
      <div className="px-6 space-y-3 mb-4 z-10">
        {!isHttps && (
          <div className="p-4 bg-rose-600/10 border border-rose-500/30 rounded-2xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-xs font-semibold text-rose-200">Sensors require HTTPS to function properly.</span>
          </div>
        )}
        {!hasSensorPermission && (
          <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-300">Allow sensors for exercise missions.</span>
            </div>
            <button 
              onClick={requestSensorPermission}
              className="px-3 py-1.5 bg-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-colors"
            >
              Enable
            </button>
          </div>
        )}
      </div>

      <main className="flex-1 px-6 space-y-4 pb-32 z-10 overflow-y-auto">
        {alarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <Bell className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium">No alarms set yet.<br/>Sleep like a hero.</p>
          </div>
        ) : (
          alarms.map(alarm => (
            <AlarmCard 
              key={alarm.id} 
              alarm={alarm} 
              onToggle={toggleAlarm} 
              onDelete={deleteAlarm}
              isRinging={activeMission?.alarmId === alarm.id}
            />
          ))
        )}
      </main>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-20">
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-full shadow-[0_10px_40px_-10px_rgba(79,70,229,0.5)] transition-all hover:scale-105 active:scale-95 font-bold"
        >
          <Plus className="w-6 h-6" />
          <span>New Mission</span>
        </button>
      </div>

      {activeMission && (
        <MissionUI 
          type={activeMission.type} 
          target={activeMission.targetCount} 
          onComplete={handleMissionComplete} 
          onSnooze={handleSnooze}
          isHardcore={activeMission.isHardcore}
          soundUrl={activeMission.soundUrl}
          gradualVolumeDuration={activeMission.gradualVolumeDuration}
        />
      )}

      {postMissionMessage && (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full rounded-3xl p-8 border border-indigo-500/30 shadow-2xl transform animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400">
                <Sparkles className="w-10 h-10" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center mb-4">Good Morning!</h2>
            <p className="text-slate-300 text-center italic text-lg leading-relaxed mb-8">
              "{postMissionMessage}"
            </p>
            <button 
              onClick={() => setPostMissionMessage(null)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold transition-all"
            >
              Let's Conquer The Day
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 border-t border-slate-800 sm:border border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Configure Alarm</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar pb-10">
              <div className="flex justify-center gap-4">
                <input 
                  type="time" 
                  value={newAlarm.time}
                  onChange={e => setNewAlarm({...newAlarm, time: e.target.value})}
                  className="bg-slate-800 border-2 border-indigo-500/20 text-white text-6xl font-black p-4 rounded-3xl focus:outline-none focus:border-indigo-500 w-full text-center"
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Mission Type</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: MissionType.MATH, label: 'Math', icon: <Brain />, count: 3 },
                    { id: MissionType.STEPS, label: 'Steps', icon: <Footprints />, count: 20 },
                    { id: MissionType.SQUATS, label: 'Squats', icon: <Dumbbell />, count: 10 },
                    { id: MissionType.SHAKE, label: 'Shake', icon: <Zap />, count: 50 },
                    { id: MissionType.MEMORY, label: 'Memory', icon: <Grid />, count: 6 },
                    { id: MissionType.MORSE, label: 'Morse', icon: <Radio />, count: 3 }
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setNewAlarm({...newAlarm, missionType: m.id as MissionType, missionCount: m.count})}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newAlarm.missionType === m.id ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-slate-800/50 border-transparent text-slate-400 hover:bg-slate-800'}`}
                    >
                      <div className="w-5 h-5 shrink-0">{m.icon}</div>
                      <span className="font-bold text-xs">{m.label} ({m.count})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Days to repeat</p>
                <div className="flex justify-between">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const days = newAlarm.days || [];
                        const updated = days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx];
                        setNewAlarm({...newAlarm, days: updated});
                      }}
                      className={`w-10 h-10 rounded-full font-bold transition-all text-xs ${newAlarm.days?.includes(idx) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
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

              <button 
                onClick={addAlarm}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black text-lg shadow-xl transition-all"
              >
                Save Alarm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
