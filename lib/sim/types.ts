/**
 * 统一电路网表格式（可序列化为 JSON）。
 * 同一网表供：电路编辑器、仿真引擎、状态机分析器、波形生成、练习判分、AI 助手 复用。
 */

/** 四值逻辑：0、1、X（未知）、Z（高阻） */
export type L = 0 | 1 | 2 | 3;
export const L0: L = 0;
export const L1: L = 1;
export const LX: L = 2;
export const LZ: L = 3;

export const L_TEXT: Record<L, string> = { 0: "0", 1: "1", 2: "X", 3: "Z" };

export type PinDir = "in" | "out";
/** 输出结构：推挽 / 三态 / 集电极（漏极）开路 / 上拉（弱驱动） */
export type OutKind = "pushpull" | "tristate" | "opencollector" | "pull";

export interface PinDef {
  name: string;
  /** LaTeX 形式的引脚标签，例如 \overline{R_D} */
  label: string;
  dir: PinDir;
  /** 有效电平 */
  active?: "high" | "low";
  /** 时钟引脚的触发方式 */
  clock?: "rising" | "falling" | "pulse";
  kind?: OutKind;
  /** 未连接时是否按"无效"处理（仅用于异步置位/复位等可选引脚） */
  optional?: boolean;
  /** 引脚说明（点击引脚时显示） */
  desc: string;
  /** 数据手册中的引脚名 */
  datasheet?: string;
}

export interface ComponentInstance {
  id: string;
  type: string;
  /** 显示名，例如 FF0、U1 */
  label?: string;
  params?: Record<string, number | string | boolean>;
  x: number;
  y: number;
  /** 旋转角度（0/90/180/270） */
  rot?: number;
}

export interface NetEndpoint {
  comp: string;
  pin: string;
}

export interface Net {
  id: string;
  /** 网络名（例如 Q0、CLK），用于波形和方程 */
  name?: string;
  endpoints: NetEndpoint[];
  /** 绘图用的折线，每条为一组点 [x, y] */
  wires?: [number, number][][];
}

export interface Netlist {
  version: 1;
  name: string;
  description?: string;
  components: ComponentInstance[];
  nets: Net[];
}

export type SimModelKind = "ideal" | "delay";

export interface SimOptions {
  /**
   * ideal：模型 A/B——零延迟，四值逻辑，同一时刻内按 delta 周期推进；
   * delay：模型 C——事件驱动，采用**传输延迟（transport delay）**：每个输出变化都按元件延迟原样传播，
   *        不吞掉短于延迟的脉冲（本项目不使用惯性延迟）。
   */
  model: SimModelKind;
  /** 输入悬空的处理：X（逻辑模型，默认）或 TTL（按 TTL 输入悬空≈高电平） */
  floating: "X" | "TTL";
  /** 同一时刻 delta 周期上限（零延迟反馈不收敛时停止） */
  maxDelta: number;
  /** 一次 run 允许处理的事件数上限（防止振荡电路无限运行） */
  maxEvents: number;
}

export const DEFAULT_SIM_OPTIONS: SimOptions = { model: "ideal", floating: "X", maxDelta: 1000, maxEvents: 500_000 };

export interface SimIssue {
  level: "error" | "warning" | "info";
  code:
    | "pushpull-conflict"
    | "mixed-drivers"
    | "bus-conflict"
    | "no-pullup"
    | "floating-input"
    | "comb-loop"
    | "no-converge"
    | "event-limit"
    | "unknown-type"
    | "unknown-pin"
    | "multi-net-pin"
    | "setup-violation"
    | "hold-violation"
    | "forbidden-input";
  message: string;
  comps?: string[];
  net?: string;
  time?: number;
}

/** 波形记录：某网络的一次取值变化 */
export interface TracePoint {
  t: number;
  /** 同一时刻内的 delta 序号（零延迟模型中用于表示"同一时刻内的事件先后"） */
  d: number;
  v: L;
}
