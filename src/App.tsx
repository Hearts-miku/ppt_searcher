import React, { useState, useEffect } from "react";
import { 
  Search, 
  Settings as SettingsIcon, 
  Sparkles, 
  Layers, 
  Compass, 
  RefreshCw,
  FolderLock,
  MessageSquare,
  Network
} from "lucide-react";
import FileTree from "./components/FileTree";
import SlideCard from "./components/SlideCard";
import Drawer from "./components/Drawer";
import SettingsModal from "./components/SettingsModal";
import { MonitoredFolder, SlideItem, SearchResult, Settings } from "./types";

export default function App() {
  const [monitoredFolders, setMonitoredFolders] = useState<MonitoredFolder[]>([]);
  const [indexingStatus, setIndexingStatus] = useState<{ [filePath: string]: string }>({});
  
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  
  const [selectedSlide, setSelectedSlide] = useState<SlideItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    provider: "gemini",
    apiKey: "",
    customEndpoint: "",
    modelName: "gemini-3.5-flash",
    embeddingMode: "offline"
  });

  const [pingOnline, setPingOnline] = useState(true);
  const [vectorWeight, setVectorWeight] = useState(0.5);
  const [fusionMethod, setFusionMethod] = useState<"linear" | "rrf">("linear");

  // Load monitored lists and settings status
  const loadMonitoredFolders = () => {
    fetch("/api/fs/monitored")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setMonitoredFolders(data);
      })
      .catch(err => console.error("Error loading monitored folders:", err));
  };

  const loadSettings = () => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data) {
          setSettings(data);
          // Standard latency ping online simulation flag
          setPingOnline(!!data.apiKey || data.embeddingMode === "offline");
        }
      })
      .catch(err => console.error("Error loading settings:", err));
  };

  // Poll active background vectorizer pipelines and monitored folders every 2.5 seconds
  useEffect(() => {
    loadMonitoredFolders();
    loadSettings();

    const interval = setInterval(() => {
      fetch("/api/indexing-status")
        .then(res => res.json())
        .then(data => {
          if (data) setIndexingStatus(data);
        })
        .catch(err => console.error("Error fetching indexing progress:", err));

      fetch("/api/fs/monitored")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setMonitoredFolders(data);
        })
        .catch(err => console.error("Error fetching monitored folders list:", err));
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const activeQuery = customQuery || query;
    if (!activeQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: activeQuery,
          vectorWeight,
          fusionMethod
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResult(data);
      } else {
        const errData = await res.json();
        alert(errData.error || "检索失败");
      }
    } catch {
      alert("检索计算失败，请检查后端状态。");
    } finally {
      setSearching(false);
    }
  };

  const handleSaveSettings = (newSettings: Settings) => {
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSettings(data.settings);
          setPingOnline(!!data.settings.apiKey || data.settings.embeddingMode === "offline");
          // Re-trigger monitoring load
          loadMonitoredFolders();
        }
      });
  };

  const selectQuickPrompt = (prompt: string) => {
    setQuery(prompt);
    handleSearch(undefined, prompt);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0D16] text-white font-sans">
      
      {/* Three-Column System Layout */}
      
      {/* Column 1: Left Pane - Directory Monitored Paths Manager & Nav tree */}
      <div className="w-[300px] flex-shrink-0 h-full">
        <FileTree 
          monitoredFolders={monitoredFolders} 
          indexingStatus={indexingStatus}
          onMonitoredFoldersChanged={loadMonitoredFolders}
        />
      </div>

      {/* Column 2: Middle Pane - Main Query Dashboard */}
      <div className="flex-1 flex flex-col h-full bg-[#0F1220] overflow-hidden">
        
        {/* Header Band */}
        <header className="flex h-14 items-center justify-between border-b border-white/5 bg-[#0C0F1A] px-6">
          <div className="flex items-center gap-2.5">
            <Layers className="h-5 w-5 text-cyan-400" />
            <h1 className="text-sm font-semibold tracking-wider uppercase font-sans text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-cyan-400">
              PPT 智能检索器 <span className="text-[10px] font-mono text-slate-500 lowercase px-1 rounded bg-white/5">v2.0</span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3 py-1 border border-white/5">
              <span className={`h-2 w-2 rounded-full ${pingOnline ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
              <span className="text-[10px] text-slate-400 font-mono">
                {pingOnline ? "引擎就绪 (Online/Msn)" : "局域离线模式"}
              </span>
            </div>

            {/* Gear Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="group rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition"
              title="大模型高级参数配置"
            >
              <SettingsIcon className="h-4 w-4 transition duration-500 group-hover:rotate-45" />
            </button>
          </div>
        </header>

        {/* Main query workspace scrolls here */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. Large Search aura input block */}
          <div className="mx-auto max-w-3xl">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center rounded-xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all duration-300 breathing-focus">
                <Search className="ml-4 h-5 w-5 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="自然语言智慧提问 / 关键词句检索幻灯片（支持多PPT合并排查）..."
                  className="flex-1 bg-transparent py-4 pl-3 pr-24 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="absolute right-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition disabled:opacity-50"
                >
                  {searching ? "检索中..." : "混合检索"}
                </button>
              </div>
            </form>

            {/* Hybrid Search parameters Config Panel */}
            <div className="mt-3 rounded-xl border border-white/5 bg-slate-900/60 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Fusion selector */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono">融合算子:</span>
                  <div className="flex rounded-lg bg-slate-950 p-0.5 border border-white/5">
                    <button
                      type="button"
                      onClick={() => setFusionMethod("linear")}
                      className={`px-3 py-1 text-[11px] rounded-md font-medium transition ${
                        fusionMethod === "linear"
                          ? "bg-cyan-500 text-slate-950 font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      加权线性融合 (Linear)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFusionMethod("rrf")}
                      className={`px-3 py-1 text-[11px] rounded-md font-medium transition ${
                        fusionMethod === "rrf"
                          ? "bg-cyan-500 text-slate-950 font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                      title="倒数排名融合：依据 dense/sparse 双路分词排序加权"
                    >
                      倒数排名融合 (RRF)
                    </button>
                  </div>
                </div>

                {/* Slider bar for Hybrid Balance */}
                <div className="flex-1 flex items-center justify-end gap-3.5">
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] text-slate-400 font-mono">
                      语义权重 (Vector): <span className="text-cyan-400 font-bold">{(vectorWeight * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={vectorWeight}
                    onChange={(e) => setVectorWeight(parseFloat(e.target.value))}
                    className="w-28 md:w-36 h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-white/5"
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] text-slate-400 font-mono">
                      文本权重 (BM25): <span className="text-amber-400 font-bold">{((1 - vectorWeight) * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Explaining caption */}
              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>{fusionMethod === "linear" ? "💡 混合线性评分：对多路相关度进行正态映射累加，兼顾模糊语义与精确汉字匹配。" : "💡 RRF 交叉：基于经典多路搜索排名融合，可直接在未在线预热的文档中过滤极佳的精确文摘。"}</span>
                <span className="text-slate-400">双轮混合检索引擎 (Dense+Sparse Search Engine)</span>
              </div>
            </div>
          </div>

          {/* 2. Starting dashboard or Search results layout */}
          <div className="mx-auto max-w-6xl">
            {!searchResult && !searching ? (
              /* Starting placeholder dashboard */
              <div className="space-y-6 pt-6">
                
                {/* Visual Banner */}
                <div className="rounded-xl border border-white/5 bg-[#121626]/40 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <h3 className="text-base font-semibold text-cyan-400 flex items-center justify-center md:justify-start gap-1.5">
                      <Compass className="h-5 w-5" />
                      欢迎使用企业级演示文稿智能检索器
                    </h3>
                    <p className="max-w-xl text-xs text-slate-400 leading-relaxed font-sans">
                      后台会自动对已监控的工作文件夹内所有 PPTX 幻灯片进行递归遍历、SHA指纹计算、正文与演讲词多重提取，并结合高维度向量匹配构建您的本地大脑。
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900/80 border border-white/5 p-4 text-xs font-mono max-w-sm w-full space-y-2">
                    <p className="text-white flex items-center gap-1.5">
                      <Network className="h-4 w-4 text-cyan-400" />
                      当前活跃语义底座：
                    </p>
                    <div className="pl-5 text-slate-400 space-y-1 text-[11px]">
                      <p>提供商：{settings.provider === "gemini" ? "Google Gemini AI" : settings.provider}</p>
                      <p>向量空间：{settings.embeddingMode === "offline" ? "本地100%离线算法" : "第三方在线向量"}</p>
                      <p>摘要模型：{settings.modelName}</p>
                    </div>
                  </div>
                </div>

                {/* Quick Prompts Segment */}
                <div className="space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">快速推荐提问 (测试预置样例)：</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      onClick={() => selectQuickPrompt("数字化转型的落地路径有哪几步？怎么监控数据？")}
                      className="rounded-xl border border-white/5 bg-slate-900/50 p-4 text-left hover:border-cyan-500/20 hover:bg-slate-900/90 transition duration-300"
                    >
                      <span className="mb-1.5 block text-xs font-semibold text-cyan-400 font-mono">案例 ① 转型路线
                      </span>
                      <span className="text-[11px] text-slate-400 leading-normal block">
                        “数字化转型的落地路径有哪几步？怎么监控数据？”
                      </span>
                    </button>

                    <button
                      onClick={() => selectQuickPrompt("企业如何适配多个不同公司的API，密钥安全怎么隔离保密？")}
                      className="rounded-xl border border-white/5 bg-slate-900/50 p-4 text-left hover:border-cyan-500/20 hover:bg-slate-900/90 transition duration-300"
                    >
                      <span className="mb-1.5 block text-xs font-semibold text-cyan-400 font-mono">案例 ② 部署与安全</span>
                      <span className="text-[11px] text-slate-400 leading-normal block">
                        “企业如何适配多个不同公司的API，密钥安全怎么隔离保密？”
                      </span>
                    </button>

                    <button
                      onClick={() => selectQuickPrompt("如何直接双击打开幻灯片的特定页码？这背后的脚本逻辑是什么？")}
                      className="rounded-xl border border-white/5 bg-slate-900/50 p-4 text-left hover:border-cyan-500/20 hover:bg-slate-900/90 transition duration-300"
                    >
                      <span className="mb-1.5 block text-xs font-semibold text-cyan-400 font-mono">案例 ③ 本地穿梭联动</span>
                      <span className="text-[11px] text-slate-400 leading-normal block">
                        “如何直接双击打开幻灯片的特定页码？这背后的脚本逻辑是什么？”
                      </span>
                    </button>
                  </div>
                </div>

              </div>
            ) : searching ? (
              /* Loading status dashboard */
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <RefreshCw className="h-10 w-10 text-cyan-400 animate-spin" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">企业语义大脑正在拼装提纲中...</p>
                  <p className="text-xs text-slate-500">正在获取在线/离线嵌入，过滤高得分余弦幻灯片</p>
                </div>
              </div>
            ) : (
              /* Results List */
              <div className="space-y-6">
                
                {/* 2.1 Elegant AI summarize block */}
                {searchResult.aiSummary && (
                  <div className="rounded-xl border border-cyan-500/15 bg-slate-900/60 p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-15 pointer-events-none">
                      <Sparkles className="h-16 w-16 text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2.5">
                      <Sparkles className="h-4 w-4 text-cyan-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                        AI 大模型整合阅读答复 (LLM Synthesized Reading)
                      </h3>
                    </div>
                    
                    <div className="text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed select-text">
                      {searchResult.aiSummary}
                    </div>
                  </div>
                )}

                {/* 2.2 Grid Slide Results */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      检索关联到的幻灯片卡片 (共 {searchResult.slides.length} 页)：
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      双击卡片或点击卡片浮层中“打开此页”可立刻唤醒本地演示文稿定位
                    </span>
                  </div>

                  {searchResult.slides.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/5 py-12 text-center text-xs text-slate-500 font-mono">
                      未在当前监控树中搜寻出语义强相关的幻灯片内容，建议更换提问大纲。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5" id="slide_grid">
                      {searchResult.slides.map((slide, i) => (
                        <SlideCard 
                          key={slide.id || i} 
                          slide={slide} 
                          onSelect={(s) => {
                            setSelectedSlide(s);
                            setIsDrawerOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

        </main>
      </div>

      {/* Column 3: Drawer Component for Detailed Notes View */}
      <Drawer
        isOpen={isDrawerOpen && !!selectedSlide}
        slide={selectedSlide}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedSlide(null);
        }}
        settings={settings}
      />

      {/* Modals */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        onSave={handleSaveSettings}
      />

    </div>
  );
}
