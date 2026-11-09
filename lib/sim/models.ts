import { and4, isKnown, merge, not4, or4, resolveX, xor4 } from "./logic4";
import { type L, LX, LZ, type PinDef } from "./types";

/** 跳变：确定的上升/下降沿，或涉及 X 的"可能的"上升/下降沿 */
export type Edge = "rise" | "fall" | "xrise" | "xfall" | null;
export type Params = Record<string, number | string | boolean>;

export interface EvalCtx {
  /** 输入值（已按悬空规则把 Z 转换为 X 或 1） */
  in(pin: string): L;
  /** 本 delta 中该引脚发生的跳变 */
  edge(pin: string): Edge;
  /** 可选引脚是否连接 */
  connected(pin: string): boolean;
  state: Record<string, unknown>;
  params: Params;
  time: number;
}

export interface EvalResult {
  out: Record<string, L>;
  state?: Record<string, unknown>;
  issue?: { code: "forbidden-input"; message: string };
}

export type Category = "io" | "gate" | "latch" | "ff" | "msi";

export interface ComponentModel {
  type: string;
  title: string;
  category: Category;
  /** 是否含存储（用于组合反馈检测和符号分析） */
  sequential: boolean;
  /** 由用户/引擎直接驱动的信号源 */
  source?: boolean;
  description: string;
  defaultParams?: Params;
  pins(params: Params): PinDef[];
  /** 模型 C 的默认传播延迟（ns） */
  tpd?: number;
  /** 建立/保持时间检查（模型 C） */
  timing?: {
    clock: string;
    data: string[];
    setup: number;
    hold: number;
    /** 本次有效沿真正影响次态的数据端（缺省为 data 全部），例如 74LS161 只有 \overline{LD}=0 时才检查 D 端 */
    active?: (inp: (pin: string) => L) => string[];
  };
  initState?(params: Params): Record<string, unknown>;
  evaluate(ctx: EvalCtx): EvalResult;
  /** 符号分析：组合元件的布尔函数（输出名 → 关于输入名的构造函数），见 lib/fsm/extract */
  logic?: "and" | "or" | "nand" | "nor" | "xor" | "xnor" | "not" | "buf";
}

const P = (name: string, label: string, dir: "in" | "out", desc: string, extra: Partial<PinDef> = {}): PinDef => ({
  name,
  label,
  dir,
  desc,
  active: "high",
  ...extra,
});

// ───────────────────────── 延迟参数说明 ─────────────────────────
// 模型 C 的默认延迟是教学示意值：门 10 ns、触发器与中规模器件 20 ns。
// 量级参考 74LS 系列（例如 74LS00 t_PLH 典型 9 ns、t_PHL 典型 10 ns，TI 数据手册），
// 触发器 / 74LS161 的数值未逐一核对数据手册，⚠️待验证。可在元件参数 tpd 中修改。
export const DEFAULT_GATE_TPD = 10;
export const DEFAULT_SEQ_TPD = 20;

// ───────────────────────── 信号源与显示 ─────────────────────────

const sourceModel = (type: string, title: string, description: string, fixed?: 0 | 1): ComponentModel => ({
  type,
  title,
  category: "io",
  sequential: false,
  source: true,
  description,
  defaultParams: fixed === undefined ? { value: 0 } : {},
  pins: () => [P("Y", "Y", "out", "输出", { kind: "pushpull" })],
  initState: (p) => ({ value: fixed ?? (Number(p.value) as L) }),
  evaluate: (c) => ({ out: { Y: c.state.value as L } }),
});

const clockModel: ComponentModel = {
  type: "clock",
  title: "时钟",
  category: "io",
  sequential: false,
  source: true,
  description: "周期性方波。单步模式下由'单步'按钮产生一个完整周期（先上升沿、后下降沿）。",
  defaultParams: { period: 100, duty: 0.5 },
  pins: () => [P("CLK", "CLK", "out", "时钟输出", { kind: "pushpull" })],
  initState: () => ({ value: 0 }),
  evaluate: (c) => ({ out: { CLK: c.state.value as L } }),
};

const sinkModel = (type: string, title: string, description: string): ComponentModel => ({
  type,
  title,
  category: "io",
  sequential: false,
  description,
  pins: () => [P("A", "A", "in", "输入")],
  evaluate: () => ({ out: {} }),
});

const SEG_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

// ───────────────────────── 逻辑门 ─────────────────────────

type GateKind = "and" | "or" | "nand" | "nor" | "xor" | "xnor";
const GATE_TITLE: Record<GateKind, string> = { and: "与门", or: "或门", nand: "与非门", nor: "或非门", xor: "异或门", xnor: "同或门" };

function gateModel(kind: GateKind): ComponentModel {
  return {
    type: kind,
    title: GATE_TITLE[kind],
    category: "gate",
    sequential: false,
    logic: kind,
    description: `${GATE_TITLE[kind]}，输入端数可设为 2～8。`,
    defaultParams: { inputs: 2 },
    tpd: DEFAULT_GATE_TPD,
    pins: (p) => {
      const n = kind === "xor" || kind === "xnor" ? Math.max(2, Number(p.inputs ?? 2)) : Math.max(2, Math.min(8, Number(p.inputs ?? 2)));
      return [
        ...Array.from({ length: n }, (_, i) => P(`I${i}`, String.fromCharCode(65 + i), "in", `输入 ${i}`)),
        P("Y", "Y", "out", "输出", { kind: p.oc ? "opencollector" : "pushpull" }),
      ];
    },
    evaluate: (c) => {
      const n = Math.max(2, Number(c.params.inputs ?? 2));
      const xs = Array.from({ length: n }, (_, i) => c.in(`I${i}`));
      let y: L;
      switch (kind) {
        case "and": y = and4(xs); break;
        case "or": y = or4(xs); break;
        case "nand": y = not4(and4(xs)); break;
        case "nor": y = not4(or4(xs)); break;
        case "xor": y = xor4(xs); break;
        case "xnor": y = not4(xor4(xs)); break;
      }
      // 集电极开路：输出 1 时晶体管截止（高阻），由上拉电阻决定电平
      if (c.params.oc) y = y === 1 ? LZ : y;
      return { out: { Y: y } };
    },
  };
}

const notModel: ComponentModel = {
  type: "not",
  title: "非门",
  category: "gate",
  sequential: false,
  logic: "not",
  description: "反相器。",
  tpd: DEFAULT_GATE_TPD,
  pins: () => [P("A", "A", "in", "输入"), P("Y", "Y", "out", "输出", { kind: "pushpull" })],
  evaluate: (c) => ({ out: { Y: not4(c.in("A")) } }),
};

const bufModel: ComponentModel = {
  type: "buf",
  title: "缓冲器",
  category: "gate",
  sequential: false,
  logic: "buf",
  description: "同相缓冲器。",
  tpd: DEFAULT_GATE_TPD,
  pins: () => [P("A", "A", "in", "输入"), P("Y", "Y", "out", "输出", { kind: "pushpull" })],
  evaluate: (c) => ({ out: { Y: c.in("A") } }),
};

const triBufModel: ComponentModel = {
  type: "tribuf",
  title: "三态缓冲器",
  category: "gate",
  sequential: false,
  description: "EN 有效时 Y = A；EN 无效时输出高阻 Z。多个三态输出可以接在同一总线上，但同一时刻只能有一个被使能。",
  defaultParams: { enActiveLow: false },
  tpd: DEFAULT_GATE_TPD,
  pins: (p) => [
    P("A", "A", "in", "数据输入"),
    P("EN", p.enActiveLow ? "\\overline{EN}" : "EN", "in", "使能端", { active: p.enActiveLow ? "low" : "high" }),
    P("Y", "Y", "out", "三态输出", { kind: "tristate" }),
  ],
  evaluate: (c) => {
    let en = c.in("EN");
    if (c.params.enActiveLow) en = not4(en);
    const a = c.in("A");
    const y: L = en === 1 ? a : en === 0 ? LZ : LX;
    return { out: { Y: y } };
  },
};

const pullupModel: ComponentModel = {
  type: "pullup",
  title: "上拉电阻",
  category: "io",
  sequential: false,
  description: "接到 V_CC 的上拉电阻（弱驱动 1）。OC/OD 输出必须外接上拉电阻才能输出高电平。",
  defaultParams: { ohms: 1000 },
  pins: () => [P("Y", "R", "out", "接到需要上拉的网络", { kind: "pull" })],
  evaluate: () => ({ out: { Y: 1 } }),
};

// ───────────────────────── 锁存器 ─────────────────────────

const srLatchModel: ComponentModel = {
  type: "sr_latch",
  title: "SR 锁存器（或非门）",
  category: "latch",
  sequential: true,
  description: "由两个或非门交叉耦合构成，S、R 高电平有效。S=R=1 时 Q 与 Q̄ 同为 0（约束条件 SR=0 被破坏）；若 S、R 随后同时回到 0，次态不确定（X）。",
  defaultParams: { init: "X" },
  tpd: DEFAULT_GATE_TPD,
  pins: () => [
    P("S", "S", "in", "置 1 端，高电平有效"),
    P("R", "R", "in", "置 0 端，高电平有效"),
    P("Q", "Q", "out", "输出", { kind: "pushpull" }),
    P("QN", "\\overline{Q}", "out", "反相输出", { kind: "pushpull" }),
  ],
  initState: (p) => ({ q: initVal(p.init), forbidden: false }),
  evaluate: (c) => {
    const s = c.in("S");
    const r = c.in("R");
    let q = c.state.q as L;
    let forbidden = c.state.forbidden as boolean;
    if (s === 1 && r === 1) {
      return { out: { Q: 0, QN: 0 }, state: { q, forbidden: true }, issue: { code: "forbidden-input", message: "SR 锁存器 S=R=1：Q 与 Q̄ 同为 0，违反约束条件 SR=0" } };
    }
    if (s === 1 && r === 0) { q = 1; forbidden = false; }
    else if (s === 0 && r === 1) { q = 0; forbidden = false; }
    else if (s === 0 && r === 0) { if (forbidden) { q = LX; forbidden = false; } }
    else if (r === 0) q = merge(q, 1); // S 未知、R=0：可能置 1，也可能保持
    else if (s === 0) q = merge(q, 0); // R 未知、S=0：可能置 0，也可能保持
    else q = LX;
    return { out: { Q: q, QN: not4(q) }, state: { q, forbidden } };
  },
};

const dLatchModel: ComponentModel = {
  type: "d_latch",
  title: "D 锁存器（门控）",
  category: "latch",
  sequential: true,
  description: "电平触发：EN=1 期间 Q 跟随 D（透明），EN=0 时保持。它不是边沿触发器。",
  defaultParams: { init: "X" },
  tpd: DEFAULT_GATE_TPD,
  pins: () => [
    P("D", "D", "in", "数据输入"),
    P("EN", "EN", "in", "使能（门控）端，高电平透明", { clock: "pulse" }),
    P("Q", "Q", "out", "输出", { kind: "pushpull" }),
    P("QN", "\\overline{Q}", "out", "反相输出", { kind: "pushpull" }),
  ],
  initState: (p) => ({ q: initVal(p.init) }),
  evaluate: (c) => {
    const en = c.in("EN");
    const d = c.in("D");
    let q = c.state.q as L;
    if (en === 1) q = d;
    else if (en !== 0) q = merge(q, d);
    return { out: { Q: q, QN: not4(q) }, state: { q } };
  },
};

// ───────────────────────── 边沿触发器 ─────────────────────────

export type FFType = "D" | "JK" | "T" | "SR";

function initVal(v: unknown): L {
  return v === 0 || v === "0" ? 0 : v === 1 || v === "1" ? 1 : LX;
}

/** 特性方程（0/1 输入） */
export function characteristic(type: FFType, inp: Record<string, 0 | 1>, q: 0 | 1): 0 | 1 | "forbidden" {
  switch (type) {
    case "D":
      return inp.D;
    case "T":
      return (inp.T ^ q) as 0 | 1;
    case "JK":
      return ((inp.J & (q ^ 1)) | ((inp.K ^ 1) & q)) as 0 | 1;
    case "SR":
      if (inp.S && inp.R) return "forbidden";
      return (inp.S | ((inp.R ^ 1) & q)) as 0 | 1;
  }
}

const FF_INPUTS: Record<FFType, string[]> = { D: ["D"], JK: ["J", "K"], T: ["T"], SR: ["S", "R"] };
const FF_TITLE: Record<FFType, string> = { D: "D 触发器", JK: "JK 触发器", T: "T 触发器", SR: "SR 触发器（钟控）" };

function ffModel(t: FFType): ComponentModel {
  const ins = FF_INPUTS[t];
  return {
    type: `${t.toLowerCase()}ff`,
    title: FF_TITLE[t],
    category: "ff",
    sequential: true,
    description: `边沿触发${FF_TITLE[t]}。触发沿可选上升沿/下降沿；可选异步置 1 端 \\overline{S_D} 与异步置 0 端 \\overline{R_D}（低电平有效，未连接时视为无效）。`,
    defaultParams: { edge: "rising", init: "X" },
    tpd: DEFAULT_SEQ_TPD,
    timing: { clock: "CLK", data: ins, setup: 20, hold: 5 },
    pins: (p) => [
      ...ins.map((n) => P(n, n, "in", `${n} 输入（在有效时钟沿被采样）`)),
      P("CLK", p.edge === "falling" ? "CLK\\ (\\downarrow)" : "CLK\\ (\\uparrow)", "in", p.edge === "falling" ? "时钟，下降沿有效" : "时钟，上升沿有效", {
        clock: p.edge === "falling" ? "falling" : "rising",
        active: p.edge === "falling" ? "low" : "high",
      }),
      P("SD", "\\overline{S_D}", "in", "异步置 1，低电平有效（不受时钟控制）", { active: "low", optional: true }),
      P("RD", "\\overline{R_D}", "in", "异步置 0，低电平有效（不受时钟控制）", { active: "low", optional: true }),
      P("Q", "Q", "out", "输出", { kind: "pushpull" }),
      P("QN", "\\overline{Q}", "out", "反相输出", { kind: "pushpull" }),
    ],
    initState: (p) => ({ q: initVal(p.init) }),
    evaluate: (c) => {
      let q = c.state.q as L;
      const both = Boolean(c.state.both);
      const sd = c.connected("SD") ? c.in("SD") : 1;
      const rd = c.connected("RD") ? c.in("RD") : 1;
      // 异步端优先
      if (sd === 0 && rd === 0) {
        return { out: { Q: 1, QN: 1 }, state: { q: 1, both: true }, issue: { code: "forbidden-input", message: "异步置 1 与异步置 0 同时有效：Q 与 Q̄ 同为 1，撤销后状态不确定" } };
      }
      if (rd === 0 && sd === 1) return { out: { Q: 0, QN: 1 }, state: { q: 0 } };
      if (sd === 0 && rd === 1) return { out: { Q: 1, QN: 0 }, state: { q: 1 } };
      // 两端同时有效后同时撤销：状态不确定
      if (both && sd === 1 && rd === 1) q = LX;
      const falling = c.params.edge === "falling";
      const want = falling ? "fall" : "rise";
      const maybe = falling ? "xfall" : "xrise";
      const e = c.edge("CLK");
      let issue: EvalResult["issue"];
      if (e === want || e === maybe) {
        const inputs: Record<string, L> = { Q: q };
        ins.forEach((n) => (inputs[n] = c.in(n)));
        if (t === "SR" && inputs.S === 1 && inputs.R === 1)
          issue = { code: "forbidden-input", message: "钟控 SR 触发器在有效沿处 S=R=1，次态不确定" };
        const [next] = resolveX(inputs, [...ins, "Q"], (v) => {
          const r = characteristic(t, v as Record<string, 0 | 1>, v.Q as 0 | 1);
          return [r === "forbidden" ? LX : r];
        });
        q = e === maybe ? merge(q, next) : next;
      }
      if (!isKnown(sd) || !isKnown(rd)) {
        // 异步端未知：可能被强制，也可能按时钟沿正常更新——两种结果合并
        const forced: L = !isKnown(rd) && sd === 1 ? 0 : !isKnown(sd) && rd === 1 ? 1 : LX;
        q = merge(q, forced);
      }
      return { out: { Q: q, QN: not4(q) }, state: { q }, issue };
    },
  };
}

/** 主从 JK 触发器（脉冲触发）：CLK=1 期间主触发器接收输入（存在一次翻转），CLK 下降沿从触发器更新 */
const msJkModel: ComponentModel = {
  type: "jkff_ms",
  title: "主从 JK 触发器（脉冲触发）",
  category: "ff",
  sequential: true,
  description:
    "主从结构：CLK=1 时主触发器按 J、K 动作，从触发器保持；CLK 下降沿时从触发器复制主触发器。因主触发器的置位/复位被 Q 反馈门控，CLK=1 期间主触发器最多只能翻转一次（一次翻转现象）。它与边沿触发 JK 的行为不同。",
  defaultParams: { init: "X" },
  tpd: DEFAULT_SEQ_TPD,
  pins: () => [
    P("J", "J", "in", "J 输入（CLK=1 期间都起作用）"),
    P("K", "K", "in", "K 输入（CLK=1 期间都起作用）"),
    P("CLK", "CLK\\ (\\sqcap)", "in", "时钟，脉冲触发：高电平期间主触发器动作，下降沿输出", { clock: "pulse" }),
    P("Q", "Q", "out", "输出", { kind: "pushpull" }),
    P("QN", "\\overline{Q}", "out", "反相输出", { kind: "pushpull" }),
  ],
  initState: (p) => ({ m: initVal(p.init), s: initVal(p.init) }),
  evaluate: (c) => {
    let m = c.state.m as L;
    let s = c.state.s as L;
    const clk = c.in("CLK");
    const e = c.edge("CLK");
    if (e === "fall") s = m;
    else if (e === "xfall") s = merge(s, m);
    if (clk === 1) {
      const j = c.in("J");
      const k = c.in("K");
      // 主触发器：S_m = J·Q̄·CLK，R_m = K·Q·CLK（Q 为从触发器输出）
      const sm = and4([j, not4(s)]);
      const rm = and4([k, s]);
      if (sm === 1) m = 1;
      else if (rm === 1) m = 0;
      else {
        if (sm !== 0) m = merge(m, 1);
        if (rm !== 0) m = merge(m, 0);
      }
    }
    return { out: { Q: s, QN: not4(s) }, state: { m, s } };
  },
};

// ───────────────────────── 中规模器件 ─────────────────────────

const bits = (q: L[]) => q.reduce<number>((acc, b, i) => acc | ((b as number) << i), 0);
const toBits = (n: number, w: number): L[] => Array.from({ length: w }, (_, i) => ((n >> i) & 1) as L);
/** 4 位器件的初始状态：0～15 的整数，或 "X"（上电状态未知） */
const initBus = (v: unknown): L[] => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n < 16 ? toBits(n, 4) : [LX, LX, LX, LX];
};

/**
 * 74LS161 / 74LS163：4 位同步二进制加法计数器，上升沿触发。
 *  - 161：\overline{R_D}（CLR）**异步**清零；163：**同步**清零。
 *  - \overline{LD}（LOAD）同步并行置数，在 CLK 上升沿被采样，优先于计数使能。
 *  - EP、ET（ENP、ENT）同时为 1 才计数；C（RCO）= ET·Q3·Q2·Q1·Q0。
 * 依据：TI SN54/74LS161A–163A 数据手册的功能表（引脚名在 desc 中给出）。
 */
function counter16Model(type: "ls161" | "ls163"): ComponentModel {
  const syncClear = type === "ls163";
  const name = type === "ls161" ? "74LS161" : "74LS163";
  return {
    type,
    title: name,
    category: "msi",
    sequential: true,
    description: `${name}：4 位同步二进制计数器，${syncClear ? "同步" : "异步"}清零、同步置数、上升沿计数。`,
    defaultParams: { init: "X" },
    tpd: DEFAULT_SEQ_TPD,
    timing: {
      clock: "CLK",
      data: ["EP", "ET", "LD", "D0", "D1", "D2", "D3", ...(syncClear ? ["RD"] : [])],
      setup: 20,
      hold: 3,
      active: (inp) => ["EP", "ET", "LD", ...(syncClear ? ["RD"] : []), ...(inp("LD") !== 1 ? ["D0", "D1", "D2", "D3"] : [])],
    },
    pins: () => [
      P("RD", "\\overline{R_D}", "in", syncClear ? "清零端，低电平有效，同步（在 CLK 上升沿生效）" : "清零端，低电平有效，异步（立即生效，不需要时钟）", { active: "low", datasheet: "CLR" }),
      P("LD", "\\overline{LD}", "in", "同步置数端，低电平有效：CLK 上升沿时把 D3～D0 装入", { active: "low", datasheet: "LOAD" }),
      P("EP", "EP", "in", "计数使能（不影响进位输出）", { datasheet: "ENP" }),
      P("ET", "ET", "in", "计数使能（同时控制进位输出 C）", { datasheet: "ENT" }),
      P("CLK", "CLK\\ (\\uparrow)", "in", "时钟，上升沿有效", { clock: "rising", datasheet: "CLK" }),
      ...[0, 1, 2, 3].map((i) => P(`D${i}`, `D_${i}`, "in", `并行数据输入 D${i}（D0 为最低位）`, { datasheet: "ABCD"[i] })),
      ...[0, 1, 2, 3].map((i) => P(`Q${i}`, `Q_${i}`, "out", `输出 Q${i}（Q0 为最低位）`, { kind: "pushpull", datasheet: `Q${"ABCD"[i]}` })),
      P("C", "C", "out", "进位输出 C = ET·Q3Q2Q1Q0（计到 1111 且 ET=1 时为 1）", { kind: "pushpull", datasheet: "RCO" }),
    ],
    initState: (p) => ({ q: initBus(p.init) }),
    evaluate: (c) => {
      let q = (c.state.q as L[]).slice();
      const rd = c.in("RD");
      if (!syncClear) {
        if (rd === 0) q = [0, 0, 0, 0];
        else if (rd !== 1) q = q.map((b) => merge(b, 0));
      }
      const e = c.edge("CLK");
      if ((e === "rise" || e === "xrise") && (syncClear || rd !== 0)) {
        const inp: Record<string, L> = {
          RD: syncClear ? rd : 1,
          LD: c.in("LD"),
          EP: c.in("EP"),
          ET: c.in("ET"),
          D0: c.in("D0"), D1: c.in("D1"), D2: c.in("D2"), D3: c.in("D3"),
          Q0: q[0], Q1: q[1], Q2: q[2], Q3: q[3],
        };
        const next = resolveX(inp, Object.keys(inp), (v) => {
          if (v.RD === 0) return [0, 0, 0, 0];
          if (v.LD === 0) return [v.D0, v.D1, v.D2, v.D3];
          if (v.EP === 1 && v.ET === 1) return toBits((bits([v.Q0, v.Q1, v.Q2, v.Q3]) + 1) & 15, 4);
          return [v.Q0, v.Q1, v.Q2, v.Q3];
        });
        q = e === "xrise" ? q.map((b, i) => merge(b, next[i])) : next;
        if (!syncClear && rd !== 1) q = q.map((b) => merge(b, 0)); // 异步清零端未知
      }
      const co = and4([c.in("ET"), ...q]);
      return { out: { Q0: q[0], Q1: q[1], Q2: q[2], Q3: q[3], C: co }, state: { q } };
    },
  };
}

/** 74LS138：3 线-8 线译码器，输出低电平有效 */
const ls138Model: ComponentModel = {
  type: "ls138",
  title: "74LS138",
  category: "msi",
  sequential: false,
  description: "3 线-8 线译码器。S1=1 且 \\overline{S_2}=\\overline{S_3}=0 时工作，被选中的输出 \\overline{Y_i}=0（低电平有效），其余为 1。\\overline{Y_i} = \\overline{m_i}。",
  tpd: DEFAULT_GATE_TPD * 2,
  pins: () => [
    P("A0", "A_0", "in", "地址输入 A0（最低位）", { datasheet: "A" }),
    P("A1", "A_1", "in", "地址输入 A1", { datasheet: "B" }),
    P("A2", "A_2", "in", "地址输入 A2（最高位）", { datasheet: "C" }),
    P("S1", "S_1", "in", "使能端，高电平有效", { datasheet: "G1" }),
    P("S2", "\\overline{S_2}", "in", "使能端，低电平有效", { active: "low", datasheet: "G2A" }),
    P("S3", "\\overline{S_3}", "in", "使能端，低电平有效", { active: "low", datasheet: "G2B" }),
    ...Array.from({ length: 8 }, (_, i) =>
      P(`Y${i}`, `\\overline{Y_${i}}`, "out", `输出 \\overline{Y_${i}}，低电平有效：选中 m${i} 时为 0`, { active: "low", kind: "pushpull", datasheet: `Y${i}` }),
    ),
  ],
  evaluate: (c) => {
    const inp: Record<string, L> = { A0: c.in("A0"), A1: c.in("A1"), A2: c.in("A2"), S1: c.in("S1"), S2: c.in("S2"), S3: c.in("S3") };
    const ys = resolveX(inp, Object.keys(inp), (v) => {
      const en = v.S1 === 1 && v.S2 === 0 && v.S3 === 0;
      const code = (v.A2 as number) * 4 + (v.A1 as number) * 2 + (v.A0 as number);
      return Array.from({ length: 8 }, (_, i) => (en && i === code ? 0 : 1) as L);
    });
    const out: Record<string, L> = {};
    ys.forEach((y, i) => (out[`Y${i}`] = y));
    return { out };
  },
};

/** 74LS151：8 选 1 数据选择器 */
const ls151Model: ComponentModel = {
  type: "ls151",
  title: "74LS151",
  category: "msi",
  sequential: false,
  description: "8 选 1 数据选择器。\\overline{S}=0 时 Y = Σ m_i D_i（m_i 为 A2A1A0 的最小项），\\overline{W} = \\overline{Y}；\\overline{S}=1 时 Y=0。",
  tpd: DEFAULT_GATE_TPD * 2,
  pins: () => [
    ...Array.from({ length: 8 }, (_, i) => P(`D${i}`, `D_${i}`, "in", `数据输入 D${i}`, { datasheet: `D${i}` })),
    P("A0", "A_0", "in", "地址 A0（最低位）", { datasheet: "A" }),
    P("A1", "A_1", "in", "地址 A1", { datasheet: "B" }),
    P("A2", "A_2", "in", "地址 A2（最高位）", { datasheet: "C" }),
    P("S", "\\overline{S}", "in", "选通端，低电平有效", { active: "low", datasheet: "G" }),
    P("Y", "Y", "out", "输出", { kind: "pushpull", datasheet: "Y" }),
    P("W", "\\overline{W}", "out", "反相输出", { kind: "pushpull", active: "low", datasheet: "W" }),
  ],
  evaluate: (c) => {
    const inp: Record<string, L> = { S: c.in("S"), A0: c.in("A0"), A1: c.in("A1"), A2: c.in("A2") };
    for (let i = 0; i < 8; i++) inp[`D${i}`] = c.in(`D${i}`);
    const [y] = resolveX(inp, Object.keys(inp), (v) => {
      if (v.S === 1) return [0];
      const code = (v.A2 as number) * 4 + (v.A1 as number) * 2 + (v.A0 as number);
      return [v[`D${code}`]];
    });
    return { out: { Y: y, W: not4(y) } };
  },
};

/** 74LS194：4 位双向移位寄存器 */
const ls194Model: ComponentModel = {
  type: "ls194",
  title: "74LS194",
  category: "msi",
  sequential: true,
  description:
    "4 位双向移位寄存器，上升沿触发，\\overline{R_D} 异步清零。S1S0 = 00 保持，01 右移（Q0←D_SR，Q1←Q0…），10 左移（Q3←D_SL，Q2←Q3…），11 并行置数。",
  defaultParams: { init: "X" },
  tpd: DEFAULT_SEQ_TPD,
  timing: {
    clock: "CLK",
    data: ["S0", "S1", "DSR", "DSL", "D0", "D1", "D2", "D3"],
    setup: 20,
    hold: 0,
    active: (inp) => {
      const s1 = inp("S1");
      const s0 = inp("S0");
      const r = ["S0", "S1"];
      if (s1 !== 1 && s0 !== 0) r.push("DSR");
      if (s1 !== 0 && s0 !== 1) r.push("DSL");
      if (s1 !== 0 && s0 !== 0) r.push("D0", "D1", "D2", "D3");
      return r;
    },
  },
  pins: () => [
    P("RD", "\\overline{R_D}", "in", "异步清零，低电平有效", { active: "low", datasheet: "CLR" }),
    P("S1", "S_1", "in", "工作方式选择 S1", { datasheet: "S1" }),
    P("S0", "S_0", "in", "工作方式选择 S0", { datasheet: "S0" }),
    P("DSR", "D_{SR}", "in", "右移串行输入（移入 Q0）", { datasheet: "SR SER" }),
    P("DSL", "D_{SL}", "in", "左移串行输入（移入 Q3）", { datasheet: "SL SER" }),
    P("CLK", "CLK\\ (\\uparrow)", "in", "时钟，上升沿有效", { clock: "rising" }),
    ...[0, 1, 2, 3].map((i) => P(`D${i}`, `D_${i}`, "in", `并行输入 D${i}`, { datasheet: "ABCD"[i] })),
    ...[0, 1, 2, 3].map((i) => P(`Q${i}`, `Q_${i}`, "out", `输出 Q${i}`, { kind: "pushpull", datasheet: `Q${"ABCD"[i]}` })),
  ],
  initState: (p) => ({ q: initBus(p.init) }),
  evaluate: (c) => {
    let q = (c.state.q as L[]).slice();
    const rd = c.in("RD");
    if (rd === 0) q = [0, 0, 0, 0];
    else if (rd !== 1) q = q.map((b) => merge(b, 0));
    const e = c.edge("CLK");
    if ((e === "rise" || e === "xrise") && rd !== 0) {
      const inp: Record<string, L> = {
        S0: c.in("S0"), S1: c.in("S1"), DSR: c.in("DSR"), DSL: c.in("DSL"),
        D0: c.in("D0"), D1: c.in("D1"), D2: c.in("D2"), D3: c.in("D3"),
        Q0: q[0], Q1: q[1], Q2: q[2], Q3: q[3],
      };
      const next = resolveX(inp, Object.keys(inp), (v) => {
        const mode = (v.S1 as number) * 2 + (v.S0 as number);
        if (mode === 0) return [v.Q0, v.Q1, v.Q2, v.Q3];
        if (mode === 1) return [v.DSR, v.Q0, v.Q1, v.Q2];
        if (mode === 2) return [v.Q1, v.Q2, v.Q3, v.DSL];
        return [v.D0, v.D1, v.D2, v.D3];
      });
      q = e === "xrise" || rd !== 1 ? q.map((b, i) => merge(b, next[i])) : next;
    }
    return { out: { Q0: q[0], Q1: q[1], Q2: q[2], Q3: q[3] }, state: { q } };
  },
};

const hexDisplayModel: ComponentModel = {
  type: "hexdisplay",
  title: "十六进制数码管",
  category: "io",
  sequential: false,
  description: "带译码的数码管：显示 D3D2D1D0 对应的 0～F；有 X/Z 输入时显示 “-”。",
  pins: () => [0, 1, 2, 3].map((i) => P(`D${i}`, `D_${i}`, "in", `BCD/二进制输入 D${i}`)),
  evaluate: () => ({ out: {} }),
};

const seg7Model: ComponentModel = {
  type: "seg7",
  title: "七段数码管（共阴）",
  category: "io",
  sequential: false,
  description: "共阴极七段数码管：段输入为 1 时点亮。",
  pins: () => SEG_NAMES.map((s) => P(s, s, "in", `段 ${s}`)),
  evaluate: () => ({ out: {} }),
};

export const MODELS: Record<string, ComponentModel> = Object.fromEntries(
  [
    sourceModel("switch", "输入开关", "拨动开关：点击切换 0/1。"),
    sourceModel("button", "按键", "按下为 1，松开为 0（可设置为低电平有效）。"),
    sourceModel("const0", "常量 0", "接地（逻辑 0）。", 0),
    sourceModel("const1", "常量 1", "接 V_CC（逻辑 1）。", 1),
    clockModel,
    sinkModel("led", "LED", "高电平点亮；X 显示为红色闪烁，Z 显示为空心。"),
    sinkModel("probe", "逻辑探针", "显示所在网络的四值逻辑状态。"),
    hexDisplayModel,
    seg7Model,
    gateModel("and"),
    gateModel("or"),
    gateModel("nand"),
    gateModel("nor"),
    gateModel("xor"),
    gateModel("xnor"),
    notModel,
    bufModel,
    triBufModel,
    pullupModel,
    srLatchModel,
    dLatchModel,
    ffModel("D"),
    ffModel("JK"),
    ffModel("T"),
    ffModel("SR"),
    msJkModel,
    counter16Model("ls161"),
    counter16Model("ls163"),
    ls138Model,
    ls151Model,
    ls194Model,
  ].map((m) => [m.type, m]),
);

export function getModel(type: string): ComponentModel | undefined {
  return MODELS[type];
}

export function pinsOf(type: string, params: Params = {}): PinDef[] {
  const m = MODELS[type];
  if (!m) return [];
  return m.pins({ ...(m.defaultParams ?? {}), ...params });
}
