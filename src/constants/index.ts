// ─── Project WOOHYUN — Constants ──────────────────────────────────────────────
import type { Subject, StudySubject, SubjectId, UserProfile, AppSettings, BadgeId } from "../types";

// ── Design tokens ─────────────────────────────────────────────────────────────
export const T = {
  blue:       "#2563EB",
  green:      "#10B981",
  amber:      "#F59E0B",
  indigo:     "#4F46E5",
  violet:     "#7C3AED",
  pink:       "#EC4899",
  emerald:    "#059669",
  rose:       "#E11D48",
  bg:         "#F8FAFC",
  text:       "#111827",
  cardShadow: "0 2px 20px rgba(17,24,39,0.06), 0 1px 4px rgba(17,24,39,0.04)",
  heroShadow: "0 8px 40px rgba(37,99,235,0.22)",
  glassCard:  "bg-white/75 backdrop-blur-xl border border-white/90",
  heroGrad:   "linear-gradient(148deg, #1a40c4 0%, #2563EB 42%, #4f46e5 100%)",
  font:       "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif:      "'Instrument Serif', Georgia, serif",
  mono:       "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
} as const;

// ── Subject color map ─────────────────────────────────────────────────────────
export const SUBJECT_COLORS: Record<SubjectId, { color: string; bg: string }> = {
  math: { color: T.blue,   bg: "#EFF6FF" },
  en:   { color: T.violet, bg: "#EDE9FE" },
  sci:  { color: T.green,  bg: "#D1FAE5" },
  hist: { color: T.amber,  bg: "#FEF3C7" },
  eth:  { color: T.pink,   bg: "#FCE7F3" },
};

// Korean name → SubjectId map (for chip pickers)
export const SUBJECT_NAME_MAP: Record<string, SubjectId> = {
  수학: "math", 영어: "en", 과학: "sci", 역사: "hist", 도덕: "eth",
};

export const CHIP_COLORS: Record<string, { color: string; bg: string }> = {
  수학: SUBJECT_COLORS.math,
  영어: SUBJECT_COLORS.en,
  과학: SUBJECT_COLORS.sci,
  역사: SUBJECT_COLORS.hist,
  도덕: SUBJECT_COLORS.eth,
};

// ── Initial subjects (today's mission list) ───────────────────────────────────
export const INITIAL_SUBJECTS: Subject[] = [
  { id:"math", name:"수학",   sub:"Math",    goal:"이차방정식 3단원 복습",  time:25, difficulty:3, ...SUBJECT_COLORS.math,   done:false },
  { id:"en",   name:"영어",   sub:"English", goal:"독해 지문 2개 풀기",     time:20, difficulty:2, ...SUBJECT_COLORS.en,     done:false },
  { id:"sci",  name:"과학",   sub:"Science", goal:"세포 분열 핵심 정리",    time:30, difficulty:3, ...SUBJECT_COLORS.sci,    done:false },
  { id:"hist", name:"한국사", sub:"History", goal:"조선시대 요약노트 작성", time:20, difficulty:2, ...SUBJECT_COLORS.hist,   done:false },
  { id:"eth",  name:"도덕",   sub:"Ethics",  goal:"4단원 읽고 핵심 정리",   time:15, difficulty:1, ...SUBJECT_COLORS.eth,    done:false },
];

// ── Study subject pool (subject select screen) ────────────────────────────────
export const STUDY_SUBJECTS: StudySubject[] = [
  { id:"math", name:"수학", ...SUBJECT_COLORS.math,   time:25, difficulty:3, exp:30, mission:"도형 문제 5개 풀기",    recommended:true },
  { id:"en",   name:"영어", ...SUBJECT_COLORS.en,     time:20, difficulty:2, exp:20, mission:"독해 지문 2개 풀기" },
  { id:"sci",  name:"과학", ...SUBJECT_COLORS.sci,    time:30, difficulty:3, exp:30, mission:"세포 분열 정리노트" },
  { id:"hist", name:"역사", ...SUBJECT_COLORS.hist,   time:20, difficulty:2, exp:20, mission:"조선시대 핵심 요약" },
  { id:"eth",  name:"도덕", ...SUBJECT_COLORS.eth,    time:15, difficulty:1, exp:15, mission:"4단원 읽고 핵심 정리" },
];

// ── EXP & Level thresholds ────────────────────────────────────────────────────
export const LEVEL_XP: Record<number, number> = {
  1: 200, 2: 400, 3: 700, 4: 1000, 5: 1400,
  6: 1900, 7: 2500, 8: 3200, 9: 4000, 10: 5000,
};

export const LEVEL_NAMES: Record<number, string> = {
  1: "씨앗", 2: "새싹", 3: "잎사귀", 4: "새싹나무",
  5: "작은나무", 6: "큰나무", 7: "꽃나무",
  8: "열매나무", 9: "고목", 10: "전설나무",
};

export const getLevelName = (level: number) =>
  LEVEL_NAMES[level] ?? `Lv.${level}`;

// ── Badge definitions ─────────────────────────────────────────────────────────
export const BADGE_META: Record<BadgeId, { label: string; icon: string; desc: string }> = {
  first_study:  { label: "첫 공부",    icon: "🏅", desc: "첫 학습 완료" },
  streak_7:     { label: "7일 연속",   icon: "🔥", desc: "7일 스트릭" },
  streak_14:    { label: "14일 연속",  icon: "🔥", desc: "14일 스트릭" },
  streak_30:    { label: "30일 연속",  icon: "🔥", desc: "30일 스트릭" },
  english_10:   { label: "영어 챌린지",icon: "📚", desc: "영어 10회 완료" },
  level_5:      { label: "Lv.5 달성",  icon: "⭐", desc: "레벨 5 달성" },
  level_10:     { label: "마스터",     icon: "👑", desc: "최고 레벨 달성" },
  graduate_42:  { label: "42일 졸업",  icon: "🎓", desc: "42일 완주" },
};

// ── Default profile ───────────────────────────────────────────────────────────
export const DEFAULT_PROFILE: UserProfile = {
  childName: "우현",
  level: 4,
  xp: 3240,
  xpToNextLevel: 5000,
  streak: 7,
  maxStreak: 7,
  totalMissionsDone: 58,
  startDate: "2026-06-18",
  lastStudyDate: "2026-07-05",
  badges: ["first_study", "streak_7", "english_10"],
};

// ── Default settings ──────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  pushAlerts: true,
  momAlerts: true,
  streakAlerts: true,
  rewardAlerts: true,
  sound: true,
  vibration: true,
  darkMode: false,
  compactMode: false,
  studyReminderTime: "19:00",
  restDay: "일",
};

// ── 42-day journey milestones ─────────────────────────────────────────────────
export const MILESTONES: Array<{ day: number; label: string; icon: string }> = [
  { day: 7,  label: "첫 선물",  icon: "🎁" },
  { day: 14, label: "배지",     icon: "🏅" },
  { day: 21, label: "나무",     icon: "🌳" },
  { day: 28, label: "EXP",     icon: "⚡" },
  { day: 35, label: "영웅",     icon: "🦸" },
  { day: 42, label: "졸업",     icon: "🎓" },
];

// ── Mom encouragement pool ────────────────────────────────────────────────────
export const MOM_MESSAGES_POOL = [
  "오늘도 화이팅! 엄마는 항상 우현이 편이야. 작은 것부터 시작하면 돼. 사랑해.",
  "완벽하려 하지 말고, 시작만 해도 성공이야.",
  "오늘도 끝까지 해낸 너가 정말 자랑스러워. 결과보다 끝까지 한 것이 더 중요해.",
  "힘들어도 포기하지 않는 우현이가 최고야!",
  "오늘 공부한 만큼 내일의 우현이가 더 성장하고 있어. 사랑해!",
];

// ── Utility: today string ─────────────────────────────────────────────────────
export const todayString = () => new Date().toISOString().slice(0, 10);

export const calcDayNumber = (startDate: string): number => {
  const start = new Date(startDate).getTime();
  const now   = new Date(todayString()).getTime();
  return Math.floor((now - start) / 86_400_000) + 1;
};
