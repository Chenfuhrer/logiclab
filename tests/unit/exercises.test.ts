import { describe, expect, it } from "vitest";
import { ALL_EXERCISES } from "@/content/exercises";
import { KNOWLEDGE_BY_ID } from "@/content/knowledge";
import { findLesson } from "@/content/course";
import { grade, targetExpr, waveformReference, exerciseCircuit } from "@/lib/exercises/grade";
import { analyzeSync } from "@/lib/fsm/analyze";
import { parseExpr, minimizeSOP, solutionToSOP, toText, minterms } from "@/lib/logic";

describe("题库自洽检查", () => {
  it("id 唯一", () => {
    const ids = ALL_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const ex of ALL_EXERCISES) {
    it(`${ex.id}（${ex.kind}）`, () => {
      expect(findLesson(ex.lesson), `课时 ${ex.lesson} 不存在`).toBeTruthy();
      for (const k of ex.knowledge) expect(KNOWLEDGE_BY_ID[k], `知识点 ${k} 不存在`).toBeTruthy();
      expect(ex.hints.length).toBeGreaterThan(0);
      expect(ex.explanation.length).toBeGreaterThan(5);
      switch (ex.kind) {
        case "choice": {
          const ans = Array.isArray(ex.answer) ? ex.answer : [ex.answer];
          for (const a of ans) expect(a >= 0 && a < ex.options.length).toBe(true);
          expect(grade(ex, { kind: "choice", value: ex.answer }).correct).toBe(true);
          break;
        }
        case "numeric":
          expect(grade(ex, { kind: "numeric", value: ex.answer }).correct).toBe(true);
          break;
        case "text":
          expect(grade(ex, { kind: "text", value: ex.accept[0] }).correct).toBe(true);
          break;
        case "expression": {
          const { table, dcs } = targetExpr(ex);
          const ones = minterms(table).filter((m) => !dcs.has(m));
          const ref = minimizeSOP(ex.vars.length, ones, [...dcs], ex.vars);
          const refText = ones.length ? toText(solutionToSOP(ref)) : "0";
          if (ex.minimal !== "pos") expect(grade(ex, { kind: "expression", value: refText }).correct, `参考解 ${refText}`).toBe(true);
          if ("expr" in ex.target) parseExpr(ex.target.expr);
          break;
        }
        case "kmap": {
          const ref = minimizeSOP(ex.vars.length, ex.minterms, ex.dontCares ?? [], ex.vars);
          const groups = ref.solutions[0].map((i) => ref.primes[i].covers);
          expect(grade(ex, { kind: "kmap", groups }).correct).toBe(true);
          break;
        }
        case "statetable": {
          const a = analyzeSync(exerciseCircuit(ex));
          const r = grade(ex, { kind: "statetable", next: a.rows.map((x) => x.next), outputs: a.rows.map((x) => x.outputs) });
          expect(r.correct).toBe(true);
          break;
        }
        case "waveform": {
          const ref = waveformReference(ex);
          const lens = Object.values(ex.inputs).map((x) => x.length);
          expect(new Set(lens).size).toBe(1);
          expect(grade(ex, { kind: "waveform", q: ref }).correct).toBe(true);
          break;
        }
      }
    });
  }
});
