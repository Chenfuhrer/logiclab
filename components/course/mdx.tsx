import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";
import { Mode, Callout, Example, Solution } from "./text";
import { ExprLab, TruthTable, KMapLab, Derivation, GateLab } from "./widgets/LogicWidgets";
import { TriStateBusLab, Decoder138Lab, Mux151Lab, LatchLab, HazardLab, RippleCounterLab, ShiftRegisterLab } from "./widgets/CircuitWidgets";
import { TriggerCompare, FFLab, SyncAnalyzer, SeqDetectorDemo, ExperimentCard } from "./widgets/SeqWidgets";
import { Quiz } from "@/components/practice/Quiz";
import { BaseConverter } from "@/components/widgets/BaseConverter";
import { ComplementLab } from "@/components/widgets/ComplementLab";
import { CodeLab } from "@/components/widgets/CodeLab";
import { LevelsLab } from "@/components/widgets/LevelsLab";
import { OCPullupLab } from "@/components/widgets/OCPullupLab";
import { TimingCalc } from "@/components/widgets/TimingCalc";

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return "";
}

/** 课程 MDX 可用的全部组件（与 docs/content-guide.md 第 5 节保持一致） */
export const mdxComponents: MDXComponents = {
  h2: ({ children }) => <h2 id={text(children).trim()}>{children}</h2>,
  Mode,
  Callout,
  Example,
  Solution,
  ExprLab,
  TruthTable,
  KMapLab,
  Derivation,
  GateLab,
  BaseConverter,
  ComplementLab,
  CodeLab,
  LevelsLab,
  OCPullupLab,
  TriStateBusLab,
  Decoder138Lab,
  Mux151Lab,
  HazardLab,
  LatchLab,
  TriggerCompare,
  FFLab,
  SyncAnalyzer,
  RippleCounterLab,
  ShiftRegisterLab,
  SeqDetectorDemo,
  TimingCalc,
  ExperimentCard,
  Quiz,
};
