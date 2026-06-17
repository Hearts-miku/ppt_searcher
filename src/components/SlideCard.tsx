import React, { useState } from "react";
import { motion } from "motion/react";
import { SlideItem } from "../types";
import { Copy, Clipboard, Play, BookOpen, ExternalLink, Calendar, Check } from "lucide-react";
import { copyToClipboard } from "../utils";

interface SlideCardProps {
  key?: any;
  slide: SlideItem;
  onSelect: (slide: SlideItem) => void;
}

export default function SlideCard({ slide, onSelect }: SlideCardProps) {
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

  return (
    <motion.div
      layout
      whileHover={{ y: -4, scale: 1.015 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-xl transition-all duration-300 hover:border-cyan-500/40 hover:shadow-cyan-500/5 cursor-pointer"
      onClick={() => onSelect(slide)}
    >
      {/* 1. Miniature 16:9 Presentation Canvas Visual */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100 p-4 select-none flex flex-col justify-between">
        
        {/* Subtle grid mesh decoration */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_14px] pointer-events-none" />

        {/* Presentation Header (Tag + Slide Index) */}
        <div className="relative z-10 flex items-center justify-between pointer-events-none">
          <span className="truncate rounded bg-slate-800/80 px-2 py-0.5 text-[9px] font-bold tracking-wider text-cyan-400 font-mono uppercase">
            {slide.documentName.split(".").pop()} Vecto-Card
          </span>
          <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-bold text-white font-mono">
            {slide.slideIndex} P
          </span>
        </div>

        {/* Presentation Slide Title */}
        <div className="relative z-10 my-1 pointer-events-none">
          <h4 className="text-sm font-semibold text-slate-900 tracking-tight leading-snug line-clamp-1 font-sans">
            {slide.title}
          </h4>
        </div>

        {/* Presentation Slide Main Paragraph / Content snippet */}
        <div className="relative z-10 flex-1 pointer-events-none">
          <p className="text-[10px] leading-relaxed text-slate-500 font-mono line-clamp-3">
            {slide.text || "（此幻灯片正文不含文字，仅备注有内容）"}
          </p>
        </div>

        {/* Slide Footer Decoration */}
        <div className="relative z-10 border-t border-slate-200/50 pt-1 text-[8px] text-slate-400 font-mono flex items-center justify-between pointer-events-none">
          <span className="truncate font-mono max-w-[160px]">{slide.documentName}</span>
          <span className="font-mono">Slide Engine v2026</span>
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
