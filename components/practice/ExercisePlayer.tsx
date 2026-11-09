"use client";

import { useMemo, useState } from "react";
import type { Exercise, GradeResult, Level } from "@/lib/exercises/types";
import { grade, exerciseCircuit, type Answer } from "@/lib/exercises/grade";
import { RichText } from "@/components/ui/RichText";
import { Tex } from "@/components/ui/Tex";
import { KMap } from "@/components/karnaugh/KMap";
import { Waveform } from "@/components/waveform/Waveform";
import { tryParse, toLatex, parseExpr } from "@/lib/logic";
import { stateBits, FF_PINS } from "@/lib/fsm/analyze";
import { useLab } from "@/lib/storage/store";
import type { CellValue } from "@/lib/logic/kmap";
import type { TracePoint } from "@/lib/sim/types";

export const LEVEL_TEXT: Record<Level, string> = { basic: "基础", analysis: "计算与分析", design: "综合设计" };

export function ExercisePlayer({ ex, index }: { ex: Exercise; index?: number }) {
  const record = useLab((s) => s.record);
  const attempt = useLab((s) => s.attempts[ex.id]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [tries, setTries] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const submit = () => {
    if (!answer) return;
    const r = grade(ex, answer);
    setResult(r);
    setTries((t) => t + 1);
    record(ex.id, r.correct, r.correct ? undefined : r.category);
  };
  const hintCount = result && !result.correct ? Math.min(tries, ex.hints.length) : 0;
  return (
    <article className="card p-4 sm:p-5 space-y-3" data-exercise={ex.id}>
      <header className="flex flex-wrap items-center gap-2">
        {index !== undefined && <span className="mono text-xs text-muted">#{index + 1}</span>}
        <span className={`chip ${ex.level === "design" ? "chip-amber" : ex.level === "analysis" ? "chip-accent" : ""}`}>{LEVEL_TEXT[ex.level]}</span>
        {ex.exam && <span className="chip chip-amber">通行考试题型</span>}
        <h3 className="font-semibold">{ex.title}</h3>
        {attempt?.correct && <span className="ml-auto text-accent text-xs">✓ 已掌握</span>}
      </header>
      <div className="text-[15px] leading-relaxed">
        <RichText text={ex.prompt} />
      </div>
      <AnswerInput ex={ex} onChange={setAnswer} details={result?.details} />
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!answer} data-testid={`submit-${ex.id}`}>
          提交
        </button>
        {!reveal && (tries > 0 || attempt) && (
          <button className="btn btn-sm btn-ghost" onClick={() => setReveal(true)}>
            {result?.correct ? "查看解析" : "放弃并看解析"}
          </button>
        )}
        {result && (
          <span role="status" className={`text-sm ${result.correct ? "text-accent" : result.partial ? "text-amber" : "text-danger"}`}>
            {result.correct ? "✓ " : result.partial ? "△ " : "✕ "}
            <RichText text={result.feedback} />
          </span>
        )}
      </div>
      {hintCount > 0 && (
        <ul className="space-y-1">
          {ex.hints.slice(0, hintCount).map((h, i) => (
            <li key={i} className="text-sm text-amber flex gap-2">
              <span className="mono text-xs pt-0.5">提示 {i + 1}</span>
              <RichText text={h} />
            </li>
          ))}
        </ul>
      )}
      {(reveal || result?.correct) && (
        <div className="card-inset p-3 text-sm leading-relaxed">
          <div className="eyebrow mb-1">解析</div>
          <RichText text={ex.explanation} />
        </div>
      )}
    </article>
  );
}

function AnswerInput({ ex, onChange, details }: { ex: Exercise; onChange: (a: Answer | null) => void; details?: boolean[] }) {
  switch (ex.kind) {
    case "choice":
      return <ChoiceInput ex={ex} onChange={onChange} />;
    case "numeric":
      return (
        <label className="flex items-center gap-2">
          <input className="input mono w-48" type="number" step="any" onChange={(e) => onChange(e.target.value === "" ? null : { kind: "numeric", value: Number(e.target.value) })} aria-label="数值答案" />
          {ex.unit && <span className="text-sm text-muted">{ex.unit}</span>}
        </label>
      );
    case "text":
      return <input className="input mono w-full max-w-md" placeholder={ex.placeholder ?? "输入答案"} onChange={(e) => onChange(e.target.value.trim() ? { kind: "text", value: e.target.value } : null)} aria-label="文本答案" />;
    case "expression":
      return <ExprInput vars={ex.vars} onChange={onChange} />;
    case "kmap":
      return <KMapInput vars={ex.vars} minterms={ex.minterms} dontCares={ex.dontCares ?? []} onChange={onChange} />;
    case "statetable":
      return <StateTableInput ex={ex} onChange={onChange} details={details} />;
    case "waveform":
      return <WaveInput ex={ex} onChange={onChange} details={details} />;
  }
}

function ChoiceInput({ ex, onChange }: { ex: Extract<Exercise, { kind: "choice" }>; onChange: (a: Answer | null) => void }) {
  const multi = Array.isArray(ex.answer);
  const [sel, setSel] = useState<number[]>([]);
  const toggle = (i: number) => {
    const next = multi ? (sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]) : [i];
    setSel(next);
    onChange(next.length ? { kind: "choice", value: multi ? next : next[0] } : null);
  };
  return (
    <div className="grid gap-1.5" role={multi ? "group" : "radiogroup"}>
      {multi && <span className="text-xs text-muted">（多选）</span>}
      {ex.options.map((o, i) => (
        <button key={i} onClick={() => toggle(i)} className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${sel.includes(i) ? "border-accent bg-[var(--accent-soft)]" : "border-line hover:border-line-2"}`} role={multi ? "checkbox" : "radio"} aria-checked={sel.includes(i)}>
          <span className="mono text-xs text-muted mr-2">{String.fromCharCode(65 + i)}</span>
          <RichText text={o} />
        </button>
      ))}
    </div>
  );
}

function ExprInput({ vars, onChange }: { vars: string[]; onChange: (a: Answer | null) => void }) {
  const [src, setSrc] = useState("");
  const neg = useLab((s) => s.settings.negation);
  const r = src.trim() ? tryParse(src) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="mono text-sm text-muted">Y =</span>
        <input
          className="input mono flex-1 max-w-lg"
          value={src}
          onChange={(e) => {
            setSrc(e.target.value);
            onChange(e.target.value.trim() ? { kind: "expression", value: e.target.value } : null);
          }}
          placeholder={`变量：${vars.join(" ")}；写法 A'B + AC`}
          spellCheck={false}
          aria-label="表达式答案"
        />
      </div>
      {r && (r.ok ? <Tex className="text-sm">{`Y = ${toLatex(r.expr, { negation: neg })}`}</Tex> : <p className="text-xs text-danger">{r.error}</p>)}
    </div>
  );
}

function KMapInput({ vars, minterms, dontCares, onChange }: { vars: string[]; minterms: number[]; dontCares: number[]; onChange: (a: Answer | null) => void }) {
  const [groups, setGroups] = useState<number[][]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const values: CellValue[] = Array.from({ length: 1 << vars.length }, (_, i) => (minterms.includes(i) ? 1 : dontCares.includes(i) ? "x" : 0));
  const update = (g: number[][]) => {
    setGroups(g);
    onChange(g.length ? { kind: "kmap", groups: g } : null);
  };
  return (
    <div className="space-y-2">
      <KMap vars={vars} values={values} groups={groups} selecting={sel} onCellClick={(m) => setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))} />
      <div className="flex gap-2">
        <button
          className="btn btn-sm"
          disabled={!sel.length}
          onClick={() => {
            update([...groups, sel]);
            setSel([]);
          }}
        >
          添加圈（{sel.length} 格）
        </button>
        <button className="btn btn-sm btn-ghost" disabled={!groups.length} onClick={() => update(groups.slice(0, -1))}>
          撤销
        </button>
        <span className="text-xs text-muted self-center">已画 {groups.length} 个圈</span>
      </div>
    </div>
  );
}

function StateTableInput({ ex, onChange, details }: { ex: Extract<Exercise, { kind: "statetable" }>; onChange: (a: Answer | null) => void; details?: boolean[] }) {
  const neg = useLab((s) => s.settings.negation);
  const c = useMemo(() => exerciseCircuit(ex), [ex]);
  const n = c.ffs.length;
  const k = c.inputs.length;
  const rows = (1 << n) * (1 << k);
  const [next, setNext] = useState<string[]>(Array(rows).fill(""));
  const [outs, setOuts] = useState<string[][]>(Array.from({ length: rows }, () => c.outputs.map(() => "")));
  const emit = (nx: string[], os: string[][]) => {
    const parsed = nx.map((s) => (new RegExp(`^[01]{${n}}$`).test(s) ? parseInt(s, 2) : null));
    const po = os.map((r) => r.map((s) => (s === "0" || s === "1" ? Number(s) : null)));
    onChange(parsed.some((x) => x === null) ? null : { kind: "statetable", next: parsed, outputs: c.outputs.length ? po : undefined });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {c.ffs.map((ff) =>
          FF_PINS[ff.type].map((p) => (
            <Tex key={ff.name + p}>{`${p}_{${ff.name.replace(/^Q/, "")}} = ${toLatex(ff.inputs[p]!, { negation: neg })}`}</Tex>
          )),
        )}
        {c.outputs.map((o) => (
          <Tex key={o.name}>{`${o.name} = ${toLatex(o.expr, { negation: neg })}`}</Tex>
        ))}
        <span className="text-xs text-muted self-center">（{c.ffs.map((f) => `${f.name}: ${f.type}`).join("，")}）</span>
      </div>
      <div className="overflow-x-auto thin-scroll">
        <table className="ltable">
          <thead>
            <tr>
              <th>{c.ffs.map((f) => f.name).join("")}</th>
              {k > 0 && <th className="sep">{c.inputs.join("")}</th>}
              <th className="sep">次态</th>
              {c.outputs.map((o) => (
                <th key={o.name} className="sep">
                  {o.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => {
              const s = Math.floor(i / (1 << k));
              const x = i % (1 << k);
              const bad = details && details[i] === false;
              return (
                <tr key={i}>
                  <td>{stateBits(s, n)}</td>
                  {k > 0 && <td className="sep">{stateBits(x, k)}</td>}
                  <td className="sep">
                    <input
                      className={`input mono !h-7 w-20 text-center ${bad ? "!border-[var(--danger)]" : ""}`}
                      maxLength={n}
                      value={next[i]}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^01]/g, "");
                        const nx = next.map((y, j) => (j === i ? v : y));
                        setNext(nx);
                        emit(nx, outs);
                      }}
                      aria-label={`现态 ${stateBits(s, n)} 的次态`}
                    />
                  </td>
                  {c.outputs.map((o, oi) => (
                    <td key={o.name} className="sep">
                      <input
                        className="input mono !h-7 w-10 text-center"
                        maxLength={1}
                        value={outs[i][oi]}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^01]/g, "");
                          const os = outs.map((r, j) => (j === i ? r.map((y, q) => (q === oi ? v : y)) : r));
                          setOuts(os);
                          emit(next, os);
                        }}
                        aria-label={`输出 ${o.name}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WaveInput({ ex, onChange, details }: { ex: Extract<Exercise, { kind: "waveform" }>; onChange: (a: Answer | null) => void; details?: boolean[] }) {
  const pins = Object.keys(ex.inputs);
  const N = ex.inputs[pins[0]].length;
  const [q, setQ] = useState<(0 | 1 | null)[]>(Array(N).fill(null));
  const P = 100;
  const rising = ex.edge === "rising";
  const start = rising ? P / 2 : 0;
  const clk: TracePoint[] = [{ t: 0, d: 0, v: 0 }];
  for (let k = 0; k < N; k++) {
    clk.push({ t: start + k * P, d: 0, v: 1 }, { t: start + k * P + P / 2, d: 0, v: 0 });
  }
  const inTrace = (bits: (0 | 1)[]) => {
    const off = rising ? -P / 4 : P / 4;
    const tr: TracePoint[] = [{ t: 0, d: 0, v: bits[0] }];
    bits.forEach((b, k) => k > 0 && tr.push({ t: start + k * P + off, d: 0, v: b }));
    return tr;
  };
  const edges = Array.from({ length: N }, (_, k) => (rising ? start + k * P : k * P + P / 2));
  return (
    <div className="space-y-2">
      <Waveform
        t1={start + N * P}
        channels={[{ kind: "bit", name: "CLK", points: clk, clock: true }, ...pins.map((p) => ({ kind: "bit" as const, name: p, points: inTrace(ex.inputs[p]) }))]}
        markers={edges.map((t, i) => ({ t, label: String(i + 1), tone: "amber" as const }))}
        title={`${ex.ff} 触发器 · ${rising ? "上升沿" : "下降沿"}触发 · 初态 Q=${ex.init}`}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted">第 1～{N} 个有效沿之后的 Q：</span>
        {q.map((v, i) => (
          <button
            key={i}
            className={`lv !w-7 ${v === null ? "lv-z" : v ? "lv-1" : "lv-0"} ${details && details[i] === false ? "ring-2 ring-[var(--sig-x)]" : ""}`}
            onClick={() => {
              const nq = q.map((x, j) => (j === i ? (x === null ? 1 : x === 1 ? 0 : 1) : x)) as (0 | 1 | null)[];
              setQ(nq);
              onChange(nq.some((x) => x === null) ? null : { kind: "waveform", q: nq });
            }}
            aria-label={`第 ${i + 1} 个沿后 Q`}
          >
            {v ?? "?"}
          </button>
        ))}
      </div>
    </div>
  );
}

export { parseExpr };
