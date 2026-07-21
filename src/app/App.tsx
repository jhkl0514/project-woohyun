import { useState, useEffect, useRef } from "react";
import { resolveFamilyId, getShareUrl, fetchFamilyData, saveFamilyData, supabaseEnabled } from "../lib/familySync";
import type { LucideIcon } from "lucide-react";
import {
  Bell, Settings, User, Home, Target, TrendingUp,
  BookOpen, Flame, Star, ChevronRight, Clock,
  Zap, Heart, Calendar, Award, Check, Play,
  Trophy, Globe, Landmark, ArrowRight, Camera,
  Sun, ChevronLeft, Gift, Pause, RefreshCw,
  CheckCircle2, Loader2,
} from "lucide-react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const T = {
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
  mono:       "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
};

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Subject = {
  id: string; name: string; sub: string; icon: LucideIcon;
  goal: string; time: number; difficulty: 1 | 2 | 3;
  color: string; bg: string; done: boolean;
};

type StudySubject = {
  id: string; name: string; icon: LucideIcon;
  color: string; bg: string;
  time: number; difficulty: 1 | 2 | 3; exp: number;
  mission: string; recommended?: boolean; done: boolean;
};

type Screen = "home" | "briefing" | "select" | "mission" | "focus" | "photo" | "reward" | "reflection" | "daily-review" | "tree-evolution" | "growth-dashboard" | "calendar" | "mom-dashboard" | "notifications" | "settings" | "admin" | "goal-setting" | "schedule-list" | "weekly-plan" | "study-log";

type ReviewType = "review" | "preview"; // 복습 | 예습

// 과목 마스터 데이터 — 기말고사 점수, 주간 목표 횟수, 미션 후보 목록까지 한 곳에서 관리
type ExamSubject = {
  id: string; name: string; sub: string; icon: LucideIcon;
  color: string; bg: string; examScore: number;
  reviewType: ReviewType; weeklyTarget: number;
  time: number; difficulty: 1 | 2 | 3; exp: number;
  missionPool: string[];
};

// ─── DATA ─────────────────────────────────────────────────────────────────────

// 기말고사 성적표 기반 과목 마스터 — 목표점수 화면과 주간 학습 계획이 모두 이 데이터를 공유
const EXAM_SUBJECTS: ExamSubject[] = [
  { id:"kor",  name:"국어",   sub:"Korean",  icon:BookOpen,  color:T.indigo, bg:"#EEF2FF", examScore:96,
    reviewType:"review",  weeklyTarget:2, time:20, difficulty:2, exp:200,
    missionPool:["1학기 문학 작품 다시 읽기", "1학기 문법 개념 정리", "1학기 독해 지문 오답노트"] },
  { id:"math", name:"수학",   sub:"Math",    icon:Target,    color:T.blue,   bg:"#EFF6FF", examScore:31,
    reviewType:"review",  weeklyTarget:5, time:25, difficulty:3, exp:300,
    missionPool:["1학기 이차방정식 복습", "1학기 도형 단원 오답노트 정리", "1학기 함수 그래프 복습", "도형 문제 5개 풀기", "1학기 연립방정식 복습"] },
  { id:"en",   name:"영어",   sub:"English", icon:Globe,     color:T.violet, bg:"#EDE9FE", examScore:80,
    reviewType:"preview", weeklyTarget:3, time:20, difficulty:2, exp:200,
    missionPool:["2학기 1과 단어 예습", "2학기 1과 대화문 미리 읽기", "독해 지문 2개 풀기"] },
  { id:"sci",  name:"과학",   sub:"Science", icon:Zap,       color:T.green,  bg:"#D1FAE5", examScore:53,
    reviewType:"review",  weeklyTarget:3, time:30, difficulty:3, exp:300,
    missionPool:["1학기 세포 분열 정리노트", "1학기 원소기호 복습", "1학기 실험 단원 오답노트"] },
  { id:"hist", name:"역사",   sub:"History", icon:Landmark,  color:T.amber,  bg:"#FEF3C7", examScore:51,
    reviewType:"review",  weeklyTarget:3, time:20, difficulty:2, exp:200,
    missionPool:["1학기 조선시대 핵심 요약", "1학기 근현대사 연표 정리", "1학기 인물사 복습"] },
  { id:"eth",  name:"도덕",   sub:"Ethics",  icon:Heart,     color:T.pink,   bg:"#FCE7F3", examScore:73,
    reviewType:"preview", weeklyTarget:2, time:15, difficulty:1, exp:150,
    missionPool:["2학기 1단원 미리 읽기", "2학기 핵심 개념 예습"] },
];

const DAILY_SUBJECT_IDS: string[] = EXAM_SUBJECTS.map(s => s.id);

// ─── STUDY SCHEDULE (방학 공부 계획: 7/21 시작 ~ 10/2 중간고사) ─────────────────
// 토·일, 공휴일은 제외하고 평일에만 공부일을 배정. 쉬는 날은 보충학습용으로 남겨둔다.

type DayKind = "study" | "weekend" | "holiday";

type ScheduleDay = {
  date: string;      // "YYYY-MM-DD"
  kind: DayKind;
  label?: string;     // 공휴일 이름
  dow: number;        // 0=일 ... 6=토
};

const STUDY_START_DATE  = "2026-07-21";  // 방학 다음날부터 공부 시작
const MIDTERM_EXAM_DATE = "2026-10-02";  // 중간고사

// 2026년 7/21~10/2 사이 공휴일(대체공휴일 포함) — 필요 시 이 목록만 수정하면 됨
const KR_HOLIDAYS: Record<string, string> = {
  "2026-08-15": "광복절",
  "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
};

// ── 날짜 유틸 (문자열 "YYYY-MM-DD" 기준) ────────────────────────────────────────
function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysStr(s: string, n: number): string {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}
/** to가 from보다 며칠 뒤인지 (음수면 과거) */
function diffDaysStr(from: string, to: string): number {
  return Math.round((parseYMD(to).getTime() - parseYMD(from).getTime()) / 86_400_000);
}
function isWeekendStr(s: string): boolean {
  const w = parseYMD(s).getDay();
  return w === 0 || w === 6;
}

function buildSchedule(startDate: string, endDate: string): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  let cur = startDate;
  while (diffDaysStr(cur, endDate) >= 0) {
    const dow     = parseYMD(cur).getDay();
    const weekend = dow === 0 || dow === 6;
    const holiday = KR_HOLIDAYS[cur];
    out.push({ date: cur, kind: holiday ? "holiday" : weekend ? "weekend" : "study", label: holiday, dow });
    cur = addDaysStr(cur, 1);
  }
  return out;
}

// 시작일~중간고사까지 전체 일정 — 값이 고정 문자열이라 모듈 로드 시 한 번만 계산
const FULL_SCHEDULE: ScheduleDay[] = buildSchedule(STUDY_START_DATE, MIDTERM_EXAM_DATE);

/** 기준 날짜가 속한 주(월~일) 범위 */
function getWeekRange(dateStr: string): { start: string; end: string } {
  const dow = parseYMD(dateStr).getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const start = addDaysStr(dateStr, mondayOffset);
  return { start, end: addDaysStr(start, 6) };
}

// ─── 일별 학습 계획 (DAY PLAN) ───────────────────────────────────────────────
// 하루하루 어떤 과목을 할지 아이가 직접 체크한다 — 체크는 그 날짜에 바로 반영되고,
// 홈 화면의 "오늘의 미션"은 오늘 날짜에 체크된 과목을 그대로 보여준다(즉시 반영,
// 별도의 저장/등록 버튼이 필요 없음). 기말고사 점수 기준 추천 과목이 기본값으로
// 미리 체크되어 있고, 아이는 이 화면에서 이번 주 모든 공부일을 한눈에 보고
// 날짜별로 자유롭게 바꿀 수 있다.

type DayPlanOverrides = Record<string, string[]>; // key: date(YYYY-MM-DD) → 체크된 subjectId 목록

/**
 * 특정 날짜의 기본 추천 과목 3개 — 그 주의 공부일 순번과 과목 가중치(weeklyTarget)를
 * 이용한 결정적 로테이션. 수학은 매일 우선 포함, 나머지 2자리는 부족도가 큰 과목부터
 * 요일 순번에 맞춰 순환 배정한다. 오직 날짜만으로 계산되는 순수 함수라 다른 날짜의
 * 체크 여부와 무관하게 항상 같은 결과가 나온다.
 */
function getDefaultDaySubjects(date: string): string[] {
  const { start } = getWeekRange(date);
  const studyDaysInWeek = FULL_SCHEDULE.filter(
    d => d.kind === "study" && diffDaysStr(start, d.date) >= 0 && diffDaysStr(d.date, addDaysStr(start, 6)) >= 0
  );
  const dayIdx = studyDaysInWeek.findIndex(d => d.date === date);
  if (dayIdx === -1) return [];

  const primary = EXAM_SUBJECTS.reduce((a, b) => (a.weeklyTarget >= b.weeklyTarget ? a : b)); // 수학
  const rest = EXAM_SUBJECTS.filter(s => s.id !== primary.id)
    .slice()
    .sort((a, b) => b.weeklyTarget - a.weeklyTarget); // 부족도(가중치) 높은 순

  const picks = [primary.id];
  for (let slot = 0; slot < 2 && rest.length > 0; slot++) {
    const pick = rest[(dayIdx * 2 + slot) % rest.length];
    if (!picks.includes(pick.id)) picks.push(pick.id);
  }
  // 중복으로 자리가 비면 다음 후보로 채움
  let cursor = 0;
  while (picks.length < 3 && cursor < rest.length) {
    const candidate = rest[cursor];
    if (!picks.includes(candidate.id)) picks.push(candidate.id);
    cursor++;
  }
  return picks;
}

/** 아이가 그 날짜를 직접 건드렸으면 그 값을, 아니면 기본 추천값을 쓴다 */
function getCheckedSubjectIds(date: string, dayPlans: DayPlanOverrides): string[] {
  return dayPlans[date] ?? getDefaultDaySubjects(date);
}

/** weekStart부터 upToDate(포함)까지, 그 주 안에서 이 과목을 몇 번 완료했는지 */
function countSubjectDoneUpTo(subjectId: string, weekStart: string, upToDate: string, history: Record<string, string[]>): number {
  let count = 0;
  let cur = weekStart;
  while (diffDaysStr(cur, upToDate) >= 0) {
    if ((history[cur] ?? []).includes(subjectId)) count++;
    cur = addDaysStr(cur, 1);
  }
  return count;
}

/** 그 날짜·과목에 보여줄 구체적인 미션 텍스트 — 전체 일정 안에서의 날짜 순번으로 후보를 순환 */
function pickMissionText(date: string, subjectId: string): string {
  const s = EXAM_SUBJECTS.find(x => x.id === subjectId);
  if (!s) return "";
  const dayIdx = Math.max(FULL_SCHEDULE.findIndex(d => d.date === date), 0);
  return s.missionPool[dayIdx % s.missionPool.length];
}

/**
 * 기준 날짜(refDate)가 속한 주에서, 그 주에 체크된 과목별 횟수 대비 아직
 * 못 채운 횟수 — 주말/쉬는 날의 "보충학습" 대상.
 */
function getWeeklyShortfall(
  history: Record<string, string[]>, refDate: string, dayPlans: DayPlanOverrides,
): Array<{ subjectId: string; missing: number }> {
  const { start } = getWeekRange(refDate);
  const weekEnd = addDaysStr(start, 6);
  if (diffDaysStr(start, refDate) < 0) return [];
  const hadStudyDay = FULL_SCHEDULE.some(d => d.kind === "study" && diffDaysStr(start, d.date) >= 0 && diffDaysStr(d.date, refDate) <= 0);
  if (!hadStudyDay) return [];

  const target: Record<string, number> = {};
  let cur = start;
  while (diffDaysStr(cur, weekEnd) >= 0) {
    getCheckedSubjectIds(cur, dayPlans).forEach(id => { target[id] = (target[id] ?? 0) + 1; });
    cur = addDaysStr(cur, 1);
  }

  return Object.entries(target)
    .map(([subjectId, need]) => ({ subjectId, missing: Math.max(need - countSubjectDoneUpTo(subjectId, start, refDate, history), 0) }))
    .filter(x => x.missing > 0);
}

/** 오늘 체크된 과목들을 Subject[] 형태로 만들어 홈 화면 카드에 그대로 넣을 수 있게 한다 */
function buildTodaySubjects(date: string, dayPlans: DayPlanOverrides, history: Record<string, string[]>): Subject[] {
  const ids = getCheckedSubjectIds(date, dayPlans);
  const doneIds = new Set(history[date] ?? []);
  return ids.map(id => {
    const s = EXAM_SUBJECTS.find(x => x.id === id)!;
    return {
      id: s.id, name: s.name, sub: s.sub, icon: s.icon,
      goal: pickMissionText(date, id),
      time: s.time, difficulty: s.difficulty, color: s.color, bg: s.bg,
      done: doneIds.has(id),
    };
  });
}

/** 과목 선택 화면(StudySubjectCard)에 넣을 오늘의 후보 목록 — 가장 부족한 과목에 추천 표시 */
function buildTodayStudySubjects(date: string, dayPlans: DayPlanOverrides, history: Record<string, string[]>): StudySubject[] {
  const ids = getCheckedSubjectIds(date, dayPlans);
  const doneIds = new Set(history[date] ?? []);
  const shortfall = getWeeklyShortfall(history, date, dayPlans);
  const mostUrgent = [...shortfall].sort((a, b) => b.missing - a.missing)[0]?.subjectId;
  return ids.map(id => {
    const s = EXAM_SUBJECTS.find(x => x.id === id)!;
    return {
      id: s.id, name: s.name, icon: s.icon, color: s.color, bg: s.bg,
      time: s.time, difficulty: s.difficulty, exp: s.exp,
      mission: pickMissionText(date, id),
      recommended: id === mostUrgent && !doneIds.has(id),
      done: doneIds.has(id),
    };
  });
}

// ─── 레벨 & 배지 (실제 학습 기록 기반) ──────────────────────────────────────────
// XP를 모으면 레벨이 오르고, 나무가 자라요. 배지는 우현이의 노력을 보여주는 기록.

const LEVEL_XP_TABLE   = [0, 2000, 4500, 7500, 11000, 15000, 20000, 26000, 33000, 41000, 50000];
const LEVEL_TREE_NAMES = ["씨앗","새싹","잎사귀","어린나무","작은나무","푸른나무","큰나무","꽃나무","열매나무","고목"];

function getLevelInfo(xp: number) {
  let level = 1;
  while (level < LEVEL_TREE_NAMES.length && xp >= LEVEL_XP_TABLE[level]) level++;
  const floor    = LEVEL_XP_TABLE[level - 1];
  const ceilRaw  = LEVEL_XP_TABLE[level];
  const isMax    = ceilRaw === undefined;
  const ceilv    = ceilRaw ?? floor;
  return {
    level,
    name: LEVEL_TREE_NAMES[level - 1],
    xpIntoLevel: xp - floor,
    xpForLevel:  isMax ? 0 : ceilv - floor,
    xpToNext:    isMax ? 0 : Math.max(ceilv - xp, 0),
    pct: isMax ? 100 : Math.round(((xp - floor) / (ceilv - floor)) * 100),
    isMax,
  };
}

type BadgeCtx = { exp:number; streak:number; history:Record<string,string[]>; dayPlans:DayPlanOverrides };
type BadgeDef = { id:string; label:string; icon:string; desc:string; check:(ctx:BadgeCtx)=>boolean };

const BADGE_DEFS: BadgeDef[] = [
  { id:"first",    label:"첫 시작",     icon:"🏅", desc:"미션을 처음 완료했어요",
    check: ctx => Object.values(ctx.history).some(list => list.length > 0) },
  { id:"perfect",  label:"완벽한 하루", icon:"🌟", desc:"오늘 배정된 과목을 모두 끝냈어요",
    check: ctx => Object.entries(ctx.history).some(([date, list]) => {
      const assigned = getCheckedSubjectIds(date, ctx.dayPlans);
      return assigned.length > 0 && list.length >= assigned.length;
    }) },
  { id:"streak7",  label:"7일 연속",    icon:"🔥", desc:"7일 연속 공부했어요",
    check: ctx => ctx.streak >= 7 },
  { id:"streak14", label:"14일 연속",   icon:"🔥", desc:"14일 연속 공부했어요",
    check: ctx => ctx.streak >= 14 },
  { id:"catchup",  label:"약속 지킴이", icon:"🧡", desc:"쉬는 날 보충학습을 완료했어요",
    check: ctx => FULL_SCHEDULE.some(d => d.kind !== "study" && (ctx.history[d.date]?.length ?? 0) > 0) },
  { id:"lv5",      label:"쑥쑥 성장",   icon:"🌳", desc:"나무가 크게 자랐어요 (Lv.5)",
    check: ctx => getLevelInfo(ctx.exp).level >= 5 },
];

function getBadgeStatus(ctx: BadgeCtx) {
  return BADGE_DEFS.map(b => ({ ...b, unlocked: b.check(ctx) }));
}

/** 이번 주(월~일) 공부일 진행 상태 — 홈 화면 · 성장 화면 공통 */
function getCurrentWeekStatus(history: Record<string, string[]>, todayStr: string, dayPlans: DayPlanOverrides = {}) {
  const { start } = getWeekRange(todayStr);
  return Array.from({ length: 7 }, (_, i) => {
    const date   = addDaysStr(start, i);
    const sched  = FULL_SCHEDULE.find(d => d.date === date);
    const isRest = !sched || sched.kind !== "study";
    const planned = isRest ? [] : getCheckedSubjectIds(date, dayPlans);
    const doneCount = (history[date] ?? []).filter(id => planned.includes(id)).length;
    return {
      day: "일월화수목금토"[parseYMD(date).getDay()],
      date,
      isToday:  date === todayStr,
      isFuture: diffDaysStr(todayStr, date) > 0,
      isRest,
      total: planned.length,
      doneCount,
      done:     planned.length > 0 && doneCount >= planned.length,
      partial:  doneCount > 0 && doneCount < planned.length,
    };
  });
}

/** 그 주(월~일)에 공부일이 있고, 배정된 과목을 전부 끝냈으면 "완료한 주" */
function isWeekFullyComplete(weekStart: string, history: Record<string, string[]>, dayPlans: DayPlanOverrides): boolean {
  const weekEnd = addDaysStr(weekStart, 6);
  const studyDays = FULL_SCHEDULE.filter(d => d.kind === "study" && diffDaysStr(weekStart, d.date) >= 0 && diffDaysStr(d.date, weekEnd) >= 0);
  if (studyDays.length === 0) return false;
  return studyDays.every(d => {
    const planned = getCheckedSubjectIds(d.date, dayPlans);
    return planned.length > 0 && (history[d.date] ?? []).filter(id => planned.includes(id)).length >= planned.length;
  });
}

/** 오늘이 속한 주의 "직전"까지, 몇 주 연속으로 완료했는지 — 이번 주 실적은 포함하지 않음(다음 주부터 배수 적용) */
function getConsecutiveCompleteWeeks(history: Record<string, string[]>, todayStr: string, dayPlans: DayPlanOverrides): number {
  const { start: currentWeekStart } = getWeekRange(todayStr);
  let cursor = addDaysStr(currentWeekStart, -7);
  let streak = 0;
  while (isWeekFullyComplete(cursor, history, dayPlans)) {
    streak++;
    cursor = addDaysStr(cursor, -7);
  }
  return streak;
}

/** 연속 완료 주 수 → 다음 주에 적용할 EXP 배수 */
function getExpMultiplier(consecutiveWeeks: number): number {
  if (consecutiveWeeks >= 8) return 5;
  if (consecutiveWeeks >= 6) return 4;
  if (consecutiveWeeks >= 4) return 3;
  if (consecutiveWeeks >= 2) return 2;
  return 1;
}

const JOURNEY_STEPS: Array<{ num: string; label: string; icon: LucideIcon; color: string; bg: string }> = [
  { num:"01", label:"준비",    icon:Sun,        color:T.blue,    bg:"#EFF6FF" },
  { num:"02", label:"공부",    icon:BookOpen,   color:T.indigo,  bg:"#EDE9FE" },
  { num:"03", label:"사진 인증", icon:Camera,  color:T.violet,  bg:"#F3E8FF" },
  { num:"04", label:"엄마 확인", icon:Heart,   color:T.rose,    bg:"#FFF1F2" },
  { num:"05", label:"보상",    icon:Gift,       color:T.amber,   bg:"#FEF3C7" },
  { num:"06", label:"완료",    icon:Trophy,     color:T.emerald, bg:"#D1FAE5" },
];

// Subject chip colors (shared between study flow + reflection)
const CHIP_COLORS: Record<string, { color: string; bg: string }> = {
  "수학": { color:T.blue,   bg:"#EFF6FF" },
  "영어": { color:T.violet, bg:"#EDE9FE" },
  "과학": { color:T.green,  bg:"#D1FAE5" },
  "역사": { color:T.amber,  bg:"#FEF3C7" },
  "도덕": { color:T.pink,   bg:"#FCE7F3" },
};

// Mini confetti — contained inside celebration card
const MINI_CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  id:    i,
  left:  `${(i * 19 + 8) % 90}%`,
  top:   `${(i * 27 + 6) % 78}%`,
  size:  4 + (i * 2) % 5,
  color: ["#FCD34D","#4ADE80","#FB7185","#A78BFA","#60A5FA","#FBBF24","#F97316"][i % 7],
  delay: `${(i * 0.22) % 1.8}s`,
  dur:   `${2 + (i * 0.3) % 1.5}s`,
}));

// Static confetti data — generated once to avoid re-render flicker
const CONFETTI = Array.from({ length: 52 }, (_, i) => ({
  id:       i,
  left:     `${(i * 13 + 5) % 98}%`,
  size:     5 + (i * 3) % 8,
  color:    ["#2563EB","#10B981","#F59E0B","#EC4899","#6366F1","#22C55E","#FBBF24","#FB7185","#A78BFA"][i % 9],
  delay:    `${(i * 0.11) % 2.8}s`,
  duration: `${2.2 + (i * 0.17) % 2}s`,
  skew:     i % 2 === 0 ? "skewX(15deg)" : "skewY(10deg)",
}));

// ─── ANIMATION STYLES ─────────────────────────────────────────────────────────

const ANIMATION_STYLES = `
  @keyframes arm-wave {
    0%,100%{transform:rotate(0deg);}22%{transform:rotate(-28deg);}65%{transform:rotate(22deg);}88%{transform:rotate(-8deg);}
  }
  .waving{animation:arm-wave 0.78s ease-in-out;transform-box:fill-box;transform-origin:center bottom;}

  @keyframes speech-bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}
  .speech-bounce{animation:speech-bounce 2.6s ease-in-out infinite;}

  @keyframes float-soft{0%,100%{transform:translateY(0);}50%{transform:translateY(-7px);}}
  .float-soft{animation:float-soft 3.4s ease-in-out infinite;}

  @keyframes pulse-dot{0%,100%{opacity:0.25;transform:scale(1);}50%{opacity:0.7;transform:scale(1.3);}}
  .pulse-dot{animation:pulse-dot 1.6s ease-in-out infinite;}

  @keyframes confetti-fall{
    0%  {transform:translateY(-10px) rotate(0deg);opacity:1;}
    85% {opacity:0.6;}
    100%{transform:translateY(105vh) rotate(680deg);opacity:0;}
  }
  .confetti-piece{animation:confetti-fall var(--dur) var(--delay) linear infinite;}

  @keyframes exp-pop{
    0%  {transform:scale(0.4) translateY(16px);opacity:0;}
    65% {transform:scale(1.18) translateY(-4px);opacity:1;}
    100%{transform:scale(1) translateY(0);opacity:1;}
  }
  .exp-pop{animation:exp-pop 0.55s cubic-bezier(0.175,0.885,0.32,1.275) forwards;}

  @keyframes leaf-grow{
    0%  {transform:scale(0) rotate(-20deg);opacity:0;}
    70% {transform:scale(1.1) rotate(4deg);opacity:1;}
    100%{transform:scale(1) rotate(0deg);opacity:1;}
  }
  .leaf-grow{animation:leaf-grow 0.6s 0.3s cubic-bezier(0.175,0.885,0.32,1.275) both;}

  @keyframes focus-pulse-ring{
    0%,100%{opacity:0.18;transform:scale(1);}
    50%{opacity:0.36;transform:scale(1.04);}
  }
  .focus-pulse-ring{animation:focus-pulse-ring 3s ease-in-out infinite;}

  @keyframes spin-slow{to{transform:rotate(360deg);}}
  .spin-slow{animation:spin-slow 1.2s linear infinite;}

  @keyframes check-in{
    0%  {transform:scale(0);opacity:0;}
    60% {transform:scale(1.2);opacity:1;}
    100%{transform:scale(1);opacity:1;}
  }
  .check-in{animation:check-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards;}

  .cta-btn{transition:box-shadow 0.2s ease,transform 0.1s ease;}
  .cta-btn:hover{box-shadow:0 20px 64px rgba(37,99,235,0.6),0 8px 28px rgba(79,70,229,0.35) !important;}
  .cta-btn:active{transform:scale(0.98) !important;}

  .subject-card{transition:transform 0.18s ease,box-shadow 0.18s ease,border-color 0.15s ease;}
  .subject-card:hover{transform:translateY(-2px);}

  .step-card{transition:transform 0.18s ease;}
  .step-card:hover{transform:translateY(-2px);}

  @keyframes mini-float{
    0%,100%{transform:translateY(0) rotate(0deg);opacity:0.55;}
    50%{transform:translateY(-9px) rotate(14deg);opacity:0.9;}
  }
  .mini-float{animation:mini-float var(--dur,2s) var(--delay,0s) ease-in-out infinite;}

  @keyframes emotion-pop{
    0%{transform:scale(1);}
    40%{transform:scale(1.18);}
    65%{transform:scale(0.94);}
    100%{transform:scale(1.06);}
  }
  .emotion-pop{animation:emotion-pop 0.38s cubic-bezier(0.175,0.885,0.32,1.275) forwards;}

  @keyframes fade-in-up{
    0%{opacity:0;transform:translateY(14px);}
    100%{opacity:1;transform:translateY(0);}
  }
  .fade-in-up{animation:fade-in-up 0.45s ease forwards;}

  @keyframes shimmer{
    0%{background-position:-200% center;}
    100%{background-position:200% center;}
  }
  .shimmer-text{
    background:linear-gradient(90deg,#111827 30%,#6366F1 50%,#111827 70%);
    background-size:200% auto;
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
    animation:shimmer 3.5s linear infinite;
  }

  .textarea-styled{
    background:#F8FAFC;
    border:2px solid rgba(17,24,39,0.08);
    transition:border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .textarea-styled:focus{
    border-color:rgba(37,99,235,0.35);
    box-shadow:0 0 0 4px rgba(37,99,235,0.06);
    outline:none;
  }

  .chip-btn{transition:transform 0.15s ease,box-shadow 0.15s ease,background-color 0.15s ease,color 0.15s ease;}
  .chip-btn:hover{transform:translateY(-1px);}
  .chip-btn:active{transform:scale(0.96);}

  .emotion-btn{transition:transform 0.18s ease,background-color 0.18s ease,box-shadow 0.18s ease;}
  .emotion-btn:hover{transform:translateY(-2px);}

  .tap-scale{transition:transform 0.12s ease;}
  .tap-scale:active{transform:scale(0.96);}

  /* Pretendard as base font everywhere */
  body, #root, .font-sans {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  }
  /* Mono contexts */
  .font-mono, [class*="font-mono"] {
    font-family: 'SF Mono','JetBrains Mono',ui-monospace,monospace;
  }
  /* Card & section text baseline */
  h1,h2,h3,h4,h5,h6,p,span,button,a,li,label {
    font-family: inherit;
  }

  @keyframes tree-sway{
    0%,100%{transform:rotate(0deg);}
    28%{transform:rotate(0.9deg);}
    72%{transform:rotate(-0.9deg);}
  }
  .tree-sway{animation:tree-sway 5.5s ease-in-out infinite;transform-origin:bottom center;}

  @keyframes particle-rise{
    0%  {transform:translateY(0) scale(1);opacity:0.72;}
    100%{transform:translateY(-68px) scale(0.35);opacity:0;}
  }
  .particle-rise{animation:particle-rise var(--dur,3s) var(--delay,0s) ease-in infinite;}

  @keyframes bar-reveal{
    from{transform:scaleY(0);}
    to  {transform:scaleY(1);}
  }
  .bar-reveal{
    animation:bar-reveal 0.55s var(--delay,0s) cubic-bezier(0.34,1.1,0.64,1) both;
    transform-origin:bottom center;
  }
`;

// ─── MASCOTS ──────────────────────────────────────────────────────────────────

function SeedCharacter({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 190" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <ellipse cx="80" cy="168" rx="52" ry="13" fill="#166534" fillOpacity="0.12"/>
      <path d="M35 98 Q18 82 12 65" stroke="#22C55E" strokeWidth="10" strokeLinecap="round"/>
      <circle cx="12" cy="65" r="10" fill="#22C55E"/>
      <path d="M125 98 Q142 82 148 65" stroke="#22C55E" strokeWidth="10" strokeLinecap="round"/>
      <circle cx="148" cy="65" r="10" fill="#22C55E"/>
      <path d="M148 52 L150.8 59.8 L159 59.8 L152.6 64.5 L155.4 72.3 L148 67.6 L140.6 72.3 L143.4 64.5 L137 59.8 L145.2 59.8Z" fill="#F59E0B"/>
      <ellipse cx="80" cy="116" rx="46" ry="56" fill="#22C55E"/>
      <ellipse cx="80" cy="111" rx="40" ry="50" fill="#4ADE80" fillOpacity="0.28"/>
      <circle cx="64" cy="103" r="11" fill="white"/><circle cx="96" cy="103" r="11" fill="white"/>
      <circle cx="66.5" cy="105.5" r="6.5" fill="#1E3A8A"/><circle cx="98.5" cy="105.5" r="6.5" fill="#1E3A8A"/>
      <circle cx="69" cy="103" r="2.4" fill="white"/><circle cx="101" cy="103" r="2.4" fill="white"/>
      <path d="M66 122 Q80 136 94 122" stroke="white" strokeWidth="3.8" fill="none" strokeLinecap="round"/>
      <ellipse cx="50" cy="115" rx="9" ry="6" fill="#FCA5A5" fillOpacity="0.52"/>
      <ellipse cx="110" cy="115" rx="9" ry="6" fill="#FCA5A5" fillOpacity="0.52"/>
      <rect x="77" y="55" width="6" height="20" rx="3" fill="#166534"/>
      <path d="M80 63 C65 47 40 41 24 22 C43 32 65 46 80 63Z" fill="#16A34A"/>
      <path d="M80 63 C95 45 120 38 136 18 C117 28 95 42 80 63Z" fill="#15803D"/>
    </svg>
  );
}

function SeedCharacterBriefing({ waving = false, className = "" }: { waving?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 180 210" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <ellipse cx="85" cy="190" rx="52" ry="12" fill="#166534" fillOpacity="0.10"/>
      <g className={waving ? "waving" : ""}>
        <path d="M35 100 Q17 84 11 66" stroke="#22C55E" strokeWidth="10" strokeLinecap="round"/>
        <circle cx="11" cy="66" r="10" fill="#22C55E"/>
      </g>
      <path d="M130 108 Q148 132 154 158" stroke="#22C55E" strokeWidth="10" strokeLinecap="round"/>
      <circle cx="154" cy="158" r="10" fill="#22C55E"/>
      <circle cx="164" cy="168" r="4.5" className="pulse-dot" fill="#22C55E" fillOpacity="0.38"/>
      <circle cx="172" cy="177" r="3" className="pulse-dot" fill="#22C55E" fillOpacity="0.22" style={{ animationDelay:"0.3s" }}/>
      <ellipse cx="83" cy="118" rx="48" ry="56" fill="#22C55E"/>
      <ellipse cx="83" cy="113" rx="42" ry="50" fill="#4ADE80" fillOpacity="0.26"/>
      <circle cx="67" cy="104" r="12" fill="white"/><circle cx="100" cy="104" r="12" fill="white"/>
      <circle cx="69.5" cy="106.5" r="7" fill="#1E3A8A"/><circle cx="102.5" cy="106.5" r="7" fill="#1E3A8A"/>
      <circle cx="72" cy="104" r="2.6" fill="white"/><circle cx="105" cy="104" r="2.6" fill="white"/>
      <path d="M68 124 Q83 142 98 124" stroke="white" strokeWidth="4.2" fill="none" strokeLinecap="round"/>
      <ellipse cx="52" cy="117" rx="9" ry="5.5" fill="#FCA5A5" fillOpacity="0.50"/>
      <ellipse cx="116" cy="117" rx="9" ry="5.5" fill="#FCA5A5" fillOpacity="0.50"/>
      <rect x="80" y="56" width="6" height="20" rx="3" fill="#166534"/>
      <path d="M83 64 C68 48 43 42 27 23 C46 33 68 47 83 64Z" fill="#16A34A"/>
      <path d="M83 64 C98 46 123 39 139 19 C120 29 98 43 83 64Z" fill="#15803D"/>
    </svg>
  );
}

/** Both arms raised in celebration */
function SeedCharacterCelebrating({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <ellipse cx="90" cy="182" rx="52" ry="12" fill="#166534" fillOpacity="0.10"/>
      {/* Left arm — raised */}
      <path d="M42 98 Q22 68 16 44" stroke="#22C55E" strokeWidth="10" strokeLinecap="round"/>
      <circle cx="16" cy="44" r="10" fill="#22C55E"/>
      {/* Right arm — raised */}
      <path d="M132 98 Q152 68 158 44" stroke="#22C55E" strokeWidth="10" strokeLinecap="round"/>
      <circle cx="158" cy="44" r="10" fill="#22C55E"/>
      {/* Stars in hands */}
      <path d="M16 31 L18.8 39 L27 39 L20.6 44 L23 52 L16 47 L9 52 L11.4 44 L5 39 L13.2 39Z" fill="#F59E0B"/>
      <path d="M158 31 L160.8 39 L169 39 L162.6 44 L165 52 L158 47 L151 52 L153.4 44 L147 39 L155.2 39Z" fill="#F59E0B"/>
      {/* Sparkles */}
      <circle cx="40" cy="58" r="4.5" fill="#FCD34D" fillOpacity="0.7"/>
      <circle cx="34" cy="40" r="3" fill="#4ADE80" fillOpacity="0.65"/>
      <circle cx="140" cy="52" r="4.5" fill="#FCD34D" fillOpacity="0.7"/>
      <circle cx="148" cy="36" r="3" fill="#4ADE80" fillOpacity="0.65"/>
      <circle cx="90" cy="34" r="4" fill="#FB7185" fillOpacity="0.6"/>
      {/* Body */}
      <ellipse cx="87" cy="120" rx="47" ry="56" fill="#22C55E"/>
      <ellipse cx="87" cy="115" rx="41" ry="50" fill="#4ADE80" fillOpacity="0.28"/>
      {/* Big wide eyes */}
      <circle cx="72" cy="106" r="12" fill="white"/><circle cx="103" cy="106" r="12" fill="white"/>
      <circle cx="74.5" cy="108.5" r="7.5" fill="#1E3A8A"/><circle cx="105.5" cy="108.5" r="7.5" fill="#1E3A8A"/>
      <circle cx="77" cy="106" r="2.8" fill="white"/><circle cx="108" cy="106" r="2.8" fill="white"/>
      {/* Huge smile */}
      <path d="M71 126 Q87 148 103 126" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="57" cy="120" rx="10" ry="6" fill="#FCA5A5" fillOpacity="0.55"/>
      <ellipse cx="118" cy="120" rx="10" ry="6" fill="#FCA5A5" fillOpacity="0.55"/>
      {/* Stem + leaves */}
      <rect x="84" y="58" width="6" height="18" rx="3" fill="#166534"/>
      <path d="M87 66 C72 50 47 44 31 25 C50 35 72 49 87 66Z" fill="#16A34A"/>
      <path d="M87 66 C102 48 127 41 143 21 C124 31 102 45 87 66Z" fill="#15803D"/>
    </svg>
  );
}

function GrowthTree({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 145" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <ellipse cx="60" cy="136" rx="46" ry="9" fill="#D1FAE5"/>
      <rect x="54" y="82" width="12" height="56" rx="6" fill="#92400E"/>
      <rect x="57" y="84" width="4" height="52" rx="2" fill="#B45309" fillOpacity="0.38"/>
      <circle cx="60" cy="70" r="29" fill="#16A34A"/>
      <circle cx="40" cy="82" r="21" fill="#15803D"/>
      <circle cx="80" cy="82" r="21" fill="#166534"/>
      <circle cx="60" cy="52" r="25" fill="#22C55E"/>
      <circle cx="60" cy="47" r="18" fill="#4ADE80" fillOpacity="0.42"/>
      <circle cx="51" cy="43" r="5.5" fill="white" fillOpacity="0.18"/>
      <circle cx="70" cy="57" r="3.5" fill="white" fillOpacity="0.13"/>
      <circle cx="46" cy="63" r="4.5" fill="#F59E0B"/>
      <circle cx="76" cy="59" r="4.5" fill="#F59E0B"/>
      <circle cx="61" cy="74" r="4" fill="#FBBF24"/>
    </svg>
  );
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function TopNav({
  onBack, backLabel = "뒤로", title,
  onNotifications, onSettings, onProfile, onTab, activeTab = 0, unreadCount = 0,
}: {
  onBack?: () => void; backLabel?: string; title?: string;
  onNotifications?: ()=>void; onSettings?: ()=>void; onProfile?: ()=>void;
  onTab?: (i: number) => void; activeTab?: number; unreadCount?: number;
}) {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-white/85 border-b border-black/[0.06]"
      style={{ boxShadow:"0 1px 24px rgba(17,24,39,0.07)", fontFamily:T.font }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 h-[60px] flex items-center gap-3">

        {/* Left: back button or logo */}
        {onBack ? (
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-[#111827]/70 hover:text-[#111827] transition-colors z-10 flex-shrink-0">
            <ChevronLeft className="w-5 h-5"/>
            <span className="text-[13px] font-semibold hidden sm:block">{backLabel}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
              <span className="text-white text-[12px] font-bold">W</span>
            </div>
            <div className="hidden sm:block leading-none">
              <p className="text-[13px] font-bold text-[#111827] tracking-tight">PROJECT WOOHYUN</p>
              <p className="text-[12px] text-[#111827]/55 tracking-tight mt-[2px]"
                style={{ fontFamily:T.mono }}>Midterm-Prep Journey</p>
            </div>
          </div>
        )}

        {/* Centre: tab nav (desktop) or screen title (left-aligned, flex spacer) */}
        <div className="flex-1 min-w-0 flex items-center">
          {!onBack ? (
            <div className="hidden lg:flex items-center gap-1 mx-auto">
              {["홈","미션설정","성장","복습","학습현황"].map((label,i)=>(
                <button key={label}
                  onClick={() => onTab?.(i)}
                  className={`px-4 py-[7px] rounded-xl text-[13px] font-semibold transition-all ${
                    i===activeTab ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#111827]/65 hover:text-[#111827] hover:bg-black/[0.04]"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          ) : title ? (
            <p className="text-[17px] font-extrabold text-[#111827] tracking-tight truncate">{title}</p>
          ) : null}
        </div>

        {/* Right: icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onNotifications}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[#111827]/58 hover:bg-black/[0.04] transition-colors">
            <Bell className="w-[18px] h-[18px]"/>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-[#F59E0B] border-2 border-white"/>
            )}
          </button>
          <button onClick={onSettings}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#111827]/58 hover:bg-black/[0.04] transition-colors">
            <Settings className="w-[18px] h-[18px]"/>
          </button>
          <button onClick={onProfile}
            className="w-9 h-9 rounded-xl flex items-center justify-center ml-0.5"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
            <span className="text-white text-[13px] font-bold">우</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

function Pill({ icon:Icon, iconColor, value, label, filled=false }: {
  icon:LucideIcon; iconColor:string; value:string; label:string; filled?:boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-white/14 backdrop-blur-sm rounded-2xl px-3 py-2 border border-white/14">
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color:iconColor }} fill={filled ? iconColor : "none"}/>
      <span className="text-white font-bold text-sm">{value}</span>
      <span className="text-white/45 text-[13px]">{label}</span>
    </div>
  );
}

const NAV_ITEMS: Array<{ icon:LucideIcon; label:string }> = [
  { icon:Home, label:"홈" }, { icon:Target, label:"미션설정" }, { icon:TrendingUp, label:"성장" },
  { icon:BookOpen, label:"복습" }, { icon:User, label:"학습현황" },
];

function BottomNav({ active, onSelect }: { active:number; onSelect:(i:number)=>void }) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-2xl bg-white/88 border-t border-black/5"
      style={{ paddingBottom:"env(safe-area-inset-bottom)", boxShadow:"0 -4px 28px rgba(17,24,39,0.08)" }}>
      <div className="flex items-center justify-around px-2 py-2">
        {NAV_ITEMS.map(({ icon:Icon, label }, i) => {
          const isActive = i === active;
          return (
            <button key={i} onClick={() => onSelect(i)}
              className="relative flex flex-col items-center gap-1 py-2 px-3 rounded-2xl transition-all"
              style={{ color:isActive ? T.blue : "#4B5563" }}>
              {isActive && (
                <span className="absolute inset-0 rounded-2xl" style={{ backgroundColor:"#EFF6FF", border:"1.5px solid #DBEAFE" }}/>
              )}
              <Icon className="w-5 h-5 relative z-10" strokeWidth={isActive ? 2.5 : 2}/>
              <span className={`text-[12px] relative z-10 ${isActive ? "font-extrabold" : "font-semibold"}`}>{label}</span>
              {isActive && <span className="absolute -bottom-0.5 w-1 h-1 rounded-full z-10" style={{ backgroundColor:T.blue }}/>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── HOME SCREEN COMPONENTS ───────────────────────────────────────────────────

function HeroSection({ completed, total, onBeginDay, exp, streak, dayIndex, totalDays, expMultiplier }: {
  completed:number; total:number; onBeginDay:()=>void; exp:number; streak:number;
  dayIndex:number; totalDays:number; expMultiplier:number;
}) {
  const dayPct = totalDays > 0 ? (dayIndex / totalDays) * 100 : 0;
  const lvl = getLevelInfo(exp);
  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{ background:T.heroGrad, boxShadow:T.heroShadow, minHeight:240 }}>
      {/* Decorative blobs */}
      <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5 pointer-events-none"/>
      <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-white/5 translate-y-16 -translate-x-16 pointer-events-none"/>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 pointer-events-none"/>

      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        <div className="flex items-stretch justify-between gap-4">

          {/* Text content */}
          <div className="flex-1 min-w-0">
            {/* Day badge row */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-white/60 text-[13px] font-semibold">Day {dayIndex}</span>
              <span className="text-white/25 text-[13px]">·</span>
              <span className="text-white/60 text-[13px] font-semibold">{totalDays}일 여정</span>
              <span className="px-2.5 py-0.5 rounded-full text-[13px] font-bold text-white/75 bg-white/15"
                style={{ fontFamily:T.mono }}>{Math.round(dayPct)}%</span>
            </div>

            {/* Greeting */}
            <h1 className="text-[2rem] sm:text-[2.4rem] lg:text-[2.8rem] font-bold text-white leading-[1.1] tracking-tight mb-2">
              안녕 우현 😊
            </h1>
            <p className="text-white/62 text-[0.9rem] leading-relaxed mb-6 max-w-[340px]">
              오늘도 작은 시작이 큰 변화를 만들어.
              <br/><span className="text-white/38 text-[12px]">Small steps build big futures.</span>
            </p>

            {/* Progress bar */}
            <div className="mb-5 max-w-[340px]">
              <div className="flex justify-between text-[13px] text-white/45 mb-1.5"
                style={{ fontFamily:T.mono }}>
                <span>{totalDays}일 여정 진행률</span>
                <span className="text-white/55 font-semibold">{dayIndex} / {totalDays}일</span>
              </div>
              <div className="h-[6px] bg-white/15 rounded-full overflow-hidden">
                <div className="h-full rounded-full"
                  style={{ width:`${dayPct}%`, background:"linear-gradient(90deg,rgba(255,255,255,0.60),rgba(255,255,255,0.90))" }}/>
              </div>
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap gap-2 mb-6">
              <Pill icon={Flame} iconColor="#FCD34D" label="일 연속" value={String(streak)}/>
              <Pill icon={Star}  iconColor="#FCD34D" label={lvl.name} value={`Lv.${lvl.level}`} filled/>
              <Pill icon={Check} iconColor="#4ADE80" label="미션" value={`${completed}/${total}`}/>
              {expMultiplier > 1 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FCD34D]/20 border border-[#FCD34D]/40">
                  <span className="text-[13px]">🔥</span>
                  <span className="text-[#FDE68A] text-[13px] font-bold">이번 주 EXP ×{expMultiplier}</span>
                </div>
              )}
            </div>

            {/* CTA */}
            {total > 0 && completed >= total ? (
              <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/16 text-white font-bold text-[14px] border border-white/25">
                🎉 오늘 미션 완료!
              </div>
            ) : (
              <button onClick={onBeginDay}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-[#2563EB] font-bold text-[14px] hover:bg-white/92 active:scale-95 transition-all"
                style={{ boxShadow:"0 4px 20px rgba(0,0,0,0.14)" }}>
                {completed > 0 ? "이어서 하기" : "오늘 시작하기"} <ArrowRight className="w-4 h-4"/>
              </button>
            )}
          </div>

          {/* Character — right side */}
          <div className="hidden sm:flex flex-shrink-0 items-end"
            style={{ width:200 }}>
            <SeedCharacter className="w-full h-auto drop-shadow-xl"/>
          </div>
        </div>

        {/* Motivational quote */}
        <div className="mt-5 pt-5 border-t border-white/10">
          <p className="text-white/38 text-[13px] uppercase tracking-wider mb-1" style={{ fontFamily:T.mono }}>오늘의 한마디</p>
          <p className="text-white/72 text-[0.9rem] italic leading-relaxed" >
            "시작이 반이다. 작은 첫 걸음이 오늘을 바꾼다."
          </p>
        </div>
      </div>
    </div>
  );
}

function SubjectCard({ subject, onStart }: { subject:Subject; onStart:()=>void }) {
  const Icon = subject.icon;
  return (
    <div className={`${T.glassCard} rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5`}
      style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:subject.bg }}>
            <Icon className="w-5 h-5" style={{ color:subject.color }}/>
          </div>
          <div>
            <p className="font-bold text-[#111827] text-[0.9rem] leading-tight">{subject.name}</p>
            <p className="text-[#111827]/52 text-[13px]">{subject.sub}</p>
          </div>
        </div>
        {subject.done && (
          <div className="w-6 h-6 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-3.5 h-3.5 text-[#10B981]"/>
          </div>
        )}
      </div>
      <p className="text-[#111827]/75 text-[0.83rem] leading-snug flex-1">{subject.goal}</p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[#111827]/52">
          <Clock className="w-3.5 h-3.5"/><span className="text-[13px]">{subject.time}분</span>
        </div>
        <div className="flex items-center gap-0.5">
          {[1,2,3].map(i => (
            <Star key={i} className="w-3 h-3" style={{ color:i<=subject.difficulty?subject.color:"#E5E7EB" }} fill={i<=subject.difficulty?subject.color:"none"}/>
          ))}
        </div>
        <span className="text-[12px] font-medium px-2 py-0.5 rounded-full ml-auto" style={{ backgroundColor:subject.bg, color:subject.color }}>
          {subject.difficulty===1?"쉬움":subject.difficulty===2?"보통":"어려움"}
        </span>
      </div>
      <button onClick={onStart}
        className="w-full flex items-center justify-center gap-1.5 py-[11px] rounded-xl font-bold text-[13px] transition-all duration-150 active:scale-95"
        style={{ backgroundColor:subject.done?"#F3F4F6":subject.bg, color:subject.done?"#9CA3AF":subject.color }}>
        {subject.done ? "완료!" : <><Play className="w-3.5 h-3.5" fill="currentColor"/>▶ 시작하기</>}
      </button>
    </div>
  );
}

function TodaysMissions({ subjects, onStart, onViewWeeklyPlan, onViewStudyLog, beforeStart }: {
  subjects:Subject[]; onStart:(id:string)=>void; onViewWeeklyPlan:()=>void; onViewStudyLog:()=>void; beforeStart:boolean;
}) {
  const done      = subjects.filter(s=>s.done).length;
  const remaining = subjects.reduce((a,s)=>a+(s.done?0:s.time),0);
  return (
    <section>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-[#111827] font-bold text-[17px] tracking-tight">오늘의 미션</h2>
          <p className="text-[#111827]/60 text-[13px] mt-0.5">
            {done}/{subjects.length} 완료
            {remaining>0&&<span className="ml-2 text-[#111827]/48">· {remaining}분 남음</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {done > 0 && (
            <button onClick={onViewStudyLog}
              className="flex items-center gap-0.5 text-[#111827]/55 text-[13px] font-semibold hover:opacity-70 transition-opacity">
              <Camera className="w-3.5 h-3.5"/> 학습 기록
            </button>
          )}
          <button onClick={onViewWeeklyPlan}
            className="flex items-center gap-0.5 text-[#2563EB] text-[13px] font-semibold hover:opacity-70 transition-opacity">
            이번 주 계획 <ChevronRight className="w-4 h-4"/>
          </button>
        </div>
      </div>
      {subjects.length === 0 ? (
        <div className={`${T.glassCard} rounded-3xl p-8 text-center`} style={{ boxShadow:T.cardShadow }}>
          <span className="text-3xl mb-3 block">📋</span>
          <p className="font-bold text-[#111827] mb-1">
            {beforeStart ? "내일(7/21)부터 미션이 시작돼요" : "오늘 배정된 미션이 없어요"}
          </p>
          <p className="text-[#111827]/60 text-sm">
            {beforeStart ? "위 '내일 계획 미리 보기'에서 내일 할 과목을 체크해두세요." : "이번 주 계획에서 하고 싶은 과목을 체크해보세요."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: horizontal scroll */}
          <div className="flex sm:hidden gap-3 -mx-4 px-4 pb-2 overflow-x-auto no-scrollbar">
            {subjects.map(s=>(
              <div key={s.id} className="w-[220px] flex-shrink-0">
                <SubjectCard subject={s} onStart={()=>onStart(s.id)}/>
              </div>
            ))}
          </div>
          {/* Desktop: 3-column grid like original */}
          <div className="hidden sm:grid grid-cols-2 xl:grid-cols-3 gap-3">
            {subjects.map(s=><SubjectCard key={s.id} subject={s} onStart={()=>onStart(s.id)}/>)}
          </div>
        </>
      )}
    </section>
  );
}

function GrowthSection({ onClick, exp, streak, history, dayPlans }: {
  onClick?: () => void; exp:number; streak:number; history:Record<string,string[]>; dayPlans:DayPlanOverrides;
}) {
  const lvl     = getLevelInfo(exp);
  const week    = getCurrentWeekStatus(history, toYMD(new Date()), dayPlans);
  const badges  = getBadgeStatus({ exp, streak, history, dayPlans });
  const earned  = badges.filter(b => b.unlocked).length;

  return (
    <div onClick={onClick} role={onClick?"button":undefined} className={`${T.glassCard} rounded-3xl p-6${onClick?" cursor-pointer hover:shadow-md transition-shadow":""}`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[#111827] font-bold text-[0.95rem]">성장 현황</h2>
        <div className="px-2.5 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] text-[13px] font-bold">Lv.{lvl.level} {lvl.name}</div>
      </div>
      <div className="flex items-end gap-4 mb-2">
        <div className="w-20 h-24 flex-shrink-0"><GrowthTree className="w-full h-full"/></div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-[13px] text-[#111827]/58 mb-1.5">
            <span>{lvl.xpIntoLevel.toLocaleString()} XP</span>
            <span>{lvl.isMax ? "만렙!" : `${lvl.xpForLevel.toLocaleString()} XP`}</span>
          </div>
          <div className="h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width:`${lvl.pct}%`, background:"linear-gradient(90deg,#10B981,#34D399)" }}/>
          </div>
          <p className="text-[13px] text-[#111827]/55 mt-1.5">
            {lvl.isMax ? "최고 레벨을 달성했어요!" : <>Lv.{lvl.level + 1}까지 <span className="font-semibold text-[#10B981]">{lvl.xpToNext.toLocaleString()} XP</span> 남음</>}
          </p>
        </div>
      </div>
      <p className="text-[12px] text-[#111827]/52 leading-relaxed mb-5">
        미션을 완료할 때마다 XP를 받아요. XP가 쌓이면 레벨이 오르고 나무가 자라요.
      </p>
      <div className="mb-5">
        <p className="text-[13px] font-semibold text-[#111827]/52 uppercase tracking-wider mb-3">이번 주 기록</p>
        <div className="flex items-center justify-between">
          {week.map((d,i)=>{
            const missed = !d.isRest && !d.isFuture && !d.isToday && !d.done && !d.partial && d.total > 0;
            const bg = d.done ? "#10B981" : d.partial ? "#FEF3C7" : missed ? "#FEE2E2" : "#F1F5F9";
            return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${d.isToday?"border-2 border-[#2563EB]":""}`}
                style={{ backgroundColor: d.isToday ? undefined : bg }}>
                {d.done
                  ? <Check className="w-4 h-4 text-white"/>
                  : d.partial
                    ? <span className="text-[11px] font-bold text-[#B45309]">{d.doneCount}/{d.total}</span>
                    : <span className={`text-[12px] font-bold ${d.isToday?"text-[#2563EB]":missed?"text-[#DC2626]":"text-[#111827]/48"}`}>{d.day}</span>}
              </div>
              <span className="text-[12px] text-[#111827]/48 font-medium">{d.day}</span>
            </div>
          );})}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[13px] font-semibold text-[#111827]/52 uppercase tracking-wider">배지 {earned}/{badges.length}</p>
        </div>
        <p className="text-[12px] text-[#111827]/52 leading-relaxed mb-3">엄마에게 보여줄 우현이의 노력 기록이에요.</p>
        <div className="grid grid-cols-4 gap-2">
          {badges.slice(0,4).map((b,i)=>(
            <div key={i} className="flex flex-col items-center gap-1.5" style={{ opacity:b.unlocked?1:0.35 }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-[1.3rem]" style={{ backgroundColor:b.unlocked?"#D1FAE5":"#F1F5F9" }}>
                {b.icon}
              </div>
              <span className="text-[12px] text-[#111827]/62 text-center leading-tight">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeEncouragementCard({ onClick }: { onClick?: () => void }) {
  return (
    <div onClick={onClick} role={onClick?"button":undefined} className={`relative rounded-3xl p-5 overflow-hidden${onClick?" cursor-pointer":""}`}
      style={{ background:"linear-gradient(140deg,#FFFBEB,#FEF3C7 55%,#FDE68A)", boxShadow:"0 4px 28px rgba(245,158,11,0.14)" }}>
      <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-[#F59E0B]/10 pointer-events-none"/>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-2xl bg-[#FDE68A] flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-[#D97706]" fill="#D97706"/>
          </div>
          <div>
            <p className="text-sm font-bold text-[#78350F]">엄마의 응원</p>
            <p className="text-[13px] text-[#92400E]/45">오늘 7:30 AM</p>
          </div>
        </div>
        <p className="text-[#78350F]/82 text-[0.93rem] leading-[1.8]" >
          "우현아, 오늘도 화이팅! 엄마는 항상 우현이 편이야. 작은 것부터 시작하면 돼. 사랑해."
        </p>
        <div className="flex items-center gap-2 mt-4">
          {[0,1,2].map(i=><Heart key={i} className="w-3.5 h-3.5 text-[#F59E0B]" fill="#F59E0B"/>)}
        </div>
      </div>
    </div>
  );
}

function UpcomingSection({ dayPlans, onCalendar }: { dayPlans:DayPlanOverrides; onCalendar?: () => void }) {
  const todayStr    = toYMD(new Date());
  const tomorrowStr = addDaysStr(todayStr, 1);
  const tomorrowSched = FULL_SCHEDULE.find(d => d.date === tomorrowStr);
  const tomorrowSubjects = tomorrowSched?.kind === "study"
    ? getCheckedSubjectIds(tomorrowStr, dayPlans).map(id => EXAM_SUBJECTS.find(s => s.id === id)?.name).filter(Boolean)
    : [];
  const examDday = diffDaysStr(todayStr, MIDTERM_EXAM_DATE);

  return (
    <div className={`${T.glassCard} rounded-3xl p-5`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#111827] font-bold text-[14px]">다가오는 일정</h2>
        <button onClick={onCalendar} className={onCalendar?"hover:opacity-70 transition-opacity":""}>
          <Calendar className="w-4 h-4 text-[#111827]/50"/>
        </button>
      </div>
      <div className="bg-[#F8FAFC] rounded-2xl p-4 mb-3 border border-[#111827]/05">
        <p className="text-[13px] font-semibold text-[#111827]/52 uppercase tracking-wider mb-2.5">
          {tomorrowSched?.kind === "study" ? "내일 예정" : tomorrowSched?.kind === "holiday" ? `내일은 ${tomorrowSched.label ?? "공휴일"}` : "내일은 주말"}
        </p>
        {tomorrowSubjects.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tomorrowSubjects.map(s=>(
              <span key={s} className="text-[13px] px-2.5 py-1 rounded-full bg-white border border-[#E5E7EB] text-[#111827]/76 font-semibold">{s}</span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[#111827]/55">
            {tomorrowSched?.kind === "study" ? "아직 체크된 과목이 없어요." : "쉬는 날이에요."}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:`${T.rose}14` }}>
            <BookOpen className="w-4 h-4" style={{ color:T.rose }}/>
          </div>
          <p className="text-sm font-semibold text-[#111827]">중간고사</p>
        </div>
        <span className="text-sm font-bold px-2.5 py-1 rounded-full"
          style={{ color: examDday<=7?"#DC2626":T.rose, backgroundColor: examDday<=7?"#FEE2E2":`${T.rose}14` }}>
          {examDday >= 0 ? `D-${examDday}` : "종료"}
        </span>
      </div>
    </div>
  );
}

// ─── BRIEFING SCREEN COMPONENTS (unchanged) ───────────────────────────────────

function SpeechBubble({ text }: { text:string }) {
  return (
    <div className="speech-bounce relative inline-block">
      <div className="bg-white rounded-2xl px-4 py-2.5 relative z-10" style={{ boxShadow:"0 4px 24px rgba(17,24,39,0.14)" }}>
        <p className="text-[#111827] text-[12px] font-bold whitespace-nowrap">{text}</p>
      </div>
      <div className="absolute -bottom-[7px] left-7 w-3.5 h-3.5 bg-white rotate-45 z-0"/>
    </div>
  );
}

function BriefingHero({ waving }: { waving:boolean }) {
  const todayStr  = toYMD(new Date());
  const totalDays = FULL_SCHEDULE.length;
  const dayIndex  = Math.min(Math.max(diffDaysStr(STUDY_START_DATE, todayStr) + 1, 0), totalDays);
  const examDday  = diffDaysStr(todayStr, MIDTERM_EXAM_DATE);
  return (
    <div className="relative rounded-3xl overflow-hidden" style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/5 pointer-events-none"/>
      <div className="absolute -bottom-16 -left-10 w-52 h-52 rounded-full bg-white/4 pointer-events-none"/>
      <div className="relative z-10 px-6 pt-8 pb-7 md:px-10 md:pt-10 md:pb-9">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex sm:hidden justify-center mb-6">
              <div className="flex flex-col items-center gap-2">
                <SpeechBubble text="오늘도 같이 가보자!"/>
                <SeedCharacterBriefing waving={waving} className="w-32 h-auto drop-shadow-xl float-soft"/>
              </div>
            </div>
            <p className="text-white/65 text-base font-semibold mb-2 tracking-tight">좋아 우현 😊</p>
            <h1 className="font-bold text-white tracking-tight leading-[1.1] mb-5" style={{ fontSize:"clamp(1.75rem,4.5vw,2.75rem)" }}>
              오늘은 40분만<br/>집중하면 성공이야!
            </h1>
            <div className="flex flex-wrap gap-2 mb-5">
              <div className="flex items-center gap-1.5 bg-white/16 rounded-xl px-3 py-1.5 border border-white/12">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60"/><span className="text-white text-xs font-bold">Day {dayIndex} / {totalDays}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#F59E0B]/25 rounded-xl px-3 py-1.5 border border-[#F59E0B]/20">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FCD34D]"/><span className="text-[#FDE68A] text-xs font-bold">중간고사 D-{examDday}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/16 rounded-xl px-3 py-1.5 border border-white/12">
                <Clock className="w-3 h-3 text-white/60"/><span className="text-white text-xs font-bold">예상 40분</span>
              </div>
            </div>
            <p className="text-white/45 text-[0.82rem] leading-relaxed max-w-[240px]">작은 시작이 큰 습관을 만들어.</p>
          </div>
          <div className="hidden sm:flex flex-col items-center gap-2 flex-shrink-0">
            <SpeechBubble text="오늘도 같이 가보자!"/>
            <SeedCharacterBriefing waving={waving} className="w-40 md:w-52 lg:w-56 h-auto drop-shadow-xl float-soft"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayGoalCard({ subjects }: { subjects:Subject[] }) {
  const totalTime = subjects.reduce((sum, s) => sum + s.time, 0);
  return (
    <div className={`${T.glassCard} rounded-3xl overflow-hidden`} style={{ boxShadow:T.cardShadow }}>
      <div className="px-6 pt-6 pb-4 border-b border-[#111827]/05">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#111827] text-[0.95rem]">오늘 목표</h3>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EFF6FF]">
            <Clock className="w-3 h-3 text-[#2563EB]"/><span className="text-[13px] font-bold text-[#2563EB]">총 {totalTime}분</span>
          </div>
        </div>
      </div>
      <div className="p-6">
        {subjects.length === 0 ? (
          <p className="text-sm text-[#111827]/60 text-center py-4">오늘은 배정된 과목이 없어요.</p>
        ) : (
        <div className="flex flex-col sm:flex-row sm:gap-6">
          <div className="flex-1 space-y-2.5 mb-5 sm:mb-0">
            {subjects.map(g=>(
              <div key={g.id} className="flex items-center gap-3 p-3 rounded-2xl border" style={{ backgroundColor:g.bg, borderColor:`${g.color}20` }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor:g.color }}>
                  <Check className="w-3.5 h-3.5 text-white"/>
                </div>
                <span className="text-[#111827] text-sm font-semibold flex-1">{g.name}</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" style={{ color:g.color }}/>
                  <span className="text-xs font-bold font-mono" style={{ color:g.color }}>{g.time}분</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block w-px bg-[#111827]/06 self-stretch"/>
          <div className="sm:w-44 flex flex-col gap-2">
            <p className="text-[13px] font-bold text-[#111827]/55 uppercase tracking-wider mb-1">오늘의 보상</p>
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/20">
              <div className="w-8 h-8 rounded-xl bg-[#F59E0B] flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-white" fill="white"/>
              </div>
              <div><p className="text-[13px] font-bold text-[#92400E]">+{subjects.reduce((s,g)=>s+EXAM_SUBJECTS.find(x=>x.id===g.id)!.exp,0)} EXP</p><p className="text-[12px] text-[#92400E]/55">경험치 획득</p></div>
            </div>
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#D1FAE5] border border-[#10B981]/20">
              <span className="text-xl leading-none flex-shrink-0">🌱</span>
              <div><p className="text-[13px] font-bold text-[#065F46]">새잎 성장</p><p className="text-[12px] text-[#065F46]/55">나무가 자라요</p></div>
            </div>
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FFF1F2] border border-[#E11D48]/15">
              <span className="text-xl leading-none flex-shrink-0">❤️</span>
              <div><p className="text-[13px] font-bold text-[#9F1239]">엄마 칭찬</p><p className="text-[12px] text-[#9F1239]/55">응원 메시지 도착</p></div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function StudyJourney() {
  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-[#111827] text-[0.95rem]">오늘의 여정</h3>
        <span className="text-[13px] font-mono text-[#111827]/50">6단계</span>
      </div>
      <div className="hidden sm:block relative">
        <div className="absolute top-[22px] left-8 right-8 h-[2px] rounded-full"
          style={{ background:"linear-gradient(to right,#2563EB20,#4F46E520,#7C3AED20,#E11D4820,#F59E0B20,#05966920)" }}/>
        <div className="flex items-start justify-between relative z-10">
          {JOURNEY_STEPS.map((step,i)=>{ const Icon=step.icon; return (
            <div key={i} className="step-card flex flex-col items-center gap-2 flex-1">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white border-2"
                style={{ borderColor:`${step.color}28`, boxShadow:`0 2px 12px ${step.color}18` }}>
                <Icon className="w-5 h-5" style={{ color:step.color }}/>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#111827]/42">{step.num}</span>
              <span className="text-[13px] font-bold text-center leading-tight" style={{ color:step.color }}>{step.label}</span>
            </div>
          ); })}
        </div>
      </div>
      <div className="sm:hidden flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth:"none", scrollSnapType:"x mandatory" }}>
        {JOURNEY_STEPS.map((step,i)=>{ const Icon=step.icon; return (
          <div key={i} className="flex items-center gap-3 flex-shrink-0" style={{ scrollSnapAlign:"start" }}>
            <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border min-w-[76px]"
              style={{ backgroundColor:step.bg, borderColor:`${step.color}22` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor:`${step.color}20` }}>
                <Icon className="w-[18px] h-[18px]" style={{ color:step.color }}/>
              </div>
              <span className="text-[11px] font-mono text-[#111827]/50">{step.num}</span>
              <span className="text-[13px] font-bold text-center leading-tight" style={{ color:step.color }}>{step.label}</span>
            </div>
            {i<JOURNEY_STEPS.length-1&&<ChevronRight className="w-4 h-4 flex-shrink-0 text-[#111827]/38"/>}
          </div>
        ); })}
      </div>
      <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/10">
        <Sun className="w-4 h-4 text-[#2563EB]/60 flex-shrink-0"/>
        <p className="text-[13px] text-[#2563EB]/65 leading-relaxed">준비부터 완료까지 — 이 여정을 끝내면 보상이 기다려!</p>
      </div>
    </div>
  );
}

function MomMessageCard() {
  return (
    <div className="relative rounded-3xl p-6 overflow-hidden"
      style={{ background:"linear-gradient(140deg,#FFF5F7 0%,#FFF0F2 50%,#FFE4E8 100%)", boxShadow:"0 4px 28px rgba(225,29,72,0.10)", border:"1px solid rgba(225,29,72,0.08)" }}>
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[#E11D48]/06 pointer-events-none"/>
      <div className="absolute -right-3 -bottom-3 text-[96px] leading-none pointer-events-none select-none" aria-hidden="true"
        style={{ color:"rgba(225,29,72,0.05)" }}>♥</div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background:"linear-gradient(135deg,#FB7185,#E11D48)" }}>
            <Heart className="w-5 h-5 text-white" fill="white"/>
          </div>
          <div>
            <p className="text-sm font-bold text-[#881337]">엄마의 응원</p>
            <p className="text-[13px] text-[#9F1239]/45">오늘 7:30 AM · 공부 시작 전</p>
          </div>
        </div>
        <blockquote className="text-[1.15rem] leading-[1.85] text-[#881337]/85">
          "우현아,<br/>오늘도 완벽하려고 하지 말고<br/>시작만 해도 성공이야."
        </blockquote>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-[#E11D48]/08">
          <div className="flex gap-1">
            {[0,1,2].map(i=><Heart key={i} className="w-3.5 h-3.5 text-[#FB7185]" fill="#FB7185"/>)}
          </div>
          <span className="text-[13px] text-[#9F1239]/38 ml-auto">엄마가 우현이를 위해 보낸 메시지</span>
        </div>
      </div>
    </div>
  );
}

function BriefingScreen({ subjects, onStart, onBack }: { subjects:Subject[]; onStart:()=>void; onBack:()=>void }) {
  const [waving, setWaving]       = useState(false);
  const [ctaActive, setCtaActive] = useState(false);
  const handleCTA = () => {
    setWaving(true); setCtaActive(true);
    setTimeout(()=>setCtaActive(false), 130);
    setTimeout(()=>setWaving(false), 800);
    setTimeout(()=>onStart(), 480);
  };
  return (
    <>
      <main className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 pb-36 lg:pb-12 space-y-4">
        <BriefingHero waving={waving}/>
        <TodayGoalCard subjects={subjects}/>
        <StudyJourney/>
        <MomMessageCard/>
        <div className="hidden lg:flex flex-col items-center gap-4 pt-2 pb-4">
          <button onClick={handleCTA} className="cta-btn w-full flex items-center justify-center gap-3 py-[18px] rounded-2xl text-white font-bold text-[1.15rem]"
            style={{ background:"linear-gradient(135deg,#1d4ed8,#2563EB 45%,#4f46e5)", boxShadow:"0 8px 40px rgba(37,99,235,0.38)" }}>
            공부 시작하기 <ArrowRight className="w-5 h-5"/>
          </button>
          <button onClick={onBack} className="text-[#111827]/55 text-sm hover:text-[#111827]/75 transition-colors underline underline-offset-4">
            오늘 계획 다시 보기
          </button>
        </div>
      </main>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40" style={{ paddingBottom:"env(safe-area-inset-bottom)" }}>
        <div className="backdrop-blur-2xl bg-[#F8FAFC]/90 border-t border-black/5 px-4 pt-4 pb-4" style={{ boxShadow:"0 -8px 32px rgba(17,24,39,0.10)" }}>
          <div className="cta-btn w-full flex items-center justify-center gap-3 py-[18px] rounded-2xl text-white font-bold text-[1.15rem] cursor-pointer"
            onClick={handleCTA}
            style={{ background:"linear-gradient(135deg,#1d4ed8,#2563EB 45%,#4f46e5)", boxShadow:"0 8px 40px rgba(37,99,235,0.38)", transform:ctaActive?"scale(0.98)":"scale(1)", transition:"transform 0.1s ease" }}>
            공부 시작하기 <ArrowRight className="w-5 h-5"/>
          </div>
          <button onClick={onBack} className="w-full text-center text-[#111827]/55 text-sm mt-3 hover:text-[#111827]/72 transition-colors">
            오늘 계획 다시 보기
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY FLOW — 5 new screens
// ═══════════════════════════════════════════════════════════════════════════════

// ── Screen 1: 과목 선택 ────────────────────────────────────────────────────────

function StudySubjectCard({
  subject, selected, onSelect,
}: { subject:StudySubject; selected:boolean; onSelect:()=>void }) {
  const Icon = subject.icon;
  return (
    <button
      onClick={onSelect}
      className="subject-card w-full text-left rounded-2xl p-5 border-2 flex flex-col gap-3 relative"
      style={{
        backgroundColor: subject.done ? "#F0FDF4" : selected ? `${subject.color}08` : "rgba(255,255,255,0.75)",
        borderColor: subject.done ? "#BBF7D0" : selected ? subject.color : "rgba(255,255,255,0.9)",
        opacity: subject.done ? 0.75 : 1,
        boxShadow: selected
          ? `0 4px 24px ${subject.color}22, 0 1px 4px rgba(17,24,39,0.06)`
          : T.cardShadow,
      }}
    >
      {/* Recommended / Done badge */}
      {subject.done ? (
        <div className="absolute -top-2.5 left-4 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-[12px] font-bold"
          style={{ background:T.green }}>
          <Check className="w-2.5 h-2.5"/>
          완료
        </div>
      ) : subject.recommended && (
        <div className="absolute -top-2.5 left-4 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-[12px] font-bold"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
          <Star className="w-2.5 h-2.5" fill="white"/>
          추천
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor:subject.bg }}>
            <Icon className="w-5 h-5" style={{ color:subject.color }}/>
          </div>
          <p className="font-bold text-[#111827] text-base">{subject.name}</p>
        </div>
        {subject.done ? (
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor:T.green }}>
            <Check className="w-3.5 h-3.5 text-white"/>
          </div>
        ) : selected && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor:subject.color }}>
            <Check className="w-3.5 h-3.5 text-white"/>
          </div>
        )}
      </div>
      {/* Stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-[#111827]/65">
          <Clock className="w-3.5 h-3.5"/>
          <span className="text-[13px] font-semibold">{subject.time}분</span>
        </div>
        <div className="flex items-center gap-0.5">
          {[1,2,3].map(i=>(
            <Star key={i} className="w-3 h-3"
              style={{ color:i<=subject.difficulty?subject.color:"#E5E7EB" }}
              fill={i<=subject.difficulty?subject.color:"none"}/>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Zap className="w-3.5 h-3.5 text-[#F59E0B]"/>
          <span className="text-[13px] font-bold text-[#F59E0B]">+{subject.exp} EXP</span>
        </div>
      </div>
      {/* Mission preview */}
      <p className="text-[13px] text-[#111827]/62 leading-snug">{subject.mission}</p>
    </button>
  );
}

function SubjectSelectScreen({ subjects, onSelect, onBack }: {
  subjects:StudySubject[]; onSelect:(id:string)=>void; onBack:()=>void;
}) {
  const [selectedId, setSelectedId] = useState<string>(subjects.find(s=>!s.done)?.id ?? subjects[0]?.id ?? "math");
  const selected = subjects.find(s=>s.id===selectedId) ?? subjects[0];

  if (!selected) {
    return (
      <main className="max-w-[600px] mx-auto px-4 py-16 text-center">
        <p className="text-[#111827]/60 text-sm">오늘은 배정된 과목이 없어요. 홈에서 이번 주 계획을 확인해보세요.</p>
      </main>
    );
  }

  return (
    <main className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-10 py-6 pb-28 lg:pb-12">
      {/* Page header */}
      <div className="mb-6">
        <p className="text-[13px] font-mono text-[#111827]/50 uppercase tracking-[0.35em] mb-2">과목 선택</p>
        <h1 className="text-[1.8rem] sm:text-[2.2rem] font-bold text-[#111827] tracking-tight leading-tight">
          오늘 무엇부터<br className="sm:hidden"/>시작할까?
        </h1>
        <p className="text-[#111827]/65 mt-2 text-[0.9rem]">한 과목씩 천천히 해보자.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card grid */}
        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subjects.map(s=>(
              <StudySubjectCard key={s.id} subject={s}
                selected={selectedId===s.id}
                onSelect={()=>setSelectedId(s.id)}/>
            ))}
          </div>
        </div>

        {/* Desktop: selected detail + CTA */}
        <div className="hidden lg:flex lg:col-span-5 flex-col gap-4">
          <div className={`${T.glassCard} rounded-3xl p-6 flex-1`} style={{ boxShadow:T.cardShadow }}>
            <p className="text-[13px] font-mono text-[#111827]/50 uppercase tracking-wider mb-4">선택한 과목</p>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor:selected.bg }}>
                {<selected.icon className="w-7 h-7" style={{ color:selected.color }}/>}
              </div>
              <div>
                <p className="text-xl font-bold text-[#111827]">{selected.name}</p>
                <p className="text-sm text-[#111827]/60">{selected.mission}</p>
              </div>
            </div>
            {[
              { label:"예상 시간", value:`${selected.time}분`, icon:Clock, color:T.blue },
              { label:"획득 EXP", value:`+${selected.exp} XP`, icon:Zap, color:T.amber },
            ].map(({ label, value, icon:Icon, color })=>(
              <div key={label} className="flex items-center justify-between py-3 border-b border-[#111827]/06 last:border-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color }}/><span className="text-sm text-[#111827]/72">{label}</span>
                </div>
                <span className="text-sm font-bold text-[#111827]">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#111827]/72">난이도</span>
              <div className="flex gap-0.5">
                {[1,2,3].map(i=>(
                  <Star key={i} className="w-4 h-4"
                    style={{ color:i<=selected.difficulty?selected.color:"#E5E7EB" }}
                    fill={i<=selected.difficulty?selected.color:"none"}/>
                ))}
              </div>
            </div>
          </div>
          <button onClick={()=>onSelect(selectedId)}
            className="cta-btn w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 32px rgba(37,99,235,0.35)" }}>
            선택하기 <ArrowRight className="w-5 h-5"/>
          </button>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40" style={{ paddingBottom:"env(safe-area-inset-bottom)" }}>
        <div className="backdrop-blur-2xl bg-[#F8FAFC]/90 border-t border-black/5 px-4 pt-4 pb-4">
          <button onClick={()=>onSelect(selectedId)}
            className="cta-btn w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 32px rgba(37,99,235,0.35)" }}>
            {selected.name} 선택하기 <ArrowRight className="w-5 h-5"/>
          </button>
        </div>
      </div>
    </main>
  );
}

// ── Screen 2: 오늘의 미션 ─────────────────────────────────────────────────────

function MissionDetailScreen({ subjectId, missionText, onStart, onBack }: {
  subjectId:string; missionText:string; onStart:()=>void; onBack:()=>void;
}) {
  const subject = EXAM_SUBJECTS.find(s=>s.id===subjectId) ?? EXAM_SUBJECTS[0];
  const Icon = subject.icon;
  return (
    <main className="max-w-[600px] mx-auto px-4 sm:px-6 py-6 pb-36 lg:pb-16 space-y-4">
      {/* Subject badge */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl w-fit" style={{ backgroundColor:subject.bg }}>
        <Icon className="w-5 h-5" style={{ color:subject.color }}/>
        <span className="font-bold text-sm" style={{ color:subject.color }}>{subject.name}</span>
      </div>

      {/* Mission hero */}
      <div className="relative rounded-3xl overflow-hidden" style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/5 pointer-events-none"/>
        <div className="relative z-10 p-7 md:p-10">
          <p className="text-white/55 text-sm font-semibold mb-3 uppercase tracking-wider">오늘의 미션</p>
          <h2 className="text-[1.8rem] md:text-[2.2rem] font-bold text-white leading-tight tracking-tight mb-5">
            {missionText}
          </h2>
          {/* Stat pills */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-white/16 rounded-xl px-3 py-1.5 border border-white/12">
              <Clock className="w-3.5 h-3.5 text-white/60"/><span className="text-white text-xs font-bold">{subject.time}분</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#F59E0B]/25 rounded-xl px-3 py-1.5 border border-[#F59E0B]/20">
              <Zap className="w-3.5 h-3.5 text-[#FCD34D]"/><span className="text-[#FDE68A] text-xs font-bold">+{subject.exp} EXP</span>
            </div>
            <div className="flex items-center gap-1 bg-white/16 rounded-xl px-3 py-1.5 border border-white/12">
              {[1,2,3].map(i=><Star key={i} className="w-3 h-3" fill={i<=subject.difficulty?"#FCD34D":"transparent"} style={{ color:i<=subject.difficulty?"#FCD34D":"rgba(255,255,255,0.3)" }}/>)}
            </div>
          </div>
        </div>
      </div>

      {/* Reward breakdown */}
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <p className="text-[13px] font-bold text-[#111827]/52 uppercase tracking-wider mb-4">완료하면 받는 보상</p>
        <div className="space-y-3">
          {[
            { label:`+${subject.exp} EXP 획득`, sub:"경험치가 쌓여요", bg:"#FEF3C7", icon:Zap, color:T.amber },
            { label:"새잎 성장",                sub:"나무가 한 단계 자라요", bg:"#D1FAE5", icon:TrendingUp, color:T.green },
            { label:"엄마 응원 예정",           sub:"미션 완료 후 도착해요", bg:"#FFF1F2", icon:Heart, color:T.rose },
          ].map(({ label, sub, bg, icon:BIcon, color })=>(
            <div key={label} className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ backgroundColor:bg }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor:`${color}20` }}>
                <BIcon className="w-4 h-4" style={{ color }}/>
              </div>
              <div>
                <p className="text-sm font-bold text-[#111827]">{label}</p>
                <p className="text-[13px] text-[#111827]/65 mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mascot encouragement */}
      <div className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/60 border border-white/80">
        <SeedCharacter className="w-16 h-auto flex-shrink-0"/>
        <p className="text-[0.9rem] text-[#111827]/78 leading-relaxed">
          "할 수 있어! 오늘도 우현이랑 같이 해보자."
        </p>
      </div>

      {/* CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40" style={{ paddingBottom:"env(safe-area-inset-bottom)" }}>
        <div className="backdrop-blur-2xl bg-[#F8FAFC]/90 border-t border-black/5 px-4 pt-4 pb-4">
          <button onClick={onStart} className="cta-btn w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 32px rgba(37,99,235,0.35)" }}>
            집중 시작 <ArrowRight className="w-5 h-5"/>
          </button>
        </div>
      </div>
      <div className="hidden lg:block">
        <button onClick={onStart} className="cta-btn w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 32px rgba(37,99,235,0.35)" }}>
          집중 시작 <ArrowRight className="w-5 h-5"/>
        </button>
      </div>
    </main>
  );
}

// ── Screen 3: 집중하기 ────────────────────────────────────────────────────────

function FocusScreen({ subjectId, missionText, onComplete, onBack, goalScore }: {
  subjectId:string; missionText:string; onComplete:(elapsedSeconds:number)=>void; onBack:()=>void; goalScore?:number;
}) {
  const subject  = EXAM_SUBJECTS.find(s=>s.id===subjectId) ?? EXAM_SUBJECTS[0];
  const TOTAL    = subject.time * 60;
  // 최소 20분(과목 시간이 그보다 짧으면 그 과목의 전체 시간)은 채워야 완료할 수 있다 —
  // 몇 초 만에 완료 눌러서 사진만 찍는 걸 막기 위함
  const MIN_REQUIRED = Math.min(TOTAL, 20 * 60);
  const [timeLeft, setTimeLeft] = useState(TOTAL);
  const [running, setRunning]   = useState(true);
  const elapsed = TOTAL - timeLeft;
  const canComplete = elapsed >= MIN_REQUIRED;

  useEffect(() => {
    if (!running || timeLeft <= 0) return;
    const id = window.setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, timeLeft]);

  useEffect(() => { if (timeLeft === 0) onComplete(TOTAL); }, [timeLeft, onComplete, TOTAL]);

  const mm   = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss   = String(timeLeft % 60).padStart(2, "0");
  const R    = 90;
  const circ = 2 * Math.PI * R;
  const dashFill = circ * (timeLeft / TOTAL);
  const Icon = subject.icon;

  return (
    <main className="max-w-[520px] mx-auto px-4 sm:px-6 py-6 pb-12 flex flex-col min-h-[calc(100vh-64px)]">
      {/* Subject label */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ backgroundColor:subject.bg }}>
          <Icon className="w-4 h-4" style={{ color:subject.color }}/>
          <span className="text-sm font-bold" style={{ color:subject.color }}>{subject.name}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor:running ? "#DCFCE7" : "#F1F5F9" }}>
          <span className={`w-2 h-2 rounded-full ${running ? "pulse-dot" : ""}`} style={{ backgroundColor: running ? "#16A34A" : "#94A3B8" }}/>
          <span className="text-sm font-bold" style={{ color: running ? "#16A34A" : "#64748B" }}>
            {running ? "집중 중 🎯" : "일시정지"}
          </span>
        </div>
      </div>

      {/* 기말고사 점수 → 목표점수 */}
      {typeof goalScore === "number" && (
        <div className="flex items-center justify-center gap-3 mb-6 py-3 px-4 rounded-2xl"
          style={{ background:`linear-gradient(135deg,${subject.bg},white)`, border:`1.5px solid ${subject.color}30` }}>
          <div className="text-center">
            <p className="text-[12px] font-bold text-[#111827]/60 mb-0.5">기말고사</p>
            <p className="text-xl font-extrabold text-[#111827]/70">{subject.examScore}점</p>
          </div>
          <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color:subject.color }}/>
          <div className="text-center">
            <p className="text-[12px] font-bold mb-0.5" style={{ color:subject.color }}>중간고사 목표</p>
            <p className="text-2xl font-extrabold" style={{ color:subject.color }}>{goalScore}점</p>
          </div>
        </div>
      )}

      {/* Timer — hero */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {/* Pulsing ring + timer */}
        <div className="relative" style={{ width:220, height:220 }}>
          {/* Glow ring */}
          <div className="focus-pulse-ring absolute inset-0 rounded-full"
            style={{ boxShadow:`0 0 0 16px ${subject.color}12` }}/>
          {/* SVG ring — rotated so start is at 12 o'clock */}
          <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={subject.color}/>
                <stop offset="100%" stopColor={T.indigo}/>
              </linearGradient>
            </defs>
            {/* Track */}
            <circle cx="110" cy="110" r={R} fill="none" stroke="#F1F5F9" strokeWidth="12"/>
            {/* Progress */}
            <circle cx="110" cy="110" r={R} fill="none"
              stroke={`url(#ringGrad)`} strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${dashFill} ${circ}`}
              style={{ transition:"stroke-dasharray 0.9s linear" }}/>
          </svg>
          {/* Time display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[3rem] font-bold font-mono text-[#111827] tabular-nums leading-none">
              {mm}:{ss}
            </span>
            <span className="text-[13px] text-[#111827]/55 font-mono mt-1">남은 시간</span>
          </div>
        </div>

        {/* Mission label */}
        <div className="text-center">
          <p className="text-[13px] font-mono text-[#111827]/50 uppercase tracking-wider mb-1">현재 미션</p>
          <p className="text-lg font-bold text-[#111827] tracking-tight">{missionText}</p>
        </div>

        {/* Focus rate */}
        <div className={`${T.glassCard} rounded-2xl px-5 py-4 w-full`} style={{ boxShadow:T.cardShadow }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[#111827]">현재 집중률</span>
            <span className="text-sm font-bold" style={{ color:subject.color }}>92%</span>
          </div>
          <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div className="h-full w-[92%] rounded-full" style={{ background:`linear-gradient(90deg,${subject.color},${T.indigo})` }}/>
          </div>
        </div>

        {/* Mascot encouragement */}
        <div className="flex items-center gap-4">
          <SeedCharacter className="w-16 h-auto float-soft flex-shrink-0"/>
          <div className="bg-white/70 rounded-2xl px-4 py-2.5 border border-white/80 relative" style={{ boxShadow:T.cardShadow }}>
            <p className="text-sm text-[#111827]/78 font-medium">우현이 잘하고 있어! 조금만 더!</p>
            <div className="absolute -left-[7px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white rotate-45 border-l border-b border-white/80"/>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-3 w-full">
          <button onClick={()=>setRunning(r=>!r)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border-2 border-[#E5E7EB] text-[#111827]/75 hover:border-[#111827]/20 hover:text-[#111827] transition-all">
            {running ? <><Pause className="w-4 h-4"/> 일시정지</> : <><Play className="w-4 h-4" fill="currentColor"/> 재개</>}
          </button>
          <button onClick={()=>canComplete && onComplete(elapsed)} disabled={!canComplete}
            className={`cta-btn flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-white ${!canComplete ? "opacity-45 cursor-not-allowed" : ""}`}
            style={{ background:`linear-gradient(135deg,${subject.color},${T.indigo})`, boxShadow: canComplete ? `0 6px 24px ${subject.color}40` : "none" }}>
            {canComplete ? <><Check className="w-4 h-4"/> 완료</> : `${Math.ceil((MIN_REQUIRED - elapsed) / 60)}분 더 하면 완료 가능`}
          </button>
        </div>
        {!canComplete && (
          <p className="text-center text-[12px] text-[#111827]/40 mt-2">
            최소 {Math.round(MIN_REQUIRED / 60)}분은 집중해야 완료할 수 있어요
          </p>
        )}
      </div>
    </main>
  );
}

// ── Screen 4: 사진 인증 ───────────────────────────────────────────────────────

type PhotoState = "camera" | "preview" | "checking" | "verified";

function PhotoScreen({ subjectId, missionText, onSubmit, onBack }: {
  subjectId:string; missionText:string; onSubmit:(photoDataUrl:string)=>void; onBack:()=>void;
}) {
  const subject              = EXAM_SUBJECTS.find(s=>s.id===subjectId) ?? EXAM_SUBJECTS[0];
  const [ps, setPs]          = useState<PhotoState>("camera");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCompressing(true);
    try {
      const compressed = await compressImageFile(file);
      setPhotoDataUrl(compressed);
      setPs("preview");
    } catch {
      setPs("camera");
    } finally {
      setCompressing(false);
    }
  };
  const handleSubmit  = () => {
    setPs("checking");
    setTimeout(()=>setPs("verified"), 2200);
    setTimeout(()=>onSubmit(photoDataUrl ?? ""), 3200);
  };
  const handleRetake = () => {
    setPhotoDataUrl(null);
    setPs("camera");
  };

  return (
    <main className="max-w-[560px] mx-auto px-4 sm:px-6 py-6 pb-12 space-y-5">
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileChange}/>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:`linear-gradient(135deg,${T.green},${T.emerald})` }}>
          <Check className="w-5 h-5 text-white"/>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#111827] tracking-tight">공부 완료!</h2>
          <p className="text-sm text-[#111827]/65">{subject.name} · {missionText}</p>
        </div>
      </div>

      {/* Camera / preview area */}
      <div className="relative rounded-3xl overflow-hidden aspect-[4/3] w-full"
        style={{
          background: ps==="camera" ? "linear-gradient(145deg,#0F172A,#1E293B)" : "linear-gradient(145deg,#1E3A5F,#1E293B)",
          border: ps==="verified" ? `2px solid ${T.green}` : "2px solid rgba(255,255,255,0.06)",
          boxShadow: ps==="verified" ? `0 0 0 4px ${T.green}18` : "none",
        }}>
        {/* Corner markers */}
        {["top-4 left-4 border-t-2 border-l-2 rounded-tl-xl","top-4 right-4 border-t-2 border-r-2 rounded-tr-xl",
          "bottom-4 left-4 border-b-2 border-l-2 rounded-bl-xl","bottom-4 right-4 border-b-2 border-r-2 rounded-br-xl"].map((cls,i)=>(
          <div key={i} className={`absolute w-7 h-7 ${cls} border-white/40`}/>
        ))}

        {ps === "camera" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            {compressing ? (
              <>
                <Loader2 className="w-8 h-8 text-white/60 spin-slow"/>
                <p className="text-white/50 text-sm font-medium">사진 처리 중...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-white/8 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-white/40"/>
                </div>
                <div className="text-center">
                  <p className="text-white/50 text-sm font-medium">교재를 펼쳐서 화면 안에 담아주세요</p>
                  <p className="text-white/25 text-xs mt-1">풀이한 내용이 보이도록 찍어주세요</p>
                </div>
              </>
            )}
          </div>
        )}

        {(ps === "preview" || ps === "checking" || ps === "verified") && (
          <div className="absolute inset-0">
            {photoDataUrl
              ? <img src={photoDataUrl} alt="찍은 교재 사진" className="w-full h-full object-cover"/>
              : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#F8F9FA]">
                  <BookOpen className="w-12 h-12 text-[#94A3B8]"/>
                  <p className="text-[#64748B] text-sm font-medium">{subject.name} 교재</p>
                  <p className="text-[#94A3B8] text-xs">{missionText}</p>
                </div>
              )}
          </div>
        )}

        {/* AI checking overlay */}
        {ps === "checking" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl" style={{ backgroundColor:"rgba(15,23,42,0.7)", backdropFilter:"blur(4px)" }}>
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white spin-slow"/>
            </div>
            <p className="text-white font-semibold text-sm">AI가 사진을 확인하고 있어요...</p>
            <p className="text-white/45 text-xs">잠시만 기다려주세요</p>
          </div>
        )}

        {ps === "verified" && (
          <div className="absolute top-4 right-14 check-in">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background:T.green, boxShadow:`0 4px 16px ${T.green}50` }}>
              <CheckCircle2 className="w-4 h-4 text-white"/><span className="text-white text-xs font-bold">인증 완료!</span>
            </div>
          </div>
        )}
      </div>

      {/* AI status bar */}
      <div className={`${T.glassCard} rounded-2xl p-4`} style={{ boxShadow:T.cardShadow }}>
        <div className="flex items-center gap-3">
          {ps === "camera" && <><Camera className="w-5 h-5 text-[#111827]/50"/><p className="text-sm text-[#111827]/65">교재 사진을 찍어주세요</p></>}
          {ps === "preview" && <><CheckCircle2 className="w-5 h-5 text-[#111827]/60"/><p className="text-sm text-[#111827]/72">사진이 준비됐어요. 제출하거나 다시 찍어주세요.</p></>}
          {ps === "checking" && <><Loader2 className="w-5 h-5 text-[#2563EB] spin-slow"/><p className="text-sm text-[#2563EB] font-medium">AI 분석 중...</p></>}
          {ps === "verified" && <><CheckCircle2 className="w-5 h-5 text-[#10B981]"/><p className="text-sm text-[#10B981] font-semibold">공부 내용이 확인됐어요. 잘했어요!</p></>}
        </div>
      </div>

      {/* Buttons */}
      {ps === "camera" && (
        <button onClick={handleCapture}
          className="cta-btn w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 32px rgba(37,99,235,0.35)" }}>
          <Camera className="w-5 h-5"/> 사진 찍기
        </button>
      )}

      {ps === "preview" && (
        <div className="flex gap-3">
          <button onClick={handleRetake}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border-2 border-[#E5E7EB] text-[#111827]/72 hover:border-[#111827]/20 transition-all">
            <RefreshCw className="w-4 h-4"/> 다시 찍기
          </button>
          <button onClick={handleSubmit}
            className="cta-btn flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm"
            style={{ background:`linear-gradient(135deg,${T.green},${T.emerald})`, boxShadow:`0 6px 24px ${T.green}40` }}>
            사진 제출 <ArrowRight className="w-4 h-4"/>
          </button>
        </div>
      )}

      {(ps === "checking" || ps === "verified") && (
        <button disabled
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base text-white opacity-60 cursor-not-allowed"
          style={{ background:`linear-gradient(135deg,${T.green},${T.emerald})` }}>
          {ps==="checking"?<><Loader2 className="w-5 h-5 spin-slow"/> 확인 중...</>:<><CheckCircle2 className="w-5 h-5"/> 인증 완료!</>}
        </button>
      )}
    </main>
  );
}

// ── Screen 5: 보상 ────────────────────────────────────────────────────────────

function ConfettiLayer() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {CONFETTI.map(p=>(
        <div key={p.id} className="confetti-piece absolute rounded-sm"
          style={{
            left:p.left, top:"-12px", width:p.size, height:p.size+4,
            backgroundColor:p.color,
            transform:p.skew,
            "--dur":p.duration, "--delay":p.delay,
          } as React.CSSProperties}/>
      ))}
    </div>
  );
}

function RewardScreen({ subjectId, missionText, onNext, onFinish, exp, awardedExp, multiplier }: {
  subjectId:string; missionText:string; onNext:()=>void; onFinish:()=>void; exp:number;
  awardedExp:number; multiplier:number;
}) {
  const subject = EXAM_SUBJECTS.find(s=>s.id===subjectId) ?? EXAM_SUBJECTS[0];
  const Icon    = subject.icon;

  return (
    <>
      <ConfettiLayer/>
      <main className="max-w-[560px] mx-auto px-4 sm:px-6 py-6 pb-12 space-y-4 relative z-10">

        {/* Celebration hero */}
        <div className="relative rounded-3xl overflow-hidden py-10 px-8 text-center"
          style={{ background:"linear-gradient(145deg,#1a40c4 0%,#2563EB 42%,#10B981 100%)", boxShadow:"0 8px 48px rgba(37,99,235,0.30)" }}>
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-white/6 pointer-events-none"/>
          <div className="relative z-10">
            <SeedCharacterCelebrating className="w-32 h-auto mx-auto mb-4 drop-shadow-xl float-soft"/>
            <div className="exp-pop inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/20 border border-white/30 mb-4">
              <Zap className="w-5 h-5 text-[#FCD34D]" fill="#FCD34D"/>
              <span className="text-white text-xl font-bold">+{awardedExp} EXP 획득!</span>
            </div>
            {multiplier > 1 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FCD34D]/20 border border-[#FCD34D]/40 mb-3">
                <span className="text-sm">🔥</span>
                <span className="text-[#FDE68A] text-[13px] font-bold">연속 완료 보너스 ×{multiplier} 적용!</span>
              </div>
            )}
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight tracking-tight mb-2">
              오늘의 미션 완료!
            </h2>
            <p className="text-white/65 text-sm">{subject.name} · {missionText}</p>
          </div>
        </div>

        {/* Rewards */}
        <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
          <p className="text-[13px] font-bold text-[#111827]/52 uppercase tracking-wider mb-4">획득한 보상</p>
          <div className="space-y-3">
            <div className="leaf-grow flex items-center gap-3 p-4 rounded-2xl bg-[#D1FAE5] border border-[#10B981]/15">
              <div className="w-10 h-10 rounded-xl bg-[#10B981] flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-white"/>
              </div>
              <div>
                <p className="font-bold text-[#065F46]">새잎 생성</p>
                <p className="text-[13px] text-[#065F46]/60 mt-0.5">나무에 새잎이 생겨났어요</p>
              </div>
              <span className="ml-auto text-xl">🌱</span>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#EFF6FF] border border-[#2563EB]/10">
              <div className="w-10 h-10 rounded-xl bg-[#2563EB] flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-white" fill="white"/>
              </div>
              <div>
                <p className="font-bold text-[#1E40AF]">경험치 +{awardedExp}</p>
                <p className="text-[13px] text-[#1E40AF]/60 mt-0.5">다음 레벨까지 한 걸음 더!</p>
              </div>
              <span className="ml-auto text-sm font-bold text-[#2563EB]">{exp.toLocaleString()} XP</span>
            </div>
          </div>
        </div>

        {/* Mom message */}
        <div className="relative rounded-3xl p-6 overflow-hidden"
          style={{ background:"linear-gradient(140deg,#FFF5F7,#FFF0F2 50%,#FFE4E8)", boxShadow:"0 4px 28px rgba(225,29,72,0.10)", border:"1px solid rgba(225,29,72,0.08)" }}>
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-[#E11D48]/06 pointer-events-none"/>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-5 h-5 text-[#E11D48]" fill="#E11D48"/>
              <p className="text-sm font-bold text-[#881337]">엄마의 메시지</p>
            </div>
            <blockquote className="text-[1.15rem] leading-[1.8] text-[#881337]/85">
              "우현아 정말 잘했어!<br/>엄마가 너무 자랑스러워."
            </blockquote>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3 pt-2">
          <button onClick={onNext}
            className="cta-btn w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 36px rgba(37,99,235,0.38)" }}>
            다음 과목 하기 <ArrowRight className="w-5 h-5"/>
          </button>
          <button onClick={onFinish}
            className="w-full flex items-center justify-center py-3.5 rounded-2xl font-bold text-sm text-[#111827]/72 border-2 border-[#E5E7EB] hover:border-[#111827]/20 hover:text-[#111827] transition-all">
            오늘 마무리
          </button>
        </div>
      </main>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFLECTION SCREEN — 오늘 하루 돌아보기
// ═══════════════════════════════════════════════════════════════════════════════

// ── Section 1: Celebration Summary ───────────────────────────────────────────

function CelebrationSummaryCard({ todayXP, streak, exp }: { todayXP:number; streak:number; exp:number }) {
  const lvl = getLevelInfo(exp);
  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
      {/* Ambient blobs */}
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none"/>
      <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-white/4 pointer-events-none"/>

      {/* Mini confetti inside card */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {MINI_CONFETTI.map(p => (
          <div key={p.id} className="mini-float absolute rounded-sm"
            style={{
              left:p.left, top:p.top, width:p.size, height:p.size+3,
              backgroundColor:p.color,
              "--dur":p.dur, "--delay":p.delay,
            } as React.CSSProperties}/>
        ))}
      </div>

      <div className="relative z-10 p-7 md:p-10">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10">
          {/* Mascot */}
          <div className="flex-shrink-0 float-soft">
            <SeedCharacterCelebrating className="w-32 md:w-36 h-auto drop-shadow-xl"/>
          </div>

          {/* Content */}
          <div className="flex-1 text-center md:text-left">
            {/* Greeting */}
            <p className="text-white/55 text-sm font-semibold mb-2 uppercase tracking-wider">오늘 하루도 수고했어</p>
            <h1 className="text-[1.9rem] md:text-[2.4rem] font-bold text-white leading-tight tracking-tight mb-2">
              오늘도 잘했어 우현 😊
            </h1>
            <p className="text-white/62 text-[0.95rem] leading-relaxed mb-6">
              오늘도 한 걸음 성장했어.
            </p>

            {/* Stat badges */}
            <div className="flex flex-wrap justify-center md:justify-start gap-2.5">
              {/* XP */}
              <div className="flex items-center gap-2 bg-white/16 backdrop-blur-sm rounded-2xl px-4 py-2.5 border border-white/14">
                <div className="w-7 h-7 rounded-xl bg-[#F59E0B] flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" fill="white"/>
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-none">+{todayXP} XP</p>
                  <p className="text-white/42 text-[12px] mt-0.5">오늘 획득</p>
                </div>
              </div>
              {/* Streak */}
              <div className="flex items-center gap-2 bg-white/16 backdrop-blur-sm rounded-2xl px-4 py-2.5 border border-white/14">
                <div className="w-7 h-7 rounded-xl bg-[#EF4444] flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5 text-white"/>
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-none">{streak}일 연속</p>
                  <p className="text-white/42 text-[12px] mt-0.5">연속 기록</p>
                </div>
              </div>
              {/* Level */}
              <div className="flex items-center gap-2 bg-white/16 backdrop-blur-sm rounded-2xl px-4 py-2.5 border border-white/14">
                <div className="w-7 h-7 rounded-xl bg-[#10B981] flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 text-white" fill="white"/>
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-none">Lv.{lvl.level}</p>
                  <p className="text-white/42 text-[12px] mt-0.5">{lvl.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section 2: Emotion Check ──────────────────────────────────────────────────

const EMOTIONS = [
  { emoji:"😁", label:"최고야!", color:T.blue,   bg:"#EFF6FF" },
  { emoji:"🙂", label:"좋아",   color:T.green,  bg:"#D1FAE5" },
  { emoji:"😐", label:"그냥",   color:T.amber,  bg:"#FEF3C7" },
  { emoji:"😥", label:"힘들어", color:"#F97316", bg:"#FFF7ED" },
  { emoji:"😭", label:"힘들었어", color:T.rose,  bg:"#FFF1F2" },
];

function EmotionCheck({
  selected, onSelect,
}: { selected:number|null; onSelect:(i:number)=>void }) {
  const [animating, setAnimating] = useState<number|null>(null);

  const handleSelect = (i: number) => {
    onSelect(i);
    setAnimating(i);
    setTimeout(() => setAnimating(null), 400);
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-3xl p-6"
      style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">감정 체크</p>
      <h3 className="text-[1.15rem] font-bold text-[#111827] mb-5">오늘 기분은 어땠어?</h3>

      <div className="flex items-stretch gap-2">
        {EMOTIONS.map((e, i) => {
          const isSelected = selected === i;
          return (
            <button key={i} onClick={() => handleSelect(i)}
              className={`emotion-btn flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border-2 ${
                animating === i ? "emotion-pop" : ""
              }`}
              style={{
                backgroundColor: isSelected ? e.bg : "transparent",
                borderColor:     isSelected ? `${e.color}28` : "rgba(17,24,39,0.06)",
                boxShadow:       isSelected ? `0 4px 18px ${e.color}20` : "none",
                transform:       isSelected ? "scale(1.06)" : "scale(1)",
              }}>
              <span className="text-[1.8rem] leading-none">{e.emoji}</span>
              <span className="text-[12px] font-bold leading-tight text-center"
                style={{ color: isSelected ? e.color : "#111827", opacity: isSelected ? 1 : 0.38 }}>
                {e.label}
              </span>
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className="mt-4 px-4 py-2.5 rounded-xl fade-in-up"
          style={{ backgroundColor:`${EMOTIONS[selected].color}0D` }}>
          <p className="text-[12px] font-semibold text-center" style={{ color:EMOTIONS[selected].color }}>
            {selected===0?"오늘 정말 잘했어! 내일도 이 기분으로!":
             selected===1?"좋은 하루였어. 내일도 화이팅!":
             selected===2?"그래도 끝까지 해낸 거 잘했어!":
             selected===3?"힘들었지만 포기하지 않았잖아. 대단해!":
             "많이 힘들었구나. 쉬고 내일 다시 해보자."}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Section 3: Difficult Subject Picker ───────────────────────────────────────

function HardSubjectPicker({
  selected, onSelect,
}: { selected:string|null; onSelect:(s:string)=>void }) {
  const subjects = ["수학","영어","과학","역사","도덕"];
  return (
    <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-3xl p-6"
      style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">오늘의 돌아보기</p>
      <h3 className="text-[1.15rem] font-bold text-[#111827] mb-5">오늘 가장 어려웠던 과목은?</h3>

      <div className="flex flex-wrap gap-2.5">
        {subjects.map(s => {
          const { color, bg } = CHIP_COLORS[s];
          const isSelected    = selected === s;
          return (
            <button key={s} onClick={() => onSelect(s)}
              className="chip-btn px-5 py-2.5 rounded-2xl font-bold text-sm"
              style={{
                backgroundColor: isSelected ? color : bg,
                color:           isSelected ? "white" : color,
                boxShadow:       isSelected ? `0 6px 18px ${color}35` : "none",
                transform:       isSelected ? "scale(1.04)" : "scale(1)",
              }}>
              {s}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 fade-in-up">
          <p className="text-[12px] text-[#111827]/62 leading-relaxed px-1">
            <span className="font-semibold" style={{ color:CHIP_COLORS[selected].color }}>{selected}</span>
            {" "}가 어려웠구나. 내일 다시 도전해보자!
          </p>
        </div>
      )}
    </div>
  );
}

// ── Section 4: Journal ────────────────────────────────────────────────────────

function JournalCard({
  value, onChange,
}: { value:string; onChange:(v:string)=>void }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-3xl p-6"
      style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">오늘의 일기</p>
      <h3 className="text-[1.15rem] font-bold text-[#111827] mb-4">오늘 나에게 한마디</h3>

      <div className="relative">
        {/* Decorative quote marks */}
        <div className="absolute top-3 left-4 text-4xl leading-none text-[#111827]/06 select-none pointer-events-none"
           aria-hidden="true">
          "
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="오늘 가장 기억에 남는 일을 적어보자."
          maxLength={200}
          className="textarea-styled w-full rounded-2xl px-5 pt-8 pb-4 text-[#111827] text-sm leading-[1.75] resize-none"
          style={{ minHeight:132 }}
        />
        {/* Closing quote */}
        <div className="absolute bottom-4 right-4 text-4xl leading-none text-[#111827]/06 select-none pointer-events-none"
           aria-hidden="true">
          "
        </div>
      </div>

      <div className="flex items-center justify-between mt-2.5 px-1">
        <p className="text-[13px] text-[#111827]/48">
          {value.length === 0 ? "자유롭게 적어보세요." : `${value.length}자 입력 중`}
        </p>
        <span className="text-[13px] font-mono text-[#111827]/45">{value.length} / 200</span>
      </div>
    </div>
  );
}

// ── Section 5: Mom Message (pink glass) ───────────────────────────────────────

function ReflectionMomCard() {
  return (
    <div className="relative rounded-3xl p-7 overflow-hidden"
      style={{
        background:"linear-gradient(145deg,#FFF1F4 0%,#FFE4EA 45%,#FECDD3 100%)",
        boxShadow:"0 6px 36px rgba(225,29,72,0.13)",
        border:"1.5px solid rgba(225,29,72,0.09)",
        backdropFilter:"blur(20px)",
      }}>
      {/* Radial glow blobs */}
      <div className="absolute -right-14 -top-14 w-52 h-52 rounded-full pointer-events-none"
        style={{ background:"radial-gradient(circle,rgba(225,29,72,0.10) 0%,transparent 70%)" }}/>
      <div className="absolute -left-10 -bottom-10 w-36 h-36 rounded-full pointer-events-none"
        style={{ background:"radial-gradient(circle,rgba(251,113,133,0.10) 0%,transparent 70%)" }}/>

      {/* Large decorative heart */}
      <div className="absolute right-6 bottom-6 pointer-events-none" aria-hidden="true">
        <Heart className="w-20 h-20" style={{ color:"rgba(225,29,72,0.07)" }} fill="rgba(225,29,72,0.06)"/>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background:"linear-gradient(135deg,#FB7185,#E11D48)", boxShadow:"0 4px 16px rgba(225,29,72,0.28)" }}>
            <Heart className="w-5 h-5 text-white" fill="white"/>
          </div>
          <div>
            <p className="text-sm font-bold text-[#881337]">엄마의 메시지</p>
            <p className="text-[13px] text-[#9F1239]/45">오늘 공부 끝나고 도착했어요</p>
          </div>
        </div>

        {/* Quote */}
        <blockquote className="text-[1.1rem] md:text-[1.18rem] leading-[1.9] text-[#881337]/82">
          "우현아.
          <br/>오늘도 끝까지 해낸 너가 정말 자랑스러워.
          <br/>결과보다 끝낸 것이 더 중요해."
        </blockquote>

        {/* Footer */}
        <div className="flex items-center gap-2.5 mt-6 pt-4 border-t border-[#E11D48]/08">
          <div className="flex gap-1">
            {[0,1,2].map(i => <Heart key={i} className="w-4 h-4 text-[#FB7185]" fill="#FB7185"/>)}
          </div>
          <span className="text-[13px] text-[#9F1239]/35 ml-auto font-medium">엄마가 우현이에게</span>
        </div>
      </div>
    </div>
  );
}

// ── Section 6: Tomorrow Preview ───────────────────────────────────────────────

function TomorrowPreviewCard() {
  const tmSubjects = ["수학","영어","과학"];
  return (
    <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-3xl p-6"
      style={{ boxShadow:T.cardShadow }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-1.5">내일을 미리 보기</p>
          <h3 className="text-[1.15rem] font-bold text-[#111827]">내일의 미리보기</h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/12">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"/>
          <span className="text-[13px] font-bold text-[#2563EB]">Day 19</span>
        </div>
      </div>

      {/* Subject chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {tmSubjects.map(s => {
          const { color, bg } = CHIP_COLORS[s];
          return (
            <div key={s} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl"
              style={{ backgroundColor:bg, border:`1px solid ${color}20` }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor:color }}/>
              <span className="text-sm font-semibold" style={{ color }}>{s}</span>
            </div>
          );
        })}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#F8FAFC] border border-[#111827]/05">
          <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-[#2563EB]"/>
          </div>
          <div>
            <p className="text-base font-bold text-[#111827]">45분</p>
            <p className="text-[12px] text-[#111827]/60">예상 공부시간</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#FEF3C7] border border-[#F59E0B]/15">
          <div className="w-9 h-9 rounded-xl bg-[#F59E0B] flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" fill="white"/>
          </div>
          <div>
            <p className="text-base font-bold text-[#92400E]">+140 XP</p>
            <p className="text-[12px] text-[#92400E]/50">내일 보상</p>
          </div>
        </div>
      </div>

      {/* Motivational footer */}
      <div className="mt-4 px-4 py-3 rounded-xl" style={{ background:"linear-gradient(135deg,#EFF6FF,#EDE9FE)" }}>
        <p className="text-[12px] text-[#2563EB]/75 text-center font-semibold leading-relaxed">
          내일도 오늘처럼 할 수 있어. 우현 화이팅! 🌱
        </p>
      </div>
    </div>
  );
}

// ── Assembled ReflectionScreen ────────────────────────────────────────────────

function ReflectionScreen({ onFinish, todayXP, streak, exp }: {
  onFinish:()=>void; todayXP:number; streak:number; exp:number;
}) {
  const [emotion,      setEmotion]      = useState<number|null>(null);
  const [hardSubject,  setHardSubject]  = useState<string|null>(null);
  const [journal,      setJournal]      = useState("");
  const [finishing,    setFinishing]    = useState(false);

  const handleFinish = () => {
    setFinishing(true);
    setTimeout(() => onFinish(), 350);
  };

  return (
    <>
      {/* Page */}
      <main
        className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 pb-40 space-y-5"
        style={{ opacity:finishing ? 0 : 1, transition:"opacity 0.35s ease" }}
      >
        {/* S1: Celebration */}
        <CelebrationSummaryCard todayXP={todayXP} streak={streak} exp={exp}/>

        {/* S2 + S3: 2-col on md+, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <EmotionCheck selected={emotion} onSelect={setEmotion}/>
          <HardSubjectPicker selected={hardSubject} onSelect={setHardSubject}/>
        </div>

        {/* S4: Journal */}
        <JournalCard value={journal} onChange={setJournal}/>

        {/* S5: Mom message */}
        <ReflectionMomCard/>

        {/* S6: Tomorrow */}
        <TomorrowPreviewCard/>

        {/* Desktop CTA — in-flow */}
        <div className="hidden lg:block pt-2 pb-4">
          <button onClick={handleFinish}
            className="cta-btn w-full flex items-center justify-center gap-3 py-[18px] rounded-2xl text-white font-bold text-base"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 40px rgba(37,99,235,0.38)" }}>
            오늘 마무리하기
            <ArrowRight className="w-5 h-5"/>
          </button>
        </div>
      </main>

      {/* Mobile / tablet — sticky CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom:"env(safe-area-inset-bottom)" }}>
        <div className="backdrop-blur-2xl bg-[#F8FAFC]/92 border-t border-black/5 px-4 pt-4 pb-4"
          style={{ boxShadow:"0 -8px 32px rgba(17,24,39,0.09)" }}>
          <button onClick={handleFinish}
            className="cta-btn w-full flex items-center justify-center gap-3 py-[18px] rounded-2xl text-white font-bold text-base"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 40px rgba(37,99,235,0.38)" }}>
            오늘 마무리하기
            <ArrowRight className="w-5 h-5"/>
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY REVIEW SCREEN — 오늘 하루 돌아보기
// Mobile-first · 375px · Accessible from 복습 tab
// ═══════════════════════════════════════════════════════════════════════════════

// ── DR Section 1: Celebration Card (Blue → Green gradient) ────────────────────

function DRCelebrationCard() {
  const STATS: Array<{ value: string; label: string; Icon: LucideIcon; iconColor: string; bg: string }> = [
    { value:"+120 XP",     label:"오늘 획득",  Icon:Zap,        iconColor:"#FCD34D", bg:"rgba(252,211,77,0.18)"  },
    { value:"🌱 새잎 성장", label:"레벨 성장",  Icon:TrendingUp,  iconColor:"#4ADE80", bg:"rgba(74,222,128,0.16)"  },
    { value:"🔥 8일 연속",  label:"스트릭",    Icon:Flame,       iconColor:"#F97316", bg:"rgba(249,115,22,0.16)"  },
    { value:"Level 4",     label:"새싹나무",   Icon:Star,        iconColor:"#A78BFA", bg:"rgba(167,139,250,0.16)" },
  ];

  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(145deg, #1a3fba 0%, #2563EB 36%, #059669 100%)",
        boxShadow:  "0 8px 52px rgba(37,99,235,0.28)",
      }}>
      {/* Ambient blobs */}
      <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full bg-white/4 pointer-events-none"/>
      <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/3 pointer-events-none"/>

      {/* Contained mini confetti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {MINI_CONFETTI.slice(0,12).map(p=>(
          <div key={p.id} className="mini-float absolute rounded-sm"
            style={{ left:p.left, top:p.top, width:p.size, height:p.size+3,
              backgroundColor:p.color, "--dur":p.dur, "--delay":p.delay } as React.CSSProperties}/>
        ))}
      </div>

      <div className="relative z-10 p-6">
        {/* Mascot + heading row */}
        <div className="flex items-center gap-4 mb-5">
          <SeedCharacterCelebrating className="w-[76px] h-auto drop-shadow-xl float-soft flex-shrink-0"/>
          <div>
            <p className="text-white/50 text-[13px] font-semibold uppercase tracking-wider mb-1">오늘의 성과</p>
            <p className="text-[1.15rem] font-bold text-white leading-tight tracking-tight">
              오늘도 잘했어 우현!
            </p>
          </div>
        </div>

        {/* 2 × 2 stat grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {STATS.map(({ value, label, Icon, iconColor, bg }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3"
              style={{ backgroundColor:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.10)" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor:bg }}>
                <Icon className="w-4 h-4" style={{ color:iconColor }}/>
              </div>
              <div>
                <p className="text-white font-bold text-[0.88rem] leading-none">{value}</p>
                <p className="text-white/42 text-[12px] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DR Section 2: Emotion Check (single select) ───────────────────────────────

const DR_EMOTIONS = [
  { emoji:"😁", label:"최고야!", color:T.blue,    bg:"#EFF6FF" },
  { emoji:"😀", label:"좋아",   color:T.green,   bg:"#D1FAE5" },
  { emoji:"😐", label:"그냥",   color:T.amber,   bg:"#FEF3C7" },
  { emoji:"😥", label:"힘들어", color:"#F97316", bg:"#FFF7ED" },
  { emoji:"😭", label:"너무 힘들어", color:T.rose, bg:"#FFF1F2" },
];

const DR_EMOTION_MESSAGES = [
  "오늘 최고의 날이었어! 내일도 이 기분으로!",
  "좋은 하루였구나. 내일도 화이팅!",
  "그래도 끝까지 해냈잖아. 대단해!",
  "힘들었지만 포기하지 않았어. 멋져!",
  "많이 힘들었구나. 충분히 쉬고 내일 해보자.",
];

function DREmotionCheck({
  selected, onSelect,
}: { selected:number|null; onSelect:(i:number)=>void }) {
  const [animIdx, setAnimIdx] = useState<number|null>(null);

  const handleSelect = (i: number) => {
    onSelect(i);
    setAnimIdx(i);
    setTimeout(() => setAnimIdx(null), 420);
  };

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">감정 체크</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-5">오늘 기분은 어땠나요?</h3>

      {/* Emoji row */}
      <div className="flex items-stretch gap-2">
        {DR_EMOTIONS.map((e, i) => {
          const isSelected = selected === i;
          return (
            <button key={i} onClick={() => handleSelect(i)}
              className={`emotion-btn flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl border-2 ${
                animIdx === i ? "emotion-pop" : ""
              }`}
              style={{
                backgroundColor: isSelected ? e.bg : "transparent",
                borderColor:     isSelected ? `${e.color}32` : "rgba(17,24,39,0.06)",
                boxShadow:       isSelected ? `0 4px 18px ${e.color}22` : "none",
                transform:       isSelected && animIdx !== i ? "scale(1.05)" : "scale(1)",
              }}>
              <span className="text-[2rem] leading-none">{e.emoji}</span>
              <span className="text-[12px] font-bold leading-tight text-center"
                style={{ color: isSelected ? e.color : "rgba(17,24,39,0.32)" }}>
                {e.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contextual response */}
      {selected !== null && (
        <div className="mt-4 px-4 py-2.5 rounded-2xl fade-in-up"
          style={{ backgroundColor:`${DR_EMOTIONS[selected].color}10` }}>
          <p className="text-[12px] font-semibold text-center leading-snug"
            style={{ color:DR_EMOTIONS[selected].color }}>
            {DR_EMOTION_MESSAGES[selected]}
          </p>
        </div>
      )}
    </div>
  );
}

// ── DR Section 3: Subject Chips (multiple select) ─────────────────────────────

function DRSubjectChips({
  selected, onToggle,
}: { selected:Set<string>; onToggle:(s:string)=>void }) {
  const SUBJECTS = ["수학","영어","과학","역사","도덕"];
  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">오늘의 돌아보기</p>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[#111827] text-[1.15rem]">오늘 가장 어려웠던 과목</h3>
        {selected.size > 0 && (
          <span className="text-[13px] font-bold px-2.5 py-1 rounded-full fade-in-up"
            style={{ backgroundColor:`${T.blue}14`, color:T.blue }}>
            {selected.size}개 선택
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {SUBJECTS.map(s => {
          const { color, bg } = CHIP_COLORS[s];
          const isSelected    = selected.has(s);
          return (
            <button key={s} onClick={() => onToggle(s)}
              className="chip-btn px-5 py-2.5 rounded-2xl font-bold text-sm"
              style={{
                backgroundColor: isSelected ? color : bg,
                color:           isSelected ? "white" : color,
                boxShadow:       isSelected ? `0 4px 16px ${color}38` : "none",
                transform:       isSelected ? "scale(1.04)" : "scale(1)",
              }}>
              {s}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[13px] text-[#111827]/48">복수 선택 가능해요</p>
    </div>
  );
}

// ── DR Section 4a: Progress Bar ──────────────────────────────────────────────

function DRProgressBar() {
  const day = 18;
  const total = 42;
  const pct = (day / total) * 100;
  return (
    <div
      className="bg-white/68 backdrop-blur-xl border border-white/80 rounded-2xl px-5 py-4"
      style={{ boxShadow:"0 2px 14px rgba(17,24,39,0.05)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-[#111827]/58 uppercase tracking-wider">
          42일 프로젝트
        </span>
        <span className="text-[13px] font-bold font-mono" style={{ color:T.blue }}>
          Day {day} / {total}
        </span>
      </div>
      <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width:`${pct}%`,
            background:`linear-gradient(90deg,${T.blue},${T.indigo})`,
            transition:"width 0.8s ease",
          }}
        />
      </div>
      <p className="text-[12px] text-[#111827]/45 mt-1.5 text-right font-mono">
        {Math.round(pct)}% 완료
      </p>
    </div>
  );
}

// ── DR Section 4b: Quick Reflection Cards (replaces textarea) ─────────────────

const DR_REFLECTION_PROMPTS: Array<{
  title: string; placeholder: string; icon: LucideIcon; color: string;
}> = [
  { title:"오늘 가장 잘한 것",    placeholder:"오늘 잘한 것을 적어보세요.",   icon:Star,       color:T.green  },
  { title:"오늘 가장 어려웠던 것", placeholder:"어려웠던 점을 적어보세요.",   icon:Zap,        color:T.amber  },
  { title:"내일 꼭 할 것",        placeholder:"내일 할 것을 적어보세요.",    icon:Sun,        color:T.blue   },
];

function DRReflectionCards({
  values, onChange,
}: { values:string[]; onChange:(i:number, v:string)=>void }) {
  const [activeIdx, setActiveIdx] = useState<number|null>(null);

  const handleTap = (i: number) =>
    setActiveIdx(prev => prev === i ? null : i);

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">빠른 회고</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">오늘을 돌아봐요</h3>

      <div className="space-y-2.5">
        {DR_REFLECTION_PROMPTS.map(({ title, placeholder, icon:Icon, color }, i) => {
          const isActive = activeIdx === i;
          const hasValue = values[i].trim().length > 0;

          return (
            <div
              key={i}
              className="rounded-2xl border-2 overflow-hidden"
              style={{
                borderColor:     isActive ? `${color}48` : hasValue ? `${color}30` : "rgba(17,24,39,0.07)",
                backgroundColor: isActive ? `${color}07` : hasValue ? `${color}05` : "rgba(248,250,252,0.72)",
                transition:      "border-color 0.18s ease, background-color 0.18s ease",
              }}
            >
              {/* Tappable header row */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                onClick={() => handleTap(i)}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: isActive
                      ? `${color}20`
                      : hasValue ? `${color}16` : "rgba(17,24,39,0.06)",
                  }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color: isActive || hasValue ? color : "rgba(17,24,39,0.32)" }}
                    fill={hasValue && !isActive ? color : "none"}
                  />
                </div>
                <p
                  className="text-sm font-bold flex-1 text-left"
                  style={{ color: isActive ? color : hasValue ? T.text : "rgba(17,24,39,0.62)" }}
                >
                  {title}
                </p>
                <span
                  className="text-[13px] flex-shrink-0 font-semibold"
                  style={{ color: hasValue ? T.green : "rgba(17,24,39,0.28)" }}
                >
                  {hasValue ? "✓" : isActive ? "닫기" : "작성하기"}
                </span>
              </button>

              {/* Smooth expand / collapse */}
              <div style={{ maxHeight:isActive?"180px":"0px", overflow:"hidden", transition:"max-height 0.26s ease" }}>
                <div className="px-4 pb-4">
                  <textarea
                    value={values[i]}
                    onChange={e => onChange(i, e.target.value)}
                    placeholder={placeholder}
                    maxLength={100}
                    autoFocus={isActive}
                    className="textarea-styled w-full rounded-xl px-3.5 py-3 text-[#111827] text-[0.875rem] leading-relaxed resize-none"
                    style={{ minHeight:72 }}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-[12px] font-mono text-[#111827]/42">{values[i].length} / 100</span>
                  </div>
                </div>
              </div>

              {/* Collapsed value preview */}
              {!isActive && hasValue && (
                <p className="px-4 pb-3.5 text-[0.875rem] text-[#111827]/70 -mt-0.5 leading-snug">
                  {values[i]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DR Section 5: Mom's Glass Card ───────────────────────────────────────────

function DRMomCard() {
  return (
    <div className="relative rounded-3xl overflow-hidden p-6"
      style={{
        background:     "linear-gradient(145deg, rgba(255,241,244,0.90) 0%, rgba(254,228,232,0.84) 100%)",
        backdropFilter: "blur(20px)",
        border:         "1.5px solid rgba(225,29,72,0.10)",
        boxShadow:      "0 6px 36px rgba(225,29,72,0.13)",
      }}>
      {/* Glow blobs */}
      <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full pointer-events-none"
        style={{ background:"radial-gradient(circle,rgba(225,29,72,0.10) 0%,transparent 70%)" }}/>
      <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background:"radial-gradient(circle,rgba(251,113,133,0.08) 0%,transparent 70%)" }}/>

      {/* Large decorative heart */}
      <div className="absolute right-5 bottom-5 pointer-events-none" aria-hidden="true">
        <Heart className="w-16 h-16" style={{ color:"rgba(225,29,72,0.07)" }} fill="rgba(225,29,72,0.07)"/>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background:"linear-gradient(135deg,#FB7185,#E11D48)", boxShadow:"0 4px 16px rgba(225,29,72,0.28)" }}>
            <Heart className="w-5 h-5 text-white" fill="white"/>
          </div>
          <div>
            <p className="text-sm font-bold text-[#881337]">엄마의 응원 ❤️</p>
            <p className="text-[13px] text-[#9F1239]/42">공부 끝나고 도착한 메시지</p>
          </div>
        </div>

        {/* Message */}
        <blockquote
          className="text-[1.15rem] leading-[1.9] text-[#881337]/84">
          "우현아,
          <br/>오늘도 끝까지 해낸 것이 정말 멋졌어.
          <br/>결과보다 끝까지 한 것이 더 중요해."
        </blockquote>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[#E11D48]/08">
          <div className="flex gap-1">
            {[0,1,2].map(i=><Heart key={i} className="w-3.5 h-3.5 text-[#FB7185]" fill="#FB7185"/>)}
          </div>
          <span className="ml-auto text-[13px] text-[#9F1239]/35">엄마가 우현이를 위해</span>
        </div>
      </div>
    </div>
  );
}

// ── DR Section 6: Today's Growth ─────────────────────────────────────────────

function DROdayGrowthCard() {
  const ITEMS: Array<{
    text: string; sub: string; icon: LucideIcon; color: string; bg: string;
  }> = [
    { text:"+120 XP",       sub:"경험치 획득",    icon:Zap,        color:T.amber,   bg:"#FEF3C7" },
    { text:"🌱 새잎 1개 성장", sub:"나무가 자랐어요", icon:TrendingUp,  color:T.green,   bg:"#D1FAE5" },
    { text:"🔥 연속 학습 8일", sub:"스트릭 기록",   icon:Flame,      color:"#F97316", bg:"#FFF7ED" },
  ];

  return (
    <div
      className={`${T.glassCard} rounded-3xl p-6`}
      style={{ boxShadow:T.cardShadow }}
    >
      {/* Header with green accent bar */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor:T.green }}/>
        <h3 className="font-bold text-[#111827] text-[1.15rem]">오늘의 성장</h3>
      </div>

      {/* Growth items */}
      <div className="space-y-2.5">
        {ITEMS.map(({ text, sub, icon:Icon, color, bg }) => (
          <div
            key={text}
            className="flex items-center gap-3 p-3.5 rounded-2xl"
            style={{ backgroundColor:bg, border:`1px solid ${color}1A` }}
          >
            {/* Icon badge */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor:`${color}22` }}
            >
              <Icon className="w-4 h-4" style={{ color }}/>
            </div>

            {/* Text */}
            <div>
              <p className="font-bold text-[#111827] text-sm leading-tight">{text}</p>
              <p className="text-[12px] text-[#111827]/65 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DailyReviewScreen — assembled ─────────────────────────────────────────────

function DailyReviewScreen({ onFinish }: { onFinish:()=>void }) {
  const [emotion,      setEmotion]      = useState<number|null>(null);
  const [hardSubjects, setHardSubjects] = useState<Set<string>>(new Set<string>());
  const [reflections,  setReflections]  = useState(["","",""]);
  const [leaving,      setLeaving]      = useState(false);

  const toggleSubject = (s: string) =>
    setHardSubjects(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  const updateReflection = (i: number, v: string) =>
    setReflections(prev => prev.map((x, j) => j === i ? v : x));

  const handleFinish = () => {
    setLeaving(true);
    setTimeout(onFinish, 320);
  };

  return (
    <>
      {/* ── Scrollable content — mobile-first 375px ── */}
      <main
        className="max-w-[600px] mx-auto px-4 sm:px-5 pt-5 pb-44 space-y-4"
        style={{ opacity:leaving ? 0 : 1, transition:"opacity 0.32s ease" }}
      >
        {/* Page subtitle */}
        <div className="text-center pt-1 pb-1">
          <p className="text-[0.875rem] font-semibold text-[#111827]/62 leading-snug">
            오늘도 한 걸음 성장했어요 🌱
          </p>
        </div>

        {/* 42-day progress bar */}
        <DRProgressBar/>

        {/* S1 · Celebration */}
        <DRCelebrationCard/>

        {/* S2 · Emotion check */}
        <DREmotionCheck selected={emotion} onSelect={setEmotion}/>

        {/* S3 · Hard subject chips */}
        <DRSubjectChips selected={hardSubjects} onToggle={toggleSubject}/>

        {/* S4 · Quick reflection cards */}
        <DRReflectionCards values={reflections} onChange={updateReflection}/>

        {/* S5 · Mom's message */}
        <DRMomCard/>

        {/* S6 · Today's growth (replaces tomorrow preview) */}
        <DROdayGrowthCard/>
      </main>

      {/* ── Sticky full-width primary CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-[600px] mx-auto">
          <div
            className="backdrop-blur-2xl bg-[#F8FAFC]/92 border-t border-black/5 px-4 pt-4"
            style={{
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              boxShadow:     "0 -8px 32px rgba(17,24,39,0.09)",
            }}
          >
            {/* Small motivational text above button */}
            <p className="text-center text-[12px] font-semibold text-[#111827]/58 mb-3 tracking-wide">
              내일도 함께 성장해요 🌱
            </p>

            <button
              onClick={handleFinish}
              className="cta-btn w-full flex items-center justify-center gap-3 py-[17px] rounded-2xl text-white font-bold text-base"
              style={{
                background: `linear-gradient(135deg, ${T.blue}, ${T.indigo})`,
                boxShadow:  "0 8px 40px rgba(37,99,235,0.40)",
              }}
            >
              오늘 마무리하기
              <ArrowRight className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREE EVOLUTION SCREEN — 나의 성장
// Mobile-first 375px · Accessible from 성장 tab (index 2)
// ═══════════════════════════════════════════════════════════════════════════════

// ── TE Data ──────────────────────────────────────────────────────────────────

const TE_STAGES = [
  { id:"씨앗",     label:"씨앗",    past:true,  current:false },
  { id:"새싹",     label:"새싹",    past:false, current:true  },
  { id:"잎",       label:"잎",      past:false, current:false },
  { id:"작은나무", label:"작은 나무", past:false, current:false },
  { id:"큰나무",   label:"큰 나무", past:false, current:false },
  { id:"꽃",       label:"꽃",      past:false, current:false },
  { id:"열매",     label:"열매",    past:false, current:false },
];

const TE_ACHIEVEMENTS: Array<{
  label:string; icon:string; desc:string; unlocked:boolean;
}> = [
  { label:"첫 공부",    icon:"🏅", desc:"첫 학습 완료",   unlocked:true  },
  { label:"7일 연속",   icon:"🔥", desc:"7일 스트릭",    unlocked:true  },
  { label:"영어 챌린지", icon:"📚", desc:"영어 10회",    unlocked:true  },
  { label:"새싹 달성",  icon:"🌱", desc:"Lv.4 도달",    unlocked:true  },
  { label:"큰 나무",   icon:"🌳", desc:"Lv.10 필요",   unlocked:false },
  { label:"열매 달성",  icon:"🍎", desc:"최고 단계",     unlocked:false },
];

const TE_WEEKLY = [
  { day:"월", xp:80  }, { day:"화", xp:120 }, { day:"수", xp:60  },
  { day:"목", xp:100 }, { day:"금", xp:140 }, { day:"토", xp:90  },
  { day:"일", xp:120, today:true },
];

const TE_PARTICLES = Array.from({ length: 9 }, (_, i) => ({
  id:    i,
  left:  `${12 + i * 9}%`,
  size:  4 + (i * 2) % 6,
  color: ["#4ADE80","#22C55E","#86EFAC","#A7F3D0","#D1FAE5"][i % 5],
  delay: `${i * 0.42}s`,
  dur:   `${3 + (i * 0.38) % 1.6}s`,
}));

// ── TE Large Tree SVG ─────────────────────────────────────────────────────────

function TELargeTree({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 232" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={className} aria-hidden="true">
      {/* Ground glow */}
      <ellipse cx="100" cy="220" rx="70" ry="14" fill="#D1FAE5" fillOpacity="0.65"/>

      {/* Roots */}
      <path d="M88 196 Q72 207 61 212" stroke="#92400E" strokeWidth="4"
        strokeLinecap="round" strokeOpacity="0.32"/>
      <path d="M112 196 Q128 207 139 212" stroke="#92400E" strokeWidth="4"
        strokeLinecap="round" strokeOpacity="0.32"/>

      {/* Trunk */}
      <rect x="89" y="142" width="22" height="78" rx="11" fill="#92400E"/>
      <rect x="93" y="145" width="8" height="74" rx="4" fill="#B45309" fillOpacity="0.36"/>

      {/* Base / wide foliage */}
      <circle cx="100" cy="130" r="52" fill="#15803D"/>
      <circle cx="68"  cy="150" r="36" fill="#16A34A"/>
      <circle cx="132" cy="150" r="36" fill="#15803D"/>

      {/* Main foliage body */}
      <circle cx="100" cy="106" r="46" fill="#22C55E"/>
      <circle cx="76"  cy="90"  r="30" fill="#4ADE80"/>
      <circle cx="124" cy="93"  r="28" fill="#4ADE80"/>

      {/* Upper crown */}
      <circle cx="100" cy="76"  r="38" fill="#4ADE80"/>
      <circle cx="100" cy="58"  r="28" fill="#86EFAC"/>
      <circle cx="100" cy="48"  r="20" fill="#BBF7D0"/>

      {/* Highlights */}
      <circle cx="88"  cy="46" r="7" fill="white" fillOpacity="0.22"/>
      <circle cx="112" cy="56" r="5" fill="white" fillOpacity="0.15"/>
      <circle cx="76"  cy="84" r="4" fill="white" fillOpacity="0.12"/>

      {/* Golden fruits — Level 4 */}
      <circle cx="74"  cy="118" r="6.5" fill="#F59E0B"/>
      <circle cx="126" cy="112" r="6.5" fill="#F59E0B"/>
      <circle cx="100" cy="136" r="6"   fill="#FBBF24"/>
      <circle cx="82"  cy="98"  r="5.5" fill="#F59E0B"/>
      <circle cx="118" cy="103" r="5.5" fill="#F59E0B"/>
      <circle cx="94"  cy="80"  r="5"   fill="#FCD34D"/>
    </svg>
  );
}

// ── TE Section 1: Hero Card ───────────────────────────────────────────────────

function TEHeroCard() {
  const [xpPct, setXpPct] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setXpPct(86), 480);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{
        background:  "linear-gradient(148deg, #EFF6FF 0%, #F0FDF4 50%, #ECFDF5 100%)",
        border:      "1.5px solid rgba(16,185,129,0.14)",
        boxShadow:   "0 6px 40px rgba(16,185,129,0.12), 0 2px 12px rgba(37,99,235,0.06)",
      }}>
      {/* Floating leaf particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {TE_PARTICLES.map(p => (
          <div key={p.id} className="absolute rounded-full particle-rise"
            style={{
              left:p.left, bottom:"38%",
              width:p.size, height:p.size,
              backgroundColor:p.color,
              "--dur":p.dur, "--delay":p.delay,
            } as React.CSSProperties}/>
        ))}
      </div>

      <div className="relative z-10 p-6">
        {/* Stage + Level badges */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#D1FAE5] border border-[#10B981]/20">
            <span className="text-[1rem] leading-none">🌱</span>
            <span className="text-sm font-bold text-[#065F46]">새싹</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/15">
            <Star className="w-3.5 h-3.5 text-[#2563EB]" fill="#2563EB"/>
            <span className="text-sm font-bold text-[#1E40AF]">Level 4</span>
          </div>
        </div>

        {/* Tree — centrepiece with gentle sway */}
        <div className="flex justify-center my-5">
          <TELargeTree className="w-44 h-auto tree-sway drop-shadow-lg"/>
        </div>

        {/* XP Progress */}
        <div className="bg-white/65 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/80"
          style={{ boxShadow:"0 2px 12px rgba(17,24,39,0.05)" }}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[13px] font-semibold text-[#111827]/62 uppercase tracking-wider">
              경험치 (XP)
            </span>
            <span className="text-[13px] font-bold font-mono text-[#2563EB]">860 / 1000</span>
          </div>

          {/* Animated bar */}
          <div className="h-3.5 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div className="h-full rounded-full"
              style={{
                width:`${xpPct}%`,
                background:`linear-gradient(90deg, ${T.green}, #059669 55%, ${T.blue})`,
                transition:"width 1.3s cubic-bezier(0.34,1.56,0.64,1)",
              }}/>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-[12px] text-[#111827]/48 font-mono">Lv.4</span>
            <span className="text-[13px] font-bold text-[#111827]/70">{xpPct}%</span>
            <span className="text-[12px] text-[#111827]/48 font-mono">Lv.5</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TE Section 2: Growth Timeline ─────────────────────────────────────────────

function TEGrowthTimeline() {
  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">성장 단계</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-5">성장 타임라인</h3>

      {/* Horizontal scroll — snaps on mobile */}
      <div className="overflow-x-auto -mx-2 px-2" style={{ scrollbarWidth:"none" }}>
        <div className="flex items-start gap-0 min-w-max">
          {TE_STAGES.map((stage, i) => {
            const isLast = i === TE_STAGES.length - 1;
            return (
              <div key={stage.id} className="flex items-center">
                {/* Node column */}
                <div className="flex flex-col items-center gap-2 w-[68px]">
                  {/* Circle node */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all"
                    style={{
                      backgroundColor: stage.current
                        ? T.green
                        : stage.past
                        ? "#D1FAE5"
                        : "rgba(17,24,39,0.04)",
                      borderColor: stage.current
                        ? T.green
                        : stage.past
                        ? `${T.green}55`
                        : "rgba(17,24,39,0.08)",
                      boxShadow: stage.current
                        ? `0 4px 18px ${T.green}42` : "none",
                    }}>
                    {stage.past ? (
                      <Check className="w-5 h-5 text-[#10B981]"/>
                    ) : stage.current ? (
                      <Star className="w-5 h-5 text-white" fill="white"/>
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-[#111827]/12"/>
                    )}
                  </div>

                  {/* Label */}
                  <span className="text-[13px] font-bold text-center leading-tight"
                    style={{
                      color: stage.current
                        ? T.green
                        : stage.past
                        ? "#065F46"
                        : "rgba(17,24,39,0.30)",
                    }}>
                    {stage.label}
                  </span>

                  {/* "현재" badge */}
                  {stage.current && (
                    <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded-full fade-in-up"
                      style={{ backgroundColor:T.green }}>
                      현재
                    </span>
                  )}
                </div>

                {/* Connector */}
                {!isLast && (
                  <div className="flex-shrink-0 w-5 h-0.5 rounded-full mb-6"
                    style={{ backgroundColor: stage.past ? T.green : "rgba(17,24,39,0.10)" }}/>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TE Section 3: Today's Growth Card ────────────────────────────────────────

function TETodaysGrowthCard() {
  const ITEMS: Array<{
    value:string; label:string; icon:LucideIcon; iconColor:string; bg:string;
  }> = [
    { value:"+120 XP",     label:"경험치 획득",  icon:Zap,        iconColor:"#FCD34D", bg:"rgba(252,211,77,0.18)"  },
    { value:"새잎 +1",     label:"잎이 자랐어요", icon:TrendingUp,  iconColor:"#4ADE80", bg:"rgba(74,222,128,0.16)"  },
    { value:"8일 연속",    label:"스트릭 기록",   icon:Flame,       iconColor:"#F97316", bg:"rgba(249,115,22,0.16)"  },
  ];

  return (
    <div className="relative rounded-3xl p-6 overflow-hidden"
      style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5 pointer-events-none"/>

      <div className="relative z-10">
        <p className="text-white/50 text-[13px] font-semibold uppercase tracking-wider mb-1">오늘 획득</p>
        <h3 className="text-[1.08rem] font-bold text-white mb-4 leading-tight">오늘의 성장</h3>

        <div className="space-y-2.5">
          {ITEMS.map(({ value, label, icon:Icon, iconColor, bg }) => (
            <div key={label}
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.10)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor:bg }}>
                <Icon className="w-4 h-4" style={{ color:iconColor }}/>
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-none">{value}</p>
                <p className="text-white/45 text-[12px] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TE Section 4: Achievements Grid ──────────────────────────────────────────

function TEAchievementsGrid() {
  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">배지</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">업적</h3>

      <div className="grid grid-cols-3 gap-3">
        {TE_ACHIEVEMENTS.map(({ label, icon, desc, unlocked }, i) => (
          <div key={i}
            className="flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all"
            style={{
              backgroundColor: unlocked ? "rgba(255,255,255,0.75)" : "rgba(17,24,39,0.03)",
              borderColor:     unlocked ? "rgba(255,255,255,0.92)" : "rgba(17,24,39,0.07)",
              opacity:         unlocked ? 1 : 0.42,
              filter:          unlocked ? "none" : "grayscale(0.4)",
            }}>
            <span className="text-[1.7rem] leading-none">{icon}</span>
            <p className="text-[13px] font-bold text-[#111827] text-center leading-tight">
              {label}
            </p>
            {unlocked ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-[#065F46] bg-[#D1FAE5]">
                달성
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-[#111827]/50 bg-[#111827]/06">
                잠김
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TE Section 5: Weekly Growth Bar Chart ────────────────────────────────────

function TEWeeklyChart() {
  const [visible, setVisible] = useState(false);
  const maxXp = Math.max(...TE_WEEKLY.map(d => d.xp));

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">주간 성장</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-5">Weekly Growth</h3>

      {/* XP labels row */}
      <div className="flex justify-between mb-1.5">
        {TE_WEEKLY.map(d => (
          <div key={d.day} className="flex-1 flex justify-center">
            <span className="text-[11px] font-mono text-[#111827]/48">{d.xp}</span>
          </div>
        ))}
      </div>

      {/* Bars container — fixed height, bars grow from bottom */}
      <div className="flex items-end justify-between gap-1.5" style={{ height:80 }}>
        {TE_WEEKLY.map((d, i) => {
          const barH = Math.round((d.xp / maxXp) * 76);
          return (
            <div key={d.day} className="flex-1 flex items-end overflow-hidden rounded-xl"
              style={{ height:"100%" }}>
              {/* Inner fill with animation */}
              <div
                className="w-full rounded-xl bar-reveal"
                style={{
                  height: visible ? barH : 0,
                  background: d.today
                    ? `linear-gradient(to top, ${T.blue}, ${T.indigo})`
                    : `linear-gradient(to top, ${T.green}, #34D399)`,
                  transition: `height 0.55s ${i * 0.07}s cubic-bezier(0.34,1.1,0.64,1)`,
                  "--delay": `${i * 0.07}s`,
                } as React.CSSProperties}
              />
            </div>
          );
        })}
      </div>

      {/* Day labels */}
      <div className="flex justify-between mt-2.5">
        {TE_WEEKLY.map(d => (
          <div key={d.day} className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold"
              style={{ color: d.today ? T.blue : "rgba(17,24,39,0.35)" }}>
              {d.day}
            </span>
          </div>
        ))}
      </div>

      {/* Legend + total */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#111827]/06">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:T.green }}/>
            <span className="text-[13px] text-[#111827]/62">평일</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:T.blue }}/>
            <span className="text-[13px] text-[#111827]/62">오늘</span>
          </div>
        </div>
        <p className="text-[13px] font-bold text-[#111827]/70">
          총 <span style={{ color:T.blue }}>710 XP</span>
        </p>
      </div>
    </div>
  );
}

// ── TreeEvolutionScreen — assembled ──────────────────────────────────────────

function TreeEvolutionScreen({ onFinish }: { onFinish:()=>void }) {
  return (
    <>
      {/* Scrollable content — mobile-first 375px */}
      <main className="max-w-[600px] mx-auto px-4 sm:px-5 pt-5 pb-36 space-y-4">
        {/* Page subtitle */}
        <div className="text-center pt-1 pb-1">
          <p className="text-[0.875rem] font-semibold text-[#111827]/62 leading-snug">
            오늘도 한 걸음 성장했어요 🌱
          </p>
        </div>

        {/* S1 · Hero with tree + XP bar */}
        <TEHeroCard/>

        {/* S2 · Growth timeline */}
        <TEGrowthTimeline/>

        {/* S3 · Today's growth */}
        <TETodaysGrowthCard/>

        {/* S4 · Achievements */}
        <TEAchievementsGrid/>

        {/* S5 · Weekly bar chart */}
        <TEWeeklyChart/>
      </main>

      {/* Sticky bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-[600px] mx-auto">
          <div
            className="backdrop-blur-2xl bg-[#F8FAFC]/92 border-t border-black/5 px-4 pt-4"
            style={{
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              boxShadow:     "0 -8px 32px rgba(17,24,39,0.09)",
            }}
          >
            <button
              onClick={onFinish}
              className="cta-btn w-full flex items-center justify-center gap-3 py-[17px] rounded-2xl text-white font-bold text-base"
              style={{
                background: `linear-gradient(135deg, ${T.blue}, ${T.indigo})`,
                boxShadow:  "0 8px 40px rgba(37,99,235,0.40)",
              }}
            >
              홈으로 돌아가기
              <ArrowRight className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROWTH DASHBOARD SCREEN — 나의 성장
// Mobile-first 375px · 성장 tab (index 2)
// ═══════════════════════════════════════════════════════════════════════════════

// ── GD Data ──────────────────────────────────────────────────────────────────

const GD_PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  id:    i,
  left:  `${12 + i * 11}%`,
  size:  4 + (i * 2) % 6,
  color: ["#4ADE80","#22C55E","#86EFAC","#A7F3D0"][i % 4],
  delay: `${i * 0.42}s`,
  dur:   `${2.8 + (i * 0.4) % 1.4}s`,
}));

// ── GDHeroCard ────────────────────────────────────────────────────────────────

function GDHeroCard({ exp }: { exp:number }) {
  const lvl = getLevelInfo(exp);
  const [pct, setPct] = useState(0);
  useEffect(() => { const t = setTimeout(() => setPct(lvl.pct), 440); return () => clearTimeout(t); }, [lvl.pct]);

  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(145deg, #1a3fba 0%, #2563EB 36%, #059669 100%)",
        boxShadow:  "0 8px 52px rgba(37,99,235,0.28)",
      }}>
      {/* Blobs */}
      <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full bg-white/4 pointer-events-none"/>
      <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/3 pointer-events-none"/>

      {/* Leaf particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {GD_PARTICLES.map(p => (
          <div key={p.id} className="absolute rounded-full particle-rise"
            style={{
              left:p.left, bottom:"38%", width:p.size, height:p.size,
              backgroundColor:p.color,
              "--dur":p.dur, "--delay":p.delay,
            } as React.CSSProperties}/>
        ))}
      </div>

      <div className="relative z-10 p-6">
        {/* Tree + stats row */}
        <div className="flex items-center gap-4 mb-5">
          {/* Tree with sway */}
          <div className="flex-shrink-0">
            <TELargeTree className="w-[88px] h-auto tree-sway drop-shadow-xl"/>
          </div>

          {/* Right: level / XP */}
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/18 border border-white/14">
                <Star className="w-3 h-3 text-[#FCD34D]" fill="#FCD34D"/>
                <span className="text-white text-xs font-bold">Lv.{lvl.level}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/13 border border-white/10">
                <span className="text-xs leading-none">🌱</span>
                <span className="text-white/85 text-xs font-semibold">{lvl.name}</span>
              </div>
            </div>

            {/* XP label row */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white/52 text-xs">경험치 (XP)</span>
              <span className="text-white text-xs font-bold font-mono">
                {lvl.isMax ? `${exp.toLocaleString()} XP` : `${lvl.xpIntoLevel} / ${lvl.xpForLevel}`}
              </span>
            </div>

            {/* Animated progress bar */}
            <div className="h-2.5 bg-white/18 rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full"
                style={{
                  width:`${pct}%`,
                  background:"linear-gradient(90deg,rgba(255,255,255,0.72),rgba(255,255,255,0.96))",
                  transition:"width 1.3s cubic-bezier(0.34,1.56,0.64,1)",
                }}/>
            </div>

            <div className="flex justify-between">
              <span className="text-white/35 text-[12px] font-mono">Lv.{lvl.level}</span>
              <span className="text-white/52 text-[12px] font-mono font-semibold">{pct}%</span>
              <span className="text-white/35 text-[12px] font-mono">{lvl.isMax ? "MAX" : `Lv.${lvl.level + 1}`}</span>
            </div>
          </div>
        </div>

        {/* XP란? 설명 + 다음 레벨 배너 */}
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white/12 border border-white/10 mb-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FCD34D]/22 flex items-center justify-center flex-shrink-0">
            <Star className="w-4 h-4 text-[#FCD34D]" fill="#FCD34D"/>
          </div>
          <p className="text-white/78 text-sm leading-snug">
            {lvl.isMax
              ? "최고 레벨을 달성했어요! 정말 대단해요."
              : <>Lv.{lvl.level + 1}까지 <span className="font-bold text-white">{lvl.xpToNext} XP</span> 남음</>}
          </p>
        </div>
        <p className="text-white/45 text-[13px] leading-relaxed px-1">
          미션을 완료하면 XP를 받아요. XP가 쌓이면 레벨이 오르고, 나무가 한 단계씩 자라요.
        </p>
      </div>
    </div>
  );
}

// ── GDTodayMissionNudge — 오늘 미완료 미션에 대한 액션 카드 ────────────────────
// ── AllowanceCard — 용돈: EXP가 그대로 원(1EXP=1원) · 요청/지급확인 ─────────────
function AllowanceCard({ availableAllowance, pending, onRequest, onConfirmPayout, isParent }: {
  availableAllowance:number; pending:AllowanceRequest | null;
  onRequest:()=>void; onConfirmPayout:()=>void; isParent:boolean;
}) {
  const [confirmPayout, setConfirmPayout] = useState(false);
  return (
    <div className="rounded-3xl p-5" style={{ background:"linear-gradient(140deg,#FEF3C7,#FDE68A)", boxShadow:"0 4px 28px rgba(217,119,6,0.14)" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">💰</span>
        </div>
        <div>
          <p className="text-sm font-bold text-[#78350F]">용돈</p>
          <p className="text-[12px] text-[#92400E]/60">모은 EXP가 그대로 용돈이 돼요 (1 EXP = 1원)</p>
        </div>
      </div>

      {pending ? (
        <>
          <p className="text-[#78350F] text-[2rem] font-extrabold leading-none mb-1">{pending.amount.toLocaleString()}원</p>
          <p className="text-[13px] text-[#92400E]/70 mb-4">요청됨 · 부모님 확인 대기중</p>
          {isParent ? (
            <button onClick={() => setConfirmPayout(true)}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm"
              style={{ background:"linear-gradient(135deg,#D97706,#B45309)" }}>
              지급 완료 (부모님)
            </button>
          ) : (
            <div className="w-full py-3 rounded-2xl text-center text-[13px] font-semibold text-[#92400E]/60 border-2 border-dashed border-[#D97706]/30">
              부모님 폰에서 지급 완료를 눌러주시면 정산돼요
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-[#78350F] text-[2rem] font-extrabold leading-none mb-1">{availableAllowance.toLocaleString()}원</p>
          <p className="text-[13px] text-[#92400E]/70 mb-4">지금까지 모은 용돈</p>
          {isParent ? (
            <div className="w-full py-3 rounded-2xl text-center text-[13px] font-semibold text-[#92400E]/60 border-2 border-dashed border-[#D97706]/30">
              아이가 요청하면 여기 알림이 와요
            </div>
          ) : (
            <button onClick={onRequest} disabled={availableAllowance <= 0}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-40"
              style={{ background:"linear-gradient(135deg,#D97706,#B45309)" }}>
              용돈 요청하기
            </button>
          )}
        </>
      )}

      {confirmPayout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor:"rgba(17,24,39,0.45)", backdropFilter:"blur(4px)" }}>
          <div className={`${T.glassCard} rounded-3xl p-6 w-full max-w-sm`} style={{ boxShadow:"0 24px 64px rgba(17,24,39,0.22)" }}>
            <h3 className="font-bold text-[#111827] text-base mb-2">지급 완료 확인</h3>
            <p className="text-sm text-[#111827]/72 mb-5 leading-relaxed">
              {pending?.amount.toLocaleString()}원을 실제로 계좌이체 하셨나요?<br/>확인을 누르면 요청 금액이 정산 완료로 표시돼요.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPayout(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#111827]/72 border-2 border-[#E5E7EB] hover:bg-[#F8FAFC] transition-colors">
                취소
              </button>
              <button onClick={() => { onConfirmPayout(); setConfirmPayout(false); }}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background:"linear-gradient(135deg,#D97706,#B45309)" }}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GDTodayMissionNudge({ history, dayPlans, todayStr, onStartStudy, onViewStudyLog }: {
  history:Record<string,string[]>; dayPlans:DayPlanOverrides; todayStr:string; onStartStudy:()=>void; onViewStudyLog:()=>void;
}) {
  const sched = FULL_SCHEDULE.find(d => d.date === todayStr);
  if (!sched || sched.kind !== "study") return null;

  const planned = getCheckedSubjectIds(todayStr, dayPlans);
  const done    = (history[todayStr] ?? []).filter(id => planned.includes(id)).length;
  if (planned.length === 0) return null;

  if (done >= planned.length) {
    return (
      <div className="rounded-3xl p-5 flex items-center gap-3" style={{ background:"#D1FAE5", border:"1.5px solid #10B98130" }}>
        <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">🎉</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#065F46] text-sm">오늘 미션을 모두 완료했어요!</p>
          <p className="text-[12px] text-[#047857]/70 mt-0.5">잘하고 있어요. 내일도 화이팅!</p>
        </div>
        <button onClick={onViewStudyLog}
          className="flex-shrink-0 flex items-center gap-1 text-[#065F46] text-[13px] font-bold hover:opacity-70 transition-opacity">
          기록 보기 <ChevronRight className="w-4 h-4"/>
        </button>
      </div>
    );
  }

  const remaining = planned.length - done;
  return (
    <div className="rounded-3xl p-5 flex items-center gap-3" style={{ background:"#FEF3C7", border:"1.5px solid #F59E0B30" }}>
      <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
        <span className="text-lg">⏰</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[#92400E] text-sm">오늘 미션이 {remaining}개 남았어요</p>
        <p className="text-[12px] text-[#B45309]/75 mt-0.5">
          {done}/{planned.length} 완료 · 지금 이어서 해볼까요?
          {done > 0 && <> · <button onClick={onViewStudyLog} className="underline font-semibold">기록 보기</button></>}
        </p>
      </div>
      <button onClick={onStartStudy}
        className="flex-shrink-0 px-4 py-2 rounded-xl text-white text-[13px] font-bold"
        style={{ background:"linear-gradient(135deg,#F59E0B,#D97706)" }}>
        시작하기
      </button>
    </div>
  );
}

// ── GDExamProgressCard — 중간고사 대비 진행 (기존 "42일 프로젝트" 대체) ────────

function GDExamProgressCard({ history, dayPlans, todayStr }: {
  history:Record<string,string[]>; dayPlans:DayPlanOverrides; todayStr:string;
}) {
  const studyDays     = FULL_SCHEDULE.filter(d => d.kind === "study");
  const pastStudyDays = studyDays.filter(d => diffDaysStr(d.date, todayStr) >= 0);
  const doneStudyDays = pastStudyDays.filter(d => {
    const assigned = getCheckedSubjectIds(d.date, dayPlans);
    return assigned.length > 0 && (history[d.date]?.length ?? 0) >= assigned.length;
  });
  const targetPct     = pastStudyDays.length > 0 ? Math.round((doneStudyDays.length / pastStudyDays.length) * 100) : 0;
  const dday          = diffDaysStr(todayStr, MIDTERM_EXAM_DATE);

  const [pct, setPct] = useState(0);
  useEffect(() => { const t = setTimeout(() => setPct(targetPct), 560); return () => clearTimeout(t); }, [targetPct]);

  const R    = 58;
  const circ = 2 * Math.PI * R;
  const fill = circ * (pct / 100);

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">진행 현황</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-5">중간고사 대비 진행률</h3>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Circular progress */}
        <div className="relative flex-shrink-0" style={{ width:148, height:148 }}>
          <svg width="148" height="148" viewBox="0 0 148 148" className="-rotate-90">
            <defs>
              <linearGradient id="gdCircGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={T.blue}/>
                <stop offset="100%" stopColor={T.green}/>
              </linearGradient>
            </defs>
            {/* Track */}
            <circle cx="74" cy="74" r={R} fill="none" stroke="#E2E8F0" strokeWidth="12"/>
            {/* Progress arc */}
            <circle cx="74" cy="74" r={R} fill="none"
              stroke="url(#gdCircGrad)" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${fill} ${circ}`}
              style={{ transition:"stroke-dasharray 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}/>
          </svg>
          {/* Centre text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="text-[1.6rem] font-bold text-[#111827] leading-none">{pct}%</span>
            <span className="text-[13px] text-[#111827]/62 font-mono leading-none">{doneStudyDays.length} / {pastStudyDays.length}일</span>
          </div>
        </div>

        {/* Side stats */}
        <div className="flex-1 w-full space-y-2.5">
          {[
            { label:"완료한 공부일", value:`${doneStudyDays.length}일`,               color:"#111827", bg:"#F8FAFC" },
            { label:"남은 공부일",   value:`${studyDays.length - pastStudyDays.length}일`, color:T.green,   bg:"#D1FAE5" },
            { label:"완료율",        value:`${pct}%`,                                 color:T.blue,   bg:"#EFF6FF" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 rounded-2xl"
              style={{ backgroundColor:bg }}>
              <span className="text-sm text-[#111827]/74">{label}</span>
              <span className="text-sm font-bold" style={{ color }}>{value}</span>
            </div>
          ))}
          <div className="px-4 py-2.5 rounded-2xl text-center"
            style={{ background:`linear-gradient(135deg,${T.blue}10,${T.green}0A)`, border:`1px solid ${T.blue}15` }}>
            <p className="text-sm font-semibold text-[#2563EB]">중간고사까지 {dday >= 0 ? `${dday}일 남았어요.` : "시험 기간이에요."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GDWeeklyLearning ──────────────────────────────────────────────────────────

function GDWeeklyLearning({ history, streak, todayStr, dayPlans }: {
  history:Record<string,string[]>; streak:number; todayStr:string; dayPlans:DayPlanOverrides;
}) {
  const week = getCurrentWeekStatus(history, todayStr, dayPlans);
  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-1">이번 주</p>
          <h3 className="font-bold text-[#111827] text-[1.15rem]">이번 주 학습</h3>
        </div>
        {/* Streak */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/20">
          <span className="text-sm leading-none">🔥</span>
          <span className="text-sm font-bold text-[#92400E]">{streak}일 연속</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d, i) => {
          const missed = !d.done && !d.partial && !d.isToday && !d.isFuture && !d.isRest && d.total > 0;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center tap-scale"
                style={{
                  backgroundColor: d.done ? T.green : d.partial ? "#FEF3C7" : missed ? "#FEE2E2" : d.isToday ? "transparent" : "rgba(17,24,39,0.04)",
                  border: d.isToday
                    ? `2px solid ${T.blue}`
                    : d.done
                    ? `2px solid ${T.green}`
                    : d.partial
                    ? "2px solid #F59E0B"
                    : missed
                    ? "2px solid #FCA5A5"
                    : "2px solid rgba(17,24,39,0.08)",
                  boxShadow: d.done ? `0 3px 10px ${T.green}32` : d.isToday ? `0 3px 10px ${T.blue}22` : "none",
                }}>
                {d.done    && <span className="text-[1rem] leading-none">✅</span>}
                {!d.done && d.partial && <span className="text-[11px] font-bold text-[#B45309]">{d.doneCount}/{d.total}</span>}
                {!d.done && !d.partial && d.isToday  && <span className="text-[1rem] leading-none">⏳</span>}
                {!d.done && !d.partial && !d.isToday && d.isRest   && <span className="text-[0.9rem] leading-none">🌿</span>}
                {missed && <span className="text-sm text-[#DC2626] font-bold">○</span>}
              </div>
              <span className="text-[12px] font-bold"
                style={{ color:d.done ? "#065F46" : d.partial ? "#B45309" : missed ? "#DC2626" : d.isToday ? T.blue : "rgba(17,24,39,0.28)" }}>
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── GDBadgesGrid ──────────────────────────────────────────────────────────────

function GDBadgesGrid({ exp, streak, history, dayPlans }: BadgeCtx) {
  const badges = getBadgeStatus({ exp, streak, history, dayPlans });
  const earned = badges.filter(b => b.unlocked).length;
  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-1">업적</p>
          <h3 className="font-bold text-[#111827] text-[1.15rem]">배지</h3>
        </div>
        <span className="text-[13px] font-bold text-[#111827]/52">{earned} / {badges.length}</span>
      </div>
      <p className="text-[13px] text-[#111827]/60 leading-relaxed mb-4">
        배지는 우현이가 얼마나 꾸준히 노력했는지 엄마에게 보여주는 기록이에요.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {badges.map(({ id, label, icon, desc, unlocked }) => (
          <div key={id}
            className="flex items-center gap-3 p-3.5 rounded-2xl border tap-scale"
            style={{
              backgroundColor: unlocked ? "rgba(255,255,255,0.75)" : "rgba(17,24,39,0.03)",
              borderColor:     unlocked ? "rgba(255,255,255,0.90)" : "rgba(17,24,39,0.07)",
              opacity:         unlocked ? 1 : 0.42,
              filter:          unlocked ? "none" : "grayscale(0.4)",
            }}>
            <span className="text-[1.65rem] leading-none flex-shrink-0">{icon}</span>
            <div className="min-w-0">
              <p className="text-[0.82rem] font-bold text-[#111827] leading-tight">{label}</p>
              <p className="text-[12px] text-[#111827]/60 mt-0.5 truncate">{desc}</p>
              {!unlocked && (
                <span className="text-[11px] font-bold text-[#111827]/48 bg-[#111827]/06 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                  잠김
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GDGrowthStats ─────────────────────────────────────────────────────────────

function GDGrowthStats({ history, streak }: { history:Record<string,string[]>; streak:number }) {
  const studiedDates = Object.keys(history).filter(d => (history[d]?.length ?? 0) > 0);
  const totalMissions = studiedDates.reduce((sum, d) => sum + (history[d]?.length ?? 0), 0);
  const totalMinutes  = studiedDates.reduce((sum, d) => {
    return sum + (history[d] ?? []).reduce((s2, id) => {
      const subj = EXAM_SUBJECTS.find(su => su.id === id);
      return s2 + (subj?.time ?? 0);
    }, 0);
  }, 0);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;

  const STATS: Array<{ label:string; value:string; icon:LucideIcon; color:string; bg:string }> = [
    { label:"총 학습시간", value: totalMinutes > 0 ? `${hh}시간 ${mm}분` : "0분", icon:Clock, color:T.blue,   bg:"#EFF6FF" },
    { label:"완료한 미션", value:`${totalMissions}개`,                           icon:Check, color:T.green,  bg:"#D1FAE5" },
    { label:"공부한 날",   value:`${studiedDates.length}일`,                     icon:BookOpen, color:T.violet, bg:"#EDE9FE" },
    { label:"연속 기록",   value:`${streak}일`,                                  icon:Flame, color:T.amber,  bg:"#FEF3C7" },
  ];

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">통계</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">성장 통계</h3>
      <div className="grid grid-cols-2 gap-3">
        {STATS.map(({ label, value, icon:Icon, color, bg }) => (
          <div key={label}
            className="flex flex-col gap-3 p-4 rounded-2xl tap-scale"
            style={{ backgroundColor:bg }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor:`${color}20` }}>
              <Icon className="w-4 h-4" style={{ color }}/>
            </div>
            <div>
              <p className="text-[1.15rem] font-bold text-[#111827] leading-tight">{value}</p>
              <p className="text-[13px] text-[#111827]/68 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GDNextGoals ───────────────────────────────────────────────────────────────

function GDNextGoals({ exp, streak, history, dayPlans, onGoalScore }: BadgeCtx & { onGoalScore:()=>void }) {
  const lvl = getLevelInfo(exp);
  const nextBadge = getBadgeStatus({ exp, streak, history, dayPlans }).find(b => !b.unlocked);

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">목표</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">다음 목표</h3>

      <div className="space-y-2.5 mb-2.5">
        <div className="p-4 rounded-2xl border tap-scale" style={{ backgroundColor:`${T.amber}08`, borderColor:`${T.amber}20` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:`${T.amber}18` }}>
              <Star className="w-4 h-4" style={{ color:T.amber }}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#111827] leading-tight">
                {lvl.isMax ? "최고 레벨 달성" : `Lv.${lvl.level + 1} 달성`}
              </p>
              <p className="text-[13px] text-[#111827]/65 mt-0.5">
                {lvl.isMax ? "더 이상 오를 레벨이 없어요" : `${lvl.xpToNext} XP 더 필요`}
              </p>
            </div>
            <span className="text-[13px] font-bold font-mono flex-shrink-0" style={{ color:T.amber }}>{lvl.pct}%</span>
          </div>
          <div className="h-1.5 bg-[#111827]/08 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width:`${lvl.pct}%`, backgroundColor:T.amber }}/>
          </div>
        </div>

        <div className="p-4 rounded-2xl border tap-scale" style={{ backgroundColor:`${T.violet}08`, borderColor:`${T.violet}20` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style={{ backgroundColor:`${T.violet}18` }}>
              {nextBadge ? nextBadge.icon : "🎉"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#111827] leading-tight">
                {nextBadge ? `다음 배지: ${nextBadge.label}` : "모든 배지 획득!"}
              </p>
              <p className="text-[13px] text-[#111827]/65 mt-0.5">
                {nextBadge ? nextBadge.desc : "배지를 전부 모았어요, 최고예요!"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <button onClick={onGoalScore}
        className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-[13px]"
        style={{ backgroundColor:"#EEF2FF", color:T.indigo }}>
        2학기 중간고사 목표점수 확인하기 <ArrowRight className="w-3.5 h-3.5"/>
      </button>
    </div>
  );
}

// ── GDBottomArea: sticky CTA + bottom nav ─────────────────────────────────────

function GDBottomArea({
  onHome, onStartStudy, onTab,
}: { onHome:()=>void; onStartStudy:()=>void; onTab:(i:number)=>void }) {
  const NAV_ITEMS = [
    { icon:Home,       label:"홈",     active:false, fn:()=>onTab(0) },
    { icon:Target,     label:"미션설정", active:false, fn:()=>onTab(1) },
    { icon:TrendingUp, label:"성장",   active:true,  fn:()=>onTab(2) },
    { icon:BookOpen,   label:"복습",   active:false, fn:()=>onTab(3) },
    { icon:User,       label:"학습현황", active:false, fn:()=>onTab(4) },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-[600px] mx-auto">
        {/* CTA */}
        <div className="backdrop-blur-2xl bg-[#F8FAFC]/92 border-t border-black/5 px-4 pt-3 pb-2"
          style={{ boxShadow:"0 -8px 32px rgba(17,24,39,0.09)" }}>
          <button
            onClick={onStartStudy}
            className="cta-btn w-full flex items-center justify-center gap-2.5 py-[15px] rounded-2xl text-white font-bold text-base"
            style={{
              background:`linear-gradient(135deg,${T.blue},${T.indigo})`,
              boxShadow:"0 6px 32px rgba(37,99,235,0.40)",
            }}>
            오늘 공부 시작하기
            <ArrowRight className="w-5 h-5"/>
          </button>
        </div>

        {/* Bottom nav */}
        <div
          className="backdrop-blur-2xl bg-white/92 border-t border-black/5 flex items-center justify-around px-2 pt-2"
          style={{ paddingBottom:"max(0.5rem, env(safe-area-inset-bottom))" }}>
          {NAV_ITEMS.map(({ icon:Icon, label, active, fn }, i) => (
            <button key={i} onClick={fn}
              className="relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl"
              style={{ color: active ? T.blue : "#9CA3AF" }}>
              {active && <span className="absolute inset-0 rounded-2xl bg-[#2563EB]/8"/>}
              <Icon className="w-5 h-5 relative z-10"/>
              <span className="text-[12px] font-semibold relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── GrowthDashboardScreen — assembled ─────────────────────────────────────────

function GrowthDashboardScreen({
  onHome, onStartStudy, onTab, onGoalScore, exp, streak, history, dayPlans,
  availableAllowance, allowancePending, onRequestAllowance, onConfirmPayout, onViewStudyLog, isParent,
}: {
  onHome:()=>void; onStartStudy:()=>void; onTab:(i:number)=>void; onGoalScore:()=>void;
  exp:number; streak:number; history:Record<string,string[]>; dayPlans:DayPlanOverrides;
  availableAllowance:number; allowancePending:AllowanceRequest | null;
  onRequestAllowance:()=>void; onConfirmPayout:()=>void; onViewStudyLog:()=>void; isParent:boolean;
}) {
  const todayStr = toYMD(new Date());

  return (
    <>
      {/* Scrollable content — mobile-first 375px */}
      <main className="max-w-[600px] mx-auto px-4 sm:px-5 pt-5 pb-52 space-y-4">
        {/* Subtitle */}
        <div className="text-center pt-1 pb-1">
          <p className="text-[0.875rem] font-semibold text-[#111827]/62 leading-snug">
            매일 조금씩 성장하고 있어요 🌱
          </p>
        </div>

        <GDHeroCard exp={exp}/>
        <AllowanceCard availableAllowance={availableAllowance} pending={allowancePending}
          onRequest={onRequestAllowance} onConfirmPayout={onConfirmPayout} isParent={isParent}/>
        <GDTodayMissionNudge history={history} dayPlans={dayPlans} todayStr={todayStr} onStartStudy={onStartStudy} onViewStudyLog={onViewStudyLog}/>
        <GDExamProgressCard history={history} dayPlans={dayPlans} todayStr={todayStr}/>
        <GDWeeklyLearning history={history} streak={streak} todayStr={todayStr} dayPlans={dayPlans}/>
        <GDBadgesGrid exp={exp} streak={streak} history={history} dayPlans={dayPlans}/>
        <GDGrowthStats history={history} streak={streak}/>
        <GDNextGoals exp={exp} streak={streak} history={history} dayPlans={dayPlans} onGoalScore={onGoalScore}/>
      </main>

      <GDBottomArea onHome={onHome} onStartStudy={onStartStudy} onTab={onTab}/>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR SCREEN — 학습 캘린더
// Mobile-first 375px · 캘린더 tab (index 3)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Cal Types & Data ──────────────────────────────────────────────────────────

// CalDay — 달력 한 칸. kind===null 이면 계획 기간(7/21~10/2) 밖이거나 빈 칸.
type CalDay = {
  day: number | null;
  date: string | null;
  kind: DayKind | null;
  label?: string;
  completedCount: number;
  totalCount: number;
  isToday: boolean;
  isFuture: boolean;
  isExamDay: boolean;
};

const BLANK_CAL_DAY: CalDay = {
  day:null, date:null, kind:null, completedCount:0, totalCount:0,
  isToday:false, isFuture:false, isExamDay:false,
};

const CAL_DOW = ["일","월","화","수","목","금","토"] as const;

const RANGE_MONTHS: Array<{ year:number; month:number; label:string }> = [
  { year:2026, month:6, label:"2026년 7월"  },
  { year:2026, month:7, label:"2026년 8월"  },
  { year:2026, month:8, label:"2026년 9월"  },
  { year:2026, month:9, label:"2026년 10월" },
];

function buildMonthGrid(
  year:number, month:number, history:Record<string,string[]>, dayPlans:DayPlanOverrides, todayStr:string,
): CalDay[] {
  const firstDow     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const cells: CalDay[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(BLANK_CAL_DAY);
  for (let d = 1; d <= daysInMonth; d++) {
    const date  = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const sched = FULL_SCHEDULE.find(s => s.date === date);
    const done  = history[date] ?? [];
    cells.push({
      day: d, date,
      kind: sched ? sched.kind : null,
      label: sched?.label,
      completedCount: done.length,
      totalCount: sched?.kind === "study" ? getCheckedSubjectIds(date, dayPlans).length : 0,
      isToday: date === todayStr,
      isFuture: diffDaysStr(todayStr, date) > 0,
      isExamDay: date === MIDTERM_EXAM_DATE,
    });
  }
  while (cells.length % 7 !== 0) cells.push(BLANK_CAL_DAY);
  return cells;
}

// 칸 하나의 시각 스타일 — 상태 조합에 따라 동적으로 계산
function calCellStyle(cell: CalDay): { bg:string; numColor:string; dot?:string; icon?:string } {
  if (!cell.date)        return { bg:"transparent", numColor:"transparent" };
  if (cell.kind === null) return { bg:"transparent", numColor:"rgba(17,24,39,0.16)" };
  if (cell.isExamDay)     return { bg:"rgba(225,29,72,0.14)", numColor:"#9F1239", icon:"🎯" };
  if (cell.kind === "holiday") return { bg:"rgba(245,158,11,0.10)", numColor:"#92400E", icon:"🎌" };
  if (cell.kind === "weekend") {
    return cell.completedCount > 0
      ? { bg:"rgba(124,58,237,0.10)", numColor:"#5B21B6", icon:"🌱" }
      : { bg:"rgba(124,58,237,0.05)", numColor:"#5B21B6" };
  }
  // study day
  if (cell.isFuture) return { bg:"transparent", numColor:"rgba(17,24,39,0.30)" };
  const pct = cell.totalCount ? cell.completedCount / cell.totalCount : 0;
  if (pct >= 1) return { bg:"rgba(16,185,129,0.16)", numColor:"#065F46", dot:T.green };
  if (pct > 0)  return { bg:"rgba(16,185,129,0.08)", numColor:"#065F46", dot:"#A7F3D0" };
  return { bg:"rgba(225,29,72,0.06)", numColor:"#9F1239" }; // 지나갔지만 못한 날
}

// ── CalHeroCard ───────────────────────────────────────────────────────────────

function CalHeroCard({ history, dayPlans, streak, todayStr }: {
  history:Record<string,string[]>; dayPlans:DayPlanOverrides; streak:number; todayStr:string;
}) {
  const studyDays     = FULL_SCHEDULE.filter(d => d.kind === "study");
  const pastStudyDays = studyDays.filter(d => diffDaysStr(d.date, todayStr) >= 0);
  const doneStudyDays = pastStudyDays.filter(d => {
    const assigned = getCheckedSubjectIds(d.date, dayPlans);
    return assigned.length > 0 && (history[d.date]?.length ?? 0) >= assigned.length;
  });
  const targetPct     = pastStudyDays.length > 0 ? Math.round((doneStudyDays.length / pastStudyDays.length) * 100) : 0;
  const dday          = diffDaysStr(todayStr, MIDTERM_EXAM_DATE);

  const [ringPct, setRingPct] = useState(0);
  useEffect(() => { const t = setTimeout(() => setRingPct(targetPct), 480); return () => clearTimeout(t); }, [targetPct]);

  const R    = 52;
  const circ = 2 * Math.PI * R;
  const fill = circ * (ringPct / 100);

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-4">현재 진행</p>

      <div className="flex items-center gap-5 sm:gap-8">
        {/* Circular progress ring */}
        <div className="relative flex-shrink-0" style={{ width:120, height:120 }}>
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            <defs>
              <linearGradient id="calCircGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={T.blue}/>
                <stop offset="100%" stopColor={T.green}/>
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={R} fill="none" stroke="#E2E8F0" strokeWidth="10"/>
            <circle cx="60" cy="60" r={R} fill="none"
              stroke="url(#calCircGrad)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${fill} ${circ}`}
              style={{ transition:"stroke-dasharray 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}/>
          </svg>
          {/* Centre label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="text-[1.3rem] font-bold text-[#111827] leading-none">{ringPct}%</span>
            <span className="text-[12px] text-[#111827]/58 font-mono leading-none">{doneStudyDays.length}/{pastStudyDays.length}일</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-[13px] text-[#111827]/60 mb-0.5">중간고사까지</p>
            <p className="text-base font-bold text-[#111827]">{dday >= 0 ? `D-${dday}` : "시험 기간"}</p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/20 w-fit">
            <span className="text-sm leading-none">🔥</span>
            <span className="text-sm font-bold text-[#92400E]">{streak}일 연속</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/15 w-fit">
            <Calendar className="w-3.5 h-3.5 text-[#2563EB]"/>
            <span className="text-sm font-bold text-[#1E40AF]">7.21 ~ 10.2</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CalDayCell ────────────────────────────────────────────────────────────────

function CalDayCell({
  cell, selected, onSelect,
}: { cell:CalDay; selected:boolean; onSelect:()=>void }) {
  if (!cell.day) return <div/>;
  const cfg       = calCellStyle(cell);
  const tappable  = !!cell.date;

  return (
    <button
      disabled={!tappable}
      onClick={onSelect}
      className="flex flex-col items-center justify-center gap-[2px] py-1.5 rounded-xl tap-scale"
      style={{
        backgroundColor: selected ? `${T.blue}1A` : cfg.bg,
        border: selected
          ? `2px solid ${T.blue}55`
          : cell.isToday
          ? `2px solid ${T.blue}30`
          : "2px solid transparent",
        boxShadow: selected ? `0 2px 10px ${T.blue}20` : "none",
        minHeight: 40,
      }}>
      <span className="text-[12px] font-bold leading-none" style={{ color:cfg.numColor }}>
        {cell.day}
      </span>
      {cfg.dot && (
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor:cfg.dot }}/>
      )}
      {cfg.icon && (
        <span className="text-[12px] leading-none">{cfg.icon}</span>
      )}
    </button>
  );
}

// ── CalMonthlyCard ────────────────────────────────────────────────────────────

function CalMonthlyCard({
  history, dayPlans, todayStr, selectedDate, onSelectDate,
}: {
  history:Record<string,string[]>; dayPlans:DayPlanOverrides; todayStr:string;
  selectedDate:string|null; onSelectDate:(d:string)=>void;
}) {
  const todayMonthIdx = RANGE_MONTHS.findIndex(
    m => m.year === parseYMD(todayStr).getFullYear() && m.month === parseYMD(todayStr).getMonth()
  );
  const [monthIdx, setMonthIdx] = useState(todayMonthIdx === -1 ? 0 : todayMonthIdx);
  const { year, month, label } = RANGE_MONTHS[monthIdx];
  const cells = buildMonthGrid(year, month, history, dayPlans, todayStr);

  return (
    <div className={`${T.glassCard} rounded-3xl p-5 sm:p-6`} style={{ boxShadow:T.cardShadow }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonthIdx(i => Math.max(0, i - 1))} disabled={monthIdx === 0}
            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-25 hover:bg-black/[0.04] transition-colors">
            <ChevronLeft className="w-4 h-4 text-[#111827]/70"/>
          </button>
          <h3 className="font-bold text-[#111827] text-[1.15rem] w-[104px] text-center">{label}</h3>
          <button onClick={() => setMonthIdx(i => Math.min(RANGE_MONTHS.length - 1, i + 1))} disabled={monthIdx === RANGE_MONTHS.length - 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-25 hover:bg-black/[0.04] transition-colors">
            <ChevronRight className="w-4 h-4 text-[#111827]/70"/>
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#EFF6FF] border border-[#2563EB]/12">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor:T.blue }}/>
          <span className="text-[13px] font-bold text-[#2563EB]">오늘</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4">
        {[
          { visual:<div className="w-2 h-2 rounded-full bg-[#10B981]"/>, label:"공부 완료" },
          { visual:<span className="text-[13px] leading-none">🌱</span>,  label:"보충 완료" },
          { visual:<span className="text-[13px] leading-none">🎌</span>,  label:"공휴일" },
          { visual:<span className="text-[13px] leading-none">🎯</span>,  label:"중간고사" },
        ].map(({ visual, label:l }) => (
          <div key={l} className="flex items-center gap-1">
            {visual}
            <span className="text-[12px] text-[#111827]/58">{l}</span>
          </div>
        ))}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1.5">
        {CAL_DOW.map(h => (
          <div key={h} className="flex justify-center">
            <span className="text-[12px] font-bold text-[#111827]/48">{h}</span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1 gap-x-0.5">
        {cells.map((c, i) => (
          <CalDayCell
            key={i}
            cell={c}
            selected={!!c.date && selectedDate === c.date}
            onSelect={() => c.date && onSelectDate(c.date)}
          />
        ))}
      </div>
    </div>
  );
}

// ── CalDayDetail ──────────────────────────────────────────────────────────────

function CalDayDetail({ date, history, dayPlans }: {
  date:string|null; history:Record<string,string[]>; dayPlans:DayPlanOverrides;
}) {
  if (!date) {
    return (
      <div className={`${T.glassCard} rounded-3xl p-6 flex flex-col items-center justify-center gap-3 py-9`} style={{ boxShadow:T.cardShadow }}>
        <Sun className="w-6 h-6 text-[#111827]/42"/>
        <p className="text-sm text-[#111827]/58">날짜를 선택해보세요.</p>
      </div>
    );
  }

  const sched     = FULL_SCHEDULE.find(d => d.date === date);
  const done      = history[date] ?? [];
  const isExamDay = date === MIDTERM_EXAM_DATE;
  const parsed    = parseYMD(date);
  const dateLabel = `${parsed.getMonth() + 1}월 ${parsed.getDate()}일 (${CAL_DOW[parsed.getDay()]})`;

  if (!sched) {
    return (
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <h3 className="font-bold text-[#111827] text-[1.15rem] mb-2">{dateLabel}</h3>
        <p className="text-sm text-[#111827]/58">학습 기간(7/21~10/2) 밖의 날짜예요.</p>
      </div>
    );
  }

  if (isExamDay) {
    return (
      <div className={`${T.glassCard} rounded-3xl p-6 fade-in-up`} style={{ boxShadow:T.cardShadow }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[#111827] text-[1.15rem]">{dateLabel}</h3>
          <span className="text-[13px] font-bold px-2.5 py-1 rounded-xl bg-[#FFF1F2] text-[#9F1239]">🎯 중간고사</span>
        </div>
        <p className="text-sm text-[#111827]/72 leading-relaxed">그동안 준비한 만큼 실력을 보여줄 시간이야. 우현이 파이팅! 💪</p>
      </div>
    );
  }

  if (sched.kind === "study") {
    const todayStr = toYMD(new Date());
    const isFuture = diffDaysStr(todayStr, date) > 0;
    const assigned = getCheckedSubjectIds(date, dayPlans);
    const allDone  = assigned.length > 0 && done.length >= assigned.length;
    return (
      <div className={`${T.glassCard} rounded-3xl p-6 fade-in-up`} style={{ boxShadow:T.cardShadow }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-1">날짜 상세</p>
            <h3 className="font-bold text-[#111827] text-[1.15rem]">{dateLabel}</h3>
          </div>
          <span className="text-[13px] font-bold px-2.5 py-1 rounded-xl"
            style={{
              backgroundColor: allDone ? "#D1FAE5" : isFuture ? "#EFF6FF" : done.length > 0 ? "#FEF3C7" : "#FFF1F2",
              color:            allDone ? "#065F46" : isFuture ? "#1E40AF" : done.length > 0 ? "#92400E" : "#9F1239",
            }}>
            {allDone ? "공부 완료" : isFuture ? "예정" : done.length > 0 ? "진행중" : "미완료"}
          </span>
        </div>
        {assigned.length === 0 ? (
          <p className="text-sm text-[#111827]/58">배정된 과목이 없어요.</p>
        ) : (
        <div className="space-y-1.5">
          {assigned.map(id => {
            const subj = EXAM_SUBJECTS.find(s => s.id === id)!;
            const ok   = done.includes(id);
            return (
              <div key={id}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border"
                style={{
                  backgroundColor: ok ? "#D1FAE5" : "#F8FAFC",
                  borderColor: ok ? "rgba(16,185,129,0.15)" : "rgba(17,24,39,0.05)",
                }}>
                <span className="text-sm font-bold leading-none" style={{ color: ok ? "#10B981" : "#D1D5DB" }}>
                  {ok ? "✔" : "○"}
                </span>
                <span className="text-sm font-semibold" style={{ color: ok ? "#065F46" : "#111827" }}>{subj.name}</span>
              </div>
            );
          })}
        </div>
        )}
      </div>
    );
  }

  // weekend / holiday — 보충일
  const shortfall = getWeeklyShortfall(history, date, dayPlans);
  return (
    <div className={`${T.glassCard} rounded-3xl p-6 fade-in-up`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-1">보충일</p>
          <h3 className="font-bold text-[#111827] text-[1.15rem]">{dateLabel}</h3>
        </div>
        <span className="text-[13px] font-bold px-2.5 py-1 rounded-xl bg-[#EDE9FE] text-[#5B21B6]">
          {sched.kind === "holiday" ? (sched.label ?? "공휴일") : "주말"}
        </span>
      </div>

      {done.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {done.map(id => {
            const subj = EXAM_SUBJECTS.find(s => s.id === id);
            if (!subj) return null;
            return (
              <div key={id} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#D1FAE5] border border-[#10B981]/15">
                <span className="text-sm font-bold text-[#10B981] leading-none">✔</span>
                <span className="text-sm font-semibold text-[#065F46]">{subj.name} 보충 완료</span>
              </div>
            );
          })}
        </div>
      )}

      {shortfall.length > 0 ? (
        <div className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#E11D48]/12">
          <p className="text-[13px] font-bold text-[#9F1239] mb-2">이번 주 보충이 필요해요</p>
          <div className="flex flex-wrap gap-1.5">
            {shortfall.map(c => {
              const subj = EXAM_SUBJECTS.find(s => s.id === c.subjectId);
              if (!subj) return null;
              return (
                <span key={c.subjectId} className="text-[13px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor:subj.bg, color:subj.color }}>
                  {subj.name} {c.missing}회
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#D1FAE5]/60">
          <span className="text-base leading-none">🌿</span>
          <span className="text-sm font-semibold text-[#065F46]">이번 주 학습을 모두 마쳤어요. 편히 쉬어요!</span>
        </div>
      )}
    </div>
  );
}

// ── CalStatistics ─────────────────────────────────────────────────────────────

function CalStatistics({ history, streak }: { history:Record<string,string[]>; streak:number }) {
  const studiedDates = Object.keys(history).filter(
    d => (history[d]?.length ?? 0) > 0 && FULL_SCHEDULE.some(s => s.date === d)
  );
  const totalMinutes = studiedDates.reduce((sum, d) => {
    return sum + (history[d] ?? []).reduce((s2, id) => {
      const subj = EXAM_SUBJECTS.find(su => su.id === id);
      return s2 + (subj?.time ?? 0);
    }, 0);
  }, 0);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;

  const STATS = [
    { label:"공부한 날",   value:`${studiedDates.length}일`,                          icon:BookOpen, color:T.blue,    bg:"#EFF6FF" },
    { label:"연속 기록",   value:`${streak}일`,                                       icon:Flame,    color:"#F97316", bg:"#FFF7ED" },
    { label:"총 학습시간", value: totalMinutes > 0 ? `${hh}시간 ${mm}분` : "0분",     icon:Clock,    color:T.green,   bg:"#D1FAE5" },
  ];

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">통계</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">7.21 ~ 10.2 누적</h3>

      <div className="grid grid-cols-3 gap-3">
        {STATS.map(({ label, value, icon:Icon, color, bg }) => (
          <div key={label} className="flex flex-col gap-2.5 p-3.5 rounded-2xl tap-scale"
            style={{ backgroundColor:bg }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor:`${color}20` }}>
              <Icon className="w-4 h-4" style={{ color }}/>
            </div>
            <div>
              <p className="text-[0.9rem] font-bold text-[#111827] leading-tight">{value}</p>
              <p className="text-[12px] text-[#111827]/68 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CalBottomArea: sticky CTA + bottom nav ────────────────────────────────────

function CalBottomArea({
  onHome, onStartStudy, onTab, onSchedule,
}: { onHome:()=>void; onStartStudy:()=>void; onTab:(i:number)=>void; onSchedule:()=>void }) {
  const NAV = [
    { icon:Home,       label:"홈",     active:false, fn:()=>onTab(0) },
    { icon:Target,     label:"미션설정", active:false, fn:()=>onTab(1) },
    { icon:TrendingUp, label:"성장",   active:false, fn:()=>onTab(2) },
    { icon:BookOpen,   label:"복습",   active:true,  fn:()=>onTab(3) },
    { icon:User,       label:"학습현황", active:false, fn:()=>onTab(4) },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-[600px] mx-auto">
        {/* CTA */}
        <div className="backdrop-blur-2xl bg-[#F8FAFC]/92 border-t border-black/5 px-4 pt-3 pb-2 space-y-2"
          style={{ boxShadow:"0 -8px 32px rgba(17,24,39,0.09)" }}>
          <button onClick={onSchedule}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-[13px]"
            style={{ backgroundColor:"#EEF2FF", color:T.indigo }}>
            전체 일정표 보기 <ArrowRight className="w-3.5 h-3.5"/>
          </button>
          <button onClick={onStartStudy}
            className="cta-btn w-full flex items-center justify-center gap-2.5 py-[15px] rounded-2xl text-white font-bold text-base"
            style={{
              background:`linear-gradient(135deg,${T.blue},${T.indigo})`,
              boxShadow:"0 6px 32px rgba(37,99,235,0.40)",
            }}>
            오늘 공부 시작하기
            <ArrowRight className="w-5 h-5"/>
          </button>
        </div>

        {/* Bottom nav */}
        <div
          className="backdrop-blur-2xl bg-white/92 border-t border-black/5 flex items-center justify-around px-2 pt-2"
          style={{ paddingBottom:"max(0.5rem,env(safe-area-inset-bottom))" }}>
          {NAV.map(({ icon:Icon, label, active, fn }, i) => (
            <button key={i} onClick={fn}
              className="relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl"
              style={{ color:active ? T.blue : "#9CA3AF" }}>
              {active && <span className="absolute inset-0 rounded-2xl bg-[#2563EB]/8"/>}
              <Icon className="w-5 h-5 relative z-10"/>
              <span className="text-[12px] font-semibold relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CalendarScreen — assembled ────────────────────────────────────────────────

function CalendarScreen({
  onHome, onStartStudy, onTab, onSchedule, history, dayPlans, streak,
}: {
  onHome:()=>void; onStartStudy:()=>void; onTab:(i:number)=>void; onSchedule:()=>void;
  history:Record<string,string[]>; dayPlans:DayPlanOverrides; streak:number;
}) {
  const todayStr = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(
    FULL_SCHEDULE.some(d => d.date === todayStr) ? todayStr : STUDY_START_DATE
  );

  return (
    <>
      {/* Scrollable content — mobile-first 375px */}
      <main className="max-w-[600px] mx-auto px-4 sm:px-5 pt-5 pb-60 space-y-4">
        {/* Subtitle */}
        <div className="text-center pt-1 pb-1">
          <p className="text-[0.875rem] font-semibold text-[#111827]/62 leading-snug">
            7.21 ~ 10.2 중간고사 대비 학습 여정을 확인해보세요.
          </p>
        </div>

        {/* S1 · Hero ring */}
        <CalHeroCard history={history} dayPlans={dayPlans} streak={streak} todayStr={todayStr}/>

        {/* S2 · Monthly calendar grid */}
        <CalMonthlyCard history={history} dayPlans={dayPlans} todayStr={todayStr} selectedDate={selectedDate} onSelectDate={setSelectedDate}/>

        {/* S3 · Selected day detail — updates on tap */}
        <CalDayDetail date={selectedDate} history={history} dayPlans={dayPlans}/>

        {/* S4 · Monthly statistics */}
        <CalStatistics history={history} streak={streak}/>
      </main>

      <CalBottomArea onHome={onHome} onStartStudy={onStartStudy} onTab={onTab} onSchedule={onSchedule}/>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOM DASHBOARD SCREEN — 엄마 대시보드
// 엄마가 보는 화면: 오늘 현황 · 사진 승인 · 응원메시지 · 보상 지급 · 주간 통계
// ═══════════════════════════════════════════════════════════════════════════════

const MOM_PENDING_PHOTOS = [
  { id:"math", subject:"수학", mission:"이차방정식 3단원 복습", time:"오늘 14:32", thumbnail:"📘" },
  { id:"en",   subject:"영어", mission:"독해 지문 2개 풀기",    time:"오늘 16:05", thumbnail:"📗" },
];

const MOM_MESSAGES = [
  "오늘도 화이팅! 엄마는 항상 우현이 편이야.",
  "작은 시작이 큰 습관을 만들어. 잘하고 있어!",
  "완벽하려 하지 말고, 시작만 해도 성공이야.",
  "오늘도 끝까지 해낸 너가 정말 자랑스러워.",
  "힘들어도 포기하지 않는 우현이가 최고야!",
];

const MOM_WEEKLY_STATS = [
  { day:"월", done:true  }, { day:"화", done:true  }, { day:"수", done:true  },
  { day:"목", done:true  }, { day:"금", done:true  }, { day:"토", done:true  },
  { day:"일", done:false, today:true },
];

function MomApprovalCard({
  photo, onApprove, onReject,
}: {
  photo: typeof MOM_PENDING_PHOTOS[0];
  onApprove: (id:string)=>void;
  onReject:  (id:string)=>void;
}) {
  const [decided, setDecided] = useState<"approved"|"rejected"|null>(null);
  const handleApprove = () => { setDecided("approved"); setTimeout(()=>onApprove(photo.id), 600); };
  const handleReject  = () => { setDecided("rejected"); setTimeout(()=>onReject(photo.id),  600); };

  return (
    <div className={`${T.glassCard} rounded-3xl p-5`} style={{ boxShadow:T.cardShadow,
      border: decided==="approved" ? `2px solid ${T.green}` : decided==="rejected" ? `2px solid ${T.rose}` : undefined,
      opacity: decided ? 0.7 : 1, transition:"all 0.4s ease" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor:"#EFF6FF" }}>{photo.thumbnail}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#111827] text-sm leading-tight">{photo.subject}</p>
          <p className="text-[#111827]/65 text-[13px] truncate">{photo.mission}</p>
        </div>
        <span className="text-[12px] font-mono text-[#111827]/48">{photo.time}</span>
      </div>

      {/* Simulated photo area */}
      <div className="relative rounded-2xl overflow-hidden mb-4 aspect-video w-full"
        style={{ background:"linear-gradient(145deg,#1E293B,#0F172A)" }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="text-5xl">{photo.thumbnail}</span>
          <p className="text-white/40 text-xs">공부 인증 사진</p>
          <p className="text-white/25 text-[12px]">{photo.mission}</p>
        </div>
        {/* Corner marks */}
        {["top-3 left-3 border-t-2 border-l-2","top-3 right-3 border-t-2 border-r-2",
          "bottom-3 left-3 border-b-2 border-l-2","bottom-3 right-3 border-b-2 border-r-2"].map((c,i)=>(
          <div key={i} className={`absolute w-5 h-5 ${c} border-white/30 rounded-sm`}/>
        ))}
        {decided && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
            style={{ backgroundColor: decided==="approved" ? "rgba(16,185,129,0.7)" : "rgba(225,29,72,0.7)" }}>
            <span className="text-white text-4xl">{decided==="approved"?"✅":"❌"}</span>
          </div>
        )}
      </div>

      {/* Buttons */}
      {!decided && (
        <div className="flex gap-3">
          <button onClick={handleReject}
            className="flex-1 py-3 rounded-2xl font-bold text-sm border-2 border-[#E5E7EB] text-[#111827]/72 hover:border-[#E11D48]/30 hover:text-[#E11D48] transition-all">
            ❌ 다시 찍기
          </button>
          <button onClick={handleApprove}
            className="flex-[2] py-3 rounded-2xl font-bold text-sm text-white transition-all"
            style={{ background:`linear-gradient(135deg,${T.green},#059669)`, boxShadow:`0 6px 20px ${T.green}40` }}>
            ✅ 승인하기
          </button>
        </div>
      )}
      {decided && (
        <div className="flex items-center justify-center py-2.5 rounded-2xl"
          style={{ backgroundColor: decided==="approved" ? "#D1FAE5" : "#FFF1F2" }}>
          <p className="text-sm font-bold" style={{ color: decided==="approved" ? "#065F46" : "#9F1239" }}>
            {decided==="approved" ? "✅ 승인 완료! EXP가 지급됩니다." : "❌ 재촬영 요청을 보냈어요."}
          </p>
        </div>
      )}
    </div>
  );
}

function MomMessageComposer({ onSend }: { onSend:(msg:string)=>void }) {
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!msg.trim()) return;
    setSent(true);
    onSend(msg);
    setTimeout(()=>{ setSent(false); setMsg(""); }, 2500);
  };

  return (
    <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
      <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">응원 메시지</p>
      <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">우현이에게 메시지 보내기</h3>

      {/* Quick templates */}
      <div className="flex flex-wrap gap-2 mb-4">
        {MOM_MESSAGES.slice(0,3).map((m,i)=>(
          <button key={i} onClick={()=>setMsg(m)}
            className="text-[13px] font-semibold px-3 py-1.5 rounded-xl transition-all"
            style={{ backgroundColor:`${T.rose}0F`, color:"#C7355C", border:`1px solid ${T.rose}20` }}>
            {m.substring(0,14)}…
          </button>
        ))}
      </div>

      {/* Textarea */}
      <div className="relative mb-4">
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} maxLength={150}
          placeholder="우현이에게 따뜻한 말 한마디를 남겨주세요."
          className="textarea-styled w-full rounded-2xl px-4 py-3.5 text-[#111827] text-sm leading-relaxed resize-none"
          style={{ minHeight:100 }}/>
        <span className="absolute bottom-3 right-4 text-[12px] font-mono text-[#111827]/42">{msg.length}/150</span>
      </div>

      {sent ? (
        <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#D1FAE5] fade-in-up">
          <CheckCircle2 className="w-5 h-5 text-[#10B981]"/>
          <p className="text-sm font-bold text-[#065F46]">메시지를 보냈어요! 💌</p>
        </div>
      ) : (
        <button onClick={handleSend} disabled={!msg.trim()}
          className="cta-btn w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm transition-all"
          style={{ background:`linear-gradient(135deg,${T.rose},#C7355C)`,
            boxShadow: msg.trim() ? "0 6px 24px rgba(239,108,139,0.40)" : "none",
            opacity: msg.trim() ? 1 : 0.45 }}>
          ❤️ 메시지 보내기
        </button>
      )}
    </div>
  );
}

function MomDashboardScreen({ onBack }: { onBack:()=>void }) {
  const [photos, setPhotos] = useState(MOM_PENDING_PHOTOS);

  const handleApprove = (id:string) => setPhotos(prev=>prev.filter(p=>p.id!==id));
  const handleReject  = (id:string) => setPhotos(prev=>prev.filter(p=>p.id!==id));

  const totalXP = 3240;
  const streak  = 7;

  return (
    <main className="max-w-[680px] mx-auto px-4 sm:px-5 pt-5 pb-16 space-y-5">
      {/* Subtitle */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background:`linear-gradient(135deg,${T.rose},#C7355C)` }}>❤️</div>
        <div>
          <p className="font-bold text-[#111827] text-base">엄마 대시보드</p>
          <p className="text-[#111827]/62 text-[12px]">우현이의 오늘 학습 현황</p>
        </div>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"오늘 완료",   value:"2/5",     icon:Check,  color:T.green,  bg:"#D1FAE5" },
          { label:"연속 기록",   value:`${streak}일`, icon:Flame,  color:"#F97316",bg:"#FFF7ED" },
          { label:"총 경험치",   value:`${(totalXP/1000).toFixed(1)}k`, icon:Zap, color:T.amber, bg:"#FEF3C7" },
        ].map(({ label, value, icon:Icon, color, bg })=>(
          <div key={label} className="flex flex-col gap-2.5 p-4 rounded-2xl" style={{ backgroundColor:bg }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor:`${color}22` }}>
              <Icon className="w-4 h-4" style={{ color }}/>
            </div>
            <div>
              <p className="text-base font-bold text-[#111827]">{value}</p>
              <p className="text-[12px] text-[#111827]/65 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pending approvals */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="font-bold text-[#111827] text-[0.95rem]">사진 승인 대기</p>
          {photos.length > 0 && (
            <span className="text-[13px] font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor:`${T.amber}18`, color:"#92400E" }}>
              {photos.length}건 대기 중
            </span>
          )}
        </div>
        {photos.length > 0 ? (
          <div className="space-y-4">
            {photos.map(p=>(
              <MomApprovalCard key={p.id} photo={p} onApprove={handleApprove} onReject={handleReject}/>
            ))}
          </div>
        ) : (
          <div className={`${T.glassCard} rounded-3xl p-8 text-center`} style={{ boxShadow:T.cardShadow }}>
            <span className="text-4xl mb-3 block">✅</span>
            <p className="font-bold text-[#111827] mb-1">모두 처리했어요!</p>
            <p className="text-[#111827]/60 text-sm">대기 중인 사진이 없어요.</p>
          </div>
        )}
      </div>

      {/* Weekly record */}
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">이번 주</p>
        <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">주간 출석</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {MOM_WEEKLY_STATS.map(({ day, done, today }:{day:string;done:boolean;today?:boolean}, i)=>(
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: done && !today ? T.green : today ? "transparent" : "rgba(17,24,39,0.04)",
                  border: today ? `2px solid ${T.blue}` : done ? `2px solid ${T.green}` : "2px solid rgba(17,24,39,0.08)",
                }}>
                {done && !today ? <Check className="w-4 h-4 text-white"/> :
                  <span className="text-[12px] font-bold" style={{ color:today?T.blue:"rgba(17,24,39,0.28)" }}>{day}</span>}
              </div>
              <span className="text-[12px] font-bold" style={{ color:done?"#065F46":today?T.blue:"rgba(17,24,39,0.28)" }}>{day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Message composer */}
      <MomMessageComposer onSend={(msg)=>console.log("Sent:", msg)}/>

      {/* 42-day progress */}
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">프로젝트 현황</p>
        <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">42일 프로젝트 진행률</h3>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#111827]/65">Day 18 / 42</span>
          <span className="text-sm font-bold text-[#2563EB]">43%</span>
        </div>
        <div className="h-3 bg-[#E2E8F0] rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full" style={{ width:"43%", background:`linear-gradient(90deg,${T.blue},${T.green})` }}/>
        </div>
        <p className="text-[12px] text-[#111827]/60 text-center">24일 남았어요. 우현이 잘 하고 있어요! 🌱</p>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION CENTER SCREEN — 알림 센터
// ═══════════════════════════════════════════════════════════════════════════════

type NotifCategory = "all" | "approval" | "reward" | "streak" | "message";

interface NotifEntry {
  id: string; category: Exclude<NotifCategory, "all">;
  icon: string; title: string; body: string; createdAt: string; read: boolean;
}

/** ISO 타임스탬프를 "방금 전" / "14분 전" / "어제" 같은 상대 시간으로 표시 */
function formatRelativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1)   return "방금 전";
  if (minutes < 60)  return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1)    return "어제";
  return `${days}일 전`;
}

const NOTIF_TABS: Array<{ key:NotifCategory; label:string }> = [
  { key:"all",      label:"전체"    },
  { key:"approval", label:"승인"    },
  { key:"reward",   label:"보상"    },
  { key:"streak",   label:"연속"    },
  { key:"message",  label:"엄마"    },
];

const NOTIF_CATEGORY_COLOR: Record<NotifCategory, { bg:string; border:string; dot:string }> = {
  all:      { bg:"#F8FAFC",     border:"transparent",       dot:"#94A3B8" },
  approval: { bg:"#D1FAE5",     border:`${T.green}20`,      dot:T.green   },
  reward:   { bg:"#FEF3C7",     border:`${T.amber}20`,      dot:T.amber   },
  streak:   { bg:"#FFF7ED",     border:"rgba(249,115,22,0.18)", dot:"#F97316" },
  message:  { bg:"#FFF1F2",     border:`${T.rose}18`,       dot:T.rose    },
};

function NotificationItem({ notif, onRead }: {
  notif: NotifEntry; onRead: (id:string)=>void;
}) {
  const cfg = NOTIF_CATEGORY_COLOR[notif.category];
  return (
    <button onClick={()=>onRead(notif.id)}
      className="w-full text-left flex items-start gap-3.5 p-4 rounded-2xl border transition-all tap-scale"
      style={{
        backgroundColor: notif.read ? "rgba(248,250,252,0.6)" : cfg.bg,
        borderColor: notif.read ? "rgba(17,24,39,0.06)" : cfg.border,
        boxShadow: notif.read ? "none" : `0 2px 12px ${cfg.dot}18`,
      }}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ backgroundColor: notif.read ? "rgba(17,24,39,0.04)" : `${cfg.dot}18` }}>
        {notif.icon}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-bold leading-tight ${notif.read ? "text-[#111827]/72" : "text-[#111827]"}`}>
            {notif.title}
          </p>
          <span className="text-[12px] font-mono text-[#111827]/48 flex-shrink-0 mt-0.5">{formatRelativeTime(notif.createdAt)}</span>
        </div>
        <p className={`text-[12px] leading-snug mt-1 ${notif.read ? "text-[#111827]/55" : "text-[#111827]/74"}`}>
          {notif.body}
        </p>
      </div>
      {/* Unread dot */}
      {!notif.read && (
        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor:cfg.dot }}/>
      )}
    </button>
  );
}

function NotificationCenterScreen({ notifs, onRead, onReadAll }: {
  notifs: NotifEntry[]; onRead:(id:string)=>void; onReadAll:()=>void;
}) {
  const [tab, setTab] = useState<NotifCategory>("all");

  const unreadCount = notifs.filter(n=>!n.read).length;
  const filtered    = tab === "all" ? notifs : notifs.filter(n=>n.category===tab);

  const markRead    = onRead;
  const markAllRead = onReadAll;

  return (
    <main className="max-w-[640px] mx-auto px-4 sm:px-5 pt-5 pb-16 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="font-bold text-[#111827] text-base">알림 센터</p>
          <p className="text-[#111827]/62 text-[12px]">{unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "모두 읽었어요"}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="text-[12px] font-bold px-3 py-1.5 rounded-xl transition-all"
            style={{ backgroundColor:`${T.blue}10`, color:T.blue }}>
            모두 읽음
          </button>
        )}
      </div>

      {/* Unread summary card */}
      {unreadCount > 0 && (
        <div className="relative rounded-3xl overflow-hidden p-5"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:T.heroShadow }}>
          <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5 pointer-events-none"/>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/18 flex items-center justify-center text-2xl flex-shrink-0">🔔</div>
            <div>
              <p className="text-white/62 text-[13px] font-semibold uppercase tracking-wider mb-1">새 알림</p>
              <p className="text-white font-bold text-lg leading-tight">{unreadCount}개의 새 알림이 있어요</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab filter */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth:"none" }}>
        {NOTIF_TABS.map(({ key, label })=>(
          <button key={key} onClick={()=>setTab(key)}
            className="flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all"
            style={{
              backgroundColor: tab===key ? T.blue : "rgba(17,24,39,0.06)",
              color:           tab===key ? "white" : "rgba(17,24,39,0.45)",
            }}>
            {label}
            {key !== "all" && (
              <span className="ml-1.5 text-[12px]">
                {notifs.filter(n=>n.category===key && !n.read).length > 0
                  ? `·${notifs.filter(n=>n.category===key && !n.read).length}` : ""}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="space-y-2.5">
        {filtered.length > 0 ? (
          filtered.map(n=><NotificationItem key={n.id} notif={n} onRead={markRead}/>)
        ) : (
          <div className={`${T.glassCard} rounded-3xl p-8 text-center`} style={{ boxShadow:T.cardShadow }}>
            <span className="text-4xl mb-3 block">🔕</span>
            <p className="font-bold text-[#111827] mb-1">알림이 없어요</p>
            <p className="text-[#111827]/60 text-sm">
              {tab === "all" ? "미션을 완료하면 알림이 도착해요!" : "이 카테고리의 알림이 없어요."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS SCREEN — 설정
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsToggle({ value, onChange }: { value:boolean; onChange:(v:boolean)=>void }) {
  return (
    <button onClick={()=>onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
      style={{ backgroundColor: value ? T.blue : "rgba(17,24,39,0.15)" }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
        style={{ left: value ? "calc(100% - 22px)" : "2px" }}/>
    </button>
  );
}

type SettingsState = {
  pushAlerts: boolean; momAlerts: boolean; streakAlerts: boolean;
  rewardAlerts: boolean; sound: boolean; vibration: boolean;
  darkMode: boolean; compactMode: boolean;
  studyReminder: string; restDay: string;
};

const LS_SETTINGS = "wh-settings-v1";
const DAYS_KR = ["월","화","수","목","금","토","일"];

function SettingsScreen({ onBack, onProfile, onResetData, familyId, exp, streak, deviceRole, parentPinHash, onSelectChildRole, onSelectParentRole, onChangePin }: {
  onBack:()=>void; onProfile?:()=>void; onResetData?:()=>void; familyId:string;
  exp:number; streak:number; deviceRole:DeviceRole; parentPinHash:string | null;
  onSelectChildRole:()=>void; onSelectParentRole:(hash:string)=>void; onChangePin:(hash:string)=>void;
}) {
  const [showPin, setShowPin] = useState(false);
  const [pinChangeStep, setPinChangeStep] = useState<"verify-old" | "create-new" | null>(null);
  const lvl = getLevelInfo(exp);
  const todayStr = toYMD(new Date());
  const totalDays = FULL_SCHEDULE.length;
  const dayIndex = Math.min(Math.max(diffDaysStr(STUDY_START_DATE, todayStr) + 1, 0), totalDays);
  const [cfg, setCfg] = useState<SettingsState>(() => {
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      pushAlerts:true, momAlerts:true, streakAlerts:true,
      rewardAlerts:true, sound:true, vibration:true,
      darkMode:false, compactMode:false,
      studyReminder:"19:00", restDay:"일",
    };
  });

  // 인라인 편집 중인 항목
  const [editingTime, setEditingTime] = useState(false);
  const [editingDay,  setEditingDay]  = useState(false);
  // 확인 다이얼로그
  const [confirmReset,    setConfirmReset]    = useState(false);
  const [confirmClearData, setConfirmClearData] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyShareLink = async () => {
    const url = getShareUrl(familyId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("아래 링크를 복사해서 전달해주세요:", url);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // 설정 변경 시 localStorage 저장
  useEffect(() => {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(cfg));
  }, [cfg]);

  const toggle = (key: keyof SettingsState) =>
    setCfg(prev => ({ ...prev, [key]: !prev[key] }));

  const handleClearData = () => {
    // 학습 관련 데이터 전부 초기화 (EXP·스트릭·미션 기록·목표점수·알림 포함)
    [LS_EXP, LS_STREAK, LS_LAST_DATE, LS_HISTORY, LS_DAY_PLANS, LS_GOALS, LS_NOTIFS]
      .forEach(k => localStorage.removeItem(k));
    setConfirmClearData(false);
    onResetData?.();
  };

  const handleResetGoal = () => {
    [LS_EXP, LS_STREAK, LS_LAST_DATE].forEach(k => localStorage.removeItem(k));
    setConfirmReset(false);
    onBack();
  };

  return (
    <>
    <main className="max-w-[600px] mx-auto px-4 sm:px-5 pt-5 pb-16 space-y-6">

      {/* ── 프로필 카드 ── */}
      <div className={`${T.glassCard} rounded-3xl p-5`} style={{ boxShadow:T.cardShadow }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
            <span className="text-white text-2xl font-bold">우</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#111827] text-base">우현</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46]">Lv.{lvl.level} {lvl.name}</span>
              <span className="text-[13px] text-[#111827]/55">Day {dayIndex} / {totalDays}</span>
            </div>
          </div>
          <button onClick={onProfile}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ backgroundColor:`${T.blue}12` }}>
            <ChevronRight className="w-4 h-4 text-[#2563EB]"/>
          </button>
        </div>
      </div>

      {/* ── 가족과 공유하기 ── */}
      {supabaseEnabled && (
        <div className="rounded-3xl p-5" style={{ background:"linear-gradient(140deg,#EEF2FF,#E0E7FF)", boxShadow:"0 4px 28px rgba(79,70,229,0.14)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 text-[#4F46E5]"/>
            </div>
            <div>
              <p className="font-bold text-[#312E81] text-sm">가족과 공유하기</p>
              <p className="text-[13px] text-[#4338CA]/55">이 링크로 열면 같은 학습 기록을 봐요</p>
            </div>
          </div>
          <button onClick={handleCopyShareLink}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-[13px] transition-all"
            style={{ backgroundColor: linkCopied ? "#059669" : "#4F46E5", color:"white" }}>
            {linkCopied ? <><CheckCircle2 className="w-4 h-4"/> 링크 복사됨!</> : <><Check className="w-4 h-4"/> 공유 링크 복사하기</>}
          </button>
          <p className="text-[12px] text-[#4338CA]/45 mt-2.5 leading-relaxed">
            엄마·아이가 이 링크로 각자 열면 같은 데이터를 보고 수정할 수 있어요. 링크를 아는 사람만 볼 수 있으니 믿을 수 있는 사람에게만 보내주세요.
          </p>
        </div>
      )}

      {/* ── 기기 모드 ── */}
      <div className={`${T.glassCard} rounded-3xl p-5`} style={{ boxShadow:T.cardShadow }}>
        <p className="font-bold text-[#111827] text-sm mb-1">이 폰은 누구 거예요?</p>
        <p className="text-[13px] text-[#111827]/55 mb-3">용돈 지급 완료 버튼 등 일부 기능이 달라져요</p>
        <div className="flex gap-2">
          <button onClick={onSelectChildRole}
            className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all"
            style={{
              background: deviceRole === "child" ? `linear-gradient(135deg,${T.blue},${T.indigo})` : "#F1F5F9",
              color: deviceRole === "child" ? "white" : "#111827aa",
            }}>
            🧒 아이 폰
          </button>
          <button onClick={() => deviceRole !== "parent" && setShowPin(true)}
            className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all"
            style={{
              background: deviceRole === "parent" ? "linear-gradient(135deg,#D97706,#B45309)" : "#F1F5F9",
              color: deviceRole === "parent" ? "white" : "#111827aa",
            }}>
            👪 부모님 폰
          </button>
        </div>
        {deviceRole === "parent" && parentPinHash && (
          <button onClick={() => setPinChangeStep("verify-old")}
            className="w-full mt-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#111827]/55 border-2 border-[#E5E7EB] hover:bg-[#F8FAFC] transition-colors">
            부모님 PIN 변경
          </button>
        )}
      </div>

      {/* ── 알림 설정 ── */}
      <div>
        <p className="text-[13px] font-mono text-[#111827]/55 uppercase tracking-[0.3em] mb-3 px-1">알림 설정</p>
        <div className={`${T.glassCard} rounded-3xl overflow-hidden`} style={{ boxShadow:T.cardShadow }}>
          {([
            { label:"푸시 알림",     sub:"앱 알림 전체",     key:"pushAlerts"   as keyof SettingsState },
            { label:"엄마 응원 알림", sub:"응원 메시지 도착", key:"momAlerts"    as keyof SettingsState },
            { label:"연속 기록 알림", sub:"스트릭 유지 알림", key:"streakAlerts" as keyof SettingsState },
            { label:"보상 알림",      sub:"EXP·배지 획득",   key:"rewardAlerts" as keyof SettingsState },
          ] as Array<{label:string;sub:string;key:keyof SettingsState}>).map(({ label, sub, key }, i, arr) => (
            <div key={key} className={`flex items-center gap-3 px-5 py-4${i<arr.length-1?" border-b border-[#111827]/06":""}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111827]">{label}</p>
                <p className="text-[13px] text-[#111827]/58 mt-0.5">{sub}</p>
              </div>
              <SettingsToggle value={!!cfg[key]} onChange={() => toggle(key)}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── 앱 설정 ── */}
      <div>
        <p className="text-[13px] font-mono text-[#111827]/55 uppercase tracking-[0.3em] mb-3 px-1">앱 설정</p>
        <div className={`${T.glassCard} rounded-3xl overflow-hidden`} style={{ boxShadow:T.cardShadow }}>
          {([
            { label:"효과음",    sub:"버튼·완료 효과음", key:"sound"       as keyof SettingsState },
            { label:"진동",      sub:"햅틱 피드백",      key:"vibration"   as keyof SettingsState },
            { label:"다크 모드",  sub:"화면 어둡게",     key:"darkMode"    as keyof SettingsState },
            { label:"컴팩트 모드",sub:"카드를 더 작게",  key:"compactMode" as keyof SettingsState },
          ] as Array<{label:string;sub:string;key:keyof SettingsState}>).map(({ label, sub, key }, i, arr) => (
            <div key={key} className={`flex items-center gap-3 px-5 py-4${i<arr.length-1?" border-b border-[#111827]/06":""}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111827]">{label}</p>
                <p className="text-[13px] text-[#111827]/58 mt-0.5">{sub}</p>
              </div>
              <SettingsToggle value={!!cfg[key]} onChange={() => toggle(key)}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── 학습 설정 ── */}
      <div>
        <p className="text-[13px] font-mono text-[#111827]/55 uppercase tracking-[0.3em] mb-3 px-1">학습 설정</p>
        <div className={`${T.glassCard} rounded-3xl overflow-hidden`} style={{ boxShadow:T.cardShadow }}>

          {/* 공부 알림 시간 */}
          <div className="px-5 py-4 border-b border-[#111827]/06">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEditingTime(v => !v)}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111827]">공부 알림 시간</p>
                <p className="text-[13px] text-[#111827]/58 mt-0.5">매일 알림</p>
              </div>
              <span className="text-sm font-bold text-[#2563EB]">{cfg.studyReminder}</span>
              <ChevronRight className={`w-4 h-4 text-[#111827]/45 transition-transform${editingTime?" rotate-90":""}`}/>
            </div>
            {editingTime && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="time"
                  value={cfg.studyReminder}
                  onChange={e => setCfg(prev => ({ ...prev, studyReminder: e.target.value }))}
                  className="flex-1 text-sm font-bold text-[#2563EB] border-2 border-[#2563EB]/30 rounded-xl px-3 py-2 focus:outline-none focus:border-[#2563EB]"
                />
                <button onClick={() => setEditingTime(false)}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-bold">
                  완료
                </button>
              </div>
            )}
          </div>

          {/* 휴식일 */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEditingDay(v => !v)}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111827]">휴식일</p>
                <p className="text-[13px] text-[#111827]/58 mt-0.5">휴식권 자동 적용</p>
              </div>
              <span className="text-sm font-bold text-[#2563EB]">{cfg.restDay}요일</span>
              <ChevronRight className={`w-4 h-4 text-[#111827]/45 transition-transform${editingDay?" rotate-90":""}`}/>
            </div>
            {editingDay && (
              <div className="mt-3 flex flex-wrap gap-2">
                {DAYS_KR.map(d => (
                  <button key={d} onClick={() => { setCfg(prev => ({ ...prev, restDay: d })); setEditingDay(false); }}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    style={{
                      backgroundColor: cfg.restDay === d ? T.blue : "rgba(17,24,39,0.06)",
                      color: cfg.restDay === d ? "white" : "#111827",
                    }}>
                    {d}요일
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 계정 ── */}
      <div>
        <p className="text-[13px] font-mono text-[#111827]/55 uppercase tracking-[0.3em] mb-3 px-1">계정</p>
        <div className={`${T.glassCard} rounded-3xl overflow-hidden`} style={{ boxShadow:T.cardShadow }}>

          {/* 학습현황 보기 */}
          <button onClick={onProfile}
            className="w-full flex items-center gap-3 px-5 py-4 border-b border-[#111827]/06 hover:bg-[#F8FAFC] transition-colors text-left">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#111827]">학습현황 보기</p>
              <p className="text-[12px] text-[#111827]/48 mt-0.5">과목별 학습 통계·기록</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#111827]/45"/>
          </button>

          {/* 레벨·기록 초기화 */}
          <button onClick={() => setConfirmReset(true)}
            className="w-full flex items-center gap-3 px-5 py-4 border-b border-[#111827]/06 hover:bg-[#F8FAFC] transition-colors text-left">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#111827]">레벨·기록 초기화</p>
              <p className="text-[13px] text-[#111827]/58 mt-0.5">경험치·연속 학습일을 다시 0부터 시작해요</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#111827]/45"/>
          </button>

          {/* 데이터 초기화 */}
          <button onClick={() => setConfirmClearData(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#FFF5F5] transition-colors text-left">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color:"#E11D48" }}>데이터 초기화</p>
              <p className="text-[13px] text-[#111827]/58 mt-0.5">전체 기록 삭제</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#E11D48]/30"/>
          </button>
        </div>
      </div>

      {/* ── 앱 버전 ── */}
      <div className="text-center pb-4">
        <p className="text-[13px] font-mono text-[#111827]/42">Project WOOHYUN · v1.0.0</p>
        <p className="text-[12px] text-[#111827]/35 mt-1">Made with ❤️ for 우현</p>
      </div>

      {/* ── 목표 재설정 확인 다이얼로그 ── */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor:"rgba(17,24,39,0.45)", backdropFilter:"blur(4px)" }}>
          <div className={`${T.glassCard} rounded-3xl p-6 w-full max-w-sm`} style={{ boxShadow:"0 24px 64px rgba(17,24,39,0.22)" }}>
            <h3 className="font-bold text-[#111827] text-base mb-2">레벨·기록 초기화</h3>
            <p className="text-sm text-[#111827]/72 mb-5 leading-relaxed">
              <b>경험치(EXP)</b> — 미션을 완료할 때마다 쌓여서 레벨을 올려주는 점수예요.<br/>
              <b>스트릭</b> — 며칠 연속으로 공부했는지 세는 연속 기록이에요.<br/><br/>
              이 둘을 0으로 되돌리고 레벨도 Lv.1부터 다시 시작해요.<br/>지금까지의 미션 완료 기록(달력·통계)은 그대로 남아요.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReset(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#111827]/72 border-2 border-[#E5E7EB] hover:bg-[#F8FAFC] transition-colors">
                취소
              </button>
              <button onClick={handleResetGoal}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 데이터 초기화 확인 다이얼로그 ── */}
      {confirmClearData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor:"rgba(17,24,39,0.45)", backdropFilter:"blur(4px)" }}>
          <div className={`${T.glassCard} rounded-3xl p-6 w-full max-w-sm`} style={{ boxShadow:"0 24px 64px rgba(17,24,39,0.22)" }}>
            <h3 className="font-bold text-[#E11D48] text-base mb-2">전체 데이터 초기화</h3>
            <p className="text-sm text-[#111827]/72 mb-5 leading-relaxed">
              모든 학습 기록, EXP, 스트릭이 삭제돼요.<br/>
              <span className="font-bold text-[#E11D48]">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClearData(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#111827]/72 border-2 border-[#E5E7EB] hover:bg-[#F8FAFC] transition-colors">
                취소
              </button>
              <button onClick={handleClearData}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ background:"linear-gradient(135deg,#E11D48,#BE123C)" }}>
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    {showPin && (
      <PinPrompt
        mode={parentPinHash ? "verify" : "create"}
        verifyHash={parentPinHash}
        onCancel={() => setShowPin(false)}
        onSuccess={(hash) => { onSelectParentRole(hash); setShowPin(false); }}
      />
    )}
    {pinChangeStep === "verify-old" && (
      <PinPrompt
        mode="verify"
        verifyHash={parentPinHash}
        onCancel={() => setPinChangeStep(null)}
        onSuccess={() => setPinChangeStep("create-new")}
      />
    )}
    {pinChangeStep === "create-new" && (
      <PinPrompt
        mode="create"
        onCancel={() => setPinChangeStep(null)}
        onSuccess={(hash) => { onChangePin(hash); setPinChangeStep(null); }}
      />
    )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD SCREEN — 프로필 / 학습 현황 분석
// 실제 학습 기록(history) 기반 · 과목별 통계 · 주차별 XP · 캘린더/일정표 바로가기
// ═══════════════════════════════════════════════════════════════════════════════

/** 주차별(월~일) 획득 XP — 7/21 시작 주 ~ 중간고사 주까지 */
function getWeeklyXPSeries(history: Record<string, string[]>): Array<{ week:string; xp:number; start:string; end:string }> {
  const weeks: Array<{ week:string; xp:number; start:string; end:string }> = [];
  let cur = STUDY_START_DATE;
  let idx = 1;
  while (diffDaysStr(cur, MIDTERM_EXAM_DATE) >= 0) {
    const { start, end } = getWeekRange(cur);
    let xp = 0;
    let d = start;
    while (diffDaysStr(d, end) >= 0) {
      (history[d] ?? []).forEach(id => { xp += EXAM_SUBJECTS.find(s => s.id === id)?.exp ?? 0; });
      d = addDaysStr(d, 1);
    }
    weeks.push({ week:`${idx}주`, xp, start, end });
    cur = addDaysStr(end, 1);
    idx++;
  }
  return weeks;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY LOG SCREEN — 학습 기록: 완료한 미션의 공부 시간·인증 사진을 날짜별로 보여준다
// ═══════════════════════════════════════════════════════════════════════════════

function StudyLogScreen({ studyLog }: { studyLog:StudyLog }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const dates = Object.keys(studyLog).filter(d => studyLog[d].length > 0).sort((a,b) => b.localeCompare(a));

  if (dates.length === 0) {
    return (
      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-16 text-center">
        <span className="text-4xl mb-3 block">📷</span>
        <p className="font-bold text-[#111827] mb-1">아직 완료한 학습 기록이 없어요</p>
        <p className="text-[#111827]/60 text-sm">미션을 완료하면 공부 시간과 인증 사진이 여기 쌓여요.</p>
      </main>
    );
  }

  return (
    <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">
      {dates.map(date => {
        const entries = studyLog[date];
        const totalSeconds = entries.reduce((a,e) => a + e.elapsedSeconds, 0);
        const d = parseYMD(date);
        const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
        return (
          <div key={date}>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-bold text-[#111827] text-[15px]">{dateLabel}</h3>
              <span className="text-[13px] text-[#111827]/52">총 {formatDuration(totalSeconds)} · {entries.length}과목</span>
            </div>
            <div className="space-y-3">
              {entries.map((e, i) => {
                const subj = EXAM_SUBJECTS.find(s => s.id === e.subjectId);
                const key = `${date}-${i}`;
                const isOpen = expanded === key;
                return (
                  <div key={key} className={`${T.glassCard} rounded-2xl overflow-hidden`} style={{ boxShadow:T.cardShadow }}>
                    <button onClick={() => setExpanded(isOpen ? null : key)}
                      className="w-full flex items-center gap-3 p-4 text-left">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:subj?.bg }}>
                        {subj && <subj.icon className="w-5 h-5" style={{ color:subj.color }}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#111827] text-sm">{subj?.name ?? e.subjectId}</p>
                        <p className="text-[13px] text-[#111827]/58 truncate">{e.missionText}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-bold text-[#111827]/72">{formatDuration(e.elapsedSeconds)}</p>
                        <p className="text-[11px] text-[#111827]/40">공부 시간</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-[#111827]/30 transition-transform ${isOpen ? "rotate-90" : ""}`}/>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        {e.photoDataUrl
                          ? <img src={e.photoDataUrl} alt={`${subj?.name ?? ""} 인증 사진`} className="w-full rounded-xl object-cover" style={{ maxHeight:360 }}/>
                          : <p className="text-[13px] text-[#111827]/45 text-center py-6">사진이 없어요</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </main>
  );
}

function AdminDashboardScreen({ exp, streak, history, dayPlans, onCalendar, onSchedule, onViewStudyLog }: {
  exp:number; streak:number; history:Record<string,string[]>; dayPlans:DayPlanOverrides;
  onCalendar:()=>void; onSchedule:()=>void; onViewStudyLog:()=>void;
}) {
  const todayStr      = toYMD(new Date());
  const pastStudyDays = FULL_SCHEDULE.filter(d => d.kind === "study" && diffDaysStr(d.date, todayStr) >= 0);

  // 과목별로 "지금까지 실제 배정된 횟수"를 분모로 써야 정확한 완료율이 나온다
  // (과목마다 주간 목표 횟수가 달라서, 매일 6과목이 배정되는 게 아님)
  const subjectAssignedCounts: Record<string, number> = {};
  let totalSlots = 0;
  pastStudyDays.forEach(d => {
    getCheckedSubjectIds(d.date, dayPlans).forEach(id => {
      subjectAssignedCounts[id] = (subjectAssignedCounts[id] ?? 0) + 1;
      totalSlots++;
    });
  });

  const subjectStats = EXAM_SUBJECTS.map(s => ({
    ...s,
    done: pastStudyDays.filter(d => (history[d.date] ?? []).includes(s.id)).length,
    total: subjectAssignedCounts[s.id] ?? 0,
  }));
  const totalDone  = subjectStats.reduce((a, s) => a + s.done, 0);
  const completionRate = totalSlots > 0 ? Math.round((totalDone / totalSlots) * 100) : 0;

  const studiedDates  = Object.keys(history).filter(d => (history[d]?.length ?? 0) > 0);
  const totalMissions = studiedDates.reduce((sum, d) => sum + (history[d]?.length ?? 0), 0);
  const totalMinutes  = studiedDates.reduce((sum, d) => sum + (history[d] ?? []).reduce((s2, id) => {
    const subj = EXAM_SUBJECTS.find(su => su.id === id);
    return s2 + (subj?.time ?? 0);
  }, 0), 0);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;

  const weeklyXP = getWeeklyXPSeries(history);
  const maxXp    = Math.max(...weeklyXP.map(w => w.xp), 1);

  return (
    <main className="max-w-[720px] mx-auto px-4 sm:px-5 pt-5 pb-16 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background:"linear-gradient(135deg,#1E293B,#334155)" }}>👤</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#111827] text-base">우현이 학습 현황</p>
          <p className="text-[#111827]/62 text-[12px]">7.21 ~ 10.2 중간고사 대비 학습 현황 분석</p>
        </div>
        <button onClick={onViewStudyLog}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-[#111827]/05 text-[#111827]/70 text-[13px] font-semibold hover:bg-[#111827]/10 transition-colors">
          <Camera className="w-4 h-4"/> 학습 기록
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label:"전체 완료율", value:`${completionRate}%`,                          icon:Check,    color:T.green,  bg:"#D1FAE5" },
          { label:"연속 기록",   value:`${streak}일`,                                  icon:Flame,    color:"#F97316",bg:"#FFF7ED" },
          { label:"총 공부시간", value: totalMinutes > 0 ? `${hh}시간 ${mm}분` : "0분",icon:Clock,    color:T.blue,   bg:"#EFF6FF" },
          { label:"총 EXP",      value: exp.toLocaleString(),                          icon:Zap,      color:T.amber,  bg:"#FEF3C7" },
          { label:"완료 미션",   value:`${totalMissions}개`,                           icon:Trophy,   color:T.violet, bg:"#EDE9FE" },
          { label:"공부한 날",   value:`${studiedDates.length}일`,                     icon:BookOpen, color:"#EC4899",bg:"#FCE7F3" },
        ].map(({ label, value, icon:Icon, color, bg })=>(
          <div key={label} className="flex items-center gap-3 p-4 rounded-2xl tap-scale" style={{ backgroundColor:bg }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:`${color}22` }}>
              <Icon className="w-4 h-4" style={{ color }}/>
            </div>
            <div>
              <p className="text-base font-bold text-[#111827] leading-tight">{value}</p>
              <p className="text-[12px] text-[#111827]/65 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Subject completion */}
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">과목별</p>
        <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">과목별 완료율</h3>
        <div className="space-y-4">
          {subjectStats.map(({ id, name, done, total, time, color, icon:Icon }) => {
            const pct  = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color }}/>
                    <span className="text-sm font-bold text-[#111827]">{name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-[#111827]/60">{done}/{total}일 · {time}분씩</span>
                    <span className="text-[13px] font-bold" style={{ color }}>{pct}%</span>
                  </div>
                </div>
                <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width:`${pct}%`, backgroundColor:color, transition:"width 0.8s ease" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly XP bar chart */}
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">주차별 XP</p>
        <h3 className="font-bold text-[#111827] text-[1.15rem] mb-5">주차별 경험치</h3>
        <div className="flex items-end justify-between gap-2" style={{ height:90 }}>
          {weeklyXP.map(({ week, xp, start, end }, i)=>{
            const h = xp > 0 ? Math.max(Math.round((xp/maxXp)*82),6) : 4;
            const isCurrent = diffDaysStr(start, todayStr) >= 0 && diffDaysStr(todayStr, end) >= 0;
            return (
              <div key={week} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-[11px] font-mono text-[#111827]/48">{xp>0?xp:""}</span>
                <div className="w-full flex items-end" style={{ height:82 }}>
                  <div className="w-full rounded-xl"
                    style={{ height:h, background: isCurrent
                      ? `linear-gradient(to top,${T.blue},${T.indigo})`
                      : xp>0 ? `linear-gradient(to top,${T.green},#34D399)` : "rgba(17,24,39,0.08)",
                      transition:`height 0.6s ${i*0.08}s ease` }}/>
                </div>
                <span className="text-[13px] font-semibold" style={{ color:isCurrent?T.blue:xp>0?"rgba(17,24,39,0.45)":"rgba(17,24,39,0.22)" }}>{week}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 캘린더 / 일정표 바로가기 */}
      <div className={`${T.glassCard} rounded-3xl p-6`} style={{ boxShadow:T.cardShadow }}>
        <p className="text-[13px] font-mono text-[#111827]/48 uppercase tracking-[0.35em] mb-2">더 보기</p>
        <h3 className="font-bold text-[#111827] text-[1.15rem] mb-4">일별 현황 자세히 보기</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCalendar}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl tap-scale" style={{ backgroundColor:"#EFF6FF" }}>
            <Calendar className="w-5 h-5" style={{ color:T.blue }}/>
            <span className="text-sm font-bold text-[#111827]">전체 캘린더</span>
          </button>
          <button onClick={onSchedule}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl tap-scale" style={{ backgroundColor:"#EEF2FF" }}>
            <BookOpen className="w-5 h-5" style={{ color:T.indigo }}/>
            <span className="text-sm font-bold text-[#111827]">전체 일정표</span>
          </button>
        </div>
      </div>
    </main>
  );
}

// ─── SCHEDULE LIST (전체 일정표: 7/21 ~ 10/2 중간고사) ─────────────────────────

function scheduleMonthGroups(): Record<string, ScheduleDay[]> {
  const groups: Record<string, ScheduleDay[]> = {};
  FULL_SCHEDULE.forEach(d => {
    const key = d.date.slice(0, 7); // "YYYY-MM"
    (groups[key] ??= []).push(d);
  });
  return groups;
}

function ScheduleRow({ day, history, dayPlans, todayStr }: {
  day:ScheduleDay; history:Record<string,string[]>; dayPlans:DayPlanOverrides; todayStr:string;
}) {
  const parsed    = parseYMD(day.date);
  const isToday   = day.date === todayStr;
  const isFuture  = diffDaysStr(todayStr, day.date) > 0;
  const isExamDay = day.date === MIDTERM_EXAM_DATE;
  const done      = history[day.date] ?? [];
  const assigned  = day.kind === "study" ? getCheckedSubjectIds(day.date, dayPlans) : [];

  const kindBadge = isExamDay
    ? { label:"🎯 중간고사", bg:"#FFF1F2", color:"#9F1239" }
    : day.kind === "study"
    ? { label:"공부일",   bg:"#EFF6FF", color:"#1E40AF" }
    : day.kind === "holiday"
    ? { label:day.label ?? "공휴일", bg:"#FEF3C7", color:"#92400E" }
    : { label:"주말",     bg:"#EDE9FE", color:"#5B21B6" };

  const shortfall = day.kind !== "study" ? getWeeklyShortfall(history, day.date, dayPlans) : [];

  return (
    <div className="flex items-center gap-3 py-3 px-3.5 rounded-2xl"
      style={{
        backgroundColor: isToday ? "rgba(37,99,235,0.06)" : "transparent",
        border: isToday ? `1.5px solid ${T.blue}40` : "1.5px solid transparent",
      }}>
      <div className="w-11 flex-shrink-0 text-center">
        <p className="text-[15px] font-bold text-[#111827] leading-none">{parsed.getDate()}</p>
        <p className="text-[12px] text-[#111827]/55 mt-1">{CAL_DOW[day.dow]}</p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor:kindBadge.bg, color:kindBadge.color }}>
            {kindBadge.label}
          </span>
          {isToday && <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-[#2563EB] text-white">오늘</span>}
        </div>

        {day.kind === "study" ? (
          assigned.length === 0 ? (
            <p className="text-[13px] text-[#111827]/50">배정된 과목 없음</p>
          ) : (
          <div className="flex flex-wrap gap-1">
            {assigned.map(id => {
              const subj = EXAM_SUBJECTS.find(s => s.id === id)!;
              const ok   = done.includes(id);
              return (
                <span key={id} className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: ok ? "#D1FAE5" : isFuture ? "#F1F5F9" : "#FFF1F2",
                    color:            ok ? "#065F46" : isFuture ? "#9CA3AF" : "#9F1239",
                  }}>
                  {ok ? "✔ " : ""}{subj.name}
                </span>
              );
            })}
          </div>
          )
        ) : shortfall.length > 0 ? (
          <p className="text-[13px] text-[#9F1239]/80">
            보충 필요: {shortfall.map(c => `${EXAM_SUBJECTS.find(s=>s.id===c.subjectId)?.name} ${c.missing}회`).join(", ")}
          </p>
        ) : done.length > 0 ? (
          <p className="text-[13px] text-[#065F46]/80">보충 완료: {done.map(id => EXAM_SUBJECTS.find(s => s.id === id)?.name).filter(Boolean).join(", ")}</p>
        ) : (
          <p className="text-[13px] text-[#111827]/50">쉬는 날</p>
        )}
      </div>
    </div>
  );
}

function ScheduleListScreen({ history, dayPlans }: { history:Record<string,string[]>; dayPlans:DayPlanOverrides }) {
  const todayStr    = toYMD(new Date());
  const groups      = scheduleMonthGroups();
  const studyDays   = FULL_SCHEDULE.filter(d => d.kind === "study");
  const restDays    = FULL_SCHEDULE.filter(d => d.kind !== "study");
  const dday        = diffDaysStr(todayStr, MIDTERM_EXAM_DATE);
  const MONTH_LABEL: Record<string,string> = { "07":"7월", "08":"8월", "09":"9월", "10":"10월" };

  return (
    <main className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 pb-16 space-y-5">
      <div className="relative rounded-3xl overflow-hidden p-6 sm:p-8" style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none"/>
        <div className="relative z-10">
          <p className="text-white/60 text-[13px] font-semibold mb-2">전체 일정표</p>
          <h1 className="text-white font-bold text-[1.5rem] sm:text-[1.9rem] leading-tight tracking-tight mb-4">
            7월 21일 ~ 10월 2일<br/>중간고사 대비 학습 계획
          </h1>
          <div className="flex flex-wrap gap-2">
            <div className="px-3 py-2 rounded-xl bg-white/14 border border-white/14">
              <p className="text-[12px] text-white/50 mb-0.5">중간고사까지</p>
              <p className="text-white font-bold text-sm" style={{ fontFamily:T.mono }}>{dday >= 0 ? `D-${dday}` : "당일"}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/14 border border-white/14">
              <p className="text-[12px] text-white/50 mb-0.5">공부일</p>
              <p className="text-white font-bold text-sm" style={{ fontFamily:T.mono }}>{studyDays.length}일</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/14 border border-white/14">
              <p className="text-[12px] text-white/50 mb-0.5">쉬는 날(보충)</p>
              <p className="text-white font-bold text-sm" style={{ fontFamily:T.mono }}>{restDays.length}일</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-[#EEF2FF] border border-[#4F46E5]/12">
        <Sun className="w-4 h-4 text-[#4F46E5] flex-shrink-0 mt-0.5"/>
        <p className="text-[12px] text-[#4338CA]/80 leading-relaxed">
          토·일요일과 공휴일은 공부일에서 제외돼요. 이 날들은 그 주에 못 한 과목을 보충하는 날로 써요.
        </p>
      </div>

      {Object.entries(groups).map(([monthKey, days]) => (
        <div key={monthKey} className={`${T.glassCard} rounded-3xl p-5 sm:p-6`} style={{ boxShadow:T.cardShadow }}>
          <h3 className="font-bold text-[#111827] text-[1rem] mb-3 px-1">{MONTH_LABEL[monthKey.slice(5)] ?? monthKey}</h3>
          <div className="space-y-1">
            {days.map(d => <ScheduleRow key={d.date} day={d} history={history} dayPlans={dayPlans} todayStr={todayStr}/>)}
          </div>
        </div>
      ))}
    </main>
  );
}

// ─── WEEKLY PLAN (이번 주 계획 — 체크한 과목이 오늘의 미션이 됨) ───────────────

function WeeklyPlanDay({ day, dayPlans, history, isToday, onToggle }: {
  day:ScheduleDay; dayPlans:DayPlanOverrides; history:Record<string,string[]>;
  isToday:boolean; onToggle:(date:string, subjectId:string)=>void;
}) {
  const isPast    = !isToday && diffDaysStr(toYMD(new Date()), day.date) < 0;
  const isFirstDay = day.date === STUDY_START_DATE && diffDaysStr(toYMD(new Date()), STUDY_START_DATE) > 0;
  const checked   = getCheckedSubjectIds(day.date, dayPlans);
  const done      = history[day.date] ?? [];
  const parsed    = parseYMD(day.date);

  return (
    <div className={`${T.glassCard} rounded-3xl p-5 sm:p-6`}
      style={{ boxShadow:T.cardShadow, border: (isToday || isFirstDay) ? `2px solid ${T.blue}40` : "2px solid transparent" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
            style={{ backgroundColor: (isToday || isFirstDay) ? "#EFF6FF" : "#F8FAFC" }}>
            <span className="text-[13px] font-bold leading-none" style={{ color: (isToday || isFirstDay) ? T.blue : "#111827" }}>{parsed.getDate()}</span>
            <span className="text-[11px] leading-none mt-0.5" style={{ color: (isToday || isFirstDay) ? T.blue : "#111827" }}>{CAL_DOW[day.dow]}</span>
          </div>
          <div>
            <p className="font-bold text-[#111827] text-[0.95rem]">{parsed.getMonth() + 1}월 {parsed.getDate()}일</p>
            <p className="text-[13px]" style={{ color: isFirstDay ? T.blue : "rgba(17,24,39,0.35)" }}>
              {isToday ? "오늘" : isFirstDay ? "학습 시작일" : isPast ? "지난 날" : "예정"}
            </p>
          </div>
        </div>
        <span className="text-[12px] font-bold text-[#111827]/60">{checked.length}과목 선택</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {EXAM_SUBJECTS.map(s => {
          const isChecked = checked.includes(s.id);
          const isDone    = done.includes(s.id);
          const disabled  = isPast || isDone; // 지난 날, 이미 완료한 과목은 결과만 보여주고 수정은 막음
          return (
            <button key={s.id} onClick={() => !disabled && onToggle(day.date, s.id)} disabled={disabled}
              className="flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all tap-scale"
              style={{
                backgroundColor: isDone ? "#D1FAE5" : isChecked ? `${s.color}0C` : "rgba(17,24,39,0.02)",
                borderColor:     isDone ? "rgba(16,185,129,0.2)" : isChecked ? `${s.color}30` : "rgba(17,24,39,0.06)",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled && !isChecked ? 0.45 : 1,
              }}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2"
                style={{
                  backgroundColor: isDone ? "#10B981" : isChecked ? s.color : "transparent",
                  borderColor:     isDone ? "#10B981" : isChecked ? s.color : "rgba(17,24,39,0.18)",
                }}>
                {(isDone || isChecked) && <Check className="w-3 h-3 text-white"/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold" style={{ color: isDone ? "#065F46" : "#111827", textDecoration: isDone ? "line-through" : "none" }}>
                  {s.name}
                </p>
                <p className="text-[12px] text-[#111827]/55 truncate">{pickMissionText(day.date, s.id)}</p>
              </div>
              {isDone && <span className="text-[11px] font-bold text-[#10B981] flex-shrink-0">완료</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyPlanScreen({ dayPlans, history, onToggle, onDone }: {
  dayPlans:DayPlanOverrides; history:Record<string,string[]>;
  onToggle:(date:string, subjectId:string)=>void; onDone:()=>void;
}) {
  const todayStr  = toYMD(new Date());
  const { start } = getWeekRange(todayStr);
  const weekEnd   = addDaysStr(start, 6);
  const weekDays  = FULL_SCHEDULE.filter(d => diffDaysStr(start, d.date) >= 0 && diffDaysStr(d.date, weekEnd) >= 0);
  const studyDays = weekDays.filter(d => d.kind === "study");

  const ps = parseYMD(start);
  const pe = parseYMD(weekEnd);
  const rangeLabel = `${ps.getMonth() + 1}/${ps.getDate()} ~ ${pe.getMonth() + 1}/${pe.getDate()}`;

  return (
    <>
    <main className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 pb-28 space-y-5">
      <div className="relative rounded-3xl overflow-hidden p-6 sm:p-8" style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none"/>
        <div className="relative z-10">
          <p className="text-white/60 text-[13px] font-semibold mb-2">이번 주 계획 · {rangeLabel}</p>
          <h1 className="text-white font-bold text-[1.5rem] sm:text-[1.9rem] leading-tight tracking-tight mb-4">
            요일마다 체크한 과목이<br/>그날의 미션이 돼요
          </h1>
          <div className="flex flex-wrap gap-2">
            <div className="px-3 py-2 rounded-xl bg-white/14 border border-white/14">
              <p className="text-[12px] text-white/50 mb-0.5">이번 주 공부일</p>
              <p className="text-white font-bold text-sm" style={{ fontFamily:T.mono }}>{studyDays.length}일</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-[#EEF2FF] border border-[#4F46E5]/12">
        <Sun className="w-4 h-4 text-[#4F46E5] flex-shrink-0 mt-0.5"/>
        <p className="text-[12px] text-[#4338CA]/80 leading-relaxed">
          기말고사 점수를 기준으로 하루 3과목 정도를 추천해서 미리 체크해뒀어요. 날짜별로 체크를 바로 바꿀 수 있고,
          바꾸면 바로 반영돼요 — 따로 저장 버튼을 누를 필요 없어요. 오늘 날짜를 바꾸면 홈 화면에 바로 나타나요.
        </p>
      </div>

      {studyDays.map(day => (
        <WeeklyPlanDay key={day.date} day={day} dayPlans={dayPlans} history={history}
          isToday={day.date === todayStr} onToggle={onToggle}/>
      ))}
    </main>
    <div className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-2xl bg-white/90 border-t border-black/[0.06]"
      style={{ paddingBottom:"env(safe-area-inset-bottom)", boxShadow:"0 -4px 28px rgba(17,24,39,0.08)" }}>
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-3">
        <button onClick={onDone}
          className="cta-btn w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 6px 24px rgba(37,99,235,0.35)" }}>
          <Check className="w-4 h-4"/> 확인
        </button>
      </div>
    </div>
    </>
  );
}

// ─── GOAL SCORE SETTING (기말고사 성적표 기반 목표점수 설정) ───────────────────

/** 점수 구간별 색 — 낮을수록 빨강, 높을수록 초록으로 한눈에 각인되게 */
function scoreTierColor(score: number): string {
  if (score < 60) return "#DC2626";
  if (score < 80) return "#D97706";
  return "#059669";
}

function GoalScoreSummaryCard({ goals, onClick }: { goals:Record<string, number>; onClick:()=>void }) {
  const weakest = [...EXAM_SUBJECTS].sort((a,b)=>a.examScore-b.examScore)[0];
  return (
    <div onClick={onClick} role="button"
      className="relative rounded-3xl p-5 overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5"
      style={{ background:"linear-gradient(140deg,#EEF2FF 0%,#E0E7FF 55%,#DDD6FE 100%)", boxShadow:"0 4px 28px rgba(79,70,229,0.14)" }}>
      <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-[#4F46E5]/10 pointer-events-none"/>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-[#4F46E5]"/>
          </div>
          <div>
            <p className="text-sm font-bold text-[#312E81]">2학기 중간고사 목표점수</p>
            <p className="text-[13px] text-[#4338CA]/50">기말고사 성적표 기반으로 정해보자</p>
          </div>
        </div>
        <p className="text-[#312E81]/80 text-[0.85rem] leading-relaxed mb-4">
          {weakest.name} {weakest.examScore}점 — 2학기 중간고사 목표를 정해볼까?
        </p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {EXAM_SUBJECTS.map(s => (
            <div key={s.id} className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl bg-white/60">
              <span className="text-[12px] font-semibold text-[#4338CA]/55">{s.name}</span>
              <span className="text-[1.15rem] font-extrabold leading-none" style={{ color:scoreTierColor(s.examScore) }}>{s.examScore}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[#4F46E5] text-[13px] font-bold">
          목표점수 설정하기 <ArrowRight className="w-3.5 h-3.5"/>
        </div>
      </div>
    </div>
  );
}

function GoalScoreCard({ subject, goal, onChange }: {
  subject:ExamSubject; goal:number; onChange:(v:number)=>void;
}) {
  const Icon = subject.icon;
  const diff = goal - subject.examScore;
  const needsFocus = subject.examScore < 60;
  const tierColor = scoreTierColor(subject.examScore);
  return (
    <div className={`${T.glassCard} rounded-2xl p-5`} style={{ boxShadow:T.cardShadow }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:subject.bg }}>
            <Icon className="w-5 h-5" style={{ color:subject.color }}/>
          </div>
          <div>
            <p className="font-bold text-[#111827] text-[0.9rem] leading-tight">{subject.name}</p>
            <p className="text-[12px] text-[#111827]/55 mt-0.5">기말고사 점수</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[1.5rem] font-extrabold leading-none" style={{ color:tierColor }}>{subject.examScore}</span>
          {needsFocus && (
            <span className="text-[12px] font-bold px-2 py-1 rounded-full bg-[#FEE2E2] text-[#DC2626]">집중 필요</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range" min={subject.examScore} max={100} step={1} value={goal}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor:subject.color, background:"#F1F5F9" }}
        />
        <div className="w-14 text-right flex-shrink-0">
          <span className="text-lg font-bold" style={{ color:subject.color }}>{goal}</span>
          <span className="text-[13px] text-[#111827]/55">점</span>
        </div>
      </div>
      <p className="text-[13px] text-[#111827]/60 mt-2">
        {diff > 0 ? `현재보다 +${diff}점 목표` : "지금 점수 유지하기"}
      </p>
    </div>
  );
}

function GoalSettingScreen({ goals, onChange, onSave }: {
  goals:Record<string, number>; onChange:(id:string, v:number)=>void; onSave:()=>void;
}) {
  return (
    <main className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 pb-36 lg:pb-12 space-y-4">
      <div className="relative rounded-3xl overflow-hidden p-6 sm:p-8"
        style={{ background:T.heroGrad, boxShadow:T.heroShadow }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none"/>
        <div className="relative z-10">
          <p className="text-white/60 text-[13px] font-semibold mb-2">기말고사 성적표</p>
          <h1 className="text-white font-bold text-[1.6rem] sm:text-[2rem] leading-tight tracking-tight mb-5">
            성적표를 보고<br/>2학기 중간고사 목표를 정해보자!
          </h1>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {EXAM_SUBJECTS.map(s => (
              <div key={s.id} className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-white/12 border border-white/14">
                <span className="text-[13px] font-semibold text-white/60">{s.name}</span>
                <span className="text-[1.4rem] font-extrabold leading-none text-white">{s.examScore}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {EXAM_SUBJECTS.map(s => (
          <GoalScoreCard key={s.id} subject={s} goal={goals[s.id] ?? s.examScore} onChange={v => onChange(s.id, v)}/>
        ))}
      </div>

      <button onClick={onSave}
        className="cta-btn w-full flex items-center justify-center gap-3 py-[16px] rounded-2xl text-white font-bold text-[1rem]"
        style={{ background:"linear-gradient(135deg,#1d4ed8,#2563EB 45%,#4f46e5)", boxShadow:"0 8px 40px rgba(37,99,235,0.38)" }}>
        목표점수 저장하기 <ArrowRight className="w-5 h-5"/>
      </button>
    </main>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────

/** 오늘이 방학 시작 전 / 보충일(주말·공휴일) / 중간고사 이후 인지 알려주는 배너 */
function ScheduleStatusBanner({
  status, dday, catchupSubjects, onStartCatchup, onPreviewPlan,
}: {
  status: "before" | "study" | "rest" | "after";
  dday: number;
  catchupSubjects: Array<{ id:string; name:string; color:string; bg:string; missing:number }>;
  onStartCatchup: (id:string) => void;
  onPreviewPlan: () => void;
}) {
  if (status === "before") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl flex-wrap" style={{ backgroundColor:"#EEF2FF" }}>
        <Sun className="w-5 h-5 text-[#4F46E5] flex-shrink-0"/>
        <p className="text-[13px] font-semibold text-[#3730A3] flex-1 min-w-[200px]">
          공부 시작까지 D-{dday}! 7월 21일부터 중간고사(10/2) 대비 학습 계획이 시작돼요.
        </p>
        <button onClick={onPreviewPlan}
          className="text-[12px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 flex-shrink-0"
          style={{ backgroundColor:"#4F46E5", color:"white" }}>
          내일 계획 미리 보기 <ChevronRight className="w-3.5 h-3.5"/>
        </button>
      </div>
    );
  }
  if (status === "after") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ backgroundColor:"#FFF1F2" }}>
        <Trophy className="w-5 h-5 text-[#E11D48] flex-shrink-0"/>
        <p className="text-[13px] font-semibold text-[#9F1239]">중간고사 기간이에요. 그동안 정말 수고했어요!</p>
      </div>
    );
  }
  if (status === "rest") {
    if (catchupSubjects.length === 0) {
      return (
        <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ backgroundColor:"#D1FAE5" }}>
          <span className="text-xl leading-none">🌿</span>
          <p className="text-[13px] font-semibold text-[#065F46]">오늘은 쉬는 날! 이번 주 학습을 모두 마쳤어요.</p>
        </div>
      );
    }
    return (
      <div className="rounded-3xl p-5" style={{ background:"linear-gradient(140deg,#FFFBEB,#FEF3C7)", boxShadow:"0 4px 28px rgba(245,158,11,0.14)" }}>
        <p className="text-[13px] font-bold text-[#92400E] mb-1">오늘은 보충학습 하는 날이에요</p>
        <p className="text-[13px] text-[#92400E]/65 mb-3.5">이번 주에 못한 과목을 오늘 채워볼까?</p>
        <div className="flex flex-wrap gap-2">
          {catchupSubjects.map(s => (
            <button key={s.id} onClick={() => onStartCatchup(s.id)}
              className="chip-btn flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-bold"
              style={{ backgroundColor:s.bg, color:s.color }}>
              {s.name} {s.missing}회 보충하기
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null; // 공부일 — 평소 오늘의 미션 그대로 노출
}

function HomeScreen({
  subjects, onStart, onBeginDay, exp, streak, onNav, goals, history, dayPlans,
  scheduleStatus, dday, catchupItems,
}: {
  subjects:Subject[]; onStart:(id:string)=>void; onBeginDay:()=>void;
  exp:number; streak:number; onNav:(s:Screen)=>void; goals:Record<string, number>;
  history:Record<string,string[]>; dayPlans:DayPlanOverrides;
  scheduleStatus: "before" | "study" | "rest" | "after"; dday:number;
  catchupItems: Array<{ subjectId:string; missing:number }>;
}) {
  const catchupSubjects = catchupItems.map(c => {
    const s = EXAM_SUBJECTS.find(x => x.id === c.subjectId)!;
    return { id:s.id, name:s.name, color:s.color, bg:s.bg, missing:c.missing };
  });
  const todayStr    = toYMD(new Date());
  const totalDays   = FULL_SCHEDULE.length;
  const dayIndex    = Math.min(Math.max(diffDaysStr(STUDY_START_DATE, todayStr) + 1, 0), totalDays);
  const expMultiplier = getExpMultiplier(getConsecutiveCompleteWeeks(history, todayStr, dayPlans));
  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 pb-28 lg:pb-12">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left — 8 col equivalent */}
        <div className="flex-1 min-w-0 space-y-6">
          <HeroSection completed={subjects.filter(s=>s.done).length} total={subjects.length} onBeginDay={onBeginDay} exp={exp} streak={streak} dayIndex={dayIndex} totalDays={totalDays} expMultiplier={expMultiplier}/>
          <ScheduleStatusBanner status={scheduleStatus} dday={dday} catchupSubjects={catchupSubjects} onStartCatchup={onStart} onPreviewPlan={() => onNav("weekly-plan")}/>
          <TodaysMissions subjects={subjects} onStart={onStart} onViewWeeklyPlan={() => onNav("weekly-plan")} onViewStudyLog={() => onNav("study-log")} beforeStart={scheduleStatus === "before"}/>
        </div>
        {/* Right sidebar — fixed 320px */}
        <aside className="lg:w-[320px] flex-shrink-0 space-y-5">
          <GoalScoreSummaryCard goals={goals} onClick={() => onNav("goal-setting")}/>
          <GrowthSection onClick={() => onNav("growth-dashboard")} exp={exp} streak={streak} history={history} dayPlans={dayPlans}/>
          <HomeEncouragementCard onClick={() => onNav("notifications")}/>
          <UpcomingSection dayPlans={dayPlans} onCalendar={() => onNav("calendar")}/>
        </aside>
      </div>
    </main>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────

const SCREEN_TITLES: Partial<Record<Screen, string>> = {
  briefing:        "오늘의 브리핑",
  select:          "과목 선택",
  mission:         "오늘의 미션",
  focus:           "집중하기",
  photo:           "사진 인증",
  reward:          "미션 완료",
  reflection:      "오늘 하루 돌아보기",
  "daily-review":  "오늘 하루 돌아보기",
  "tree-evolution":    "나의 성장",
  "growth-dashboard":  "나의 성장",
  "calendar":          "학습 캘린더",
  "mom-dashboard":     "엄마 대시보드",
  "notifications":     "알림 센터",
  "settings":          "설정",
  "admin":             "학습현황",
  "goal-setting":      "2학기 중간고사 목표점수",
  "schedule-list":     "전체 일정표",
  "weekly-plan":       "이번 주 계획",
  "study-log":         "학습 기록",
};

const SCREEN_BACK: Partial<Record<Screen, Screen>> = {
  briefing:        "home",
  select:          "briefing",
  mission:         "select",
  focus:           "mission",
  photo:           "focus",
  reflection:      "reward",
  "daily-review":  "home",
  "tree-evolution":   "home",
  "growth-dashboard": "home",
  "calendar":         "home",
  "mom-dashboard":    "home",
  "notifications":    "home",
  "settings":         "home",
  "admin":            "home",
  "goal-setting":     "home",
  "schedule-list":    "calendar",
  "weekly-plan":      "home",
  "study-log":        "home",
};

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_EXP      = "wh-exp-v1";
const LS_STREAK   = "wh-streak-v1";
const LS_GOALS    = "wh-goal-scores-v1";
const LS_HISTORY  = "wh-study-history-v1";
const LS_NOTIFS   = "wh-notifications-v1";
const LS_DAY_PLANS = "wh-day-plans-v1";
const LS_LAST_DATE = "wh-last-date-v1";
const LS_ALLOWANCE_PAID    = "wh-allowance-paid-v1";
const LS_ALLOWANCE_PENDING = "wh-allowance-pending-v1";
const LS_STUDY_LOG = "wh-study-log-v1";

type AllowanceRequest = { amount: number; requestedAt: string };
type DeviceRole = "child" | "parent";
const LS_DEVICE_ROLE = "wh-device-role-v1"; // 이 기기(브라우저)가 아이 폰인지 부모 폰인지 — 로그인이 아니라 기기별 표시일 뿐, 클라우드 동기화 대상 아님
const LS_PARENT_PIN = "wh-parent-pin-hash-v1"; // 부모 모드로 바꿀 때 필요한 PIN의 해시 — 가족 전체가 공유(클라우드 동기화)
type StudyLogEntry = { subjectId:string; missionText:string; elapsedSeconds:number; photoDataUrl:string; completedAt:string };
type StudyLog = Record<string, StudyLogEntry[]>;

/** 사진을 작게 압축해서 data URL로 반환 — localStorage/DB에 저장 가능한 크기로 줄인다 */
function compressImageFile(file: File, maxDim = 640, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error("no 2d context")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("image load failed")); };
    img.src = objectUrl;
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}초`;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

/** PIN을 그대로 저장하지 않고 해시로 저장 — 가족이 공유하는 클라우드 데이터에 들어가기 때문 */
async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`woohyun-pin-${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

// ── 부모 PIN 입력/생성 모달 — "부모님 폰"으로 바꾸려면 항상 이걸 통과해야 한다 ──
function PinPrompt({ mode, verifyHash, onCancel, onSuccess }: {
  mode:"create" | "verify"; verifyHash?:string | null;
  onCancel:()=>void; onSuccess:(hash:string)=>void;
}) {
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleDigit = (d: string) => {
    if (checking || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length < 4) return;

    if (mode === "create") {
      if (step === "enter") {
        setFirstPin(next);
        setStep("confirm");
        setPin("");
      } else if (next === firstPin) {
        setChecking(true);
        hashPin(next).then(onSuccess);
      } else {
        setError("PIN이 서로 달라요. 처음부터 다시 입력해주세요.");
        setStep("enter");
        setFirstPin("");
        setPin("");
      }
    } else {
      setChecking(true);
      hashPin(next).then(h => {
        if (h === verifyHash) { onSuccess(h); return; }
        setError("PIN이 맞지 않아요.");
        setPin("");
        setChecking(false);
      });
    }
  };

  const title = mode === "create" ? (step === "enter" ? "부모님 PIN 만들기" : "PIN 다시 입력해서 확인") : "부모님 PIN 입력";
  const desc  = mode === "create"
    ? "4자리 숫자를 정해주세요. 앞으로 이 폰이나 다른 폰을 부모님 모드로 바꿀 때 필요해요."
    : "이 폰을 부모님 모드로 바꾸려면 PIN을 입력하세요.";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor:"rgba(17,24,39,0.55)", backdropFilter:"blur(4px)" }}>
      <div className={`${T.glassCard} rounded-3xl p-6 w-full max-w-sm`} style={{ boxShadow:"0 24px 64px rgba(17,24,39,0.3)" }}>
        <h3 className="font-bold text-[#111827] text-base mb-1 text-center">{title}</h3>
        <p className="text-[13px] text-[#111827]/55 mb-5 text-center leading-relaxed">{desc}</p>
        <div className="flex items-center justify-center gap-3 mb-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="w-4 h-4 rounded-full border-2"
              style={{ backgroundColor: i < pin.length ? T.indigo : "transparent", borderColor: T.indigo }}/>
          ))}
        </div>
        <p className="text-center text-[13px] text-[#DC2626] font-semibold mb-3 h-[18px]">{error}</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k,i) => (
            k === "" ? <div key={i}/> : (
              <button key={i} disabled={checking}
                onClick={() => k === "⌫" ? setPin(p => p.slice(0,-1)) : handleDigit(k)}
                className="py-3.5 rounded-2xl text-lg font-bold text-[#111827] bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors disabled:opacity-40">
                {k}
              </button>
            )
          ))}
        </div>
        <button onClick={onCancel}
          className="w-full py-3 rounded-2xl text-sm font-bold text-[#111827]/60 border-2 border-[#E5E7EB] hover:bg-[#F8FAFC] transition-colors">
          취소
        </button>
      </div>
    </div>
  );
}

// ── 최초 접속 시 "이 기기는 누구 거예요?" — 로그인이 아니라 이 브라우저에만 남는 표시 ──
// 부모님 모드는 PIN을 통과해야만 선택할 수 있다 (아이가 설정에서 마음대로 바꾸는 걸 막기 위함)
function RoleSelectScreen({ parentPinHash, onSelectChild, onSelectParent }: {
  parentPinHash:string | null; onSelectChild:()=>void; onSelectParent:(hash:string)=>void;
}) {
  const [showPin, setShowPin] = useState(false);
  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6" style={{ backgroundColor:T.bg, fontFamily:T.font }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
          <span className="text-white text-xl font-bold">W</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#111827] mb-2">이 폰은 누가 쓰나요?</h1>
          <p className="text-[#111827]/55 text-sm leading-relaxed">
            로그인은 아니고, 이 폰에서만 기억하는 표시예요.<br/>용돈 지급 완료 같은 버튼이 다르게 보여요.
          </p>
        </div>
        <div className="w-full max-w-xs space-y-3 mt-2">
          <button onClick={onSelectChild}
            className="w-full py-5 rounded-3xl flex flex-col items-center gap-1 text-white font-bold"
            style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})`, boxShadow:"0 8px 32px rgba(37,99,235,0.3)" }}>
            <span className="text-2xl">🧒</span> 아이 폰이에요
          </button>
          <button onClick={() => setShowPin(true)}
            className="w-full py-5 rounded-3xl flex flex-col items-center gap-1 font-bold text-[#78350F]"
            style={{ background:"linear-gradient(135deg,#FEF3C7,#FDE68A)", boxShadow:"0 8px 32px rgba(217,119,6,0.2)" }}>
            <span className="text-2xl">👪</span> 부모님 폰이에요
          </button>
        </div>
        <p className="text-[#111827]/32 text-[12px] mt-2">부모님 모드는 PIN이 필요해요 · 아이 모드는 설정에서 언제든 바꿀 수 있어요</p>
      </div>
      {showPin && (
        <PinPrompt
          mode={parentPinHash ? "verify" : "create"}
          verifyHash={parentPinHash}
          onCancel={() => setShowPin(false)}
          onSuccess={(hash) => { onSelectParent(hash); setShowPin(false); }}
        />
      )}
    </>
  );
}

export default function App() {
  const [screen,     setScreen]     = useState<Screen>("home");
  const [selectedId, setSelectedId] = useState("math");
  // 지금 진행 중인 미션의 구체적인 텍스트 — 시작 시점에 고정해서 완료 후에도
  // (그 다음 주간 계획 항목으로 넘어가지 않고) 같은 문구가 보상 화면까지 유지되게 한다
  const [selectedMissionText, setSelectedMissionText] = useState("");
  const [activeNav,  setActiveNav]  = useState(0);
  const [exp,        setExp]        = useState<number>(() => loadLS(LS_EXP, 0));
  const [streak,     setStreak]     = useState<number>(() => loadLS(LS_STREAK, 0));
  // 보상 화면에 표시할 "이번에 실제로 받은 EXP"와 연속완료 배수 — 저장하지 않는 화면 전용 값
  const [lastAwardedExp, setLastAwardedExp] = useState(0);
  const [lastMultiplier, setLastMultiplier] = useState(1);
  // 기말고사 성적표 기반 목표점수 — 기본값은 각 과목의 기말고사 점수
  const [goalScores, setGoalScores] = useState<Record<string, number>>(() => {
    const saved = loadLS<Record<string, number>>(LS_GOALS, {});
    return Object.fromEntries(EXAM_SUBJECTS.map(s => [s.id, saved[s.id] ?? s.examScore]));
  });
  // 날짜별 학습 기록 — { "2026-07-21": ["math","en"] } · 달력·일정표·보충학습 계산의 기준 데이터
  const [history, setHistory] = useState<Record<string, string[]>>(() => loadLS(LS_HISTORY, {}));
  // 실제 이벤트(미션 완료, 배지 획득)로 쌓이는 알림 — 하드코딩된 목데이터 없음
  const [notifications, setNotifications] = useState<NotifEntry[]>(() => loadLS(LS_NOTIFS, []));
  // 날짜별 체크된 과목 — 아이가 직접 체크박스로 바꾼 날짜만 저장, 나머지 날은 자동 추천값 사용
  const [dayPlans, setDayPlans] = useState<DayPlanOverrides>(() => loadLS(LS_DAY_PLANS, {}));
  // 용돈 — EXP가 그대로 원(1EXP=1원). 이미 지급된 금액은 빼고 계산한다 (exp 자체는 레벨용이라 건드리지 않음)
  const [allowancePaid, setAllowancePaid] = useState<number>(() => loadLS(LS_ALLOWANCE_PAID, 0));
  const [allowancePending, setAllowancePending] = useState<AllowanceRequest | null>(() => loadLS(LS_ALLOWANCE_PENDING, null));
  // 날짜별 학습 기록(사진·공부 시간) — 미션 완료 시마다 쌓인다. 실제 완료 증빙 자료
  const [studyLog, setStudyLog] = useState<StudyLog>(() => loadLS(LS_STUDY_LOG, {}));
  // 지금 진행 중인 미션에서 실제로 집중한 시간(초) — Focus 화면 완료 시점에 기록되고 사진 화면을 거쳐 학습 기록에 저장된다
  const [selectedElapsedSeconds, setSelectedElapsedSeconds] = useState(0);
  // 과목 체크할 때마다 "반영됐어요" 확인 토스트 — 바로 적용된다는 걸 눈으로 보여줌
  const [planToast, setPlanToast] = useState<string | null>(null);
  const planToastTimer = useRef<number | undefined>(undefined);

  // Persist to localStorage whenever state changes
  useEffect(() => { localStorage.setItem(LS_EXP,      JSON.stringify(exp));      }, [exp]);
  useEffect(() => { localStorage.setItem(LS_STREAK,   JSON.stringify(streak));   }, [streak]);
  useEffect(() => { localStorage.setItem(LS_GOALS,    JSON.stringify(goalScores)); }, [goalScores]);
  useEffect(() => { localStorage.setItem(LS_HISTORY,  JSON.stringify(history));    }, [history]);
  useEffect(() => { localStorage.setItem(LS_NOTIFS,   JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem(LS_DAY_PLANS, JSON.stringify(dayPlans)); }, [dayPlans]);
  useEffect(() => { localStorage.setItem(LS_ALLOWANCE_PAID, JSON.stringify(allowancePaid)); }, [allowancePaid]);
  useEffect(() => { localStorage.setItem(LS_ALLOWANCE_PENDING, JSON.stringify(allowancePending)); }, [allowancePending]);
  // 사진이 쌓이면 용량이 커질 수 있어 저장 실패(용량 초과)해도 앱이 멈추지 않게 방어
  useEffect(() => {
    try { localStorage.setItem(LS_STUDY_LOG, JSON.stringify(studyLog)); }
    catch { console.warn("학습 기록 저장 공간이 부족해요 — 오래된 사진부터 정리가 필요할 수 있어요."); }
  }, [studyLog]);

  // 이 기기가 아이 폰인지 부모 폰인지 — 로그인이 아니라 기기별 로컬 표시, 클라우드 동기화 안 함
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(() => loadLS(LS_DEVICE_ROLE, null));
  useEffect(() => { if (deviceRole) localStorage.setItem(LS_DEVICE_ROLE, JSON.stringify(deviceRole)); }, [deviceRole]);
  // 부모 PIN 해시 — 가족 전체가 공유해야 해서(다른 기기에서도 검증 가능해야 함) 클라우드로 동기화된다
  const [parentPinHash, setParentPinHash] = useState<string | null>(() => loadLS(LS_PARENT_PIN, null));
  useEffect(() => { localStorage.setItem(LS_PARENT_PIN, JSON.stringify(parentPinHash)); }, [parentPinHash]);

  // ── 가족 공유 동기화 (Supabase) ────────────────────────────────────────────────
  // familyId: 링크의 ?fam= 값이 있으면 그걸, 없으면 이 기기에 저장된 값, 그것도 없으면 새로 발급
  const [familyId] = useState(() => resolveFamilyId());
  // Supabase가 설정 안 되어 있으면(로컬 개발 등) 클라우드 단계를 건너뛰고 바로 로컬 데이터로 시작
  const [cloudReady, setCloudReady] = useState(!supabaseEnabled);
  const cloudSaveTimer = useRef<number | undefined>(undefined);

  // 최초 1회 — 클라우드에 이미 저장된 데이터가 있으면 그걸로 덮어써서 시작한다
  useEffect(() => {
    if (!supabaseEnabled) return;
    let cancelled = false;
    fetchFamilyData(familyId).then(remote => {
      if (cancelled) return;
      if (remote && Object.keys(remote).length > 0) {
        if (typeof remote.exp === "number") setExp(remote.exp);
        if (typeof remote.streak === "number") setStreak(remote.streak);
        if (remote.goalScores && typeof remote.goalScores === "object") setGoalScores(remote.goalScores as Record<string, number>);
        if (remote.history && typeof remote.history === "object") setHistory(remote.history as Record<string, string[]>);
        if (Array.isArray(remote.notifications)) setNotifications(remote.notifications as NotifEntry[]);
        if (remote.dayPlans && typeof remote.dayPlans === "object") setDayPlans(remote.dayPlans as DayPlanOverrides);
        if (typeof remote.allowancePaid === "number") setAllowancePaid(remote.allowancePaid);
        if (remote.allowancePending === null || (remote.allowancePending && typeof remote.allowancePending === "object")) {
          setAllowancePending(remote.allowancePending as AllowanceRequest | null);
        }
        if (remote.studyLog && typeof remote.studyLog === "object") setStudyLog(remote.studyLog as StudyLog);
        if (typeof remote.parentPinHash === "string" || remote.parentPinHash === null) setParentPinHash(remote.parentPinHash as string | null);
      }
      setCloudReady(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  // 데이터가 바뀔 때마다(0.7초 디바운스) 클라우드로 저장 — 최초 로딩이 끝난 뒤부터만
  useEffect(() => {
    if (!supabaseEnabled || !cloudReady) return;
    if (cloudSaveTimer.current) window.clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = window.setTimeout(() => {
      saveFamilyData(familyId, { exp, streak, goalScores, history, notifications, dayPlans, allowancePaid, allowancePending, studyLog, parentPinHash });
    }, 700);
    return () => { if (cloudSaveTimer.current) window.clearTimeout(cloudSaveTimer.current); };
  }, [exp, streak, goalScores, history, notifications, dayPlans, allowancePaid, allowancePending, studyLog, parentPinHash, cloudReady, familyId]);

  const handleGoalChange = (id: string, v: number) =>
    setGoalScores(prev => ({ ...prev, [id]: v }));

  // 특정 날짜의 과목 체크/해제 — 즉시 반영되고, 오늘 날짜를 바꾸면 홈 화면에 바로 나타난다
  const toggleDaySubject = (date: string, subjectId: string) => {
    const subjName = EXAM_SUBJECTS.find(s => s.id === subjectId)?.name ?? "";
    let willBeChecked = false;
    setDayPlans(prev => {
      const current = prev[date] ?? getDefaultDaySubjects(date);
      willBeChecked = !current.includes(subjectId);
      const next = willBeChecked ? [...current, subjectId] : current.filter(id => id !== subjectId);
      return { ...prev, [date]: next };
    });
    const dateLabel = date === todayStr ? "오늘" : `${parseYMD(date).getMonth() + 1}/${parseYMD(date).getDate()}`;
    setPlanToast(`✓ ${dateLabel} 계획에 ${subjName} ${willBeChecked ? "추가" : "제외"}됐어요`);
    if (planToastTimer.current) window.clearTimeout(planToastTimer.current);
    planToastTimer.current = window.setTimeout(() => setPlanToast(null), 2200);
  };

  const pushNotification = (n: Omit<NotifEntry, "id" | "createdAt" | "read">) => {
    setNotifications(prev => [
      { ...n, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString(), read: false },
      ...prev,
    ]);
  };
  const markNotifRead    = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllNotifsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  // 용돈 — EXP(=원)에서 이미 지급했거나 요청 중인 금액을 뺀 나머지가 지금 요청 가능한 적립금
  const availableAllowance = Math.max(0, exp - allowancePaid - (allowancePending?.amount ?? 0));

  const handleRequestAllowance = () => {
    if (allowancePending || availableAllowance <= 0) return;
    const amount = availableAllowance;
    setAllowancePending({ amount, requestedAt: new Date().toISOString() });
    pushNotification({
      category: "reward", icon: "💰",
      title: `우현이가 용돈 ${amount.toLocaleString()}원을 요청했어요`,
      body: "계좌이체 후 성장 페이지의 '지급 완료' 버튼을 눌러주세요.",
    });
  };

  const handleConfirmPayout = () => {
    if (!allowancePending) return;
    setAllowancePaid(prev => prev + allowancePending.amount);
    setAllowancePending(null);
  };

  const todayStr        = toYMD(new Date());
  const todaySchedule    = FULL_SCHEDULE.find(d => d.date === todayStr);
  const isRestDay        = !!todaySchedule && todaySchedule.kind !== "study";
  const beforeStudyStart = diffDaysStr(todayStr, STUDY_START_DATE) > 0;
  const afterMidterm     = diffDaysStr(todayStr, MIDTERM_EXAM_DATE) < 0;
  const weeklyShortfall   = getWeeklyShortfall(history, todayStr, dayPlans);
  const todaySubjects     = buildTodaySubjects(todayStr, dayPlans, history);

  const goTo = (s: Screen) => setScreen(s);
  const goBack = () => {
    const prev = SCREEN_BACK[screen];
    if (prev) setScreen(prev);
  };

  // Called from home screen quick-start buttons — jump into the study flow
  // for that subject instead of marking it done immediately
  const handleSubjectStart = (id: string) => {
    setSelectedId(id);
    setSelectedMissionText(pickMissionText(todayStr, id));
    goTo("mission");
  };

  // Called when photo is submitted (mission fully completed)
  const handleMissionComplete = (photoDataUrl: string) => {
    const studySub = EXAM_SUBJECTS.find(s => s.id === selectedId);
    if (studySub) {
      const beforeBadges = getBadgeStatus({ exp, streak, history, dayPlans });

      // 학습 기록에 사진·공부 시간 저장 — "학습 기록" 화면에서 확인 가능
      setStudyLog(prev => ({
        ...prev,
        [todayStr]: [
          ...(prev[todayStr] ?? []),
          { subjectId: selectedId, missionText: selectedMissionText, elapsedSeconds: selectedElapsedSeconds, photoDataUrl, completedAt: new Date().toISOString() },
        ],
      }));

      // 지난 주까지 연속으로 다 채운 주가 몇 주인지에 따라 이번 주 EXP 배수가 정해진다 (다음 주부터 적용)
      const multiplier = getExpMultiplier(getConsecutiveCompleteWeeks(history, todayStr, dayPlans));
      const awarded = studySub.exp * multiplier;
      setLastAwardedExp(awarded);
      setLastMultiplier(multiplier);

      const newExp = exp + awarded;
      setExp(newExp);

      // 오늘 날짜에 완료 과목 기록 — 달력/일정표/보충학습 계산에 쓰임
      const newHistory = {
        ...history,
        [todayStr]: Array.from(new Set([...(history[todayStr] ?? []), selectedId])),
      };
      setHistory(newHistory);

      // Update streak (once per day)
      const lastDate = loadLS<string | null>(LS_LAST_DATE, null);
      let newStreak = streak;
      if (lastDate !== todayStr) {
        localStorage.setItem(LS_LAST_DATE, todayStr);
        newStreak = lastDate === addDaysStr(todayStr, -1) ? streak + 1 : 1;
        setStreak(newStreak);
      }

      pushNotification({
        category: "reward", icon: "⚡",
        title: multiplier > 1 ? `+${awarded} EXP 획득! (연속완료 ×${multiplier})` : `+${awarded} EXP 획득!`,
        body: `${studySub.name} 미션을 완료했어요.`,
      });

      const afterBadges = getBadgeStatus({ exp: newExp, streak: newStreak, history: newHistory, dayPlans });
      afterBadges.forEach(b => {
        const was = beforeBadges.find(x => x.id === b.id);
        if (b.unlocked && was && !was.unlocked) {
          pushNotification({ category:"streak", icon:b.icon, title:"배지 획득!", body:`'${b.label}' 배지를 획득했어요.` });
        }
      });
    }
    goTo("reward");
  };

  // Unified tab navigation (used by home BottomNav + GD/Cal internal navs)
  const handleNav = (i: number) => {
    setActiveNav(i);
    if (i === 0) goTo("home");
    if (i === 1) goTo("weekly-plan");
    if (i === 2) goTo("growth-dashboard");
    if (i === 3) goTo("calendar");
    if (i === 4) goTo("admin");
  };

  // growth-dashboard is a top-level tab → no back arrow, just logo + centred title
  const noBackScreens = new Set<Screen>(["home","growth-dashboard","calendar","mom-dashboard"]);
  const showNav    = screen === "home";
  const showTopNav = true;
  const title      = SCREEN_TITLES[screen];
  const onBack     = noBackScreens.has(screen) ? undefined : goBack;

  if (!cloudReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor:T.bg, fontFamily:T.font }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center animate-pulse"
          style={{ background:`linear-gradient(135deg,${T.blue},${T.indigo})` }}>
          <span className="text-white text-sm font-bold">W</span>
        </div>
        <p className="text-[#111827]/60 text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (!deviceRole) {
    return (
      <RoleSelectScreen
        parentPinHash={parentPinHash}
        onSelectChild={() => setDeviceRole("child")}
        onSelectParent={(hash) => { if (!parentPinHash) setParentPinHash(hash); setDeviceRole("parent"); }}
      />
    );
  }

  return (
    <div className="min-h-screen font-sans relative overflow-x-hidden"
      style={{ backgroundColor:T.bg, fontFamily:T.font }}>
      <style>{ANIMATION_STYLES}</style>

      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-48 -left-48 w-[650px] h-[650px] rounded-full"
          style={{ background:"radial-gradient(circle,rgba(37,99,235,0.08) 0%,transparent 60%)" }}/>
        <div className="absolute top-[42%] -right-52 w-[520px] h-[520px] rounded-full"
          style={{ background:"radial-gradient(circle,rgba(16,185,129,0.07) 0%,transparent 60%)" }}/>
        <div className="absolute -bottom-24 left-[28%] w-[420px] h-[420px] rounded-full"
          style={{ background:"radial-gradient(circle,rgba(245,158,11,0.06) 0%,transparent 60%)" }}/>
      </div>

      <div className="relative z-10">
        {showTopNav && (
          <TopNav onBack={onBack} backLabel="뒤로" title={title}
            onNotifications={()=>goTo("notifications")}
            onSettings={()=>goTo("settings")}
            onProfile={()=>goTo("admin")}
            onTab={handleNav}
            activeTab={activeNav}
            unreadCount={notifications.filter(n => !n.read).length}
          />
        )}

        {screen === "home" && (
          <HomeScreen subjects={todaySubjects} onStart={handleSubjectStart} onBeginDay={()=>goTo("briefing")} exp={exp} streak={streak} onNav={goTo} goals={goalScores} history={history} dayPlans={dayPlans}
            scheduleStatus={beforeStudyStart ? "before" : afterMidterm ? "after" : isRestDay ? "rest" : "study"}
            dday={beforeStudyStart ? diffDaysStr(todayStr, STUDY_START_DATE) : diffDaysStr(todayStr, MIDTERM_EXAM_DATE)}
            catchupItems={weeklyShortfall}
          />
        )}
        {screen === "briefing" && (
          <BriefingScreen subjects={todaySubjects} onStart={()=>goTo("select")} onBack={()=>goTo("home")}/>
        )}
        {screen === "select" && (
          <SubjectSelectScreen
            subjects={buildTodayStudySubjects(todayStr, dayPlans, history)}
            onSelect={id=>{ setSelectedId(id); setSelectedMissionText(pickMissionText(todayStr, id)); goTo("mission"); }}
            onBack={()=>goTo("briefing")}
          />
        )}
        {screen === "mission" && (
          <MissionDetailScreen subjectId={selectedId} missionText={selectedMissionText} onStart={()=>goTo("focus")} onBack={()=>goTo("select")}/>
        )}
        {screen === "focus" && (
          <FocusScreen subjectId={selectedId} missionText={selectedMissionText}
            onComplete={(elapsed)=>{ setSelectedElapsedSeconds(elapsed); goTo("photo"); }}
            onBack={()=>goTo("mission")} goalScore={goalScores[selectedId]}/>
        )}
        {screen === "photo" && (
          <PhotoScreen subjectId={selectedId} missionText={selectedMissionText} onSubmit={handleMissionComplete} onBack={()=>goTo("focus")}/>
        )}
        {screen === "reward" && (
          <RewardScreen
            subjectId={selectedId}
            missionText={selectedMissionText}
            onNext={()=>goTo("select")}
            onFinish={()=>goTo("reflection")}
            exp={exp}
            awardedExp={lastAwardedExp}
            multiplier={lastMultiplier}
          />
        )}
        {screen === "reflection" && (
          <ReflectionScreen
            onFinish={()=>handleNav(0)}
            todayXP={(history[todayStr] ?? []).reduce((sum, id) => sum + (EXAM_SUBJECTS.find(s => s.id === id)?.exp ?? 0), 0)}
            streak={streak}
            exp={exp}
          />
        )}
        {screen === "daily-review" && (
          <DailyReviewScreen
            onFinish={()=>handleNav(0)}
          />
        )}
        {screen === "tree-evolution" && (
          <TreeEvolutionScreen
            onFinish={()=>handleNav(0)}
          />
        )}
        {screen === "growth-dashboard" && (
          <GrowthDashboardScreen
            onHome={()=>handleNav(0)}
            onStartStudy={()=>goTo("briefing")}
            onTab={handleNav}
            onGoalScore={()=>goTo("goal-setting")}
            exp={exp}
            streak={streak}
            history={history}
            dayPlans={dayPlans}
            availableAllowance={availableAllowance}
            allowancePending={allowancePending}
            onRequestAllowance={handleRequestAllowance}
            onConfirmPayout={handleConfirmPayout}
            onViewStudyLog={()=>goTo("study-log")}
            isParent={deviceRole === "parent"}
          />
        )}
        {screen === "calendar" && (
          <CalendarScreen
            onHome={()=>handleNav(0)}
            onStartStudy={()=>goTo("briefing")}
            onTab={handleNav}
            onSchedule={()=>goTo("schedule-list")}
            history={history}
            dayPlans={dayPlans}
            streak={streak}
          />
        )}
        {screen === "schedule-list" && (
          <ScheduleListScreen history={history} dayPlans={dayPlans}/>
        )}
        {screen === "mom-dashboard" && (
          <MomDashboardScreen onBack={()=>goTo("home")}/>
        )}
        {screen === "notifications" && (
          <NotificationCenterScreen notifs={notifications} onRead={markNotifRead} onReadAll={markAllNotifsRead}/>
        )}
        {screen === "settings" && (
          <SettingsScreen
            onBack={()=>goTo("home")}
            onProfile={()=>goTo("admin")}
            familyId={familyId}
            exp={exp} streak={streak}
            deviceRole={deviceRole ?? "child"}
            parentPinHash={parentPinHash}
            onSelectChildRole={() => setDeviceRole("child")}
            onSelectParentRole={(hash) => { if (!parentPinHash) setParentPinHash(hash); setDeviceRole("parent"); }}
            onChangePin={setParentPinHash}
            onResetData={()=>{
              setExp(0);
              setStreak(0);
              setHistory({});
              setDayPlans({});
              setGoalScores(Object.fromEntries(EXAM_SUBJECTS.map(s => [s.id, s.examScore])));
              setNotifications([]);
              setAllowancePaid(0);
              setAllowancePending(null);
              goTo("home");
              setActiveNav(0);
            }}
          />
        )}
        {screen === "admin" && (
          <AdminDashboardScreen
            exp={exp} streak={streak} history={history} dayPlans={dayPlans}
            onCalendar={()=>goTo("calendar")}
            onSchedule={()=>goTo("schedule-list")}
            onViewStudyLog={()=>goTo("study-log")}
          />
        )}
        {screen === "goal-setting" && (
          <GoalSettingScreen goals={goalScores} onChange={handleGoalChange} onSave={()=>goTo("home")}/>
        )}
        {screen === "weekly-plan" && (
          <WeeklyPlanScreen dayPlans={dayPlans} history={history} onToggle={toggleDaySubject} onDone={()=>goTo("home")}/>
        )}
        {screen === "study-log" && (
          <StudyLogScreen studyLog={studyLog}/>
        )}

        {showNav && (
          <BottomNav
            active={activeNav}
            onSelect={handleNav}
          />
        )}

        {planToast && (
          <div className="fixed left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl text-white text-[13px] font-bold fade-in-up"
            style={{ bottom: showNav ? 92 : 24, backgroundColor:"#111827", boxShadow:"0 8px 28px rgba(0,0,0,0.28)" }}>
            {planToast}
          </div>
        )}
      </div>
    </div>
  );
}
