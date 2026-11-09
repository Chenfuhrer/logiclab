"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Simulator } from "@/lib/sim/engine";
import type { L, Netlist, SimOptions } from "@/lib/sim/types";

/**
 * 在 React 中驱动仿真引擎：引擎是可变对象，放在 ref 中；每次操作后递增版本号触发重绘。
 * 网表或选项变化时重建引擎。
 */
export function useSimulation(netlist: Netlist | null, opts: Partial<SimOptions> = {}) {
  const key = JSON.stringify(opts);
  const sim = useMemo(() => (netlist ? new Simulator(netlist, opts) : null), [netlist, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const step = useCallback(
    (n = 1) => {
      if (!sim || sim.halted) return;
      for (let i = 0; i < n; i++) sim.stepClock();
      bump();
    },
    [sim, bump],
  );
  const toggle = useCallback(
    (id: string) => {
      if (!sim) return;
      const comp = sim.netlist.components.find((c) => c.id === id);
      if (!comp) return;
      const cur = (sim.compState(id).value as L) ?? 0;
      sim.setInput(id, cur === 1 ? 0 : 1);
      bump();
    },
    [sim, bump],
  );
  const setInput = useCallback(
    (id: string, v: L) => {
      if (!sim) return;
      sim.setInput(id, v);
      bump();
    },
    [sim, bump],
  );
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);
  const run = useCallback(
    (ms = 600) => {
      if (!sim) return;
      stop();
      setRunning(true);
      timer.current = setInterval(() => {
        if (sim.halted) {
          stop();
          return;
        }
        sim.stepClock();
        bump();
      }, ms);
    },
    [sim, bump, stop],
  );
  useEffect(() => stop, [sim, stop]);
  return { sim, version, bump, step, toggle, setInput, run, stop, running };
}
