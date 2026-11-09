"use client";

import { useState } from "react";
import { Tex } from "@/components/ui/Tex";
import {
  WIDTHS,
  type Width,
  type TwosOpResult,
  encodeAll,
  smRange,
  twosRange,
  tryOp,
  tryParseDecimalInt,
} from "@/lib/numbers/complement";

function Bits({ bits, signBit = true }: { bits: string; signBit?: boolean }) {
  const n = bits.length;
  return (
    <span className="inline-flex flex-nowrap items-center gap-0.5">
      {[...bits].map((b, k) => (
        <span key={k} className="inline-flex items-center">
          <span
            className={`lv ${b === "1" ? "lv-1" : "lv-0"} ${signBit && k === 0 ? "outline outline-1 outline-offset-1 outline-amber" : ""}`}
            title={signBit && k === 0 ? "符号位" : `b${n - 1 - k}`}
          >
            {b}
          </span>
          {(n - 1 - k) % 4 === 0 && k !== n - 1 && <span className="w-1" aria-hidden />}
        </span>
      ))}
    </span>
  );
}

function CodeRows({ label, text, n }: { label: string; text: string; n: Width }) {
  const p = tryParseDecimalInt(text);
  if (!p.ok) return <p className="text-sm text-danger">✕ {label}：{p.error}</p>;
  const e = encodeAll(p.value.value, n, p.value.negativeZero);
  const rows: [string, string | null][] = [
    ["原码", e.sm],
    ["反码", e.ones],
    ["补码", e.twos],
  ];
  return (
    <div className="card-inset space-y-1.5 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink-2">
          {label} = <span className="mono text-ink">{p.value.negativeZero ? "−0" : p.value.value}</span>
        </span>
        <span className="eyebrow">{n} 位</span>
      </div>
      {rows.map(([name, bits]) => (
        <div key={name} className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-xs text-muted">{name}</span>
          <div className="min-w-0 overflow-x-auto thin-scroll">
            {bits ? <Bits bits={bits} /> : <span className="chip chip-danger">超出范围</span>}
          </div>
        </div>
      ))}
      {e.notes.map((t) => (
        <p key={t} className="text-xs text-amber">
          {t}
        </p>
      ))}
    </div>
  );
}

export function ComplementLab() {
  const [n, setN] = useState<Width>(8);
  const [aText, setA] = useState("127");
  const [bText, setB] = useState("1");
  const [op, setOp] = useState<"add" | "sub">("add");

  const pa = tryParseDecimalInt(aText);
  const pb = tryParseDecimalInt(bText);
  const res = pa.ok && pb.ok ? tryOp(op, pa.value.value, pb.value.value, n) : null;
  const tr = twosRange(n);
  const sr = smRange(n);

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-label="原码反码补码实验">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">交互实验 · 带符号数</div>
          <div className="text-base font-semibold text-ink">原码 / 反码 / 补码与补码加减</div>
        </div>
        <span className="chip">逻辑层 · 定点整数</span>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-muted">
          位数 n
          <select className="select mono" value={n} onChange={(e) => setN(Number(e.target.value) as Width)}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          A（十进制整数）
          <input className="input mono" value={aText} onChange={(e) => setA(e.target.value)} inputMode="numeric" aria-invalid={!pa.ok} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          B（十进制整数）
          <input className="input mono" value={bText} onChange={(e) => setB(e.target.value)} inputMode="numeric" aria-invalid={!pb.ok} />
        </label>
        <div className="flex gap-1" role="group" aria-label="运算">
          <button type="button" className={`btn ${op === "add" ? "btn-primary" : ""}`} onClick={() => setOp("add")}>
            A + B
          </button>
          <button type="button" className={`btn ${op === "sub" ? "btn-primary" : ""}`} onClick={() => setOp("sub")}>
            A − B
          </button>
        </div>
      </div>

      <p className="mono text-xs text-muted">
        {n} 位范围：补码 [{tr.min}, +{tr.max}]；原码、反码 [{sr.min}, +{sr.max}]（含 ±0）
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CodeRows label="A" text={aText} n={n} />
        <CodeRows label="B" text={bText} n={n} />
      </div>

      {res && !res.ok && (
        <p role="alert" className="card-inset px-3 py-2 text-sm text-danger">
          ✕ {res.error}
        </p>
      )}
      {res && res.ok && <Column r={res.value} />}

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        试试：
        {(
          [
            ["127", "1", "add"],
            ["-128", "-1", "add"],
            ["-5", "-3", "add"],
            ["5", "7", "sub"],
            ["-1", "-128", "sub"],
          ] as const
        ).map(([a, b, o]) => (
          <button
            key={a + o + b}
            type="button"
            className="btn btn-sm mono"
            onClick={() => {
              setN(8);
              setA(a);
              setB(b);
              setOp(o);
            }}
          >
            {a} {o === "add" ? "+" : "−"} ({b})
          </button>
        ))}
        <span>（8 位）</span>
      </div>
    </section>
  );
}

function Column({ r }: { r: TwosOpResult }) {
  const n = r.n;
  const cols = `auto 1.6rem repeat(${n}, 1.6rem)`;
  const bitCell = (b: string, k: number, extra = "") => (
    <span key={k} className={`lv ${b === "1" ? "lv-1" : "lv-0"} ${extra}`}>
      {b}
    </span>
  );
  const carryCell = (i: number) => {
    const v = r.carries[i];
    const hl = i === n || i === n - 1;
    return (
      <span
        key={`c${i}`}
        className={`mono grid h-5 place-items-center rounded text-[0.7rem] ${hl ? "bg-amber/15 text-amber outline outline-1 outline-amber" : "text-muted"}`}
        title={`C${i}`}
      >
        {v}
      </span>
    );
  };
  return (
    <div className="card-inset space-y-3 p-3">
      <div className="eyebrow">
        补码{r.op === "add" ? "加法" : "减法"}竖式：[A{r.op === "add" ? "+" : "−"}B]补 = [A]补 + {r.addendLabel}
      </div>
      {r.notes.length > 1 && <p className="text-xs text-ink-2">{r.notes[0]}</p>}
      <div className="overflow-x-auto thin-scroll pb-1">
        <div className="mono inline-grid items-center gap-x-0.5 gap-y-1 text-xs" style={{ gridTemplateColumns: cols }}>
          {/* 位号 */}
          <span className="text-muted">位</span>
          <span className="text-center text-muted">进位</span>
          {Array.from({ length: n }, (_, k) => (
            <span key={k} className={`text-center text-[0.65rem] ${k === 0 ? "text-amber" : "text-muted"}`}>
              {k === 0 ? "符" : n - 1 - k}
            </span>
          ))}
          {/* 进位行：Cn 在符号位左侧；C_i 写在第 i 位上方 */}
          <span className="text-muted">进位 C</span>
          {carryCell(n)}
          {Array.from({ length: n }, (_, k) => carryCell(n - 1 - k))}
          {/* A */}
          <span className="text-ink-2">[A]补</span>
          <span />
          {[...r.a].map((b, k) => bitCell(b, k))}
          {/* B */}
          <span className="whitespace-nowrap pr-1 text-ink-2">+ {r.addendLabel}</span>
          <span />
          {[...r.b].map((b, k) => bitCell(b, k))}
          {/* 横线 */}
          <span className="my-0.5 h-px bg-line-2" style={{ gridColumn: `1 / span ${n + 2}` }} />
          {/* 和 */}
          <span className="text-ink-2">和</span>
          <span className={`text-center ${r.cn ? "text-amber line-through" : "text-muted"}`} title="Cn 丢弃">
            {r.cn}
          </span>
          {[...r.sum].map((b, k) => bitCell(b, k))}
        </div>
      </div>
      <p className="text-xs text-muted">
        进位行第 i 列的数字是进入第 i 位的进位 C<sub>i</sub>；黄框是 C<sub>n</sub>（符号位产生的进位，最左）与 C<sub>n−1</sub>
        （次高位进入符号位的进位，写在符号位上方）。和左侧的 C<sub>n</sub> 被丢弃。
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Tex>{`V = C_{${n}} \\oplus C_{${n - 1}} = ${r.cn} \\oplus ${r.cn1} = ${r.overflow ? 1 : 0}`}</Tex>
        {r.overflow ? <span className="chip chip-danger">✕ 溢出</span> : <span className="chip chip-accent">✓ 无溢出</span>}
      </div>
      <div className="mono grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <span>
          和按补码读：<span className={r.overflow ? "text-danger" : "text-accent"}>{r.resultValue}</span>
        </span>
        <span>
          真值 A {r.op === "add" ? "+" : "−"} B = <span className="text-ink">{r.trueValue}</span>
        </span>
      </div>
      <p className={`text-xs ${r.overflow ? "text-danger" : "text-ink-2"}`}>{r.notes[r.notes.length - 1]}</p>
    </div>
  );
}
