import React from 'react';
import { Alarm, MissionType } from '../types';
import { Trash2, ShieldCheck, Footprints, Dumbbell, Brain, Zap, ShieldAlert, Lock, Grid, Radio, Camera, Flame, ChevronRight } from 'lucide-react';

interface AlarmCardProps {
  alarm: Alarm;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  isRinging: boolean;
  globalHardcore: boolean;
}

const MissionIcon = ({ type, className }: { type: MissionType, className?: string }) => {
  switch (type) {
    case MissionType.MATH: return <Brain className={className || "w-4 h-4"} />;
    case MissionType.STEPS: return <Footprints className={className || "w-4 h-4"} />;
    case MissionType.SQUATS: return <Dumbbell className={className || "w-4 h-4"} />;
    case MissionType.SHAKE: return <Zap className={className || "w-4 h-4"} />;
    case MissionType.MEMORY: return <Grid className={className || "w-4 h-4"} />;
    case MissionType.MORSE: return <Radio className={className || "w-4 h-4"} />;
    case MissionType.SMILE: return <Camera className={className || "w-4 h-4"} />;
    case MissionType.PUSHUPS: return <Flame className={className || "w-4 h-4"} />;
    default: return <ShieldCheck className={className || "w-4 h-4"} />;
  }
};

const AlarmCard: React.FC<AlarmCardProps> = ({ alarm, onToggle, onDelete, isRinging, globalHardcore }) => {
  const daysLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const effectiveHardcore = alarm.isHardcore || globalHardcore;
  const canDelete = !isRinging || !effectiveHardcore;

  return (
    <div className={`relative p-6 rounded-3xl transition-all duration-300 ${alarm.enabled ? 'bg-slate-800 border-l-4 border-indigo-500 shadow-xl' : 'bg-slate-900/50 opacity-60'} ${isRinging ? 'ring-2 ring-rose-500 animate-pulse' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-4xl font-bold tracking-tight text-white">{alarm.time}</h3>
            {effectiveHardcore && (
              <span className="bg-rose-500/20 text-rose-400 p-1 rounded-lg" title="Hardcore Mode Active">
                <ShieldAlert className="w-4 h-4" />
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-1 font-medium">{alarm.label || 'Alarm'}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={alarm.enabled} 
              onChange={() => !isRinging && onToggle(alarm.id)} 
              disabled={isRinging && effectiveHardcore}
              className="sr-only peer"
            />
            <div className={`w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 ${(isRinging && effectiveHardcore) ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
          </label>
          <button 
            onClick={() => canDelete && onDelete(alarm.id)}
            disabled={!canDelete}
            className={`transition-colors ${canDelete ? 'text-slate-500 hover:text-rose-500' : 'text-slate-700 cursor-not-allowed'}`}
          >
            {(isRinging && effectiveHardcore) ? <Lock className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center mt-6">
        <div className="flex gap-1.5">
          {daysLabels.map((day, idx) => (
            <span 
              key={idx} 
              className={`text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-black ${alarm.days.includes(idx) ? 'bg-indigo-500 text-white' : 'text-slate-600'}`}
            >
              {day}
            </span>
          ))}
        </div>
        
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[50%] no-scrollbar">
          {alarm.missions.map((m, i) => (
            <div key={i} className="flex items-center gap-1 bg-slate-700/80 px-2 py-1 rounded-lg border border-slate-600 shrink-0">
               <MissionIcon type={m.type} className="w-3 h-3 text-indigo-400" />
               <span className="text-[10px] font-bold text-slate-300">{m.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AlarmCard;