"use client";

import { useMemo, useState } from "react";
import { sarConvert, flashConvert, dualSlope, maxQuantError, quantStep, CONVERTER_NOTE, type QuantMethod, type SarResult, type FlashResult, type DualSlopeResult } from "@/lib/analog-models/converters";
import { fmtSI } from "@/lib/analog-models/timer555";
import { Tex } from "@/components/ui/Tex";

type Mode = "sar" | "flash" | "dual-slope";
const MODE_TEXT: Record<Mode, string> = { sar: "逐次逼近型", flash: "并联比较型", "dual-slope": "双积分型" };
const METHOD_TEXT: Record<QuantMethod, string> = { truncate: "只舍不入", round: "四舍五入" };
const BITS: Record<Mode, number[]> = { sar: [3, 4, 6, 8], flash: [2, 3, 4], "dual-slope": [4, 6, 8, 10] };
const F_CLK = 100e3;

function Slider({ label, value, onChange, min, max, step, unit, digits = 2 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; digits?: number }) {
  return (
    <label className="text-xs text-muted space-y-1 block">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="mono text-ink">
          {value.toFixed(digits)} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label={label} />
    </label>
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

/** 量化误差读数（三种模式共用） */
function ErrorBox({ vI, delta, code, bits, vq, error, maxError, method }: { vI: number; delta: number; code: number; bits: string; vq: number; error: number; maxError: number; method: QuantMethod }) {
  return (
    <div className="card-inset p-3 space-y-1.5 text-xs">
      <div className="eyebrow mb-1">转换结果与量化误差</div>
      <Line tex="D" v={`${bits}（= ${code}）`} />
      <Line tex={method === "truncate" ? "\\Delta = V_{REF}/2^n" : "\\Delta = \\tfrac{2V_{REF}}{2^{n+1}-1}"} v={fmtSI(delta, "V")} />
      <Line tex="D\cdot\Delta" v={`${vq.toFixed(4)} V`} />
      <Line tex="e = v_I - D\Delta" v={fmtSI(error, "V")} />
      <Line tex={method === "truncate" ? "0 \\le e \\le \\Delta" : "|e| \\le \\Delta/2"} v={`上限 ${fmtSI(maxError, "V")}`} />
      <p className="text-muted">
        v_I = {vI.toFixed(3)} V，{METHOD_TEXT[method]}。
      </p>
    </div>
  );
}

/**
 * ADC 实验（模型 E：教学近似模型）。mode：sar 逐次逼近（单步）、flash 并联比较（比较器阵列 + 温度计码）、dual-slope 双积分（两段斜坡）。
 * 数值全部来自 lib/analog-models/converters；三种方式使用同一组判决电平，单元测试中与 quantize() 交叉核对。
 */
export function ADCLab({ mode: initial = "sar" }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [nByMode, setNByMode] = useState<Record<Mode, number>>({ sar: 4, flash: 3, "dual-slope": 8 });
  const [vRef, setVRef] = useState(8);
  const [vIraw, setVI] = useState(5.3);
  const [method, setMethod] = useState<QuantMethod>("truncate");
  const [shown, setShown] = useState(0);
  /** RC 取为 T₁ 的倍数：|V_P| 最大为 V_REF·T₁/RC，取 RC ≥ T₁ 使积分器输出不超过 V_REF（避免理想模型下出现不现实的高电压） */
  const [rcRatio, setRcRatio] = useState(2);
  const n = nByMode[mode];
  const vI = mode === "dual-slope" ? Math.min(vIraw, vRef * 0.995) : Math.min(vIraw, vRef);
  const effMethod: QuantMethod = mode === "dual-slope" ? "truncate" : method;

  const r = useMemo(() => {
    try {
      const spec = { n, vRef, method: effMethod };
      if (mode === "sar") return { ok: true as const, kind: "sar" as const, res: sarConvert(vI, spec) };
      if (mode === "flash") return { ok: true as const, kind: "flash" as const, res: flashConvert(vI, spec) };
      return {
        ok: true as const,
        kind: "dual-slope" as const,
        res: dualSlope({ n, vRef, vI, fClk: F_CLK, RC: (rcRatio * 2 ** n) / F_CLK }),
        ghost: dualSlope({ n, vRef, vI, fClk: F_CLK, RC: (2 * rcRatio * 2 ** n) / F_CLK }),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [mode, n, vRef, vI, effMethod, rcRatio]);

  const resetSteps = () => setShown(0);

  return (
    <div className="widget card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MODE_TEXT) as Mode[]).map((m) => (
          <button
            key={m}
            className={`btn btn-sm ${mode === m ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`}
            onClick={() => {
              setMode(m);
              resetSteps();
            }}
          >
            {MODE_TEXT[m]}
          </button>
        ))}
        <span className="chip chip-amber ml-auto" title={CONVERTER_NOTE}>
          模型 E · 教学近似模型
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3 min-w-0">
          {!r.ok && <p className="text-danger text-sm">{r.error}</p>}
          {r.ok && r.kind === "sar" && <SarView res={r.res} vI={vI} vRef={vRef} shown={shown} setShown={setShown} />}
          {r.ok && r.kind === "flash" && <FlashView res={r.res} vI={vI} />}
          {r.ok && r.kind === "dual-slope" && <DualSlopeView res={r.res} ghost={r.ghost} vI={vI} vRef={vRef} />}
        </div>

        <div className="space-y-3 text-sm">
          <div className="card-inset p-3 space-y-3">
            <label className="flex items-center justify-between gap-2 text-xs text-muted">
              位数 n
              <select
                className="select !h-7 text-xs"
                value={n}
                onChange={(e) => {
                  setNByMode((s) => ({ ...s, [mode]: Number(e.target.value) }));
                  resetSteps();
                }}
                aria-label="位数"
              >
                {BITS[mode].map((b) => (
                  <option key={b} value={b}>
                    {b} 位
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label="V_REF"
              value={vRef}
              onChange={(v) => {
                setVRef(v);
                resetSteps();
              }}
              min={1}
              max={10}
              step={0.1}
              unit="V"
              digits={1}
            />
            <Slider
              label="输入 v_I"
              value={vI}
              onChange={(v) => {
                setVI(v);
                resetSteps();
              }}
              min={0}
              max={mode === "dual-slope" ? vRef * 0.995 : vRef}
              step={0.01}
              unit="V"
            />
            {mode !== "dual-slope" ? (
              <label className="flex items-center justify-between gap-2 text-xs text-muted">
                量化方式
                <select
                  className="select !h-7 text-xs"
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value as QuantMethod);
                    resetSteps();
                  }}
                  aria-label="量化方式"
                >
                  <option value="truncate">只舍不入</option>
                  <option value="round">四舍五入</option>
                </select>
              </label>
            ) : (
              <>
                <Slider label="积分时间常数 RC / T₁" value={rcRatio} onChange={setRcRatio} min={1} max={4} step={0.1} unit="" digits={1} />
                <p className="text-[11px] text-muted">f_C = 100 kHz（假设参数），T₁ = 2ⁿ/f_C；当前 RC = {fmtSI((rcRatio * 2 ** n) / F_CLK, "s")}。计数取整，相当于只舍不入。</p>
              </>
            )}
          </div>
          {r.ok && r.kind !== "dual-slope" && (r.kind === "flash" || shown >= n) && (
            <ErrorBox vI={vI} delta={r.res.delta} code={r.res.code} bits={r.res.bits} vq={r.res.vq} error={r.res.error} maxError={r.res.maxError} method={effMethod} />
          )}
          {r.ok && r.kind === "sar" && shown < n && (
            <div className="card-inset p-3 text-xs text-muted space-y-1">
              <div className="eyebrow mb-1">转换结果与量化误差</div>
              <p>
                还差 {n - shown} 拍。完成全部 {n} 拍后显示数字量与量化误差（本设置下误差上限 {fmtSI(maxQuantError({ n, vRef, method: effMethod }), "V")}，Δ = {fmtSI(quantStep({ n, vRef, method: effMethod }), "V")}）。
              </p>
            </div>
          )}
          {r.ok && r.kind === "dual-slope" && <ErrorBox vI={vI} delta={r.res.delta} code={r.res.count} bits={r.res.bits} vq={r.res.vq} error={r.res.error} maxError={r.res.maxError} method="truncate" />}
        </div>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">{CONVERTER_NOTE}</p>
    </div>
  );
}

// ───────────────────────── 逐次逼近 ─────────────────────────

function SarView({ res, vI, vRef, shown, setShown }: { res: SarResult; vI: number; vRef: number; shown: number; setShown: (k: number) => void }) {
  const n = res.clocks;
  const W = 620;
  const H = 200;
  const L = 46;
  const PW = W - L - 12;
  const top = 10;
  const PH = H - top - 28;
  const x = (k: number) => L + (k / n) * PW;
  const y = (v: number) => top + PH - (v / vRef) * PH;
  const steps = res.steps.slice(0, shown);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm btn-primary" onClick={() => setShown(Math.min(n, shown + 1))} disabled={shown >= n}>
          单步（第 {Math.min(n, shown + 1)} 拍）
        </button>
        <button className="btn btn-sm" onClick={() => setShown(n)} disabled={shown >= n}>
          全部完成
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setShown(0)} disabled={shown === 0}>
          复位
        </button>
        <span className="mono text-xs text-muted ml-auto">
          寄存器 <span className="text-amber">{shown ? res.steps[shown - 1].afterBits : "0".repeat(n)}</span>
        </span>
      </div>

      <div className="card-inset p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="逐次逼近：试探电压逐拍逼近输入电压">
          <rect x={L} y={top} width={PW} height={PH} fill="var(--bg-2)" stroke="var(--line)" />
          <text x={6} y={top + 12} fontSize={10} className="mono" fill="var(--ink-2)">
            v
          </text>
          <text x={L - 4} y={y(vRef) + 8} fontSize={9} className="mono" fill="var(--muted)" textAnchor="end">
            {vRef.toFixed(1)}
          </text>
          <text x={L - 4} y={y(0)} fontSize={9} className="mono" fill="var(--muted)" textAnchor="end">
            0
          </text>
          <line x1={L} x2={L + PW} y1={y(vI)} y2={y(vI)} stroke="var(--sig-z)" strokeDasharray="5 3" />
          <text x={L + PW - 4} y={y(vI) - 4} fontSize={9.5} className="mono" fill="var(--sig-z)" textAnchor="end">
            v_I = {vI.toFixed(3)} V
          </text>
          {steps.map((s, i) => (
            <g key={s.clock}>
              <line x1={x(i)} x2={x(i + 1)} y1={y(s.vCompare)} y2={y(s.vCompare)} stroke={s.keep ? "var(--sig-1)" : "var(--sig-x)"} strokeWidth={2} />
              {i > 0 && <line x1={x(i)} x2={x(i)} y1={y(steps[i - 1].vCompare)} y2={y(s.vCompare)} stroke="var(--line-2)" />}
              <text x={(x(i) + x(i + 1)) / 2} y={y(s.vCompare) + (s.keep ? 13 : -5)} fontSize={9} className="mono" fill={s.keep ? "var(--sig-1)" : "var(--sig-x)"} textAnchor="middle">
                {s.trialBits} {s.keep ? "留" : "舍"}
              </text>
            </g>
          ))}
          {shown >= n && <line x1={L} x2={L + PW} y1={y(res.vq)} y2={y(res.vq)} stroke="var(--amber)" strokeDasharray="2 3" />}
          {Array.from({ length: n }, (_, i) => (
            <text key={i} x={(x(i) + x(i + 1)) / 2} y={H - 8} fontSize={9} className="mono" fill="var(--muted)" textAnchor="middle">
              CP{i + 1}
            </text>
          ))}
        </svg>
      </div>

      <div className="card-inset p-2 overflow-x-auto thin-scroll">
        <table className="ltable w-full min-w-[460px]">
          <thead>
            <tr>
              <th>拍</th>
              <th>试探位</th>
              <th>试探码</th>
              <th>比较电压</th>
              <th>v_I ≥ ?</th>
              <th>本位</th>
              <th>寄存器</th>
            </tr>
          </thead>
          <tbody>
            {res.steps.map((s, i) => (
              <tr key={s.clock} className={i < shown ? "" : "opacity-30"}>
                <td>{s.clock}</td>
                <td>d{s.bit}</td>
                <td>{i < shown ? s.trialBits : "…"}</td>
                <td>{i < shown ? `${s.vCompare.toFixed(4)} V` : "…"}</td>
                <td>{i < shown ? <span className={`lv ${s.geq ? "lv-1" : "lv-0"}`}>{s.geq ? 1 : 0}</span> : "…"}</td>
                <td className={i < shown ? (s.keep ? "text-[var(--sig-1)]" : "text-danger") : ""}>{i < shown ? (s.keep ? "保留 1" : "舍去 → 0") : "…"}</td>
                <td>{i < shown ? s.afterBits : "…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">
        每拍把下一位试探置 1，内部 DAC 输出试探码对应电压{res.steps[0] && res.steps[0].vCompare !== res.steps[0].vDac ? "（四舍五入时 DAC 输出下移 Δ/2）" : ""}，与 v_I 比较：v_I ≥ 比较电压则保留，否则清 0。{n} 位共 {n} 拍。
      </p>
    </div>
  );
}

// ───────────────────────── 并联比较 ─────────────────────────

function FlashView({ res, vI }: { res: FlashResult; vI: number }) {
  const m = res.count;
  const rowH = m > 7 ? 22 : 30;
  const top = 40;
  const W = 600;
  const xR = 60;
  const xC = 210;
  const xV = xC - 70;
  const yRow = (k: number) => top + (m - k) * rowH + rowH / 2; // k = m 在最上
  const yG = yRow(1) + rowH;
  const H = yG + 18;
  const encX = 380;
  const rh = Math.min(12, rowH - 10);
  const round = Math.abs(res.comparators[0].vRef - res.delta) > 1e-12;
  // 分压链：V_REF → 节点 m → … → 节点 1 → 地，共 m + 1 个电阻
  const resistors = [{ y: (20 + yRow(m)) / 2, label: "R" }, ...res.comparators.map((c) => ({ y: yRow(c.k) + rowH / 2, label: c.k === 1 && round ? "R/2" : "R" }))];
  return (
    <div className="space-y-3">
      <div className="card-inset p-2 overflow-x-auto thin-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[460px]" role="img" aria-label="并联比较型 ADC 比较器阵列与编码器">
          <text x={xR} y={14} fontSize={10} className="mono" fill="var(--sig-1)" textAnchor="middle">
            V_REF
          </text>
          <path d={`M${xR} 18 V${yG}`} stroke="var(--ink-2)" />
          <path d={`M${xR - 7} ${yG} H${xR + 7} M${xR - 4.5} ${yG + 3} H${xR + 4.5} M${xR - 2} ${yG + 6} H${xR + 2}`} stroke="var(--ink-2)" />
          {resistors.map((r, i) => (
            <g key={i}>
              <rect x={xR - 4} y={r.y - rh / 2} width={8} height={rh} fill="var(--bg-2)" stroke="var(--ink-2)" />
              <text x={xR - 8} y={r.y + 3} fontSize={8.5} className="mono" fill="var(--muted)" textAnchor="end">
                {r.label}
              </text>
            </g>
          ))}
          <path d={`M${xV} 20 V${yRow(1) + rowH * 0.3}`} stroke="var(--sig-z)" strokeDasharray="4 3" />
          <text x={xV} y={14} fontSize={10} className="mono" fill="var(--sig-z)" textAnchor="middle">
            v_I = {vI.toFixed(3)} V
          </text>
          {res.comparators.map((c) => {
            const yy = yRow(c.k);
            const on = c.out === 1;
            const yp = yy - rowH * 0.2;
            const yn = yy + rowH * 0.2;
            return (
              <g key={c.k}>
                <circle cx={xR} cy={yy} r={2} fill="var(--ink-2)" />
                <path d={`M${xR} ${yy} H${xC - 10} V${yn} H${xC}`} stroke="var(--ink-2)" fill="none" />
                <text x={xR + 8} y={yy - 3} fontSize={9} className="mono" fill="var(--amber)">
                  {c.vRef.toFixed(3)} V
                </text>
                <circle cx={xV} cy={yp} r={1.8} fill="var(--sig-z)" />
                <path d={`M${xV} ${yp} H${xC}`} stroke="var(--sig-z)" />
                <path d={`M${xC} ${yy - rowH * 0.38} V${yy + rowH * 0.38} L${xC + 34} ${yy} Z`} fill="var(--bg-2)" stroke={on ? "var(--sig-1)" : "var(--line-2)"} strokeWidth={on ? 2 : 1.2} />
                <text x={xC + 3} y={yp + 3} fontSize={8} className="mono" fill="var(--ink-2)">
                  +
                </text>
                <text x={xC + 3} y={yn + 3} fontSize={8} className="mono" fill="var(--ink-2)">
                  −
                </text>
                <text x={xC + 40} y={yy - 3} fontSize={9} className="mono" fill="var(--muted)">
                  C{c.k}
                </text>
                <path d={`M${xC + 34} ${yy} H${encX}`} stroke={on ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={on ? 2 : 1.2} />
                <text x={encX - 14} y={yy - 3} fontSize={10} fontWeight={700} className="mono" fill={on ? "var(--sig-1)" : "var(--sig-0)"} textAnchor="middle">
                  {c.out}
                </text>
              </g>
            );
          })}
          <rect x={encX} y={top} width={100} height={m * rowH} rx={4} fill="var(--panel)" stroke="var(--ink-2)" />
          <text x={encX + 50} y={top + 16} fontSize={10} className="mono" fill="var(--ink)" textAnchor="middle">
            优先编码器
          </text>
          {res.bits.split("").map((b, i) => {
            const yy = top + ((i + 1) * m * rowH) / (res.bits.length + 1);
            return (
              <g key={i}>
                <path d={`M${encX + 100} ${yy} H${encX + 150}`} stroke={b === "1" ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={2} />
                <text x={encX + 156} y={yy + 4} fontSize={11} className="mono" fill={b === "1" ? "var(--sig-1)" : "var(--sig-0)"}>
                  d{res.bits.length - 1 - i} = {b}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="card-inset p-3 text-xs space-y-1.5">
        <Line tex={`\\text{比较器个数 } 2^{${Math.log2(m + 1)}}-1`} v={`${m} 个`} />
        <Line tex={`\\text{温度计码 } C_{${m}}\\cdots C_1`} v={res.thermometer} />
        <Line tex="\text{编码输出}" v={`${res.bits}（${res.code} 个比较器输出 1）`} />
        <p className="text-muted">
          所有比较器同时比较，一次得到结果。参考电压由电阻分压链产生：{round ? "四舍五入时最下面一个电阻取 R/2，最低参考电压为 Δ/2，其余相隔 Δ。" : "只舍不入时各电阻相等，参考电压依次为 Δ、2Δ、…"}
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── 双积分 ─────────────────────────

function DualSlopeView({ res, ghost, vI, vRef }: { res: DualSlopeResult; ghost: DualSlopeResult; vI: number; vRef: number }) {
  const W = 620;
  const H = 210;
  const L = 50;
  const PW = W - L - 12;
  const top = 14;
  const PH = H - top - 34;
  const tMax = 2 * res.T1;
  // 纵轴按当前 RC 下可能的最大峰值（v_I → V_REF）确定
  const rc = res.slope2 > 0 ? vRef / res.slope2 : 1;
  const vMin = (-(vRef * res.T1) / rc) * 1.08;
  const x = (t: number) => L + (t / tMax) * PW;
  const y = (v: number) => top + (v / vMin) * PH;
  const path = (r: DualSlopeResult) => r.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const ticks = res.count <= 64 ? Array.from({ length: res.count }, (_, k) => res.T1 + (k + 1) * res.Tc) : [];
  return (
    <div className="space-y-3">
      <div className="card-inset p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="双积分型 ADC 积分器输出波形">
          <rect x={L} y={top} width={PW} height={PH} fill="var(--bg-2)" stroke="var(--line)" />
          <rect x={x(0)} y={top} width={x(res.T1) - x(0)} height={PH} fill="var(--accent-soft)" opacity={0.5} />
          <line x1={x(res.T1)} x2={x(res.T1)} y1={top} y2={top + PH} stroke="var(--amber)" strokeDasharray="4 3" />
          <text x={(x(0) + x(res.T1)) / 2} y={top + PH - 6} fontSize={9.5} className="mono" fill="var(--accent)" textAnchor="middle">
            第一阶段：对 v_I 积分，固定 T₁
          </text>
          <text x={(x(res.T1) + x(tMax)) / 2} y={top + PH - 6} fontSize={9.5} className="mono" fill="var(--amber)" textAnchor="middle">
            第二阶段：对 −V_REF 积分，计数
          </text>
          <text x={6} y={top + 10} fontSize={10} className="mono" fill="var(--ink-2)">
            v_O
          </text>
          <text x={L - 4} y={top + 4} fontSize={9} className="mono" fill="var(--muted)" textAnchor="end">
            0
          </text>
          <text x={L - 4} y={y(res.vPeak) + 3} fontSize={9} className="mono" fill="var(--sig-1)" textAnchor="end">
            {res.vPeak.toFixed(2)}
          </text>
          <path d={path(ghost)} fill="none" stroke="var(--sig-z)" strokeWidth={1.4} strokeDasharray="5 3" />
          <path d={path(res)} fill="none" stroke="var(--sig-1)" strokeWidth={2} />
          <line x1={x(res.T1 + res.T2)} x2={x(res.T1 + res.T2)} y1={top} y2={top + PH} stroke="var(--sig-1)" strokeDasharray="2 3" />
          {ticks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={top + PH} y2={top + PH + 5} stroke="var(--amber)" />
          ))}
          <text x={L} y={H - 16} fontSize={9} className="mono" fill="var(--muted)">
            0
          </text>
          <text x={x(res.T1)} y={H - 16} fontSize={9} className="mono" fill="var(--amber)" textAnchor="middle">
            T₁ = {fmtSI(res.T1, "s")}
          </text>
          <text x={Math.min(x(res.T1 + res.T2), W - 50)} y={H - 4} fontSize={9} className="mono" fill="var(--sig-1)" textAnchor="middle">
            T₁+T₂
          </text>
          <text x={L + PW} y={H - 16} fontSize={9} className="mono" fill="var(--muted)" textAnchor="end">
            2T₁
          </text>
        </svg>
      </div>
      <div className="card-inset p-3 text-xs space-y-1.5">
        <Line tex="T_C = 1/f_C" v={fmtSI(res.Tc, "s")} />
        <Line tex={`T_1 = 2^{n}T_C`} v={fmtSI(res.T1, "s")} />
        <Line tex="V_P = -\dfrac{v_I T_1}{RC}" v={`${res.vPeak.toFixed(4)} V`} />
        <Line tex="T_2 = T_1\dfrac{v_I}{V_{REF}}" v={fmtSI(res.T2, "s")} />
        <Line tex="N = \lfloor T_2/T_C \rfloor" v={`${res.count}`} />
        <p className="text-muted leading-relaxed">
          实线 RC = {fmtSI(rc, "s")}，虚线 RC = {fmtSI(2 * rc, "s")}：峰值 V_P 分别为 {res.vPeak.toFixed(3)} V 与 {ghost.vPeak.toFixed(3)} V，但两条线在同一时刻回到 0，计数值都是 {res.count}（虚线 N = {ghost.count}）——RC 在两次积分中被约掉。v_I = {vI.toFixed(3)} V。
          {ticks.length > 0 ? "横轴下方的短刻线是第二阶段计入的时钟。" : ""}
        </p>
      </div>
    </div>
  );
}
