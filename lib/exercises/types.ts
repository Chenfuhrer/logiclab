/**
 * 练习题数据格式。题目文本 prompt / hints / explanation 支持：
 *   - 行内公式 $...$、独立公式 $$...$$（KaTeX）
 *   - **加粗**、换行
 * 所有判分都是确定性计算（等价验证、QM、仿真），不硬编码"标准答案字符串"。
 */
export type Level = "basic" | "analysis" | "design";

interface Base {
  id: string;
  /** 所属课程 id（content/course.ts 中的 lesson id） */
  lesson: string;
  level: Level;
  title: string;
  prompt: string;
  /** 关联知识点 id（content/knowledge.ts） */
  knowledge: string[];
  /** 逐级提示：判错后先给提示，而不是直接给答案 */
  hints: string[];
  /** 完整解析（答对或放弃后显示） */
  explanation: string;
  /** 考试复习模式中标为高频题型 */
  exam?: boolean;
}

export interface ChoiceExercise extends Base {
  kind: "choice";
  options: string[];
  /** 单选为数字，多选为数组 */
  answer: number | number[];
}

export interface NumericExercise extends Base {
  kind: "numeric";
  answer: number;
  /** 允许的绝对误差，默认 0 */
  tolerance?: number;
  unit?: string;
}

/** 文本答案（例如进制转换结果）。normalize 决定比较前的规范化方式 */
export interface TextExercise extends Base {
  kind: "text";
  accept: string[];
  normalize?: "none" | "upper" | "nospace" | "binary";
  placeholder?: string;
}

/** 逻辑表达式：与目标函数逻辑等价即功能正确；minimal 要求最简 */
export interface ExpressionExercise extends Base {
  kind: "expression";
  vars: string[];
  /** 目标函数：表达式字符串，或最小项（+无关项） */
  target: { expr: string } | { minterms: number[]; dontCares?: number[] };
  minimal?: "sop" | "pos" | false;
}

/** 卡诺图圈组：检查逻辑正确性与最简程度 */
export interface KMapExercise extends Base {
  kind: "kmap";
  vars: string[];
  minterms: number[];
  dontCares?: number[];
}

/**
 * 状态转换表：给出同步电路（驱动方程），学生逐状态填写次态（以及输出）。
 * 判分由 lib/fsm/analyze 计算，逐状态检查。
 */
export interface StateTableExercise extends Base {
  kind: "statetable";
  circuit: {
    inputs: string[];
    /** 从高位到低位，例如 [{name:"Q1",type:"JK",inputs:{J:"Q0",K:"Q0"}}, ...] */
    ffs: { name: string; type: "D" | "JK" | "T" | "SR"; inputs: Record<string, string> }[];
    outputs?: { name: string; expr: string }[];
  };
}

/**
 * 触发器波形：给出输入波形（按时钟周期），学生逐个有效沿后填写 Q。
 * 判分用仿真引擎逐周期比较。
 */
export interface WaveformExercise extends Base {
  kind: "waveform";
  ff: "D" | "JK" | "T" | "SR";
  edge: "rising" | "falling";
  init: 0 | 1;
  /** 每个时钟周期内（有效沿到来前）各输入的取值 */
  inputs: Record<string, (0 | 1)[]>;
}

export type Exercise =
  | ChoiceExercise
  | NumericExercise
  | TextExercise
  | ExpressionExercise
  | KMapExercise
  | StateTableExercise
  | WaveformExercise;

export interface GradeResult {
  correct: boolean;
  /** 功能正确但未达到要求（例如不是最简） */
  partial?: boolean;
  /** 给学生看的反馈（提示优先，不直接给答案） */
  feedback: string;
  /** 错误分类（用于错题统计） */
  category?: "concept" | "calculation" | "not-minimal" | "syntax" | "timing" | "state";
  /** 逐项对错（状态表行、波形周期） */
  details?: boolean[];
}
