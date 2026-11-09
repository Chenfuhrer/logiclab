"use client";

import { useState } from "react";
import { Tex } from "@/components/ui/Tex";
import { CODE_TABLE, diffPositions, graySequence, tryDecimalToBCD, tryGray } from "@/lib/numbers/codes";
import { tryConvert } from "@/lib/numbers/radix";

/** 位串：颜色 + 字符双重编码；hl 中的位置加黄框 */
function Bits({ bits, hl = [], size = "md" }: { bits: string; hl?: number[]; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex gap-0.5">
      {[...bits].map((b, k) => (
        <span
          key={k}
          className={`lv ${b === "1" ? "lv-1" : "lv-0"} ${hl.includes(k) ? "outline outline-2 outline-offset-1 outline-amber" : ""} ${size === "sm" ? "!h-5 !min-w-5 text-[0.7rem]" : ""}`}
        >
          {b}
        </span>
      ))}
    </span>
  );
}

export function CodeLab() {
  return (
    <section className="card p-4 sm:p-5 space-y-5" aria-label="编码实验">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">交互实验 · 码制</div>
          <div className="text-base font-semibold text-ink">BCD 码、余 3 码与格雷码</div>
        </div>
        <span className="chip">逻辑层</span>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CodeTable />
        <BcdEncoder />
      </div>
      <GrayConverter />
    </section>
  );
}

function CodeTable() {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="card-inset p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1 px-1 pb-1">
        <span className="eyebrow">0～9 编码对照（点击一行查看）</span>
        <span className="chip chip-amber" title="另一种 2421 方案中 5 = 0101，不是自补码">
          2421 码有两种方案，本平台采用自补方案
        </span>
      </div>
      <div className="overflow-x-auto thin-scroll">
        <table className="ltable w-full">
          <thead>
            <tr>
              <th>十进制</th>
              <th>8421BCD</th>
              <th>2421</th>
              <th>余 3 码</th>
            </tr>
          </thead>
          <tbody>
            {CODE_TABLE.map((r) => (
              <tr
                key={r.digit}
                onClick={() => setSel(sel === r.digit ? null : r.digit)}
                className={`cursor-pointer ${sel === r.digit ? "bg-accent/10" : ""}`}
                aria-selected={sel === r.digit}
              >
                <td className="mono text-ink">{r.digit}</td>
                <td className="mono">{r.bcd8421}</td>
                <td className="mono">{r.c2421}</td>
                <td className="mono">{r.excess3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel !== null ? (
        <div className="space-y-1 px-1 pt-2 text-xs text-ink-2">
          <div className="mono">
            8421：{CODE_TABLE[sel].bcd8421} = {[...CODE_TABLE[sel].bcd8421].map((b, i) => `${b}×${[8, 4, 2, 1][i]}`).join(" + ")} = {sel}
          </div>
          <div className="mono">
            2421：{CODE_TABLE[sel].c2421} = {[...CODE_TABLE[sel].c2421].map((b, i) => `${b}×${[2, 4, 2, 1][i]}`).join(" + ")} = {sel}
          </div>
          <div className="mono">
            余 3：{CODE_TABLE[sel].excess3} = {CODE_TABLE[sel].bcd8421} + 0011（{sel} + 3 = {sel + 3}），无固定权
          </div>
          <div className="text-muted">
            自补：{sel} 的 2421/余 3 码逐位取反得到 {9 - sel} 的码（{CODE_TABLE[9 - sel].c2421} / {CODE_TABLE[9 - sel].excess3}）
          </div>
        </div>
      ) : (
        <p className="px-1 pt-2 text-xs text-muted">8421 与 2421 是有权码；余 3 码 = 8421 码 + 3，是无权码。本表 2421 码为自补方案（0～4 = 0000～0100，5～9 = 1011～1111，5 = 1011），它与余 3 码都是自补码。</p>
      )}
    </div>
  );
}

function BcdEncoder() {
  const [text, setText] = useState("239");
  const r = tryDecimalToBCD(text);
  const bin = r.ok && !text.includes(".") ? tryConvert(text, 10, 2) : null;
  return (
    <div className="card-inset space-y-2 p-2.5">
      <div className="eyebrow">十进制 → 8421BCD</div>
      <input
        className="input mono w-full"
        value={text}
        onChange={(e) => setText(e.target.value)}
        inputMode="decimal"
        aria-label="十进制数"
        aria-invalid={!r.ok}
      />
      {!r.ok ? (
        <p role="alert" className="text-sm text-danger">
          ✕ {r.error}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
            {r.value.intDigits.map((d, i) => (
              <Digit key={`i${i}`} digit={d.digit} code={d.code} />
            ))}
            {r.value.fracDigits.length > 0 && <span className="mono pb-1 text-lg text-ink">.</span>}
            {r.value.fracDigits.map((d, i) => (
              <Digit key={`f${i}`} digit={d.digit} code={d.code} />
            ))}
          </div>
          <p className="mono break-all text-sm text-accent">{r.value.text}</p>
          {bin && bin.ok && (
            <p className="text-xs text-muted">
              对比：直接转成二进制是 <span className="mono break-all text-ink-2">{bin.value.text}</span>。BCD 是“每位十进制数码各用 4 位编码”，不是数值的二进制。
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Digit({ digit, code }: { digit: number; code: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span className="mono text-base text-ink">{digit}</span>
      <Bits bits={code} size="sm" />
    </span>
  );
}

function GrayConverter() {
  const [dir, setDir] = useState<"b2g" | "g2b">("b2g");
  const [text, setText] = useState("1011");
  const [n, setN] = useState(4);
  const r = tryGray(dir, text);
  const seq = graySequence(n);
  const currentGray = r.ok ? (dir === "b2g" ? r.value.output : r.value.input) : null;
  const inName = dir === "b2g" ? "B" : "G";
  const outName = dir === "b2g" ? "G" : "B";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="card-inset space-y-2 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="eyebrow">格雷码互换</span>
          <div className="flex gap-1" role="group" aria-label="转换方向">
            <button type="button" className={`btn btn-sm ${dir === "b2g" ? "btn-primary" : ""}`} onClick={() => setDir("b2g")}>
              二进制 → 格雷码
            </button>
            <button type="button" className={`btn btn-sm ${dir === "g2b" ? "btn-primary" : ""}`} onClick={() => setDir("g2b")}>
              格雷码 → 二进制
            </button>
          </div>
        </div>
        <input
          className="input mono w-full"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={dir === "b2g" ? "二进制数" : "格雷码"}
          aria-invalid={!r.ok}
          spellCheck={false}
        />
        <div className="text-sm">
          {dir === "b2g" ? (
            <Tex>{"G_{n-1}=B_{n-1},\\quad G_i = B_{i+1}\\oplus B_i"}</Tex>
          ) : (
            <Tex>{"B_{n-1}=G_{n-1},\\quad B_i = B_{i+1}\\oplus G_i"}</Tex>
          )}
          {dir === "g2b" && <span className="ml-2 text-xs text-muted">（从高位往低位，用刚求出的 B 继续异或）</span>}
        </div>
        {!r.ok ? (
          <p role="alert" className="text-sm text-danger">
            ✕ {r.error}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto thin-scroll">
              <table className="ltable w-full">
                <thead>
                  <tr>
                    <th>i</th>
                    <th>
                      B<sub>i+1</sub>
                    </th>
                    <th>
                      {inName}
                      <sub>i</sub>
                    </th>
                    <th>
                      {outName}
                      <sub>i</sub>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.value.steps.map((s) => (
                    <tr key={s.i}>
                      <td className="mono text-muted">{s.i}</td>
                      <td className="mono">{s.higher === null ? "—" : s.higher}</td>
                      <td className="mono">{s.input}</td>
                      <td className="mono text-left">
                        <span className={`lv ${s.output ? "lv-1" : "lv-0"}`}>{s.output}</span>
                        <span className="ml-2 text-xs text-muted">
                          {s.higher === null ? `= ${inName}${s.i}（最高位直接照抄）` : `= ${s.higher} ⊕ ${s.input}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{dir === "b2g" ? "二进制" : "格雷码"}</span>
              <Bits bits={r.value.input} />
              <span className="text-muted">→ {dir === "b2g" ? "格雷码" : "二进制"}</span>
              <Bits bits={r.value.output} />
            </div>
          </>
        )}
      </div>

      <div className="card-inset p-2.5">
        <div className="flex items-center justify-between gap-2 pb-1">
          <span className="eyebrow">{n} 位格雷码序列</span>
          <select className="select mono !h-7 !text-xs" value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="序列位数">
            {[2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k} 位
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-80 overflow-auto thin-scroll">
          <table className="ltable w-full">
            <thead>
              <tr>
                <th>十进制</th>
                <th>二进制</th>
                <th>格雷码</th>
              </tr>
            </thead>
            <tbody>
              {seq.map((g, k) => {
                const prev = seq[(k - 1 + seq.length) % seq.length];
                const changed = diffPositions(prev, g);
                const isCur = currentGray !== null && currentGray === g;
                return (
                  <tr key={g} className={isCur ? "bg-accent/10" : ""}>
                    <td className="mono">{k}</td>
                    <td className="mono text-muted">{k.toString(2).padStart(n, "0")}</td>
                    <td>
                      <Bits bits={g} hl={changed} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="pt-2 text-xs text-muted">
          黄框 = 与上一行相比<span className="text-amber">唯一变化的一位</span>（第 0 行与最后一行比较，首尾也只差一位）。
          {currentGray !== null && currentGray.length === n && <> 绿色底纹行是当前输入对应的格雷码。</>}
        </p>
      </div>
    </div>
  );
}
