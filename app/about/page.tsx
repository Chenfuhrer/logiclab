import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tex } from "@/components/ui/Tex";

export const metadata: Metadata = { title: "模型与依据" };

const MODELS = [
  ["A", "理想逻辑模型", "0、1，零延迟。用于逻辑分析、状态表推导。", "已实现"],
  ["B", "四值逻辑模型", "0、1、X（未知）、Z（高阻）。未初始化状态为 X；三态总线按驱动解析，多个使能输出相反时为 X 并报冲突；OC/OD 输出线与，缺上拉时警告。X 采用“分别代入 0 和 1，结果一致才确定”的精确传播。", "已实现"],
  ["C", "事件驱动延迟模型", "事件队列 + delta 周期；采用传输延迟（transport delay），不吞窄脉冲。可观察冒险毛刺、纹波延迟、74LS161 异步清零瞬态、建立/保持时间违例（违例时触发器状态记为 X）。默认 tpd：门 10 ns、触发器与中规模器件 20 ns，为教学示意值。", "已实现"],
  ["D", "电气教学模型", "电平阈值、噪声容限、扇出、OC 上拉电阻范围、时序裕量。74LS 参数取自 TI SN74LS00 数据手册（⚠️待验证），74HC 为典型量级（⚠️待验证）。", "已实现（计算器）"],
  ["E", "模拟近似模型", "555 定时器（理想比较器与锁存器、放电管导通电阻为 0，RC 指数充放电）与 DAC/ADC（理想运放与开关、电阻精确匹配、比较器无失调）；解析公式在单元测试中与独立计算相互校核。界面标注“教学近似模型”。", "已实现"],
];

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 sm:px-5 py-8 space-y-10">
      <PageHeader eyebrow="模型与依据" title="这个平台算的是什么、依据是什么">
        教学正确性 &gt; 仿真真实性 &gt; 功能可靠性 &gt; 交互体验 &gt; 视觉质量 &gt; 功能数量。下面列出全部模型假设、符号约定、资料来源，以及尚未完成的部分。
      </PageHeader>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-xl font-bold">仿真模型</h2>
        <div className="space-y-2">
          {MODELS.map(([k, name, desc, st]) => (
            <div key={k} className="card p-4 grid grid-cols-[2.2rem_1fr] gap-3">
              <span className="mono text-2xl font-bold text-accent">{k}</span>
              <div>
                <div className="flex gap-2 items-center">
                  <span className="font-semibold">{name}</span>
                  <span className={`chip ${st === "规划中" ? "" : "chip-accent"}`}>{st}</span>
                </div>
                <p className="text-sm text-ink-2 mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="card p-4 text-sm leading-relaxed text-ink-2 space-y-2">
          <p>
            <strong className="text-ink">同步触发器的两阶段更新</strong>：同一 delta 内先把全部驱动值提交到网络，再让受影响的元件用提交后的值求值；元件输出最早在下一个 delta 生效。因此同一时钟沿触发的所有触发器采样到的都是沿之前的状态，任何一个触发器的新状态都不会影响同一沿内其他触发器的采样。
          </p>
          <p>
            <strong className="text-ink">组合反馈</strong>：编译时用强连通分量找出无存储元件的反馈环并提示；零延迟下按 delta 迭代，收敛（例如门级锁存器）则接受，超过 1000 次仍不收敛判为振荡并停止。
          </p>
          <p>
            <strong className="text-ink">主从 JK</strong>按脉冲触发建模（CLK=1 期间主触发器动作并存在一次翻转，下降沿输出），不用边沿模型代替。<strong className="text-ink">锁存器</strong>按电平敏感建模。
          </p>
          <p>
            <strong className="text-ink">自动符号分析</strong>只处理“边沿触发器 + 推挽门 + 同一时钟源”的同步电路；含中规模器件、异步时钟、异步置位复位、OC 门或组合反馈时明确拒绝，不猜测方程，但仍可仿真。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-xl font-bold">逻辑求解器</h2>
        <ul className="card p-4 text-sm text-ink-2 space-y-1.5 leading-relaxed list-disc pl-8">
          <li>运算优先级：非 &gt; 与 &gt; 异或/同或 &gt; 或；支持 A′、Ā、!A、~A、¬A、AB、A·B、A&amp;B、A+B、A|B、⊕、^、⊙ 与括号。</li>
          <li>化简：Quine–McCluskey 求全部质蕴含项，Petrick 方法求全部最简覆盖（成本：先项数、后字面量数）。10 个变量以内精确；Petrick 展开超过上限时退化为贪心并明确提示“不保证全局最简”。</li>
          <li>等价验证：16 个变量以内穷举真值表；更多变量用 ROBDD 规范形比较，并给出反例。</li>
          <li>验证：全部 65536 个四变量函数的每个最简解与原函数等价（专项测试 npm run test:exhaustive）；全部 256 个三变量函数的最简成本与独立暴力搜索一致。</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-xl font-bold">符号约定与资料依据</h2>
        <div className="card p-4 text-sm text-ink-2 space-y-2 leading-relaxed">
          <p>
            项目资料目录中的 20 份文件全部属于《模拟电子技术》课程，没有数字电路的大纲、课件或试卷。唯一的数字电路资料是《电子技术综合实验教程》（赵文来主编，机械工业出版社，2017）第 2.11 节“集成门电路及组合电路”。因此课程顺序采用康华光、阎石教材的通行体系；本平台不引用任何教材页码。
          </p>
          <p>
            默认符号：逻辑非用上划线（依据上述实验教程），次态用 <Tex>{"Q^{n+1}"}</Tex>（康华光写法），逻辑符号用国标 GB/T 4728.12 矩形符号。可在右上角“符号约定”切换为撇号、<Tex>{"Q^*"}</Tex>（阎石写法）与 ANSI 特异形符号。
          </p>
          <p>
            资料与数据手册的冲突：该实验教程以 74LS00 为实验器件，却给出“低电平最大负载电流 16 mA、输入高电平电流约 40 µA”——这是标准 74 系列的数值；74LS00 的 I<sub>OL(max)</sub> 为 8 mA、I<sub>IH(max)</sub> 为 20 µA（TI 数据手册，⚠️待验证）。平台采用 74LS 数据手册值，并在第 3 章说明差异。教程中“非门”符号框内印成了 &amp;，国标应为 1。
          </p>
          <p>74LS138、74LS151、74LS161/163、74LS194 的功能按 TI 数据手册功能表建模（D0/Q0 为最低位）。74LS160/162/290 尚未建模。</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-xl font-bold">HDL 与 AI 助教</h2>
        <div className="card p-4 text-sm text-ink-2 space-y-2 leading-relaxed">
          <p>
            <strong className="text-ink">Verilog 子集解释器</strong>：支持 module/端口、wire/reg/parameter、assign、always @(*) 与 @(posedge/negedge …)、if/case、阻塞与非阻塞赋值、模块例化与参数覆盖，信号 ≤32 位，逐位 0/1/x；按时钟周期推进、零延迟，同一时刻内按 delta 轮次处理非阻塞赋值与异步复位。不支持 initial、# 延迟、$ 系统任务、function/task、generate、signed、z。静态检查多驱动、锁存器推断、敏感列表不完整、同一沿上的阻塞赋值竞争。
          </p>
          <p>
            <strong className="text-ink">交叉验证</strong>：实验 A、多种 74LS161 设计、设计向导结果导出的 Verilog，在测试中由解释器运行，与电路仿真引擎逐拍比对一致；导出的三段式状态机与原始状态表逐拍一致。导出的自检 Testbench 面向真实仿真器，本平台没有执行它。
          </p>
          <p>
            <strong className="text-ink">AI 助教</strong>：服务端调用 Claude（claude-opus-5-5，开启服务端拒答回退 fallbacks: &quot;default&quot;），密钥只保存在服务端环境变量。化简、等价验证、状态表、计数器模数、序列检测器设计、Verilog 运行、555 计算、读取当前页面电路，都通过工具调用平台的确定性求解器与仿真引擎完成；提问时会把当前页面的题目、作答或电路发送到本站服务端。未配置密钥时其余功能不受影响。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-cjk-serif)] text-xl font-bold">尚未完成</h2>
        <ul className="card p-4 text-sm text-ink-2 space-y-1.5 list-disc pl-8">
          <li>器件模型尚缺 74LS148/153/283/85/160/162/290；三态与 OC 网络不能导出为 Verilog。</li>
          <li>独热码编码；不完全确定状态表的化简。</li>
          <li>Verilog：平台内置的是教学用 Verilog 子集解释器（见下方“HDL 与 AI 助教”），不是完整的 HDL 仿真器；完整语言特性请下载 .v 与自检 Testbench 到 iverilog 等工具中运行。</li>
        </ul>
      </section>
    </main>
  );
}
