"use client";

import { useMemo, useState } from "react";
import { romFromExpressions, expansionPlan, selectChip, parseAddress, formatSpec, formatWords, EXPANSION_TEXT, type RomTable, type ExpansionPlan, type SelectResult } from "@/lib/memory/memory";
import { toLatex, varToLatex } from "@/lib/logic";
import { Tex } from "@/components/ui/Tex";

type Mode = "rom" | "expand";
const MODE_TEXT: Record<Mode, string> = { rom: "用 ROM 实现组合函数", expand: "位扩展 / 字扩展" };

const ROM_PRESETS: { label: string; srcs: string[] }[] = [
  { label: "全加器", srcs: ["S = A⊕B⊕C", "CO = AB+AC+BC"] },
  { label: "3 位二进制→格雷码", srcs: ["G2 = A", "G1 = A⊕B", "G0 = B⊕C"] },
  { label: "2 位数平方", srcs: ["Y3 = AB", "Y2 = AB'", "Y1 = 0", "Y0 = B"] },
];

/** 逻辑电平徽标：颜色 + 字符 */
function Bit({ v, className = "" }: { v: 0 | 1; className?: string }) {
  return <span className={`lv ${v ? "lv-1" : "lv-0"} ${className}`}>{v}</span>;
}

/**
 * 多输出函数输入框（1～max 个）。
 */
export function FuncListInput({ srcs, onChange, max, prefix }: { srcs: string[]; onChange: (s: string[]) => void; max: number; prefix: string }) {
  return (
    <div className="space-y-2">
      {srcs.map((s, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            className="input mono flex-1 min-w-0"
            value={s}
            onChange={(e) => onChange(srcs.map((x, j) => (j === i ? e.target.value : x)))}
            spellCheck={false}
            aria-label={`第 ${i + 1} 个输出函数`}
            placeholder={`${prefix}${i + 1} = AB + A'C`}
          />
          {srcs.length > 1 && (
            <button className="btn btn-sm btn-ghost" onClick={() => onChange(srcs.filter((_, j) => j !== i))} aria-label={`删除第 ${i + 1} 个输出`} title="删除">
              ✕
            </button>
          )}
        </div>
      ))}
      {srcs.length < max && (
        <button className="btn btn-sm" onClick={() => onChange([...srcs, `${prefix}${srcs.length + 1} = 0`])}>
          ＋ 添加输出
        </button>
      )}
    </div>
  );
}

/**
 * 第 8 章 半导体存储器实验（逻辑层/理想模型）。
 *  - rom：多输出函数 → 地址译码器（全部最小项）→ 存储矩阵点阵；点击地址读出数据。
 *  - expand：单片规格 → 目标规格，画出地址线、片选译码器、数据线连接，并判断某地址选中哪一组。
 * 计算全部来自 lib/memory/memory.ts。
 */
export function MemoryLab({ mode: initial = "rom" }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  return (
    <div className="widget card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MODE_TEXT) as Mode[]).map((m) => (
          <button key={m} className={`btn btn-sm ${mode === m ? "!border-accent !text-accent !bg-[var(--accent-soft)]" : "btn-ghost"}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
            {MODE_TEXT[m]}
          </button>
        ))}
        <span className="chip chip-accent ml-auto">逻辑层 · 理想模型</span>
      </div>
      {mode === "rom" ? <RomPanel /> : <ExpandPanel />}
    </div>
  );
}

// ───────────────────────── ROM 模式 ─────────────────────────

function RomPanel() {
  const [srcs, setSrcs] = useState<string[]>(ROM_PRESETS[0].srcs);
  const [addr, setAddr] = useState(5);
  const res = useMemo(() => {
    try {
      return { ok: true as const, rom: romFromExpressions(srcs, { maxVars: 5, maxOutputs: 4 }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [srcs]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3 min-w-0 order-2 lg:order-1">
        {res.ok ? <RomView rom={res.rom} addr={Math.min(addr, res.rom.words - 1)} onAddr={setAddr} /> : <p className="text-danger text-sm card-inset p-3">{res.error}</p>}
      </div>
      <div className="space-y-3 text-sm order-1 lg:order-2">
        <div className="card-inset p-3 space-y-2">
          <div className="eyebrow">输出函数（1～4 个，变量 ≤ 5 个）</div>
          <FuncListInput srcs={srcs} onChange={setSrcs} max={4} prefix="Y" />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ROM_PRESETS.map((p) => (
              <button key={p.label} className="btn btn-sm btn-ghost" onClick={() => setSrcs(p.srcs)}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted leading-relaxed">写法：Y = AB + A&apos;C，非号用 &apos; 或 !，异或 ⊕ 或 ^。变量按字母顺序依次接地址线（第一个变量接最高位）。</p>
        </div>
        {res.ok && <RomSummary rom={res.rom} />}
      </div>
    </div>
  );
}

function RomSummary({ rom }: { rom: RomTable }) {
  const n = rom.vars.length;
  return (
    <div className="card-inset p-3 space-y-2 text-xs">
      <div className="eyebrow">ROM 规格</div>
      <p>
        {n} 个输入变量 → {n} 根地址线，{rom.words} 个字；{rom.bits} 个输出 → 每字 {rom.bits} 位。
      </p>
      <p>
        容量 <Tex>{`2^{${n}}\\times ${rom.bits} = ${rom.words}\\times ${rom.bits} = ${rom.totalBits}`}</Tex> 位；存储矩阵中有 <span className="mono text-amber">{rom.dots}</span> 个点（存 1）。
      </p>
      <div className="space-y-1 pt-1">
        {rom.outputs.map((o, i) => (
          <div key={o.name} className="overflow-x-auto thin-scroll">
            <Tex>{`${varToLatex(o.name)} = ${rom.minterms[i].length ? `\\sum m(${rom.minterms[i].join(",")})` : "0"}`}</Tex>
          </div>
        ))}
      </div>
    </div>
  );
}

function RomView({ rom, addr, onAddr }: { rom: RomTable; addr: number; onAddr: (a: number) => void }) {
  const n = rom.vars.length;
  const k = rom.bits;
  const W = rom.words;
  const rowH = n <= 3 ? 24 : n === 4 ? 18 : 14;
  const top = 58;
  const decX = 64;
  const decW = 92;
  const lineX0 = decX + decW;
  const matX = lineX0 + 70;
  const colW = 58;
  const width = matX + k * colW + 20;
  const height = top + W * rowH + 64;
  const yOf = (i: number) => top + i * rowH + rowH / 2;
  const sel = rom.rows[addr];
  const bitsOfAddr = (a: number) => Array.from({ length: n }, (_, j) => ((a >> (n - 1 - j)) & 1) as 0 | 1);
  const ab = bitsOfAddr(addr);
  const fs = rowH < 16 ? 9 : 10.5;

  return (
    <div className="space-y-3">
      {/* 地址开关 */}
      <div className="card-inset p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="text-muted">地址输入（点按切换）</span>
        {rom.vars.map((x, j) => (
          <button key={x} className="flex items-center gap-1.5" onClick={() => onAddr(addr ^ (1 << (n - 1 - j)))} aria-label={`切换变量 ${x}（地址线 A${n - 1 - j}），当前 ${ab[j]}`}>
            <span className="mono text-ink">{x}</span>
            <span className="mono text-muted">(A{n - 1 - j})</span>
            <Bit v={ab[j]} />
          </button>
        ))}
        <span className="ml-auto mono text-amber">
          地址 {sel.addrBits} = m{addr}
        </span>
      </div>

      <div className="card-inset p-2 overflow-x-auto thin-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ minWidth: Math.min(width, 460), maxWidth: width * 1.5 }} role="img" aria-label={`ROM 点阵图：${W} 条字线、${k} 条位线，当前地址 ${sel.addrBits}`}>
          {/* 地址输入 */}
          {rom.vars.map((x, j) => {
            const y = top + 14 + j * 20;
            const v = ab[j];
            return (
              <g key={x}>
                <text x={4} y={y + 4} fontSize={10.5} className="mono" fill="var(--ink)">
                  {x}
                </text>
                <text x={18} y={y + 4} fontSize={9} className="mono" fill="var(--muted)">
                  A{n - 1 - j}
                </text>
                <line x1={36} x2={decX} y1={y} y2={y} stroke={v ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={v ? 2 : 1.4} />
                <text x={decX - 6} y={y - 3} fontSize={9} textAnchor="end" className="mono" fill={v ? "var(--sig-1)" : "var(--sig-0)"}>
                  {v}
                </text>
              </g>
            );
          })}
          {/* 地址译码器 */}
          <rect x={decX} y={top - 4} width={decW} height={W * rowH + 8} rx={6} fill="var(--panel)" stroke="var(--line-2)" />
          <text x={decX + decW / 2} y={top - 26} fontSize={10.5} textAnchor="middle" fill="var(--ink-2)">
            地址译码器
          </text>
          <text x={decX + decW / 2} y={top - 13} fontSize={9} textAnchor="middle" fill="var(--muted)">
            与阵列 · 固定
          </text>
          {/* 存储矩阵标题 */}
          <text x={matX + ((k - 1) * colW) / 2} y={top - 26} fontSize={10.5} textAnchor="middle" fill="var(--ink-2)">
            存储矩阵
          </text>
          <text x={matX + ((k - 1) * colW) / 2} y={top - 13} fontSize={9} textAnchor="middle" fill="var(--muted)">
            或阵列 · 可编程（● = 存 1）
          </text>
          {/* 字线 */}
          {rom.rows.map((r) => {
            const y = yOf(r.addr);
            const on = r.addr === addr;
            return (
              <g key={r.addr} onClick={() => onAddr(r.addr)} style={{ cursor: "pointer" }}>
                <rect x={decX} y={y - rowH / 2} width={width - decX - 4} height={rowH} fill={on ? "var(--amber-soft)" : "transparent"} />
                <text x={decX + decW - 6} y={y + 3} fontSize={fs} textAnchor="end" className="mono" fill={on ? "var(--amber)" : "var(--muted)"}>
                  {r.addrBits} m{r.addr}
                </text>
                <line x1={lineX0} x2={matX + (k - 1) * colW + 14} y1={y} y2={y} stroke={on ? "var(--amber)" : "var(--line-2)"} strokeWidth={on ? 2.2 : 1} />
                <text x={lineX0 + 6} y={y - 2} fontSize={8.5} className="mono" fill={on ? "var(--amber)" : "var(--muted)"}>
                  W{r.addr}
                  {on ? "=1" : ""}
                </text>
              </g>
            );
          })}
          {/* 位线与点 */}
          {rom.outputs.map((o, j) => {
            const x = matX + j * colW;
            const v = sel.data[j];
            return (
              <g key={o.name}>
                <line x1={x} x2={x} y1={top - 4} y2={top + W * rowH + 14} stroke={v ? "var(--sig-1)" : "var(--sig-0)"} strokeWidth={v ? 2 : 1.2} strokeOpacity={0.9} />
                {rom.rows.map((r) =>
                  r.data[j] ? <circle key={r.addr} cx={x} cy={yOf(r.addr)} r={rowH < 16 ? 3.2 : 4.2} fill={r.addr === addr ? "var(--amber)" : "var(--ink)"} stroke="var(--bg-2)" strokeWidth={1} pointerEvents="none" /> : null,
                )}
                <text x={x} y={top + W * rowH + 30} fontSize={11} textAnchor="middle" className="mono" fill="var(--ink)">
                  {o.name}
                </text>
                <text x={x} y={top + W * rowH + 48} fontSize={12} fontWeight={700} textAnchor="middle" className="mono" fill={v ? "var(--sig-1)" : "var(--sig-0)"}>
                  {v}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="card-inset p-3 text-xs space-y-1">
        <div className="eyebrow mb-1">读出</div>
        <p>
          地址 <span className="mono">{sel.addrBits}</span> 经译码只使字线 <span className="mono text-amber">W{addr}</span>（最小项 m{addr}）为 1；每条位线把与它相连的字线“或”起来，于是读出
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {rom.outputs.map((o, j) => (
            <span key={o.name} className="flex items-center gap-1.5">
              <span className="mono">{o.name}</span>
              <Bit v={sel.data[j]} />
            </span>
          ))}
        </div>
        <p className="text-muted pt-1">点阵图中点击任意一行，或用上面的开关改变地址。每一列的点，就是该输出的最小项。</p>
      </div>

      <details className="card-inset p-3 text-xs">
        <summary className="cursor-pointer text-accent">ROM 地址/数据表（{rom.words} 行）</summary>
        <div className="overflow-x-auto thin-scroll mt-2 max-h-80">
          <table className="ltable">
            <thead>
              <tr>
                <th>地址</th>
                {rom.vars.map((x) => (
                  <th key={x}>{x}</th>
                ))}
                {rom.outputs.map((o, j) => (
                  <th key={o.name} className={j === 0 ? "sep" : ""}>
                    {o.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rom.rows.map((r) => (
                <tr key={r.addr} onClick={() => onAddr(r.addr)} style={{ cursor: "pointer", background: r.addr === addr ? "var(--amber-soft)" : undefined }}>
                  <td className="text-muted">m{r.addr}</td>
                  {[...r.addrBits].map((b, j) => (
                    <td key={j}>{b}</td>
                  ))}
                  {r.data.map((d, j) => (
                    <td key={j} className={j === 0 ? "sep" : ""}>
                      <Bit v={d} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-2 space-y-1">
          {rom.outputs.map((o) => (
            <div key={o.name} className="overflow-x-auto thin-scroll">
              <Tex>{`${varToLatex(o.name)} = ${toLatex(o.expr)}`}</Tex>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ───────────────────────── 扩展模式 ─────────────────────────

const CHIP_WORDS = [256, 512, 1024, 2048, 4096, 8192, 16384];
const TARGET_WORDS = [256, 512, 1024, 2048, 3072, 4096, 6144, 8192, 16384, 32768, 65536];
const BITS = [1, 2, 4, 8];
const TARGET_BITS = [1, 2, 4, 8, 16];

const EXPAND_PRESETS: { label: string; chip: [number, number]; target: [number, number]; addr: string }[] = [
  { label: "位扩展 1K×1→1K×8", chip: [1024, 1], target: [1024, 8], addr: "2C7" },
  { label: "字扩展 1K×8→4K×8", chip: [1024, 8], target: [4096, 8], addr: "9A5" },
  { label: "字位同时 1K×4→4K×8", chip: [1024, 4], target: [4096, 8], addr: "9A5" },
  { label: "1K×8→3K×8（有空余输出）", chip: [1024, 8], target: [3072, 8], addr: "5F0" },
];

function SpecSelect({ label, words, bits, wordOptions, bitOptions, onWords, onBits }: { label: string; words: number; bits: number; wordOptions: number[]; bitOptions: number[]; onWords: (w: number) => void; onBits: (b: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted">{label}</div>
      <div className="flex items-center gap-1.5">
        <select className="select flex-1 min-w-0" value={words} onChange={(e) => onWords(Number(e.target.value))} aria-label={`${label}字数`}>
          {wordOptions.map((w) => (
            <option key={w} value={w}>
              {formatWords(w)}
            </option>
          ))}
        </select>
        <span className="mono text-muted">×</span>
        <select className="select w-20" value={bits} onChange={(e) => onBits(Number(e.target.value))} aria-label={`${label}位数`}>
          {bitOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ExpandPanel() {
  const [cw, setCw] = useState(1024);
  const [cb, setCb] = useState(4);
  const [tw, setTw] = useState(4096);
  const [tb, setTb] = useState(8);
  const [addrText, setAddrText] = useState("9A5");

  const res = useMemo(() => {
    try {
      return { ok: true as const, plan: expansionPlan({ words: cw, bits: cb }, { words: tw, bits: tb }) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [cw, cb, tw, tb]);

  const pick = useMemo(() => {
    if (!res.ok) return null;
    try {
      return { ok: true as const, s: selectChip(res.plan, parseAddress(addrText)) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [res, addrText]);

  const sel = pick && pick.ok ? pick.s : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3 min-w-0 order-2 lg:order-1">
        {res.ok ? (
          <>
            <ExpandDiagram plan={res.plan} sel={sel} />
            <GroupTable plan={res.plan} sel={sel} />
          </>
        ) : (
          <p className="text-danger text-sm card-inset p-3">{res.error}</p>
        )}
      </div>
      <div className="space-y-3 text-sm order-1 lg:order-2">
        <div className="card-inset p-3 space-y-3">
          <SpecSelect label="单片规格" words={cw} bits={cb} wordOptions={CHIP_WORDS} bitOptions={BITS} onWords={setCw} onBits={setCb} />
          <SpecSelect label="目标存储器" words={tw} bits={tb} wordOptions={TARGET_WORDS} bitOptions={TARGET_BITS} onWords={setTw} onBits={setTb} />
          <div className="flex flex-wrap gap-1.5">
            {EXPAND_PRESETS.map((p) => (
              <button
                key={p.label}
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setCw(p.chip[0]);
                  setCb(p.chip[1]);
                  setTw(p.target[0]);
                  setTb(p.target[1]);
                  setAddrText(p.addr);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {res.ok && (
          <div className="card-inset p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="eyebrow">方案</span>
              <span className="chip chip-amber ml-auto">{EXPANSION_TEXT[res.plan.kind]}</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1 leading-relaxed">
              {res.plan.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}
        {res.ok && (
          <div className="card-inset p-3 space-y-2 text-xs">
            <label className="block space-y-1">
              <span className="eyebrow">输入一个地址（十六进制）</span>
              <input className="input mono w-full" value={addrText} onChange={(e) => setAddrText(e.target.value)} spellCheck={false} aria-label="系统地址（十六进制）" placeholder="例如 9A5 或 9A5H" />
            </label>
            {pick && !pick.ok && <p className="text-danger">{pick.error}</p>}
            {sel && <SelectReadout plan={res.plan} s={sel} />}
          </div>
        )}
      </div>
    </div>
  );
}

function groupBits(b: string) {
  // 从右往左每 4 位一组
  const out: string[] = [];
  for (let i = b.length; i > 0; i -= 4) out.unshift(b.slice(Math.max(0, i - 4), i));
  return out.join(" ");
}

function SelectReadout({ plan, s }: { plan: ExpansionPlan; s: SelectResult }) {
  const bin = s.address.toString(2).padStart(plan.addressLines, "0");
  const hi = plan.highAddressLines;
  return (
    <div className="space-y-1.5 leading-relaxed">
      <p>
        <span className="mono">{s.hex}H</span> = <span className="mono">{groupBits(bin)}B</span>（{plan.addressLines} 位）
      </p>
      {hi > 0 ? (
        <p>
          高位 <span className="mono">A{plan.addressLines - 1}</span>
          {hi > 1 && <span className="mono">～A{plan.chipAddressLines}</span>} = <span className="mono text-amber">{s.highBits}</span>
          {s.row === null ? (
            <span className="text-danger">：对应译码输出 Y{parseInt(s.highBits, 2)}′ 未接芯片，这个地址没有存储单元。</span>
          ) : (
            <>
              ：译码器 <span className="mono text-amber">Y{s.row}′ = 0</span>，其余输出为 1，选中第 {s.row} 组。
            </>
          )}
        </p>
      ) : (
        <p>没有字扩展：外部片选 CS′ 有效时所有芯片同时被选中。</p>
      )}
      {s.row !== null && (
        <p>
          被选中的芯片：<span className="mono text-amber">{s.chips.map((c) => `#${c}`).join("、")}</span>；片内地址{" "}
          <span className="mono">
            A{plan.chipAddressLines - 1}～A0 = {s.offsetHex}H
          </span>
          {plan.bitGroups > 1 && `，${plan.bitGroups} 片同时读写，各出 ${plan.chip.bits} 位拼成 ${plan.dataLines} 位`}。
        </p>
      )}
    </div>
  );
}

function GroupTable({ plan, sel }: { plan: ExpansionPlan; sel: SelectResult | null }) {
  return (
    <div className="card-inset p-2 overflow-x-auto thin-scroll">
      <table className="ltable w-full">
        <thead>
          <tr>
            <th>组</th>
            {plan.highAddressLines > 0 && <th>高位地址</th>}
            <th>片选</th>
            <th>芯片（数据位）</th>
            <th>地址范围</th>
          </tr>
        </thead>
        <tbody>
          {plan.groups.map((g) => {
            const on = sel?.row === g.row;
            return (
              <tr key={g.row} style={{ background: on ? "var(--amber-soft)" : undefined }}>
                <td className={on ? "text-amber" : ""}>{g.row}</td>
                {plan.highAddressLines > 0 && <td>{g.highBits}</td>}
                <td>
                  <Tex>{g.csLatex}</Tex>
                </td>
                <td className="text-left">
                  {plan.placements
                    .filter((p) => p.row === g.row)
                    .map((p) => `#${p.index}(D${p.dataHi}${p.dataHi !== p.dataLo ? `～D${p.dataLo}` : ""})`)
                    .join(" ")}
                </td>
                <td className={on ? "text-amber" : ""}>
                  {g.startHex}H～{g.endHex}H
                </td>
              </tr>
            );
          })}
          {plan.decoder?.unused.map((u) => (
            <tr key={`u${u}`}>
              <td className="text-muted">—</td>
              <td className="text-muted">{u.toString(2).padStart(plan.highAddressLines, "0")}</td>
              <td>
                <Tex>{`\\overline{Y_{${u}}}`}</Tex>
              </td>
              <td className="text-muted text-left">未用</td>
              <td className="text-muted">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MAX_DRAW_ROWS = 8;
const MAX_DRAW_COLS = 4;

function ExpandDiagram({ plan, sel }: { plan: ExpansionPlan; sel: SelectResult | null }) {
  const R = plan.wordGroups;
  const C = plan.bitGroups;
  if (R > MAX_DRAW_ROWS || C > MAX_DRAW_COLS)
    return (
      <p className="card-inset p-3 text-xs text-muted">
        共 {plan.chips} 片（{R} 组 × 每组 {C} 片），超过连接图的显示上限（≤ {MAX_DRAW_ROWS} 组、每组 ≤ {MAX_DRAW_COLS} 片）。下表仍列出完整的地址分配。
      </p>
    );
  const chipW = 92;
  const chipH = 50;
  const colPitch = chipW + 44;
  const rowPitch = chipH + 36;
  const gridX = 196;
  const gridY = 56;
  const busX = 168;
  const decX = 18;
  const decW = 92;
  const width = gridX + C * colPitch + 8;
  const height = gridY + R * rowPitch + 30;
  const csY = (r: number) => gridY + r * rowPitch + chipH + 12;
  const aY = (r: number) => gridY + r * rowPitch - 12;
  const chipX = (c: number) => gridX + (C - 1 - c) * colPitch; // 高位片在左
  const lastRight = gridX + (C - 1) * colPitch + 24;
  const lowLabel = plan.chipAddressLines ? `A${plan.chipAddressLines - 1}～A0` : "";
  const hiLabel = plan.highAddressLines ? `A${plan.addressLines - 1}${plan.highAddressLines > 1 ? `～A${plan.chipAddressLines}` : ""}` : "";
  const dataTop = gridY + chipH / 2;
  const dataBottom = gridY + R * rowPitch - 10;
  const active = (r: number) => sel?.row === r;
  return (
    <div className="card-inset p-2 overflow-x-auto thin-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ minWidth: Math.min(width, 520) }} role="img" aria-label={`${formatSpec(plan.chip)} 组成 ${formatSpec(plan.target)} 的连接图`}>
        {/* 低位地址总线 */}
        <text x={busX} y={14} fontSize={10.5} textAnchor="middle" className="mono" fill="var(--sig-z)">
          {lowLabel}
        </text>
        <text x={busX} y={26} fontSize={9} textAnchor="middle" className="mono" fill="var(--muted)">
          {sel ? `片内 ${sel.offsetHex}H` : `${plan.chipAddressLines} 根`}
        </text>
        <line x1={busX} x2={busX} y1={32} y2={aY(R - 1)} stroke="var(--sig-z)" strokeWidth={3} />
        {Array.from({ length: R }, (_, r) => (
          <g key={`a${r}`}>
            <line x1={busX} x2={lastRight} y1={aY(r)} y2={aY(r)} stroke="var(--sig-z)" strokeWidth={1.6} />
            <circle cx={busX} cy={aY(r)} r={3} fill="var(--sig-z)" />
            {Array.from({ length: C }, (_, c) => (
              <line key={c} x1={chipX(c) + 24} x2={chipX(c) + 24} y1={aY(r)} y2={gridY + r * rowPitch} stroke="var(--sig-z)" strokeWidth={1.6} />
            ))}
          </g>
        ))}
        {/* 片选：译码器或外部 CS */}
        {plan.decoder ? (
          <g>
            <text x={decX + decW / 2} y={14} fontSize={10.5} textAnchor="middle" className="mono" fill="var(--ink)">
              {hiLabel}
            </text>
            <text x={decX + decW / 2} y={26} fontSize={9} textAnchor="middle" className="mono" fill="var(--amber)">
              {sel ? `= ${sel.highBits}` : ""}
            </text>
            <line x1={decX + decW / 2} x2={decX + decW / 2} y1={32} y2={gridY - 4} stroke="var(--ink-2)" strokeWidth={2} />
            <rect x={decX} y={gridY - 4} width={decW} height={csY(R - 1) - gridY + 16} rx={6} fill="var(--panel)" stroke="var(--line-2)" />
            <text x={decX + 8} y={gridY + 12} fontSize={10} fill="var(--ink-2)">
              译码器
            </text>
            <text x={decX + 8} y={gridY + 25} fontSize={9} className="mono" fill="var(--muted)">
              {plan.decoder.inputs} 线-{plan.decoder.outputs} 线
            </text>
          </g>
        ) : (
          <text x={decX} y={csY(0) - 6} fontSize={10} className="mono" fill="var(--ink-2)">
            外部 CS′
          </text>
        )}
        {Array.from({ length: R }, (_, r) => {
          const on = sel ? (plan.decoder ? active(r) : true) : false;
          const col = on ? "var(--amber)" : "var(--line-2)";
          return (
            <g key={`cs${r}`}>
              <line x1={plan.decoder ? decX + decW : decX} x2={lastRight} y1={csY(r)} y2={csY(r)} stroke={col} strokeWidth={on ? 2.2 : 1.3} />
              {plan.decoder && (
                <text x={decX + decW - 5} y={csY(r) + 3} fontSize={9.5} textAnchor="end" className="mono" fill={on ? "var(--amber)" : "var(--ink-2)"}>
                  Y{r}′
                </text>
              )}
              <text x={(plan.decoder ? decX + decW : busX) + 6} y={csY(r) - 3} fontSize={9} className="mono" fill={on ? "var(--amber)" : "var(--muted)"}>
                {sel ? (on ? "0 有效" : "1") : ""}
              </text>
              {Array.from({ length: C }, (_, c) => (
                <line key={c} x1={chipX(c) + 24} x2={chipX(c) + 24} y1={gridY + r * rowPitch + chipH} y2={csY(r)} stroke={col} strokeWidth={on ? 2.2 : 1.3} />
              ))}
            </g>
          );
        })}
        {/* 数据总线（每个位组一条） */}
        {Array.from({ length: C }, (_, c) => {
          const x = chipX(c) + chipW + 16;
          const p = plan.placements.find((q) => q.col === c)!;
          return (
            <g key={`d${c}`}>
              <line x1={x} x2={x} y1={dataTop} y2={dataBottom} stroke="var(--accent)" strokeWidth={3} />
              <text x={x} y={dataBottom + 14} fontSize={10} textAnchor="middle" className="mono" fill="var(--accent)">
                D{p.dataHi}
                {p.dataHi !== p.dataLo ? `～D${p.dataLo}` : ""}
              </text>
              {Array.from({ length: R }, (_, r) => (
                <g key={r}>
                  <line x1={chipX(c) + chipW} x2={x} y1={gridY + r * rowPitch + chipH / 2} y2={gridY + r * rowPitch + chipH / 2} stroke="var(--accent)" strokeWidth={1.6} />
                  <circle cx={x} cy={gridY + r * rowPitch + chipH / 2} r={3} fill="var(--accent)" />
                </g>
              ))}
            </g>
          );
        })}
        {/* 芯片 */}
        {plan.placements.map((p) => {
          const x = chipX(p.col);
          const y = gridY + p.row * rowPitch;
          const on = sel ? (plan.decoder ? active(p.row) : true) : false;
          return (
            <g key={p.index}>
              <rect x={x} y={y} width={chipW} height={chipH} rx={5} fill={on ? "var(--amber-soft)" : "var(--panel)"} stroke={on ? "var(--amber)" : "var(--line-2)"} strokeWidth={on ? 2 : 1} />
              <text x={x + 30} y={y + 13} fontSize={8.5} className="mono" fill="var(--sig-z)">
                A
              </text>
              <text x={x + 30} y={y + chipH - 5} fontSize={8.5} className="mono" fill={on ? "var(--amber)" : "var(--muted)"}>
                CS′
              </text>
              <text x={x + chipW - 6} y={y + chipH / 2 + 3} fontSize={8.5} textAnchor="end" className="mono" fill="var(--accent)">
                D
              </text>
              <text x={x + chipW / 2 + 6} y={y + 22} fontSize={11} fontWeight={700} textAnchor="middle" className="mono" fill={on ? "var(--amber)" : "var(--ink)"}>
                #{p.index}
              </text>
              <text x={x + chipW / 2 + 6} y={y + 35} fontSize={9} textAnchor="middle" className="mono" fill="var(--ink-2)">
                {formatSpec(plan.chip)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[11px] text-muted px-1 pb-1">
        蓝线：低位地址（所有芯片并联）；琥珀线：被选中的片选（低电平有效）；绿线：数据线。读写控制 R/W′ 同样并联到所有芯片，图中省略。
      </p>
    </div>
  );
}
