/**
 * 知识依赖图。每个知识点：id、名称、所属课时、前置知识点、相关公式（LaTeX）。
 * 相关实验与题目通过课时与题库的 knowledge 字段反查，不在这里重复存储。
 */
export interface KnowledgeNode {
  id: string;
  name: string;
  lesson: string;
  prereqs: string[];
  formulas?: string[];
  /** 点击变量/公式/引脚时的简短解释 */
  brief: string;
}

export const KNOWLEDGE: KnowledgeNode[] = [
  { id: "radix", name: "数制与转换", lesson: "number-systems", prereqs: [], brief: "按位权展开求十进制；整数部分除基取余、小数部分乘基取整。", formulas: ["N = \\sum_i d_i \\cdot R^i"] },
  { id: "complement", name: "补码", lesson: "complement", prereqs: ["radix"], brief: "n 位补码表示范围 −2^{n−1}～2^{n−1}−1；负数补码 = 反码 + 1。", formulas: ["[X]_{补} = 2^n + X\\ (X<0)"] },
  { id: "overflow", name: "溢出判断", lesson: "complement", prereqs: ["complement"], brief: "两个同号数相加，结果符号与之相反即溢出；等价于最高位进位与次高位进位不同。", formulas: ["V = C_{n} \\oplus C_{n-1}"] },
  { id: "bcd", name: "BCD 码", lesson: "codes", prereqs: ["radix"], brief: "用 4 位二进制表示 1 位十进制数；8421BCD 只用 0000～1001。" },
  { id: "gray", name: "格雷码", lesson: "codes", prereqs: ["radix"], brief: "相邻两个代码只有一位不同；G_i = B_{i+1} ⊕ B_i。", formulas: ["G_i = B_{i+1} \\oplus B_i"] },
  { id: "logic-ops", name: "逻辑运算", lesson: "basic-ops", prereqs: [], brief: "与：全 1 得 1；或：有 1 得 1；非：取反。复合运算由它们组合而成。", formulas: ["A \\oplus B = A\\overline{B} + \\overline{A}B"] },
  { id: "boolean-laws", name: "逻辑代数公式", lesson: "theorems", prereqs: ["logic-ops"], brief: "吸收律、冗余项定理等用于代数化简；每一步都应保持逻辑等价。", formulas: ["A + AB = A", "A + \\overline{A}B = A + B", "AB + \\overline{A}C + BC = AB + \\overline{A}C"] },
  { id: "demorgan", name: "反演定理", lesson: "theorems", prereqs: ["logic-ops"], brief: "求反函数：与↔或、0↔1、原变量↔反变量，不属于单个变量的长非号保持不变。", formulas: ["\\overline{A+B} = \\overline{A}\\,\\overline{B}", "\\overline{AB} = \\overline{A}+\\overline{B}"] },
  { id: "minterm", name: "最小项与标准式", lesson: "canonical", prereqs: ["boolean-laws"], brief: "最小项 m_i 是包含全部变量的乘积项，仅在第 i 行为 1；任何函数可唯一写成最小项之和。", formulas: ["F = \\sum m_i", "\\overline{m_i} = M_i"] },
  { id: "kmap", name: "卡诺图", lesson: "kmap", prereqs: ["minterm"], brief: "几何相邻 = 逻辑相邻（只差一个变量），包括首尾循环相邻；圈 2^k 个相邻 1 可消去 k 个变量。" },
  { id: "dont-care", name: "无关项", lesson: "kmap", prereqs: ["kmap"], brief: "取值不会出现或无所谓的组合，化简时可当 1 也可当 0。" },
  { id: "noise-margin", name: "噪声容限", lesson: "levels", prereqs: ["logic-ops"], brief: "V_NH = V_OH(min) − V_IH(min)，V_NL = V_IL(max) − V_OL(max)。", formulas: ["V_{NH} = V_{OH(min)} - V_{IH(min)}", "V_{NL} = V_{IL(max)} - V_{OL(max)}"] },
  { id: "fanout", name: "扇出系数", lesson: "levels", prereqs: ["noise-margin"], brief: "高、低电平下分别按电流计算可驱动的同类门数，取较小者。", formulas: ["N = \\min\\left(\\frac{I_{OL(max)}}{|I_{IL(max)}|}, \\frac{|I_{OH(max)}|}{I_{IH(max)}}\\right)"] },
  { id: "tristate", name: "三态门", lesson: "tristate-oc", prereqs: ["logic-ops"], brief: "输出可以是 0、1 或高阻 Z；总线上同一时刻只能有一个三态门被使能。" },
  { id: "open-collector", name: "OC/OD 门", lesson: "tristate-oc", prereqs: ["tristate"], brief: "输出管开路，必须外接上拉电阻；多个 OC 输出并联实现线与。" },
  { id: "comb-analysis", name: "组合逻辑分析", lesson: "comb-design", prereqs: ["boolean-laws"], brief: "逐级写出输出表达式 → 化简 → 列真值表 → 概括功能。" },
  { id: "comb-design", name: "组合逻辑设计", lesson: "comb-design", prereqs: ["kmap"], brief: "逻辑抽象 → 真值表 → 化简 → 按给定器件变换 → 画逻辑图。" },
  { id: "decoder", name: "译码器", lesson: "decoder-mux", prereqs: ["minterm"], brief: "74LS138 的 \\overline{Y_i} = \\overline{m_i}，用与非门组合输出即可实现任意 3 变量函数。", formulas: ["\\overline{Y_i} = \\overline{m_i}"] },
  { id: "mux", name: "数据选择器", lesson: "decoder-mux", prereqs: ["minterm"], brief: "74LS151：Y = Σ m_i D_i，令 D_i 取 0/1/变量即可实现函数。", formulas: ["Y = \\sum_{i=0}^{7} m_i D_i"] },
  { id: "hazard", name: "竞争与冒险", lesson: "hazards", prereqs: ["kmap"], brief: "同一信号经不同路径到达，可能产生毛刺；卡诺图中相切而未被同一圈覆盖的圈是冒险的标志。" },
  { id: "sr-latch", name: "SR 锁存器", lesson: "latches", prereqs: ["logic-ops"], brief: "交叉耦合形成正反馈；或非门型 S、R 高电平有效，约束条件 SR=0。", formulas: ["Q^{n+1} = S + \\overline{R}Q^n,\\quad SR = 0"] },
  { id: "d-latch", name: "D 锁存器", lesson: "latches", prereqs: ["sr-latch"], brief: "EN=1 时透明（Q 跟随 D），EN=0 时保持；是电平触发，不是边沿触发。" },
  { id: "trigger-modes", name: "触发方式", lesson: "triggering", prereqs: ["d-latch"], brief: "电平触发在有效电平期间都可能变化；主从（脉冲）触发存在一次翻转；边沿触发只看有效沿时刻的输入。" },
  { id: "ff-equations", name: "特性方程", lesson: "flipflops", prereqs: ["trigger-modes"], brief: "D：Q^{n+1}=D；JK：Q^{n+1}=J\\overline{Q^n}+\\overline{K}Q^n；T：Q^{n+1}=T⊕Q^n。", formulas: ["Q^{n+1} = D", "Q^{n+1} = J\\overline{Q^n} + \\overline{K}Q^n", "Q^{n+1} = T \\oplus Q^n"] },
  { id: "excitation", name: "激励表", lesson: "flipflops", prereqs: ["ff-equations"], brief: "已知现态与次态，反查需要的触发器输入；JK 的激励中有无关项。" },
  { id: "state", name: "状态与方程组", lesson: "seq-basics", prereqs: ["ff-equations"], brief: "驱动方程描述触发器输入，代入特性方程得到状态方程，输出方程描述输出。" },
  { id: "moore-mealy", name: "Moore 与 Mealy", lesson: "seq-basics", prereqs: ["state"], brief: "Moore 输出只取决于现态；Mealy 输出还取决于当前输入。" },
  { id: "sync-analysis", name: "同步时序分析", lesson: "sync-analysis", prereqs: ["state", "kmap"], brief: "驱动方程 → 状态方程 → 状态表 → 状态图/时序图 → 功能与自启动。" },
  { id: "self-start", name: "自启动", lesson: "sync-analysis", prereqs: ["sync-analysis"], brief: "电路从任何无效状态出发，经若干个时钟后都能进入有效循环，则能自启动。" },
  { id: "async-analysis", name: "异步时序分析", lesson: "async-analysis", prereqs: ["sync-analysis"], brief: "各触发器时钟不同，只有其时钟出现有效沿时才按特性方程更新。" },
  { id: "ls161", name: "74LS161", lesson: "counters", prereqs: ["sync-analysis"], brief: "4 位同步二进制计数器：\\overline{R_D} 异步清零，\\overline{LD} 同步置数，EP·ET=1 时计数，C = ET·Q_3Q_2Q_1Q_0。" },
  { id: "modulo-n", name: "任意进制计数器", lesson: "counters", prereqs: ["ls161"], brief: "异步清零法译码状态 N（瞬态）；同步置数法译码状态 N−1（无瞬态）。" },
  { id: "shift-register", name: "移位寄存器", lesson: "registers", prereqs: ["sync-analysis"], brief: "74LS194：S1S0=00 保持、01 右移、10 左移、11 并行置数。" },
  { id: "ring-counter", name: "环形与扭环形计数器", lesson: "registers", prereqs: ["shift-register"], brief: "n 位环形计数器有 n 个有效状态；扭环形（约翰逊）有 2n 个。" },
  { id: "state-minimization", name: "状态化简", lesson: "sync-design", prereqs: ["sync-analysis"], brief: "两状态等价 ⇔ 对所有输入，输出相同且次态相同或等价。仅输出相同不能合并。" },
  { id: "state-assignment", name: "状态编码", lesson: "sync-design", prereqs: ["state-minimization"], brief: "M 个状态至少需要 ⌈log₂M⌉ 个触发器；编码方案影响电路复杂度。" },
  { id: "sync-design", name: "同步时序设计", lesson: "sync-design", prereqs: ["state-assignment", "excitation"], brief: "状态表 → 编码 → 次态卡诺图 → 驱动方程 → 自启动检查 → 验证。" },
  { id: "sequence-detector", name: "序列检测器", lesson: "sequence-detector", prereqs: ["sync-design"], brief: "状态表示已匹配的前缀长度；可重叠时检测成功后保留最长的公共前后缀。" },
  { id: "setup-hold", name: "建立与保持时间", lesson: "timing", prereqs: ["ff-equations"], brief: "数据必须在有效沿前 t_su 稳定、沿后保持 t_h，否则可能亚稳态。" },
  { id: "fmax", name: "最高时钟频率", lesson: "timing", prereqs: ["setup-hold"], brief: "T_{min} = t_{pd(FF)} + t_{pd(comb)} + t_{su}（不计偏斜时）。", formulas: ["f_{max} = \\frac{1}{t_{pd,FF} + t_{pd,comb} + t_{su}}"] },
  { id: "555", name: "555 定时器", lesson: "timer555", prereqs: ["sr-latch"], brief: "两个电压比较器（阈值 2/3 V_CC 与 1/3 V_CC）控制一个 RS 锁存器和放电管；触发端低于 1/3 V_CC 时输出置 1（优先），阈值端高于 2/3 V_CC 时置 0。", formulas: ["V_U = \\tfrac{2}{3}V_{CC},\\ V_L = \\tfrac{1}{3}V_{CC}", "t = \\tau \\ln\\frac{v(\\infty) - v(0)}{v(\\infty) - v(t)}"] },
  { id: "schmitt", name: "施密特触发器", lesson: "timer555", prereqs: ["555"], brief: "两个不同的翻转阈值形成回差，可把缓慢变化或带噪声的信号整形为矩形波。", formulas: ["\\Delta V = V_{T+} - V_{T-} = \\tfrac{1}{3}V_{CC}"] },
  { id: "monostable", name: "单稳态触发器", lesson: "timer555", prereqs: ["555"], brief: "一个稳态、一个暂稳态；触发后输出一个宽度由 RC 决定的脉冲。", formulas: ["t_W = RC\\ln 3 \\approx 1.1RC"] },
  { id: "astable", name: "多谐振荡器", lesson: "timer555", prereqs: ["555"], brief: "没有稳态，电容在 1/3 V_CC 与 2/3 V_CC 之间反复充放电，输出矩形波。", formulas: ["t_H = 0.693(R_1+R_2)C", "t_L = 0.693R_2C", "q = \\frac{R_1+R_2}{R_1+2R_2}"] },
  { id: "memory", name: "存储器", lesson: "memory", prereqs: ["decoder"], brief: "规划中。" },
  { id: "pld", name: "可编程逻辑", lesson: "pld", prereqs: ["minterm"], brief: "规划中。" },
  { id: "adc-dac", name: "ADC/DAC", lesson: "adc-dac", prereqs: ["radix"], brief: "规划中。" },
  { id: "verilog", name: "Verilog", lesson: "verilog", prereqs: ["sync-design"], brief: "规划中。" },
];

export const KNOWLEDGE_BY_ID = Object.fromEntries(KNOWLEDGE.map((k) => [k.id, k]));
