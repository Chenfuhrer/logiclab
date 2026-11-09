import { describe, expect, it } from "vitest";
import { minimizeSOP, solutionToSOP, truthTable, minimizePOS } from "@/lib/logic";

/**
 * 专项验证：全部 2^16 = 65536 个四变量布尔函数。
 * 对每个函数：QM+Petrick 的每一个最简与或解、以及最简或与式，真值表必须与原函数完全一致。
 * 运行：npm run test:exhaustive
 */
describe("全部 65536 个四变量函数", () => {
  it("化简结果与原函数等价", () => {
    const vars = ["A", "B", "C", "D"];
    let checkedSolutions = 0;
    for (let f = 0; f < 65536; f++) {
      const ones: number[] = [];
      for (let m = 0; m < 16; m++) if ((f >> m) & 1) ones.push(m);
      const res = minimizeSOP(4, ones, [], vars);
      if (!res.exact) throw new Error(`f=${f} 未得到精确解`);
      for (let k = 0; k < res.solutions.length; k++) {
        const t = truthTable(solutionToSOP(res, k), vars);
        for (let m = 0; m < 16; m++) if (t[m] !== ((f >> m) & 1)) throw new Error(`SOP f=${f} 解 ${k} 在 m${m} 处错误`);
        checkedSolutions++;
      }
      const pos = minimizePOS(4, ones, [], vars);
      const tp = truthTable(pos.expr, vars);
      for (let m = 0; m < 16; m++) if (tp[m] !== ((f >> m) & 1)) throw new Error(`POS f=${f} 在 m${m} 处错误`);
    }
    expect(checkedSolutions).toBeGreaterThanOrEqual(65536);
    console.log(`已验证 65536 个函数，共 ${checkedSolutions} 个最简与或解 + 65536 个最简或与式`);
  }, 600_000);
});
