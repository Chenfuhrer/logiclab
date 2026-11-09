// 由 scripts/gen-content.mjs 自动生成，请勿手改
import type { Exercise } from "@/lib/exercises/types";
import { exercises as e0 } from "./async-analysis";
import { exercises as e1 } from "./basic-ops";
import { exercises as e2 } from "./canonical";
import { exercises as e3 } from "./codes";
import { exercises as e4 } from "./comb-design";
import { exercises as e5 } from "./complement";
import { exercises as e6 } from "./counters";
import { exercises as e7 } from "./decoder-mux";
import { exercises as e8 } from "./flipflops";
import { exercises as e9 } from "./hazards";
import { exercises as e10 } from "./kmap";
import { exercises as e11 } from "./latches";
import { exercises as e12 } from "./levels";
import { exercises as e13 } from "./number-systems";
import { exercises as e14 } from "./registers";
import { exercises as e15 } from "./seq-basics";
import { exercises as e16 } from "./sequence-detector";
import { exercises as e17 } from "./sync-analysis";
import { exercises as e18 } from "./sync-design";
import { exercises as e19 } from "./theorems";
import { exercises as e20 } from "./timing";
import { exercises as e21 } from "./triggering";
import { exercises as e22 } from "./tristate-oc";

export const ALL_EXERCISES: Exercise[] = [...e0, ...e1, ...e2, ...e3, ...e4, ...e5, ...e6, ...e7, ...e8, ...e9, ...e10, ...e11, ...e12, ...e13, ...e14, ...e15, ...e16, ...e17, ...e18, ...e19, ...e20, ...e21, ...e22];

export function exercisesOf(lesson: string): Exercise[] {
  return ALL_EXERCISES.filter((e) => e.lesson === lesson);
}

export function findExercise(id: string): Exercise | undefined {
  return ALL_EXERCISES.find((e) => e.id === id);
}
