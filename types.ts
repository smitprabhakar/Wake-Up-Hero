
export enum MissionType {
  NONE = 'none',
  MATH = 'math',
  STEPS = 'steps',
  SQUATS = 'squats',
  SHAKE = 'shake',
  MEMORY = 'memory',
  MORSE = 'morse',
  SMILE = 'smile',
  PUSHUPS = 'pushups'
}

export interface MissionConfig {
  type: MissionType;
  count: number;
}

export interface Alarm {
  id: string;
  time: string; // HH:mm format
  days: number[]; // 0-6 (Sun-Sat)
  enabled: boolean;
  missions: MissionConfig[];
  label: string;
  isHardcore: boolean; // Cannot snooze, cannot delete when ringing
  snoozeCount: number;
  lastSnoozeTime?: number;
  soundUrl: string; // URL or base64 data for the alarm sound
  gradualVolumeDuration: number; // Duration in seconds to reach full volume
}

export interface MissionState {
  isActive: boolean;
  alarmId: string;
  missions: MissionConfig[];
  currentMissionIndex: number;
  isHardcore: boolean;
  soundUrl: string;
  gradualVolumeDuration: number;
}

export interface UserStats {
  currentStreak: number;
  bestStreak: number;
  lastCompletionDate?: string; // YYYY-MM-DD
}
