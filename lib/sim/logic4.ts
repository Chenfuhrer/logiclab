import { type L, LX, LZ } from "./types";

/** 门输入：Z 视为 X（逻辑模型）或 1（TTL 悬空） */
export const asInput = (v: L, ttl = false): L => (v === LZ ? (ttl ? 1 : LX) : v);

export function and4(xs: L[]): L {
  let unknown = false;
  for (const x of xs) {
    if (x === 0) return 0;
    if (x !== 1) unknown = true;
  }
  return unknown ? LX : 1;
}
export function or4(xs: L[]): L {
  let unknown = false;
  for (const x of xs) {
    if (x === 1) return 1;
    if (x !== 0) unknown = true;
  }
  return unknown ? LX : 0;
}
export function not4(x: L): L {
  return x === 0 ? 1 : x === 1 ? 0 : LX;
}
export function xor4(xs: L[]): L {
  let r = 0;
  for (const x of xs) {
    if (x !== 0 && x !== 1) return LX;
    r ^= x;
  }
  return r as L;
}

export const isKnown = (x: L): x is 0 | 1 => x === 0 || x === 1;

/** 合并两个可能的结果：相同取该值，不同取 X */
export const merge = (a: L, b: L): L => (a === b ? a : LX);

/**
 * 精确的 X 传播：把指定输入中的 X 分别代入 0 和 1，结果一致则确定，不一致为 X。
 * 用于中规模器件模型（控制端为 X 时不至于过度悲观，也不会臆造确定值）。
 */
export function resolveX<T extends Record<string, L>>(inputs: T, keys: (keyof T)[], fn: (inp: T) => L[]): L[] {
  const unknown = keys.filter((k) => !isKnown(inputs[k]));
  if (unknown.length === 0) return fn(inputs);
  if (unknown.length > 6) {
    const r = fn(inputs);
    return r.map(() => LX);
  }
  let acc: L[] | null = null;
  for (let mask = 0; mask < 1 << unknown.length; mask++) {
    const trial = { ...inputs };
    unknown.forEach((k, i) => ((trial as Record<string, L>)[k as string] = ((mask >> i) & 1) as L));
    const r = fn(trial);
    acc = acc ? acc.map((a, i) => merge(a, r[i])) : r;
  }
  return acc!;
}
