import { Simulator } from "./engine";
import type { L, Netlist, SimOptions } from "./types";

/** 按时间表施加输入（信号源 id 在时刻 t 取值 v），运行到 until，返回仿真器（含波形记录） */
export function runStimulus(netlist: Netlist, events: { t: number; comp: string; v: L }[], until: number, opts: Partial<SimOptions> = {}): Simulator {
  const sim = new Simulator(netlist, opts);
  const evs = [...events].sort((a, b) => a.t - b.t);
  for (const e of evs) {
    if (sim.halted) break;
    if (e.t > sim.time) sim.run(e.t);
    sim.setInput(e.comp, e.v);
  }
  sim.run(until);
  return sim;
}

/** 时钟波形事件：高电平在 [kT, kT+T/2)，上升沿在 kT，下降沿在 kT+T/2 */
export function clockEvents(comp: string, T: number, cycles: number, start = 0): { t: number; comp: string; v: L }[] {
  const out: { t: number; comp: string; v: L }[] = [];
  for (let k = 0; k < cycles; k++) {
    out.push({ t: start + k * T, comp, v: 1 });
    out.push({ t: start + k * T + T / 2, comp, v: 0 });
  }
  return out;
}
