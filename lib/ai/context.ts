"use client";

import { create } from "zustand";
import { useEffect } from "react";
import type { Netlist } from "@/lib/sim/types";

/**
 * 页面向 AI 助教登记的上下文（课时、题目与作答、当前电路网表、页面状态）。
 * 只在学生提问时随请求发送到本站服务端，不做持久化。
 */
export interface AssistantContext {
  page?: string;
  title?: string;
  lesson?: string;
  exercise?: string;
  answer?: string;
  notes?: string;
  netlist?: Netlist;
}

interface Store {
  ctx: AssistantContext;
  open: boolean;
  draft: string;
  set: (patch: Partial<AssistantContext>) => void;
  clear: (keys: (keyof AssistantContext)[]) => void;
  ask: (question: string, patch?: Partial<AssistantContext>) => void;
  setOpen: (o: boolean) => void;
  setDraft: (d: string) => void;
}

export const useAssistant = create<Store>((set) => ({
  ctx: {},
  open: false,
  draft: "",
  set: (patch) => set((s) => ({ ctx: { ...s.ctx, ...patch } })),
  clear: (keys) =>
    set((s) => {
      const c = { ...s.ctx };
      for (const k of keys) delete c[k];
      return { ctx: c };
    }),
  ask: (question, patch) => set((s) => ({ open: true, draft: question, ctx: { ...s.ctx, ...(patch ?? {}) } })),
  setOpen: (open) => set({ open }),
  setDraft: (draft) => set({ draft }),
}));

/** 在组件挂载期间登记上下文，卸载时清除 */
export function useAssistantContext(patch: Partial<AssistantContext>, deps: unknown[]) {
  const setCtx = useAssistant((s) => s.set);
  const clear = useAssistant((s) => s.clear);
  useEffect(() => {
    setCtx(patch);
    return () => clear(Object.keys(patch) as (keyof AssistantContext)[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
