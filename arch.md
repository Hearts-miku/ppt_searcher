# PPT 智能检索器 (PPT Semantic Search Engine) - 架构设计文档

本文档详述了**PPT智能检索器（本地单机运行版）**的系统架构、技术选型、数据处理管线、交互逻辑，以及如何利用大语言多模态技术和操作系统本地命令唤起逻辑，实现自然语言检索、多卡片预览、一键精确调取到幻灯片具体页。

---

## 一、 系统架构总体设计 (System Architecture Overview)

由于本系统需要快速扫描、检索本机的 `.pptx`/`.ppt` 演示文稿，且涉及对操作系统的“直接路径打开”、“精确定位具体幻灯片页面”等需要高度本地控制权的任务，系统推荐采用**双端融合架构**：

- **宿主进程 (Backend Container / Desktop Host)**: 采用 **Express (Node.js) + 辅助脚本 (或 Tauri/Electron 作为外壳)**，负责本地文件的读取监听、Office 进程交互、本地数据库读写。
- **用户界面 (Frontend Client)**: 采用 **React + Tailwind CSS**，通过轻量级 Web 页面展现，实现无缝拖拽部署目录、智能提问框、多维响应卡片与可视化上下文交互。

```
+-------------------------------------------------+
|               React Frontend UI                 |
|   (配置目录、自然语言搜索、多卡片幻灯片预览、一键唤起)   |
+----------------------------------------+--------+
                                         | REST API
                                         v WebSocket
+-------------------------------------------------+
|               Express Local Server              |
|   - 目录监控 (Chokidar) + 增量文件感知更新            |
|   - SQLite 缓存 (Sha256 完整性校验、页文字解密)      |
|   - 语义检索引擎 (Embeddings / HNSW 内存检索)       |
|   - 本地系统代理 (Local OS Launcher / OS Scripts)  |
+-------------------+--------------------+--------+
                    |                    |
                    v                    v
         [本地演示文稿目录 (.pptx)]    [PowerShell / AppleScript COM接口]
                    |                    |
                    v                    v
         幻灯片本页文字提取与截图展示       Windows PowerShell / MacOS AppleScript
                                          秒级唤醒 PowerPoint 并定位至幻灯片指定页
```

---

## 二、 核心技术选型 (Strict & Pragmatic Tech Selection)

### 1. 基础基础及网络 (Core Base)
- **前端核心**: `React 19` + `Tailwind CSS v4` + `motion` (提供流畅的检索切换、悬浮和动画引导效果)。
- **后端核心**: `Express 4.x` + `tsx` (提供低延迟的本地服务，可配置为单机监听 `localhost:3000`)。
- **图标资源**: `lucide-react` (统一系统视觉语义)。

### 2. 本地 PPT 解析器 (PPT Extraction & Metadata Gathering)
- **文本与备注物理抽取管线（100% 离线、免 Office 依赖）**:
  系统放弃直接读取 PowerPoint 二进制，针对 `.pptx`（其本质为符合 OpenXML 标准的 ZIP 压缩包）采用全 NodeJS 内存流式解包方案，大幅提升解析吞吐率：
  1. **ZIP 文件流式探针**: 使用 `jszip` 将 `.pptx` 文件载入成文件只读流。
  2. **正文文本解析器 (Slides Parser)**:
     - 递归遍历 `ppt/slides/slide{n}.xml` 里的所有子节点。
     - 使用轻量快速的流式 XML 解析器（如 `fast-xml-parser`）或定制正则表达式，精确寻址并提取 `<p:txBody>`（PPT 主文本框容器）、`<p:sp>`（形状文本内文）、以及表格元素 `<a:tbl>` 的正文值。
  3. **演讲备注精确关联器 (Speaker Notes Linker)**:
     - 解析 `ppt/notesSlides/notesSlide{n}.xml` 提取真正的备注和备忘内容。
     - 读取 `ppt/slides/_rels/slide{n}.xml.rels` 中的关系关联映射表，精确锁定该页幻灯片与相应演讲备注（Speaker Note）的绑定关系，确保数据在向量化之前完成强类型拼接关联。
  4. **元数据关联提取 (Slide Meta-Info)**: 
     - 捕获幻灯片内部超链接（`<a:hlinkClick>`），用于后续对包含链接的页面进行特征化语义加权。

- **视觉预览生成模式**:
    专门针对 Linux 服务器、MacOS 或未安装高额 PowerPoint 商业许可的本地非 Windows 客户端而建立的高稳定性、多进程解耦渲染引擎。
    其核心管线图如下所示：
    ```
    ┌──────────────┐    1. Headless libreoffice   ┌─────────────┐
    │  .pptx 文件  │─────────────────────────────>│   .pdf 档   │
    └──────────────┘                              └──────┬──────┘
                                                         │
                                                         │ 2. pdftoppm (150 DPI)
                                                         ▼
    ┌──────────────┐       3. Node-Sharp 压缩     ┌─────────────┐
    │ 优化后的 Web │<─────────────────────────────│ 临时 PNGs   │
    │ 预览图片 (JPG)│                              │(slide_1.png)│
    └──────────────┘                              └─────────────┘
    ```
    每一阶段的技术细节、异常防范与实现逻辑：
    
    #### 第一阶段：跨平台通用 PPTX 转换为 PDF 模块
    后端服务在启动时，会通过系统路径探测算法自动寻址 `soffice`（LibreOffice Headless 控制端）的存放路径：
    - **Windows 寻址**: `C:\Program Files\LibreOffice\program\soffice.exe`
    - **macOS 寻址**: `/Applications/LibreOffice.app/Contents/MacOS/soffice`
    - **Linux 寻址**: 执行命令自动匹配系统内的环境变量路径 `which soffice`
    
    确定路径后，调用底层子进程守护包 `child_process.execFile`，非阻塞并异步发送转换指令：
    ```bash
    soffice --headless --invisible --convert-to pdf --outdir "/temp/pdf_cache" "/data/target.pptx"
    ```
    - `--headless`: 启动无界面后台模式，减少 GPU/Window 句柄渲染开销。
    - `--invisible`: 避免在客户端系统底栏闪现 LibreOffice 图标，实现用户完全无感知。

    #### 第二阶段：高性能 PDF 分页转换为图片模块 (PDF -> Native PNG)
    若在 Node 层使用纯原生 JS 解析渲染 PDF 转换为图片（如 pdf.js + node-canvas），容易出现中文字体缺失、宋体/微软雅黑乱码以及排版错位的严重技术漏洞。
    **Option B 选用操作系统级高性能图像模块（Poppler 实用包之 `pdftoppm`）作为渲染抓取核心**：
    - 在后端调用 `pdftoppm -png -r 150 "/temp/pdf_cache/target.pdf" "/temp/img_cache/slide"`。
    - `-r 150`: 设置屏幕点像素比（DPI）为 150，这在绝大多数大屏预览中既保证了极度清晰细腻的文字表达，又避免了输出数十MB的冗余图像像素。
    - 该工具用 C++ 构建，能够以每秒 10-15 页的速度瞬间切分大型高保真 PPT，同时完美承接本机系统中注册过的 Windows/Mac 系统原文字体。

    #### 第三阶段：高并发优化与 Sharp 画质压缩
    - 为了避免大量幻灯片卡片瞬间加载拖垮 Electron/Tauri 或 Chrome 的渲染进程，获取到原始大尺寸 PNG 后，系统利用极其快速的图像库 **Sharp** 进行图像后处理。
    - 将 PNG 统一压缩、重定界为 `width: 1280px` 的渐进式（Progressive）Web JPEG 或 WebP 格式，且保持质量百分比定于 `78%`，体积能缩小至原来的 `1/8`，加载延迟降至毫秒级。
    - **防并发限流队列 (Backpressure Lock)**:
      针对深度多重文件夹扫描导致的 PDF 转换积压，Option B 内部搭载了一个**基于优先级队列的独占控制锁 (Exclusive Task Semaphore)**，最大处理并行数限定为 `Cpu_Cores - 1` 或固定为 `2`。以此确保在处理上百款 PPT 深度索引建立时，后台运行流畅、系统极低发热、用户交互绝不发生瞬时不可用卡顿。

### 3. Embeddings 语义底座与本地库 (Semantic Embeddings & Local Search)
- **Embedding 与模型推理模块 (Multi-Model & Multi-Provider Adapter)**:
  - **动态热切换多服务适配引擎**: 系统后端内置模型提供商调度卡（`ModelProviderAdapter`）。支持根据前端配置动态映射负载。
  - **Google GenAI (推荐首选)**: 使用 `@google/genai` 的 `gemini-embedding-2-preview` 进行文本向量化（768个维度，对中英双语及技术词汇拥有业界领先的语义空间分布），推理大纲段落和 AI 总结默认使用 `gemini-3.5-flash`。
  - **第三方 API 接入适配**:
    - 支持标准 OpenAI、Anthropic 格式调用、以及国产 DeepSeek 的 `deepseek-chat`。
    - 自定义 URL（Custom OpenAI-compatible Endpoint）：支持拉接局域网或本地算力中的 `ollama`、`vLLM` 构建的离线中控。解构统一的 `/v1/embeddings` 以及 `/v1/chat/completions` API 转换。
  - **离线兼容备用**: 本地可使用 `@xenova/transformers` (WebGPU加速) 运行超轻量 `all-MiniLM-L6-v2` embedding 模型，实现 100% 离线隐私语义检索。
- **本地向量相似度计算与元数据持久化**: 采用纯内存计算或使用轻量的高维无依赖 HNSW 本地索引库（如 `hnswlib-node`），元数据（文件路径、Sha256、文本碎片内容、对应 Slide Index、生成图片临时绝对路径）存储于本地轻量型高性能 `SQLite` 中。
- **配置安全持久化设计 (Secure Config Storage)**: 
  - 所有用户自定义密钥（如企业私网 API-Key、代理端点、微调参数）均由 Node 后端直接安全存储于本机的 `.ppt_searcher/config.json` 文件中，不经过任何前端公开环境变量。
  - 前端界面通过底层路由 (如 `POST /api/settings/save` 与 `POST /api/settings/test`) 实现即时响应修改、可用性侦测以及热重载（Hot Reload），极大保障企业机密隐私信息不泄。

### 4. 本地深度链接 (Local Deep Linking)
为了实现在线 Web App 与本地文件资源的高效联动，本系统设计了创新的**本地进程唤唤接口 (/api/local)**:
- **打开文件所在文件夹并选中产品**: 
  - **Windows**: 执行外部进程命令 `explorer.exe /select,"{filePath}"`
  - **macOS**: 执行 `open -R "{filePath}"`
- **精准运行并跳转到特定幻灯片页面**:
  - **Windows (PowerShell + COM)**:
    ```powershell
    $pp = New-Object -ComObject PowerPoint.Application
    $pp.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
    $pres = $pp.Presentations.Open("{filePath}", $false, $false, $true)
    $pres.Slides.Item({slideIndex}).Select()
    $pp.Activate()
    ```
  - **macOS (AppleScript)**:
    ```applescript
    tell application "Microsoft PowerPoint"
        activate
        open "{filePath}"
        set active slide of active window to slide {slideIndex} of active presentation
    end tell
    ```

---

## 三、 数据处理管线流程 (Data Processing Pipeline)

本系统的核心性能表现取决于后台数据处理的平滑度，避免卡顿和大内用。数据处理采用下述三段式管线设计：

### 1. 第一阶段：扫描、深度检索与哈希校验 (Deep Scan & Hash)
1. **输入触发与首次全量向量化 (First-Time Ingestion)**:
   - **首次添加监控**: 当用户第一次通过前端添加一个本地根目录（例如 `D:\WorkFiles\PPTs`）时，后台立刻启动全量扫描器，拉起多线程或排队式的优先任务队列。
   - **即时全量向量化**: 对该文件夹内检索到的所有 `.pptx`/`.ppt` 文件启动文本特征提取和向量化。在全量建立索引的同时，将该“监控根目录”存入本地 SQLite 或 `config.json` 目录监控列表中，标明其为“已授信同步目录”。
2. **后续启动自动热加载 (Startup Auto-Load & Warm Sync)**:
   - **自加载机制**: 每当应用程序再次启动时（无论是通过 Electron 壳双击打开还是服务启动），后端进程会在服务初始化（Bootstrap）阶段自动读取 `.ppt_searcher/config.json` 中的“已授信同步目录”列表。
   - **静默后台对齐 (Async Warm Verification)**: 启动后无需用户再次手动添加。后端会在后台静默以极低资源开销异步重新跑一遍递归遍历与 SHA-256 哈希比对。若发现用户在程序关闭期间对 PPT 进行了修改或新增，将自动为其进行增量向量化。
3. **递归深度遍历机制 (Recursive Directory Traversal)**:
   - **深层文件扫描器**: 后台自研或配置递归扫描函数，结合 `fs.promises.readdir` (设置 `withFileTypes: true`)，能完整穿透任意深度的嵌套子文件夹。
   - **过滤与白名单**: 默认仅匹配以 `.pptx`/`.ppt` 结尾的幻灯片文件，并内置排除列表（如 `node_modules`、`.git`、`Temp` 目录及回收站等），避免无效遍历。
   - **环形引用的预防**: 在递归时通过解析绝对路径并保持已访问路径集合（Visited Set），防止由于符号链接（Symbolic Links）导致的死循环。
4. **运行期实时动态监听与热同步 (Runtime Sync-upon-Update)**:
   - **全天候监测**: 后端基于 `chokidar` 开启深度监听（绑定在所有“已授信同步目录”上，启用 `depth: undefined` 属性支持无限级嵌套目录监控）。
   - **即时热同步更新**: 当应用程序处于**启动运行状态**时，若用户在操作系统的资源管理器中修改、保存或新增了某个 PPT 文稿：
     - `Chokidar` 瞬间捕获到 `change`/`add` 文件事件。
     - 延迟去抖（Debounce）3-5 秒后自动触发后台增量更新。解析最新的该文档 Slide，计算最新的 Embedding 并热更新对应的 HNSW 与 SQLite 数据库。
     - 若捕获到 `unlink`（删除文件）事件，系统将零延时从 HNSW 向量树与 SQLite 目录中剔除对应文件的所有幻灯片向量节点与缩略图临时图片，保持索引库绝对实时物理纯净。
5. **哈希对齐**: 对任意级别嵌套中扫描出来的 `.pptx` 文件计算基于“文件相对/绝对路径 + 文件大小 + 最后修改时间”的快速 SHA-256 哈希作为全局唯一指纹，将其与本地 SQLite 缓存库进行比对。
   - 若指纹未更变：说明该 PPT 已建立过索引，直接跳过解析。
   - 若指纹缺失/变更：列入增量解析任务队列。

### 2. 第二阶段：分块、语义富化及提取 (Parse & Enrichment)
1. **物理拆解**: 按每张幻灯片 (Slide Index) 自上而下进行逻辑切分。
2. **文本信息抽取**:
   - `标题 (Slide Title)`: 查找含有占位符类型为标题的文本块。
   - `主体正文 (Body Text)`: 将所有零散的段落文本，包括表格内的单元格文本合并为扁平字符串。
   - `演讲备注 (Slide Notes)`: 读取对应幻灯片的备注文本。这通常是编写者真正的核心思想，是极具价值的检索元数据。
3. **文本富化拼接 (Context Formatting)**: 
   将多维信息汇集成一个高度相关的自解释文本段：
   ```text
   文件: [文件名] | 幻灯片第 [N] 页 | 标题: [段落标题] | 
   内容: [本页文本主体] | 演讲备注: [附带说明]
   ```
4. **缩略图同步渲染**: 异步在后台调用微软 COM 或者是 LibreOffice，在特定的临时缓存路径保存对应的 `slide_n.png`。

### 3. 第三阶段：向量建库与存储 (Embedding & Storage)
1. **API 单次高并发打包**: 将上述拼装好的每页上下文通过调用 `/api/gemini/embed` 传送至 Google Embedding 服务（支持批处理以降低延迟）。
2. **持久化保存**:
   - 包含向量的 HNSW 文件结构，用于支持亚毫秒级的余弦相似度检索。
   - 包含纯文本、Sha256 指纹、文件完整物理路径、对应页码以及生成缩略图绝对路标的 SQLite 数据库，用于支持前端数据展示。

---

## 四、 前后端交互逻辑 (User Interaction & Experience)

本系统采用一种**沉浸式单页面、无死角、零干扰**的交互设计：

### 1. 输入意图过滤与语义分析 (Dual Filter Mode)
- **关键词搜索 (传统)**: 针对诸如 "Q3" 或特定词组 "API_KEY"，支持快速从 SQL 数据库里直接使用 `LIKE` 机制或者是字面精确定位。
- **自然语言语义提问 (AI 支持)**: 
  - 用户输入：“找一找关于企业出海、商业化出海和数字化转型的PPT。”
  - 后台在向量库进行向量距离（K-Nearest Neighbors）搜索。
  - 获取最顶层的 $K$ 个匹配卡片，然后将这几个卡片的精准图文上下文作为 RAG 背景，调用 `gemini-3.5-flash` 输出一段高精度的**AI检索摘要回复**（"根据您的需求，以下演示文稿的第5, 8及12页为您提炼出了出海业务的以下规划..."），大大提升寻找信息时的效率。

### 2. 界面布局与操控细节 (Highly Polished UX Grid)
- **极简多维检索栅格**: 
  - 核心包含一个优雅、带呼吸灯聚焦外圈的大文本提问框，下方配有检索阈值滑块、包含/排除目录标签。
  - 检索结果以高阶“Bento Grid” 配合幻灯片缩略卡片形式展示（非机械白卡片，使用深灰、柔白对比设计）。
- **幻灯片悬浮卡片微动作 (Hover States)**:
  - 鼠标移动至某张匹配到的 Slide 预览图时，利用 `framer-motion` 将卡片做 1.02x 的优雅无痕放大与微影浮出。
  - 卡片下边缘滑入一个操控面板，包含 4 组功能按钮：
    1. **直接打开文件夹 (Reveal File)**: 一键高亮物理文稿。
    2. **精准定位页面 (Slide-to-Page)**: 触发后端 COM，瞬间启动 PowerPoint 并跳转到本页（双击卡片也可以直接触发相同功能）。
    3. **一键复制文本 (Copy Text)**: 将本页提取出的所有文字进行一键剪切，并在界面中央弹出一个柔和的“文字已成功复制到剪切板”过渡提醒。
    4. **幻灯片展开 (Expand Notes)**: 弹出侧边精致的抽屉栏，高保真列出当前页除正文外所有的备注文字以及大纲列表。

### 3. 前端轻量级文件浏览器组件 (Interactive Folder Explorer & Picker)
为了解决用户“精准查看与指定某一个具体文件夹或特定PPT文件进行针对性检索”的需求，系统在检索主面板侧旁/顶部集成一个**树状文件系统空间浏览器(File Directory Explorer)**：

#### ① 交互结构设计 (Component Tree Diagram & Interaction UI)
- **树状结构容器**: 一个侧边柔性可折叠的卡片（`width`/`max-w-[320px]`），基于 `framer-motion` 的 `AnimatePresence` 实现文件夹层级的收起/展开动画。
- **动态状态指示与节点标识**:
  - **文件夹节点 (Folder Node)**: 前置 `Folder` 文件夹图标，若文件夹已展开则自动切换为 `FolderOpen`。点击可异步触发下级子节点拉取。
  - **文件节点 (File Node)**: 前置 PPT 特色小图标（`FilePresentation` / `FileSlide`），不可展开，但支持单选或多选。
  - **路径面包屑 (Breadcrumb Navigation)**: 顶部提供当前基准浏览绝对路径的路径标签组，支持点击其中部分父级节点直接“向上返回/跳转”到指定历史级。

#### ② 数据驱动接口机制 (Backend Support REST API)
- **轻量级局部遍历接口 `/api/fs/list`**:
  - 前端发送请求给后端传递具体浏览路径（如空路径代表“初始系统盘符”或“默认工作区根目录”）：
    ```json
    { "path": "D:\\WorkFiles\\PPTs" }
    ```
  - 后端执行轻量级非递归 `fs.promises.readdir(dir, { withFileTypes: true })`：
    - 快速读取并返回该目录下**直属一级**的所有 `directories` （文件夹）和 `.pptx`/`.ppt` `files`。
    - **极速响应响应体设计**:
      ```json
      {
        "currentPath": "D:\\WorkFiles\\PPTs",
        "parentPath": "D:\\WorkFiles",
        "nodes": [
          { "name": "2026年Q3财报工作组", "type": "directory", "absolutePath": "D:\\WorkFiles\\PPTs\\Q3_Finance" },
          { "name": "数字化主线汇报.pptx", "type": "file", "absolutePath": "D:\\WorkFiles\\PPTs\\digitization.pptx", "size": "15.4MB", "lastModified": "2026-05-20" }
        ]
      }
      ```

#### ③ 快捷操作动作设计 (Action Handlers & Events)
- **一键指定为索引根节点 (Select as Target Path)**: 鼠标浮动于文件夹节点时，展示“设为当前检索主路径”按钮。点击后，搜索框下的“已选路径白名单”立刻注入，并实时调取 `chokidar` 深度监控该文件夹链条。
- **单选精确定向搜索 (Targeted File Search)**: 
  - 前端支持勾选单个 PPT。勾选后，“全局搜索”过滤器将自动切换成“指定文件精确定向过滤”。
  - 检索结果列表会自动仅过滤并呈现选中的特定演示文稿（例如仅呈现 `digitization.pptx` 的内部幻灯片页面）。
- **拖拽注册 (Drag & Drop)**: 支持直接将操作系统的文件夹拖放在该组件卡片范围，前端捕获 `e.dataTransfer.files` 中的首个物理文件夹路径，并通过后端进行文件夹激活。

---

## 五、 本地独立 .exe 可执行文件打包方案 (Local .exe Packaging & Distribution Strategy)

为了实现“本地一键安装、双击运行、零环境依赖”的极佳用户体验，本系统针对 Windows 平台采用 **Electron + Electron Builder** 全栈混合打包封装方案。该方案是目前最主流且高度成熟的 `.exe` 桌面端集成发布路线。

### 核心打包方案：Electron + Electron Builder

该方案通过将 React 静态前端、Express 服务端以及 Node.js 运行时完整整合并压缩，生成一个高稳定性的 Windows 安装包或绿色版可执行程序（如 `.exe` / `Setup.exe`）。

#### 1. 软件架构体系 (Application Architecture Layout)
- **主进程 (Main Process)**: 负责启动 Express 本地服务器、创建 Chromium 窗口（BrowserWindow），以及监听操作系统的特定生命周期事件。
- **渲染进程 (Renderer Process)**: 即 React 前端（打包编译出的 `dist` 静态资源），由于同源策略，由 Electron BrowserWindow 直接加载。
- **API 通信桥梁**: React 前端通过发送 HTTP 请求给本地 `http://localhost:3000`，或使用 Electron 专有的安全 `ipcRenderer` / `contextBridge` 与 Node.js 后端服务通信。

#### 2. 静态依赖与第三方 CLI 工具打包约束 (Extra Resources Embedding)
`.pptx` 转换依赖的 `pdftoppm` 等二进制工具不能直接编译进 JS 代码。在打包成 `.exe` 时，需要使用 Electron Builder 的 `extraResources` 配置：
```json
// electron-builder.json
{
  "directories": {
    "output": "dist_desktop"
  },
  "files": [
    "dist/**/*",        // 编译后的 React 前端
    "server/**/*",      // 编译后的 Express 服务
    "main.js"           // Electron 桌面入口
  ],
  "extraResources": [
    {
      "from": "bin/win32/poppler/",  // 存放 Windows 版 pdftoppm.exe 的目录
      "to": "bin/poppler/",
      "filter": ["**/*"]
    }
  ]
}
```
后端 Express 运行时，利用 `process.resourcesPath` 动态解析出打包后的 `pdftoppm.exe` 工具：
```javascript
const isPackaged = app.isPackaged;
const popplerPath = isPackaged 
  ? path.join(process.resourcesPath, 'bin/poppler/pdftoppm.exe') 
  : path.join(__dirname, 'bin/win32/poppler/pdftoppm.exe');
```

---

## 六、 本地开发验证路线图 (Sprint Verification Pipeline)

1. **[Milestone 1] 底层功能确认**: 编写 Express 两个测试组件（PPT文本解包、OS 文件/PowerShell COM 页码唤起指令集），验证直接跳转指定页的技术可行性。
2. **[Milestone 2] 检索性能优化**: 针对 HNSW 库进行 50 个大文稿（超过 2000 个幻灯片）的批量索引并发测试，设定内存与算力最均衡的批处理间隔（Batch Chunks）。
3. **[Milestone 3] UI 视觉极致磨炼**: 构建基于多页瀑布流的 Slide 响应栏。利用 Inter 与 JetBrains Mono 打造具有科技感又不失专业的演示文稿智能检索器。
