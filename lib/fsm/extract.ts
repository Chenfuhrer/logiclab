import { type Expr, and, not, or, v, xor, xnor, C0, C1 } from "../logic/ast";
import { getModel } from "../sim/models";
import type { Netlist } from "../sim/types";
import { FF_PINS, type FFSpec, type SyncCircuit } from "./analyze";

/**
 * 从网表自动提取同步时序电路的符号描述（驱动方程、输出方程）。
 *
 * 支持范围（超出范围时返回 ok:false，并说明原因——绝不猜测方程）：
 *  - 存储元件：边沿触发 D / JK / T / SR 触发器，全部接同一个时钟源（同步电路），触发沿一致；
 *  - 组合元件：与、或、与非、或非、异或、同或、非、缓冲门（推挽输出），不含组合反馈；
 *  - 外部输入：开关、按键；常量 0 / 1；
 *  - 输出：接到 LED / 探针的组合逻辑网络；
 *  - 触发器的异步置位/复位端必须未连接或接常量 1（无效）。
 */
export type ExtractResult = { ok: true; circuit: SyncCircuit; clockComp: string } | { ok: false; reason: string };

const SUPPORTED_FF = new Set(["dff", "jkff", "tff", "srff"]);
const SUPPORTED_GATES = new Set(["and", "or", "nand", "nor", "xor", "xnor", "not", "buf"]);
const IGNORABLE = new Set(["led", "probe", "hexdisplay", "seg7", "clock", "switch", "button", "const0", "const1"]);

export function extractSyncCircuit(nl: Netlist): ExtractResult {
  const comps = new Map(nl.components.map((c) => [c.id, c]));
  // 引脚 → 网络
  const pinNet = new Map<string, string>();
  const netDrivers = new Map<string, { comp: string; pin: string }[]>();
  const netName = new Map<string, string>();
  for (const net of nl.nets) {
    netName.set(net.id, net.name ?? net.id);
    for (const ep of net.endpoints) {
      pinNet.set(`${ep.comp}.${ep.pin}`, net.id);
      const comp = comps.get(ep.comp);
      if (!comp) continue;
      const model = getModel(comp.type);
      const pin = model?.pins({ ...(model.defaultParams ?? {}), ...(comp.params ?? {}) }).find((p) => p.name === ep.pin);
      if (pin?.dir === "out") {
        const l = netDrivers.get(net.id) ?? [];
        l.push({ comp: ep.comp, pin: ep.pin });
        netDrivers.set(net.id, l);
      }
    }
  }
  for (const c of nl.components) {
    if (!SUPPORTED_FF.has(c.type) && !SUPPORTED_GATES.has(c.type) && !IGNORABLE.has(c.type)) {
      const m = getModel(c.type);
      return { ok: false, reason: `当前电路不支持自动符号分析：含有 ${m?.title ?? c.type}（${c.label ?? c.id}）。仿真仍可正常进行。` };
    }
    if (SUPPORTED_GATES.has(c.type) && c.params?.oc) return { ok: false, reason: `当前电路不支持自动符号分析：${c.label ?? c.id} 为 OC 输出（线与需要电气条件）。` };
  }
  const ffComps = nl.components.filter((c) => SUPPORTED_FF.has(c.type));
  if (ffComps.length === 0) return { ok: false, reason: "电路中没有触发器，不是时序电路。" };

  // 同步性检查
  let clockComp: string | null = null;
  let edge: "rising" | "falling" | null = null;
  for (const ff of ffComps) {
    const netId = pinNet.get(`${ff.id}.CLK`);
    if (!netId) return { ok: false, reason: `${ff.label ?? ff.id} 的 CLK 未连接。` };
    const drv = netDrivers.get(netId) ?? [];
    if (drv.length !== 1 || comps.get(drv[0].comp)?.type !== "clock")
      return { ok: false, reason: `${ff.label ?? ff.id} 的时钟不是直接来自时钟源——这是异步时序电路，需要逐个分析各触发器的时钟条件，当前不支持自动符号分析。` };
    if (clockComp && clockComp !== drv[0].comp) return { ok: false, reason: "触发器使用了不同的时钟源，不是同步电路。" };
    clockComp = drv[0].comp;
    const e = (ff.params?.edge ?? "rising") as "rising" | "falling";
    if (edge && e !== edge) return { ok: false, reason: "触发器的触发沿不一致（有上升沿也有下降沿），不按同步电路分析。" };
    edge = e;
    for (const asyncPin of ["SD", "RD"]) {
      const an = pinNet.get(`${ff.id}.${asyncPin}`);
      if (!an) continue;
      const d = netDrivers.get(an) ?? [];
      if (!(d.length === 1 && comps.get(d[0].comp)?.type === "const1"))
        return { ok: false, reason: `${ff.label ?? ff.id} 的异步端 ${asyncPin === "SD" ? "S̄D" : "R̄D"} 被使用，存在异步置位/复位，不做同步符号分析。` };
    }
  }

  // 状态变量名：Q 输出网络的名字，否则 Q{i}
  const stateName = new Map<string, string>();
  ffComps.forEach((ff, i) => {
    const qn = pinNet.get(`${ff.id}.Q`);
    stateName.set(ff.id, (ff.params?.state as string) ?? (qn ? netName.get(qn) : undefined) ?? `Q${i}`);
  });

  const inputs = new Set<string>();
  const visiting = new Set<string>();
  const cache = new Map<string, Expr>();
  const traceNet = (netId: string | undefined, where: string): Expr => {
    if (!netId) throw new Error(`${where} 悬空（未连接），无法确定驱动方程。`);
    const cached = cache.get(netId);
    if (cached) return cached;
    const drv = netDrivers.get(netId) ?? [];
    if (drv.length === 0) throw new Error(`网络 ${netName.get(netId)} 没有驱动源（${where} 悬空）。`);
    if (drv.length > 1) throw new Error(`网络 ${netName.get(netId)} 有多个驱动源。`);
    const { comp: cid, pin } = drv[0];
    const c = comps.get(cid)!;
    if (visiting.has(cid)) throw new Error(`检测到组合反馈环（经过 ${c.label ?? cid}），不做符号分析。`);
    let e: Expr;
    switch (c.type) {
      case "const0":
        e = C0;
        break;
      case "const1":
        e = C1;
        break;
      case "switch":
      case "button": {
        const name = netName.get(netId)!;
        inputs.add(name);
        e = v(name);
        break;
      }
      case "clock":
        throw new Error("时钟信号被用作组合逻辑输入，不做同步符号分析。");
      default:
        if (SUPPORTED_FF.has(c.type)) {
          const s = stateName.get(cid)!;
          e = pin === "QN" ? not(v(s)) : v(s);
          break;
        }
        if (SUPPORTED_GATES.has(c.type)) {
          visiting.add(cid);
          const n = Math.max(2, Number(c.params?.inputs ?? 2));
          const ins =
            c.type === "not" || c.type === "buf"
              ? [traceNet(pinNet.get(`${cid}.A`), `${c.label ?? cid}.A`)]
              : Array.from({ length: n }, (_, i) => traceNet(pinNet.get(`${cid}.I${i}`), `${c.label ?? cid} 的输入 ${i}`));
          visiting.delete(cid);
          switch (c.type) {
            case "and": e = and(...ins); break;
            case "or": e = or(...ins); break;
            case "nand": e = not(and(...ins)); break;
            case "nor": e = not(or(...ins)); break;
            case "xor": e = ins.slice(1).reduce((a, b) => xor(a, b), ins[0]); break;
            case "xnor": e = not(ins.slice(1).reduce((a, b) => xor(a, b), ins[0])); break;
            case "not": e = not(ins[0]); break;
            default: e = ins[0];
          }
          if (c.type === "xnor" && n === 2) e = xnor(ins[0], ins[1]);
          break;
        }
        throw new Error(`${c.label ?? cid} 不在可分析元件范围内。`);
    }
    cache.set(netId, e);
    return e;
  };

  try {
    // 按状态变量名从高位到低位排序（Q2, Q1, Q0）
    const ordered = [...ffComps].sort((a, b) => stateName.get(b.id)!.localeCompare(stateName.get(a.id)!, "en", { numeric: true }));
    const ffs: FFSpec[] = ordered.map((ff) => {
      const type = ({ dff: "D", jkff: "JK", tff: "T", srff: "SR" } as const)[ff.type as "dff"];
      const spec: FFSpec = { name: stateName.get(ff.id)!, type, edge: edge!, inputs: {} };
      for (const p of FF_PINS[type]) spec.inputs[p] = traceNet(pinNet.get(`${ff.id}.${p}`), `${ff.label ?? ff.id}.${p}`);
      return spec;
    });
    const outputs: { name: string; expr: Expr }[] = [];
    const stateNets = new Set(ffComps.map((ff) => pinNet.get(`${ff.id}.Q`)));
    for (const c of nl.components) {
      if (c.type !== "led" && c.type !== "probe") continue;
      const netId = pinNet.get(`${c.id}.A`);
      if (!netId || stateNets.has(netId)) continue;
      const drv = netDrivers.get(netId) ?? [];
      if (drv.length !== 1 || !SUPPORTED_GATES.has(comps.get(drv[0].comp)!.type)) continue;
      const name = netName.get(netId)!;
      if (outputs.some((o) => o.name === name)) continue;
      outputs.push({ name, expr: traceNet(netId, `${c.label ?? c.id}`) });
    }
    return { ok: true, circuit: { inputs: [...inputs].sort(), ffs, outputs }, clockComp: clockComp! };
  } catch (e) {
    return { ok: false, reason: `当前电路不支持自动符号分析：${(e as Error).message}` };
  }
}
