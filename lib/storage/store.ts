"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useSyncExternalStore } from "react";

/**
 * 学习记录的统一接口（本地持久化，localStorage）。
 * 所有页面通过这里读写进度、设置与练习记录，不直接操作 localStorage。
 */
export type LearnMode = "basic" | "deep" | "exam";
export type Theme = "dark" | "light";
export type ErrorCategory = "concept" | "calculation" | "not-minimal" | "syntax" | "timing" | "state";

export interface Attempt {
  tries: number;
  correct: boolean;
  /** 首次就做对 */
  firstTry: boolean;
  lastAt: number;
  categories: ErrorCategory[];
}

export interface Settings {
  theme: Theme;
  negation: "overline" | "prime";
  nextState: "n+1" | "star";
  gateStyle: "gb" | "ansi";
  mode: LearnMode;
}

interface State {
  settings: Settings;
  /** 已完成课时 → 完成时间 */
  done: Record<string, number>;
  /** 最近访问 */
  visits: Record<string, number>;
  lastLesson: string | null;
  attempts: Record<string, Attempt>;
  /** 错题本（题目 id），答对后由用户手动移出或连续答对两次自动移出 */
  wrong: Record<string, { addedAt: number; streak: number }>;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  markDone: (lesson: string, done?: boolean) => void;
  visit: (lesson: string) => void;
  record: (exercise: string, correct: boolean, category?: ErrorCategory) => void;
  removeWrong: (exercise: string) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: Settings = { theme: "dark", negation: "overline", nextState: "n+1", gateStyle: "gb", mode: "basic" };

export const useLab = create<State>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      done: {},
      visits: {},
      lastLesson: null,
      attempts: {},
      wrong: {},
      setSetting: (k, v) =>
        set((s) => {
          if (k === "theme" && typeof document !== "undefined") document.documentElement.dataset.theme = v as string;
          return { settings: { ...s.settings, [k]: v } };
        }),
      markDone: (lesson, done = true) =>
        set((s) => {
          const d = { ...s.done };
          if (done) d[lesson] = Date.now();
          else delete d[lesson];
          return { done: d };
        }),
      visit: (lesson) => set((s) => ({ lastLesson: lesson, visits: { ...s.visits, [lesson]: Date.now() } })),
      record: (id, correct, category) =>
        set((s) => {
          const prev = s.attempts[id];
          const a: Attempt = {
            tries: (prev?.tries ?? 0) + 1,
            correct: correct || (prev?.correct ?? false),
            firstTry: prev ? prev.firstTry : correct,
            lastAt: Date.now(),
            categories: category && !correct ? [...(prev?.categories ?? []), category].slice(-10) : (prev?.categories ?? []),
          };
          const wrong = { ...s.wrong };
          if (!correct) wrong[id] = { addedAt: wrong[id]?.addedAt ?? Date.now(), streak: 0 };
          else if (wrong[id]) {
            const streak = wrong[id].streak + 1;
            if (streak >= 2) delete wrong[id];
            else wrong[id] = { ...wrong[id], streak };
          }
          return { attempts: { ...s.attempts, [id]: a }, wrong };
        }),
      removeWrong: (id) =>
        set((s) => {
          const w = { ...s.wrong };
          delete w[id];
          return { wrong: w };
        }),
      reset: () => set({ done: {}, visits: {}, lastLesson: null, attempts: {}, wrong: {} }),
    }),
    { name: "logiclab-v1", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

/** 客户端挂载后才读取持久化数据，避免服务端渲染与本地记录不一致 */
const noopSubscribe = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** 某个知识点/课时的掌握度：做对题目占比（首次做对权重更高） */
export function masteryOf(ids: string[], attempts: Record<string, Attempt>): number | null {
  if (ids.length === 0) return null;
  let score = 0;
  let seen = 0;
  for (const id of ids) {
    const a = attempts[id];
    if (!a) continue;
    seen++;
    score += a.correct ? (a.firstTry ? 1 : 0.7) : 0.1;
  }
  return seen === 0 ? null : score / ids.length;
}
