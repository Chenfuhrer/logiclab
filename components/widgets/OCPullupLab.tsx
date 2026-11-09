"use client";

import { useState } from "react";
import { Tex } from "@/components/ui/Tex";
import {
  DEFAULT_PULLUP,
  type LoadGateKind,
  type PullupInput,
  type PullupResult,
  fmt,
  loadCounts,
  tryComputePullup,
} from "@/lib/analog-models/pullup";

type Key = keyof PullupInput;

const FIELDS: { key: Key; tex: string; unit: string; hint: string; int?: boolean }[] = [
  { key: "VCC", tex: "V_{CC}", unit: "V", hint: "上拉电源" },
  { key: "n", tex: "n", unit: "个", hint: "线与的 OC 门个数", int: true },
  { key: "m", tex: "m", unit: "个", hint: "高电平：负载输入端总数", int: true },
  { key: "mLow", tex: "m'", unit: "个", hint: "低电平：等效负载输入数", int: true },
  { key: "IOL_max", tex: "I_{OL(\\max)}", unit: "mA", hint: "OC 门允许的最大灌电流" },
  { key: "VOL_max", tex: "V_{OL(\\max)}", unit: "V", hint: "要求的低电平上限" },
  { key: "VOH_min", tex: "V_{OH(\\min)}", unit: "V", hint: "要求的高电平下限" },
  { key: "IOH", tex: "I_{OH}", unit: "mA", hint: "每个 OC 门截止时的漏电流" },
  { key: "IIH", tex: "I_{IH}", unit: "mA", hint: "每个负载输入端的高电平电流" },
  { key: "IIL", tex: "|I_{IL}|", unit: "mA", hint: "每个等效负载的低电平电流（绝对值）" },
];

const toText = (p: PullupInput) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) as Record<Key, string>;

function tryLoadCounts(kind: LoadGateKind, gates: string, perGate: string): { ok: true; value: { m: number; mLow: number } } | { ok: false; error: string } {
  if (gates.trim() === "" || perGate.trim() === "") return { ok: false, error: "请填写门数与每门输入端数" };
  try {
    return { ok: true, value: loadCounts(kind, Number(gates), Number(perGate)) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function parseField(s: string): number {
  const t = s.trim();
  return t === "" ? NaN : Number(t);
}

export function OCPullupLab() {
  const [txt, setTxt] = useState<Record<Key, string>>(() => toText(DEFAULT_PULLUP));
  const [kind, setKind] = useState<LoadGateKind>("nand");
  const [gates, setGates] = useState("2");
  const [perGate, setPerGate] = useState("2");

  const input = Object.fromEntries(FIELDS.map((f) => [f.key, parseField(txt[f.key])])) as unknown as PullupInput;
  const res = tryComputePullup(input);
  const isDefault = FIELDS.every((f) => parseField(txt[f.key]) === DEFAULT_PULLUP[f.key]);

  const hc = tryLoadCounts(kind, gates, perGate);
  const helper = hc.ok ? hc.value : null;
  const helperErr = hc.ok ? "" : hc.error;

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-label="OC 门上拉电阻计算">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">交互实验 · OC 门线与</div>
          <div className="text-base font-semibold text-ink">上拉电阻 R_L 的取值范围</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip chip-amber">电气层 · 教学近似模型</span>
          {isDefault && <span className="chip">假设参数</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-0.5 text-xs text-muted" title={f.hint}>
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-ink-2">
                    <Tex>{f.tex}</Tex>
                  </span>
                  <span>{f.unit}</span>
                </span>
                <input
                  className="input mono w-full"
                  value={txt[f.key]}
                  inputMode={f.int ? "numeric" : "decimal"}
                  onChange={(e) => setTxt({ ...txt, [f.key]: e.target.value })}
                  aria-label={f.hint}
                />
                <span className="truncate text-[0.68rem]">{f.hint}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setTxt(toText(DEFAULT_PULLUP))}>
              恢复假设参数
            </button>
            <span className="text-xs text-muted">默认值是教学用假设参数，不是某一具体 OC 门的手册值。电流填绝对值。</span>
          </div>
        </div>

        <div className="space-y-2">
          {res.ok ? <ResultView r={res.value} /> : (
            <p role="alert" className="card-inset px-3 py-2 text-sm text-danger">
              ✕ {res.error}
            </p>
          )}
        </div>
      </div>

      <div className="card-inset space-y-2 px-3 py-2.5 text-xs text-ink-2">
        <div className="eyebrow">m 与 m&apos; 怎么数</div>
        <p>
          <span className="text-ink">m</span>：高电平时，每个负载输入端各自流入 <Tex>{"I_{IH}"}</Tex>，按<span className="text-ink">输入端总数</span>计。
          <span className="text-ink"> m&apos;</span>：低电平时的负载输入端数。TTL <span className="text-ink">与非门</span>同一个门的几个输入并联时，低电平电流只相当于一个输入（多发射极共用一个基极电阻），所以 m&apos; 按
          <span className="text-ink">负载门个数</span>计；<span className="text-ink">或非门</span>各输入端独立，m&apos; = m。
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-muted">
            负载门类型
            <select className="select !h-8 !text-xs" value={kind} onChange={(e) => setKind(e.target.value as LoadGateKind)}>
              <option value="nand">与非门</option>
              <option value="nor">或非门</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-muted">
            门数
            <input className="input mono !h-8 w-16" value={gates} onChange={(e) => setGates(e.target.value)} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-0.5 text-muted">
            每门接入的输入端数
            <input className="input mono !h-8 w-16" value={perGate} onChange={(e) => setPerGate(e.target.value)} inputMode="numeric" />
          </label>
          {helper ? (
            <>
              <span className="mono pb-1.5 text-ink">
                → m = {helper.m}，m&apos; = {helper.mLow}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setTxt({ ...txt, m: String(helper.m), mLow: String(helper.mLow) })}>
                填入
              </button>
            </>
          ) : (
            <span className="pb-1.5 text-danger">✕ {helperErr}</span>
          )}
        </div>
        <p className="text-muted">
          最坏情况假设：求 R_min 时只有 1 个 OC 门导通、由它独自吸收全部电流；求 R_max 时 n 个 OC 门全部截止。电压单位 V、电流 mA，所以电阻单位是 kΩ。
        </p>
      </div>
    </section>
  );
}

function ResultView({ r }: { r: PullupResult }) {
  const p = r.input;
  return (
    <>
      <div className="card-inset space-y-1.5 overflow-x-auto thin-scroll px-3 py-2 text-sm">
        <div className="eyebrow">低电平约束 → 下限</div>
        <Tex display>{`R_{\\min}=\\frac{V_{CC}-V_{OL(\\max)}}{I_{OL(\\max)}-m'\\,|I_{IL}|}=\\frac{${p.VCC}-${p.VOL_max}}{${p.IOL_max}-${p.mLow}\\times${p.IIL}}=\\frac{${fmt(r.numMin)}\\,\\text{V}}{${fmt(r.denMin)}\\,\\text{mA}}\\approx${fmt(r.Rmin)}\\,\\text{k}\\Omega`}</Tex>
      </div>
      <div className="card-inset space-y-1.5 overflow-x-auto thin-scroll px-3 py-2 text-sm">
        <div className="eyebrow">高电平约束 → 上限</div>
        <Tex display>{`R_{\\max}=\\frac{V_{CC}-V_{OH(\\min)}}{n\\,I_{OH}+m\\,I_{IH}}=\\frac{${p.VCC}-${p.VOH_min}}{${p.n}\\times${p.IOH}+${p.m}\\times${p.IIH}}=\\frac{${fmt(r.numMax)}\\,\\text{V}}{${fmt(r.denMax)}\\,\\text{mA}}\\approx${fmt(r.Rmax)}\\,\\text{k}\\Omega`}</Tex>
      </div>
      {r.feasible ? (
        <div className="card-inset border-accent px-3 py-2">
          <div className="mono text-lg text-accent">
            {fmt(r.Rmin)} kΩ ≤ R_L ≤ {fmt(r.Rmax)} kΩ
          </div>
          <RangeBar r={r} />
          <p className="pt-1 text-xs text-muted">在范围内取标称值。R_L 小 → 上升沿快但功耗大；R_L 大 → 功耗小但上升沿慢（负载电容充电慢）。</p>
        </div>
      ) : (
        <div role="alert" className="card-inset border-danger px-3 py-2 text-sm text-danger">
          {r.warnings.map((w) => (
            <p key={w}>✕ {w}</p>
          ))}
        </div>
      )}
    </>
  );
}

/** 对数刻度的可行区间示意 */
function RangeBar({ r }: { r: PullupResult }) {
  const lo = Math.log10(r.Rmin);
  const hi = Math.log10(r.Rmax);
  const a = Math.floor(lo) - 0.3;
  const b = Math.ceil(hi) + 0.3;
  const x = (v: number) => 8 + ((v - a) / (b - a)) * 284;
  const decades: number[] = [];
  for (let d = Math.ceil(a); d <= Math.floor(b); d++) decades.push(d);
  return (
    <svg viewBox="0 0 300 40" className="mt-1 h-auto w-full" role="img" aria-label={`可行区间 ${fmt(r.Rmin)} 到 ${fmt(r.Rmax)} kΩ`}>
      <line x1={8} x2={292} y1={18} y2={18} stroke="var(--line-2)" />
      <rect x={x(lo)} y={12} width={Math.max(2, x(hi) - x(lo))} height={12} rx={3} fill="var(--accent-soft)" stroke="var(--accent)" />
      {decades.map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={14} y2={22} stroke="var(--muted)" />
          <text x={x(d)} y={36} textAnchor="middle" fontSize={9} fill="var(--muted)" className="mono">
            {fmt(10 ** d)}k
          </text>
        </g>
      ))}
    </svg>
  );
}
