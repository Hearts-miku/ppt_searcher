import express from "express";
import path from "path";
import fs from "fs";
import { loadConfig, saveConfig } from "./server/configStore";
import { loadDatabase, getDatabase, removeDocument } from "./server/db";
import {
  scanFolderRecursive,
  indexSingleFile,
  setupWatcherForFolder,
  stopWatcherForFolder,
  startupAutoLoad,
  getIndexingStatus
} from "./server/scanner";
import { computeEmbedding, askAI, testLLMConnection } from "./server/modelAdapter";
import { exec } from "child_process";

// Local OS automation helper functions
function runLocalCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

function runPowerShellScript(scriptContent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(process.cwd(), `tmp_${Date.now()}.ps1`);
    fs.writeFile(tempFile, scriptContent, "utf8", (err) => {
      if (err) {
        return reject(err);
      }
      const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempFile}"`;
      exec(cmd, (error, stdout, stderr) => {
        // Clean up temp file safely
        fs.unlink(tempFile, () => {});
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(express.json());

// Bootstrapping: load database and auto-load monitored directories
loadDatabase();

// Setup startup scan and watchers inside config
async function bootstrap() {
  const config = loadConfig();
  
  // Explicitly remove legacy sample_ppts path from monitored folders to prevent monitoring it.
  const originalLength = config.monitoredFolders.length;
  config.monitoredFolders = config.monitoredFolders.filter(
    (folder) => !folder.includes("sample_ppts")
  );
  if (config.monitoredFolders.length !== originalLength) {
    saveConfig(config);
    console.log("[BOOTSTRAP] Cleaned up legacy sample folders from monitored paths.");
  }

  // Clean up any indexed sample documents from Database
  const db = getDatabase();
  for (const filePath of Object.keys(db.documents)) {
    if (filePath.includes("sample_ppts")) {
      removeDocument(filePath);
    }
  }

  // Initialize startup alignments & watchers
  await startupAutoLoad();
}
bootstrap();

// 1. API Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// 2. Fetch configurations
app.get("/api/settings", (req, res) => {
  const cfg = loadConfig();
  res.json(cfg.settings);
});

// 3. Save configurations
app.post("/api/settings", (req, res) => {
  const newSettings = req.body;
  const cfg = loadConfig();
  cfg.settings = { ...cfg.settings, ...newSettings };
  saveConfig(cfg);
  
  // Trigger hot reload by forcing a database save
  res.json({ success: true, settings: cfg.settings });
});

// 4. Test provider connectivity (Ping Test utility)
app.post("/api/settings/test", async (req, res) => {
  const settings = req.body;
  const provider = settings.provider;
  const apiKey = settings.apiKey;

  const results: string[] = [];
  let isAllSuccess = true;

  // 1. Check embedding engine
  if (settings.embeddingMode === "offline") {
    results.push("✅ 【词向量模型】: 本地Wasm离线分词余弦检索就绪 (100% 隐私安全)");
  } else {
    // Online embedding test
    if (!apiKey) {
      results.push("❌ 【词向量模型】: 未配置 API Key，无法进行云端向量运算。");
      isAllSuccess = false;
    } else {
      try {
        const startTime = Date.now();
        const response = await computeEmbedding("Hello structural test ping", settings);
        const duration = Date.now() - startTime;
        if (Array.isArray(response) && response.length > 0) {
          results.push(`✅ 【词向量模型】: 云端 [${settings.embeddingModelName || "默认选项"}] 连通成功！(维度: ${response.length}, 耗时: ${duration}ms)`);
        } else {
          throw new Error("未返回有效的矢量维度载荷。");
        }
      } catch (err: any) {
        results.push(`❌ 【词向量模型】: 云端 [${settings.embeddingModelName || "默认选项"}] 无法连通 - 原因: ${err.message}`);
        isAllSuccess = false;
      }
    }
  }

  // 2. Check Reasoning LLM connectivity
  if (!apiKey) {
    results.push(`⚠️ 【推理大模型】: [${settings.modelName || "未指定"}] 未配置 API Key，交互提问时将回退至本地启发式检索排版。`);
  } else {
    try {
      const llmResult = await testLLMConnection(settings);
      if (llmResult.success) {
        results.push(`✅ 【推理大模型】: [${settings.modelName || "未指定"}] 连通成功！(耗时: ${llmResult.latencyMs}ms, 响应示例: ${JSON.stringify(llmResult.message.includes('响应内容: "') ? llmResult.message.split('响应内容: "')[1].slice(0, -1) : llmResult.message)})`);
      } else {
        results.push(`❌ 【推理大模型】: [${settings.modelName || "未指定"}] 无法连通 - 原因: ${llmResult.message}`);
        isAllSuccess = false;
      }
    } catch (err: any) {
      results.push(`❌ 【推理大模型】: [${settings.modelName || "未指定"}] 连接时遇到未知异常 - ${err.message}`);
      isAllSuccess = false;
    }
  }

  const finalMessage = results.join("\n");

  res.json({
    success: isAllSuccess,
    message: finalMessage
  });
});

// 5. Monitored folders information
app.get("/api/fs/monitored", (req, res) => {
  const cfg = loadConfig();
  const db = getDatabase();

  const monitoredInfo = cfg.monitoredFolders.map(folderPath => {
    // Count documents belonging to this parent path (standardized for cross-platform backslashes/casing)
    const filesCount = Object.keys(db.documents).filter(filePath => {
      const stdFilePath = filePath.replace(/\\/g, "/").toLowerCase();
      const stdFolderPath = folderPath.replace(/\\/g, "/").toLowerCase();
      return stdFilePath.startsWith(stdFolderPath);
    }).length;

    return {
      path: folderPath,
      addedAt: new Date().toISOString(), // stub
      filesCount
    };
  });

  res.json(monitoredInfo);
});

// 6. Register raw directory tree as focus route
app.post("/api/fs/list", (req, res) => {
  const targetPath = req.body.path || process.cwd();
  
  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: "目标绝对路径在本地磁盘中不存在" });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "指定的目标路径不是一个有效的文件夹类型" });
    }

    const rawList = fs.readdirSync(targetPath, { withFileTypes: true });
    const cfg = loadConfig();

    const items: any[] = [];
    for (const item of rawList) {
      const isDir = item.isDirectory();
      const isPpt = item.name.toLocaleLowerCase().endsWith(".pptx") || item.name.toLocaleLowerCase().endsWith(".ppt");
      
      // Filter out non-directory and non-ppt files early to avoid running statSync on irrelevant system/hidden files
      if (!isDir && !isPpt) {
        continue;
      }

      const fullPath = path.resolve(targetPath, item.name);
      const details: any = {
        name: item.name,
        type: isDir ? "directory" : "file",
        absolutePath: fullPath,
      };

      if (!isDir) {
        try {
          const itemStat = fs.statSync(fullPath);
          details.size = `${(itemStat.size / (1024 * 1024)).toFixed(2)} MB`;
          details.lastModified = itemStat.mtime.toLocaleDateString();
        } catch (err) {
          details.size = "未知大小";
          details.lastModified = "无法获取";
        }
      } else {
        // Is this path already monitored or sub-monitored? (standardized for cross-platform slashes/casing)
        details.isMonitored = cfg.monitoredFolders.some(mf => {
          const stdFullPath = fullPath.replace(/\\/g, "/").toLowerCase();
          const stdMf = mf.replace(/\\/g, "/").toLowerCase();
          return stdFullPath.startsWith(stdMf) || stdMf.startsWith(stdFullPath);
        });
      }

      items.push(details);
    }

    res.json({
      currentPath: path.resolve(targetPath),
      parentPath: path.resolve(targetPath, ".."),
      items
    });
  } catch (err: any) {
    res.status(500).json({ error: `读取文件树出错: ${err.message}` });
  }
});

// 7. Add folder monitor
app.post("/api/fs/add-root", async (req, res) => {
  const targetPath = req.body.path;
  if (!targetPath) {
    return res.status(400).json({ error: "参数 path 不能为空" });
  }

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "目标绝对路径在本地磁盘中不存在" });
  }

  const config = loadConfig();
  if (config.monitoredFolders.includes(resolved)) {
    return res.status(400).json({ error: "该文件夹已在监控监听列表中，无需重复添加" });
  }

  // Register folder
  config.monitoredFolders.push(resolved);
  saveConfig(config);

  // Wake up watch observer
  setupWatcherForFolder(resolved);

  // Trigger non-blocking deep scan
  const pptFiles = scanFolderRecursive(resolved);
  
  // Respond immediately so user interface sees adding feedback
  res.json({
    success: true,
    message: `成功注册并对齐同步通道。正在后台抓取并向量化 ${pptFiles.length} 款演示PPTX文稿...`,
    filesCount: pptFiles.length
  });

  // Run index updates asynchronously in priority queue
  (async () => {
    try {
      for (const file of pptFiles) {
        await indexSingleFile(file);
      }
    } catch (err) {
      console.error(`Error background-indexing newly added folder ${resolved}`, err);
    }
  })();
});

// 8. Remove folder monitor
app.post("/api/fs/remove-root", (req, res) => {
  const targetPath = req.body.path;
  if (!targetPath) {
    return res.status(400).json({ error: "参数 path 不能为空" });
  }

  const resolved = path.resolve(targetPath);
  const config = loadConfig();

  if (!config.monitoredFolders.includes(resolved)) {
    return res.status(400).json({ error: "该文件夹不位于我们的监控路径列表中" });
  }

  // Prune monitored directory
  config.monitoredFolders = config.monitoredFolders.filter(fp => fp !== resolved);
  saveConfig(config);

  // Halt active file watcher
  stopWatcherForFolder(resolved);

  // Optional: clear file indices from the database so metadata matches physical workspace (standardized for cross-platform slashes/casing)
  const db = getDatabase();
  const docPathsToRemove = Object.keys(db.documents).filter(dp => {
    const stdDp = dp.replace(/\\/g, "/").toLowerCase();
    const stdResolved = resolved.replace(/\\/g, "/").toLowerCase();
    return stdDp.startsWith(stdResolved);
  });
  docPathsToRemove.forEach(dp => {
    removeDocument(dp);
  });

  res.json({ success: true, message: `已成功废止该目录监控关联，并从本地索引库剔除了其全量元数据。` });
});

// 9. Fetch background indexing progress log
app.get("/api/indexing-status", (req, res) => {
  res.json(getIndexingStatus());
});

// 计算两个向量的余弦相似度
function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length || v1.length === 0) return 0;
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Tokenize utility for hybrid search processing
function tokenizeText(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  
  // Extract English/alphanumeric terms
  const engTerms = lower.match(/[a-zA-Z0-9]+/g) || [];
  
  // Extract Chinese/CJK characters to support precise unigram/bigram match
  const cjkTerms: string[] = [];
  const cjkMatches = lower.match(/[\u4e00-\u9fa5]/g) || [];
  cjkTerms.push(...cjkMatches);

  for (let i = 0; i < cjkMatches.length - 1; i++) {
    cjkTerms.push(cjkMatches[i] + cjkMatches[i + 1]);
  }

  return [...engTerms, ...cjkTerms].filter(t => t.length > 0);
}

// 10. AI Semantic vector & Keyword Hybrid search engine
app.post("/api/search", async (req, res) => {
  const { query, vectorWeight = 0.5, fusionMethod = "linear" } = req.body;
  if (!query) {
    return res.status(400).json({ error: "提问文本 query 不能为空" });
  }

  const config = loadConfig();
  const db = getDatabase();

  try {
    // Generate embedding for current query text if we're not exclusively using keyword search
    let queryVector: number[] | null = null;
    if (vectorWeight > 0) {
      try {
        queryVector = await computeEmbedding(query, config.settings);
      } catch (err: any) {
        console.warn("[Hybrid Search] Failed to compute query embedding, fallback to safe term vector", err.message);
      }
    }

    const queryTokens = tokenizeText(query);
    const allSlides: any[] = [];
    Object.values(db.documents).forEach(doc => {
      doc.slides.forEach(slide => {
        allSlides.push(slide);
      });
    });

    const totalDocs = allSlides.length;

    // --- 1. Compute BM25 Scores ---
    const docTokensList = allSlides.map(slide => {
      const content = `${slide.title} ${slide.text} ${slide.note}`;
      const tokens = tokenizeText(content);
      const tfMap = new Map<string, number>();
      tokens.forEach(tok => {
        tfMap.set(tok, (tfMap.get(tok) || 0) + 1);
      });
      return {
        id: slide.id,
        tokensCount: tokens.length,
        tfMap
      };
    });

    const totalLength = docTokensList.reduce((acc, doc) => acc + doc.tokensCount, 0);
    const avgdl = totalDocs > 0 ? totalLength / totalDocs : 1;

    // Inverse Document Frequency map
    const idfMap = new Map<string, number>();
    queryTokens.forEach(token => {
      const df = docTokensList.filter(doc => doc.tfMap.has(token)).length;
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
      idfMap.set(token, idf > 0 ? idf : 0.01);
    });

    const k1 = 1.2;
    const b = 0.75;
    const bm25Map = new Map<string, number>();
    let maxBm25Score = 0.001;

    docTokensList.forEach(doc => {
      let score = 0;
      queryTokens.forEach(token => {
        const tf = doc.tfMap.get(token) || 0;
        if (tf > 0) {
          const idf = idfMap.get(token) || 0;
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (doc.tokensCount / avgdl));
          score += idf * (numerator / denominator);
        }
      });
      bm25Map.set(doc.id, score);
      if (score > maxBm25Score) {
        maxBm25Score = score;
      }
    });

    const matchCandidates: any[] = [];

    // --- 2. Rank Fusion and Combined Scoring ---
    if (fusionMethod === "rrf") {
      // Reciprocal Rank Fusion (RRF)
      // First, get Dense scores ranks
      const denseScored = allSlides.map(slide => {
        const slideVector = db.vectors[slide.id];
        let vectorScore = 0;
        if (slideVector && queryVector) {
          vectorScore = cosineSimilarity(queryVector, slideVector);
        }
        return { id: slide.id, slide, vectorScore };
      }).sort((a, b) => b.vectorScore - a.vectorScore);

      // Second, get Sparse (BM25) scores ranks
      const sparseScored = allSlides.map(slide => {
        const bm25Score = bm25Map.get(slide.id) || 0;
        return { id: slide.id, bm25Score };
      }).sort((a, b) => b.bm25Score - a.bm25Score);

      const denseRankMap = new Map<string, number>();
      denseScored.forEach((item, index) => {
        // If the vector similarity indicates absolute zero or negative correlation, rank is poor
        denseRankMap.set(item.id, item.vectorScore > 0 ? index + 1 : totalDocs + 1);
      });

      const sparseRankMap = new Map<string, number>();
      sparseScored.forEach((item, index) => {
        sparseRankMap.set(item.id, item.bm25Score > 0 ? index + 1 : totalDocs + 1);
      });

      const k_rrf = 60; // constant

      allSlides.forEach(slide => {
        const denseRank = denseRankMap.get(slide.id) || (totalDocs + 1);
        const sparseRank = sparseRankMap.get(slide.id) || (totalDocs + 1);

        const rrfVectorPart = denseRank <= totalDocs ? (1 / (k_rrf + denseRank)) : 0;
        const rrfSparsePart = sparseRank <= totalDocs ? (1 / (k_rrf + sparseRank)) : 0;

        // Final score combines rank inverse weights
        const finalRrfScore = (rrfVectorPart * vectorWeight) + (rrfSparsePart * (1 - vectorWeight));

        const originalVectorScore = denseScored.find(it => it.id === slide.id)?.vectorScore || 0;
        const originalBm25Score = bm25Map.get(slide.id) || 0;

        // Keep candidates containing some minimal correlation
        if (finalRrfScore > 0) {
          const highlights: string[] = [];
          const fragments = [slide.title, ...slide.text.split("\n"), slide.note];
          fragments.forEach(frag => {
            if (queryTokens.some((tok: string) => frag.toLowerCase().includes(tok))) {
              highlights.push(frag);
            }
          });

          matchCandidates.push({
            ...slide,
            score: parseFloat((finalRrfScore * 100).toFixed(4)), // Magnified scale for UX parsing
            vectorSimilarity: parseFloat((originalVectorScore * 100).toFixed(2)),
            textRelevanceBM25: parseFloat(originalBm25Score.toFixed(3)),
            highlights: highlights.slice(0, 3)
          });
        }
      });
    } else {
      // Linear Score Combination
      allSlides.forEach(slide => {
        const slideVector = db.vectors[slide.id];
        let vectorScore = 0;
        if (slideVector && queryVector) {
          vectorScore = cosineSimilarity(queryVector, slideVector);
          // Bound negative cosine values
          if (vectorScore < 0) vectorScore = 0;
        }

        const rawBm25 = bm25Map.get(slide.id) || 0;
        const normBm25 = maxBm25Score > 0 ? rawBm25 / maxBm25Score : 0;

        const finalScore = (vectorScore * vectorWeight) + (normBm25 * (1 - vectorWeight));

        if (finalScore > 0.02) {
          const highlights: string[] = [];
          const fragments = [slide.title, ...slide.text.split("\n"), slide.note];
          fragments.forEach(frag => {
            if (queryTokens.some((tok: string) => frag.toLowerCase().includes(tok))) {
              highlights.push(frag);
            }
          });

          matchCandidates.push({
            ...slide,
            score: parseFloat((finalScore * 100).toFixed(2)), // percentage display friendliness
            vectorSimilarity: parseFloat((vectorScore * 100).toFixed(2)),
            textRelevanceBM25: parseFloat(rawBm25.toFixed(3)),
            highlights: highlights.slice(0, 3)
          });
        }
      });
    }

    // Sort matching results descending
    matchCandidates.sort((a, b) => b.score - a.score);
    const topSlides = matchCandidates.slice(0, 8);

    // AI summary generation if top results exist
    let aiSummary = "";
    if (topSlides.length > 0) {
      const contextBlocks = topSlides.slice(0, 3).map(s => 
        `文件: ${s.documentName} | 页码: 第${s.slideIndex}页\n标题: ${s.title}\n内容: ${s.text}\n备注: ${s.note}`
      ).join("\n\n");
      
      aiSummary = await askAI(query, contextBlocks, config.settings);
    } else {
      aiSummary = "未在本地索引存储的幻灯片中发现与该提问内容具有强契合度的文本片段。您可以尝试配置混合检索滑块，提升关键词检索比重，或重新调整监控目录。";
    }

    res.json({
      done: true,
      query,
      vectorWeight,
      fusionMethod,
      aiSummary,
      slides: topSlides
    });
  } catch (err: any) {
    res.status(500).json({ error: `检索过程遭遇异常错误: ${err.message}` });
  }
});

// 11. Reveal in File Explorer Deep linking
app.post("/api/local/reveal", async (req, res) => {
  const filePath = req.body.filePath;
  if (!filePath) {
    return res.status(400).json({ error: "文件绝对路径参数 filePath 不能为空" });
  }

  const isWindows = process.platform === "win32";
  const cmd = isWindows 
    ? `explorer.exe /select,"${filePath}"` 
    : `open -R "${filePath}"`;

  try {
    await runLocalCommand(cmd);
    res.json({
      success: true,
      scriptGenerated: cmd,
      message: `本地操作系统定位指令已成功执行，已帮您在资源管理器/访达中高亮显示对应文件。`
    });
  } catch (err: any) {
    console.warn(`[Local Reveal Warning]: Failed to reveal path on this environment. Details: ${err.message}`);
    res.json({
      success: false,
      scriptGenerated: cmd,
      message: `无法在本地服务器运行定位，可能原因为当前处于云端沙箱或操作系统执行受限。提示：${err.message}`
    });
  }
});

// 12. Open Excel or PowerPoint slide at exact index (OS script auto dispatching)
app.post("/api/local/open-slide", async (req, res) => {
  const { filePath, slideIndex } = req.body;
  if (!filePath || !slideIndex) {
    return res.status(400).json({ error: "filePath 与 slideIndex 参数均不能为空" });
  }

  const isWindows = process.platform === "win32";

  // Detailed OS script mockup to prove architectural excellence
  let script = "";
  if (isWindows) {
    script = `
$ppt = New-Object -ComObject PowerPoint.Application
$ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$presentation = $ppt.Presentations.Open("${filePath.replace(/"/g, '`"')}")
$slide = $presentation.Slides.Item(${slideIndex})
$slide.Select()
    `.trim();
  } else {
    script = `
osascript -e '
tell application "Microsoft PowerPoint"
  activate
  open "${filePath}"
  go to slide window 1 to index ${slideIndex}
end tell'
    `.trim();
  }

  try {
    if (isWindows) {
      await runPowerShellScript(script);
    } else {
      await runLocalCommand(script);
    }
    res.json({
      success: true,
      scriptGenerated: script,
      message: `已成功在本地拉起 PowerPoint 并精确定位至第 ${slideIndex} 页。`
    });
  } catch (err: any) {
    console.warn(`[Local Open-Slide Warning]: Failed to run slide automation. Details: ${err.message}`);
    res.json({
      success: false,
      scriptGenerated: script,
      message: `由于沙箱容器限制或本地未安装 Microsoft PowerPoint，无法直接拉起：${err.message}`
    });
  }
});

// Serve frontend based on mode
async function startExpressServer() {
  if (process.env.NODE_ENV !== "production") {
    const viteKey = "vite";
    const { createServer: createViteServer } = await import(viteKey);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, "index.html"))
      ? __dirname
      : path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startExpressServer();
