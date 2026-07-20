// ─── Project WOOHYUN — Global Store (Zustand) ─────────────────────────────────
//
// 전역 상태 하나로 통합. localStorage 자동 동기화.
// 컴포넌트에서: const profile = useAppStore(s => s.profile)
//               const { completeMission } = useAppStore()
//

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  type AppState,
  type Screen,
  type TabIndex,
  type SubjectId,
  type DayRecord,
  type MomMessage,
  type Notification,
  type AppSettings,
  type BadgeId,
  type UserProfile,
  type Subject,
} from "../types";
import {
  INITIAL_SUBJECTS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  LEVEL_XP,
  MOM_MESSAGES_POOL,
  todayString,
  calcDayNumber,
} from "../constants";

// ── Persisted slice keys (what goes to localStorage) ─────────────────────────
// Everything except: screen, activeTab, selectedSubjectId, isTimerRunning, timerSecondsLeft

// ── Actions interface ─────────────────────────────────────────────────────────
interface AppActions {
  // Navigation
  goTo: (screen: Screen) => void;
  goBack: () => void;
  setTab: (tab: TabIndex) => void;
  selectSubject: (id: SubjectId) => void;

  // Mission flow
  completeSubject: (id: SubjectId) => void;
  completeMission: (subjectId: SubjectId, expEarned: number) => void;
  submitPhoto: (subjectId: SubjectId, photoData: string) => void;
  approveMission: (missionId: string) => void;
  rejectMission: (missionId: string) => void;

  // Daily wrap-up
  saveDayRecord: (record: Partial<DayRecord>) => void;
  useRestDay: () => void;

  // XP & Level
  addXP: (amount: number) => void;
  checkAndUnlockBadges: () => void;

  // Streak
  updateStreak: () => void;

  // Mom messages
  sendMomMessage: (text: string) => void;
  markMomMessageRead: (id: string) => void;

  // Notifications
  addNotification: (n: Omit<Notification, "id" | "createdAt">) => void;
  markNotifRead: (id: string) => void;
  markAllNotifsRead: () => void;

  // Settings
  updateSettings: (patch: Partial<AppSettings>) => void;

  // Reset (dev)
  resetToday: () => void;
}

// ── Screen back map ───────────────────────────────────────────────────────────
const BACK_MAP: Partial<Record<Screen, Screen>> = {
  briefing:          "home",
  select:            "briefing",
  mission:           "select",
  focus:             "mission",
  photo:             "focus",
  reward:            "photo",
  reflection:        "reward",
  "daily-review":    "home",
  "tree-evolution":  "home",
  "growth-dashboard":"home",
  calendar:          "home",
  "mom-dashboard":   "home",
  notifications:     "home",
  settings:          "home",
  admin:             "home",
};

// ── Tab → Screen map ──────────────────────────────────────────────────────────
const TAB_SCREEN: Record<TabIndex, Screen> = {
  0: "home",
  1: "select",
  2: "growth-dashboard",
  3: "calendar",
  4: "settings",
};

// ── Helper: generate ID ───────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

// ── Helper: calculate level from total XP ────────────────────────────────────
const xpToLevel = (xp: number): { level: number; xpToNext: number } => {
  let level = 1;
  for (const [lvl, threshold] of Object.entries(LEVEL_XP)) {
    if (xp >= threshold) level = parseInt(lvl) + 1;
  }
  const nextThreshold = LEVEL_XP[level] ?? LEVEL_XP[10];
  return { level: Math.min(level, 10), xpToNext: nextThreshold };
};

// ── Helper: check badge eligibility ──────────────────────────────────────────
const eligibleBadges = (profile: UserProfile): BadgeId[] => {
  const earned: BadgeId[] = [];
  if (profile.totalMissionsDone >= 1)  earned.push("first_study");
  if (profile.streak >= 7)             earned.push("streak_7");
  if (profile.streak >= 14)            earned.push("streak_14");
  if (profile.streak >= 30)            earned.push("streak_30");
  if (profile.level >= 5)              earned.push("level_5");
  if (profile.level >= 10)             earned.push("level_10");
  return earned;
};

// ══════════════════════════════════════════════════════════════════════════════
// STORE
// ══════════════════════════════════════════════════════════════════════════════

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      // ── Initial navigation state (not persisted) ──────────────────────────
      screen:            "home" as Screen,
      activeTab:         0 as TabIndex,
      selectedSubjectId: "math" as SubjectId,
      isTimerRunning:    false,
      timerSecondsLeft:  0,

      // ── Initial persisted state ───────────────────────────────────────────
      profile:       DEFAULT_PROFILE,
      todaySubjects: INITIAL_SUBJECTS,
      history:       [],
      momMessages:   [
        {
          id: "init-1",
          text: MOM_MESSAGES_POOL[0],
          sentAt: new Date().toISOString(),
          read: false,
        },
      ],
      notifications: [
        {
          id: "notif-1",
          category: "message",
          icon: "❤️",
          title: "엄마의 응원",
          body: MOM_MESSAGES_POOL[0],
          time: "오늘 7:30 AM",
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      settings: DEFAULT_SETTINGS,

      // ── Navigation ────────────────────────────────────────────────────────
      goTo: (screen) => set({ screen }),

      goBack: () => {
        const prev = BACK_MAP[get().screen];
        if (prev) set({ screen: prev });
      },

      setTab: (tab) => {
        set({ activeTab: tab, screen: TAB_SCREEN[tab] });
      },

      selectSubject: (id) => set({ selectedSubjectId: id }),

      // ── Mission flow ──────────────────────────────────────────────────────

      completeSubject: (id) =>
        set((state) => ({
          todaySubjects: state.todaySubjects.map((s) =>
            s.id === id ? { ...s, done: true } : s
          ),
        })),

      completeMission: (subjectId, expEarned) => {
        const { addXP, completeSubject, addNotification, checkAndUnlockBadges } = get();
        completeSubject(subjectId);
        addXP(expEarned);
        checkAndUnlockBadges();

        const subject = get().todaySubjects.find((s) => s.id === subjectId);
        addNotification({
          category: "reward",
          icon: "⚡",
          title: `+${expEarned} EXP 획득!`,
          body: `${subject?.name ?? ""} 미션 완료!`,
          time: "방금 전",
          read: false,
        });
      },

      submitPhoto: (subjectId, _photoData) => {
        // In real app: upload to storage, get URL back
        // For now: add a notification that photo is pending mom approval
        set((state) => ({
          notifications: [
            {
              id: uid(),
              category: "approval",
              icon: "📷",
              title: "사진 인증 요청",
              body: `${state.todaySubjects.find((s) => s.id === subjectId)?.name ?? ""} 공부 인증 사진이 도착했어요.`,
              time: "방금 전",
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...state.notifications,
          ],
        }));
      },

      approveMission: (missionId) => {
        const { addXP, addNotification } = get();
        addXP(10); // bonus XP for mom approval
        addNotification({
          category: "approval",
          icon: "✅",
          title: "사진 승인 완료",
          body: "엄마가 공부 사진을 승인했어요! +10 보너스 XP",
          time: "방금 전",
          read: false,
        });
      },

      rejectMission: (_missionId) => {
        get().addNotification({
          category: "approval",
          icon: "📷",
          title: "다시 찍어주세요",
          body: "엄마가 사진을 확인했어요. 다시 한 번 찍어주세요.",
          time: "방금 전",
          read: false,
        });
      },

      // ── Daily wrap-up ─────────────────────────────────────────────────────

      saveDayRecord: (partial) => {
        const { profile } = get();
        const today = todayString();
        const dayNumber = calcDayNumber(profile.startDate);
        const completedSubjects = get()
          .todaySubjects.filter((s) => s.done)
          .map((s) => s.id);

        const record: DayRecord = {
          date: today,
          dayNumber,
          status: completedSubjects.length > 0 ? "done" : "partial",
          xpEarned: 0,
          completedSubjects,
          ...partial,
        };

        set((state) => ({
          history: [
            ...state.history.filter((r) => r.date !== today),
            record,
          ],
          // Reset today's subjects for next day (simplified)
          todaySubjects: INITIAL_SUBJECTS,
        }));
      },

      useRestDay: () => {
        const { saveDayRecord, addNotification } = get();
        saveDayRecord({ status: "rest", usedRestDay: true, xpEarned: 0 });
        addNotification({
          category: "streak",
          icon: "☀️",
          title: "휴식권 사용",
          body: "오늘은 쉬는 날! 연속 기록은 유지됩니다.",
          time: "방금 전",
          read: false,
        });
      },

      // ── XP & Level ────────────────────────────────────────────────────────

      addXP: (amount) =>
        set((state) => {
          const newXP = state.profile.xp + amount;
          const { level, xpToNext } = xpToLevel(newXP);
          const leveledUp = level > state.profile.level;
          return {
            profile: {
              ...state.profile,
              xp: newXP,
              level,
              xpToNextLevel: xpToNext,
              totalMissionsDone: state.profile.totalMissionsDone + 1,
            },
          };
        }),

      checkAndUnlockBadges: () =>
        set((state) => {
          const newBadges = eligibleBadges(state.profile).filter(
            (b) => !state.profile.badges.includes(b)
          );
          if (newBadges.length === 0) return {};
          return {
            profile: {
              ...state.profile,
              badges: [...state.profile.badges, ...newBadges],
            },
          };
        }),

      // ── Streak ────────────────────────────────────────────────────────────

      updateStreak: () =>
        set((state) => {
          const today = todayString();
          const last = state.profile.lastStudyDate;

          if (last === today) return {}; // already counted today

          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yStr = yesterday.toISOString().slice(0, 10);

          const continued = last === yStr;
          const newStreak = continued ? state.profile.streak + 1 : 1;

          return {
            profile: {
              ...state.profile,
              streak: newStreak,
              maxStreak: Math.max(newStreak, state.profile.maxStreak),
              lastStudyDate: today,
            },
          };
        }),

      // ── Mom messages ──────────────────────────────────────────────────────

      sendMomMessage: (text) =>
        set((state) => ({
          momMessages: [
            ...state.momMessages,
            { id: uid(), text, sentAt: new Date().toISOString(), read: false },
          ],
          notifications: [
            {
              id: uid(),
              category: "message" as const,
              icon: "❤️",
              title: "엄마의 응원",
              body: text,
              time: "방금 전",
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...state.notifications,
          ],
        })),

      markMomMessageRead: (id) =>
        set((state) => ({
          momMessages: state.momMessages.map((m) =>
            m.id === id ? { ...m, read: true } : m
          ),
        })),

      // ── Notifications ─────────────────────────────────────────────────────

      addNotification: (n) =>
        set((state) => ({
          notifications: [
            { ...n, id: uid(), createdAt: new Date().toISOString() },
            ...state.notifications,
          ],
        })),

      markNotifRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      markAllNotifsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      // ── Settings ──────────────────────────────────────────────────────────

      updateSettings: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch },
        })),

      // ── Dev reset ─────────────────────────────────────────────────────────

      resetToday: () =>
        set({ todaySubjects: INITIAL_SUBJECTS }),
    }),

    // ── Zustand persist config ────────────────────────────────────────────────
    {
      name: "wh-store-v1",          // localStorage key
      storage: createJSONStorage(() => localStorage),

      // Only persist these keys — skip transient session state
      partialize: (state) => ({
        profile:       state.profile,
        todaySubjects: state.todaySubjects,
        history:       state.history,
        momMessages:   state.momMessages,
        notifications: state.notifications,
        settings:      state.settings,
      }),

      // Migration: if old data shape exists, reset gracefully
      version: 1,
      migrate: (_oldState, _version) => {
        return {
          profile:       DEFAULT_PROFILE,
          todaySubjects: INITIAL_SUBJECTS,
          history:       [],
          momMessages:   [],
          notifications: [],
          settings:      DEFAULT_SETTINGS,
        };
      },
    }
  )
);

// ── Convenience selectors (use in components) ─────────────────────────────────

/** 오늘 완료한 과목 수 */
export const selectDoneCount = (s: AppState) =>
  s.todaySubjects.filter((sub) => sub.done).length;

/** 읽지 않은 알림 수 */
export const selectUnreadCount = (s: AppState) =>
  s.notifications.filter((n) => !n.read).length;

/** 현재 선택된 StudySubject */
export const selectCurrentSubject = (s: AppState) =>
  s.todaySubjects.find((sub) => sub.id === s.selectedSubjectId);

/** 42일 진행률 % */
export const selectDayProgress = (s: AppState) => {
  const day = calcDayNumber(s.profile.startDate);
  return { day: Math.min(day, 42), pct: Math.round((Math.min(day, 42) / 42) * 100) };
};

/** XP 진행률 % (현재 레벨 내) */
export const selectXPProgress = (s: AppState) => {
  const { xp, xpToNextLevel, level } = s.profile;
  const prevThreshold = level > 1 ? (Object.values(require("../constants").LEVEL_XP)[level - 2] as number) : 0;
  const range = xpToNextLevel - prevThreshold;
  const progress = xp - prevThreshold;
  return Math.round((progress / range) * 100);
};
