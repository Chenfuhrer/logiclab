"use client";

import { useId, useState } from "react";
import { Tex } from "@/components/ui/Tex";
import { FAMILIES, FAMILY_IDS, type FamilyId, type LevelsAnalysis, tryAnalyzeLevels } from "@/lib/analog-models/levels";

/** mA → 可读字符串（< 1 mA 用 µA） */
function fmtI(mA: number): string {
  const sign = mA < 0 ? "−" : "";
  const a = Math.abs(mA);
  if (a < 1) return `${sign}${Number((a * 1000).toPrecision(4))} µA`;
  return `${sign}${Number(a.toPrecision(4))} mA`;
}
const fmtV = (v: number) => `${v < 0 ? "−" : ""}${Number(Math.abs(v).toPrecision(3))} V`;

export function LevelsLab() {
  const [driver, setDriver] = useState<FamilyId>("74LS");
  const [load, setLoad] = useState<FamilyId>("74HC");
  const res = tryAnalyzeLevels(driver, load);

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-label="电平阈值与扇出">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">交互实验 · 门电路电气特性</div>
          <div className="text-base font-semibold text-ink">电平阈值、噪声容限与扇出</div>
        </div>
        <span className="chip chip-amber">电气层 · 教学近似模型</span>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          驱动门（输出）
          <select className="select" value={driver} onChange={(e) => setDriver(e.target.value as FamilyId)}>
            {FAMILY_IDS.map((id) => (
              <option key={id} value={id}>
                {FAMILIES[id].name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn self-start sm:self-auto"
          onClick={() => {
            setDriver(load);
            setLoad(driver);
          }}
          aria-label="交换驱动与负载"
        >
          ⇄ 交换
        </button>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          负载门（输入）
          <select className="select" value={load} onChange={(e) => setLoad(e.target.value as FamilyId)}>
            {FAMILY_IDS.map((id) => (
              <option key={id} value={id}>
                {FAMILIES[id].name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!res.ok ? (
        <p role="alert" className="card-inset px-3 py-2 text-sm text-danger">
          ✕ {res.error}
        </p>
      ) : (
        <Body a={res.value} />
      )}
    </section>
  );
}

function Body({ a }: { a: LevelsAnalysis }) {
  const { driver, load, out, margins, fanout } = a;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="card-inset p-2">
          <LevelsSvg a={a} />
          <div className="flex flex-wrap gap-1.5 px-1 pt-1 text-[0.7rem]">
            <span className="chip">
              <span className="lv lv-1 !h-3 !min-w-3" />
              高电平 1
            </span>
            <span className="chip">
              <span className="lv lv-0 !h-3 !min-w-3" />
              低电平 0
            </span>
            <span className="chip">
              <span className="lv lv-x !h-3 !min-w-3" />
              不确定 X
            </span>
            <span className="chip chip-accent">噪声容限 ≥ 0</span>
            <span className="chip chip-danger">容限 &lt; 0</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="card-inset space-y-1 p-2.5 text-sm">
            <div className="eyebrow">噪声容限</div>
            <div className="flex flex-wrap items-center gap-2">
              <Tex>{`V_{NH}=V_{OH(\\min)}-V_{IH(\\min)}=${out.VOH_min}-${load.VIH_min}`}</Tex>
              <span className={`mono ${margins.VNH < 0 ? "text-danger" : "text-accent"}`}>= {fmtV(margins.VNH)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tex>{`V_{NL}=V_{IL(\\max)}-V_{OL(\\max)}=${load.VIL_max}-${out.VOL_max}`}</Tex>
              <span className={`mono ${margins.VNL < 0 ? "text-danger" : "text-accent"}`}>= {fmtV(margins.VNL)}</span>
            </div>
          </div>
          <div className="card-inset space-y-1 p-2.5 text-sm">
            <div className="eyebrow">扇出（直流）</div>
            <Tex>{"N=\\min\\left(\\dfrac{I_{OL}}{|I_{IL}|},\\ \\dfrac{|I_{OH}|}{I_{IH}}\\right)"}</Tex>
            <div className="mono text-xs text-ink-2">
              低电平：{fmtI(out.IOL)} / {fmtI(Math.abs(load.IIL))} → {fanout.NL}
              <br />
              高电平：{fmtI(Math.abs(out.IOH))} / {fmtI(load.IIH)} → {fanout.NH}
            </div>
            <div className="flex items-center gap-2">
              <span className="mono text-lg text-accent">N = {fanout.N}</span>
              <span className="chip">
                {fanout.limitedBy === "both" ? "高、低电平同时限制" : fanout.limitedBy === "low" ? "受低电平电流限制" : "受高电平电流限制"}
              </span>
            </div>
          </div>
          {a.compatible ? (
            <p className="card-inset px-3 py-2 text-sm text-accent">✓ 高、低电平都满足，可以直接连接（静态电平意义上）。</p>
          ) : (
            <div role="alert" className="card-inset space-y-1 border-danger px-3 py-2 text-sm text-danger">
              {a.issues.map((t) => (
                <p key={t}>✕ {t}</p>
              ))}
            </div>
          )}
          {a.notes.map((t) => (
            <p key={t} className="text-xs text-muted">
              注：{t}
            </p>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto thin-scroll">
        <table className="ltable w-full">
          <thead>
            <tr>
              <th>系列</th>
              <th>V_OH(min)</th>
              <th>V_OL(max)</th>
              <th>I_OH</th>
              <th>I_OL</th>
              <th>V_IH(min)</th>
              <th>V_IL(max)</th>
              <th>I_IH</th>
              <th>I_IL</th>
            </tr>
          </thead>
          <tbody>
            {[driver, load]
              .filter((f, i, arr) => arr.findIndex((g) => g.id === f.id) === i)
              .map((f) => (
                <tr key={f.id}>
                  <td className="mono text-ink">{f.id}</td>
                  <td className="mono">
                    {f.outLight ? `${f.outHeavy.VOH_min} / ${f.outLight.VOH_min}` : f.outHeavy.VOH_min} V
                  </td>
                  <td className="mono">
                    {f.outLight ? `${f.outHeavy.VOL_max} / ${f.outLight.VOL_max}` : f.outHeavy.VOL_max} V
                  </td>
                  <td className="mono">{fmtI(f.outHeavy.IOH)}</td>
                  <td className="mono">{fmtI(f.outHeavy.IOL)}</td>
                  <td className="mono">{f.VIH_min} V</td>
                  <td className="mono">{f.VIL_max} V</td>
                  <td className="mono">{fmtI(f.IIH)}</td>
                  <td className="mono">{fmtI(f.IIL)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        本次计算使用驱动门输出条件：<span className="mono text-ink-2">{out.label}</span>。74HC 输出列“A / B”分别为 4 mA 与 20 µA 负载条件下的值。电流符号：流入引脚为正。
      </p>

      <div className="card-inset space-y-1 px-3 py-2 text-xs text-ink-2">
        <div className="eyebrow">教学近似模型 · 参数来源</div>
        {[driver, load]
          .filter((f, i, arr) => arr.findIndex((g) => g.id === f.id) === i)
          .map((f) => (
            <p key={f.id}>
              <span className="mono text-ink">{f.id}</span>：{f.source}
            </p>
          ))}
        <p className="text-muted">
          只考虑静态（直流）电平与电流，不含温度、电源波动、负载电容与速度的影响；数值仅用于理解概念，工程设计请查阅对应器件的官方数据手册。
        </p>
      </div>
    </>
  );
}

/* ───────────────── 阈值示意条 ───────────────── */

const W = 520;
const H = 300;
const Y0 = 270; // 0 V
const Y5 = 24; // V_CC
const OUT_X = 150;
const IN_X = 330;
const BAR_W = 46;

function LevelsSvg({ a }: { a: LevelsAnalysis }) {
  const uid = useId().replace(/:/g, "");
  const { load, out, margins } = a;
  const vcc = a.driver.VCC;
  const y = (v: number) => Y0 - (v / vcc) * (Y0 - Y5);
  const hatch = `hx-${uid}`;
  const bad = `hb-${uid}`;
  const midX = (OUT_X + BAR_W + IN_X) / 2;

  const marginBand = (top: number, bottom: number, ok: boolean, label: string) => {
    const y1 = y(Math.max(top, bottom));
    const y2 = y(Math.min(top, bottom));
    return (
      <g>
        <rect
          x={OUT_X + BAR_W}
          y={y1}
          width={IN_X - OUT_X - BAR_W}
          height={Math.max(1, y2 - y1)}
          fill={ok ? "var(--accent-soft)" : `url(#${bad})`}
          stroke={ok ? "var(--accent)" : "var(--danger)"}
          strokeWidth={0.8}
        />
        <text x={midX} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize={11} className="mono" fill={ok ? "var(--accent)" : "var(--danger)"}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="电平阈值示意图">
      <defs>
        <pattern id={hatch} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill="color-mix(in srgb, var(--sig-x) 18%, transparent)" />
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--sig-x)" strokeWidth={2} />
        </pattern>
        <pattern id={bad} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--danger)" strokeWidth={1.4} />
        </pattern>
      </defs>

      {/* 电压坐标 */}
      <line x1={36} x2={36} y1={Y5} y2={Y0} stroke="var(--line-2)" />
      {Array.from({ length: Math.floor(vcc) + 1 }, (_, v) => (
        <g key={v}>
          <line x1={32} x2={36} y1={y(v)} y2={y(v)} stroke="var(--line-2)" />
          <text x={28} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)" className="mono">
            {v}V
          </text>
        </g>
      ))}

      {/* 列标题 */}
      <text x={OUT_X + BAR_W / 2} y={14} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
        {a.driver.id} 输出
      </text>
      <text x={IN_X + BAR_W / 2} y={14} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
        {load.id} 输入
      </text>

      {/* 驱动门输出 */}
      <rect x={OUT_X} y={y(vcc)} width={BAR_W} height={y(out.VOH_min) - y(vcc)} fill="var(--sig-1)" opacity={0.85} />
      <rect x={OUT_X} y={y(out.VOH_min)} width={BAR_W} height={y(out.VOL_max) - y(out.VOH_min)} fill="var(--panel-2)" stroke="var(--line-2)" strokeDasharray="3 3" />
      <rect x={OUT_X} y={y(out.VOL_max)} width={BAR_W} height={Math.max(1.5, y(0) - y(out.VOL_max))} fill="var(--sig-0)" opacity={0.85} />
      <text x={OUT_X + BAR_W / 2} y={(y(vcc) + y(out.VOH_min)) / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--accent-ink)" className="mono">
        1
      </text>
      {y(0) - y(out.VOL_max) >= 14 && (
        <text x={OUT_X + BAR_W / 2} y={(y(out.VOL_max) + y(0)) / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--accent-ink)" className="mono">
          0
        </text>
      )}
      {y(out.VOL_max) - y(out.VOH_min) >= 30 && (
        <text x={OUT_X + BAR_W / 2} y={y(out.VOH_min) + 14} textAnchor="middle" fontSize={9.5} fill="var(--muted)">
          不保证
        </text>
      )}

      {/* 负载门输入 */}
      <rect x={IN_X} y={y(vcc)} width={BAR_W} height={y(load.VIH_min) - y(vcc)} fill="var(--sig-1)" opacity={0.85} />
      <rect x={IN_X} y={y(load.VIH_min)} width={BAR_W} height={y(load.VIL_max) - y(load.VIH_min)} fill={`url(#${hatch})`} />
      <rect x={IN_X} y={y(load.VIL_max)} width={BAR_W} height={y(0) - y(load.VIL_max)} fill="var(--sig-0)" opacity={0.85} />
      <text x={IN_X + BAR_W / 2} y={(y(vcc) + y(load.VIH_min)) / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--accent-ink)" className="mono">
        1
      </text>
      <text x={IN_X + BAR_W / 2} y={(y(load.VIH_min) + y(load.VIL_max)) / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--sig-x)" className="mono">
        X
      </text>
      <text x={IN_X + BAR_W / 2} y={(y(load.VIL_max) + y(0)) / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--accent-ink)" className="mono">
        0
      </text>

      {/* 阈值虚线 */}
      {[out.VOH_min, out.VOL_max].map((v, i) => (
        <line key={`o${i}`} x1={OUT_X - 4} x2={IN_X + BAR_W} y1={y(v)} y2={y(v)} stroke="var(--ink-2)" strokeWidth={0.6} strokeDasharray="2 3" />
      ))}
      {[load.VIH_min, load.VIL_max].map((v, i) => (
        <line key={`i${i}`} x1={OUT_X} x2={IN_X + BAR_W + 4} y1={y(v)} y2={y(v)} stroke="var(--ink-2)" strokeWidth={0.6} strokeDasharray="2 3" />
      ))}

      {/* 噪声容限 */}
      {marginBand(out.VOH_min, load.VIH_min, margins.VNH >= 0, `V_NH = ${fmtV(margins.VNH)}`)}
      {marginBand(load.VIL_max, out.VOL_max, margins.VNL >= 0, `V_NL = ${fmtV(margins.VNL)}`)}

      {/* 左侧：输出阈值标注 */}
      <text x={OUT_X - 8} y={y(out.VOH_min) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink)" className="mono">
        V_OH(min) {out.VOH_min}
      </text>
      <text x={OUT_X - 8} y={y(out.VOL_max) - 3} textAnchor="end" fontSize={10.5} fill="var(--ink)" className="mono">
        V_OL(max) {out.VOL_max}
      </text>
      {/* 右侧：输入阈值标注 */}
      <text x={IN_X + BAR_W + 8} y={y(load.VIH_min) + 4} fontSize={10.5} fill="var(--ink)" className="mono">
        V_IH(min) {load.VIH_min}
      </text>
      <text x={IN_X + BAR_W + 8} y={y(load.VIL_max) + 4} fontSize={10.5} fill="var(--ink)" className="mono">
        V_IL(max) {load.VIL_max}
      </text>
      <text x={IN_X + BAR_W + 8} y={(y(load.VIH_min) + y(load.VIL_max)) / 2 + 4} fontSize={10} fill="var(--sig-x)">
        不确定区
      </text>
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
        V_CC = {vcc} V · 静态电平示意（教学近似模型）
      </text>
    </svg>
  );
}
