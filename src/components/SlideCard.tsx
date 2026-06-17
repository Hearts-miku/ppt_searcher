import React, { useState } from "react";
import { motion } from "motion/react";
import { SlideItem } from "../types";
import { Copy, Clipboard, Play, BookOpen, ExternalLink, Calendar, Check } from "lucide-react";
import { copyToClipboard } from "../utils";

export interface SlideTheme {
  id: string;
  name: string;
  bg: string;
  border: string;
  titleColor: string;
  textColor: string;
  accentBg: string;
  accentText: string;
  accentBar: string;
  decoration: string;
}

export const slideThemes: SlideTheme[] = [
  {
    id: "business",
    name: "卓越商务蓝 (Corporate Navy)",
    bg: "bg-gradient-to-br from-[#f8fafc] to-[#eff6ff]",
    border: "border-blue-200/60",
    titleColor: "text-blue-900 font-sans font-extrabold",
    textColor: "text-slate-600 font-medium",
    accentBg: "bg-blue-600",
    accentText: "text-blue-600",
    accentBar: "border-l-4 border-blue-600 bg-blue-50/70 p-1.5 pl-2.5 rounded-r",
    decoration: "absolute right-0 bottom-0 w-20 h-20 bg-blue-500/[0.04] rounded-tl-full pointer-events-none"
  },
  {
    id: "cyber",
    name: "数字科技玄 (Digital Tech)",
    bg: "bg-[#0b0f19]",
    border: "border-cyan-500/20",
    titleColor: "text-cyan-400 font-mono font-bold tracking-tight",
    textColor: "text-slate-300 font-mono",
    accentBg: "bg-cyan-500",
    accentText: "text-cyan-400",
    accentBar: "border-l-2 border-cyan-400 bg-cyan-950/40 p-1.5 pl-2 rounded",
    decoration: "absolute right-3 top-3 w-4 h-4 border border-cyan-400/10 rounded-full animate-pulse flex items-center justify-center pointer-events-none"
  },
  {
    id: "editorial",
    name: "文雅黑金 (Warm Editorial)",
    bg: "bg-[#fdfcf7]",
    border: "border-amber-200/50",
    titleColor: "text-stone-900 font-serif font-bold italic tracking-wide",
    textColor: "text-stone-700 font-serif",
    accentBg: "bg-amber-800",
    accentText: "text-amber-800",
    accentBar: "border-l-2 border-amber-600 bg-amber-500/[0.05] p-1.5 pl-2.5",
    decoration: "absolute left-0 top-0 w-1 h-full bg-amber-800/15 pointer-events-none"
  },
  {
    id: "emerald",
    name: "轻氧原木绿 (Emerald Sage)",
    bg: "bg-gradient-to-br from-[#f4fbf7] to-[#ecfdf5]",
    border: "border-emerald-200/40",
    titleColor: "text-emerald-950 font-sans font-bold",
    textColor: "text-emerald-900/70 font-sans",
    accentBg: "bg-emerald-600",
    accentText: "text-emerald-700",
    accentBar: "border-l-2 border-emerald-500 bg-emerald-100/40 p-1.5 pl-2.5 rounded",
    decoration: "absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-600/20 pointer-events-none"
  },
  {
    id: "luxury",
    name: "尊享皇家金 (Imperial Gold)",
    bg: "bg-zinc-950",
    border: "border-yellow-500/20",
    titleColor: "text-[#fbbf24] font-sans font-black uppercase tracking-wide",
    textColor: "text-zinc-300 font-sans",
    accentBg: "bg-[#fbbf24]",
    accentText: "text-yellow-400",
    accentBar: "border-r-2 border-yellow-500 bg-yellow-500/[0.04] p-1.5 pr-2.5 text-right",
    decoration: "absolute right-3 bottom-3 w-10 h-10 border border-yellow-500/10 rounded-tr-3xl pointer-events-none"
  },
  {
    id: "coral",
    name: "浪漫珊瑚橘 (Coral Bloom)",
    bg: "bg-gradient-to-tr from-[#fffafb] to-[#fff1f2]",
    border: "border-rose-200/40",
    titleColor: "text-rose-950 font-sans font-extrabold",
    textColor: "text-slate-600 font-sans",
    accentBg: "bg-rose-500",
    accentText: "text-rose-600",
    accentBar: "border-l-2 border-rose-500 bg-rose-50 pr-2 pl-2 rounded-r",
    decoration: "absolute top-0 right-0 w-12 h-12 bg-rose-200/[0.08] rounded-bl-full pointer-events-none"
  }
];

export function getDeterministicTheme(slideId: string, customThemeId?: string): SlideTheme {
  if (customThemeId && customThemeId !== "random") {
    const matched = slideThemes.find(t => t.id === customThemeId);
    if (matched) return matched;
  }
  
  const hash = Array.from(slideId || "").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const themeIndex = Math.abs(hash) % slideThemes.length;
  return slideThemes[themeIndex];
}

interface SlideCardProps {
  key?: any;
  slide: SlideItem;
  onSelect: (slide: SlideItem) => void;
  customThemeId?: string;
  searchQuery?: string;
}

export default function SlideCard({ slide, onSelect, customThemeId, searchQuery }: SlideCardProps) {
  const [copied, setCopied] = useState(false);
  const [runningScript, setRunningScript] = useState<string | null>(null);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const clipText = `【${slide.documentName} - 第 ${slide.slideIndex} 页】\n标题: ${slide.title}\n正文内容:\n${slide.text}\n备注注释:\n${slide.note}`;
    await copyToClipboard(clipText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLocal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setRunningScript("自动化唤端中...");
      const res = await fetch("/api/local/open-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: slide.filePath,
          slideIndex: slide.slideIndex
        })
      });
      const data = await res.json();
      if (data.success) {
        setRunningScript(`精准飞梭页码成功！`);
      } else {
        setRunningScript("唤端失败");
        alert(`【本地唤端失败】\n\n${data.message}`);
      }
      setTimeout(() => setRunningScript(null), 3500);
    } catch (err: any) {
      setRunningScript("唤端失败");
      alert(`【唤端出错】无法连接到本地服务，请检查本地服务器是否处于启动状态：${err.message}`);
      setTimeout(() => setRunningScript(null), 3000);
    }
  };

  const handleRevealFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/local/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: slide.filePath })
      });
      const data = await res.json();
      if (data.success) {
        // success feedback
      } else {
        alert(`【定位失败】\n\n${data.message}`);
      }
    } catch (err: any) {
      alert(`【定位出错】无法连接到本地服务：${err.message}`);
    }
  };

  const theme = getDeterministicTheme(slide.id, customThemeId);

  // Highlighting of search terms inside slide mockup
  const renderHighlightedText = (text: string, highlight?: string) => {
    if (!highlight || !text) return text;
    const parts = text.split(new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, "gi"));
    return (
      <>
        {parts.map((p, idx) => 
          p.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={idx} className="bg-yellow-400/45 text-rose-950 font-extrabold px-0.5 rounded shadow-sm">
              {p}
            </mark>
          ) : (
            p
          )
        )}
      </>
    );
  };

  return (
    <motion.div
      layout
      whileHover={{ y: -4, scale: 1.015 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-xl transition-all duration-300 hover:border-cyan-500/40 hover:shadow-cyan-500/5 cursor-pointer"
      onClick={() => onSelect(slide)}
    >
      {/* 1. Miniature 16:9 Presentation Canvas Visual (Slide Multi-Theme Thumbnail) */}
      <div className={`relative aspect-[16/9] w-full overflow-hidden p-4 select-none flex flex-col justify-between transition-colors duration-500 ${theme.bg} border-b ${theme.border}`}>
        
        {/* Subtle grid mesh decoration */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808005_1px,transparent_1px),linear-gradient(to_bottom,#80808005_1px,transparent_1px)] bg-[size:10px_10px] pointer-events-none" />
        
        {/* Theme abstract cosmetic decoration element */}
        <div className={theme.decoration} />

        {/* Presentation Header (Tag + Slide Index) */}
        <div className="relative z-10 flex items-center justify-between pointer-events-none">
          <span className="truncate rounded-md bg-slate-800/90 px-2 py-0.5 font-mono text-[8.5px] font-bold tracking-wider text-cyan-400 uppercase border border-white/5 shadow-sm">
            Slide {slide.slideIndex}
          </span>
          <div className="flex gap-1 items-center">
            <span className="rounded bg-slate-900/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 font-mono">
              模版: {theme.name.split(" ")[0]}
            </span>
          </div>
        </div>

        {/* Presentation Slide Title inside themed container */}
        <div className="relative z-10 my-1 pointer-events-none">
          <h4 className={`text-xs md:text-[13px] font-bold tracking-tight leading-snug line-clamp-1 ${theme.titleColor}`}>
            {renderHighlightedText(slide.title, searchQuery)}
          </h4>
          <span className="block w-6 h-0.5 bg-current opacity-20 mt-0.5" />
        </div>

        {/* Presentation Slide Main Paragraph with elegant left border and highlighted text */}
        <div className="relative z-10 flex-1 my-1.5 pointer-events-none flex flex-col justify-center">
          <div className={`${theme.accentBar}`}>
            <p className={`text-[10px] leading-relaxed line-clamp-3 font-sans ${theme.textColor}`}>
              {renderHighlightedText(slide.text || "（此幻灯片内容主要由备注提供详细背景）", searchQuery)}
            </p>
          </div>
        </div>

        {/* Slide Footer Decoration & Micro Page Indicator */}
        <div className="relative z-10 border-t border-slate-300/30 pt-1 text-[8.5px] text-slate-400 font-mono flex items-center justify-between pointer-events-none">
          <span className="truncate font-sans max-w-[140px] text-slate-500 font-medium">📂 {slide.documentName}</span>
          <span className="font-mono text-slate-500 font-bold tracking-wide">P. {slide.slideIndex}</span>
        </div>

        {/* 2. Hover Parallax Frosted Acrylic Overlay Controls */}
        <div className="absolute inset-0 z-20 flex flex-col justify-end bg-slate-950/80 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm">
          <div className="mb-2 text-center">
            <p className="text-[11px] font-semibold text-cyan-400 font-mono">
              {slide.documentName}
            </p>
            <p className="text-[9px] text-slate-400 font-mono truncate">
              {slide.filePath}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-white/5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(slide);
              }}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-white hover:bg-white/10 hover:text-cyan-400 transition"
              title="查看大纲与详细备注"
            >
              <BookOpen className="h-4 w-4" />
              <span className="text-[9px] font-medium font-mono">查看详情</span>
            </button>

            <button
              disabled={!!runningScript}
              onClick={handleOpenLocal}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 py-2 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 transition disabled:opacity-50"
              title="自动拉起本机 PPT 并精确定位至本页"
            >
              <Play className="h-4 w-4 fill-current" />
              <span className="text-[9px] font-medium font-mono">打开此页</span>
            </button>

            <button
              onClick={handleCopy}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-white hover:bg-white/10 hover:text-cyan-400 transition"
              title="复制全部幻灯片文本文字"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400 animate-pulse" /> : <Clipboard className="h-4 w-4" />}
              <span className="text-[9px] font-medium font-mono">{copied ? "已复制" : "提取文本"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. External details, score, and match highlighting snippets */}
      <div className="flex flex-1 flex-col justify-between p-3.5 bg-slate-900 border-t border-white/5 text-xs text-slate-400 font-sans">
        <div className="mb-2 flex flex-col gap-1.5 border-b border-white/5 pb-2">
          <div className="flex items-center justify-between">
            <span className="truncate max-w-[150px] rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {slide.documentName}
            </span>
            {slide.score !== undefined && (
              <span className="rounded bg-cyan-400/20 px-2 py-0.5 font-mono text-[10px] font-extrabold text-cyan-300 border border-cyan-400/30">
                混合得分: {slide.score}
              </span>
            )}
          </div>

          {/* Show hybrid metrics details */}
          {slide.score !== undefined && (slide.vectorSimilarity !== undefined || slide.textRelevanceBM25 !== undefined) && (
            <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono">
              {slide.vectorSimilarity !== undefined && (
                <span className="flex items-center gap-0.5" title="Dense Cosine Similarity">
                  📡 Vector: <span className="text-cyan-400/90">{slide.vectorSimilarity}%</span>
                </span>
              )}
              {slide.vectorSimilarity !== undefined && slide.textRelevanceBM25 !== undefined && (
                <span className="text-white/10">|</span>
              )}
              {slide.textRelevanceBM25 !== undefined && (
                <span className="flex items-center gap-0.5" title="Sparse Okapi BM25 Score">
                  🔍 BM25: <span className="text-amber-400/90">{slide.textRelevanceBM25}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Highlights */}
        {slide.highlights && slide.highlights.length > 0 ? (
          <div className="space-y-1 my-1">
            {slide.highlights.map((ref, i) => (
              <p key={i} className="rounded bg-slate-950/50 p-1.5 font-mono text-[10px] text-slate-300 border-l border-cyan-400">
                ...{ref}...
              </p>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
            {slide.text.slice(0, 100) || "（展示文稿无正文部分，建议直接查看详情备注）"}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500 border-t border-white/5 pt-2">
          <span 
            onClick={handleRevealFolder} 
            className="hover:underline flex items-center gap-0.5 cursor-pointer text-slate-400 hover:text-cyan-400"
          >
            <ExternalLink className="h-3 w-3" />
            在文件夹中显示
          </span>
          {runningScript && (
            <span className="text-[10px] text-cyan-400 font-mono animate-pulse">{runningScript}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
