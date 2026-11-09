import type { Exercise } from "@/lib/exercises/types";

export const exercises: Exercise[] = [
  {
    id: "latches-1",
    lesson: "latches",
    level: "basic",
    kind: "choice",
    title: "或非门型 SR 锁存器的约束条件",
    prompt: "由两个或非门交叉耦合构成的 SR 锁存器（$S$、$R$ 高电平有效），正常使用时输入必须满足的约束条件是：",
    options: ["$S + R = 1$", "$SR = 0$", "$S \\oplus R = 1$", "$\\overline{S}\\,\\overline{R} = 0$"],
    answer: 1,
    knowledge: ["sr-latch"],
    hints: ["想一想哪一组输入会让 $Q$ 与 $\\overline{Q}$ 同为 0。", "约束条件就是\"禁止那一组输入出现\"的逻辑表达。"],
    explanation:
      "或非门型锁存器中 $S = R = 1$ 时两个或非门输出都是 0，$Q$ 与 $\\overline{Q}$ 不再互补，并且若随后两端同时撤销，次态不确定。禁止 $S = R = 1$ 写成逻辑式就是 $SR = 0$。选项 A、D 等价，它们要求 $S$、$R$ 至少有一个为 1，会把正常的\"保持\"（$S = R = 0$）也排除掉；选项 C 同样排除了保持。",
    exam: true,
  },
  {
    id: "latches-2",
    lesson: "latches",
    level: "basic",
    kind: "choice",
    title: "与非门型锁存器的非法输入",
    prompt: "与非门型 SR 锁存器的输入为 $\\overline{S_D}$、$\\overline{R_D}$（低电平有效）。当 $\\overline{S_D} = \\overline{R_D} = 0$ 时，两个输出为：",
    options: ["$Q = 0,\\ \\overline{Q} = 0$", "$Q = 1,\\ \\overline{Q} = 1$", "$Q = 1,\\ \\overline{Q} = 0$", "保持原状态"],
    answer: 1,
    knowledge: ["sr-latch"],
    hints: ["与非门只要有一个输入为 0，输出就是多少？"],
    explanation:
      "与非门\"有 0 出 1\"。$\\overline{S_D} = 0$ 使输出 $Q$ 的那个门输出 1，$\\overline{R_D} = 0$ 使输出 $\\overline{Q}$ 的那个门输出 1，所以 $Q = \\overline{Q} = 1$，两输出不互补，违反约束条件 $\\overline{S_D} + \\overline{R_D} = 1$。",
  },
  {
    id: "latches-3",
    lesson: "latches",
    level: "basic",
    kind: "choice",
    title: "D 锁存器的触发方式",
    prompt: "关于门控 D 锁存器，下列说法正确的是（多选）：",
    options: [
      "$EN = 1$ 期间 $Q$ 随 $D$ 变化（透明）",
      "只在 $EN$ 的上升沿采样一次 $D$",
      "$EN = 0$ 期间 $D$ 的变化不影响 $Q$",
      "因为 $S = D$、$R = \\overline{D}$，它自动满足 $SR = 0$",
    ],
    answer: [0, 2, 3],
    knowledge: ["d-latch"],
    hints: ["D 锁存器是电平触发还是边沿触发？", "门控 SR 锁存器的两个输入分别接什么？"],
    explanation:
      "D 锁存器是**电平触发**：$EN = 1$ 时 $Q^{n+1} = D$，$Q$ 跟随 $D$（透明）；$EN = 0$ 时保持。选项 B 描述的是边沿触发器，不是锁存器。由于门控 SR 锁存器的 $S = D$、$R = \\overline{D}$，$SR = D\\overline{D} = 0$ 恒成立。",
    exam: true,
  },
  {
    id: "latches-4",
    lesson: "latches",
    level: "analysis",
    kind: "text",
    title: "SR 锁存器的输出序列",
    prompt:
      "或非门型 SR 锁存器初态 $Q = 1$。依次施加 6 组输入 $(S, R)$：$01,\\ 00,\\ 10,\\ 00,\\ 01,\\ 10$（每组保持到稳定）。按顺序写出每组输入稳定后的 $Q$，连成 6 位字符串（例如 `110010`）。",
    accept: ["001101"],
    normalize: "nospace",
    placeholder: "6 位，例如 110010",
    knowledge: ["sr-latch"],
    hints: ["$S R = 00$ 时保持上一步的 $Q$。", "$SR = 01$ 置 0，$SR = 10$ 置 1。"],
    explanation:
      "逐步查表：$01$ 置 0 → $Q = 0$；$00$ 保持 → 0；$10$ 置 1 → 1；$00$ 保持 → 1；$01$ 置 0 → 0；$10$ 置 1 → 1。答案 `001101`。（已用仿真引擎的 sr_latch 模型核对。）",
  },
  {
    id: "latches-5",
    lesson: "latches",
    level: "analysis",
    kind: "text",
    title: "D 锁存器的输出序列",
    prompt:
      "D 锁存器初态 $Q = 0$。8 个相等时间段内 $EN$ 依次为 `0 1 1 0 0 1 1 0`，$D$ 依次为 `1 1 0 1 1 1 0 1`（同一段内不变）。写出每段内 $Q$ 的稳定值，连成 8 位字符串。",
    accept: ["01000100"],
    normalize: "nospace",
    placeholder: "8 位",
    knowledge: ["d-latch"],
    hints: ["$EN = 1$ 的段 $Q = D$。", "$EN = 0$ 的段，$Q$ 等于上一段结束时的值，与本段 $D$ 无关。"],
    explanation:
      "第 1 段 $EN = 0$，保持初值 0；第 2 段 $EN = 1$，$Q = D = 1$；第 3 段 $Q = D = 0$；第 4、5 段 $EN = 0$，保持 0（虽然 $D = 1$）；第 6 段 $Q = 1$；第 7 段 $Q = 0$；第 8 段保持 0。答案 `01000100`。（已用仿真引擎的 d_latch 模型核对。）",
    exam: true,
  },
  {
    id: "latches-6",
    lesson: "latches",
    level: "analysis",
    kind: "choice",
    title: "非法输入撤销的先后",
    prompt:
      "或非门型 SR 锁存器先处于 $S = R = 1$，然后输入撤销。下列哪些情况下撤销后的 $Q$ 是**确定**的？（多选）",
    options: [
      "先把 $R$ 变为 0，稍后再把 $S$ 变为 0",
      "先把 $S$ 变为 0，稍后再把 $R$ 变为 0",
      "$S$、$R$ 在同一时刻同时变为 0",
      "$S$ 保持 1，只把 $R$ 变为 0",
    ],
    answer: [0, 1, 3],
    knowledge: ["sr-latch"],
    hints: ["只撤销一端时，另一端仍然有效，相当于施加了一个正常的置 1 或置 0 输入。"],
    explanation:
      "A：$R$ 先回 0，此时 $SR = 10$，锁存器置 1；再撤销 $S$ 后保持 1，结果确定。B：同理置 0 后保持，结果确定。D：$SR = 10$，置 1，确定。C：两端同时撤销，两门同时从 $(0,0)$ 出发争夺状态，结果取决于延迟差异，不确定。",
  },
  {
    id: "latches-7",
    lesson: "latches",
    level: "design",
    kind: "expression",
    title: "用 SR 锁存器构成 D 锁存器",
    prompt:
      "用一个或非门型 SR 锁存器加门控逻辑构成 D 锁存器：要求 $EN = 1$ 时 $Q = D$，$EN = 0$ 时保持，且任何情况下都不违反约束条件。写出锁存器 **R 端**应接的表达式。为便于输入，用变量 `E` 表示 $EN$，可用变量为 `D`、`E`。",
    vars: ["D", "E"],
    target: { expr: "D'E" },
    minimal: "sop",
    knowledge: ["d-latch", "sr-latch"],
    hints: ["$EN = 0$ 时 $S$、$R$ 都应为 0（保持）。", "$EN = 1$ 且 $D = 0$ 时需要置 0。"],
    explanation:
      "$EN = 0$ 时要求 $S = R = 0$；$EN = 1$ 时要求 $D = 1$ 置 1、$D = 0$ 置 0。所以 $S = D\\cdot EN$，$R = \\overline{D}\\cdot EN$（输入写作 `D'E`）。此时 $SR = D\\overline{D}\\,EN = 0$，约束条件自动满足。",
    exam: true,
  },
  {
    id: "latches-8",
    lesson: "latches",
    level: "design",
    kind: "expression",
    title: "门控 SR 锁存器的完整次态方程",
    prompt:
      "门控 SR 锁存器：$EN = 1$ 时按或非门型 SR 锁存器动作，$EN = 0$ 时保持。把 $Q^{n+1}$ 写成 `E`（表示 $EN$）、`S`、`R`、`Q`（表示 $Q^n$）的**最简与或式**。$EN = 1$ 且 $S = R = 1$ 的组合不允许出现，可作无关项。",
    vars: ["E", "S", "R", "Q"],
    target: { minterms: [1, 3, 5, 7, 9, 12, 13], dontCares: [14, 15] },
    minimal: "sop",
    knowledge: ["sr-latch"],
    hints: ["先分 $E = 0$ 与 $E = 1$ 两种情况列出次态，再填入四变量卡诺图。", "$E = 0$ 时 $Q^{n+1} = Q$；$E = 1$ 时 $Q^{n+1} = S + \\overline{R}Q$。"],
    explanation:
      "变量顺序 $E S R Q$。$E = 0$：$Q^{n+1} = Q$，最小项 $m_1, m_3, m_5, m_7$；$E = 1$：$Q^{n+1} = S + \\overline{R}Q$，得 $m_9$（$S=0,R=0,Q=1$）、$m_{12}, m_{13}$（$S=1,R=0$），$m_{14}, m_{15}$ 为无关项。卡诺图圈组：$\\overline{E}Q$（$m_1,m_3,m_5,m_7$）、$ES$（$m_{12}\\sim m_{15}$，利用无关项）、$\\overline{R}Q$（$m_1,m_5,m_9,m_{13}$）。最简式 $Q^{n+1} = \\overline{E}Q + ES + \\overline{R}Q$。",
  },
];
