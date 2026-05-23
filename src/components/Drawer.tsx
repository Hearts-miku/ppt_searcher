import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SlideItem } from "../types";
import { X, Clipboard, Play, ExternalLink, Cpu, Sparkles, Check, RefreshCw } from "lucide-react";

interface DrawerProps {
  isOpen: boolean;
  slide: SlideItem | null;
  onClose: () => void;
  settings: any;
}

export default function Drawer({ isOpen, slide, onClose, settings }: DrawerProps) {
  const [copiedNote, setCopiedNote] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [aiRefining, setAiRefining] = useState(false);
  const [aiPoints, setAiPoints] = useState<string | null>(null);

  if (!slide) return null;

  const handleCopyNote = () => {
    navigator.clipboard.writeText(slide.note || "（此幻灯片暂无备注）");
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(slide.text || "（此幻灯片暂无文字）");
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleRefineWithAI = async () => {
    setAiRefining(true);
    setAiPoints(null);
    try {
      // Direct POST to vector search, but instead ask AI to refine this single slide context
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `请用精炼的3个要点归纳总结幻灯片：[${slide.title}]`
        })
      });
      const data = await response.json();
      setAiPoints(data.aiSummary || "精炼完毕。");
    } catch {
      setAiPoints("大模型精炼过程遭遇错误，请检查网络或配置 API Key。");
    } finally {
      setAiRefining(false);
    }
  };

  const handleLaunchLocal = async () => {
    try {
      await fetch("/api/local/open-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: slide.filePath,
          slideIndex: slide.slideIndex
        })
      });
    } catch {}
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="relative h-full flex flex-col bg-slate-950 p-4 border-l border-white/5 text-slate-300 w-full md:w-[350px] lg:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div>
              <h3 className="text-sm font-semibold text-white truncate max-w-[200px]">
                {slide.documentName}
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">
                第 {slide.slideIndex} 页幻灯片
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-5">
            
            {/* 1. Miniature Slide Display in Drawer */}
            <div className="rounded-xl border border-white/10 bg-slate-900 overflow-hidden shadow-md">
              <div className="aspect-[16/9] w-full bg-slate-100 p-4 relative flex flex-col justify-between select-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_14px] pointer-events-none" />
                <span className="self-end rounded bg-slate-800/80 px-1 font-mono text-[9px] text-white">
                  {slide.slideIndex} P
                </span>
                <h4 className="text-xs font-semibold text-slate-950 truncate">{slide.title}</h4>
                <p className="text-[9px] text-slate-500 font-mono line-clamp-3 leading-snug">{slide.text}</p>
                <div className="w-full h-1 bg-cyan-400 rounded-full" />
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="flex gap-2">
              <button
                onClick={handleLaunchLocal}
                className="flex-1 rounded-lg bg-cyan-500 py-1.5 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition flex items-center justify-center gap-1.5"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                本地拉起定位
              </button>
            </div>

            {/* 2. Extracted text segment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">幻灯片正文</span>
                <button
                  onClick={handleCopyText}
                  className="text-cyan-400 hover:text-cyan-300 text-[10px] flex items-center gap-1.5 transition"
                >
                  {copiedText ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                  {copiedText ? "已复制" : "完整复制"}
                </button>
              </div>
              <div className="rounded-xl bg-slate-900 border border-white/5 p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-mono select-text max-h-[120px] overflow-y-auto">
                {slide.text || "（此幻灯片不含文字正文，建议直接查看下方的备注演讲词）"}
              </div>
            </div>

            {/* 3. Speaker notes segment */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">演讲演讲者备注 (Notes)</span>
                <button
                  onClick={handleCopyNote}
                  className="text-cyan-400 hover:text-cyan-300 text-[10px] flex items-center gap-1.5 transition"
                >
                  {copiedNote ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                  {copiedNote ? "已复制" : "完整复制"}
                </button>
              </div>
              <div className="rounded-xl bg-slate-900 border border-white/5 p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-mono select-text max-h-[150px] overflow-y-auto">
                {slide.note || "（此页幻灯片不含任何备注，建议您直接查阅上方演示文稿正文）"}
              </div>
            </div>

            {/* 4. AI refining/summarizing tool directly to card */}
            <div className="border-t border-white/5 pt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">AI 深度点拨 & 要点精炼</span>
                <button
                  disabled={aiRefining}
                  onClick={handleRefineWithAI}
                  className="rounded bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-slate-950 transition flex items-center gap-1 disabled:opacity-50"
                >
                  {aiRefining ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI 一键提炼
                </button>
              </div>

              {aiRefining && (
                <div className="rounded-xl bg-slate-900/50 border border-cyan-500/10 p-3 text-xs text-slate-400 flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  <span>正在重整知识智脑，智能分析幻灯片架构...</span>
                </div>
              )}

              {aiPoints && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-slate-900 border border-cyan-500/10 p-3.5 text-xs leading-relaxed text-slate-200 border-l-4 border-l-cyan-400"
                >
                  <p className="font-semibold text-cyan-400 mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    幻灯片智简精归：
                  </p>
                  <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{aiPoints}</p>
                </motion.div>
              )}
            </div>

          </div>

          {/* Physical path in OS */}
          <div className="border-t border-white/5 pt-4 text-[10px] text-slate-500 font-mono">
            <span className="font-mono block">磁盘完整路径：</span>
            <span className="font-mono block select-all break-all leading-normal">{slide.filePath}</span>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
