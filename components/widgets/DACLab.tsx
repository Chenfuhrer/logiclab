"use client";

import { useEffect, useMemo, useState } from "react";
import { dac, CONVERTER_NOTE, type DacKind, type DacResult } from "@/lib/analog-models/converters";
import { fmtSI } from "@/lib/analog-models/timer555";
import { Tex } from "@/components/ui/Tex";

const KIND_TEXT: Record<DacKind, string> = { r2r: "R-2R 倒 T 形", weighted: "权电阻网络" };
const R_UNIT = 10e3;

function Slider({ label, value, onChange, min, max, step, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string }) {
  return (
    <label className="text-xs text-muted space-y-1 block">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="mono text-ink">
          {value} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label={label} />
    </label>
  );
}

/**
 * DAC 实验（模型 E：教学近似模型）：权电阻 / R-2R 倒 T 形，拨码输入，电路示意 + 各支路电流 + 输出电压；
 * “自动递增”使数字量逐拍加 1，画出阶梯波。数值全部来自 lib/analog-models/converters 的 dac()。
 */
export function DACLab() {
  const [kind, setKind] = useState<DacKind>("r2r");
  const [n, setN] = useState<4 | 8>(4);
  const [D, setD] = useState(0b1101);
  const [vRef, setVRef] = useState(10);
  const [running, setRunning] = useState(false);
  const max = 2 ** n - 1;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setD((d) => (d >= max ? 0 : d + 1)), n === 4 ? 320 : 45);
    return () => clearInterval(id);
  }, [running, n, max]);

  const r = useMemo(() => {
    try {
      return { ok: true as const, res: dac({ kind, n, D: Math.min(D, max), vRef, R: R_UNIT }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [kind, n, D, max, vRef]);

  if (!r.ok)
    return (
      <div className="widget card p-4">
        <p className="text-danger text-sm">{r.error}</p>
      </div>
    );
  const res = r.res;

  return (
    <div className="widget card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_TEXT) as DacKind[]).map((k) => (
          <button key={k} className={`btn btn-sm ${kind === k ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} onClick={() => setKind(k)}>
            {KIND_TEXT[k]}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          位数
          <select
            className="select !h-7 text-xs"
            value={n}
            onChange={(e) => {
              const nn = Number(e.target.value) as 4 | 8;
              setN(nn);
              setD((d) => d & (2 ** nn - 1));
            }}
            aria-label="位数"
          >
            <option value={4}>4 位</option>
            <option value={8}>8 位</option>
          </select>
        </label>
        <span className="chip chip-amber ml-auto" title={CONVERTER_NOTE}>
          模型 E · 教学近似模型
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted mr-1">拨码输入</span>
          {Array.from({ length: n }, (_, j) => n - 1 - j).map((i) => {
            const bit = (D >> i) & 1;
            return (
              <button
                key={i}
                className="flex flex-col items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-[var(--panel-2)]"
                onClick={() => {
                  setRunning(false);
                  setD((d) => d ^ (1 << i));
                }}
                aria-label={`d${i} = ${bit}，点击切换`}
                aria-pressed={bit === 1}
              >
                <span className={`lv ${bit ? "lv-1" : "lv-0"}`}>{bit}</span>
                <span className="mono text-[10px] text-muted">d{i}</span>
              </button>
            );
          })}
          <span className="mono text-sm ml-2">
            D = <span className="text-amber">{D}</span>
          </span>
          <div className="flex gap-1.5 ml-auto">
            <button className={`btn btn-sm ${running ? "" : "btn-primary"}`} onClick={() => setRunning((x) => !x)}>
              {running ? "停止" : "自动递增"}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setRunning(false);
                setD(0);
              }}
            >
              清零
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3 min-w-0">
          <Circuit res={res} />
          <Staircase res={res} />
          <p className="text-[11px] text-muted leading-relaxed">
            点击 d 位切换 0/1；“自动递增”让 D 每拍加 1（到全 1 后回到 0），阶梯图画出 −v_O 随时钟的变化。电路图中开关刀片指向的位置由 d 位决定，琥珀色电流流向运放求和点。
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <div className="card-inset p-3 space-y-3">
            <Slider label="V_REF" value={vRef} onChange={setVRef} min={1} max={10} step={0.1} unit="V" />
            <p className="text-[11px] text-muted leading-relaxed">
              R = 10 kΩ；R_f = {kind === "r2r" ? "R = 10 kΩ" : "R/2 = 5 kΩ"}（假设参数，按通行推导取值）。
            </p>
          </div>
          <Results res={res} />
        </div>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">{CONVERTER_NOTE}</p>
    </div>
  );
}

function Line({ tex, v }: { tex: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <Tex>{tex}</Tex>
      <span className="ml-auto mono text-amber whitespace-nowrap">{v}</span>
    </div>
  );
}

function Results({ res }: { res: DacResult }) {
  const formula =
    res.kind === "r2r" ? `v_O = -\\frac{R_f}{R}\\cdot\\frac{V_{REF}}{2^{${res.n}}}D` : `v_O = -\\frac{2R_f}{R}\\cdot\\frac{V_{REF}}{2^{${res.n}}}D`;
  return (
    <div className="card-inset p-3 space-y-1.5 text-xs">
      <div className="eyebrow mb-1">计算结果</div>
      <Tex>{formula}</Tex>
      <p className="text-muted">
        {res.kind === "r2r" ? "取 R_f = R：" : "取 R_f = R/2："}
        <Tex>{`v_O = -\\frac{V_{REF}}{2^{${res.n}}}D`}</Tex>
      </p>
      <Line tex="v_O" v={`${res.vO.toFixed(4)} V`} />
      <Line tex="i_\Sigma" v={fmtSI(res.iSum, "A", 4)} />
      {res.kind === "r2r" && <Line tex="I = V_{REF}/R" v={fmtSI(res.iRef, "A")} />}
      <Line tex="\text{1 LSB}" v={fmtSI(res.vLSB, "V")} />
      <Line tex="\text{满量程 }|v_O|_{max}" v={`${res.vFS.toFixed(4)} V`} />
      <Line tex={`\\text{分辨率 } \\tfrac{1}{2^{${res.n}}-1}`} v={`${(res.resolution * 100).toFixed(3)} %`} />
    </div>
  );
}

// ───────────────────────── 电路示意 ─────────────────────────

function T({ x, y, t, c = "var(--ink-2)", a = "start", s = 10 }: { x: number; y: number; t: string; c?: string; a?: "start" | "middle" | "end"; s?: number }) {
  return (
    <text x={x} y={y} fontSize={s} className="mono" fill={c} textAnchor={a}>
      {t}
    </text>
  );
}

function Ground({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} V${y + 6} M${x - 7} ${y + 6} H${x + 7} M${x - 4.5} ${y + 9} H${x + 4.5} M${x - 2} ${y + 12} H${x + 2}`} stroke="var(--ink-2)" fill="none" />;
}

function Circuit({ res }: { res: DacResult }) {
  const { n } = res;
  const sx = n === 4 ? 82 : 60;
  const x0 = 104;
  const xs = (j: number) => x0 + j * sx; // j = 0 为 MSB
  const ySum = 166;
  const hot = "var(--amber)";
  const r2r = res.kind === "r2r";
  const xLast = xs(n - 1);
  const xTerm = xLast + sx;
  const xOp = r2r ? xTerm + 64 : xLast + 92;
  const W = xOp + 110;
  const H = 214;
  const els: React.ReactNode[] = [];

  if (r2r) {
    const yL = 34;
    els.push(<circle key="vref" cx={28} cy={yL} r={3.5} fill="var(--sig-1)" />);
    els.push(<T key="vrefl" x={20} y={yL - 9} t={`V_REF ${res.vRef} V`} c="var(--sig-1)" />);
    els.push(<path key="vrefw" d={`M28 ${yL} H${xs(0)}`} stroke="var(--ink-2)" />);
    els.push(<T key="iref" x={40} y={yL + 14} t={`I = ${fmtSI(res.iRef, "A")}`} c={hot} s={9} />);
    // 串联 R
    for (let j = 0; j < n; j++) {
      const a = xs(j);
      const b = j === n - 1 ? xTerm : xs(j + 1);
      const m = (a + b) / 2;
      els.push(<path key={`sw${j}`} d={`M${a} ${yL} H${m - 13} M${m + 13} ${yL} H${b}`} stroke="var(--ink-2)" />);
      if (j < n - 1) {
        els.push(<rect key={`sr${j}`} x={m - 13} y={yL - 5} width={26} height={10} fill="var(--bg-2)" stroke="var(--ink-2)" />);
        els.push(<T key={`srl${j}`} x={m} y={yL - 9} t="R" a="middle" c="var(--muted)" s={9} />);
      } else {
        els.push(<path key="srw" d={`M${m - 13} ${yL} H${m + 13}`} stroke="var(--ink-2)" />);
      }
      els.push(<circle key={`nd${j}`} cx={a} cy={yL} r={2.5} fill="var(--ink-2)" />);
    }
    // 终端 2R 接地
    els.push(<path key="tw" d={`M${xTerm} ${yL} V52 M${xTerm} 92 V112`} stroke="var(--ink-2)" />);
    els.push(<rect key="tr" x={xTerm - 5} y={52} width={10} height={40} fill="var(--bg-2)" stroke="var(--ink-2)" />);
    els.push(<T key="trl" x={xTerm + 8} y={76} t="2R" c="var(--muted)" s={9} />);
    els.push(<Ground key="tg" x={xTerm} y={112} />);
    // 各位支路
    res.branches.forEach((b, j) => {
      const x = xs(j);
      const on = b.d === 1;
      const cx = on ? x - 12 : x + 12;
      els.push(<path key={`bw${j}`} d={`M${x} ${yL} V52 M${x} 92 V118`} stroke="var(--ink-2)" />);
      els.push(<rect key={`br${j}`} x={x - 5} y={52} width={10} height={40} fill="var(--bg-2)" stroke={on ? hot : "var(--ink-2)"} />);
      els.push(<T key={`brl${j}`} x={x - 8} y={90} t="2R" a="end" c="var(--muted)" s={9} />);
      els.push(<T key={`bi${j}`} x={x + 8} y={68} t={fmtSI(b.current, "A", 4)} c={on ? hot : "var(--muted)"} s={8.5} />);
      els.push(<T key={`bto${j}`} x={x + 8} y={80} t={on ? "→Σ" : "→地"} c={on ? hot : "var(--muted)"} s={8.5} />);
      // 开关：刀片从支点到选中的触点
      els.push(<circle key={`pv${j}`} cx={x} cy={120} r={2.5} fill="var(--ink)" />);
      els.push(<path key={`bl${j}`} d={`M${x} 120 L${cx} 142`} stroke={on ? hot : "var(--ink)"} strokeWidth={2} />);
      els.push(<circle key={`cl${j}`} cx={x - 12} cy={144} r={2.5} fill="none" stroke="var(--ink-2)" />);
      els.push(<circle key={`cr${j}`} cx={x + 12} cy={144} r={2.5} fill="none" stroke="var(--ink-2)" />);
      els.push(<path key={`cw${j}`} d={`M${x - 12} 146.5 V${ySum} M${x + 14.5} 144 H${x + 22}`} stroke="var(--ink-2)" />);
      els.push(<Ground key={`cg${j}`} x={x + 22} y={144} />);
      els.push(<T key={`sl${j}`} x={x + 6} y={116} t={`S${b.bit}`} c="var(--muted)" s={9} />);
      els.push(<T key={`dl${j}`} x={x} y={ySum + 18} t={`d${b.bit}=${b.d}`} a="middle" c={on ? "var(--sig-1)" : "var(--sig-0)"} s={9.5} />);
    });
    els.push(<path key="sum" d={`M${xs(0) - 12} ${ySum} H${xOp}`} stroke={hot} strokeWidth={1.6} />);
  } else {
    const yB = 30;
    els.push(<circle key="vref" cx={28} cy={yB} r={3.5} fill="var(--sig-1)" />);
    els.push(<T key="vrefl" x={20} y={yB - 9} t={`V_REF ${res.vRef} V`} c="var(--sig-1)" />);
    els.push(<path key="vrefw" d={`M28 ${yB} H${xLast - 12}`} stroke="var(--sig-1)" />);
    res.branches.forEach((b, j) => {
      const x = xs(j);
      const on = b.d === 1;
      const cx = on ? x - 12 : x + 12;
      const mult = 2 ** (n - 1 - b.bit);
      els.push(<circle key={`cl${j}`} cx={x - 12} cy={54} r={2.5} fill="none" stroke="var(--ink-2)" />);
      els.push(<circle key={`cr${j}`} cx={x + 12} cy={54} r={2.5} fill="none" stroke="var(--ink-2)" />);
      els.push(<path key={`cw${j}`} d={`M${x - 12} ${yB} V51.5 M${x + 14.5} 54 H${x + 22}`} stroke="var(--ink-2)" />);
      els.push(<circle key={`cn${j}`} cx={x - 12} cy={yB} r={2} fill="var(--sig-1)" />);
      els.push(<Ground key={`cg${j}`} x={x + 22} y={54} />);
      els.push(<circle key={`pv${j}`} cx={x} cy={76} r={2.5} fill="var(--ink)" />);
      els.push(<path key={`bl${j}`} d={`M${x} 76 L${cx} 56`} stroke={on ? hot : "var(--ink)"} strokeWidth={2} />);
      els.push(<T key={`sl${j}`} x={x + 6} y={82} t={`S${b.bit}`} c="var(--muted)" s={9} />);
      els.push(<path key={`bw${j}`} d={`M${x} 76 V90 M${x} 130 V${ySum}`} stroke={on ? hot : "var(--ink-2)"} />);
      els.push(<rect key={`br${j}`} x={x - 5} y={90} width={10} height={40} fill="var(--bg-2)" stroke={on ? hot : "var(--ink-2)"} />);
      els.push(<T key={`brl${j}`} x={x - 4} y={146} t={mult === 1 ? "R" : `${mult}R`} a="end" c="var(--muted)" s={9} />);
      els.push(<T key={`bi${j}`} x={x + 8} y={108} t={b.current === 0 ? "0" : fmtSI(b.current, "A", 4)} c={on ? hot : "var(--muted)"} s={8.5} />);
      els.push(<circle key={`sn${j}`} cx={x} cy={ySum} r={2} fill="var(--ink-2)" />);
      els.push(<T key={`dl${j}`} x={x} y={ySum + 18} t={`d${b.bit}=${b.d}`} a="middle" c={on ? "var(--sig-1)" : "var(--sig-0)"} s={9.5} />);
    });
    els.push(<path key="sum" d={`M${xs(0)} ${ySum} H${xOp}`} stroke={hot} strokeWidth={1.6} />);
  }

  // 运放与反馈电阻
  const yo = ySum + 12;
  els.push(<path key="op" d={`M${xOp} ${ySum - 14} V${ySum + 38} L${xOp + 46} ${yo} Z`} fill="var(--bg-2)" stroke="var(--ink-2)" />);
  els.push(<T key="opm" x={xOp + 4} y={ySum + 4} t="−" c="var(--ink)" />);
  els.push(<T key="opp" x={xOp + 4} y={ySum + 28} t="+" c="var(--ink)" />);
  els.push(<path key="opg" d={`M${xOp} ${ySum + 24} H${xOp - 12} V${ySum + 30}`} stroke="var(--ink-2)" fill="none" />);
  els.push(<Ground key="opgg" x={xOp - 12} y={ySum + 30} />);
  els.push(<path key="rfw" d={`M${xOp - 18} ${ySum} V${ySum - 40} H${xOp + 2} M${xOp + 40} ${ySum - 40} H${xOp + 66} V${yo} M${xOp + 46} ${yo} H${xOp + 92}`} stroke="var(--ink-2)" fill="none" />);
  els.push(<circle key="rfn" cx={xOp - 18} cy={ySum} r={2.5} fill="var(--ink-2)" />);
  els.push(<rect key="rf" x={xOp + 2} y={ySum - 45} width={38} height={10} fill="var(--bg-2)" stroke="var(--ink-2)" />);
  els.push(<T key="rfl" x={xOp + 21} y={ySum - 50} t={`R_f ${fmtSI(res.Rf, "Ω", 2)}`} a="middle" c="var(--muted)" s={9} />);
  els.push(<T key="isum" x={xOp - 22} y={ySum - 6} t={`i_Σ ${fmtSI(res.iSum, "A", 4)}`} a="end" c={hot} s={9} />);
  els.push(<circle key="vo" cx={xOp + 92} cy={yo} r={3} fill="var(--accent)" />);
  els.push(<T key="vol" x={xOp + 96} y={yo - 8} t="v_O" a="end" c="var(--accent)" />);
  els.push(<T key="vov" x={xOp + 96} y={yo + 18} t={`${res.vO.toFixed(3)} V`} a="end" c="var(--accent)" />);

  return (
    <div className="card-inset p-2 overflow-x-auto thin-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: Math.min(W, 560) }} role="img" aria-label={`${KIND_TEXT[res.kind]} DAC 电路示意与支路电流`}>
        {els}
      </svg>
    </div>
  );
}

// ───────────────────────── 阶梯波 ─────────────────────────

function Staircase({ res }: { res: DacResult }) {
  const W = 620;
  const H = 170;
  const L = 46;
  const PW = W - L - 10;
  const top = 10;
  const PH = H - top - 26;
  const N = 2 ** res.n;
  const x = (k: number) => L + (k / N) * PW;
  const y = (v: number) => top + PH - (v / (res.vFS || 1)) * PH;
  const lvl = (k: number) => k * res.vLSB; // −v_O
  const full: string[] = [`M${x(0)} ${y(0)}`];
  for (let k = 0; k < N; k++) full.push(`H${x(k + 1).toFixed(1)}`, k + 1 < N ? `V${y(lvl(k + 1)).toFixed(1)}` : "");
  const done: string[] = [`M${x(0)} ${y(0)}`];
  for (let k = 0; k <= res.D; k++) {
    if (k > 0) done.push(`V${y(lvl(k)).toFixed(1)}`);
    done.push(`H${x(k + 1).toFixed(1)}`);
  }
  return (
    <div className="card-inset p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="DAC 输出阶梯波">
        <rect x={L} y={top} width={PW} height={PH} fill="var(--bg-2)" stroke="var(--line)" />
        <text x={6} y={top + PH / 2} fontSize={10} className="mono" fill="var(--ink-2)">
          −v_O
        </text>
        <text x={L - 4} y={y(res.vFS) + 4} fontSize={9} className="mono" fill="var(--amber)" textAnchor="end">
          {res.vFS.toFixed(2)}
        </text>
        <text x={L - 4} y={y(0)} fontSize={9} className="mono" fill="var(--muted)" textAnchor="end">
          0
        </text>
        <line x1={L} x2={L + PW} y1={y(res.vFS)} y2={y(res.vFS)} stroke="var(--amber)" strokeDasharray="4 3" strokeOpacity={0.6} />
        <path d={full.join(" ")} fill="none" stroke="var(--line-2)" strokeDasharray="3 3" />
        <path d={done.join(" ")} fill="none" stroke="var(--sig-1)" strokeWidth={1.8} />
        <circle cx={(x(res.D) + x(res.D + 1)) / 2} cy={y(lvl(res.D))} r={3.5} fill="var(--amber)" />
        <text x={L} y={H - 6} fontSize={9} className="mono" fill="var(--muted)">
          D = 0
        </text>
        <text x={L + PW} y={H - 6} fontSize={9} className="mono" fill="var(--muted)" textAnchor="end">
          D = {N - 1}（每拍 +1）
        </text>
        <text x={L + PW / 2} y={H - 6} fontSize={9.5} className="mono" fill="var(--amber)" textAnchor="middle">
          D = {res.D}，−v_O = {(-res.vO).toFixed(3)} V
        </text>
      </svg>
    </div>
  );
}
