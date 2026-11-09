"use client";

import { useMemo, useState } from "react";
import type { L, Netlist, SimOptions } from "@/lib/sim/types";
import { useSimulation } from "@/hooks/useSimulation";
import { Schematic } from "@/components/circuit/Schematic";
import { Waveform, busFromBits, type Channel } from "@/components/waveform/Waveform";
import { IssueList } from "@/components/lab/IssueList";
import { Tex } from "@/components/ui/Tex";
import { tryParse, truthTable } from "@/lib/logic";

type Ep = [string, string];
function nl(name: string, comps: Netlist["components"], nets: [string, Ep[]][]): Netlist {
  return { version: 1, name, components: comps, nets: nets.map(([id, eps]) => ({ id, name: id, endpoints: eps.map(([comp, pin]) => ({ comp, pin })) })) };
}

/**
 * 通用小实验：电路图 + 开关 + （可选）时钟单步 + 波形。
 * 每次拨动开关前先把时间推进 advance ns，使波形上能看到先后顺序。
 */
function TimedLab({
  netlist,
  opts = {},
  advance = 20,
  wave,
  height = 300,
  clock,
  extra,
  hint,
  readout,
}: {
  netlist: Netlist;
  opts?: Partial<SimOptions>;
  advance?: number;
  wave?: { net: string; label?: string; clock?: boolean }[];
  height?: number;
  clock?: boolean;
  extra?: (api: ReturnType<typeof useSimulation>) => React.ReactNode;
  hint?: React.ReactNode;
  readout?: (get: (net: string) => L) => React.ReactNode;
}) {
  const api = useSimulation(netlist, opts);
  const { sim, version, bump } = api;
  void version;
  const toggle = (id: string) => {
    if (!sim) return;
    sim.run(sim.time + advance);
    const cur = (sim.compState(id).value as L) ?? 0;
    sim.setInput(id, cur === 1 ? 0 : 1);
    sim.run(sim.time + advance);
    bump();
  };
  const channels: Channel[] = sim && wave ? wave.map((w) => ({ kind: "bit" as const, name: w.label ?? w.net, points: sim.trace(w.net), clock: w.clock })) : [];
  return (
    <div className="widget card p-4 space-y-3">
      {(clock || extra) && (
        <div className="flex flex-wrap gap-2 items-center">
          {clock && (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => api.step(1)}>
                单步 CP
              </button>
              {api.running ? (
                <button className="btn btn-sm" onClick={api.stop}>
                  暂停
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => api.run(500)}>
                  连续
                </button>
              )}
            </>
          )}
          {extra?.(api)}
        </div>
      )}
      <div className="card-inset overflow-hidden">
        <Schematic netlist={netlist} values={sim?.valuesById()} onToggle={toggle} style={{ height }} />
      </div>
      {readout && sim && <div className="text-sm">{readout((n) => sim.netValue(n))}</div>}
      {hint && <p className="text-xs text-muted leading-relaxed">{hint}</p>}
      {wave && sim && <Waveform channels={channels} t1={Math.max(sim.time, 200)} />}
      {sim && <IssueList issues={sim.issues} />}
    </div>
  );
}

// ───────────────────────── 三态总线 ─────────────────────────

export function TriStateBusLab() {
  const netlist = useMemo(
    () =>
      nl(
        "三态总线",
        [
          { id: "A", type: "switch", label: "A", x: 20, y: 30, params: { value: 1 } },
          { id: "EA", type: "switch", label: "EN_A", x: 20, y: 110 },
          { id: "B", type: "switch", label: "B", x: 20, y: 200 },
          { id: "EB", type: "switch", label: "EN_B", x: 20, y: 280 },
          { id: "T1", type: "tribuf", label: "G1", x: 200, y: 40 },
          { id: "T2", type: "tribuf", label: "G2", x: 200, y: 210 },
          { id: "BUS", type: "probe", label: "总线", x: 380, y: 140 },
          { id: "L", type: "led", label: "LED", x: 470, y: 138 },
        ],
        [
          ["a", [["A", "Y"], ["T1", "A"]]],
          ["ea", [["EA", "Y"], ["T1", "EN"]]],
          ["b", [["B", "Y"], ["T2", "A"]]],
          ["eb", [["EB", "Y"], ["T2", "EN"]]],
          ["BUS", [["T1", "Y"], ["T2", "Y"], ["BUS", "A"], ["L", "A"]]],
        ],
      ),
    [],
  );
  return (
    <TimedLab
      netlist={netlist}
      height={330}
      wave={[{ net: "ea", label: "EN_A" }, { net: "eb", label: "EN_B" }, { net: "BUS", label: "总线" }]}
      hint={<>两个使能都为 0：总线悬空（Z，蓝色虚线）。只使能一个：总线取该门的数据。两个都使能且数据相反：总线冲突，取值记为 X（红色斜纹），并给出错误提示——真实电路中这会形成低阻通路。</>}
    />
  );
}

// ───────────────────────── 74LS138 ─────────────────────────

export function Decoder138Lab() {
  const netlist = useMemo(() => {
    const comps: Netlist["components"] = [
      { id: "A2", type: "switch", label: "A2", x: 20, y: 30 },
      { id: "A1", type: "switch", label: "A1", x: 20, y: 80 },
      { id: "A0", type: "switch", label: "A0", x: 20, y: 130 },
      { id: "S1", type: "switch", label: "S1", x: 20, y: 190, params: { value: 1 } },
      { id: "S2", type: "switch", label: "S̄2", x: 20, y: 240 },
      { id: "S3", type: "switch", label: "S̄3", x: 20, y: 290 },
      { id: "U", type: "ls138", label: "74LS138", x: 200, y: 30 },
    ];
    const nets: [string, Ep[]][] = [
      ["A0", [["A0", "Y"], ["U", "A0"]]],
      ["A1", [["A1", "Y"], ["U", "A1"]]],
      ["A2", [["A2", "Y"], ["U", "A2"]]],
      ["S1", [["S1", "Y"], ["U", "S1"]]],
      ["S2", [["S2", "Y"], ["U", "S2"]]],
      ["S3", [["S3", "Y"], ["U", "S3"]]],
    ];
    for (let i = 0; i < 8; i++) {
      comps.push({ id: `P${i}`, type: "probe", label: `Ȳ${i}`, x: 380, y: 40 + i * 34 });
      nets.push([`Y${i}`, [["U", `Y${i}`], [`P${i}`, "A"]]]);
    }
    return nl("74LS138", comps, nets);
  }, []);
  return (
    <TimedLab
      netlist={netlist}
      height={330}
      hint={
        <>
          工作条件 <Tex>{"S_1 = 1,\\ \\overline{S_2} = \\overline{S_3} = 0"}</Tex>。被选中的输出为 0（低电平有效），其余为 1：<Tex>{"\\overline{Y_i} = \\overline{m_i}"}</Tex>，其中 <Tex>{"m_i"}</Tex> 是 <Tex>{"A_2A_1A_0"}</Tex> 的最小项。点击芯片引脚可查看说明。
        </>
      }
      readout={(get) => {
        const code = [get("A2"), get("A1"), get("A0")];
        const en = get("S1") === 1 && get("S2") === 0 && get("S3") === 0;
        const n = code.every((x) => x === 0 || x === 1) ? (code[0] as number) * 4 + (code[1] as number) * 2 + (code[2] as number) : null;
        return (
          <span className={en ? "text-accent" : "text-amber"}>
            {en ? `已使能：A2A1A0 = ${code.join("")}，选中 Ȳ${n}（输出 0）` : "未使能：全部输出为 1"}
          </span>
        );
      }}
    />
  );
}

// ───────────────────────── 74LS151 ─────────────────────────

export function Mux151Lab() {
  const [fn, setFn] = useState("AB'+BC");
  const [preset, setPreset] = useState<number[] | null>(null);
  const netlist = useMemo(() => {
    const comps: Netlist["components"] = [
      { id: "A2", type: "switch", label: "A2", x: 20, y: 20 },
      { id: "A1", type: "switch", label: "A1", x: 20, y: 66 },
      { id: "A0", type: "switch", label: "A0", x: 20, y: 112 },
      { id: "S", type: "switch", label: "S̄", x: 20, y: 158 },
      { id: "U", type: "ls151", label: "74LS151", x: 240, y: 20 },
      { id: "PY", type: "probe", label: "Y", x: 420, y: 40 },
      { id: "PW", type: "probe", label: "W̄", x: 420, y: 90 },
    ];
    const nets: [string, Ep[]][] = [
      ["A0", [["A0", "Y"], ["U", "A0"]]],
      ["A1", [["A1", "Y"], ["U", "A1"]]],
      ["A2", [["A2", "Y"], ["U", "A2"]]],
      ["S", [["S", "Y"], ["U", "S"]]],
      ["Y", [["U", "Y"], ["PY", "A"]]],
      ["W", [["U", "W"], ["PW", "A"]]],
    ];
    for (let i = 0; i < 8; i++) {
      comps.push({ id: `D${i}`, type: "switch", label: `D${i}`, x: 110, y: 210 + i * 40, params: { value: preset ? preset[i] : 0 } });
      nets.push([`D${i}`, [[`D${i}`, "Y"], ["U", `D${i}`]]]);
    }
    return nl("74LS151", comps, nets);
  }, [preset]);
  const parsed = tryParse(fn);
  const assign = () => {
    if (!parsed.ok) return;
    const t = truthTable(parsed.expr, ["A", "B", "C"]);
    setPreset(Array.from(t));
  };
  return (
    <TimedLab
      key={preset?.join("") ?? "none"}
      netlist={netlist}
      height={560}
      extra={() => (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">用 151 实现 F(A,B,C) =</span>
          <input className="input mono !h-8 w-40" value={fn} onChange={(e) => setFn(e.target.value)} aria-label="三变量函数" />
          <button className="btn btn-sm" onClick={assign} disabled={!parsed.ok}>
            按函数设置 D0～D7
          </button>
          <span className="text-xs text-muted">（A 接 A2、B 接 A1、C 接 A0，令 Dᵢ = F(mᵢ)）</span>
        </div>
      )}
      readout={(get) => {
        const code = [get("A2"), get("A1"), get("A0")];
        const n = code.every((x) => x === 0 || x === 1) ? (code[0] as number) * 4 + (code[1] as number) * 2 + (code[2] as number) : null;
        return get("S") === 1 ? <span className="text-amber">S̄=1：选通无效，Y=0</span> : <span className="text-accent">选通有效：A2A1A0 = {code.join("")}，Y = D{n}</span>;
      }}
      hint={
        <>
          <Tex>{"\\overline{S}=0"}</Tex> 时 <Tex>{"Y = \\sum_{i=0}^{7} m_i D_i"}</Tex>。把函数的真值表直接填进 <Tex>{"D_0\\sim D_7"}</Tex>，地址端接变量，Y 就是这个函数。
        </>
      }
    />
  );
}

// ───────────────────────── SR 锁存器（门级） ─────────────────────────

export function LatchLab() {
  const netlist = useMemo(
    () =>
      nl(
        "或非门 SR 锁存器",
        [
          { id: "S", type: "switch", label: "S", x: 20, y: 150 },
          { id: "R", type: "switch", label: "R", x: 20, y: 20, params: { value: 1 } },
          { id: "G1", type: "nor", label: "G1", x: 200, y: 10 },
          { id: "G2", type: "nor", label: "G2", x: 200, y: 140 },
          { id: "PQ", type: "probe", label: "Q", x: 360, y: 20 },
          { id: "PQN", type: "probe", label: "Q̄", x: 360, y: 150 },
        ],
        [
          ["R", [["R", "Y"], ["G1", "I0"]]],
          ["S", [["S", "Y"], ["G2", "I1"]]],
          ["Q", [["G1", "Y"], ["G2", "I0"], ["PQ", "A"]]],
          ["QN", [["G2", "Y"], ["G1", "I1"], ["PQN", "A"]]],
        ],
      ),
    [],
  );
  return (
    <TimedLab
      netlist={netlist}
      opts={{ model: "delay" }}
      advance={40}
      height={240}
      wave={[{ net: "S" }, { net: "R" }, { net: "Q" }, { net: "QN", label: "Q̄" }]}
      hint={
        <>
          带延迟模型（每个门 10 ns）。两个或非门首尾交叉相接形成正反馈：S=R=0 时电路保持原状态——这就是“记忆”。S=R=1 时 Q=Q̄=0，违反约束 <Tex>{"SR=0"}</Tex>；若两者再同时变回 0，两个门会交替翻转（振荡），对应真实电路中的不确定状态。
        </>
      }
    />
  );
}

// ───────────────────────── 竞争冒险 ─────────────────────────

export function HazardLab() {
  const [fix, setFix] = useState(false);
  const netlist = useMemo(() => {
    const comps: Netlist["components"] = [
      { id: "A", type: "switch", label: "A", x: 20, y: 60 },
      { id: "B", type: "switch", label: "B", x: 20, y: 150, params: { value: 1 } },
      { id: "C", type: "switch", label: "C", x: 20, y: 230, params: { value: 1 } },
      { id: "N", type: "not", label: "G1", x: 130, y: 180 },
      { id: "G2", type: "and", label: "G2 AB", x: 260, y: 40 },
      { id: "G3", type: "and", label: "G3 A'C", x: 260, y: 180 },
      { id: "G5", type: "or", label: "G5", x: 420, y: 100, params: { inputs: fix ? 3 : 2 } },
      { id: "PY", type: "probe", label: "Y", x: 520, y: 109 },
    ];
    const nets: [string, Ep[]][] = [
      ["A", [["A", "Y"], ["G2", "I0"], ["N", "A"]]],
      ["B", [["B", "Y"], ["G2", "I1"], ...(fix ? ([["G4", "I0"]] as Ep[]) : [])]],
      ["C", [["C", "Y"], ["G3", "I1"], ...(fix ? ([["G4", "I1"]] as Ep[]) : [])]],
      ["AN", [["N", "Y"], ["G3", "I0"]]],
      ["AB", [["G2", "Y"], ["G5", "I0"]]],
      ["ANC", [["G3", "Y"], ["G5", "I1"]]],
      ["Y", [["G5", "Y"], ["PY", "A"]]],
    ];
    if (fix) {
      comps.push({ id: "G4", type: "and", label: "G4 BC", x: 260, y: 270 });
      nets.push(["BC", [["G4", "Y"], ["G5", "I2"]]]);
    }
    return nl("冒险", comps, nets);
  }, [fix]);
  return (
    <TimedLab
      key={String(fix)}
      netlist={netlist}
      opts={{ model: "delay" }}
      advance={60}
      height={340}
      wave={[{ net: "A" }, { net: "AN", label: "A'" }, { net: "AB" }, { net: "ANC", label: "A'C" }, { net: "Y" }]}
      extra={() => (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fix} onChange={(e) => setFix(e.target.checked)} className="accent-[var(--accent)]" />
          加冗余项 BC（消除冒险）
        </label>
      )}
      hint={
        <>
          模型 C：传输延迟，每个门 10 ns。<Tex>{"Y = AB + \\overline{A}C"}</Tex>，令 B=C=1，则理想情况下 <Tex>{"Y = A + \\overline{A} = 1"}</Tex>。但 A 从 1 变 0 时，AB 先变 0，而 <Tex>{"\\overline{A}"}</Tex> 要晚一个非门延迟才变 1，于是 Y 出现一个约 10 ns 的 0 毛刺（静态 1 型冒险）。勾选“加冗余项 BC”后毛刺消失。
        </>
      }
    />
  );
}

// ───────────────────────── 纹波计数器 ─────────────────────────

export function RippleCounterLab() {
  const netlist = useMemo(
    () =>
      nl(
        "3 位异步二进制加法计数器",
        [
          { id: "CLK", type: "clock", label: "CP", x: 20, y: 200, params: { period: 200 } },
          { id: "VCC", type: "const1", label: "1", x: 30, y: 40 },
          { id: "F0", type: "jkff", label: "FF0", x: 160, y: 120, params: { edge: "falling", init: 0, tpd: 20 } },
          { id: "F1", type: "jkff", label: "FF1", x: 330, y: 120, params: { edge: "falling", init: 0, tpd: 20 } },
          { id: "F2", type: "jkff", label: "FF2", x: 500, y: 120, params: { edge: "falling", init: 0, tpd: 20 } },
          { id: "G", type: "nor", label: "译码 000", x: 640, y: 260, params: { inputs: 3 } },
          { id: "PY", type: "probe", label: "Y0", x: 740, y: 269 },
        ],
        [
          ["VCC", [["VCC", "Y"], ["F0", "J"], ["F0", "K"], ["F1", "J"], ["F1", "K"], ["F2", "J"], ["F2", "K"]]],
          ["CLK", [["CLK", "CLK"], ["F0", "CLK"]]],
          ["Q0", [["F0", "Q"], ["F1", "CLK"], ["G", "I0"]]],
          ["Q1", [["F1", "Q"], ["F2", "CLK"], ["G", "I1"]]],
          ["Q2", [["F2", "Q"], ["G", "I2"]]],
          ["Y0", [["G", "Y"], ["PY", "A"]]],
        ],
      ),
    [],
  );
  const api = useSimulation(netlist, { model: "delay" });
  const { sim, version } = api;
  void version;
  const channels: Channel[] = sim
    ? [
        { kind: "bit", name: "CP", points: sim.trace("CLK"), clock: true },
        { kind: "bit", name: "Q0", points: sim.trace("Q0") },
        { kind: "bit", name: "Q1", points: sim.trace("Q1") },
        { kind: "bit", name: "Q2", points: sim.trace("Q2") },
        busFromBits("Q2Q1Q0", [sim.trace("Q0"), sim.trace("Q1"), sim.trace("Q2")], 2),
        { kind: "bit", name: "Y0=Q̄2Q̄1Q̄0", points: sim.trace("Y0") },
      ]
    : [];
  return (
    <div className="widget card p-4 space-y-3">
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={() => api.step(1)}>
          单步 CP
        </button>
        <button className="btn btn-sm" onClick={() => api.step(4)}>
          连走 4 拍
        </button>
      </div>
      <div className="card-inset overflow-hidden">
        <Schematic netlist={netlist} values={sim?.valuesById()} style={{ height: 320 }} />
      </div>
      {sim && <Waveform channels={channels} t1={Math.max(sim.time, 400)} title="带延迟模型 · 触发器 tpd = 20 ns、门 10 ns（教学示意值）" />}
      <p className="text-xs text-muted leading-relaxed">
        FF1 的时钟是 Q0、FF2 的时钟是 Q1：每级都要等前一级翻转后才可能翻转，延迟逐级累积。从 011 变到 100 时，计数器会依次经过 010、000 两个过渡状态，所以译码 000 的输出 Y0 在不该为 1 的时候出现了毛刺。放大波形（＋）可看清每一级 20 ns 的延迟。
      </p>
    </div>
  );
}

// ───────────────────────── 74LS194 ─────────────────────────

export function ShiftRegisterLab() {
  const [preset, setPreset] = useState<"free" | "ring" | "johnson">("free");
  const netlist = useMemo(() => {
    const comps: Netlist["components"] = [
      { id: "CLK", type: "clock", label: "CP", x: 20, y: 330, params: { period: 100 } },
      { id: "RD", type: "switch", label: "R̄D", x: 20, y: 20, params: { value: 1 } },
      { id: "S1", type: "switch", label: "S1", x: 20, y: 70, params: { value: preset === "free" ? 0 : 1 } },
      { id: "S0", type: "switch", label: "S0", x: 20, y: 120, params: { value: 1 } },
      { id: "DSL", type: "switch", label: "DSL", x: 20, y: 220 },
      { id: "U", type: "ls194", label: "74LS194", x: 230, y: 20, params: { init: 0 } },
    ];
    const nets: [string, Ep[]][] = [
      ["CLK", [["CLK", "CLK"], ["U", "CLK"]]],
      ["RD", [["RD", "Y"], ["U", "RD"]]],
      ["S1", [["S1", "Y"], ["U", "S1"]]],
      ["S0", [["S0", "Y"], ["U", "S0"]]],
      ["DSL", [["DSL", "Y"], ["U", "DSL"]]],
    ];
    const q: Ep[][] = [0, 1, 2, 3].map((i) => [["U", `Q${i}`] as Ep, [`P${i}`, "A"] as Ep]);
    for (let i = 0; i < 4; i++) comps.push({ id: `P${i}`, type: "probe", label: `Q${i}`, x: 430, y: 160 + i * 38 });
    // 并行数据 D3..D0 = 1000（Q0=1）——环形计数器的初始装入值
    for (let i = 0; i < 4; i++) comps.push({ id: `D${i}`, type: "switch", label: `D${i}`, x: 120, y: 330 + i * 46, params: { value: i === 0 ? 1 : 0 } });
    for (let i = 0; i < 4; i++) nets.push([`D${i}`, [[`D${i}`, "Y"], ["U", `D${i}`]]]);
    if (preset === "free") {
      comps.push({ id: "DSR", type: "switch", label: "DSR", x: 20, y: 170, params: { value: 1 } });
      nets.push(["DSR", [["DSR", "Y"], ["U", "DSR"]]]);
    } else if (preset === "ring") {
      q[3].push(["U", "DSR"]);
    } else {
      comps.push({ id: "N", type: "not", label: "G", x: 520, y: 290 });
      q[3].push(["N", "A"]);
      nets.push(["Q3N", [["N", "Y"], ["U", "DSR"]]]);
    }
    q.forEach((eps, i) => nets.push([`Q${i}`, eps]));
    return nl("74LS194", comps, nets);
  }, [preset]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-sm items-center mt-6">
        <span className="text-muted">预设：</span>
        {(
          [
            ["free", "自由操作"],
            ["ring", "环形计数器（Q3→D_SR）"],
            ["johnson", "扭环形计数器（Q̄3→D_SR）"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${preset === k ? "!border-accent !text-accent" : ""}`} onClick={() => setPreset(k)}>
            {l}
          </button>
        ))}
      </div>
      <TimedLab
        key={preset}
        netlist={netlist}
        height={520}
        clock
        wave={[{ net: "CLK", label: "CP", clock: true }, { net: "Q0" }, { net: "Q1" }, { net: "Q2" }, { net: "Q3" }]}
        hint={
          preset === "ring" ? (
            <>环形计数器：先令 S1S0 = 11 并给一个 CP，把 1000（Q0=1）装入；再把 S1 拨到 0（右移），之后每个 CP 让唯一的 1 循环移动，4 个有效状态。</>
          ) : preset === "johnson" ? (
            <>扭环形（约翰逊）计数器：先 S1S0 = 11 装入、或拨 R̄D=0 清零，再置 S1S0 = 01 右移，Q̄3 反馈到 D_SR，共 8 个有效状态。</>
          ) : (
            <>
              S1S0 = 00 保持，01 右移（Q0←D_SR，Q1←Q0…），10 左移（Q3←D_SL，Q2←Q3…），11 并行置数；<Tex>{"\\overline{R_D}"}</Tex> 为异步清零。
            </>
          )
        }
      />
    </div>
  );
}
