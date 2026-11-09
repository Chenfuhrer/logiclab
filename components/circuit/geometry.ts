import { pinsOf, getModel } from "@/lib/sim/models";
import type { ComponentInstance, PinDef } from "@/lib/sim/types";

/** 元件符号尺寸与引脚位置（相对元件左上角，单位 px）。编辑器与渲染器共用。 */
export interface SymbolGeom {
  w: number;
  h: number;
  pins: { def: PinDef; x: number; y: number; side: "l" | "r" | "t" | "b" }[];
}

const GATES = new Set(["and", "or", "nand", "nor", "xor", "xnor"]);
const FFS = new Set(["dff", "jkff", "tff", "srff", "jkff_ms"]);

export function geometry(c: Pick<ComponentInstance, "type" | "params">): SymbolGeom {
  const pins = pinsOf(c.type, c.params ?? {});
  const ins = pins.filter((p) => p.dir === "in");
  const outs = pins.filter((p) => p.dir === "out");
  const P = (def: PinDef, x: number, y: number, side: "l" | "r" | "t" | "b") => ({ def, x, y, side });
  if (GATES.has(c.type)) {
    const n = ins.length;
    const h = Math.max(40, n * 20);
    return { w: 50, h, pins: [...ins.map((p, i) => P(p, -10, h / 2 + (i - (n - 1) / 2) * 20, "l")), P(outs[0], 62, h / 2, "r")] };
  }
  switch (c.type) {
    case "not":
    case "buf":
      return { w: 40, h: 30, pins: [P(ins[0], -10, 15, "l"), P(outs[0], 52, 15, "r")] };
    case "tribuf":
      return { w: 40, h: 40, pins: [P(ins[0], -10, 20, "l"), P(ins[1], 20, -10, "t"), P(outs[0], 50, 20, "r")] };
    case "switch":
    case "button":
      return { w: 46, h: 28, pins: [P(outs[0], 56, 14, "r")] };
    case "const0":
    case "const1":
      return { w: 28, h: 22, pins: [P(outs[0], 38, 11, "r")] };
    case "clock":
      return { w: 50, h: 30, pins: [P(outs[0], 60, 15, "r")] };
    case "led":
      return { w: 26, h: 26, pins: [P(ins[0], -10, 13, "l")] };
    case "probe":
      return { w: 36, h: 22, pins: [P(ins[0], -10, 11, "l")] };
    case "pullup":
      return { w: 20, h: 40, pins: [P(outs[0], 10, 50, "b")] };
    case "hexdisplay":
      return { w: 48, h: 90, pins: ins.map((p, i) => P(p, -10, 75 - i * 20, "l")) };
    case "seg7":
      return { w: 56, h: 150, pins: ins.map((p, i) => P(p, -10, 15 + i * 20, "l")) };
    case "sr_latch":
    case "d_latch":
      return { w: 60, h: 60, pins: [P(ins[0], -10, 15, "l"), P(ins[1], -10, 45, "l"), P(outs[0], 70, 15, "r"), P(outs[1], 70, 45, "r")] };
  }
  if (FFS.has(c.type)) {
    const data = ins.filter((p) => !["CLK", "SD", "RD"].includes(p.name));
    const clk = ins.find((p) => p.name === "CLK")!;
    const sd = ins.find((p) => p.name === "SD");
    const rd = ins.find((p) => p.name === "RD");
    const left = data.length === 2 ? [P(data[0], -10, 15, "l"), P(clk, -10, 40, "l"), P(data[1], -10, 65, "l")] : [P(data[0], -10, 15, "l"), P(clk, -10, 40, "l")];
    return {
      w: 70,
      h: 80,
      pins: [...left, ...(sd ? [P(sd, 35, -10, "t")] : []), ...(rd ? [P(rd, 35, 90, "b")] : []), P(outs[0], 80, 15, "r"), P(outs[1], 80, 65, "r")],
    };
  }
  // 中规模器件：输入在左、输出在右
  const rows = Math.max(ins.length, outs.length);
  const h = rows * 20 + 24;
  return {
    w: 116,
    h,
    pins: [...ins.map((p, i) => P(p, -10, 28 + i * 20, "l")), ...outs.map((p, i) => P(p, 126, 28 + i * 20, "r"))],
  };
}

/** 引脚的纯文本标签（去掉 LaTeX），返回 {text, bar} */
export function pinText(def: PinDef): { text: string; bar: boolean } {
  let s = def.label;
  const bar = /\\overline/.test(s);
  s = s
    .replace(/\\overline\{([^}]*)\}/g, "$1")
    .replace(/\\ \((\\uparrow|\\downarrow|\\sqcap)\)/g, "")
    .replace(/[_{}\\]/g, "");
  return { text: s, bar };
}

export function isGate(type: string) {
  return GATES.has(type);
}
export function isFF(type: string) {
  return FFS.has(type);
}
export function titleOf(type: string) {
  return getModel(type)?.title ?? type;
}
