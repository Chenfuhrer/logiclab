"use client";

import { useSearchParams } from "next/navigation";
import { FsmDesigner } from "./FsmDesigner";

export function DesignerFromQuery() {
  const q = useSearchParams();
  const seq = /^[01]{2,8}$/.test(q.get("seq") ?? "") ? q.get("seq")! : "101";
  const kind = q.get("kind") === "moore" ? "moore" : "mealy";
  const overlap = q.get("overlap") !== "0";
  return <FsmDesigner key={`${seq}-${kind}-${overlap}`} initialSeq={seq} initialKind={kind} initialOverlap={overlap} />;
}
