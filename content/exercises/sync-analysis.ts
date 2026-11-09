import type { Exercise } from "@/lib/exercises/types";

export const exercises: Exercise[] = [
  {
    id: "sync-analysis-1",
    lesson: "sync-analysis",
    level: "basic",
    kind: "choice",
    title: "五步法的顺序",
    prompt: "同步时序电路分析的正确步骤顺序是：",
    options: [
      "状态表 → 驱动方程 → 状态方程 → 状态图 → 功能与自启动",
      "驱动方程（及输出方程）→ 状态方程 → 状态转换表 → 状态图与时序图 → 功能与自启动",
      "状态方程 → 驱动方程 → 状态图 → 状态表 → 功能",
      "时序图 → 状态图 → 状态表 → 驱动方程 → 功能",
    ],
    answer: 1,
    knowledge: ["sync-analysis"],
    hints: ["分析是从电路图出发的：电路图上最直接能读出的是什么？", "状态方程是把哪一组方程代入特性方程得到的？"],
    explanation:
      "分析从电路图出发：先读出各触发器输入端的**驱动方程**和**输出方程**；把驱动方程代入特性方程得到**状态方程**；再把全部 $2^n$ 个现态代入，列出**状态转换表**；由状态表画**状态图与时序图**；最后概括**功能**并检查**自启动**。",
    exam: true,
  },
  {
    id: "sync-analysis-2",
    lesson: "sync-analysis",
    level: "basic",
    kind: "choice",
    title: "自启动的含义",
    prompt: "关于同步时序电路的自启动，下列说法正确的是：",
    options: [
      "只要电路存在无效状态，就不能自启动",
      "无效状态从初始状态不可达，所以不必分析",
      "从任何一个无效状态出发，经过若干个时钟后都能进入有效循环，电路就能自启动",
      "只要有效循环包含初始状态 000，电路就能自启动",
    ],
    answer: 2,
    knowledge: ["self-start"],
    hints: ["上电时触发器的状态是随机的，可能落在哪些状态？", "决定能否自启动的是无效状态是否存在，还是无效状态的去向？"],
    explanation:
      "上电或干扰可能使电路处于任意状态，所以必须分析每个无效状态的去向。只要每个无效状态最终都汇入有效循环，电路就能自启动；只有当无效状态构成**无效循环**（或停在自身）时才不能自启动。是否“可达”、是否存在无效状态都不是判据。",
    exam: true,
  },
  {
    id: "sync-analysis-3",
    lesson: "sync-analysis",
    level: "analysis",
    kind: "statetable",
    title: "D 触发器电路的状态表",
    prompt:
      "三个上升沿 D 触发器构成同步电路，驱动方程为 $D_2=Q_1$，$D_1=Q_0$，$D_0=\\overline{Q_2}$。按 $Q_2Q_1Q_0$ 的顺序填写全部 8 个现态的次态。",
    circuit: {
      inputs: [],
      ffs: [
        { name: "Q2", type: "D", inputs: { D: "Q1" } },
        { name: "Q1", type: "D", inputs: { D: "Q0" } },
        { name: "Q0", type: "D", inputs: { D: "Q2'" } },
      ],
    },
    knowledge: ["sync-analysis", "ff-equations"],
    hints: ["D 触发器的特性方程是 $Q^{n+1}=D$，所以次态就是驱动方程的值。", "注意 $Q_0^{n+1}$ 取的是 $Q_2$ 的**反**，并且用的是现态的 $Q_2$。"],
    explanation:
      "状态方程：$Q_2^{n+1}=Q_1$，$Q_1^{n+1}=Q_0$，$Q_0^{n+1}=\\overline{Q_2}$，即整体左移一位、最低位填入 $\\overline{Q_2}$。\n\n$$\\begin{array}{c|c}Q_2Q_1Q_0 & \\text{次态}\\\\\\hline 000&001\\\\001&011\\\\010&101\\\\011&111\\\\100&000\\\\101&010\\\\110&100\\\\111&110\\end{array}$$\n\n从 000 出发的有效循环为 $000\\to001\\to011\\to111\\to110\\to100\\to000$（6 个状态）。这是三位扭环形（约翰逊）计数器。",
  },
  {
    id: "sync-analysis-4",
    lesson: "sync-analysis",
    level: "analysis",
    kind: "choice",
    title: "扭环形计数器能否自启动",
    prompt:
      "对上一题的电路（$D_2=Q_1$，$D_1=Q_0$，$D_0=\\overline{Q_2}$，有效循环为 000→001→011→111→110→100→000），下列判断正确的是：",
    options: [
      "能自启动，因为无效状态 010、101 从 000 出发不可达",
      "能自启动，因为 010 的次态是 101",
      "不能自启动，因为无效状态 010 与 101 构成无效循环",
      "不能自启动，因为电路存在无效状态",
    ],
    answer: 2,
    knowledge: ["self-start", "ring-counter"],
    hints: ["把 010 代入状态方程算出次态，再把结果继续代入。", "得到的序列有没有回到有效循环？"],
    explanation:
      "$010\\to101$（左移得 10，最低位 $\\overline{Q_2}=1$），$101\\to010$（左移得 01，最低位 $\\overline{Q_2}=0$）。两个无效状态互相转换，构成**无效循环**，电路一旦落入就回不到有效循环，因此**不能自启动**。选项 A、D 的理由都是错误的判据：不可达不等于能自启动，有无效状态也不等于不能自启动。",
    exam: true,
  },
  {
    id: "sync-analysis-5",
    lesson: "sync-analysis",
    level: "analysis",
    kind: "waveform",
    title: "计数器中 FF1 的波形",
    prompt:
      "在本课主例（三位同步加法计数器，下降沿触发）中，FF1 的 $J_1=K_1=Q_0$。从 $Q_2Q_1Q_0=000$ 开始，前 8 个下降沿到来之前 $J_1$、$K_1$ 的取值如下表。请填出每个下降沿之后 $Q_1$ 的值（$Q_1$ 初值为 0）。",
    ff: "JK",
    edge: "falling",
    init: 0,
    inputs: { J: [0, 1, 0, 1, 0, 1, 0, 1], K: [0, 1, 0, 1, 0, 1, 0, 1] },
    knowledge: ["sync-analysis", "ff-equations"],
    hints: ["$J=K=0$ 时保持，$J=K=1$ 时翻转。", "每个沿只看沿到来之前的 $J$、$K$ 和当时的 $Q_1$。"],
    explanation:
      "逐沿计算：第 1 沿 $J=K=0$ 保持 0；第 2 沿翻转为 1；第 3 沿保持 1；第 4 沿翻转为 0；第 5 沿保持 0；第 6 沿翻转为 1；第 7 沿保持 1；第 8 沿翻转为 0。\n\n$Q_1$ 依次为 0, 1, 1, 0, 0, 1, 1, 0，周期是 4 个时钟周期，即 4 分频，与状态表中 $Q_1$ 列一致。",
  },
  {
    id: "sync-analysis-6",
    lesson: "sync-analysis",
    level: "analysis",
    kind: "expression",
    title: "求 JK 触发器的状态方程",
    prompt:
      "某同步电路中 FF2 的驱动方程为 $J_2=Q_1Q_0$，$K_2=Q_0$。写出 $Q_2^{n+1}$ 的**最简与或式**（变量 Q2、Q1、Q0，用 `'` 表示非）。",
    vars: ["Q2", "Q1", "Q0"],
    target: { expr: "Q1Q0Q2'+Q0'Q2" },
    minimal: "sop",
    knowledge: ["sync-analysis", "ff-equations"],
    hints: ["代入 $Q^{n+1}=J\\overline{Q^n}+\\overline{K}Q^n$。", "$\\overline{K_2}=\\overline{Q_0}$，代入后已经是与或式，检查能否进一步合并。"],
    explanation:
      "$$Q_2^{n+1}=J_2\\overline{Q_2}+\\overline{K_2}Q_2=\\overline{Q_2}Q_1Q_0+Q_2\\overline{Q_0}$$\n\n在卡诺图上，$\\overline{Q_2}Q_1Q_0$（$m_3$）与 $Q_2\\overline{Q_0}$（$m_4$、$m_6$）没有可以进一步合并的相邻 1，所以这已是最简与或式：`Q2Q0' + Q2'Q1Q0`。",
  },
  {
    id: "sync-analysis-7",
    lesson: "sync-analysis",
    level: "analysis",
    kind: "statetable",
    title: "带使能输入的计数器",
    prompt:
      "两个上升沿 T 触发器构成同步电路，外部输入 $X$，驱动方程 $T_1=XQ_0$，$T_0=X$，输出 $Z=XQ_1Q_0$。填写状态转换表（每个现态对 $X=0$、$X=1$ 各填一行次态和输出），并思考电路功能。",
    circuit: {
      inputs: ["X"],
      ffs: [
        { name: "Q1", type: "T", inputs: { T: "XQ0" } },
        { name: "Q0", type: "T", inputs: { T: "X" } },
      ],
      outputs: [{ name: "Z", expr: "XQ1Q0" }],
    },
    knowledge: ["sync-analysis", "moore-mealy"],
    hints: ["T 触发器：$T=1$ 翻转，$T=0$ 保持。先看 $X=0$ 时两个 $T$ 端的值。", "$Z$ 中含有 $X$，计算输出时要同时用现态和当前输入。"],
    explanation:
      "$X=0$ 时 $T_1=T_0=0$，两个触发器都保持；$X=1$ 时 $T_0=1$、$T_1=Q_0$，按二进制加 1。\n\n$$\\begin{array}{c|c|c}Q_1Q_0 & X=0 & X=1\\\\\\hline 00&00/0&01/0\\\\01&01/0&10/0\\\\10&10/0&11/0\\\\11&11/0&00/1\\end{array}$$\n\n功能：带计数使能 $X$ 的模 4 同步加法计数器，$Z$ 是进位输出。$Z$ 依赖 $X$，属于 Mealy 型。",
  },
  {
    id: "sync-analysis-8",
    lesson: "sync-analysis",
    level: "design",
    kind: "expression",
    title: "修改驱动方程使电路自启动",
    prompt:
      "对第 3 题的扭环形计数器（$D_2=Q_1$，$D_1=Q_0$），保持 $D_2$、$D_1$ 和有效循环不变，只修改 $D_0$，使无效状态 $010$ 的次态为 $100$、$101$ 的次态为 $010$。写出 $D_0$ 的**最简与或式**（变量 Q2、Q1、Q0）。",
    vars: ["Q2", "Q1", "Q0"],
    target: { minterms: [0, 1, 3] },
    minimal: "sop",
    knowledge: ["self-start", "ring-counter"],
    hints: [
      "$D_0$ 就是 $Q_0^{n+1}$。先列出 8 个现态各自要求的 $Q_0^{n+1}$。",
      "有效循环要求 000→001、001→011、011→111、111→110、110→100、100→000；无效状态的次态由题目指定。",
    ],
    explanation:
      "各现态要求的 $D_0=Q_0^{n+1}$：$000\\to1$，$001\\to1$，$011\\to1$，$111\\to0$，$110\\to0$，$100\\to0$，$010\\to0$（次态 100），$101\\to0$（次态 010）。\n\n所以 $D_0=\\sum m(0,1,3)$，卡诺图上 $m_0m_1$ 合并为 $\\overline{Q_2}\\,\\overline{Q_1}$，$m_1m_3$ 合并为 $\\overline{Q_2}Q_0$：\n\n$$D_0=\\overline{Q_2}\\,\\overline{Q_1}+\\overline{Q_2}Q_0$$\n\n验证：$010\\to100$（有效），$101\\to010\\to100$（有效），电路能自启动。",
    exam: true,
  },
];
