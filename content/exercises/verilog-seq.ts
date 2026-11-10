import type { Exercise } from "@/lib/exercises/types";

/**
 * 第 11 章 · Verilog 时序逻辑、状态机与 Testbench。
 * 涉及运行结果的答案均已用本平台的 Verilog 子集解释器（lib/hdl/interp.ts）实际运行核对；
 * Testbench 相关题目只考结构与概念（解释器不执行 initial / # / $ 系统任务）。
 */
export const exercises: Exercise[] = [
  {
    id: "verilog-seq-1",
    lesson: "verilog-seq",
    level: "basic",
    kind: "choice",
    title: "时序块用哪种赋值",
    prompt: "在 always @(posedge clk) 描述的时序逻辑中，应当使用哪种赋值？原因是什么？",
    options: [
      "阻塞赋值 =，因为它按顺序执行，更容易理解",
      "非阻塞赋值 <=，因为它先统一求出所有右值、再统一更新，与同步电路\"先采样、再更新\"的两阶段更新一致",
      "两种都可以，综合结果总是相同",
      "非阻塞赋值 <=，因为它能让组合逻辑没有延迟",
    ],
    answer: 1,
    knowledge: ["blocking-nonblocking"],
    hints: ["同步电路中，所有触发器在时钟沿读到的是新值还是旧值？"],
    explanation:
      "同步电路中所有触发器在同一个时钟沿用**旧的**现态计算次态，然后同时更新。非阻塞赋值 <= 正是这种语义：同一时刻所有 <= 的右边都用旧值求出，最后统一写入。用 = 时后面的语句会读到前面语句刚写入的新值，移位寄存器会\"穿透\"，不同块之间还会产生竞争。",
    exam: true,
  },
  {
    id: "verilog-seq-2",
    lesson: "verilog-seq",
    level: "basic",
    kind: "choice",
    title: "异步复位的敏感列表",
    prompt: "要描述一个上升沿触发、低电平有效异步复位（rst_n）的 D 触发器，always 的敏感列表应写成：",
    options: ["always @(posedge clk)", "always @(posedge clk or negedge rst_n)", "always @(posedge clk or rst_n)", "always @(*)"],
    answer: 1,
    knowledge: ["verilog-seq"],
    hints: ["异步复位要求不等时钟沿就生效，那么复位信号必须出现在哪里？", "低电平有效的复位，\"开始复位\"的那一刻是上升沿还是下降沿？"],
    explanation:
      "异步复位要在 rst_n 变低时立即执行块体，所以 rst_n 的下降沿必须写进敏感列表：always @(posedge clk or negedge rst_n)，块内第一句为 if (!rst_n) q <= 0;。只写 posedge clk 是同步复位；敏感列表中不能混用边沿与电平（本平台解释器对 @(posedge clk or rst_n) 直接报错）；@(*) 描述的是组合逻辑。",
    exam: true,
  },
  {
    id: "verilog-seq-3",
    lesson: "verilog-seq",
    level: "basic",
    kind: "choice",
    title: "Testbench 的特点",
    prompt: "关于 Testbench，下列说法正确的是：（多选）",
    options: [
      "Testbench 模块通常没有端口",
      "可以用 always #5 clk = ~clk; 产生时钟",
      "本平台的 Verilog 子集解释器可以直接运行含 initial 和 $display 的 Testbench",
      "Testbench 中的 initial、# 延迟等语句一般不可综合，只用于仿真",
    ],
    answer: [0, 1, 3],
    knowledge: ["testbench"],
    hints: ["Testbench 是\"测试台\"，它自己产生全部激励，还需要从外部接收信号吗？", "回忆本课关于本平台解释器支持范围的说明。"],
    explanation:
      "Testbench 自己产生时钟与激励、例化被测模块并检查输出，所以没有端口；always #5 clk = ~clk; 每 5 个时间单位翻转一次，产生周期为 10 的时钟。initial、#、$display 等用于仿真，一般不可综合。本平台的解释器**不执行** initial、# 延迟和 $ 系统任务，Testbench 需要在 iverilog 等仿真器中运行。",
  },
  {
    id: "verilog-seq-4",
    lesson: "verilog-seq",
    level: "basic",
    kind: "numeric",
    title: "Testbench 的时钟频率",
    prompt: "Testbench 中写有 `timescale 1ns/1ps 和 always #5 clk = ~clk;。产生的时钟频率是多少 MHz？",
    answer: 100,
    unit: "MHz",
    knowledge: ["testbench"],
    hints: ["每 5 ns 翻转一次，一个完整周期包含几次翻转？"],
    explanation: "每 5 ns 翻转一次，一个周期包含高、低两个半周期，周期 T = 10 ns，频率 f = 1/T = 100 MHz。",
  },
  {
    id: "verilog-seq-5",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "text",
    title: "阻塞赋值写的移位寄存器",
    prompt:
      "output reg q0 = 1'b1, output reg q1 = 1'b0, output reg q2 = 1'b1\nalways @(posedge clk) begin\nq0 = din;\nq1 = q0;\nq2 = q1;\nend\n初值 q0 q1 q2 = 1 0 1，din 保持为 0。一个上升沿之后 q0 q1 q2 是多少？（按 q0 q1 q2 的顺序写 3 位，例如 110）",
    accept: ["000"],
    normalize: "nospace",
    placeholder: "q0 q1 q2",
    knowledge: ["blocking-nonblocking", "shift-register"],
    hints: ["阻塞赋值立即生效：第二条语句执行时，q0 已经是什么值了？"],
    explanation:
      "阻塞赋值按顺序立即更新：q0 = din = 0；q1 = q0，读到的是刚更新的 0；q2 = q1，同样是 0。结果 000——din 一拍就\"穿透\"到了 q2。若三条都改成 <=，三条语句都用沿之前的旧值，结果为 q0 q1 q2 = 0 1 0（整体右移一位）。两种写法的结果都已用本平台解释器运行核对。",
    exam: true,
  },
  {
    id: "verilog-seq-6",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "text",
    title: "用拼接写的移位寄存器",
    prompt:
      "output reg [3:0] q = 4'b0000\nalways @(posedge clk) q <= {q[2:0], din};\n四个上升沿之前的 din 依次为 1、1、0、1。第 4 个上升沿之后 q 是多少？（写 4 位二进制，最左边是 q[3]）",
    accept: ["1101", "4'b1101"],
    normalize: "nospace",
    placeholder: "4 位二进制",
    knowledge: ["blocking-nonblocking", "shift-register"],
    hints: ["{q[2:0], din} 把 q 的低 3 位放在高位，din 放在最低位——这是向哪个方向移位？", "逐拍写出 q 的变化。"],
    explanation:
      "每拍 q 左移一位，din 从最低位移入：0000 → 0001 → 0011 → 0110 → 1101。第 4 拍之后 q = 4'b1101，最早移入的 1 已经到达 q[3]。本平台解释器运行结果相同。",
  },
  {
    id: "verilog-seq-7",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "numeric",
    title: "模 6 计数器",
    prompt:
      "output reg [2:0] q = 3'd0\nalways @(posedge clk)\nif (q == 3'd5) q <= 3'd0;\nelse q <= q + 3'd1;\n从 q = 0 开始，经过 14 个上升沿后，q 的十进制值是多少？",
    answer: 2,
    knowledge: ["verilog-seq", "modulo-n"],
    hints: ["这个计数器有几个状态？", "14 除以状态数的余数是多少？"],
    explanation: "q 在 0～5 之间循环，共 6 个状态，是模 6 计数器。14 = 2 × 6 + 2，经过 14 拍后 q = 2。本平台解释器逐拍运行：1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2。",
  },
  {
    id: "verilog-seq-8",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "text",
    title: "减法计数器的回绕",
    prompt: "output reg [2:0] q = 3'd2\nalways @(posedge clk) q <= q - 3'd1;\n经过 3 个上升沿后 q 是多少？（写 3 位二进制）",
    accept: ["111", "3'b111"],
    normalize: "nospace",
    placeholder: "3 位二进制",
    knowledge: ["verilog-seq"],
    hints: ["3 位无符号数 000 再减 1 会怎样？"],
    explanation: "逐拍：2 → 1 → 0 → 再减 1。3 位无符号运算按模 8 回绕，0 - 1 = 7，即 3'b111。逐拍结果为 001、000、111（本平台解释器运行结果相同）。",
  },
  {
    id: "verilog-seq-9",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "text",
    title: "带置数的计数器：逐拍输出",
    prompt:
      "always @(posedge clk or negedge rst_n)\nif (!rst_n) q <= 2'b00;\nelse if (ld) q <= d;\nelse q <= q + 2'b01;\n（q、d 都是 2 位）四个上升沿之前的输入依次为：① rst_n = 0；② rst_n = 1, ld = 1, d = 2'b11；③ ld = 0；④ 不变。依次写出每个上升沿之后的 q，用空格隔开（例如 00 01 10 11）。",
    accept: ["00 11 00 01"],
    normalize: "nospace",
    placeholder: "q1 q2 q3 q4",
    knowledge: ["verilog-seq"],
    hints: ["if … else if … 的顺序体现了优先级：复位、置数、计数谁优先？", "2 位数 11 加 1 等于多少？"],
    explanation:
      "① 复位，q = 00；② 置数，q = d = 11；③ 计数，11 + 1 在 2 位中回绕为 00；④ 计数，q = 01。答案 00 11 00 01（本平台解释器运行结果相同）。",
    exam: true,
  },
  {
    id: "verilog-seq-10",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "choice",
    title: "两个 always 块之间的竞争",
    prompt:
      "reg a = 1'b0, b = 1'b1（初值）。\nalways @(posedge clk) a = b;\nalways @(posedge clk) b = a;\n在标准 Verilog 仿真器中，第一个时钟上升沿之后：",
    options: [
      "一定得到 a = 1、b = 0，两者完成交换",
      "结果取决于两个 always 块的执行顺序，标准没有规定该顺序，这是竞争",
      "一定得到 a = 0、b = 0",
      "编译错误：同一个时钟不能驱动两个 always 块",
    ],
    answer: 1,
    knowledge: ["blocking-nonblocking"],
    hints: ["两个块在同一时刻被触发。如果第一个块先执行，第二个块读到的 a 是旧值还是新值？反过来呢？"],
    explanation:
      "两个块同时被触发，都用阻塞赋值，一个写 a、另一个读 a。先执行第一个块得 a = b = 1；先执行第二个块得 a = b = 0。标准没有规定执行顺序，所以结果不确定。本平台解释器按源代码顺序执行（得 a = b = 1）并给出竞争警告。改为 a <= b; 与 b <= a; 后，第一拍得 a = 1、b = 0，稳定交换。",
  },
  {
    id: "verilog-seq-11",
    lesson: "verilog-seq",
    level: "analysis",
    kind: "text",
    title: "读三段式状态机写输出序列",
    prompt:
      "Moore 型状态机：localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;\n状态寄存器：异步复位到 S0，上升沿 state <= next;\n次态逻辑：S0: next = x ? S1 : S0;  S1: next = x ? S2 : S0;  S2: next = x ? S2 : S0;  default: next = S0;\n输出：assign y = (state == S2);\n复位后，8 个上升沿之前的 x 依次为 1 1 0 1 1 1 0 1。写出每个上升沿之后的 y（8 位连写，例如 01010101）。",
    accept: ["01001100"],
    normalize: "nospace",
    placeholder: "8 位",
    knowledge: ["verilog-fsm", "sequence-detector"],
    hints: ["先逐拍写出状态，再由状态求 y。", "这个状态机在检测什么样的输入？"],
    explanation:
      "这是\"连续两个及以上的 1\"检测器。逐拍状态：x=1→S1，x=1→S2，x=0→S0，x=1→S1，x=1→S2，x=1→S2，x=0→S0，x=1→S1。y 在状态为 S2 时为 1：0 1 0 0 1 1 0 0，即 01001100。本平台解释器运行结果相同。",
    exam: true,
  },
  {
    id: "verilog-seq-12",
    lesson: "verilog-seq",
    level: "design",
    kind: "statetable",
    title: "把一行 Verilog 还原成状态表",
    prompt:
      "3 位寄存器 q（q[2] 为最高位）：\nalways @(posedge clk) q <= {q[1:0], q[2] ^ q[1]};\n记 $Q_2=$ q[2]，$Q_1=$ q[1]，$Q_0=$ q[0]。它等价于三个 D 触发器，驱动方程 $D_2=Q_1$、$D_1=Q_0$、$D_0=Q_2\\oplus Q_1$。按 $Q_2Q_1Q_0$ 的顺序填写全部 8 个现态的次态，并思考：从 000 出发会怎样？",
    circuit: {
      inputs: [],
      ffs: [
        { name: "Q2", type: "D", inputs: { D: "Q1" } },
        { name: "Q1", type: "D", inputs: { D: "Q0" } },
        { name: "Q0", type: "D", inputs: { D: "Q2⊕Q1" } },
      ],
    },
    knowledge: ["verilog-seq", "shift-register", "self-start"],
    hints: ["{q[1:0], x} 表示整体左移一位、最低位填入 x。", "最低位填入的是现态的 $Q_2\\oplus Q_1$。"],
    explanation:
      "次态 = 现态左移一位，最低位填入 $Q_2\\oplus Q_1$：\n\n$$\\begin{array}{c|c}Q_2Q_1Q_0 & \\text{次态}\\\\\\hline 000&000\\\\001&010\\\\010&101\\\\011&111\\\\100&001\\\\101&011\\\\110&100\\\\111&110\\end{array}$$\n\n非零状态构成一个 7 状态循环 $001\\to010\\to101\\to011\\to111\\to110\\to100\\to001$；000 的次态仍是 000，自成一个无效循环——电路**不能自启动**，上电落入 000 就出不来。实际使用这类线性反馈移位寄存器时要用复位把初值设为非零。该状态表已用本平台解释器逐状态运行核对。",
  },
  {
    id: "verilog-seq-13",
    lesson: "verilog-seq",
    level: "design",
    kind: "choice",
    title: "十进制计数器的比较条件",
    prompt:
      "用 always @(posedge clk) 写一个 0～9 循环的十进制计数器（同步回零）：\nif (q == ____) q <= 4'd0;\nelse q <= q + 4'd1;\n横线处应填：",
    options: ["4'd9", "4'd10", "4'd8", "4'd15"],
    answer: 0,
    knowledge: ["verilog-seq", "modulo-n"],
    hints: ["比较发生在哪一拍？回零是在比较成立的这一拍立即发生，还是在下一个时钟沿？"],
    explanation:
      "比较成立后，要到下一个时钟沿才把 q 置 0。为使计数序列为 0～9，应在 q = 9 时比较成立，下一个沿回到 0，所以填 4'd9（对应 74LS163 同步清零法译码 $N-1$）。若填 4'd10，q 会出现 10，变成 0～10 的模 11 计数器。本平台示例 counter10 正是这种写法，运行结果为 1, 2, …, 9, 0, 1, …。",
  },
];
