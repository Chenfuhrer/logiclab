import { asInput } from "./logic4";
import { type ComponentModel, type Edge, type EvalCtx, getModel, type Params } from "./models";
import {
  DEFAULT_SIM_OPTIONS,
  type L,
  LX,
  LZ,
  type Netlist,
  type OutKind,
  type PinDef,
  type SimIssue,
  type SimOptions,
  type TracePoint,
} from "./types";

/**
 * 事件驱动仿真引擎（模型 A/B/C 共用）。
 *
 * 时间推进：时间 t（ns）+ delta 周期。
 *  - 每个 delta：先把本 delta 的全部驱动更新**统一提交**到网络，再让受影响的元件**用提交后的值**求值；
 *    元件输出最早在下一个 delta 才生效。
 *  - 因此，同一时钟沿触发的所有触发器都在同一个 delta 采样，采样到的是沿到来前的状态，
 *    任何一个触发器的新状态都不可能影响同一沿内其他触发器的采样——这就是"两阶段更新"。
 *  - 模型 A/B（ideal）：所有延迟为 0，同一时刻内按 delta 先后表示事件顺序（例如 74LS161 异步清零的瞬态）。
 *  - 模型 C（delay）：输出按元件 tpd 延迟，采用传输延迟（transport delay），不吞脉冲。
 *  - 网络第一次被赋值（从未初始化的 X 变为确定值）不算跳变，以免把上电初始化误判为时钟沿。
 */

interface Driver {
  comp: number;
  pin: string;
  kind: OutKind;
  net: number;
  value: L;
  projected: L;
}

interface NetRT {
  id: string;
  name: string;
  value: L;
  inited: boolean;
  drivers: number[];
  readers: { comp: number; pin: string }[];
  trace: TracePoint[];
  lastChange: number;
}

interface CompRT {
  id: string;
  label: string;
  type: string;
  model: ComponentModel;
  params: Params;
  pins: PinDef[];
  pinNet: Map<string, number>;
  outDriver: Map<string, number>;
  state: Record<string, unknown>;
  lastEdge: number;
}

const MAX_TRACE = 20_000;

export class Simulator {
  readonly options: SimOptions;
  readonly issues: SimIssue[] = [];
  time = 0;
  /** 发生严重运行错误（反馈不收敛、事件超限）后停止 */
  halted = false;
  /** 已处理的有效时钟单步次数 */
  steps = 0;

  private comps: CompRT[] = [];
  private nets: NetRT[] = [];
  private drivers: Driver[] = [];
  private compIndex = new Map<string, number>();
  private netIndex = new Map<string, number>();
  private queue = new Map<number, { d: number; v: L }[]>();
  private times: number[] = [];
  private nextDelta: { d: number; v: L }[] | null = null;
  private edges = new Map<number, L>();
  private eventCount = 0;
  private violationFlag = false;

  constructor(
    readonly netlist: Netlist,
    opts: Partial<SimOptions> = {},
  ) {
    this.options = { ...DEFAULT_SIM_OPTIONS, ...opts };
    this.compile();
    this.initialize();
  }

  // ───────────────────────── 编译与静态检查 ─────────────────────────

  private compile() {
    const nl = this.netlist;
    nl.components.forEach((inst) => {
      const model = getModel(inst.type);
      if (!model) {
        this.issue({ level: "error", code: "unknown-type", message: `不支持的元件类型 "${inst.type}"（${inst.id}）`, comps: [inst.id] });
        return;
      }
      const params = { ...(model.defaultParams ?? {}), ...(inst.params ?? {}) };
      const idx = this.comps.length;
      this.compIndex.set(inst.id, idx);
      this.comps.push({
        id: inst.id,
        label: inst.label ?? inst.id,
        type: inst.type,
        model,
        params,
        pins: model.pins(params),
        pinNet: new Map(),
        outDriver: new Map(),
        state: model.initState ? model.initState(params) : {},
        lastEdge: -Infinity,
      });
    });
    nl.nets.forEach((net) => {
      const idx = this.nets.length;
      this.netIndex.set(net.id, idx);
      if (net.name) this.netIndex.set(net.name, idx);
      const rt: NetRT = { id: net.id, name: net.name ?? net.id, value: LX, inited: false, drivers: [], readers: [], trace: [], lastChange: -Infinity };
      this.nets.push(rt);
      for (const ep of net.endpoints) {
        const ci = this.compIndex.get(ep.comp);
        if (ci === undefined) continue;
        const comp = this.comps[ci];
        const pin = comp.pins.find((p) => p.name === ep.pin);
        if (!pin) {
          this.issue({ level: "error", code: "unknown-pin", message: `${comp.label} 没有引脚 ${ep.pin}`, comps: [comp.id] });
          continue;
        }
        if (comp.pinNet.has(pin.name) && comp.pinNet.get(pin.name) !== idx) {
          this.issue({ level: "error", code: "multi-net-pin", message: `${comp.label}.${pin.name} 同时连接到多个网络`, comps: [comp.id] });
          continue;
        }
        comp.pinNet.set(pin.name, idx);
        if (pin.dir === "out") {
          const di = this.drivers.length;
          this.drivers.push({ comp: ci, pin: pin.name, kind: pin.kind ?? "pushpull", net: idx, value: LZ, projected: LZ });
          comp.outDriver.set(pin.name, di);
          rt.drivers.push(di);
        } else {
          rt.readers.push({ comp: ci, pin: pin.name });
        }
      }
    });
    // 网络驱动检查
    this.nets.forEach((net, ni) => {
      const kinds = net.drivers.map((d) => this.drivers[d].kind);
      const pp = kinds.filter((k) => k === "pushpull").length;
      const tri = kinds.filter((k) => k === "tristate").length;
      const oc = kinds.filter((k) => k === "opencollector").length;
      const pull = kinds.filter((k) => k === "pull").length;
      const who = net.drivers.map((d) => this.comps[this.drivers[d].comp].id);
      if (pp > 1)
        this.issue({ level: "error", code: "pushpull-conflict", message: `网络 ${net.name} 上有 ${pp} 个普通推挽输出直接相连。推挽输出不能并联：输出不同电平时会形成低阻通路，可能损坏器件。`, net: net.name, comps: who });
      if (pp >= 1 && tri + oc > 0)
        this.issue({ level: "error", code: "mixed-drivers", message: `网络 ${net.name} 上推挽输出与三态/OC 输出混接`, net: net.name, comps: who });
      if (tri > 0 && oc > 0)
        this.issue({ level: "error", code: "mixed-drivers", message: `网络 ${net.name} 上三态输出与 OC 输出混接`, net: net.name, comps: who });
      if (oc > 0 && pull === 0)
        this.issue({ level: "warning", code: "no-pullup", message: `网络 ${net.name} 由 OC/OD 输出驱动但没有上拉电阻：输出“1”时实际为高阻，无法得到高电平。`, net: net.name, comps: who });
      if (net.drivers.length === 0 && net.readers.length > 0) {
        const nonOptional = net.readers.filter((r) => !this.comps[r.comp].pins.find((p) => p.name === r.pin)?.optional);
        if (nonOptional.length)
          this.issue({
            level: "warning",
            code: "floating-input",
            message: `网络 ${net.name} 没有驱动源（输入悬空）。逻辑模型按 ${this.options.floating === "TTL" ? "TTL 悬空≈高电平" : "X（未知）"} 处理。`,
            net: net.name,
          });
      }
      void ni;
    });
    // 未连接的非可选输入引脚
    this.comps.forEach((c) => {
      const floating = c.pins.filter((p) => p.dir === "in" && !p.optional && !c.pinNet.has(p.name));
      if (floating.length && !c.model.source)
        this.issue({
          level: "warning",
          code: "floating-input",
          message: `${c.label} 的输入 ${floating.map((p) => p.name).join("、")} 未连接（悬空），按 ${this.options.floating === "TTL" ? "高电平" : "X"} 处理`,
          comps: [c.id],
        });
    });
    this.detectCombLoops();
  }

  /** Tarjan 强连通分量：只在组合元件之间找环 */
  private detectCombLoops() {
    const n = this.comps.length;
    const adj: number[][] = Array.from({ length: n }, () => []);
    this.comps.forEach((c, ci) => {
      if (c.model.sequential) return;
      for (const [, di] of c.outDriver) {
        const net = this.nets[this.drivers[di].net];
        for (const r of net.readers) if (!this.comps[r.comp].model.sequential) adj[ci].push(r.comp);
      }
    });
    let index = 0;
    const idx = new Array(n).fill(-1);
    const low = new Array(n).fill(0);
    const onStack = new Array(n).fill(false);
    const stack: number[] = [];
    const sccs: number[][] = [];
    const strong = (v: number) => {
      idx[v] = low[v] = index++;
      stack.push(v);
      onStack[v] = true;
      for (const w of adj[v]) {
        if (idx[w] === -1) {
          strong(w);
          low[v] = Math.min(low[v], low[w]);
        } else if (onStack[w]) low[v] = Math.min(low[v], idx[w]);
      }
      if (low[v] === idx[v]) {
        const comp: number[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          onStack[w] = false;
          comp.push(w);
        } while (w !== v);
        if (comp.length > 1 || adj[v].includes(v)) sccs.push(comp);
      }
    };
    for (let v = 0; v < n; v++) if (idx[v] === -1 && !this.comps[v].model.sequential) strong(v);
    for (const s of sccs) {
      const labels = s.map((i) => this.comps[i].label);
      this.issue({
        level: "warning",
        code: "comb-loop",
        message: `检测到无存储元件的组合反馈环：${labels.join(" → ")}。零延迟模型下按 delta 周期迭代求解：收敛则接受稳定解（例如门电路构成的锁存器），超过 ${this.options.maxDelta} 次仍不收敛则判定为振荡并停止。`,
        comps: s.map((i) => this.comps[i].id),
      });
    }
  }

  private issue(i: SimIssue) {
    if (this.issues.length > 300) return;
    // 同类运行时问题去重（同网络/同元件只报一次）
    if (i.code === "bus-conflict" || i.code === "forbidden-input" || i.code === "setup-violation" || i.code === "hold-violation") {
      const n = this.issues.filter((x) => x.code === i.code && x.net === i.net && x.comps?.[0] === i.comps?.[0]).length;
      if (n >= 3) return;
    }
    this.issues.push(i);
  }

  get compileErrors(): SimIssue[] {
    return this.issues.filter((i) => i.level === "error" && ["pushpull-conflict", "mixed-drivers", "unknown-type", "unknown-pin", "multi-net-pin"].includes(i.code));
  }

  // ───────────────────────── 初始化 ─────────────────────────

  /**
   * 上电初始化（零延迟完成，不计入波形）：
   *  1. 存储元件保持初始状态，只把状态送到输出；组合网络据此稳定下来；
   *  2. 再让存储元件按已稳定的输入（例如异步清零端）正常求值一次。
   * 这样可以避免"所有网络起初都是未初始化的 X"把触发器的初始状态冲掉。
   */
  private initializing = false;
  private initialize() {
    this.initializing = true;
    this.comps.forEach((_, ci) => this.evalComp(ci));
    this.flushTime(0);
    this.initializing = false;
    this.comps.forEach((c, ci) => c.model.sequential && this.evalComp(ci));
    this.flushTime(0);
    this.clearTraces();
  }

  private idleOutputs(c: CompRT): Record<string, L> {
    const st = c.state as { q?: L | L[]; s?: L };
    if (Array.isArray(st.q)) return Object.fromEntries(st.q.map((b, i) => [`Q${i}`, b]));
    const q = st.s !== undefined ? st.s : st.q;
    if (q === undefined) return {};
    return { Q: q, QN: q === 0 ? 1 : q === 1 ? 0 : LX };
  }

  // ───────────────────────── 事件处理 ─────────────────────────

  private delayOf(c: CompRT): number {
    if (this.options.model === "ideal" || this.initializing) return 0;
    const p = c.params.tpd;
    return typeof p === "number" ? p : (c.model.tpd ?? 0);
  }

  private schedule(d: number, v: L, delay: number) {
    if (delay <= 0) {
      if (this.nextDelta) this.nextDelta.push({ d, v });
      else this.enqueue(this.time, d, v);
      return;
    }
    this.enqueue(this.time + delay, d, v);
  }

  private enqueue(t: number, d: number, v: L) {
    let list = this.queue.get(t);
    if (!list) {
      list = [];
      this.queue.set(t, list);
      // 有序插入
      let lo = 0;
      let hi = this.times.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.times[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      this.times.splice(lo, 0, t);
    }
    list.push({ d, v });
  }

  private resolveNet(ni: number): L {
    const net = this.nets[ni];
    let pull = false;
    let has0 = false;
    let has1 = false;
    let hasX = false;
    for (const di of net.drivers) {
      const dr = this.drivers[di];
      if (dr.kind === "pull") {
        pull = true;
        continue;
      }
      const v = dr.value;
      if (v === LZ) continue;
      if (v === 0) has0 = true;
      else if (v === 1) has1 = true;
      else hasX = true;
    }
    if (!has0 && !has1 && !hasX) return pull ? 1 : LZ;
    if (has0 && has1) {
      this.issue({ level: "error", code: "bus-conflict", message: `t=${this.time} ns：网络 ${net.name} 上多个被使能的输出驱动相反电平（总线冲突），取值记为 X`, net: net.name, time: this.time });
      return LX;
    }
    if (hasX) return LX;
    return has1 ? 1 : 0;
  }

  /** 处理时刻 t 的全部 delta 周期 */
  private flushTime(t: number) {
    this.time = t;
    let batch = this.queue.get(t) ?? [];
    this.queue.delete(t);
    const ti = this.times.indexOf(t);
    if (ti >= 0) this.times.splice(ti, 1);
    let delta = 0;
    while (batch.length && !this.halted) {
      if (delta > this.options.maxDelta) {
        this.halted = true;
        this.issue({
          level: "error",
          code: "no-converge",
          message: `t=${t} ns：同一时刻内经过 ${this.options.maxDelta} 个 delta 周期仍未稳定。零延迟模型下组合反馈不收敛（振荡），仿真已停止。可切换到带延迟模型（模型 C）观察振荡波形。`,
          time: t,
        });
        break;
      }
      this.eventCount += batch.length;
      if (this.eventCount > this.options.maxEvents) {
        this.halted = true;
        this.issue({ level: "error", code: "event-limit", message: `事件数超过上限 ${this.options.maxEvents}，仿真停止（可能是振荡电路或仿真时间过长）。`, time: t });
        break;
      }
      // 阶段一：统一提交驱动值
      const dirty = new Set<number>();
      for (const ev of batch) {
        this.drivers[ev.d].value = ev.v;
        dirty.add(this.drivers[ev.d].net);
      }
      this.edges = new Map();
      for (const ni of dirty) {
        const net = this.nets[ni];
        const nv = this.resolveNet(ni);
        if (nv !== net.value || !net.inited) {
          if (net.inited && nv !== net.value) this.edges.set(ni, net.value);
          const changed = nv !== net.value;
          net.value = nv;
          net.inited = true;
          if (changed || net.trace.length === 0) {
            const last = net.trace[net.trace.length - 1];
            // 起点记录（d=-1）在同一时刻被覆盖时直接替换，不算瞬态
            if (last && last.d < 0 && last.t === t) net.trace.pop();
            net.trace.push({ t, d: delta, v: nv });
            if (net.trace.length > MAX_TRACE) net.trace.splice(0, net.trace.length - MAX_TRACE);
            net.lastChange = t;
          }
        }
      }
      // 阶段二：受影响的元件用提交后的值求值，输出进入下一个 delta（或 t+tpd）
      const affected = new Set<number>();
      for (const ni of this.edges.keys()) for (const r of this.nets[ni].readers) affected.add(r.comp);
      // 初始化后第一次赋值的网络也要通知读者（但不算跳变）
      for (const ni of dirty) if (!this.edges.has(ni)) for (const r of this.nets[ni].readers) affected.add(r.comp);
      this.nextDelta = [];
      const order = [...affected].sort((a, b) => a - b);
      for (const ci of order) this.evalComp(ci);
      batch = this.nextDelta;
      this.nextDelta = null;
      delta++;
    }
    this.edges = new Map();
  }

  private edgeOf(ni: number | undefined): Edge {
    if (ni === undefined) return null;
    const old = this.edges.get(ni);
    if (old === undefined) return null;
    const ttl = this.options.floating === "TTL";
    const a = asInput(old, ttl);
    const b = asInput(this.nets[ni].value, ttl);
    if (a === b) return null;
    if (a === 0 && b === 1) return "rise";
    if (a === 1 && b === 0) return "fall";
    if (b === 1 || a === 0) return "xrise";
    if (b === 0 || a === 1) return "xfall";
    return null;
  }

  private evalComp(ci: number) {
    const c = this.comps[ci];
    const ttl = this.options.floating === "TTL";
    // 建立 / 保持时间检查（仅模型 C）
    this.violationFlag = false;
    if (this.options.model === "delay" && c.model.timing) {
      const tm = c.model.timing;
      const clkNet = c.pinNet.get(tm.clock);
      const e = this.edgeOf(clkNet);
      const want = c.params.edge === "falling" ? "fall" : "rise";
      if (e === want) {
        for (const p of tm.data) {
          const ni = c.pinNet.get(p);
          if (ni === undefined) continue;
          const lc = this.nets[ni].lastChange;
          const setup = typeof c.params.tsu === "number" ? c.params.tsu : tm.setup;
          if (lc > this.time - setup && !this.edges.has(ni) && lc > 0) {
            this.violationFlag = true;
            this.issue({ level: "warning", code: "setup-violation", message: `t=${this.time} ns：${c.label} 的 ${p} 在时钟沿前 ${this.time - lc} ns 才变化，小于建立时间 ${setup} ns。输出按不确定（X）处理。`, comps: [c.id], time: this.time });
          }
        }
        c.lastEdge = this.time;
      } else if (c.lastEdge > -Infinity) {
        const hold = typeof c.params.th === "number" ? c.params.th : tm.hold;
        for (const p of tm.data) {
          const ni = c.pinNet.get(p);
          if (ni !== undefined && this.edges.has(ni) && this.time - c.lastEdge < hold && this.time > c.lastEdge)
            this.issue({ level: "warning", code: "hold-violation", message: `t=${this.time} ns：${c.label} 的 ${p} 在时钟沿后 ${this.time - c.lastEdge} ns 就变化，小于保持时间 ${hold} ns。`, comps: [c.id], time: this.time });
        }
      }
    }
    const ctx: EvalCtx = {
      in: (pin) => {
        const ni = c.pinNet.get(pin);
        if (ni === undefined) return ttl ? 1 : LX;
        return asInput(this.nets[ni].value, ttl);
      },
      edge: (pin) => this.edgeOf(c.pinNet.get(pin)),
      connected: (pin) => c.pinNet.has(pin),
      state: c.state,
      params: c.params,
      time: this.time,
    };
    // 上电稳定阶段：存储元件不改变状态，只输出当前状态
    const r = this.initializing && c.model.sequential ? { out: this.idleOutputs(c), state: undefined, issue: undefined } : c.model.evaluate(ctx);
    if (r.state) c.state = r.state;
    if (this.violationFlag) {
      // 建立时间违例：存储状态变为不确定
      for (const k of Object.keys(c.state)) {
        const s = c.state[k];
        c.state[k] = Array.isArray(s) ? s.map(() => LX) : typeof s === "number" ? LX : s;
      }
      for (const k of Object.keys(r.out)) r.out[k] = LX;
    }
    if (r.issue) this.issue({ level: "warning", code: r.issue.code, message: `t=${this.time} ns：${c.label}：${r.issue.message}`, comps: [c.id], time: this.time });
    const delay = this.delayOf(c);
    for (const [pin, v] of Object.entries(r.out)) {
      const di = c.outDriver.get(pin);
      if (di === undefined) continue;
      const dr = this.drivers[di];
      if (dr.projected === v) continue;
      dr.projected = v;
      this.schedule(di, v, delay);
    }
  }

  // ───────────────────────── 公共接口 ─────────────────────────

  /** 推进到时刻 until（包含），处理期间所有事件 */
  run(until: number) {
    while (!this.halted && this.times.length && this.times[0] <= until) this.flushTime(this.times[0]);
    if (!this.halted) this.time = Math.max(this.time, until);
  }

  /** 处理当前时刻所有待处理事件 */
  settle() {
    this.run(this.time);
  }

  /** 设置信号源（开关、按键、时钟）的值，在当前时刻生效 */
  setInput(compId: string, value: L) {
    const ci = this.compIndex.get(compId);
    if (ci === undefined) throw new Error(`没有元件 ${compId}`);
    const c = this.comps[ci];
    if (!c.model.source) throw new Error(`${compId} 不是信号源`);
    c.state = { ...c.state, value };
    this.evalComp(ci);
    this.settle();
  }

  /** 在指定时刻设置信号源（用于构造输入波形） */
  setInputAt(compId: string, value: L, t: number) {
    if (t < this.time) throw new Error("不能在过去的时刻设置输入");
    this.run(t);
    this.setInput(compId, value);
  }

  /**
   * 单步时钟：在当前时刻产生上升沿，period×duty 后产生下降沿，然后推进到一个周期结束。
   */
  stepClock(clockId?: string) {
    const id = clockId ?? this.netlist.components.find((c) => c.type === "clock")?.id;
    if (!id) throw new Error("电路中没有时钟元件");
    const ci = this.compIndex.get(id)!;
    const c = this.comps[ci];
    const period = Number(c.params.period ?? 100);
    const duty = Number(c.params.duty ?? 0.5);
    const t0 = this.time;
    this.setInput(id, 1);
    this.run(t0 + Math.round(period * duty));
    this.setInput(id, 0);
    this.run(t0 + period);
    this.steps++;
  }

  netValue(netIdOrName: string): L {
    const ni = this.netIndex.get(netIdOrName);
    if (ni === undefined) throw new Error(`没有网络 ${netIdOrName}`);
    return this.nets[ni].value;
  }

  hasNet(netIdOrName: string) {
    return this.netIndex.has(netIdOrName);
  }

  pinValue(compId: string, pin: string): L {
    const c = this.comps[this.compIndex.get(compId)!];
    const ni = c.pinNet.get(pin);
    if (ni !== undefined) return this.nets[ni].value;
    const di = c.outDriver.get(pin);
    return di !== undefined ? this.drivers[di].value : LZ;
  }

  compState(compId: string): Record<string, unknown> {
    return this.comps[this.compIndex.get(compId)!].state;
  }

  /** 直接设置存储元件的状态（用于"修改初始状态"、状态表枚举） */
  setCompState(compId: string, state: Record<string, unknown>) {
    const ci = this.compIndex.get(compId)!;
    this.comps[ci].state = { ...this.comps[ci].state, ...state };
    this.evalComp(ci);
    this.settle();
  }

  trace(netIdOrName: string): TracePoint[] {
    const ni = this.netIndex.get(netIdOrName);
    return ni === undefined ? [] : this.nets[ni].trace;
  }

  netNames(): string[] {
    return this.nets.map((n) => n.name);
  }

  /** 当前所有命名网络的取值 */
  snapshot(): Record<string, L> {
    const r: Record<string, L> = {};
    for (const n of this.nets) r[n.name] = n.value;
    return r;
  }

  /** 网络 id → 当前值（供电路图着色） */
  valuesById(): Record<string, L> {
    const r: Record<string, L> = {};
    for (const n of this.nets) r[n.id] = n.value;
    return r;
  }

  /** 清空波形记录（保留当前值作为起点） */
  clearTraces() {
    for (const n of this.nets) n.trace = [{ t: this.time, d: -1, v: n.value }];
  }
}
