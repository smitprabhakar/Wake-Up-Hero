
import React from 'react';
import { Alarm, MissionType } from '../types';
import { Trash2, ShieldCheck, Footprints, Dumbbell, Brain, Zap, ShieldAlert, Lock, Grid, Radio } from 'lucide-react';

interface AlarmCardProps {
  alarm: Alarm;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  isRinging: boolean;
}

const MissionIcon = ({ type }: { type: MissionType }) => {
  switch (type) {
    case MissionType.MATH: return <Brain className="w-4 h-4" />;
    case MissionType.STEPS: return <Footprints className="w-4 h-4" />;
    case MissionType.SQUATS: return <Dumbbell className="w-4 h-4" />;
    case MissionType.SHAKE: return <Zap className="w-4 h-4" />;
    case MissionType.MEMORY: return <Grid className="w-4 h-4" />;
    case MissionType.MORSE: return <Radio className="w-4 h-4" />;
    default: return <ShieldCheck className="w-4 h-4" />;
  }
};

const AlarmCard: React.FC<AlarmCardProps> = ({ alarm, onToggle, onDelete, isRinging }) => {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const canDelete = !isRinging || !alarm.isHardcore;

  return (
    <div className={`relative p-6 rounded-3xl transition-all duration-300 ${alarm.enabled ? 'bg-slate-800 border-l-4 border-indigo-500 shadow-xl' : 'bg-slate-900/50 opacity-60'} ${isRinging ? 'ring-2 ring-rose-500 animate-pulse' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-4xl font-bold tracking-tight">{alarm.time}</h3>
            {alarm.isHardcore && (
              <span className="bg-rose-500/20 text-rose-400 p-1 rounded-lg" title="Hardcore Mode">
                <ShieldAlert className="w-4 h-4" />
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-1">{alarm.label || 'Alarm'}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={alarm.enabled} 
              onChange={() => !isRinging && onToggle(alarm.id)} 
              disabled={isRinging && alarm.isHardcore}
              className="sr-only peer"
            />
            <div className={`w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 ${isRinging && alarm.isHardcore ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
          </label>
          <button 
            onClick={() => canDelete && onDelete(alarm.id)}
            disabled={!canDelete}
            className={`transition-colors ${canDelete ? 'text-slate-500 hover:text-rose-500' : 'text-slate-700 cursor-not-allowed'}`}
          >
            {isRinging && alarm.isHardcore ? <Lock className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center mt-4">
        <div className="flex gap-2">
          {days.map((day, idx) => (
            <span 
              key={idx} 
              className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold ${alarm.days.includes(idx) ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-600'}`}
            >
              {day}
            </span>
          ))}
        </div>
        
        <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-full text-xs font-semibold text-indigo-300">
          <MissionIcon type={alarm.missionType} />
          <span className="capitalize">{alarm.missionType} {alarm.missionCount > 0 && `(${alarm.missionCount + (alarm.snoozeCount * 5)})`}</span>
        </div>
      </div>
    </div>
  );
};

export default AlarmCard;
