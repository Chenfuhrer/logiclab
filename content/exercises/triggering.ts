import type { Exercise } from "@/lib/exercises/types";

export const exercises: Exercise[] = [
  {
    id: "triggering-1",
    lesson: "triggering",
    level: "basic",
    kind: "choice",
    title: "哪种器件会空翻",
    prompt: "把器件的反相输出接回自身的数据输入（使其每次动作都取反），时钟高电平持续较长时间。下列哪种器件可能在**一个**时钟高电平期间翻转多次？",
    options: ["电平触发的锁存器", "上升沿触发的 D 触发器", "下降沿触发的 JK 触发器", "主从 JK 触发器"],
    answer: 0,
    knowledge: ["trigger-modes"],
    hints: ["哪种器件在高电平期间是\"透明\"的？"],
    explanation:
      "电平触发的锁存器在 $CLK = 1$ 期间透明，输出变化会立刻经反馈回到输入，引起再次变化，形成空翻。边沿触发器只在有效沿采样一次；主从 JK 在高电平期间从锁存器不变，主锁存器最多翻转一次，输出只在下降沿变化一次。",
    exam: true,
  },
  {
    id: "triggering-2",
    lesson: "triggering",
    level: "basic",
    kind: "choice",
    title: "主从 JK 的输出变化时刻",
    prompt: "由正脉冲控制的主从 JK 触发器（$CLK = 1$ 时主锁存器工作），其输出 $Q$ 在什么时刻可能发生变化？",
    options: ["$CLK$ 的上升沿", "$CLK = 1$ 的整个期间", "$CLK$ 的下降沿", "$J$ 或 $K$ 变化的任意时刻"],
    answer: 2,
    knowledge: ["trigger-modes"],
    hints: ["输出由主锁存器还是从锁存器给出？从锁存器何时被使能？"],
    explanation:
      "$CLK = 1$ 时从锁存器被封锁，输出保持；$CLK$ 由 1 变 0 时从锁存器复制主锁存器的状态，所以输出只在下降沿变化。注意：输出的**值**由整个高电平期间的 $J$、$K$ 决定（一次翻转），而不是只由下降沿时刻的 $J$、$K$ 决定。",
  },
  {
    id: "triggering-3",
    lesson: "triggering",
    level: "basic",
    kind: "choice",
    title: "锁存器与触发器",
    prompt: "下列说法正确的是（多选）：",
    options: [
      "D 锁存器与边沿 D 触发器的特性方程都可写成 $Q^{n+1} = D$，但\"方程何时成立\"不同",
      "主从 JK 触发器在任何输入下都与下降沿 JK 触发器行为相同",
      "边沿触发器的次态只取决于有效沿前一瞬间的输入与现态",
      "两个 D 锁存器串联（时钟反相控制）构成的 D 触发器，外部行为等同于边沿触发",
    ],
    answer: [0, 2, 3],
    knowledge: ["trigger-modes", "d-latch"],
    hints: ["主从 JK 的一次翻转发生在什么条件下？", "主从结构 D 触发器的主锁存器有没有来自从锁存器的门控反馈？"],
    explanation:
      "A 正确：锁存器在 $EN = 1$ 的整个区间满足 $Q = D$，边沿 D 触发器只在有效沿处令 $Q^{n+1} = D$。B 错误：$CLK = 1$ 期间 $J$、$K$ 变化时，主从 JK 存在一次翻转，结果可能与边沿 JK 不同。C 正确。D 正确：主锁存器在 $CLK = 1$ 透明、下降沿锁住，从锁存器随后输出，等效为下降沿采样 $D$；它没有 JK 那样的门控反馈，因此不存在一次翻转。",
    exam: true,
  },
  {
    id: "triggering-4",
    lesson: "triggering",
    level: "analysis",
    kind: "numeric",
    title: "一次翻转（初态 0）",
    prompt:
      "主从 JK 触发器初态 $Q = 0$。$CLK = 1$ 期间：先是 $J = 1, K = 0$，随后变为 $J = 0, K = 1$ 并保持到下降沿。求下降沿之后的 $Q$。",
    answer: 1,
    knowledge: ["trigger-modes"],
    hints: ["$Q = 0$ 时主锁存器的复位信号 $R_m = KQ$ 能否为 1？"],
    explanation:
      "$Q = 0$ 时 $S_m = J\\overline{Q} = J$，$R_m = KQ = 0$。$J = 1$ 时主锁存器被置 1；之后虽然 $K = 1$，但 $R_m = 0$，主锁存器无法复位。下降沿从锁存器复制 1，$Q = 1$。若误当作下降沿 JK，按 $JK = 01$ 会得到 0。（已用 jkff_ms 模型仿真核对。）",
    exam: true,
  },
  {
    id: "triggering-5",
    lesson: "triggering",
    level: "analysis",
    kind: "numeric",
    title: "一次翻转（初态 1）",
    prompt:
      "主从 JK 触发器初态 $Q = 1$。$CLK = 1$ 期间 $J = 0$，$K$ 出现一个短暂的正脉冲，下降沿时 $J = K = 0$。求下降沿之后的 $Q$。",
    answer: 0,
    knowledge: ["trigger-modes"],
    hints: ["$Q = 1$ 时主锁存器的复位信号 $R_m = KQ$ 在 $K$ 脉冲期间等于多少？", "主锁存器被复位后，还有没有信号能把它重新置 1？"],
    explanation:
      "$Q = 1$ 时 $R_m = K$，$K$ 的正脉冲使主锁存器复位为 0；此后 $S_m = J\\overline{Q} = 0$，主锁存器保持 0 到下降沿，$Q = 0$。边沿 JK 只看下降沿时的 $JK = 00$，会保持 1——两者结果不同。（已用仿真核对。）",
  },
  {
    id: "triggering-6",
    lesson: "triggering",
    level: "analysis",
    kind: "numeric",
    title: "锁存器在一个脉冲内的变化次数",
    prompt:
      "D 锁存器（$EN$ 接 $CLK$）初态 $Q = 0$。$CLK$ 上升沿时 $D = 0$；高电平期间 $D$ 依次变为 1、0、1，然后 $CLK$ 回到 0。在这个时钟高电平期间，$Q$ 一共变化了几次？",
    answer: 3,
    unit: "次",
    knowledge: ["d-latch", "trigger-modes"],
    hints: ["$EN = 1$ 期间 $Q$ 与 $D$ 是什么关系？"],
    explanation:
      "$EN = 1$ 期间锁存器透明，$Q$ 跟随 $D$：$0 \\to 1 \\to 0 \\to 1$，共变化 3 次。同样的输入加到上升沿 D 触发器上，上升沿时 $D = 0$，$Q$ 保持 0，变化 0 次。（已用 d_latch 模型核对。）",
  },
  {
    id: "triggering-7",
    lesson: "triggering",
    level: "design",
    kind: "choice",
    title: "为移位寄存器选存储单元",
    prompt:
      "要用 4 个相同的存储单元串联构成移位寄存器（前一级输出接后一级数据输入，时钟全部相连），要求每个时钟只移动一位，并且时钟高电平期间数据输入的变化不能影响结果。应选：",
    options: ["高电平透明的 D 锁存器", "边沿触发的 D 触发器", "主从 JK 触发器（$J = D$，$K = \\overline{D}$）", "或非门型 SR 锁存器"],
    answer: 1,
    knowledge: ["trigger-modes"],
    hints: ["哪种器件在时钟高电平期间对输入变化完全不敏感？", "串联的锁存器在时钟高电平期间会发生什么？"],
    explanation:
      "D 锁存器在高电平期间同时透明，数据会一次穿过多级；SR 锁存器没有时钟控制；主从 JK 在高电平期间对 $J$、$K$ 的变化敏感（一次翻转），不满足第二个要求。边沿 D 触发器只在有效沿采样，所有级在同一沿采样到的是沿前的旧值，每个时钟恰好移一位。",
    exam: true,
  },
];
