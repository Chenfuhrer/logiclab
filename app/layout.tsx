import type { Metadata, Viewport } from "next";
import { Instrument_Serif, IBM_Plex_Sans, JetBrains_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/layout/TopBar";
import { Footer } from "@/components/layout/Footer";
import { Assistant } from "@/components/ai/Assistant";

const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500", "700"] });
const notoSerif = Noto_Serif_SC({ variable: "--font-noto-serif", weight: ["600", "900"], preload: false, display: "swap" });

export const metadata: Metadata = {
  title: { default: "LogicLab · 数字电子技术交互式实验室", template: "%s · LogicLab" },
  description: "每一个逻辑结论都能被验证，每一个状态变化都能被观察，每一个电路设计都能通过实验检验。",
};

export const viewport: Viewport = { themeColor: "#090d11" };

// 在首帧之前应用主题，避免深浅色闪烁
const themeScript = `try{var s=JSON.parse(localStorage.getItem('logiclab-v1')||'{}');var t=(s.state&&s.state.settings&&s.state.settings.theme)||'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning className={`${instrument.variable} ${plex.variable} ${jetbrains.variable} ${notoSerif.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TopBar />
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
        <Assistant />
      </body>
    </html>
  );
}
