import type { ComponentInstance, Net, Netlist } from "@/lib/sim/types";

/**
 * 实验 A：同步三位二进制加法计数器（三个 JK 触发器，默认下降沿触发）。
 * 默认驱动方程：J0=K0=1，J1=K1=Q0，J2=K2=Q0·Q1；进位 C=Q0·Q1·Q2。
 *
 * 用户可以把每个 J/K 端改接到"受支持的信号"：常量 0/1、某个 Qi 或 \overline{Q_i}、两个字面量的乘积。
 * 网表由本函数重新生成，方程由 lib/fsm/extract 从网表自动提取——页面上的方程不是写死的。
 */
export type DriveSource = string; // "1" | "0" | "Q0" | "Q0'" | "Q0Q1" | "Q0'Q1" ...

export interface JKCounterConfig {
  drives: Record<"J0" | "K0" | "J1" | "K1" | "J2" | "K2", DriveSource>;
  edge: "rising" | "falling";
  init: number; // 初始状态 Q2Q1Q0
}

export const DEFAULT_JK_CONFIG: JKCounterConfig = {
  drives: { J0: "1", K0: "1", J1: "Q0", K1: "Q0", J2: "Q0Q1", K2: "Q0Q1" },
  edge: "falling",
  init: 0,
};

export const DRIVE_OPTIONS: { value: DriveSource; latex: string }[] = [
  { value: "1", latex: "1" },
  { value: "0", latex: "0" },
  ...[0, 1, 2].flatMap((i) => [
    { value: `Q${i}`, latex: `Q_${i}` },
    { value: `Q${i}'`, latex: `\\overline{Q_${i}}` },
  ]),
  ...[
    [0, 1],
    [0, 2],
    [1, 2],
  ].flatMap(([a, b]) => [
    { value: `Q${a}Q${b}`, latex: `Q_${a}Q_${b}` },
    { value: `Q${a}'Q${b}'`, latex: `\\overline{Q_${a}}\\,\\overline{Q_${b}}` },
    { value: `Q${a}Q${b}'`, latex: `Q_${a}\\overline{Q_${b}}` },
    { value: `Q${a}'Q${b}`, latex: `\\overline{Q_${a}}Q_${b}` },
  ]),
];

/** 解析驱动源为字面量列表 */
function literals(src: DriveSource): { q: number; neg: boolean }[] | "0" | "1" {
  if (src === "0" || src === "1") return src;
  const lits = [...src.matchAll(/Q(\d)('?)/g)].map((m) => ({ q: Number(m[1]), neg: m[2] === "'" }));
  if (!lits.length) throw new Error(`无法识别的驱动源 ${src}`);
  return lits;
}

// 版图坐标（与 components/circuit 的元件尺寸配合）
const FF_X = [250, 470, 690];
const FF_Y = 150;

export function buildJKCounter(cfg: JKCounterConfig): Netlist {
  const comps: ComponentInstance[] = [
    { id: "CLK", type: "clock", label: "CP", params: { period: 100 }, x: 30, y: 330 },
    { id: "VCC", type: "const1", label: "1", x: 40, y: 60 },
    { id: "GND", type: "const0", label: "0", x: 40, y: 20 },
  ];
  const nets: Net[] = [];
  const endpoints = new Map<string, [string, string][]>();
  const add = (net: string, comp: string, pin: string) => endpoints.set(net, [...(endpoints.get(net) ?? []), [comp, pin]]);
  add("VCC", "VCC", "Y");
  add("GND", "GND", "Y");
  add("CLK", "CLK", "CLK");
  [0, 1, 2].forEach((i) => {
    comps.push({
      id: `FF${i}`,
      type: "jkff",
      label: `FF${i}`,
      params: { edge: cfg.edge, init: (cfg.init >> i) & 1 },
      x: FF_X[i],
      y: FF_Y,
    });
    add("CLK", `FF${i}`, "CLK");
    add(`Q${i}`, `FF${i}`, "Q");
    add(`QN${i}`, `FF${i}`, "QN");
    comps.push({ id: `P${i}`, type: "probe", label: `Q${i}`, x: FF_X[i] + 120, y: 40 });
    add(`Q${i}`, `P${i}`, "A");
  });
  // 乘积项门（相同的乘积项共用一个门）
  const gates = new Map<string, string>();
  let gi = 0;
  const netFor = (src: DriveSource, near: number): string => {
    const lits = literals(src);
    if (lits === "1") return "VCC";
    if (lits === "0") return "GND";
    const litNet = (l: { q: number; neg: boolean }) => (l.neg ? `QN${l.q}` : `Q${l.q}`);
    if (lits.length === 1) return litNet(lits[0]);
    const key = lits.map((l) => `${l.q}${l.neg ? "'" : ""}`).join("");
    const existing = gates.get(key);
    if (existing) return existing;
    gi++;
    const id = `G${gi}`;
    comps.push({ id, type: "and", label: id, params: { inputs: lits.length }, x: FF_X[near] - 100, y: 255 + (gi - 1) * 70 });
    lits.forEach((l, i) => add(litNet(l), id, `I${i}`));
    const out = `N_${id}`;
    add(out, id, "Y");
    gates.set(key, out);
    return out;
  };
  [0, 1, 2].forEach((i) => {
    add(netFor(cfg.drives[`J${i}` as "J0"], i), `FF${i}`, "J");
    add(netFor(cfg.drives[`K${i}` as "K0"], i), `FF${i}`, "K");
  });
  // 进位输出 C = Q0Q1Q2
  comps.push({ id: "GC", type: "and", label: "G_C", params: { inputs: 3 }, x: 860, y: 330 });
  [0, 1, 2].forEach((i) => add(`Q${i}`, "GC", `I${i}`));
  add("C", "GC", "Y");
  comps.push({ id: "LC", type: "led", label: "C", x: 960, y: 340 });
  add("C", "LC", "A");
  for (const [name, eps] of endpoints) {
    if (eps.length < 2 && name !== "VCC" && name !== "GND") continue;
    nets.push({ id: name, name, endpoints: eps.map(([comp, pin]) => ({ comp, pin })) });
  }
  // 未使用的常量源不放进电路图
  const used = new Set(nets.flatMap((n) => (n.endpoints.length > 1 ? n.endpoints.map((e) => e.comp) : [])));
  const finalComps = comps.filter((c) => !(c.type === "const0" || c.type === "const1") || used.has(c.id));
  const finalNets = nets.filter((n) => n.endpoints.length > 1);
  return {
    version: 1,
    name: "同步三位二进制加法计数器（JK）",
    description: "三个 JK 触发器共用时钟 CP，构成同步电路。",
    components: finalComps,
    nets: finalNets,
  };
}
