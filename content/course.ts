/**
 * 课程体系（单一数据源）。章节顺序依据：本地无数字电路大纲，采用康华光、阎石教材通行顺序（见 docs/materials-summary.md）。
 * status：ready = 已有完整课时内容；planned = 规划中（页面上明确标注，不放占位正文）。
 */
export type LessonStatus = "ready" | "planned";

export interface Lesson {
  id: string;
  title: string;
  /** 一句话简介 */
  summary: string;
  status: LessonStatus;
  minutes?: number;
  /** 前置课时 id */
  prereqs: string[];
  /** 关联实验 id */
  experiments?: string[];
  /** 知识点 id */
  knowledge: string[];
}

export interface Chapter {
  id: string;
  no: number;
  title: string;
  en: string;
  /** 本章知识点提纲（规划中的章节也给出，供学生了解范围） */
  outline: string[];
  lessons: Lesson[];
  /** 最高优先级章节 */
  focus?: boolean;
}

export const CHAPTERS: Chapter[] = [
  {
    id: "ch1",
    no: 1,
    title: "数制与码制",
    en: "Number Systems & Codes",
    outline: ["模拟信号与数字信号", "二、八、十、十六进制", "数制转换", "二进制算术", "原码、反码、补码", "补码运算与溢出", "8421 BCD、2421、余 3 码", "格雷码", "ASCII"],
    lessons: [
      { id: "number-systems", title: "数制与数制转换", summary: "位权展开、除基取余、乘基取整，以及二/八/十六进制的分组互换。", status: "ready", minutes: 30, prereqs: [], knowledge: ["radix"] },
      { id: "complement", title: "原码、反码、补码与溢出", summary: "有符号数的三种表示、补码加减法，以及用最高位进位判断溢出。", status: "ready", minutes: 35, prereqs: ["number-systems"], knowledge: ["complement", "overflow"] },
      { id: "codes", title: "BCD 码、格雷码与 ASCII", summary: "有权码与无权码、格雷码的单位距离性质及其与二进制的互换。", status: "ready", minutes: 25, prereqs: ["number-systems"], knowledge: ["bcd", "gray"] },
    ],
  },
  {
    id: "ch2",
    no: 2,
    title: "逻辑代数基础",
    en: "Boolean Algebra",
    outline: ["与、或、非", "与非、或非、异或、同或", "基本公式与常用公式", "代入、反演、对偶定理", "逻辑函数的表示", "最小项与最大项", "标准与或式、标准或与式", "公式化简", "卡诺图化简", "无关项", "多输出函数"],
    lessons: [
      { id: "basic-ops", title: "逻辑运算与逻辑门", summary: "七种基本/复合逻辑运算、真值表与国标逻辑符号。", status: "ready", minutes: 25, prereqs: [], knowledge: ["logic-ops"] },
      { id: "theorems", title: "公式、定理与代数化简", summary: "吸收律、冗余项定理、反演与对偶定理，逐步可验证的代数化简。", status: "ready", minutes: 40, prereqs: ["basic-ops"], knowledge: ["boolean-laws", "demorgan"] },
      { id: "canonical", title: "逻辑函数的标准形式", summary: "真值表、表达式、逻辑图之间的互换；最小项、最大项与标准式。", status: "ready", minutes: 30, prereqs: ["theorems"], knowledge: ["minterm"] },
      { id: "kmap", title: "卡诺图化简与无关项", summary: "相邻性、圈组规则、质蕴含项与必要质蕴含项、无关项的利用。", status: "ready", minutes: 45, prereqs: ["canonical"], knowledge: ["kmap", "dont-care"] },
    ],
  },
  {
    id: "ch3",
    no: 3,
    title: "门电路",
    en: "Logic Gate Circuits",
    outline: ["半导体器件的开关特性", "CMOS 反相器", "CMOS 与非门、或非门", "CMOS 传输门", "三态门", "OD 门", "TTL 门电路", "OC 门", "噪声容限", "传播延迟", "功耗", "扇出系数", "TTL 与 CMOS 接口", "输入端悬空"],
    lessons: [
      { id: "levels", title: "逻辑电平、噪声容限与扇出", summary: "电气层视角：V_IH、V_IL、V_OH、V_OL，噪声容限、扇出与 TTL/CMOS 接口。", status: "ready", minutes: 35, prereqs: ["basic-ops"], knowledge: ["noise-margin", "fanout"] },
      { id: "tristate-oc", title: "三态门与 OC/OD 门", summary: "总线结构、线与，以及 OC 门上拉电阻的取值范围。", status: "ready", minutes: 30, prereqs: ["levels"], knowledge: ["tristate", "open-collector"] },
    ],
  },
  {
    id: "ch4",
    no: 4,
    title: "组合逻辑电路",
    en: "Combinational Logic",
    outline: ["组合逻辑分析", "组合逻辑设计", "编码器与优先编码器 74LS148", "译码器 74LS138", "数据选择器 74LS151/153", "数据分配器", "半加器与全加器", "超前进位加法器 74LS283", "数值比较器 74LS85", "七段数码管", "竞争与冒险"],
    lessons: [
      { id: "comb-design", title: "组合逻辑的分析与设计", summary: "从逻辑图到功能、从文字需求到最简电路的标准步骤。", status: "ready", minutes: 40, prereqs: ["kmap"], knowledge: ["comb-analysis", "comb-design"] },
      { id: "decoder-mux", title: "译码器 74LS138 与数据选择器 74LS151", summary: "引脚级实验：使能条件、低电平有效输出，以及用它们实现任意逻辑函数。", status: "ready", minutes: 45, prereqs: ["comb-design", "canonical"], knowledge: ["decoder", "mux"] },
      { id: "hazards", title: "竞争与冒险", summary: "门延迟造成的毛刺、卡诺图判别法与消除方法。", status: "ready", minutes: 30, prereqs: ["kmap", "levels"], knowledge: ["hazard"] },
    ],
  },
  {
    id: "ch5",
    no: 5,
    title: "锁存器与触发器",
    en: "Latches & Flip-Flops",
    outline: ["存储单元原理", "SR 锁存器", "门控锁存器", "D 锁存器", "电平触发", "主从（脉冲）触发", "边沿触发", "D、JK、T、T′ 触发器", "特性方程", "触发器转换", "建立时间、保持时间、传播延迟"],
    lessons: [
      { id: "latches", title: "SR 锁存器与 D 锁存器", summary: "交叉耦合反馈如何“记住”一位；约束条件 SR=0；门控与透明。", status: "ready", minutes: 35, prereqs: ["basic-ops"], knowledge: ["sr-latch", "d-latch"] },
      { id: "triggering", title: "触发方式：电平、脉冲与边沿", summary: "同样的输入，锁存器、主从触发器、边沿触发器为何输出不同；一次翻转。", status: "ready", minutes: 35, prereqs: ["latches"], knowledge: ["trigger-modes"] },
      { id: "flipflops", title: "D、JK、T 触发器与特性方程", summary: "特性表、特性方程、状态图与激励表，触发器之间的转换。", status: "ready", minutes: 45, prereqs: ["triggering"], knowledge: ["ff-equations", "excitation"] },
    ],
  },
  {
    id: "ch6",
    no: 6,
    title: "时序逻辑电路",
    en: "Sequential Logic",
    focus: true,
    outline: ["状态变量与方程组", "Moore 与 Mealy", "同步时序电路分析", "异步时序电路分析", "计数器（同步/异步/十进制/可逆）", "任意进制计数器：清零法与置数法", "计数器级联", "寄存器与 74LS194", "环形与扭环形计数器", "同步时序逻辑设计", "序列检测器", "时序约束"],
    lessons: [
      { id: "seq-basics", title: "时序逻辑基础", summary: "现态与次态、驱动方程/状态方程/输出方程，Moore 与 Mealy 的区别。", status: "ready", minutes: 30, prereqs: ["flipflops"], knowledge: ["state", "moore-mealy"] },
      { id: "sync-analysis", title: "同步时序电路分析", summary: "五步法：驱动方程 → 状态方程 → 状态表 → 状态图与时序图 → 功能与自启动。", status: "ready", minutes: 50, prereqs: ["seq-basics", "kmap"], experiments: ["jk-counter"], knowledge: ["sync-analysis", "self-start"] },
      { id: "async-analysis", title: "异步时序电路与纹波计数器", summary: "各触发器时钟不同：时钟条件、纹波延迟累积与译码毛刺。", status: "ready", minutes: 35, prereqs: ["sync-analysis"], knowledge: ["async-analysis"] },
      { id: "counters", title: "计数器与 74LS161 任意进制", summary: "异步清零与同步置数的本质区别；N 进制设计；两片级联。", status: "ready", minutes: 55, prereqs: ["sync-analysis"], experiments: ["ls161"], knowledge: ["ls161", "modulo-n"] },
      { id: "registers", title: "寄存器、移位寄存器与 74LS194", summary: "数码寄存器、双向移位、环形与扭环形计数器及其自启动。", status: "ready", minutes: 35, prereqs: ["sync-analysis"], knowledge: ["shift-register", "ring-counter"] },
      { id: "sync-design", title: "同步时序逻辑设计", summary: "逻辑抽象 → 状态化简 → 编码 → 方程 → 自启动检查 → 仿真验证。", status: "ready", minutes: 60, prereqs: ["sync-analysis", "kmap"], experiments: ["fsm-designer"], knowledge: ["state-minimization", "state-assignment", "sync-design"] },
      { id: "sequence-detector", title: "序列检测器", summary: "Mealy 与 Moore、可重叠与不可重叠，以及状态化简。", status: "ready", minutes: 40, prereqs: ["sync-design"], experiments: ["fsm-designer"], knowledge: ["sequence-detector"] },
      { id: "timing", title: "时序约束与最高时钟频率", summary: "建立时间、保持时间、时钟偏斜与 f_max 的计算。", status: "ready", minutes: 35, prereqs: ["flipflops", "sync-analysis"], knowledge: ["setup-hold", "fmax"] },
    ],
  },
  {
    id: "ch7",
    no: 7,
    title: "脉冲波形的产生与整形",
    en: "Pulse Circuits",
    outline: ["施密特触发器", "单稳态触发器", "多谐振荡器", "555 定时器", "脉冲宽度、振荡频率、占空比"],
    lessons: [{ id: "timer555", title: "555 定时器", summary: "内部比较器与 RS 触发器、多谐振荡器的电容电压波形（教学近似模型）。", status: "planned", prereqs: ["latches"], knowledge: ["555"] }],
  },
  {
    id: "ch8",
    no: 8,
    title: "半导体存储器",
    en: "Semiconductor Memory",
    outline: ["ROM、PROM、EPROM、EEPROM、Flash", "SRAM 与 DRAM", "存储容量与地址译码", "位扩展与字扩展", "用 ROM 实现逻辑函数"],
    lessons: [{ id: "memory", title: "存储器与容量扩展", summary: "地址译码、位扩展与字扩展。", status: "planned", prereqs: ["decoder-mux"], knowledge: ["memory"] }],
  },
  {
    id: "ch9",
    no: 9,
    title: "可编程逻辑器件",
    en: "Programmable Logic",
    outline: ["PLA、PAL、GAL", "CPLD", "FPGA 与 LUT", "逻辑函数映射到 LUT"],
    lessons: [{ id: "pld", title: "从 PLA 到 FPGA 的 LUT", summary: "与或阵列与查找表。", status: "planned", prereqs: ["canonical"], knowledge: ["pld"] }],
  },
  {
    id: "ch10",
    no: 10,
    title: "数模与模数转换",
    en: "D/A & A/D Conversion",
    outline: ["权电阻网络与 R-2R DAC", "采样、保持、量化、编码", "逐次逼近 ADC", "并联比较 ADC", "双积分 ADC", "分辨率与量化误差"],
    lessons: [{ id: "adc-dac", title: "DAC 与 ADC", summary: "R-2R 网络与逐次逼近。", status: "planned", prereqs: ["number-systems"], knowledge: ["adc-dac"] }],
  },
  {
    id: "ch11",
    no: 11,
    title: "Verilog HDL 入门",
    en: "Verilog HDL",
    outline: ["module 与端口", "wire / reg / logic", "assign 与 always", "组合与时序描述", "阻塞与非阻塞赋值", "计数器与状态机", "Testbench"],
    lessons: [{ id: "verilog", title: "Verilog 对照学习", summary: "同一个计数器的电路图、状态表与 Verilog 描述对照（本平台不含 HDL 编译器，不执行 Verilog 仿真）。", status: "planned", prereqs: ["sync-design"], knowledge: ["verilog"] }],
  },
];

export const ALL_LESSONS = CHAPTERS.flatMap((c) => c.lessons.map((l) => ({ ...l, chapter: c })));
export const READY_LESSONS = ALL_LESSONS.filter((l) => l.status === "ready");

export function findLesson(id: string) {
  return ALL_LESSONS.find((l) => l.id === id);
}

/** 推荐的零基础前置学习路径（通往同步时序逻辑设计） */
export const FOCUS_PATH = ["basic-ops", "theorems", "canonical", "kmap", "latches", "triggering", "flipflops", "seq-basics", "sync-analysis", "counters", "sync-design", "sequence-detector"];

export const EXPERIMENTS = [
  { id: "jk-counter", href: "/lab/jk-counter", title: "实验 A · 同步三位二进制加法计数器", summary: "三个 JK 触发器，驱动方程由网表自动提取；单步/连续时钟、状态图、时序波形。", lesson: "sync-analysis" },
  { id: "ls161", href: "/lab/ls161", title: "实验 B · 74LS161 任意进制计数器", summary: "清零法与置数法、异步清零的瞬态、两片级联；以仿真测出实际模数。", lesson: "counters" },
  { id: "fsm-designer", href: "/lab/fsm-designer", title: "实验 C · 同步时序逻辑设计向导", summary: "从状态表或序列检测器模板出发，化简、编码、求方程、检查自启动并仿真验证。", lesson: "sync-design" },
  { id: "logic", href: "/lab/logic", title: "逻辑工作台", summary: "表达式 ↔ 真值表 ↔ 卡诺图 ↔ 逻辑图，自动化简与等价验证。", lesson: "kmap" },
  { id: "sandbox", href: "/lab/sandbox", title: "自由电路实验台", summary: "拖放元件、连线、四值仿真、波形与自动符号分析。", lesson: "sync-analysis" },
] as const;
