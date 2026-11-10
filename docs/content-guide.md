# 课程内容编写规范（content-guide）

本文件是课程 MDX 与题库的**契约**。课程正文写在 `content/chapters/<chapterId>/<lessonId>.mdx`，题目写在 `content/exercises/<lessonId>.ts`。课时元数据（标题、前置、知识点）只在 `content/course.ts` 中维护，MDX 里不要重复写标题。

## 1. 正确性红线

1. **不编造**：不引用教材页码、不写"某教材第 X 页"；不编造器件参数。需要器件参数时只用 `docs/materials-summary.md` 中给出的 74LS00 数据（并保留"⚠️待验证"标记），或写明"典型量级，具体以数据手册为准"。
2. **所有逻辑结论必须可验证**：例题的化简结果、状态表、波形必须正确。写完后用项目的求解器核对（见 §6）。
3. **区分模型**：涉及电压、电流、延迟时注明"电气层/带延迟模型"；理想逻辑分析注明"逻辑层/理想模型"。
4. 锁存器 ≠ 触发器；主从 JK 不能当作边沿 JK 讲。
5. 考试模式中的"高频题型"写成"通行题型"，不要声称是本校统计（本地没有数电试卷）。

## 2. 符号约定

- 逻辑非：上划线 `\overline{A}`；两个相邻的单变量上划线之间加 `\,`，例如 `\overline{A}\,\overline{B}`。
- 次态：`Q^{n+1}`，现态 `Q^n`；下标写成 `Q_0^{n+1}`。
- 与：并列书写 `AB`，需要强调时用 `A\cdot B`；异或 `\oplus`，同或 `\odot`。
- 低电平有效引脚：`\overline{R_D}`、`\overline{LD}`、`\overline{Y_0}`、`\overline{S_2}`。74LS161 引脚：`\overline{R_D}`、`\overline{LD}`、`EP`、`ET`、`CLK`、`D_0`～`D_3`、`Q_0`～`Q_3`、`C`（D0/Q0 为最低位）。74LS138：`A_2A_1A_0`、`S_1`、`\overline{S_2}`、`\overline{S_3}`、`\overline{Y_0}`～`\overline{Y_7}`。74LS151：`A_2A_1A_0`、`D_0`～`D_7`、`\overline{S}`、`Y`、`\overline{W}`。
- 逻辑符号采用国标矩形符号（`&`、`≥1`、`=1`、`1`）。

## 3. 课时结构（13 部分，使用二级标题，按顺序）

```mdx
## 学习目标
## 前置知识
## 实际问题
## 直观解释
## 基本原理
## 电路结构
## 逻辑推导
## 交互实验
## 典型例题
## 分层练习
## 常见错误
## 知识总结
## 后续知识关联
```

某部分确实不适用时（例如数制课没有"电路结构"），保留标题并用一两句话说明本课在逻辑层讨论、电路实现见哪一课。

## 4. 三种学习模式

页面顶部有"基础解释 / 深入推导 / 考试复习"切换。用 `<Mode>` 包住只在某些模式显示的内容；**不包的内容在所有模式都显示**。

```mdx
<Mode show="basic">开关与灯泡的类比……</Mode>
<Mode show="deep">完整的布尔代数推导……</Mode>
<Mode show="exam">标准解题步骤、常见陷阱、限时练习提示……</Mode>
<Mode show="deep exam">两种模式都显示</Mode>
```

`<Mode>` 内部可以写 Markdown 和公式（`<Mode>` 标签前后各空一行）。

## 5. 可用组件（只能使用下列组件，名称和属性必须完全一致）

### 文本类
| 组件 | 属性 | 说明 |
|---|---|---|
| `<Callout type="tip">…</Callout>` | `type`: `tip` `warn` `pitfall` `model` `exam` `note`；可选 `title` | 提示框。`model` 用于说明"当前使用的模型"（逻辑层/电气层） |
| `<Example title="例 1">题干 <Solution>解答</Solution></Example>` | `title` | 例题，解答默认折叠 |
| `<Mode show="…">` | 见 §4 | |

### 交互类（JSX 属性用 `{}` 传数组/对象）
| 组件 | 属性 | 说明 |
|---|---|---|
| `<ExprLab initial="AB+A'C+BC" />` | `initial` 表达式文本 | 表达式 → 真值表/最小项/卡诺图/最简式/逻辑图，可编辑 |
| `<TruthTable expr="A⊕B" />` | `expr`，可选 `vars={["A","B"]}` | 静态真值表（计算得到） |
| `<KMapLab vars={["A","B","C","D"]} minterms={[0,2,5]} dontCares={[10,11]} />` | `vars`(2～5 个)、`minterms`、可选 `dontCares` | 可点格子改值、圈组、检查、查看最简解 |
| `<Derivation steps={[{expr:"AB+A'C+BC"},{expr:"AB+A'C+BC(A+A')",rule:"multiply-one",explain:"…"}]} />` | `steps`：`expr`（解析器文本）、`rule`、`explain`、`condition`、`pitfall` | 逐步推导，每一步都由求解器验证等价。`rule` 取值见 §5.1 |
| `<GateLab />` | 无 | 七种门的符号（国标/ANSI 可切换）+ 拨动输入 |
| `<BaseConverter />` | 无 | 进制转换（含小数） |
| `<ComplementLab />` | 无 | 原码/反码/补码、补码加法与溢出 |
| `<CodeLab />` | 无 | 8421/2421/余 3/格雷码对照与格雷码互换 |
| `<LevelsLab />` | 无 | 电平阈值、噪声容限、扇出（电气教学模型） |
| `<OCPullupLab />` | 无 | OC 门上拉电阻取值范围计算 |
| `<TriStateBusLab />` | 无 | 两个三态门驱动同一总线，演示 Z 与冲突 X |
| `<Decoder138Lab />` | 无 | 74LS138 引脚级实验 |
| `<Mux151Lab />` | 无 | 74LS151 引脚级实验 |
| `<HazardLab />` | 无 | 带延迟模型下的冒险毛刺与冗余项消除 |
| `<LatchLab />` | 无 | 或非门 SR 锁存器（门级反馈仿真） |
| `<TriggerCompare />` | 无 | 同一组输入下 D 锁存器 / 边沿 D 触发器 / 主从 JK 的输出对比 |
| `<FFLab type="JK" edge="falling" />` | `type`: `D` `JK` `T` `SR`；`edge`: `rising` `falling` | 可编辑输入波形，引擎计算输出波形 |
| `<SyncAnalyzer circuit={{inputs:[],ffs:[{name:"Q1",type:"JK",inputs:{J:"Q0",K:"Q0"}},{name:"Q0",type:"JK",inputs:{J:"1",K:"1"}}],outputs:[{name:"C",expr:"Q1Q0"}]}} />` | `circuit`：ffs 按高位到低位；`type` 为 `D` `JK` `T` `SR`；`inputs` 的值是表达式文本 | 自动给出状态方程、状态表、状态图、自启动结论 |
| `<RippleCounterLab />` | 无 | 3 位异步（纹波）计数器，带延迟波形与译码毛刺 |
| `<ShiftRegisterLab />` | 无 | 74LS194 引脚级实验，含环形/扭环形预设 |
| `<SeqDetectorDemo seq="101" kind="mealy" overlap={true} />` | `seq`、`kind`(`mealy`/`moore`)、`overlap` | 自动生成原始状态表与状态图，可跳转到设计向导 |
| `<TimingCalc />` | 无 | f_max、建立/保持裕量计算 |
| `<Timer555Lab mode="astable" />` | `mode`: `astable`（多谐振荡器）`monostable`（单稳态）`schmitt`（施密特触发器） | 555 内部结构（比较器 C1/C2、锁存器、放电管状态）+ 电容电压与输出波形 + 参数计算，**模型 E：教学近似模型** |
| `<MemoryLab mode="rom" />` | `mode`: `rom`（用 ROM 实现组合函数）`expand`（位扩展/字扩展） | 第 8 章 |
| `<PLDLab mode="pla" />` | `mode`: `pla`（与或阵列编程）`lut`（逻辑函数映射到 LUT） | 第 9 章 |
| `<DACLab />` | 无 | 权电阻 / R-2R DAC，模型 E 教学近似 |
| `<ADCLab mode="sar" />` | `mode`: `sar`（逐次逼近）`flash`（并联比较）`dual-slope`（双积分） | 模型 E 教学近似 |
| `<VerilogLab example="counter3" />` | `example`：见 `lib/hdl/examples.ts` 的 id；可选 `height` | Verilog 子集解释器 + 波形，**教学用子集解释器，不是完整 HDL 仿真器** |
| `<ExperimentCard id="jk-counter" />` | `id`: `jk-counter` `ls161` `fsm-designer` `timer555` `verilog` `logic` `sandbox` | 实验入口卡片 |
| `<Quiz lesson="kmap" />` | `lesson` | 显示该课时题库中的全部题目（按基础/分析/设计分层），可提交判分。放在"分层练习"部分 |

### 5.1 `Derivation` 的 rule 取值
`complement-law` 互补律，`identity` 0-1 律，`idempotent` 重叠律，`distributive` 分配律，`absorption` 吸收律，`consensus` 冗余项定理，`demorgan` 反演律，`involution` 还原律，`multiply-one` 配项法，`commutative` 交换/结合律，`merge` 合并项，`xor-def` 异或定义，`characteristic` 特性方程代入。

`expr` 使用解析器文本语法：`A'` 或 `!A` 表示非，`(A+B)'` 表示长非号，`AB` 表示与，`+` 或，`⊕` 异或，`⊙` 同或，下标变量写 `Q0`、`Q1`。

## 6. 题库（`content/exercises/<lessonId>.ts`）

```ts
import type { Exercise } from "@/lib/exercises/types";
export const exercises: Exercise[] = [ ... ];
```

每个课时至少 6 题：基础 ≥2、计算与分析 ≥2、综合设计 ≥1（设计题不适用的课时可用较难的分析题代替）。题型见 `lib/exercises/types.ts`：

- `choice`（单选/多选）、`numeric`、`text`（normalize：`binary` 只用于纯二进制数——会忽略整数前导 0 与 (2)/B 后缀；八/十六进制用 `upper`；补码、BCD、格雷码等定长码的前导 0 有意义，用 `nospace`）、
- `expression`（与目标函数等价即功能正确；`minimal: "sop"` 要求最简与或式）、
- `kmap`（学生在卡诺图上圈组）、`statetable`（给出驱动方程，学生填次态）、`waveform`（给出每个周期的输入，学生填每个有效沿后的 Q）。

要求：
- `id` 全局唯一，格式 `<lessonId>-<序号>`，例如 `kmap-3`。
- `hints` 至少 1 条，**提示不直接给答案**。
- `explanation` 给完整解题过程。
- `knowledge` 填 `content/knowledge.ts` 中存在的 id。
- 题目全部为原创，不抄录教材习题原文。
- 运行 `npm test` —— `tests/unit/exercises.test.ts` 会自动检查：选择题答案下标有效、表达式题目标可解析、卡诺图题最简解存在、波形题参考答案无 X、id 唯一、knowledge 存在。

## 7. 自检命令

```bash
npm test          # 单元测试 + 题库自洽检查
npm run build     # MDX 编译（组件名写错会在这里失败）
```
