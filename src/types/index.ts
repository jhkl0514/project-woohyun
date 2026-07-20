// ─── Project WOOHYUN — Type Definitions ───────────────────────────────────────

// ── Subjects & Missions ───────────────────────────────────────────────────────

export type Difficulty = 1 | 2 | 3;

export type SubjectId = "math" | "en" | "sci" | "hist" | "eth";

export interface Subject {
  id: SubjectId;
  name: string;
  sub: string;
  goal: string;
  time: number;         // minutes
  difficulty: Difficulty;
  color: string;
  bg: string;
  done: boolean;
}

export interface StudySubject {
  id: SubjectId;
  name: string;
  color: string;
  bg: string;
  time: number;
  difficulty: Difficulty;
  exp: number;
  mission: string;
  recommended?: boolean;
}

export interface MissionRecord {
  id: string;           // `${date}-${subjectId}`
  date: string;         // "YYYY-MM-DD"
  subjectId: SubjectId;
  missionText: string;
  done: boolean;
  photoUrl?: string;    // base64 or URL
  approved?: boolean;   // mom approved
  expEarned: number;
  completedAt?: string; // ISO timestamp
}

// ── User Profile ──────────────────────────────────────────────────────────────

export interface UserProfile {
  childName: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  maxStreak: number;
  totalMissionsDone: number;
  startDate: string;    // "YYYY-MM-DD" — Day 1
  lastStudyDate: string | null;
  badges: BadgeId[];
}

export type BadgeId =
  | "first_study"
  | "streak_7"
  | "streak_14"
  | "streak_30"
  | "english_10"
  | "level_5"
  | "level_10"
  | "graduate_42";

// ── Daily Progress ────────────────────────────────────────────────────────────

export type DayStatus = "done" | "partial" | "rest" | "future" | "today";

export interface DayRecord {
  date: string;         // "YYYY-MM-DD"
  dayNumber: number;    // 1–42
  status: DayStatus;
  xpEarned: number;
  completedSubjects: SubjectId[];
  hardestSubject?: SubjectId;
  emotion?: number;     // 0–4 index
  journal?: string;
  momMessage?: string;
  usedRestDay?: boolean;
}

// ── Mom Messages ──────────────────────────────────────────────────────────────

export interface MomMessage {
  id: string;
  text: string;
  sentAt: string;       // ISO timestamp
  read: boolean;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotifCategory = "approval" | "reward" | "streak" | "message";

export interface Notification {
  id: string;
  category: NotifCategory;
  icon: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  createdAt: string;   // ISO timestamp
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  pushAlerts: boolean;
  momAlerts: boolean;
  streakAlerts: boolean;
  rewardAlerts: boolean;
  sound: boolean;
  vibration: boolean;
  darkMode: boolean;
  compactMode: boolean;
  studyReminderTime: string; // "HH:mm"
  restDay: string;           // "일" | "토" | etc.
}

// ── Screen Navigation ─────────────────────────────────────────────────────────

export type Screen =
  | "home"
  | "briefing"
  | "select"
  | "mission"
  | "focus"
  | "photo"
  | "reward"
  | "reflection"
  | "daily-review"
  | "tree-evolution"
  | "growth-dashboard"
  | "calendar"
  | "mom-dashboard"
  | "notifications"
  | "settings"
  | "admin";

export type TabIndex = 0 | 1 | 2 | 3 | 4;

// ── Store State shape ─────────────────────────────────────────────────────────

export interface AppState {
  // Navigation
  screen: Screen;
  activeTab: TabIndex;
  selectedSubjectId: SubjectId;

  // User data (persisted)
  profile: UserProfile;
  todaySubjects: Subject[];
  history: DayRecord[];
  momMessages: MomMessage[];
  notifications: Notification[];
  settings: AppSettings;

  // Session-only (not persisted)
  isTimerRunning: boolean;
  timerSecondsLeft: number;
}
