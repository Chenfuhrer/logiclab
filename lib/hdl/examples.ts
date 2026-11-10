/**
 * Verilog 示例库（课程与实验台共用）。每个示例都能被本平台的 Verilog 子集解释器运行；
 * tests/unit/hdl-examples.test.ts 会逐个运行并检查预期结果。
 */
export interface HdlExample {
  id: string;
  title: string;
  group: "组合逻辑" | "时序逻辑" | "状态机" | "常见错误";
  desc: string;
  code: string;
  /** 时钟端口（无则为组合逻辑示例） */
  clock?: string;
  /** 0 时刻的输入初值 */
  init: Record<string, number>;
  /** 可选的逐拍激励：每拍时钟沿之前施加的输入 */
  script?: Record<string, number>[];
  /** 波形中显示的信号（默认显示全部顶层端口） */
  watch?: string[];
}

export const HDL_EXAMPLES: HdlExample[] = [
  {
    id: "gates",
    title: "基本门：assign 连续赋值",
    group: "组合逻辑",
    desc: "assign 描述的是一直存在的连线关系：任何输入变化，输出立即随之变化。",
    init: { a: 0, b: 0 },
    code: `module gates (
  input  wire a,
  input  wire b,
  output wire y_and,
  output wire y_or,
  output wire y_nand,
  output wire y_xor
);
  assign y_and  = a & b;
  assign y_or   = a | b;
  assign y_nand = ~(a & b);
  assign y_xor  = a ^ b;
endmodule
`,
  },
  {
    id: "adder4",
    title: "4 位加法器：{c, s} = a + b",
    group: "组合逻辑",
    desc: "拼接 {c, s} 让结果有 5 位，进位不会被截掉。改成 assign s = a + b; 再看看 9 + 8 的结果。",
    init: { a: 9, b: 8 },
    code: `module adder4 (
  input  wire [3:0] a,
  input  wire [3:0] b,
  output wire [3:0] s,
  output wire       c
);
  assign {c, s} = a + b;
endmodule
`,
  },
  {
    id: "mux4",
    title: "4 选 1 数据选择器：always @(*) + case",
    group: "组合逻辑",
    desc: "组合 always 块用阻塞赋值 =；每个分支都给 y 赋值，所以不会产生锁存器。",
    init: { sel: 0, d: 0b0110 },
    code: `module mux4 (
  input  wire [1:0] sel,
  input  wire [3:0] d,
  output reg        y
);
  always @(*) begin
    case (sel)
      2'b00: y = d[0];
      2'b01: y = d[1];
      2'b10: y = d[2];
      2'b11: y = d[3];
    endcase
  end
endmodule
`,
  },
  {
    id: "decoder138",
    title: "3-8 译码器（74LS138 的行为描述）",
    group: "组合逻辑",
    desc: "使能条件满足时，被选中的输出为 0（低电平有效）。对照第 4 章 74LS138 的功能表。",
    init: { a: 5, s1: 1, s2_n: 0, s3_n: 0 },
    code: `module decoder138 (
  input  wire [2:0] a,
  input  wire       s1,
  input  wire       s2_n,
  input  wire       s3_n,
  output wire [7:0] y_n
);
  wire en = s1 & ~s2_n & ~s3_n;
  assign y_n = en ? ~(8'b00000001 << a) : 8'b11111111;
endmodule
`,
  },
  {
    id: "dff",
    title: "D 触发器：异步复位",
    group: "时序逻辑",
    desc: "always @(posedge clk or negedge rst_n)：上升沿采样 d；rst_n 一变低就立即清零，不等时钟。",
    clock: "clk",
    init: { clk: 0, rst_n: 1, d: 0 },
    script: [{ d: 1 }, { d: 0 }, { d: 1 }, { d: 1, rst_n: 0 }, { rst_n: 1 }, { d: 0 }],
    code: `module dff (
  input  wire clk,
  input  wire rst_n,
  input  wire d,
  output reg  q
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0;
    else        q <= d;
endmodule
`,
  },
  {
    id: "counter3",
    title: "3 位二进制加法计数器（行为描述）",
    group: "时序逻辑",
    desc: "与实验 A 的 JK 计数器功能相同：一句 q <= q + 1 就描述了全部驱动方程。注意这里是上升沿。",
    clock: "clk",
    init: { clk: 0, rst_n: 1 },
    script: [{ rst_n: 0 }, { rst_n: 1 }, {}, {}, {}, {}, {}, {}, {}, {}],
    code: `module counter3 (
  input  wire       clk,
  input  wire       rst_n,
  output reg  [2:0] q,
  output wire       c
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 3'd0;
    else        q <= q + 3'd1;

  assign c = &q;   // 计到 111 时进位
endmodule
`,
  },
  {
    id: "counter10",
    title: "十进制计数器（同步清零）",
    group: "时序逻辑",
    desc: "计到 9 后下一拍回到 0。对照 74LS163 的同步清零法：译码的是 9，而不是 10。",
    clock: "clk",
    init: { clk: 0, rst_n: 1, en: 1 },
    script: Array.from({ length: 12 }, () => ({})),
    code: `module counter10 (
  input  wire       clk,
  input  wire       rst_n,
  input  wire       en,
  output reg  [3:0] q = 4'd0,
  output wire       co
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n)          q <= 4'd0;
    else if (en)
      if (q == 4'd9)     q <= 4'd0;
      else               q <= q + 4'd1;

  assign co = en & (q == 4'd9);
endmodule
`,
  },
  {
    id: "shift-nb",
    title: "移位寄存器：非阻塞赋值 <=",
    group: "时序逻辑",
    desc: "三条 <= 在时钟沿“同时”采样右边的旧值，再一起更新——这就是同步电路的两阶段更新。",
    clock: "clk",
    init: { clk: 0, din: 0 },
    script: [{ din: 1 }, { din: 0 }, { din: 0 }, { din: 1 }, { din: 1 }, { din: 0 }, {}],
    code: `module shift_nb (
  input  wire clk,
  input  wire din,
  output reg  q0 = 1'b0,
  output reg  q1 = 1'b0,
  output reg  q2 = 1'b0
);
  always @(posedge clk) begin
    q0 <= din;
    q1 <= q0;
    q2 <= q1;
  end
endmodule
`,
  },
  {
    id: "shift-b",
    title: "常见错误：时序块中用阻塞赋值 =",
    group: "常见错误",
    desc: "改成 = 之后，q0 先被更新，q1 读到的已经是新值——一个时钟沿 din 就“穿透”到了 q2。和上一个示例比较波形。",
    clock: "clk",
    init: { clk: 0, din: 0 },
    script: [{ din: 1 }, { din: 0 }, { din: 0 }, { din: 1 }, { din: 1 }, { din: 0 }, {}],
    code: `module shift_b (
  input  wire clk,
  input  wire din,
  output reg  q0 = 1'b0,
  output reg  q1 = 1'b0,
  output reg  q2 = 1'b0
);
  always @(posedge clk) begin
    q0 = din;   // 阻塞赋值：立即生效
    q1 = q0;    // 读到的是刚更新的 q0
    q2 = q1;
  end
endmodule
`,
  },
  {
    id: "latch-bug",
    title: "常见错误：if 缺少 else，推断出锁存器",
    group: "常见错误",
    desc: "en = 0 时没有给 y 赋值，y 只能保持旧值——综合工具会生成一个锁存器。解释器会给出警告；补上 else y = 1'b0; 警告消失。",
    init: { en: 1, d: 0 },
    code: `module latch_bug (
  input  wire en,
  input  wire d,
  output reg  y
);
  always @(*) begin
    if (en) y = d;
  end
endmodule
`,
  },
  {
    id: "fsm101",
    title: "序列检测器 101（Mealy，可重叠）三段式",
    group: "状态机",
    desc: "状态寄存器 / 次态逻辑 / 输出逻辑分开写。激励序列 1 0 1 0 1 1 0 1：应在第 3、5、8 拍输出 1。",
    clock: "clk",
    init: { clk: 0, rst_n: 1, x: 0 },
    script: [{ rst_n: 0 }, { rst_n: 1, x: 1 }, { x: 0 }, { x: 1 }, { x: 0 }, { x: 1 }, { x: 1 }, { x: 0 }, { x: 1 }, { x: 0 }],
    code: `module fsm101 (
  input  wire clk,
  input  wire rst_n,
  input  wire x,
  output reg  y
);
  localparam S0 = 2'd0,   // 还没有匹配
             S1 = 2'd1,   // 已匹配 "1"
             S2 = 2'd2;   // 已匹配 "10"
  reg [1:0] state, next;

  // ① 状态寄存器
  always @(posedge clk or negedge rst_n)
    if (!rst_n) state <= S0;
    else        state <= next;

  // ② 次态逻辑
  always @(*) begin
    next = S0;
    case (state)
      S0: next = x ? S1 : S0;
      S1: next = x ? S1 : S2;
      S2: next = x ? S1 : S0;
    endcase
  end

  // ③ 输出逻辑（Mealy：与当前输入有关）
  always @(*) begin
    y = 1'b0;
    if (state == S2 && x) y = 1'b1;
  end
endmodule
`,
  },
  {
    id: "jk-structural",
    title: "结构化描述：JK 触发器例化成计数器",
    group: "状态机",
    desc: "先写一个 JK 触发器模块，再例化三次并按驱动方程连线——这正是实验 A 的电路图（下降沿触发）。",
    clock: "clk",
    init: { clk: 0 },
    script: Array.from({ length: 9 }, () => ({})),
    code: `module jkff (clk, j, k, q);
  input  clk, j, k;
  output q;
  parameter INIT = 1'b0;
  reg q = INIT;
  always @(negedge clk)
    q <= j & ~q | ~k & q;      // 特性方程
endmodule

module counter_jk (
  input  wire clk,
  output wire q0, q1, q2,
  output wire c
);
  wire j1 = q0;                // J1 = K1 = Q0
  wire j2 = q0 & q1;           // J2 = K2 = Q0·Q1
  jkff ff0 (.clk(clk), .j(1'b1), .k(1'b1), .q(q0));
  jkff ff1 (.clk(clk), .j(j1),   .k(j1),   .q(q1));
  jkff ff2 (.clk(clk), .j(j2),   .k(j2),   .q(q2));
  assign c = q0 & q1 & q2;
endmodule
`,
  },
];

export function findHdlExample(id: string) {
  return HDL_EXAMPLES.find((e) => e.id === id);
}
