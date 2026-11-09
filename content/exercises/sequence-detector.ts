import type { Exercise } from "@/lib/exercises/types";

export const exercises: Exercise[] = [
  {
    id: "sequence-detector-1",
    lesson: "sequence-detector",
    level: "basic",
    kind: "choice",
    title: "Mealy 与 Moore 的状态数",
    prompt: "检测一个长度为 $L$ 的序列，用前缀法建立原始状态表，Mealy 型与 Moore 型的状态数分别是：",
    options: ["$L$、$L$", "$L$、$L+1$", "$L+1$、$L$", "$L-1$、$L$"],
    answer: 1,
    knowledge: ["sequence-detector", "moore-mealy"],
    hints: ["Mealy 型的输出可以写在转换上；Moore 型的输出只能由状态决定。", "Moore 型需要一个状态来表示什么？"],
    explanation:
      "Mealy 型：$S_0\\sim S_{L-1}$ 表示已匹配 $0\\sim L-1$ 位，在 $S_{L-1}$ 收到最后一位的那条转换上输出 1，共 $L$ 个状态。Moore 型的输出只取决于状态，需要再加一个 $S_L$ 表示“刚检测到”，共 $L+1$ 个状态。",
    exam: true,
  },
  {
    id: "sequence-detector-2",
    lesson: "sequence-detector",
    level: "basic",
    kind: "choice",
    title: "可重叠与不可重叠",
    prompt: "关于可重叠与不可重叠序列检测器，下列说法正确的是：",
    options: [
      "可重叠检测器的状态数一定比不可重叠的多",
      "两者只在“检测成功”那一步的次态上可能不同",
      "不可重叠检测器在任何失配时都回到 $S_0$",
      "对任何序列，可重叠与不可重叠的状态表都不同",
    ],
    answer: 1,
    knowledge: ["sequence-detector"],
    hints: ["比较本课 101 检测器的两张 Mealy 表，哪些格不同？", "110 检测器的两张表有区别吗？"],
    explanation:
      "两者状态数相同，失配处理也相同（都退到最长后缀前缀），只有检测成功那一格不同：可重叠保留 border，不可重叠回到起点。若序列没有非空 border（如 110），两张表完全相同。",
  },
  {
    id: "sequence-detector-3",
    lesson: "sequence-detector",
    level: "basic",
    kind: "numeric",
    title: "Moore 型 1101 检测器的状态数",
    prompt: "用前缀法设计 Moore 型、可重叠的 1101 序列检测器，原始状态表（已最简）有几个状态？",
    answer: 5,
    unit: "个",
    knowledge: ["sequence-detector", "moore-mealy"],
    hints: ["列出 1101 的所有前缀（包括空串）。", "Moore 型还需要哪个状态？"],
    explanation: "前缀：空、1、11、110 对应 $S_0\\sim S_3$；Moore 型再加“刚检测到 1101”的 $S_4$，共 5 个状态。经隐含表核对，没有等价状态。",
  },
  {
    id: "sequence-detector-4",
    lesson: "sequence-detector",
    level: "analysis",
    kind: "text",
    title: "逐拍求输出",
    prompt:
      "Mealy 型、**可重叠**的 101 检测器从 $S_0$ 开始，输入序列 $X=0110101011$（第 1 位最先到达）。写出 10 拍的输出 $Y$（10 个 0/1，不加空格）。",
    accept: ["0000101010"],
    normalize: "nospace",
    placeholder: "10 位 0/1",
    knowledge: ["sequence-detector"],
    hints: ["逐拍记录现态：$S_0$ 收 1 去 $S_1$，$S_1$ 收 0 去 $S_2$，$S_2$ 收 1 输出 1 并去 $S_1$。", "$S_1$ 收到 1 时留在 $S_1$，$S_2$ 收到 0 时回 $S_0$。"],
    explanation:
      "现态依次为 $S_0,S_0,S_1,S_1,S_2,S_1,S_2,S_1,S_2,S_1$。\n\n第 5 拍（$S_2$ 收 1）、第 7 拍、第 9 拍输出 1，第 10 拍 $S_1$ 收 1 不输出。$Y=0000101010$，检测到 3 次（第 3～5、5～7、7～9 位），其中相邻两次共用 1 位，体现了可重叠。",
  },
  {
    id: "sequence-detector-5",
    lesson: "sequence-detector",
    level: "analysis",
    kind: "choice",
    title: "检测成功后的次态",
    prompt: "Mealy 型 1001 检测器（$S_0$：无，$S_1$：1，$S_2$：10，$S_3$：100）。在 $S_3$ 收到 1（检测成功）后，可重叠与不可重叠时的次态分别是：",
    options: ["$S_0$、$S_0$", "$S_1$、$S_0$", "$S_1$、$S_1$", "$S_3$、$S_0$"],
    answer: 1,
    knowledge: ["sequence-detector"],
    hints: ["1001 的最长真后缀中，哪一个同时也是 1001 的前缀？", "不可重叠时，已用过的位还能参与下一次检测吗？"],
    explanation:
      "1001 的真后缀有 001、01、1，其中只有“1”是前缀，所以可重叠时回到 $S_1$（检测成功的最后一个 1 可作为下一次的开头）。不可重叠时回到 $S_0$。（经求解器核对。）",
    exam: true,
  },
  {
    id: "sequence-detector-6",
    lesson: "sequence-detector",
    level: "analysis",
    kind: "statetable",
    title: "101 检测器电路的状态表",
    prompt:
      "Mealy 型 101 检测器用 D 触发器实现：$D_1=\\overline{X}Q_0$，$D_0=X$，$Y=XQ_1$。按 $Q_1Q_0$ 填写状态转换表（每个现态对 $X=0$、$X=1$ 各填次态与输出），包括未用状态 $11$。",
    circuit: {
      inputs: ["X"],
      ffs: [
        { name: "Q1", type: "D", inputs: { D: "X'Q0" } },
        { name: "Q0", type: "D", inputs: { D: "X" } },
      ],
      outputs: [{ name: "Y", expr: "XQ1" }],
    },
    knowledge: ["sequence-detector", "self-start"],
    hints: ["D 触发器：次态就是 $D$ 的值。$D_0=X$ 意味着 $Q_0$ 总是记录上一拍的输入。", "未用状态 $11$ 也要代入方程计算，包括输出。"],
    explanation:
      "$$\\begin{array}{c|c|c}Q_1Q_0 & X=0 & X=1\\\\\\hline 00&00/0&01/0\\\\01&10/0&01/0\\\\10&00/0&01/1\\\\11&10/0&01/1\\end{array}$$\n\n合法状态对应 $S_0=00$、$S_1=01$、$S_2=10$。未用状态 $11$ 在任何输入下一拍内进入合法状态，能自启动；但 $11$ 且 $X=1$ 时 $Y=1$，是一次误报。",
  },
  {
    id: "sequence-detector-7",
    lesson: "sequence-detector",
    level: "analysis",
    kind: "expression",
    title: "110 检测器的 D1",
    prompt:
      "Mealy 型 110 检测器，编码 $S_0=00$（无匹配）、$S_1=01$（已收到 1）、$S_2=10$（已收到 11），$11$ 为未用状态（无关项）。用 D 触发器实现，写出 $D_1$ 的**最简与或式**（变量 X、Q1、Q0）。",
    vars: ["X", "Q1", "Q0"],
    target: { minterms: [5, 6], dontCares: [3, 7] },
    minimal: "sop",
    knowledge: ["sequence-detector", "sync-design"],
    hints: ["先写出原始状态表：哪些转换的次态是 $S_2$？", "最小项编号按 $X,Q_1,Q_0$ 的顺序，$X$ 为最高位。"],
    explanation:
      "次态为 $S_2=10$（$Q_1^{n+1}=1$）的转换：$S_1$ 收 1（$X\\,Q_1Q_0=101$，$m_5$）、$S_2$ 收 1（$110$，$m_6$）。无关项 $m_3$、$m_7$。\n\n$m_5$ 与 $m_7$ 合并为 $XQ_0$，$m_6$ 与 $m_7$ 合并为 $XQ_1$：\n\n$$D_1=XQ_1+XQ_0$$\n\n（同时 $D_0=X\\overline{Q_1}\\,\\overline{Q_0}$，$Y=\\overline{X}Q_1$，经求解器核对。）",
  },
  {
    id: "sequence-detector-8",
    lesson: "sequence-detector",
    level: "design",
    kind: "expression",
    title: "Moore 型 101 检测器的 D1",
    prompt:
      "Moore 型、可重叠的 101 检测器有 4 个状态：$S_0$（无）、$S_1$（1）、$S_2$（10）、$S_3$（刚检测到 101，$Y=1$），编码 $S_0=00$、$S_1=01$、$S_2=10$、$S_3=11$。用 D 触发器实现，写出 $D_1$ 的**最简与或式**（变量 X、Q1、Q0）。",
    vars: ["X", "Q1", "Q0"],
    target: { expr: "X'Q0+XQ1Q0'" },
    minimal: "sop",
    knowledge: ["sequence-detector", "sync-design"],
    hints: [
      "先写出 Moore 可重叠的状态表，特别是 $S_3$ 的两个次态。",
      "找出所有次态为 $S_2$ 或 $S_3$（即 $Q_1^{n+1}=1$）的转换，再画卡诺图。",
    ],
    explanation:
      "状态表：$S_0$：$0\\to S_0$，$1\\to S_1$；$S_1$：$0\\to S_2$，$1\\to S_1$；$S_2$：$0\\to S_0$，$1\\to S_3$；$S_3$：$0\\to S_2$，$1\\to S_1$。\n\n$Q_1^{n+1}=1$ 的转换：$S_1$ 收 0（$m_1$），$S_3$ 收 0（$m_3$），$S_2$ 收 1（$m_6$）。4 个编码全部使用，没有无关项。\n\n$m_1$、$m_3$ 合并为 $\\overline{X}Q_0$；$m_6$ 无相邻的 1，单独为 $XQ_1\\overline{Q_0}$：\n\n$$D_1=\\overline{X}Q_0+XQ_1\\overline{Q_0}$$\n\n另有 $D_0=X$，$Y=Q_1Q_0$（经求解器核对）。",
    exam: true,
  },
];
