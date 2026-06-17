import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Settings } from "../types";
import { Settings as SettingsIcon, X, Eye, EyeOff, Check, AlertTriangle, Cpu, Globe } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}

export default function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>({
    provider: "gemini",
    apiKey: "",
    customEndpoint: "",
    modelName: "gemini-3.5-flash",
    embeddingMode: "offline",
    embeddingModelName: "gemini-embedding-2-preview"
  });

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load settings
      fetch("/api/settings")
        .then(res => res.json())
        .then(data => {
          if (data) setSettings(data);
        })
        .catch(err => console.error("Error loading settings:", err));
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(settings);
    onClose();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setTestResult({
        success: res.ok ? data.success : false,
        message: data.message || "测试未知错误"
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `网络错误: ${err.message}`
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Glass background overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md"
            id="settings_modal"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5 text-cyan-400 animate-[spin_8s_linear_infinite]" />
                <h3 className="text-lg font-semibold text-white">模型服务高级设置</h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Embedding Mode selector */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  词向量 (Embedding) 运行策略
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, embeddingMode: "offline" }))}
                    className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 px-4 text-sm font-medium transition ${
                      settings.embeddingMode === "offline"
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                        : "border-white/5 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <Cpu className="h-4 w-4" />
                    本地离线 (Wasm + 余弦)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, embeddingMode: "online" }))}
                    className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 px-4 text-sm font-medium transition ${
                      settings.embeddingMode === "online"
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                        : "border-white/5 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    第三方云端推理
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {settings.embeddingMode === "offline"
                    ? "🎉 推荐首选！使用本地中文多阶分词与动态余弦哈希，100% 局域电磁离线隔绝，保障核心涉密资产 0 泄露。"
                    : "☁️ 云端接口，需要外网连通性，智能词语义分布更具上下文广度。"}
                </p>
              </div>

              {/* Provider selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  AI 供应商与大模型提供商
                </label>
                <select
                  value={settings.provider}
                  onChange={e => {
                    const prov = e.target.value as any;
                    let mName = "gemini-3.5-flash";
                    let embName = "gemini-embedding-2-preview";
                    if (prov === "openai") {
                      mName = "gpt-4o-mini";
                      embName = "text-embedding-3-small";
                    } else if (prov === "deepseek") {
                      mName = "deepseek-chat";
                      embName = "text-embedding-3-small";
                    } else if (prov === "ollama") {
                      mName = "llama3";
                      embName = "nomic-embed-text";
                    }
                    setSettings(s => ({ 
                      ...s, 
                      provider: prov, 
                      modelName: mName,
                      embeddingModelName: embName
                    }));
                  }}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 p-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="gemini">Google Gemini AI</option>
                  <option value="deepseek">DeepSeek (高性能国产大模)</option>
                  <option value="openai">OpenAI (模型接口适配)</option>
                  <option value="ollama">Local Llama/Ollama (自建端点)</option>
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  API Key 鉴权密钥 (保密本地存储)
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.apiKey}
                    onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
                    placeholder={settings.embeddingMode === "offline" ? "本地离线模式无需秘钥" : "输入鉴权密钥，例如: AIzaSy..."}
                    className="w-full rounded-lg border border-white/10 bg-slate-950 py-2.5 pl-3 pr-10 text-sm font-mono text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Custom Endpoint and Model Name (Animated appearance) */}
              <AnimatePresence>
                {(settings.provider !== "gemini" || settings.embeddingMode === "online") && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    {settings.provider !== "gemini" && (
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          自定义 API 代理服务器基地址 (Endpoint)
                        </label>
                        <input
                          type="text"
                          value={settings.customEndpoint}
                          onChange={e => setSettings(s => ({ ...s, customEndpoint: e.target.value }))}
                          placeholder={
                            settings.provider === "deepseek"
                              ? "https://api.deepseek.com/v1"
                              : settings.provider === "ollama"
                              ? "http://localhost:11434/v1"
                              : "https://api.openai.com/v1"
                          }
                          className="w-full rounded-lg border border-white/10 bg-slate-950 p-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        推理大语言模型名称 (Model Identifier)
                      </label>
                      <input
                        type="text"
                        value={settings.modelName}
                        onChange={e => setSettings(s => ({ ...s, modelName: e.target.value }))}
                        className="w-full rounded-lg border border-white/10 bg-slate-950 p-2.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    {settings.embeddingMode === "online" && (
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          词向量大模型名称 (Embedding Model Identifier)
                        </label>
                        <input
                          type="text"
                          value={settings.embeddingModelName || ""}
                          onChange={e => setSettings(s => ({ ...s, embeddingModelName: e.target.value }))}
                          placeholder={
                            settings.provider === "gemini"
                              ? "gemini-embedding-2-preview"
                              : settings.provider === "deepseek"
                              ? "text-embedding-3-small"
                              : "text-embedding-3-small"
                          }
                          className="w-full rounded-lg border border-white/10 bg-slate-950 p-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status indicator and Test utilities */}
              <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">连通状态监测：</span>
                  <button
                    type="button"
                    disabled={testing}
                    onClick={handleTestConnection}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 transition disabled:opacity-50"
                  >
                    {testing ? "测试中..." : "测试连接连通性"}
                  </button>
                </div>

                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                      testResult.success
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                    }`}
                  >
                    {testResult.success ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    )}
                    <span className="whitespace-pre-wrap leading-relaxed text-left flex-1">{testResult.message}</span>
                  </motion.div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-white/10 bg-transparent py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-cyan-500 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 transition"
                >
                  保存并注入环境变量
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
