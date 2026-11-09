"use client";

import { useState } from "react";
import { Tex } from "@/components/ui/Tex";
import {
  RADIXES,
  RADIX_NAME,
  type ParsedNumber,
  type Radix,
  digitChar,
  divisionSteps,
  multiplySteps,
  rationalToDecimal,
  rationalToNumber,
  toBase,
  tryParseNumber,
} from "@/lib/numbers/radix";

const PRECISIONS = [4, 6, 8, 10, 12, 16, 20, 24];
const EXAMPLES: { text: string; base: Radix }[] = [
  { text: "13.625", base: 10 },
  { text: "0.1", base: 10 },
  { text: "-6.75", base: 10 },
  { text: "1101.101", base: 2 },
  { text: "3A.C", base: 16 },
];

/** 按权展开（最多展示 16 位数字） */
function expansionTex(text: string, base: Radix, p: ParsedNumber, valueText: string): string {
  const body = text.trim().replace(/[\s_+-]/g, "").toUpperCase();
  const [ip = "", fp = ""] = body.split(".");
  const terms: string[] = [];
  [...ip].forEach((ch, i) => terms.push(`${parseInt(ch, 16)}\\times${base}^{${ip.length - 1 - i}}`));
  [...fp].forEach((ch, i) => terms.push(`${parseInt(ch, 16)}\\times${base}^{-${i + 1}}`));
  const shown = terms.length > 16 ? [...terms.slice(0, 16), "\\cdots"] : terms;
  const sign = p.negative ? "-" : "";
  return `${sign}(${body})_{${base}} = ${sign}(${shown.join("+") || "0"}) = ${valueText}_{(10)}`;
}

export function BaseConverter() {
  const [text, setText] = useState("13.625");
  const [from, setFrom] = useState<Radix>(10);
  const [precision, setPrecision] = useState(10);
  const [stepBase, setStepBase] = useState<Radix>(2);

  const parsed = tryParseNumber(text, from);

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-label="进制转换器">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">交互实验 · 数制</div>
          <div className="text-base font-semibold text-ink">进制转换器（含小数）</div>
        </div>
        <span className="chip">逻辑层 · 精确有理数运算</span>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          输入数值
          <input
            className="input mono w-full"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!parsed.ok}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          输入进制
          <select className="select" value={from} onChange={(e) => setFrom(Number(e.target.value) as Radix)}>
            {RADIXES.map((b) => (
              <option key={b} value={b}>
                {RADIX_NAME[b]}（{b}）
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          小数位数上限 N
          <select className="select mono" value={precision} onChange={(e) => setPrecision(Number(e.target.value))}>
            {PRECISIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">示例：</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.text + ex.base}
            type="button"
            className="btn btn-sm mono"
            onClick={() => {
              setText(ex.text);
              setFrom(ex.base);
            }}
          >
            {ex.text}
            <sub>{ex.base}</sub>
          </button>
        ))}
      </div>

      {!parsed.ok ? (
        <p role="alert" className="card-inset border-danger px-3 py-2 text-sm text-danger">
          ✕ {parsed.error}
        </p>
      ) : (
        <Results value={parsed.value} from={from} text={text} precision={precision} stepBase={stepBase} setStepBase={setStepBase} />
      )}
    </section>
  );
}

function Results({
  value,
  from,
  text,
  precision,
  stepBase,
  setStepBase,
}: {
  value: ParsedNumber;
  from: Radix;
  text: string;
  precision: number;
  stepBase: Radix;
  setStepBase: (b: Radix) => void;
}) {
  const results = RADIXES.map((b) => toBase(value, b, b === 10 ? 64 : precision));
  const dec = results[2];
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {results.map((r) => (
          <div key={r.base} className={`card-inset px-3 py-2 ${r.base === from ? "border-accent" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">
                {RADIX_NAME[r.base]} · {r.base}
              </span>
              {r.base === from ? (
                <span className="chip chip-accent">输入</span>
              ) : r.exact ? (
                <span className="chip">精确</span>
              ) : (
                <span className="chip chip-amber">截断到 {r.fracDigits} 位</span>
              )}
            </div>
            <div className="mono mt-1 break-all text-lg text-ink">
              {r.text}
              <sub className="text-muted">({r.base})</sub>
            </div>
            {!r.exact && (
              <div className="mono mt-1 text-xs text-amber">
                误差 = 原值 − 截断值 ≈ {rationalToNumber(r.error).toExponential(3)}（&lt; {r.base}
                <sup>−{r.fracDigits}</sup>）
                <span className="block break-all text-muted">精确值：{r.errorText}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {from === 10 ? (
        <Steps value={value} precision={precision} stepBase={stepBase} setStepBase={setStepBase} />
      ) : (
        <div className="card-inset space-y-1 px-3 py-2 text-sm">
          <div className="eyebrow">按权展开（{RADIX_NAME[from]} → 十进制）</div>
          <div className="overflow-x-auto thin-scroll py-1">
            <Tex>{expansionTex(text, from, value, dec.text)}</Tex>
          </div>
          <p className="text-xs text-muted">“除基取余 / 乘基取整”的逐步过程表在输入为十进制时显示。</p>
        </div>
      )}
    </>
  );
}

function Steps({
  value,
  precision,
  stepBase,
  setStepBase,
}: {
  value: ParsedNumber;
  precision: number;
  stepBase: Radix;
  setStepBase: (b: Radix) => void;
}) {
  const div = divisionSteps(value.intPart, stepBase);
  const mul = multiplySteps(value.fracNum, value.den, stepBase, precision);
  const intDigits = [...div].reverse().map((s) => digitChar(s.remainder)).join("");
  const fracDigits = mul.steps.map((s) => digitChar(s.digit)).join("");
  const B = stepBase;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">逐步过程：十进制 →</span>
        {([2, 8, 16] as Radix[]).map((b) => (
          <button key={b} type="button" className={`btn btn-sm ${b === stepBase ? "btn-primary" : ""}`} onClick={() => setStepBase(b)}>
            {RADIX_NAME[b]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card-inset p-2">
          <div className="px-1 pb-1 text-sm text-ink-2">
            整数部分 <span className="mono">{value.intPart.toString()}</span>：除 {B} 取余
          </div>
          <div className="overflow-x-auto thin-scroll">
            <table className="ltable w-full">
              <thead>
                <tr>
                  <th>被除数</th>
                  <th>÷{B} 商</th>
                  <th>余数</th>
                  <th>位</th>
                </tr>
              </thead>
              <tbody>
                {div.map((s) => (
                  <tr key={s.bitIndex}>
                    <td className="mono">{s.dividend.toString()}</td>
                    <td className="mono">{s.quotient.toString()}</td>
                    <td className="mono text-accent">{digitChar(s.remainder)}</td>
                    <td className="mono text-muted">
                      k<sub>{s.bitIndex}</sub>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-1 pt-1 text-xs text-muted">
            商为 0 停止；余数<span className="text-ink">自下而上</span>读（先得到的是最低位）：
            <span className="mono text-accent"> {intDigits}</span>
          </p>
        </div>

        <div className="card-inset p-2">
          <div className="px-1 pb-1 text-sm text-ink-2">
            小数部分 <span className="mono">{rationalToDecimal({ num: value.fracNum, den: value.den })}</span>：乘 {B} 取整
          </div>
          {mul.steps.length === 0 ? (
            <p className="px-1 text-xs text-muted">没有小数部分。</p>
          ) : (
            <div className="overflow-x-auto thin-scroll">
              <table className="ltable w-full">
                <thead>
                  <tr>
                    <th>小数</th>
                    <th>×{B} 积</th>
                    <th>取整</th>
                    <th>位</th>
                  </tr>
                </thead>
                <tbody>
                  {mul.steps.map((s) => (
                    <tr key={s.position}>
                      <td className="mono">{rationalToDecimal(s.fraction)}</td>
                      <td className="mono">{rationalToDecimal(s.product)}</td>
                      <td className="mono text-accent">{digitChar(s.digit)}</td>
                      <td className="mono text-muted">
                        k<sub>−{s.position}</sub>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mul.steps.length > 0 && (
            <p className="px-1 pt-1 text-xs text-muted">
              积的小数部分为 0 停止；整数位<span className="text-ink">自上而下</span>读：
              <span className="mono text-accent"> 0.{fracDigits}</span>
            </p>
          )}
          {!mul.exact && (
            <p className="mt-1 rounded-md bg-bg px-2 py-1 text-xs text-amber">
              乘到第 {precision} 位仍未得到 0，截断到 {precision} 位。剩余小数{" "}
              <span className="mono">{rationalToDecimal(mul.rest)}</span>，误差 ={" "}
              <span className="mono">
                {rationalToDecimal(mul.rest)} × {B}
                <sup>−{precision}</sup> ≈ {rationalToNumber({ num: mul.rest.num, den: mul.rest.den * BigInt(B) ** BigInt(precision) }).toExponential(3)}
              </span>
              。增大 N 可减小误差，但{B === 2 ? "像 0.1 这样的十进制小数" : "该数"}永远无法用有限位精确表示。
            </p>
          )}
        </div>
      </div>
      <p className="mono text-sm text-ink">
        结果：{value.negative ? "−" : ""}
        {intDigits}
        {fracDigits ? "." + fracDigits : ""}
        <sub className="text-muted">({B})</sub>
        {value.negative && <span className="ml-2 text-xs text-muted">（负数：先对绝对值转换，再加负号）</span>}
      </p>
    </div>
  );
}
