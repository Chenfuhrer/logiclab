import type { Expr as LExpr } from "../logic/ast";
import type { Netlist } from "../sim/types";
import { FF_PINS, type SyncCircuit } from "../fsm/analyze";
import type { StateTableSpec } from "../fsm/design";
import { getModel } from "../sim/models";

/**
 * 把本平台的电路 / 方程 / 状态表转换为 Verilog 文本。
 * 生成的代码是可综合的 Verilog-2001 子集，也正好落在本平台 Verilog 子集解释器的支持范围内，
 * 测试中会用解释器运行生成的代码，并与电路仿真引擎逐拍比对。
 */

const KW = new Set(["module", "endmodule", "input", "output", "wire", "reg", "assign", "always", "begin", "end", "if", "else", "case", "endcase", "default", "posedge", "negedge", "or", "and", "not", "xor", "nand", "nor", "parameter", "localparam", "initial", "integer"]);

export function vName(raw: string): string {
  let s = raw.replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z_]/.test(s)) s = "n_" + s;
  if (KW.has(s)) s = s + "_";
  return s;
}

/** 逻辑表达式 → Verilog 位运算表达式 */
export function exprToVerilog(e: LExpr, name: (v: string) => string = vName): string {
  const P: Record<LExpr["k"], number> = { or: 1, xor: 2, xnor: 2, and: 3, not: 4, var: 5, const: 5 };
  const wrap = (x: LExpr, min: number) => (P[x.k] < min ? `(${go(x)})` : go(x));
  const go = (x: LExpr): string => {
    switch (x.k) {
      case "const":
        return x.v ? "1'b1" : "1'b0";
      case "var":
        return name(x.name);
      case "not":
        return `~${wrap(x.e, 4)}`;
      case "and":
        return x.es.map((c) => wrap(c, 3)).join(" & ");
      case "or":
        return x.es.map((c) => wrap(c, 2)).join(" | ");
      case "xor":
        return `${wrap(x.a, 3)} ^ ${wrap(x.b, 3)}`;
      case "xnor":
        return `${wrap(x.a, 3)} ~^ ${wrap(x.b, 3)}`;
    }
  };
  return go(e);
}

const bin = (v: number, w: number) => `${w}'b${v.toString(2).padStart(w, "0")}`;

// ───────────────────────── 由方程生成（结构化 / 方程级） ─────────────────────────

/**
 * 同步电路（驱动方程）→ Verilog：每个触发器一个 reg，驱动方程用 wire，次态按特性方程写在一个时序 always 块中。
 * init：初始状态编码（ffs 顺序，高位在前）；undefined 表示不写初值（上电为 x）。
 */
export function syncCircuitToVerilog(c: SyncCircuit, opts: { name?: string; init?: number; comment?: string } = {}): string {
  const n = c.ffs.length;
  const edge = c.ffs[0]?.edge === "falling" ? "negedge" : "posedge";
  const lines: string[] = [];
  if (opts.comment) lines.push(`// ${opts.comment}`);
  lines.push(`// 由 LogicLab 根据驱动方程自动生成：每个触发器 = 一个 reg，次态 = 特性方程`);
  const ports = [
    "  input  wire clk",
    ...c.inputs.map((x) => `  input  wire ${vName(x)}`),
    ...c.ffs.map((ff, i) => `  output reg  ${vName(ff.name)}${opts.init === undefined ? "" : ` = 1'b${(opts.init >> (n - 1 - i)) & 1}`}`),
    ...c.outputs.map((o) => `  output wire ${vName(o.name)}`),
  ];
  lines.push(`module ${vName(opts.name ?? "sync_circuit")} (`, ports.join(",\n"), ");");
  lines.push("", "  // 驱动方程");
  for (const ff of c.ffs)
    for (const p of FF_PINS[ff.type]) lines.push(`  wire ${p}_${vName(ff.name)} = ${exprToVerilog(ff.inputs[p]!)};`);
  lines.push("", `  // 状态方程（特性方程），${edge === "posedge" ? "上升沿" : "下降沿"}触发，非阻塞赋值 = 所有触发器同时更新`);
  lines.push(`  always @(${edge} clk) begin`);
  for (const ff of c.ffs) {
    const q = vName(ff.name);
    const pin = (p: string) => `${p}_${q}`;
    const rhs =
      ff.type === "D" ? pin("D") : ff.type === "T" ? `${pin("T")} ^ ${q}` : ff.type === "JK" ? `${pin("J")} & ~${q} | ~${pin("K")} & ${q}` : `${pin("S")} | ~${pin("R")} & ${q}`;
    lines.push(`    ${q} <= ${rhs};${ff.type === "SR" ? "  // 约束：S & R 不能同时为 1" : ""}`);
  }
  lines.push("  end");
  if (c.outputs.length) {
    lines.push("", "  // 输出方程");
    for (const o of c.outputs) lines.push(`  assign ${vName(o.name)} = ${exprToVerilog(o.expr)};`);
  }
  lines.push("endmodule", "");
  return lines.join("\n");
}

// ───────────────────────── 由状态表生成（行为级三段式） ─────────────────────────

export function stateTableToVerilog(spec: StateTableSpec, codes: number[], opts: { name?: string } = {}): string {
  const S = spec.states.length;
  const n = Math.max(1, Math.ceil(Math.log2(S)));
  const k = spec.inputs.length;
  const K = 1 << k;
  const sname = (i: number) => vName(spec.states[i].replace(/=/g, "_"));
  const inVec = k === 0 ? "" : k === 1 ? vName(spec.inputs[0]) : `{${spec.inputs.map(vName).join(", ")}}`;
  const L: string[] = [];
  L.push(`// 由 LogicLab 根据状态转换表自动生成：三段式状态机（${spec.kind === "mealy" ? "Mealy" : "Moore"} 型）`);
  L.push(`module ${vName(opts.name ?? "fsm")} (`);
  L.push(["  input  wire clk", "  input  wire rst_n", ...spec.inputs.map((x) => `  input  wire ${vName(x)}`), ...spec.outputs.map((o) => `  output reg  ${vName(o)}`)].join(",\n"));
  L.push(");");
  L.push(`  localparam ${spec.states.map((_, i) => `${sname(i)} = ${bin(codes[i], n)}`).join(", ")};`);
  L.push(`  reg [${n - 1}:0] state, next;`, "");
  L.push("  // ① 状态寄存器（时序逻辑，异步复位到初始状态）");
  L.push("  always @(posedge clk or negedge rst_n)");
  L.push(`    if (!rst_n) state <= ${sname(spec.initial ?? 0)};`);
  L.push("    else        state <= next;", "");
  L.push("  // ② 次态逻辑（组合逻辑）");
  L.push("  always @(*) begin");
  L.push(`    next = ${sname(spec.initial ?? 0)};  // 默认值：未用编码回到初始状态，同时避免推断锁存器`);
  L.push("    case (state)");
  spec.states.forEach((_, s) => {
    if (k === 0) L.push(`      ${sname(s)}: next = ${sname(spec.next[s][0])};`);
    else if (k === 1 && K === 2) L.push(`      ${sname(s)}: next = ${inVec} ? ${sname(spec.next[s][1])} : ${sname(spec.next[s][0])};`);
    else {
      L.push(`      ${sname(s)}: case (${inVec})`);
      for (let x = 0; x < K; x++) L.push(`        ${bin(x, k)}: next = ${sname(spec.next[s][x])};`);
      L.push("      endcase");
    }
  });
  L.push(`      default: next = ${sname(spec.initial ?? 0)};`);
  L.push("    endcase", "  end", "");
  L.push(`  // ③ 输出逻辑（组合逻辑，${spec.kind === "mealy" ? "Mealy：取决于现态和输入" : "Moore：只取决于现态"}）`);
  L.push("  always @(*) begin");
  spec.outputs.forEach((o) => L.push(`    ${vName(o)} = 1'b0;`));
  L.push("    case (state)");
  spec.states.forEach((_, s) => {
    const outs = spec.out[s];
    const assigns: string[] = [];
    spec.outputs.forEach((o, oi) => {
      const col = outs.map((r) => r[oi]);
      if (spec.kind === "moore" || col.every((b) => b === col[0])) {
        if (col[0]) assigns.push(`${vName(o)} = 1'b1;`);
      } else if (k === 1) {
        assigns.push(`${vName(o)} = ${col[1] && !col[0] ? inVec : `~${inVec}`};`);
      } else {
        const ones = col.flatMap((b, x) => (b ? [bin(x, k)] : []));
        assigns.push(`${vName(o)} = ${ones.map((c) => `(${inVec} == ${c})`).join(" | ")};`);
      }
    });
    if (assigns.length) L.push(`      ${sname(s)}: begin ${assigns.join(" ")} end`);
  });
  L.push("      default: ;", "    endcase", "  end", "endmodule", "");
  return L.join("\n");
}

// ───────────────────────── 由网表生成（结构化，含器件库） ─────────────────────────

const LIB: Record<string, string> = {
  dff_pos: `module dff_pos (clk, d, sd_n, rd_n, q, qn);
  input clk, d, sd_n, rd_n;
  output q, qn;
  parameter INIT = 1'bx;
  reg q = INIT;
  always @(posedge clk or negedge sd_n or negedge rd_n)
    if (!rd_n)      q <= 1'b0;   // 异步置 0 优先
    else if (!sd_n) q <= 1'b1;   // 异步置 1
    else            q <= d;
  assign qn = ~q;
endmodule`,
  jkff_pos: `module jkff_pos (clk, j, k, sd_n, rd_n, q, qn);
  input clk, j, k, sd_n, rd_n;
  output q, qn;
  parameter INIT = 1'bx;
  reg q = INIT;
  always @(posedge clk or negedge sd_n or negedge rd_n)
    if (!rd_n)      q <= 1'b0;
    else if (!sd_n) q <= 1'b1;
    else            q <= j & ~q | ~k & q;   // 特性方程
  assign qn = ~q;
endmodule`,
  tff_pos: `module tff_pos (clk, t, sd_n, rd_n, q, qn);
  input clk, t, sd_n, rd_n;
  output q, qn;
  parameter INIT = 1'bx;
  reg q = INIT;
  always @(posedge clk or negedge sd_n or negedge rd_n)
    if (!rd_n)      q <= 1'b0;
    else if (!sd_n) q <= 1'b1;
    else            q <= t ^ q;
  assign qn = ~q;
endmodule`,
  srff_pos: `module srff_pos (clk, s, r, sd_n, rd_n, q, qn);
  input clk, s, r, sd_n, rd_n;
  output q, qn;
  parameter INIT = 1'bx;
  reg q = INIT;
  always @(posedge clk or negedge sd_n or negedge rd_n)
    if (!rd_n)      q <= 1'b0;
    else if (!sd_n) q <= 1'b1;
    else if (s & r) q <= 1'bx;   // 违反约束 SR = 0
    else            q <= s | ~r & q;
  assign qn = ~q;
endmodule`,
  d_latch: `module d_latch (d, en, q, qn);
  input d, en;
  output q, qn;
  parameter INIT = 1'bx;
  reg q = INIT;
  always @(*) if (en) q = d;    // 电平触发：EN=1 时透明（有意推断锁存器）
  assign qn = ~q;
endmodule`,
  ls161: `module ls161 (clk, clr_n, ld_n, ep, et, d0, d1, d2, d3, q0, q1, q2, q3, co);
  input clk, clr_n, ld_n, ep, et, d0, d1, d2, d3;
  output q0, q1, q2, q3, co;
  parameter INIT = 4'bxxxx;
  reg [3:0] q = INIT;
  always @(posedge clk or negedge clr_n)
    if (!clr_n)        q <= 4'b0000;              // 异步清零
    else if (!ld_n)    q <= {d3, d2, d1, d0};     // 同步置数（优先于计数）
    else if (ep & et)  q <= q + 4'd1;             // 计数
  assign {q3, q2, q1, q0} = q;
  assign co = et & q[3] & q[2] & q[1] & q[0];     // 进位输出
endmodule`,
  ls163: `module ls163 (clk, clr_n, ld_n, ep, et, d0, d1, d2, d3, q0, q1, q2, q3, co);
  input clk, clr_n, ld_n, ep, et, d0, d1, d2, d3;
  output q0, q1, q2, q3, co;
  parameter INIT = 4'bxxxx;
  reg [3:0] q = INIT;
  always @(posedge clk)
    if (!clr_n)        q <= 4'b0000;              // 同步清零
    else if (!ld_n)    q <= {d3, d2, d1, d0};
    else if (ep & et)  q <= q + 4'd1;
  assign {q3, q2, q1, q0} = q;
  assign co = et & q[3] & q[2] & q[1] & q[0];
endmodule`,
  ls138: `module ls138 (a0, a1, a2, s1, s2_n, s3_n, y0, y1, y2, y3, y4, y5, y6, y7);
  input a0, a1, a2, s1, s2_n, s3_n;
  output y0, y1, y2, y3, y4, y5, y6, y7;
  wire en = s1 & ~s2_n & ~s3_n;
  wire [7:0] y = en ? ~(8'b00000001 << {a2, a1, a0}) : 8'b11111111;   // 低电平有效
  assign {y7, y6, y5, y4, y3, y2, y1, y0} = y;
endmodule`,
  ls151: `module ls151 (d0, d1, d2, d3, d4, d5, d6, d7, a0, a1, a2, s_n, y, w_n);
  input d0, d1, d2, d3, d4, d5, d6, d7, a0, a1, a2, s_n;
  output y, w_n;
  wire [7:0] d = {d7, d6, d5, d4, d3, d2, d1, d0};
  assign y = ~s_n & d[{a2, a1, a0}];
  assign w_n = ~y;
endmodule`,
  ls194: `module ls194 (clk, clr_n, s0, s1, dsr, dsl, d0, d1, d2, d3, q0, q1, q2, q3);
  input clk, clr_n, s0, s1, dsr, dsl, d0, d1, d2, d3;
  output q0, q1, q2, q3;
  parameter INIT = 4'bxxxx;
  reg [3:0] q = INIT;   // q[0] = Q0
  always @(posedge clk or negedge clr_n)
    if (!clr_n) q <= 4'b0000;
    else case ({s1, s0})
      2'b00: q <= q;                       // 保持
      2'b01: q <= {q[2:0], dsr};           // 右移：Q0 <- DSR
      2'b10: q <= {dsl, q[3:1]};           // 左移：Q3 <- DSL
      2'b11: q <= {d3, d2, d1, d0};        // 并行置数
    endcase
  assign {q3, q2, q1, q0} = q;
endmodule`,
};
// 下降沿版本由上升沿版本替换得到
for (const base of ["dff", "jkff", "tff", "srff"]) LIB[`${base}_neg`] = LIB[`${base}_pos`].replace(`module ${base}_pos`, `module ${base}_neg`).replace("always @(posedge clk", "always @(negedge clk");

const PIN_MAP: Record<string, Record<string, string>> = {
  dff: { D: "d", CLK: "clk", SD: "sd_n", RD: "rd_n", Q: "q", QN: "qn" },
  jkff: { J: "j", K: "k", CLK: "clk", SD: "sd_n", RD: "rd_n", Q: "q", QN: "qn" },
  tff: { T: "t", CLK: "clk", SD: "sd_n", RD: "rd_n", Q: "q", QN: "qn" },
  srff: { S: "s", R: "r", CLK: "clk", SD: "sd_n", RD: "rd_n", Q: "q", QN: "qn" },
  d_latch: { D: "d", EN: "en", Q: "q", QN: "qn" },
  ls161: { CLK: "clk", RD: "clr_n", LD: "ld_n", EP: "ep", ET: "et", D0: "d0", D1: "d1", D2: "d2", D3: "d3", Q0: "q0", Q1: "q1", Q2: "q2", Q3: "q3", C: "co" },
  ls138: { A0: "a0", A1: "a1", A2: "a2", S1: "s1", S2: "s2_n", S3: "s3_n", ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`Y${i}`, `y${i}`])) },
  ls151: { ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`D${i}`, `d${i}`])), A0: "a0", A1: "a1", A2: "a2", S: "s_n", Y: "y", W: "w_n" },
  ls194: { CLK: "clk", RD: "clr_n", S0: "s0", S1: "s1", DSR: "dsr", DSL: "dsl", D0: "d0", D1: "d1", D2: "d2", D3: "d3", Q0: "q0", Q1: "q1", Q2: "q2", Q3: "q3" },
};
PIN_MAP.ls163 = PIN_MAP.ls161;

export interface NetlistVerilog {
  code: string;
  top: string;
  /** 顶层端口：输入（开关/按键/时钟）与输出（探针/LED），以及对应的元件 id */
  inputs: { port: string; comp: string; clock: boolean }[];
  outputs: { port: string; comp: string }[];
  unsupported: string[];
}

/** 网表 → 结构化 Verilog（门用 assign，触发器与中规模器件用库模块例化） */
export function netlistToVerilog(nl: Netlist, opts: { name?: string } = {}): NetlistVerilog {
  const unsupported: string[] = [];
  const pinNet = new Map<string, string>();
  for (const net of nl.nets) for (const e of net.endpoints) pinNet.set(`${e.comp}.${e.pin}`, net.id);
  // 网络名
  const used = new Set<string>(["clk"]);
  const netName = new Map<string, string>();
  const uniq = (base: string) => {
    let s = vName(base);
    let i = 1;
    while (used.has(s)) s = `${vName(base)}_${i++}`;
    used.add(s);
    return s;
  };
  // 先给端口取名，网络尽量沿用端口名
  const inputs: NetlistVerilog["inputs"] = [];
  const outputs: NetlistVerilog["outputs"] = [];
  const body: string[] = [];
  const libUsed = new Set<string>();
  const portDecl: string[] = [];
  for (const c of nl.components) {
    if (c.type === "switch" || c.type === "button" || c.type === "clock") {
      const net = pinNet.get(`${c.id}.${c.type === "clock" ? "CLK" : "Y"}`);
      if (!net) continue;
      const port = c.type === "clock" && !inputs.some((x) => x.clock) ? "clk" : uniq(c.label ?? c.id);
      if (port === "clk") used.add("clk");
      inputs.push({ port, comp: c.id, clock: c.type === "clock" });
      portDecl.push(`  input  wire ${port}`);
      if (!netName.has(net)) netName.set(net, port);
      else body.push(`  assign ${netName.get(net)} = ${port};`);
    }
  }
  // 输出端口名优先占用探针/LED 的标签，内部网络再取名
  const outPort = new Map<string, string>();
  for (const c of nl.components) if ((c.type === "led" || c.type === "probe") && pinNet.get(`${c.id}.A`)) outPort.set(c.id, uniq(c.label ?? c.id));
  for (const net of nl.nets) if (!netName.has(net.id)) netName.set(net.id, uniq(net.name ?? net.id));
  const N = (comp: string, pin: string) => {
    const n = pinNet.get(`${comp}.${pin}`);
    return n ? netName.get(n)! : null;
  };
  const wires = new Set<string>();
  for (const net of nl.nets) {
    const nm = netName.get(net.id)!;
    if (!inputs.some((i) => i.port === nm)) wires.add(nm);
  }
  for (const c of nl.components) {
    const m = getModel(c.type);
    const label = c.label ?? c.id;
    switch (c.type) {
      case "switch":
      case "button":
      case "clock":
        break;
      case "const0":
      case "const1": {
        const y = N(c.id, "Y");
        if (y) body.push(`  assign ${y} = 1'b${c.type === "const1" ? 1 : 0};`);
        break;
      }
      case "led":
      case "probe": {
        const a = N(c.id, "A");
        if (!a) break;
        const port = outPort.get(c.id)!;
        outputs.push({ port, comp: c.id });
        portDecl.push(`  output wire ${port}`);
        body.push(`  assign ${port} = ${a};`);
        break;
      }
      case "and":
      case "or":
      case "nand":
      case "nor":
      case "xor":
      case "xnor":
      case "not":
      case "buf": {
        if (c.params?.oc) {
          unsupported.push(`${label}（OC 门：线与需要电气条件，未导出）`);
          break;
        }
        const y = N(c.id, "Y");
        if (!y) break;
        const n = c.type === "not" || c.type === "buf" ? 1 : Math.max(2, Number(c.params?.inputs ?? 2));
        const ins = c.type === "not" || c.type === "buf" ? [N(c.id, "A") ?? "1'bx"] : Array.from({ length: n }, (_, i) => N(c.id, `I${i}`) ?? "1'bx");
        const op = { and: " & ", nand: " & ", or: " | ", nor: " | ", xor: " ^ ", xnor: " ^ ", not: "", buf: "" }[c.type];
        const core = ins.join(op);
        const expr = c.type === "nand" || c.type === "nor" || c.type === "xnor" ? `~(${core})` : c.type === "not" ? `~${ins[0]}` : core;
        body.push(`  assign ${y} = ${expr};   // ${label}：${m?.title ?? c.type}`);
        break;
      }
      case "dff":
      case "jkff":
      case "tff":
      case "srff":
      case "d_latch":
      case "ls161":
      case "ls163":
      case "ls138":
      case "ls151":
      case "ls194": {
        const isFF = ["dff", "jkff", "tff", "srff"].includes(c.type);
        const mod = isFF ? `${c.type}_${c.params?.edge === "falling" ? "neg" : "pos"}` : c.type;
        libUsed.add(mod);
        const map = PIN_MAP[c.type];
        const conns = Object.entries(map).map(([pin, port]) => {
          const n = N(c.id, pin);
          const dflt = pin === "SD" || pin === "RD" ? "1'b1" : null;
          return `.${port}(${n ?? dflt ?? ""})`;
        });
        const init = c.params?.init;
        const hasInit = ["dff", "jkff", "tff", "srff", "d_latch", "ls161", "ls163", "ls194"].includes(c.type);
        let param = "";
        if (hasInit) {
          const w = c.type.startsWith("ls") ? 4 : 1;
          const iv = typeof init === "number" ? init : init === "0" || init === "1" ? Number(init) : null;
          param = iv === null ? "" : ` #(.INIT(${bin(iv, w)}))`;
        }
        body.push(`  ${mod}${param} ${vName(c.id)} (${conns.join(", ")});   // ${label}`);
        break;
      }
      default:
        unsupported.push(`${label}（${m?.title ?? c.type}）`);
    }
  }
  const stripped = (opts.name ?? nl.name).replace(/[^A-Za-z0-9_]/g, "");
  const top = stripped ? vName(stripped) : "top";
  const code = [
    `// 由 LogicLab 从电路网表自动生成（结构化描述）：门 → assign，触发器 / 中规模器件 → 库模块例化`,
    ...(unsupported.length ? [`// 未导出的元件：${unsupported.join("；")}`] : []),
    `module ${top} (`,
    portDecl.join(",\n"),
    ");",
    ...(wires.size ? [`  wire ${[...wires].join(", ")};`] : []),
    ...body,
    "endmodule",
    "",
    ...[...libUsed].sort().map((m) => LIB[m] + "\n"),
  ].join("\n");
  return { code, top, inputs, outputs, unsupported };
}

/** 组合逻辑表达式 → 带端口的模块 */
export function combToVerilog(outputs: { name: string; expr: LExpr }[], vars: string[], name = "comb"): string {
  return [
    "// 由 LogicLab 自动生成：组合逻辑（连续赋值）",
    `module ${vName(name)} (`,
    [...vars.map((v) => `  input  wire ${vName(v)}`), ...outputs.map((o) => `  output wire ${vName(o.name)}`)].join(",\n"),
    ");",
    ...outputs.map((o) => `  assign ${vName(o.name)} = ${exprToVerilog(o.expr)};`),
    "endmodule",
    "",
  ].join("\n");
}

/**
 * 自检 Testbench（供 iverilog / ModelSim 等真实仿真器使用；本平台的子集解释器不执行 initial / # / $display）。
 * rows：每个时钟周期在上升沿之前施加的输入，以及该周期结束时应得到的输出（由本平台电路仿真得到）。
 */
export function selfCheckingTestbench(opts: {
  top: string;
  inputs: { port: string; width?: number }[];
  outputs: { port: string; width?: number }[];
  clock?: string;
  init: Record<string, number>;
  rows: { inputs: Record<string, number>; expect: Record<string, number | null> }[];
  period?: number;
}): string {
  const T = opts.period ?? 100;
  const decl = (p: { port: string; width?: number }, kind: string) => `  ${kind}${p.width && p.width > 1 ? ` [${p.width - 1}:0]` : ""} ${p.port};`;
  const L: string[] = [];
  L.push("// 自检 Testbench：由 LogicLab 根据电路仿真结果生成。");
  L.push("// 需要在真实 HDL 仿真器中运行，例如：iverilog -o tb design.v tb.v && vvp tb");
  L.push("// （本平台的 Verilog 子集解释器不支持 initial / # 延迟 / $display，未执行本文件。）");
  L.push("`timescale 1ns/1ps", `module tb_${opts.top};`);
  for (const p of opts.inputs) L.push(decl(p, "reg "));
  for (const p of opts.outputs) L.push(decl(p, "wire"));
  L.push("  integer errors = 0;");
  L.push(`  ${opts.top} dut (${[...opts.inputs, ...opts.outputs].map((p) => `.${p.port}(${p.port})`).join(", ")});`);
  if (opts.clock) L.push(`  initial ${opts.clock} = 1'b0;`, `  always #${T / 2} ${opts.clock} = ~${opts.clock};`);
  L.push("  initial begin");
  for (const [k, v] of Object.entries(opts.init)) if (k !== opts.clock) L.push(`    ${k} = ${v};`);
  opts.rows.forEach((r, i) => {
    for (const [k, v] of Object.entries(r.inputs)) L.push(`    ${k} = ${v};`);
    L.push(opts.clock ? `    @(posedge ${opts.clock}); #${T - 1};   // 第 ${i + 1} 个周期结束前检查` : `    #${T};`);
    for (const [k, v] of Object.entries(r.expect)) {
      if (v === null) continue;
      L.push(`    if (${k} !== ${v}) begin errors = errors + 1; $display("第 ${i + 1} 拍 ${k} = %b，应为 ${v}", ${k}); end`);
    }
  });
  L.push(`    if (errors == 0) $display("PASS：全部 ${opts.rows.length} 拍与 LogicLab 仿真一致");`);
  L.push('    else $display("FAIL：%0d 处不一致", errors);', "    $finish;", "  end", "endmodule", "");
  return L.join("\n");
}
