# 系统架构

## 1. 分层

```
┌──────────────────────────── app/（Next.js 16 App Router，页面与路由）────────────────────────────┐
│ /  /learn  /learn/[lesson]  /lab  /lab/{jk-counter,ls161,fsm-designer,logic,sandbox}  /practice  /review  /about │
└───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                │ 只依赖 components 与 content
┌───────────────▼────────────── components/（UI，全部可替换）───────────────────────────────────┐
│ layout · course（MDX 组件、课程树、模式切换）· circuit（Schematic 渲染、几何）· waveform · karnaugh │
│ fsm（状态图、分析面板）· lab（实验 A/B/C、沙盒）· practice（判分播放器、练习、复习）· widgets       │
└───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                │ 纯函数调用，无 React 依赖
┌───────────────▼────────────── lib/（核心内核，独立于 UI，可在 Node 中单独测试）─────────────────┐
│ logic/   表达式 AST、解析器、真值表、等价验证（穷举 / ROBDD）、QM+Petrick、卡诺图、推导验证       │
│ sim/     网表类型、四值逻辑、元件模型库、事件驱动引擎（delta 周期 / 传输延迟）、激励工具        │
│ fsm/     同步电路符号分析、网表 → 方程提取、状态化简、编码与综合、序列检测器、方程 → 网表       │
│ counters/74LS161 任意进制设计与仿真验证                                                       │
│ exercises/ 题型定义与确定性判分                                                               │
│ numbers/ analog-models/ 数制、编码、电平、上拉、时序计算                                        │
│ storage/ 学习记录统一接口（Zustand + localStorage）                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
content/  课程体系（course.ts）、知识图（knowledge.ts）、MDX 课时、题库、实验网表构造器
```

依赖方向严格向下：`lib` 不引用 `components`/`app`；`lib/logic` 不依赖 `lib/sim`；`lib/fsm` 依赖 `logic` 与 `sim`（仅用于从网表提取与仿真验证）。

## 2. 统一网表（lib/sim/types.ts）

```ts
Netlist { version: 1; name; components: ComponentInstance[]; nets: Net[] }
ComponentInstance { id; type; label?; params?; x; y; rot? }       // 位置供电路图使用
Net { id; name?; endpoints: { comp; pin }[]; wires?: [x,y][][] }
PinDef { name; label(LaTeX); dir; active: high|low; clock?: rising|falling|pulse; kind?: pushpull|tristate|opencollector|pull; optional?; desc; datasheet? }
```

引脚定义、方向、有效电平、触发方式都来自元件模型（`lib/sim/models.ts`），网表只保存实例与连接，可直接 `JSON.stringify`。同一份网表被以下模块复用：

| 消费者 | 用法 |
|---|---|
| 电路图 `components/circuit/Schematic` | 按 `geometry()` 计算引脚坐标，导线按网络取值着色 |
| 仿真引擎 `lib/sim/engine` | 编译为驱动/读者表后事件驱动求值 |
| 状态机分析 `lib/fsm/extract` → `analyze` | 从触发器输入回溯组合逻辑，得到驱动方程 |
| 波形 `components/waveform` | 读取引擎每个网络的 `TracePoint[]` |
| 判分 `lib/exercises/grade` | 波形题用网表 + 引擎生成参考答案 |
| 沙盒编辑器 | 直接编辑网表；导入/导出 JSON |

## 3. 仿真引擎（lib/sim/engine.ts）

- **时间**：整数 ns + delta 序号。事件队列按时间有序；同一时刻内用 delta 批次推进。
- **两阶段**：每个 delta 先提交本批全部驱动值并解析网络，再让受影响元件用提交后的值求值；输出进入下一 delta（零延迟）或 `t + tpd`（模型 C）。所以同一时钟沿上的所有触发器都在同一 delta 采样沿前状态。
- **跳变**：`rise/fall` 为确定沿，`xrise/xfall` 为涉及 X 的可能沿（结果与原状态合并）。网络首次赋值不算跳变。
- **上电初始化**：零延迟完成。先冻结存储元件状态只输出状态，让组合网络稳定，再让存储元件按稳定后的异步输入求值一次。
- **总线解析**：推挽多驱动、推挽与三态/OC 混接为编译错误；三态忽略 Z，使能输出相反为 X 并记录冲突；OC 输出线与，缺上拉警告；上拉为弱驱动 1。
- **反馈**：Tarjan SCC 找纯组合环并提示；零延迟下 delta 超过上限判为不收敛并停止；模型 C 中事件数上限防止振荡无限运行。
- **时序检查**（模型 C）：建立时间违例 → 存储状态变 X 并警告；保持时间违例 → 警告。
- **X 传播**：中规模器件用 `resolveX` 把未知输入分别代入 0/1，结果一致才确定。

## 4. 符号分析与设计（lib/fsm）

- `extract`：只接受“边沿触发器 + 推挽门 + 单一时钟源 + 未用异步端”的同步电路，否则返回明确原因（不猜测）。
- `analyze`：驱动方程代入特性方程得状态方程（QM 化简展示），枚举 2ⁿ×2ᵏ 行得状态表；Moore/Mealy 按真值表判断；自启动用最小不动点区分 always/some/never，并列出无效循环。
- `design`：隐含表迭代划格 + 并查集求等价类；编码（二进制/自定义）；按激励表生成带无关项的列，QM 最小化；逐状态核对驱动方程是否实现目标次态；可选“未用状态强制回初始态”。
- `netlistgen`：方程 → 门级网表，供电路图与仿真对照验证。

## 5. 课程与内容

- `content/course.ts` 是课程、章节、实验的单一数据源；`content/knowledge.ts` 是知识依赖图。
- 课时正文为 MDX（`content/chapters/<ch>/<lesson>.mdx`），可用组件清单见 `docs/content-guide.md`；`scripts/gen-content.mjs` 在 dev/build/test 前生成静态导入表。
- 三种学习模式通过 `<Mode show>` 块 + 外层 `data-learn-mode` 的 CSS 选择器切换，服务端渲染包含全部内容。

## 6. 尚未采用的建议项与原因

- **Web Worker**：当前最大的同步计算是两片 74LS161 的 256 个上电状态自启动检查（各 ≤300 拍），在浏览器中约百毫秒级（⚠️待验证，未做正式性能测试），暂未放入 Worker；`workers/` 目录保留。
- **React Flow**：电路图用自写 SVG 渲染器，以便与仿真着色、国标符号、引脚说明深度集成。
- **Plotly**：模拟曲线（模型 E）尚未实现。
