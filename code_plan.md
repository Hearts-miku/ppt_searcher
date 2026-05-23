# PPT 智能检索器 (PPT Semantic Search Engine) - 代码编写思路与架构设计

根据 `arch.md`（系统架构）与 `UI_design.md`（视觉交互设计）中确立的规范，本系统采用 **React 19 (Vite) 前端 + Express (Node.js) 后端** 的双端融合本地化架构。为保证后续进入开发阶段时的代码高鲁棒性与高可维护性，特制定以下代码编写思路与模块化架构设计方案。

---

## 一、 后端(Server-side) 目录结构与模块划分

后端运行于本地 Node.js 环境中，主要职责包括：递归扫描与监控文件目录、解包解析幻灯片内容、调用大模型进行向量化(Embedding)、利用 SQLite 近线缓存元数据及调用系统原生命令完成本地文件/PowerPoint秒级跳转。

### 1. 推荐目录结构
```text
/server/
├── index.ts               # 后端主入口，初始化 Express、加载配置
├── db.ts                  # SQLite 数据库初始化与 DAO 操作逻辑
├── configStore.ts         # ~/.ppt_searcher/config.json 密钥与配置持久化中控
├── parser/
│   ├── pptParser.ts       # PPT 文本与备注解包器 (Zip + Xml 流式读取)
│   └── slideRenderer.ts   # Slide 转图片渲染管线 (Option B: Headless LibreOffice + pdftoppm)
├── services/
│   ├── scanner.ts         # 深度目录遍历 (chokidar 监控 + 自动全量/增量哈希对齐)
│   ├── vectorStore.ts     # 内存 HNSW / 向量余弦相似度计算模块
│   └── modelAdapter.ts    # 多端大模型适配服务 (Gemini, OpenAI, Custom/DeepSeek)
└── routes/
    ├── fs.ts              # 本地轻量级文件树树状浏览接口
    ├── search.ts          # 自然语言检索、关键词传统匹配与 AI 答复
    ├── settings.ts        # 高级设置拉取、测试可用性与保存
    └── local.ts           # 本地系统深度链接 (唤醒 OS 资源管理器与精准 Slide 联动)
```

### 2. 关键服务接口与开发思路

#### (1) `modelAdapter.ts` - 动态适配器
- **思路**: 使用中控抽象类，各平台（Gemini, OpenAI等）实现对应接口。在接收设置热重载时重新初始化客户端，保障前端测试 API 连接可用性(Ping Test)能即时获得最新设置：
  ```typescript
  interface ModelProvider {
    getEmbedding(text: string): Promise<number[]>;
    getCompletion(prompt: string, context: string): Promise<string>;
  }
  ```

#### (2) `pptParser.ts` - 解包优化
- **思路**: 放弃加载整个 PPT 文件，直接通过 `jszip` 仅解包 `/ppt/slides/` 和 `/ppt/notesSlides/` 文件夹下的特定 slide XML 文件。
- **防止内存溢出**: 顺次处理，结合并发控制锁限制同时解包处理的文件数量。

#### (3) `scanner.ts` - 递归遍历与全量/静默/实时热同步
- **思路**:
  - **首次添加**: 跑全量递归 `fs.promises.readdir`，计算 Hash 写入 SQLite，提取文字建立向量，最后将目录注册至监控白名单。
  - **再次启动**: 系统 Bootstrap 阶段自动从 SQLite 获取白名单，起异步静默线程校对磁盘文件状态。
  - **运行期**: 由 `chokidar` 的 `change`, `add`, `unlink` 驱动热同步更新：
    - `change/add`: 重读该文件单个 PPT，覆盖 SQLite 文本，并在向量库内热重载该文件对应的特征。
    - `unlink`: 根据物理路径一键将其从 SQL 和 HNSW 树里清除，无需重启。

---

## 二、 前端(Client-side) 代码架构与组件分工

前端运行在浏览器/Electron渲染端，聚焦极致的交互过渡动画与非凡三栏式排布，注重“触手可及”的操控反馈。

### 1. 推荐目录结构
```text
/src/
├── main.tsx             # React 渲染入口
├── App.tsx              # 应用布局主编排 (Three-Column Dashboard 容器)
├── types.ts             # 统一共享的 React 状态、配置及文件树相关类型
├── index.css            # 暗宇星岩主题色彩、毛玻璃和呼吸聚焦灯环全局 CSS
├── hooks/
│   ├── useSettings.ts   # 高级设置的加载、热保存与连通性测试 Hooks
│   └── useSearch.ts     # 主干网络搜索 (包含 AI Summary + Grid Results)
└── components/
    ├── SettingsModal.tsx # 设置弹窗 (API Key 屏蔽、端点与多模型选择)
    ├── FileTree.tsx      # 左栏：树形嵌套目录与局部的 `/api/fs/list` 组件
    ├── SearchBar.tsx     # 中栏：呼吸感聚焦搜索框 + 匹配滑块 + 文件选定气泡
    ├── BentoGrid.tsx     # 中栏：16:9 幻灯片缩略卡片瀑布流布局
    ├── SlideCard.tsx     # 单体幻灯片卡片 (包含 Hover 毛玻璃浮框、双击联动)
    └── Drawer.tsx        # 右栏：备注拉取与 AI 提炼抽屉面板
```

### 2. 精妙交互实现技术细节

#### (1) 树状目录折叠与展开 (Left Panel)
- **思路**: 在 `FileTree.tsx` 中使用树形扁平化数组，每一层级利用其 `path` 作为唯一 React Key。配合 `framer-motion` 的 `AnimatePresence` 高度动态自适应：
  ```typescript
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: isOpen ? 'auto' : 0, opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    transition={{ duration: 0.2 }}
  >
    {/* 子文件夹或PPT文件文件列表 */}
  </motion.div>
  ```

#### (2) 呼吸外延发光提问框 (SearchBar Focus Aura)
- **思路**: 基于 Tailwind 强大的 CSS 瞬态，控制输入框 Focus 状态。聚焦时，用 `motion` 特效让外层呼吸灯环逐渐从 `opacity-0` 扩大到 `opacity-100`，伴随柔和的颜色晕染。

#### (3) 三维悬浮滑起与毛玻璃面板 (Hover Parallax / Backdrop Overlay)
- **思路**: 用于 `SlideCard.tsx`。当鼠标滑进 16:9 卡片时：
  - 卡片利用 `motion` 进行微小的 `y: -3` 浮动和 `scale: 1.02` 放大。
  - 卡片底部的控制浮层（🎯查看、🚀打开、📋复制）从 `y: 10, opacity: 0` 渐变滑入到 `y: 0, opacity: 1`。

---

## 三、 本地端 Electron .exe 二进制封装实操指南

按照 `arch.md` 最成熟的首选封装方案 A，打包构建工作流设计如下：

### 1. 打包工作流时序

```text
               [ 编译产物汇集 ]
Vite (编译 React 资源 -> dist)  +  Esbuild (编译 Node 后端 -> server.cjs)
                               │
                               ▼
               [ 统一搬送至 Electron 骨架 ]
         将 dist、server.cjs 及第三方 EXE/dll 依赖归档
                               │
                               ▼
               [ Electron Builder 封箱 ]
         对所有二进制以及系统 API 驱动进行数字签名
                               │
                               ▼
                     [ 生成 setup.exe ]
```

### 2. 运行时初始化安全性与自启动规范
1. **防止端口冲突**: 内建端口探测（探测本地包可用的随机动态端口，若 `3000` 占用则自增）。
2. **隐藏命令提示符黑框**: 开启 `execFile` 或 `spawn` 时设置 `windowsHide: true`，确保程序运行时不会弹出恼人的 CMD 窗口。
3. **安全关闭回收**: 监听 Electron 的 `will-quit` 事件，发送信号关闭 Headless 转换池，并将 SQLite 缓存表加锁保存，避免脏读。
