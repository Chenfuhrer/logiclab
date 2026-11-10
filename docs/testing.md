# 测试说明

## 命令

```bash
npm test                 # Vitest 单元测试（含题库自洽检查）
npm run test:exhaustive  # 专项：全部 65536 个四变量函数的化简验证
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm run check:mdx        # 编译全部课程 MDX，检查组件名、13 部分结构、KaTeX
npm run build            # 生产构建（预渲染全部 43 个路由）
npm run test:e2e         # Playwright（自动启动 next start -p 3211）
```

Playwright 默认使用自己下载的 Chromium。本机若已有其他版本，可设 `PW_CHROMIUM=/path/to/chrome-headless-shell` 复用。

## 覆盖范围

| 模块 | 文件 | 要点 |
|---|---|---|
| 逻辑求解器 | `tests/unit/logic.test.ts` | 运算优先级、10 种写法、9 类非法输入、真值表编号约定、常量函数、BDD（20 变量）、fast-check 性质测试（往返、BDD≡穷举、反演定理、对偶定理、含无关项的 QM）、循环质蕴含多解、无关项、POS、256 个三变量函数对独立暴力搜索的最简性、LaTeX、推导验证、或与式判分 |
| 穷举 | `tests/exhaustive/qm-4var.test.ts` | 65536 个四变量函数：每个最简与或解与最简或与式都与原函数等价 |
| 仿真 | `tests/unit/sim.test.ts` | D/JK/T/SR、上升/下降沿、初始 X、异步置位复位、D 锁存器透明、主从 JK 一次翻转、两阶段更新（移位链、交换电路）、实验 A 计数序列与 C、推挽冲突、三态 Z/冲突 X、OC 线与与缺上拉、输入悬空（X / TTL）、门级锁存器收敛、自环不收敛停止、环形振荡周期、冒险毛刺时刻、建立时间违例 |
| 状态机 / 计数器 | `tests/unit/fsm.test.ts` | 网表提取方程、状态方程、符号分析与仿真逐状态一致、拒绝不支持电路、自启动 always/some/never 与无效循环、隐含表（仅输出相同不能合并）、序列检测器 5 种序列 × Mealy/Moore × 重叠/不重叠对字符串参考模型、D/JK/T 综合、强制自启动、模 5 JK 经典方程、74LS161/163 N=2～16 × 4 种方法测模数与瞬态、异步清零的 delta 序列与 30 ns 瞬态、两片级联 N=24/60/100/256、预置数、自启动；18 个设计结果门级仿真逐拍比对 |
| 题库 | `tests/unit/exercises.test.ts` | 186 题逐题：答案可被判分器判为正确、knowledge/lesson 存在、id 唯一、提示存在 |
| 评审回归 | `tests/unit/review-regressions.test.ts` | 独立代码评审确认的 10 个问题 |
| 555 定时器 | `tests/unit/timer555.test.ts` | 阈值与 CO、功能表优先级、RC 时间、多谐/单稳/施密特解析公式与时间步进仿真交叉校核、宽触发与重复触发、非法参数 |
| Verilog | `tests/unit/hdl.test.ts`、`hdl-examples.test.ts` | 报错与行号、静态检查、逐位 x 语义、上下文位宽、阻塞/非阻塞、边沿约定；**电路 → Verilog 与电路仿真逐拍一致**（实验 A ×2、74LS161 ×5、设计向导）；三段式与状态表一致；12 个示例的预期结果 |
| AI 助教 | `tests/unit/ai.test.ts` | 9 个工具的计算结果与非法输入；路由：未配置 503、工具循环（模拟 SDK）、拒答、请求校验 |
| 存储器/PLD/转换器 | `memory.test.ts`、`converters.test.ts` | 容量与扩展、ROM 表、PLA 等价、LUT；DAC 两种网络一致、SAR = 量化、并联编码、双积分与 RC 无关 |
| 计算器 | `tests/unit/numbers.test.ts`、`analog-models.test.ts` | 进制、补码、溢出、BCD/2421/余 3/格雷码、电平、上拉、时序 |
| 端到端 | `tests/e2e/core.spec.ts` | 42 个路由零运行错误；555 实验三种接法；Verilog 实验台与对照页；编译错误行号；AI 助教未配置提示（端到端测试会去掉 ANTHROPIC_* 环境变量）；实验 A/B/C、逻辑工作台、模式切换、完成标记持久化、练习判分与错题本、主题切换（含移动端视口） |

## 布局自检

使用 `layout-collision-checker` 对首页、课程目录、实验 A、实验 B、同步分析课、练习页在 1440×900 与 390×844 下检查：文字压文字 0、文字压图 0；首页的 minor/absolute 项为装饰性背景网格与标题下方方波下划线（刻意重叠）。

## 未覆盖 / 已知限制

- 未做性能基准测试；文中涉及耗时的描述均为定性。
- 74HC 电平参数来自经验值，未对照数据手册（界面标注 ⚠️待验证）。
- Playwright 只跑 Chromium，未测 Firefox/Safari。
- AI 助教没有真实 API 调用测试；导出的 Testbench 没有在 iverilog 中运行（本机未安装）。
