import type { Exercise } from "@/lib/exercises/types";

// 全部数值、地址范围与 ROM 内容均用 lib/memory/memory.ts 计算并核对（tests/unit/memory.test.ts）。

/** 地址范围的常见写法：0800H～0FFFH、800-FFF、0x0800-0x0FFF ……（判分前会转大写并去空格） */
function rangeAccept(a: string, b: string): string[] {
  const strip = (x: string) => x.replace(/^0+(?=[0-9A-F])/, "");
  const out = new Set<string>();
  for (const [x, y] of [
    [a, b],
    [strip(a), strip(b)],
  ])
    for (const sep of ["～", "~", "-", "—", "–", "至", "到"]) {
      out.add(`${x}${sep}${y}`);
      out.add(`${x}H${sep}${y}H`);
      out.add(`0X${x}${sep}0X${y}`);
    }
  return [...out];
}

export const exercises: Exercise[] = [
  {
    id: "memory-1",
    lesson: "memory",
    level: "basic",
    kind: "choice",
    title: "断电后数据还在吗",
    prompt: "下列存储器中，断电后所存数据**不会丢失**的是（多选）：",
    options: ["掩模 ROM", "SRAM", "EEPROM", "DRAM", "Flash"],
    answer: [0, 2, 4],
    knowledge: ["rom", "ram"],
    hints: ["先把它们分成 ROM 家族和 RAM 家族。", "SRAM 用锁存器、DRAM 用电容存储，二者都要靠电源维持。"],
    explanation:
      "ROM 家族（掩模 ROM、PROM、EPROM、EEPROM、Flash）都是**非易失**的：掩模 ROM 的内容由制造决定，EEPROM、Flash 靠浮栅中的电荷长期保存数据。SRAM 的锁存器断电后失去状态，DRAM 的电容电荷也会消失，二者都是**易失**的。所以选掩模 ROM、EEPROM、Flash。",
    exam: true,
  },
  {
    id: "memory-2",
    lesson: "memory",
    level: "basic",
    kind: "numeric",
    title: "由地址线、数据线求容量",
    prompt: "某存储器有 11 根地址线、8 根数据线。它的存储容量是多少**位**？",
    answer: 16384,
    unit: "位",
    knowledge: ["memory"],
    hints: ["$n$ 根地址线能区分多少个字？", "容量 = 字数 × 每字位数。"],
    explanation: "字数 $2^{11} = 2048 = 2\\text{K}$，每字 8 位，容量 $2\\text{K}\\times 8 = 2048\\times 8 = 16384$ 位（即 2048 字节）。",
  },
  {
    id: "memory-3",
    lesson: "memory",
    level: "basic",
    kind: "choice",
    title: "DRAM 为什么要刷新",
    prompt: "DRAM 需要定期刷新，根本原因是：",
    options: ["存储单元是锁存器，会自发翻转", "存储单元用电容上的电荷表示数据，电荷会因漏电逐渐消失", "地址译码器需要周期性复位", "数据线是三态的，不刷新会呈高阻"],
    answer: 1,
    knowledge: ["ram"],
    hints: ["对比 SRAM 与 DRAM 的存储单元分别是什么。"],
    explanation:
      "DRAM 的每个单元用一个电容是否存有电荷来表示 0/1，电容存在漏电，电荷会慢慢流失，所以必须在数据丢失之前把每个单元读出并重新写回——这就是刷新。SRAM 的单元是双稳态锁存器，只要通电就保持，不需要刷新。",
  },
  {
    id: "memory-4",
    lesson: "memory",
    level: "basic",
    kind: "numeric",
    title: "需要几根地址线",
    prompt: "容量为 $64\\text{K}\\times 16$ 的存储器，需要多少根**地址线**？",
    answer: 16,
    unit: "根",
    knowledge: ["memory"],
    hints: ["地址线数只由字数决定，与每字的位数无关。", "$64\\text{K} = 2^{?}$"],
    explanation: "字数 $64\\text{K} = 64\\times 1024 = 2^{16}$，所以需要 16 根地址线。每字 16 位决定的是数据线的根数（16 根），与地址线无关。",
  },
  {
    id: "memory-5",
    lesson: "memory",
    level: "analysis",
    kind: "numeric",
    title: "字位同时扩展的芯片数",
    prompt: "用 $2\\text{K}\\times 4$ 的 RAM 芯片组成 $16\\text{K}\\times 8$ 的存储器，共需要多少片？",
    answer: 16,
    unit: "片",
    knowledge: ["memory-expansion"],
    hints: ["分别算字数要扩大几倍、位数要扩大几倍。"],
    explanation:
      "字扩展倍数 $\\frac{16\\text{K}}{2\\text{K}} = 8$（8 组），位扩展倍数 $\\frac{8}{4} = 2$（每组 2 片），芯片数 $= 8\\times 2 = 16$ 片。8 组需要 3 根高位地址，用 3 线-8 线译码器产生片选。",
    exam: true,
  },
  {
    id: "memory-6",
    lesson: "memory",
    level: "analysis",
    kind: "choice",
    title: "片选译码器的规格",
    prompt: "用 $2\\text{K}\\times 4$ 的 RAM 组成 $16\\text{K}\\times 8$ 的存储器，片选信号应由哪种译码器产生？",
    options: ["2 线-4 线译码器", "3 线-8 线译码器", "4 线-16 线译码器", "不需要译码器"],
    answer: 1,
    knowledge: ["memory-expansion", "decoder"],
    hints: ["译码器的每个输出管一**组**芯片，不是一片。", "一共有几组？需要几根高位地址？"],
    explanation:
      "系统需要 $\\log_2(16\\text{K}) = 14$ 根地址线，单片需要 $\\log_2(2\\text{K}) = 11$ 根（$A_{10}\\sim A_0$，并联到各片）。剩下 $A_{13}A_{12}A_{11}$ 共 3 根高位地址，产生 8 个片选，每个片选同时选中一组的 2 片（位扩展），所以用 3 线-8 线译码器。若误以为每片都要一个片选，会错选 4 线-16 线译码器。",
  },
  {
    id: "memory-7",
    lesson: "memory",
    level: "analysis",
    kind: "text",
    title: "写出某一片的地址范围",
    prompt:
      "用 4 片 $2\\text{K}\\times 8$ 的 ROM 组成 $8\\text{K}\\times 8$ 的存储器，高位地址 $A_{12}A_{11}$ 接 2 线-4 线译码器，$\\overline{Y_i}$ 接第 $i$ 片的 $\\overline{CS}$。写出由 $\\overline{Y_1}$ 选中的那一片的地址范围（十六进制，例如 0000H～07FFH）。",
    accept: rangeAccept("0800", "0FFF"),
    normalize: "upper",
    placeholder: "起始～结束，例如 0000H～07FFH",
    knowledge: ["memory-expansion"],
    hints: ["$\\overline{Y_1}$ 有效时 $A_{12}A_{11}$ 等于多少？", "低位地址 $A_{10}\\sim A_0$ 从全 0 变到全 1。"],
    explanation:
      "系统地址 13 位（$A_{12}\\sim A_0$），写 4 位十六进制。$\\overline{Y_1}$ 有效时 $A_{12}A_{11} = 01$，$A_{10}\\sim A_0$ 从 000 0000 0000 到 111 1111 1111：起始 $0\\,1000\\,0000\\,0000\\text{B} = 0800\\text{H}$，结束 $0\\,1111\\,1111\\,1111\\text{B} = 0\\text{FFFH}$。也可以直接算：每片 2K = 800H，第 1 片从 $1\\times 800\\text{H} = 0800\\text{H}$ 到 $2\\times 800\\text{H} - 1 = 0\\text{FFFH}$。",
    exam: true,
  },
  {
    id: "memory-8",
    lesson: "memory",
    level: "analysis",
    kind: "numeric",
    title: "地址选中哪一片",
    prompt:
      "同上题（4 片 $2\\text{K}\\times 8$ 组成 $8\\text{K}\\times 8$，$A_{12}A_{11}$ 接 2 线-4 线译码器，$\\overline{Y_i}$ 选第 $i$ 片）。CPU 访问地址 1A3CH 时，哪个译码输出 $\\overline{Y_i}$ 为 0？填 $i$。",
    answer: 3,
    knowledge: ["memory-expansion", "decoder"],
    hints: ["把 1A3CH 写成 13 位二进制，看最高两位。"],
    explanation:
      "1A3CH $=$ 1 1010 0011 1100B（13 位），最高两位 $A_{12}A_{11} = 11$，所以 $\\overline{Y_3} = 0$，选中第 3 片；片内地址 $A_{10}\\sim A_0 = 010\\,0011\\,1100\\text{B} = 23\\text{CH}$。用十六进制判断：每片 800H，$1\\text{A}3\\text{CH} \\div 800\\text{H}$ 的整数部分为 3。",
  },
  {
    id: "memory-9",
    lesson: "memory",
    level: "analysis",
    kind: "choice",
    title: "字扩展的连线",
    prompt: "用多片 $1\\text{K}\\times 8$ 的 RAM 做**字扩展**时，下列说法正确的是（多选）：",
    options: [
      "各片的低位地址线 $A_9\\sim A_0$ 并联",
      "各片的数据线 $D_7\\sim D_0$ 分别接到系统数据总线的不同位上",
      "各片的数据线并联到同一组数据总线上",
      "高位地址经译码器产生各片的 $\\overline{CS}$",
    ],
    answer: [0, 2, 3],
    knowledge: ["memory-expansion"],
    hints: ["字扩展时，同一时刻有几片在工作？", "片选无效的芯片，数据线处于什么状态？"],
    explanation:
      "字扩展：低位地址并联做片内寻址（A 对）；高位地址经译码器产生片选（D 对），任何时刻只有一片被选中，其余芯片数据线呈高阻，所以数据线可以**并联**（C 对）。数据线分开接到不同位上是**位扩展**的做法（B 错）。",
  },
  {
    id: "memory-10",
    lesson: "memory",
    level: "design",
    kind: "expression",
    title: "由 ROM 内容反写函数",
    prompt:
      "一个 $8\\times 1$ 的 ROM，地址 $A_2A_1A_0$ 依次接变量 $A$、$B$、$C$。地址 0～7 中存放的数据依次为 1、0、0、1、0、1、1、0。写出输出 $Y$ 的逻辑表达式（任意等价形式均可）。",
    vars: ["A", "B", "C"],
    target: { minterms: [0, 3, 5, 6] },
    minimal: false,
    knowledge: ["rom"],
    hints: ["存 1 的地址就是 $Y$ 的最小项编号。", "把这几个最小项和三变量奇校验 $A\\oplus B\\oplus C$ 的最小项比较一下。"],
    explanation:
      "存 1 的地址为 0、3、5、6，所以 $Y = \\sum m(0,3,5,6) = \\overline{A}\\,\\overline{B}\\,\\overline{C} + \\overline{A}BC + A\\overline{B}C + AB\\overline{C}$。这正是三变量**偶**校验：$Y = \\overline{A\\oplus B\\oplus C}$（三个变量中 1 的个数为偶数时 $Y = 1$）。注意不要写成 $A\\odot B\\odot C$——三个变量连续同或的结果等于 $A\\oplus B\\oplus C$，是奇校验。",
  },
  {
    id: "memory-11",
    lesson: "memory",
    level: "design",
    kind: "numeric",
    title: "用 ROM 实现乘 3 运算",
    prompt: "用 ROM 实现电路：输入是 4 位无符号二进制数 $X$，输出是 $3X$ 的二进制表示（位数取能表示全部结果的最少位数）。所需 ROM 的容量是多少**位**？",
    answer: 96,
    unit: "位",
    knowledge: ["rom", "memory"],
    hints: ["输入有几位？决定 ROM 有几个字。", "$3X$ 的最大值是多少？需要几位二进制？"],
    explanation:
      "输入 4 位 → 4 根地址线，$2^4 = 16$ 个字。$X$ 最大为 15，$3X$ 最大为 45 $=$ 101101B，需要 6 位 → 每字 6 位。ROM 规格 $16\\times 6$，容量 $16\\times 6 = 96$ 位。把 $X = 0\\sim 15$ 时的 $3X$ 依次写入地址 0～15 即可，不需要化简。",
    exam: true,
  },
];
