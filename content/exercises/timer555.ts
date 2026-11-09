import type { Exercise } from "@/lib/exercises/types";

// 全部数值题答案均在模型 E（教学近似模型，lib/analog-models/timer555.ts）下计算并核对。
export const exercises: Exercise[] = [
  {
    id: "timer555-1",
    lesson: "timer555",
    level: "basic",
    kind: "choice",
    title: "触发端与阈值端同时满足",
    prompt:
      "模型 E（教学近似模型）：555 的 $\\overline{R_D} = 1$，CO 不接，$V_{CC} = 9\\ \\mathrm{V}$。若此刻 6 脚电压 $v_{TH} = 7\\ \\mathrm{V}$，2 脚电压 $v_{\\overline{TR}} = 2\\ \\mathrm{V}$，则输出与放电管的状态为：",
    options: ["输出 0，放电管导通", "输出 1，放电管截止", "保持原状态", "输出不确定"],
    answer: 1,
    knowledge: ["555"],
    hints: ["先算出两个阈值 $V_U$、$V_L$，判断两个比较器是否都在动作。", "功能表中触发端与阈值端谁的优先级更高？"],
    explanation:
      "$V_U = \\tfrac{2}{3}\\times 9 = 6\\ \\mathrm{V}$，$V_L = 3\\ \\mathrm{V}$。$v_{TH} = 7 \\gt 6$，阈值比较器要求置 0；$v_{\\overline{TR}} = 2 \\lt 3$，触发比较器要求置 1。功能表规定（复位端除外）**触发端优先**：只要 $v_{\\overline{TR}} \\lt V_L$，不论 $v_{TH}$ 为多少，输出都为 1，放电管截止。",
    exam: true,
  },
  {
    id: "timer555-2",
    lesson: "timer555",
    level: "basic",
    kind: "choice",
    title: "不用的复位端怎么接",
    prompt: "555 的 4 脚 $\\overline{R_D}$ 在电路中不使用复位功能时，应当：",
    options: ["接地", "接 $V_{CC}$", "接 5 脚 CO", "接 7 脚放电端"],
    answer: 1,
    knowledge: ["555"],
    hints: ["$\\overline{R_D}$ 上的上划线表示它是哪种电平有效？"],
    explanation:
      "$\\overline{R_D}$ 低电平有效，且优先级最高：$\\overline{R_D} = 0$ 时输出强制为 0、放电管导通。不用时应接 $V_{CC}$ 使其保持无效；接地会让电路一直处于复位状态。接 CO 或 7 脚会使复位端电压随电路工作变化，可能引起误复位。",
  },
  {
    id: "timer555-3",
    lesson: "timer555",
    level: "basic",
    kind: "numeric",
    title: "施密特触发器的回差",
    prompt:
      "模型 E（教学近似模型）：555 的 2、6 脚并联作为输入，构成施密特触发器，$V_{CC} = 15\\ \\mathrm{V}$，CO 不接。求回差电压 $\\Delta V_T$（单位 V）。",
    knowledge: ["schmitt"],
    hints: ["分别求正向阈值 $V_{T+}$ 和负向阈值 $V_{T-}$。"],
    explanation:
      "$V_{T+} = \\tfrac{2}{3}V_{CC} = 10\\ \\mathrm{V}$，$V_{T-} = \\tfrac{1}{3}V_{CC} = 5\\ \\mathrm{V}$，$\\Delta V_T = V_{T+} - V_{T-} = 5\\ \\mathrm{V}$（即 $\\tfrac{1}{3}V_{CC}$）。",
    answer: 5,
    tolerance: 0.01,
    unit: "V",
  },
  {
    id: "timer555-4",
    lesson: "timer555",
    level: "basic",
    kind: "choice",
    title: "555 单稳态触发器的特点",
    prompt: "关于由 555 构成的基本单稳态触发器（CO 不接），下列说法正确的是（多选）：",
    options: [
      "稳态时输出为 0，放电管导通，定时电容电压约为 0",
      "暂稳态期间再加触发脉冲，输出脉宽会从第二次触发重新计时",
      "输出脉宽与触发脉冲宽度成正比",
      "输出脉宽 $t_W \\approx 1.1RC$，与 $V_{CC}$ 的大小无关",
    ],
    answer: [0, 3],
    knowledge: ["monostable"],
    hints: ["暂稳态期间锁存器处于什么状态？再来一次“置 1”会改变什么？", "用三要素法写 $t_W$，看 $V_{CC}$ 能否约掉。"],
    explanation:
      "稳态：输出 0，放电管导通把电容短接到地，$v_C \\approx 0$（A 对）。暂稳态期间锁存器已是 1，再触发只是再次置 1，不改变状态，脉宽仍从第一次触发算起——基本电路**不可重复触发**（B 错）。在触发脉冲窄于 $t_W$ 的正常使用条件下，脉宽只由 $RC$ 决定（C 错）。$t_W = RC\\ln\\frac{V_{CC}}{V_{CC} - \\frac{2}{3}V_{CC}} = RC\\ln 3$，$V_{CC}$ 被约掉（D 对）。",
    exam: true,
  },
  {
    id: "timer555-5",
    lesson: "timer555",
    level: "analysis",
    kind: "numeric",
    title: "单稳态脉宽计算",
    prompt:
      "模型 E（教学近似模型）：555 单稳态触发器，$R = 33\\ \\mathrm{k\\Omega}$，$C = 0.22\\ \\mu\\mathrm{F}$（假设参数），CO 不接，触发脉冲足够窄。求输出脉宽 $t_W$（单位 ms）。",
    knowledge: ["monostable"],
    hints: ["电容从多少充起？充向多少？到多少时输出翻回？", "kΩ × µF 的单位是什么？"],
    explanation:
      "$\\tau = RC = 33\\times 10^3 \\times 0.22\\times 10^{-6} = 7.26\\ \\mathrm{ms}$。$v_C$ 从 0 向 $V_{CC}$ 充电，到 $\\tfrac{2}{3}V_{CC}$ 时翻回：$t_W = \\tau\\ln\\frac{V_{CC} - 0}{V_{CC} - \\frac{2}{3}V_{CC}} = 7.26 \\times \\ln 3 \\approx 7.98\\ \\mathrm{ms}$（用 $1.1RC$ 估算得 7.99 ms，均在误差范围内）。",
    answer: 7.976,
    tolerance: 0.05,
    unit: "ms",
    exam: true,
  },
  {
    id: "timer555-6",
    lesson: "timer555",
    level: "analysis",
    kind: "numeric",
    title: "多谐振荡器的频率",
    prompt:
      "模型 E（教学近似模型）：555 多谐振荡器，$R_1 = 2\\ \\mathrm{k\\Omega}$，$R_2 = 10\\ \\mathrm{k\\Omega}$，$C = 47\\ \\mathrm{nF}$（假设参数），CO 不接。求稳定振荡时的频率 $f$（单位 Hz）。",
    knowledge: ["astable"],
    hints: ["充电经过哪些电阻？放电经过哪些电阻？", "$T = t_H + t_L$，两段都是从一个阈值到另一个阈值。"],
    explanation:
      "$t_H = 0.693(R_1 + R_2)C = 0.693 \\times 12\\times 10^3 \\times 47\\times 10^{-9} \\approx 390.9\\ \\mu\\mathrm{s}$，$t_L = 0.693R_2C \\approx 325.8\\ \\mu\\mathrm{s}$。$T = 0.693(R_1 + 2R_2)C \\approx 716.7\\ \\mu\\mathrm{s}$，$f = 1/T \\approx 1395\\ \\mathrm{Hz}$。",
    answer: 1395.3,
    tolerance: 3,
    unit: "Hz",
    exam: true,
  },
  {
    id: "timer555-7",
    lesson: "timer555",
    level: "analysis",
    kind: "numeric",
    title: "多谐振荡器的占空比",
    prompt:
      "模型 E（教学近似模型）：555 多谐振荡器，$R_1 = R_2 = 10\\ \\mathrm{k\\Omega}$，$C = 0.1\\ \\mu\\mathrm{F}$（假设参数），CO 不接。求输出占空比 $q = t_H/T$（用百分数表示，单位 %）。",
    knowledge: ["astable"],
    hints: ["$t_H$ 与 $t_L$ 中的 $0.693C$ 是公共因子，占空比与 $C$ 无关。"],
    explanation:
      "$q = \\dfrac{t_H}{t_H + t_L} = \\dfrac{R_1 + R_2}{R_1 + 2R_2} = \\dfrac{20}{30} \\approx 66.67\\%$。基本电路的占空比恒大于 50%。",
    answer: 66.67,
    tolerance: 0.1,
    unit: "%",
  },
  {
    id: "timer555-8",
    lesson: "timer555",
    level: "analysis",
    kind: "numeric",
    title: "接控制电压后的高电平时间",
    prompt:
      "模型 E（教学近似模型）：555 多谐振荡器，$V_{CC} = 12\\ \\mathrm{V}$，$R_1 = R_2 = 10\\ \\mathrm{k\\Omega}$，$C = 0.1\\ \\mu\\mathrm{F}$（假设参数），5 脚 CO 外加 $V_{CO} = 10\\ \\mathrm{V}$。求稳定振荡时的高电平时间 $t_H$（单位 ms）。",
    knowledge: ["astable", "555"],
    hints: ["接 CO 后两个阈值变成多少？", "充电段：从哪个阈值出发、向哪里充、在哪个阈值截断？用三要素法，不能直接套 $0.693$。"],
    explanation:
      "$V_U = V_{CO} = 10\\ \\mathrm{V}$，$V_L = V_{CO}/2 = 5\\ \\mathrm{V}$。充电 $\\tau = (R_1 + R_2)C = 2\\ \\mathrm{ms}$，$v_C$ 从 5 V 向 12 V 充，截断于 10 V：$t_H = 2\\ \\mathrm{ms} \\times \\ln\\frac{12 - 5}{12 - 10} = 2 \\times \\ln 3.5 \\approx 2.506\\ \\mathrm{ms}$。对比：放电段从 10 V 放向 0、截断于 5 V，$t_L = R_2C\\ln 2 \\approx 0.693\\ \\mathrm{ms}$，与 $V_{CO}$ 无关。",
    answer: 2.506,
    tolerance: 0.01,
    unit: "ms",
  },
  {
    id: "timer555-9",
    lesson: "timer555",
    level: "analysis",
    kind: "numeric",
    title: "上电后的第一个高电平",
    prompt:
      "模型 E（教学近似模型）：555 多谐振荡器，$R_1 = 1\\ \\mathrm{k\\Omega}$，$R_2 = 10\\ \\mathrm{k\\Omega}$，$C = 0.1\\ \\mu\\mathrm{F}$（假设参数），CO 不接。上电瞬间电容电压为 0。求上电后**第一个**高电平的宽度（单位 ms）。",
    knowledge: ["astable"],
    hints: ["第一次充电的起点不是 $\\tfrac{1}{3}V_{CC}$。"],
    explanation:
      "上电时 $v_C = 0 \\lt V_L$，输出为 1，电容经 $R_1 + R_2$ 从 0 充到 $\\tfrac{2}{3}V_{CC}$：$t_{H1} = (R_1 + R_2)C\\ln\\frac{V_{CC}}{V_{CC} - \\frac{2}{3}V_{CC}} = 1.1\\ \\mathrm{ms} \\times \\ln 3 \\approx 1.208\\ \\mathrm{ms}$。稳定后的 $t_H = 1.1\\ \\mathrm{ms} \\times \\ln 2 \\approx 0.762\\ \\mathrm{ms}$，第一个高电平明显更长。",
    answer: 1.208,
    tolerance: 0.01,
    unit: "ms",
  },
  {
    id: "timer555-10",
    lesson: "timer555",
    level: "analysis",
    kind: "choice",
    title: "施密特触发器对慢变输入的响应",
    prompt:
      "模型 E（教学近似模型）：555 接成施密特触发器（2、6 脚并联作输入），$V_{CC} = 9\\ \\mathrm{V}$，CO 不接。输入从 0 V 开始缓慢变化：$0 \\to 5\\ \\mathrm{V} \\to 2\\ \\mathrm{V} \\to 7\\ \\mathrm{V} \\to 4\\ \\mathrm{V}$（各段线性变化）。整个过程中输出的变化是：",
    options: [
      "始终为 1，不翻转",
      "只翻转 1 次（$1 \\to 0$），最后为 0",
      "翻转 2 次，最后为 1",
      "翻转 3 次，最后为 0",
    ],
    answer: 1,
    knowledge: ["schmitt"],
    hints: ["先写出 $V_{T+}$、$V_{T-}$。", "输入在两个阈值之间时输出怎样？"],
    explanation:
      "$V_{T+} = 6\\ \\mathrm{V}$，$V_{T-} = 3\\ \\mathrm{V}$。开始 $v_I = 0 \\lt 3$，输出 1。升到 5 V 未超过 6 V，保持 1；降到 2 V 低于 3 V，触发端要求置 1，本来就是 1，不变；再升到 7 V，越过 6 V 时输出变 0；最后降到 4 V，仍在 3～6 V 之间，保持 0。所以只翻转 1 次，最后为 0。这体现了回差：第一次升到 5 V 虽然已超过 $V_{T-}$，但没到 $V_{T+}$，不会翻转。",
  },
  {
    id: "timer555-11",
    lesson: "timer555",
    level: "analysis",
    kind: "choice",
    title: "触发脉冲过宽的后果",
    prompt:
      "模型 E（教学近似模型）：555 单稳态触发器按 $R$、$C$ 计算得 $t_W = 1.1\\ \\mathrm{ms}$。若送入 2 脚的触发负脉冲（低于 $\\tfrac{1}{3}V_{CC}$）持续了 3 ms，输出高电平的宽度约为：",
    options: ["1.1 ms", "3 ms", "4.1 ms", "2.2 ms（被重复触发一次）"],
    answer: 1,
    knowledge: ["monostable", "555"],
    hints: ["电容充到 $\\tfrac{2}{3}V_{CC}$ 时，2 脚还是低电平。功能表中此时哪一端优先？"],
    explanation:
      "1.1 ms 时 $v_C$ 已达到 $V_U$，阈值比较器要求置 0，但 2 脚仍低于 $V_L$，**触发端优先**，输出继续为 1。电容继续充向 $V_{CC}$（始终高于 $V_U$）。到 3 ms 触发撤销时，触发端不再动作，而阈值端仍高于 $V_U$，输出立即置 0。所以输出宽度约等于触发脉冲宽度 3 ms，不再由 $RC$ 决定。因此要求触发脉冲窄于 $t_W$，较宽的触发信号应先经微分电路变窄。",
    exam: true,
  },
  {
    id: "timer555-12",
    lesson: "timer555",
    level: "design",
    kind: "numeric",
    title: "设计 1 kHz、占空比 60% 的振荡器",
    prompt:
      "模型 E（教学近似模型）：用 555 基本多谐振荡器产生 $f = 1\\ \\mathrm{kHz}$、占空比 $q = 60\\%$ 的矩形波，取 $C = 0.1\\ \\mu\\mathrm{F}$，CO 不接。求所需的 $R_1$（单位 kΩ）。",
    knowledge: ["astable"],
    hints: ["先由 $f$ 与 $q$ 求出 $t_H$ 和 $t_L$。", "$t_L$ 只与 $R_2$ 有关，先求 $R_2$；再由 $t_H$ 求 $R_1 + R_2$。"],
    explanation:
      "$T = 1\\ \\mathrm{ms}$，$t_H = 0.6\\ \\mathrm{ms}$，$t_L = 0.4\\ \\mathrm{ms}$。$R_2 = \\dfrac{t_L}{C\\ln 2} = \\dfrac{0.4\\times 10^{-3}}{0.1\\times 10^{-6}\\times 0.6931} \\approx 5.771\\ \\mathrm{k\\Omega}$；$R_1 + R_2 = \\dfrac{t_H}{C\\ln 2} \\approx 8.656\\ \\mathrm{k\\Omega}$，所以 $R_1 \\approx 2.885\\ \\mathrm{k\\Omega}$。代回检验：$q = \\frac{8.656}{8.656 + 5.771} = 60\\%$，$f = 1\\ \\mathrm{kHz}$。实际取值时选最接近的标称电阻，或用电位器微调。",
    answer: 2.885,
    tolerance: 0.02,
    unit: "kΩ",
  },
  {
    id: "timer555-13",
    lesson: "timer555",
    level: "design",
    kind: "numeric",
    title: "设计 10 ms 的单稳态脉冲",
    prompt:
      "模型 E（教学近似模型）：用 555 单稳态触发器得到 $t_W = 10\\ \\mathrm{ms}$ 的输出脉冲，定时电容取 $C = 1\\ \\mu\\mathrm{F}$，CO 不接。求定时电阻 $R$（单位 kΩ）。",
    knowledge: ["monostable"],
    hints: ["由 $t_W = RC\\ln 3$ 反解 $R$。"],
    explanation:
      "$R = \\dfrac{t_W}{C\\ln 3} = \\dfrac{10\\times 10^{-3}}{1\\times 10^{-6}\\times 1.0986} \\approx 9.10\\ \\mathrm{k\\Omega}$（用 $1.1RC$ 估算得 9.09 kΩ）。同时要保证触发负脉冲宽度明显小于 10 ms。",
    answer: 9.102,
    tolerance: 0.02,
    unit: "kΩ",
  },
  {
    id: "timer555-14",
    lesson: "timer555",
    level: "design",
    kind: "choice",
    title: "占空比不大于 50% 的方案",
    prompt:
      "某设计要求 555 振荡器输出占空比为 40%。用基本多谐电路（$V_{CC}$—$R_1$—7 脚—$R_2$—2/6 脚—$C$—地，CO 不接）按公式反求时，会出现什么情况？应怎样处理？",
    options: [
      "可以实现，只要 $R_2 \\gt R_1$",
      "反求得 $R_1 \\lt 0$，基本电路做不到；可用二极管隔开充放电路径，使充电只经 $R_A$、放电只经 $R_B$，取 $R_A \\lt R_B$",
      "把 CO 接高电压即可把占空比降到 40%",
      "把 $R_1$ 短路即可得到 40%",
    ],
    answer: 1,
    knowledge: ["astable"],
    hints: ["写出 $q - \\tfrac{1}{2}$ 的表达式，看它的符号。", "要让 $t_H \\lt t_L$，充电回路的电阻必须比放电回路小。"],
    explanation:
      "$q = \\frac{R_1 + R_2}{R_1 + 2R_2}$，$q - \\tfrac{1}{2} = \\frac{R_1}{2(R_1 + 2R_2)} \\gt 0$，所以基本电路占空比恒大于 50%（A 错）；要 $q = 40\\%$ 需 $t_H \\lt t_L$，即 $R_1 + R_2 \\lt R_2$，$R_1 \\lt 0$，不可实现。$R_1$ 短路不仅只能逼近 50%，还会在放电管导通时把 $V_{CC}$ 直接短接到地（D 错）。接 CO 升高 $V_{CO}$ 会使 $t_H$ **变长**（$t_L$ 不变），占空比反而增大（C 错）。改进电路用两个二极管把充、放电路径分开：在忽略二极管压降的教学近似下 $q \\approx \\frac{R_A}{R_A + R_B}$，取 $R_A : R_B = 2 : 3$ 即得约 40%（B 对）。",
  },
];
