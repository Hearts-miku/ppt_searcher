import React, { useState, useEffect } from "react";
import { Folder, FolderPlus, FolderMinus, FileText, ChevronRight, ChevronDown, RefreshCw, Layers } from "lucide-react";
import { FileNode, MonitoredFolder } from "../types";

interface FileTreeProps {
  monitoredFolders: MonitoredFolder[];
  indexingStatus: { [filePath: string]: string };
  onMonitoredFoldersChanged: () => void;
}

export default function FileTree({ monitoredFolders, indexingStatus, onMonitoredFoldersChanged }: FileTreeProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string>("");
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load processes list
  const loadPath = (pathLoad?: string) => {
    setLoading(true);
    setError(null);
    fetch("/api/fs/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathLoad })
    })
      .then(res => {
        if (!res.ok) throw new Error("无法读取该硬盘路径下的内容，权限被拒绝或路径不合法");
        return res.json();
      })
      .then(data => {
        setCurrentPath(data.currentPath);
        setParentPath(data.parentPath);
        setNodes(data.items || []);
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    // Initial fetch processcwd
    loadPath();
  }, [monitoredFolders]);

  const handleAddMonitor = async (pathToAdd: string) => {
    try {
      const res = await fetch("/api/fs/add-root", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathToAdd })
      });
      if (res.ok) {
        onMonitoredFoldersChanged();
      } else {
        const data = await res.json();
        alert(data.error || "添加监控失败");
      }
    } catch (err: any) {
      alert(`网络异常: ${err.message}`);
    }
  };

  const handleRemoveMonitor = async (pathToRemove: string) => {
    if (!confirm("确定要取消监控该文件夹，并从本地索引中剔除其所有文档吗？")) return;
    try {
      const res = await fetch("/api/fs/remove-root", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathToRemove })
      });
      if (res.ok) {
        onMonitoredFoldersChanged();
      } else {
        const data = await res.json();
        alert(data.error || "取消监控失败");
      }
    } catch (err: any) {
      alert(`网络异常: ${err.message}`);
    }
  };

  // Convert files currently parsing into progress lists
  const activeIndexingEntries = Object.entries(indexingStatus);

  return (
    <div className="flex h-full flex-col bg-slate-950 p-4 border-r border-white/5 text-slate-300">
      
      {/* 1. Header with metadata count */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 font-sans">
            <Layers className="h-4 w-4" />
            已授信工作航道
          </h2>
          <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400 font-mono">
            {monitoredFolders.length} 监控中
          </span>
        </div>

        {/* List monitored direct folders */}
        <div className="mt-2.5 space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
          {monitoredFolders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/5 bg-white/[0.02] p-2.5 text-center text-xs text-slate-500">
              暂未指定任何监控文档目录
            </div>
          ) : (
            monitoredFolders.map((mf, idx) => (
              <div
                key={idx}
                className="group flex flex-col rounded-lg border border-white/5 bg-slate-900/40 p-2 hover:bg-slate-900 transition"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-white font-mono" title={mf.path}>
                      {mf.path.split(/[\\/]/).pop() || mf.path}
                    </p>
                    <p className="truncate text-[10px] text-slate-500 font-mono" title={mf.path}>
                      {mf.path}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveMonitor(mf.path)}
                    className="rounded-md p-1 opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-400 transition flex-shrink-0"
                    title="取消同步路径监控"
                  >
                    <FolderMinus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="text-cyan-400 font-mono">● {mf.filesCount} 文档构建完毕</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Directory Traversal Browser */}
      <div className="flex flex-1 flex-col overflow-hidden border-t border-white/5 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">本地磁盘浏览器</span>
          <button
            onClick={() => loadPath(currentPath)}
            className="rounded-md p-1 hover:bg-white/5 text-slate-400 hover:text-white transition"
            title="刷新文件目录"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Current Path Navigation Banner */}
        <div className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-white/5 p-1.5 text-[11px] font-mono text-slate-400">
          <button
            disabled={!parentPath || parentPath === currentPath}
            onClick={() => loadPath(parentPath)}
            className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            上一级
          </button>
          <span className="truncate flex-1 font-mono text-left" title={currentPath}>
            {currentPath.split(/[\\/]/).pop() || currentPath || "磁盘根"}
          </span>
        </div>

        {error && (
          <div className="mb-2 rounded-lg bg-rose-500/10 p-2 text-[11px] text-rose-400 border border-rose-500/10">
            {error}
          </div>
        )}

        {/* Main List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
              文件内容加载中...
            </div>
          ) : nodes.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 font-mono">
              空文件夹
            </div>
          ) : (
            nodes.map((node, index) => {
              // Check if currently indexing this PPT
              const indexStatus = indexingStatus[node.absolutePath];

              return (
                <div
                  key={index}
                  className="group flex items-center justify-between rounded-md py-1.5 px-2 hover:bg-white/5 text-xs transition"
                >
                  <div
                    onClick={() => node.type === "directory" ? loadPath(node.absolutePath) : null}
                    className={`flex items-center gap-2 min-w-0 flex-1 truncate ${
                      node.type === "directory" ? "cursor-pointer text-white hover:text-cyan-400" : "text-slate-400 font-mono"
                    }`}
                  >
                    {node.type === "directory" ? (
                      <Folder className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-cyan-400 flex-shrink-5 flex-shrink-0" />
                    )}
                    <span className="truncate" title={node.name}>{node.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {/* Indexing state info */}
                    {indexStatus && (
                      <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" title={indexStatus} />
                    )}

                    {node.type === "directory" && (
                      <button
                        onClick={() => handleAddMonitor(node.absolutePath)}
                        className={`rounded-md p-1 border hover:bg-cyan-400/10 hover:text-cyan-400 transition ${
                          node.isMonitored 
                            ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
                            : "border-transparent text-slate-500 opacity-0 group-hover:opacity-100"
                        }`}
                        title={node.isMonitored ? "已被监控" : "添加至工作监控路径"}
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Real-time Indexing logs display */}
      {activeIndexingEntries.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5 animate-pulse mb-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            后台增量索引流水线
          </span>
          <div className="space-y-2 max-h-[140px] overflow-y-auto">
            {activeIndexingEntries.map(([filePath, step], idx) => (
              <div key={idx} className="rounded-lg bg-slate-900 border border-white/5 p-2 font-mono text-[10px]">
                <p className="truncate text-white font-mono font-semibold">
                  {filePath.split(/[\\/]/).pop()}
                </p>
                <p className="text-slate-400 font-mono truncate mt-0.5" title={step}>
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
