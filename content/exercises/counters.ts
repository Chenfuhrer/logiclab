import type { Exercise } from "@/lib/exercises/types";

export const exercises: Exercise[] = [
  {
    id: "counters-1",
    lesson: "counters",
    level: "basic",
    kind: "choice",
    title: "74LS161 的控制端",
    prompt: "关于 74LS161 的控制端，下列说法正确的是：",
    options: [
      "$\\overline{R_D}$ 是同步清零端，$\\overline{LD}$ 是异步置数端",
      "$\\overline{R_D}$ 是异步清零端，$\\overline{LD}$ 是同步置数端；74LS161 没有独立的同步清零引脚",
      "$\\overline{R_D}$、$\\overline{LD}$ 都是同步的，需要等 $CLK$ 上升沿",
      "74LS161 既有异步清零端，也有一个独立的同步清零端",
    ],
    answer: 1,
    knowledge: ["ls161"],
    hints: ["哪个控制端不需要等时钟就能起作用？", "74LS161 一共有几个与清零/置数相关的控制端？"],
    explanation:
      "74LS161：$\\overline{R_D}$ 为**异步**清零（为 0 时立即清零，与时钟无关），$\\overline{LD}$ 为**同步**置数（在 $CLK$ 上升沿装入 $D_3\\sim D_0$）。它**没有**独立的同步清零引脚，需要同步回零时用 $\\overline{LD}$ 并令 $D=0000$。同步清零是 74LS163 的特点。",
    exam: true,
  },
  {
    id: "counters-2",
    lesson: "counters",
    level: "basic",
    kind: "choice",
    title: "十进制：译码哪个状态",
    prompt: "分别用 74LS161 的异步清零法与 74LS163 的同步清零法构成 10 进制计数器（从 0 开始），应译码的状态依次是：",
    options: ["1001、1001", "1010、1010", "1010、1001", "1001、1010"],
    answer: 2,
    knowledge: ["modulo-n", "ls161"],
    hints: ["异步清零：状态一出现就被清除，它会不会持续一个时钟周期？", "同步清零：清零要等下一个上升沿，所以应在哪个状态时发出清零信号？"],
    explanation:
      "74LS161 的 $\\overline{R_D}$ 是异步的：必须等计数器**已经变成** $N=10=1010$ 时才清零，$1010$ 是瞬态。74LS163 的清零端是同步的：在状态 $N-1=9=1001$ 时发出清零信号，下一个上升沿才回到 0，没有瞬态。",
    exam: true,
  },
  {
    id: "counters-3",
    lesson: "counters",
    level: "analysis",
    kind: "text",
    title: "异步清零法的译码状态",
    prompt: "用 74LS161 的异步清零法构成 12 进制计数器（从 0 开始计数），与非门应译码哪个状态？写出 4 位二进制 $Q_3Q_2Q_1Q_0$。",
    accept: ["1100"],
    normalize: "nospace",
    placeholder: "例如 0101",
    knowledge: ["modulo-n"],
    hints: ["异步清零法译码的是 $N$ 还是 $N-1$？", "把这个十进制数转换成 4 位二进制。"],
    explanation:
      "异步清零法译码 $N=12=1100$，$\\overline{R_D}=\\overline{Q_3Q_2}$。稳定循环为 $0000\\sim1011$，$1100$ 只是瞬态。",
  },
  {
    id: "counters-4",
    lesson: "counters",
    level: "analysis",
    kind: "numeric",
    title: "进位输出置数法的预置数",
    prompt: "用 74LS161 的进位输出置数法（$\\overline{LD}=\\overline{C}$）构成 11 进制计数器，预置数 $D_3D_2D_1D_0$ 对应的十进制数是多少？",
    answer: 5,
    knowledge: ["modulo-n", "ls161"],
    hints: ["$C=1$ 出现在哪个状态？计数循环的最后一个状态是什么？", "从预置数数到 15，一共要有 $N$ 个状态。"],
    explanation:
      "计到 $1111$ 时 $C=1$，下一个上升沿装入预置数 $D$。循环为 $D\\sim15$，共 $16-D$ 个状态，令 $16-D=11$ 得 $D=5=0101$。循环为 $0101\\to0110\\to\\cdots\\to1111\\to0101$。",
    exam: true,
  },
  {
    id: "counters-5",
    lesson: "counters",
    level: "analysis",
    kind: "numeric",
    title: "由接法求模数",
    prompt:
      "74LS161 接法：$\\overline{R_D}=1$，$EP=ET=1$，$D_3D_2D_1D_0=0000$，$\\overline{LD}=\\overline{Q_3Q_2}$。从 0000 开始，这是几进制计数器？",
    answer: 13,
    knowledge: ["modulo-n"],
    hints: ["反馈接在同步端还是异步端？", "从 0 往上数，第一个使 $Q_3=Q_2=1$ 的状态是多少？这个状态会不会持续一个时钟周期？"],
    explanation:
      "$\\overline{LD}$ 是同步置数端。第一个使 $Q_3Q_2=11$ 的状态是 $1100=12$；计到 12 时 $\\overline{LD}=0$，12 保持一个完整周期，下一沿装入 0。循环为 $0\\sim12$，共 **13** 个状态。",
  },
  {
    id: "counters-6",
    lesson: "counters",
    level: "analysis",
    kind: "expression",
    title: "同步置数法的反馈表达式",
    prompt:
      "用 74LS161 的同步置数法构成 10 进制计数器（$D=0000$，从 0 开始）。写出 $\\overline{LD}$ 关于 Q3、Q2、Q1、Q0 的表达式（$\\overline{LD}$ 在计数循环 0～9 中必须正确；状态 10～15 不会出现，可任意取值）。",
    vars: ["Q3", "Q2", "Q1", "Q0"],
    target: { minterms: [0, 1, 2, 3, 4, 5, 6, 7, 8], dontCares: [10, 11, 12, 13, 14, 15] },
    minimal: false,
    knowledge: ["modulo-n", "ls161"],
    hints: ["同步置数法应在哪个状态使 $\\overline{LD}=0$？", "$\\overline{LD}$ 低电平有效，可以写成某个乘积项的非，例如 `(AB)'`。"],
    explanation:
      "同步置数法译码 $N-1=9=1001$：只有在状态 9 时 $\\overline{LD}=0$。部分译码取为 1 的位 $Q_3$、$Q_0$：\n\n$$\\overline{LD}=\\overline{Q_3Q_0}=\\overline{Q_3}+\\overline{Q_0}$$\n\n在 0～8 中没有状态同时满足 $Q_3=Q_0=1$，所以不会提前置数。输入 `(Q3Q0)'` 或 `Q3'+Q0'` 都正确。",
  },
  {
    id: "counters-7",
    lesson: "counters",
    level: "analysis",
    kind: "statetable",
    title: "同步十进制计数器",
    prompt:
      "四个 JK 触发器构成同步计数器：$J_0=K_0=1$，$J_1=\\overline{Q_3}Q_0$，$K_1=Q_0$，$J_2=K_2=Q_1Q_0$，$J_3=Q_2Q_1Q_0$，$K_3=Q_0$，输出 $C=Q_3Q_0$。按 $Q_3Q_2Q_1Q_0$ 填写全部 16 个现态的次态与输出，并判断能否自启动。",
    circuit: {
      inputs: [],
      ffs: [
        { name: "Q3", type: "JK", inputs: { J: "Q2Q1Q0", K: "Q0" } },
        { name: "Q2", type: "JK", inputs: { J: "Q1Q0", K: "Q1Q0" } },
        { name: "Q1", type: "JK", inputs: { J: "Q3'Q0", K: "Q0" } },
        { name: "Q0", type: "JK", inputs: { J: "1", K: "1" } },
      ],
      outputs: [{ name: "C", expr: "Q3Q0" }],
    },
    knowledge: ["sync-analysis", "self-start"],
    hints: ["$Q_0$ 每拍翻转；先算 $0000\\sim1001$ 这 10 行。", "再把 $1010\\sim1111$ 逐个代入，看它们最终去了哪里。"],
    explanation:
      "有效循环 $0000\\to0001\\to\\cdots\\to1001\\to0000$（8421BCD 十进制），$1001$ 时 $C=1$。关键行：$1001$ 时 $J_1=\\overline{Q_3}Q_0=0$、$K_3=1$，次态为 $0000$。\n\n无效状态：$1010\\to1011\\to0100$，$1100\\to1101\\to0100$，$1110\\to1111\\to0000$，都进入有效循环，**能自启动**。注意 $1011$、$1101$、$1111$ 时 $C=Q_3Q_0=1$，若上电落入这些状态会产生一次多余的进位。",
  },
  {
    id: "counters-8",
    lesson: "counters",
    level: "analysis",
    kind: "statetable",
    title: "二位可逆计数器",
    prompt:
      "两个 T 触发器构成同步电路，控制输入 $X$：$T_1=X\\oplus Q_0$，$T_0=1$，输出 $Y=\\overline{X}Q_1Q_0+X\\overline{Q_1}\\,\\overline{Q_0}$。填写状态转换表（次态/输出）。",
    circuit: {
      inputs: ["X"],
      ffs: [
        { name: "Q1", type: "T", inputs: { T: "X⊕Q0" } },
        { name: "Q0", type: "T", inputs: { T: "1" } },
      ],
      outputs: [{ name: "Y", expr: "X'Q1Q0+XQ1'Q0'" }],
    },
    knowledge: ["sync-analysis", "moore-mealy"],
    hints: ["分别令 $X=0$、$X=1$，$T_1$ 化简成什么？", "对比同步二进制加法与减法计数器的翻转规律。"],
    explanation:
      "$X=0$ 时 $T_1=Q_0$，为加法计数：$00\\to01\\to10\\to11\\to00$，$11$ 时 $Y=1$（进位）。$X=1$ 时 $T_1=\\overline{Q_0}$，为减法计数：$00\\to11\\to10\\to01\\to00$，$00$ 时 $Y=1$（借位）。\n\n$$\\begin{array}{c|c|c}Q_1Q_0 & X=0 & X=1\\\\\\hline 00&01/0&11/1\\\\01&10/0&00/0\\\\10&11/0&01/0\\\\11&00/1&10/0\\end{array}$$",
  },
  {
    id: "counters-9",
    lesson: "counters",
    level: "design",
    kind: "numeric",
    title: "两片级联 60 进制",
    prompt:
      "两片 74LS161 同步级联（低位片 $EP=ET=1$，高位片 $EP=ET=C_{\\text{低}}$，共用时钟），用**同步置数法**、预置数全 0 构成 60 进制计数器。整体反馈应译码的 8 位二进制状态对应的十进制数是多少？",
    answer: 59,
    knowledge: ["modulo-n", "ls161"],
    hints: ["两片级联后整体是 8 位二进制计数器，规律与单片相同。", "同步置数法译码 $N$ 还是 $N-1$？"],
    explanation:
      "同步置数法译码 $N-1=59=0011\\ 1011$（高位片 0011，低位片 1011）。记高位片输出为 $Q_7\\sim Q_4$，则\n\n$$\\overline{LD}=\\overline{Q_5Q_4Q_3Q_1Q_0}$$\n\n同时接到两片的 $\\overline{LD}$，$D$ 全部接 0。若改用异步清零法，则译码 $60=0011\\ 1100$，$\\overline{R_D}=\\overline{Q_5Q_4Q_3Q_2}$，60 为瞬态。",
    exam: true,
  },
];
