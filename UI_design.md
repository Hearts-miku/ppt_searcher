# PPT 智能检索器 (PPT Semantic Search Engine) - UI/UX 视觉与交互设计规范

本文档详述了**PPT智能检索器**的前端界面视觉风格、主题规范、核心组件交互形态及微动效设计，指导 React + Tailwind CSS + motion 阶段的高保真界面实现。

---

## 一、 视觉设计主题与调配 (Visual Theme & Palette)

为了突出企业级效率工具的专业感，设计选用**“暗宇星岩 (Cosmic Slate)”**与**“智感冷荧 (Active Neon)”**的混合配色，兼具极致的高级质感与视觉对比，最大化降低长时间使用的眼部疲劳。

### 1. 颜色令牌定义 (Design Tokens)

| Token 属性 | 变量名称 / Tailwind 类名 | 具体色值 (HEX/RGBA) | 使用场景 |
| :--- | :--- | :--- | :--- |
| **画布基底色** | `bg-base` / `bg-[#0B0F17]` | `#0B0F17` | 整个应用的主背景，深邃暗调 |
| **容器卡片色** | `bg-surface` / `bg-[#161D2A]` | `#161D2A` | 文件树卡片、检索结果卡片底色 |
| **边框边际线** | `border-subtle` / `border-[#242F41]` | `#242F41` | 精细的单元分界线，透光感微弱 |
| **核心激活色** | `text-active` / `text-emerald-400` | `#34D399` | 检索聚焦灯环、激活节点、匹配度得分 |
| **辅助警示色** | `text-accent` / `text-amber-400` | `#FBBF24` | 备注提取高亮、高优先级任务队列状态 |
| **无源文本色** | `text-muted` / `text-slate-400` | `#94A3B8` | 文件大小、完整路径、次级描述文本 |

### 2. 字体搭配策略 (Typography Hierarchy)
- **大标题 / 界面顶标题**: 选用 **`Space Grotesk`** paired with `font-medium tracking-tight`，带有现代极简科技风格。
- **正文 / 表单**: 选用 **`Inter`** (完美适配大范围中英文排版最佳阅读体验，具备高度易读性)。
- **技术参数 / 文件元数据 (路径、页码、大小)**: 统一使用 **`JetBrains Mono`**，具有理性的结构秩序感。

---

## 二、 界面布局空间体系 (Interface Grid System)

系统界面采用**“非凡三栏式 (Three-Column Dashboard)”**经典效率布局，保证用户在同屏下实现“浏览 -> 配置范围 -> 检索搜索 -> 结果精细预览与唤起”：

```
+---------------------------------------------------------------------------------+
|  [顶部常驻工作航道] PPT 智能检索器              [⚙ 设置]   [延迟/连接状态]: ● Online   |
+---------------------------------------------------------------------------------+
|                  │                                                  │           |
|  [左栏: 文件树]  │  [主面板: 自然语言智能问题与操作区]               │ [右侧抽屉]│
|                  │  +─────────────────────────────────────────────+ │ (备注/AI) │
|  - 路径面包屑     │  │ 🔍 输入自然语言问题或关健字...      [检索阈值] │ │           |
|  - 树形嵌套目录  │  +─────────────────────────────────────────────+ │ - 当前选  │
|    - 📁 文件夹   │                                                 │   中幻灯  │
|      - 📄 PPT    │  [Bento Grid 响应式检索卡片流 (16:9 展示)]        │   片的言  │
|                  │  ┌───────────────┐ ┌───────────────┐ ┌─────────┐ │   语备注  │
|  - 拖拽投放区     │  │ slide 1      │ │ slide 2      │ │ slide 3 │ │   信息    │
|                  │  │ [89% 匹配度]  │ │ [82% 匹配度]  │ │ [ ... ] │ │           |
|                  │  └───────────────┘ └───────────────┘ └─────────┘ │ - AI 提   |
|                  │                                                  │   炼大纲  │
+──────────────────┴──────────────────────────────────────────────────┴───────────+
```

### 1. 区域分配比例
- **左栏（文件浏览器空间）**: 固定宽度 `w-80` (`320px`)，支持侧向一键拖拉折叠。
- **中栏（检索与结果大厅）**: 自适应宽度 `flex-1`。
- **右栏（元数据大纲与备注抽屉）**: 面向选中 Slide 时的动作反馈，采用抽屉式滑入覆盖（`w-[400px]`），由 `AnimatePresence` 弹窗控制。

---

## 三、 关键交互组件深度刻画 (Core Interaction Design)

### 1. 左栏：交互式文件夹树形面板 (Explorer Tree)
- **树形层次缩进**:
  每个垂直层级通过 `Padding-Left` 递增 `pl-4`。边缘增设带有柔性虚线的垂直引导导轨线（`border-l border-dashed border-slate-800`），完美呈现嵌套结构。
- **过渡微动效 (Micro-Animations)**:
  - 展开与折叠：受控于 `motion.div` 的 `height` 与 `opacity` 过渡：
    ```javascript
    animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
    transition={{ duration: 0.2, ease: "easeInOut" }}
    ```
  - 点击文件夹时，左侧的小箭头图标顺时针优雅顺滑旋转 90 度。
- **状态激活反馈 (Active States)**:
  - 鼠标 hover 时：条目背景浅白晕染 `bg-white/[0.03]`，并为 PPT 文件的后缀展现一键选定的快捷指示星标。
  - 被勾选为“指定目标搜索”时：卡片轮廓亮起一圈淡雅的翡翠绿边框，并在右侧标记 `Selected` 标签。

### 2. 中栏：呼吸感聚焦提问框组件 (Responsive Search Terminal)
- **视觉气场**:
  - 输入框整体高度设为 `py-4 px-6 text-lg`，并具备极致通透的背板模糊：`backdrop-blur bg-slate-900/60`。
  - **聚焦灯环环绕 (Focus Aura Outlining)**:
    当输入框处于获取焦点（Focus）状态时，触发周围一层淡绿色的向外发散外环荧光（`ring-2 ring-emerald-500/40 shadow-[0_0_20px_rgba(52,211,153,0.15)]`）。
- **复合过滤器群 (Multi-Filter Group)**:
  - 输入框右下侧附带精美微调工具组：
    - **向量阈值控制滑块 (Similarity Threshold Slider)**:
      可手动调节，限制展示匹配度在某个比例之上的幻灯片（例如：仅展示匹配度超过 `0.75` 类似度的页面）。
    - **清空条件按钮 (Reset Filter)**:
      包含当前选定的特定 PPT 文件的气泡标签。点击气泡上的叉号，即可瞬间恢复为全局深度遍历。

### 3. 中栏：Bento 幻灯片卡片阵列 (Slide Card Grid)
检索结果不使用老旧的纯文字列表，而是采用极速加载的幻灯片缩略卡片，配合 16:9 完美的经典 PPT 大底呈现。
- **毛玻璃信息带 (Metadata Matte Overlay)**:
  在卡片的上边缘或下边缘，设计了一条精美的磨砂感毛玻璃浮框（`backdrop-blur-md bg-slate-950/70`），用 `JetBrains Mono` 字体纤细地印制出：
  - 左侧：匹配度得分 `★ 92.5%` 或 `Slide 08`。
  - 右侧：缩写后的文件名 `digitization...pptx`。
- **悬停触手交互 (Hover Control Reveal)**:
  当用户把鼠标移入卡片（`hover` 状态）时，触发卡片整体轻微浮升 3px，且不抖动：
  1. 卡片背景毛玻璃变亮，显现出两个精制的控制按钮：
     - **“🎯 查看位置”**: 图标 `FolderKanban`。点击后，通过本地 API 直接拉起并高亮系统内 PPT 的所在路径。
     - **“🚀 打开此页”**: 图标 `FilePlay`。双击卡片或点击此按钮，零延迟自动拉起本机 PPT 进程且精准让光标飞梭至所选幻灯片页面。
     - **“📋 提取字串”**: 一击无痛拷走此页的所有内文。

### 4. 顶部工作栏与高级设置弹窗 (Top Header & Advanced Settings Modal)
为了支撑混合云地、多模型部署环境，系统在顶部航道集成一个磨砂质感的高级设置弹窗面板：

#### ① 设置项激发与转场 (Trigger & Transition)
- **设置按钮 (Gear Button)**: 采用 `lucide-react` 中的 `Settings` 齿轮图标，鼠标悬浮时触发 `rotate-45` 顺时针温和自旋转，暗示可交互性。
- **毛玻璃对话框转场 (Glassmorphic Modal)**: Click 瞬间，背景遮罩 `overlay` 渐入（`opacity: 0.4`），同时中心设置弹窗以极具 Q 弹感的缩放动画（`scale: 0.95 -> 1.0`）淡入呈现。

#### ② 模型高级配置面板布局 (Model Configuration Panel)
- **AI 供应商切合下拉框 (Model Provider Selector)**:
  - 选项菜单：`Google Gemini`（默认，官方高拟真语义库）、`OpenAI`、`Anthropic Claude`、以及 `Custom/DeepSeek (OpenAI-Compatible)`（支持对接任何国产开源大模型网关）。
- **个性化 API 秘钥输入框 (API Key Masked Input)**:
  - 默认以小圆点遮蔽（`type="password"`），附带小眼睛图标支持一键可见性核验。
- **自定义服务节点端点 (Custom Endpoint Input)**:
  - 当用户选择 `Custom/DeepSeek` 时，该字段平滑渐显（`AnimatePresence` 驱动高度从 0 px 展开），允许用户输入形如 `https://api.deepseek.com/v1` 或本地 LocalLLM 的 `http://localhost:11434/v1`（Ollama）接口基础端点。
- **多阶向量建库设置 (Embedding Strategy)**:
  - 按钮组（Tab Segment）：【本地 Wasm 100% 离线向量】 与 【第三方云端托管向量】。选定后者时，将随 API 秘钥一并执行外部 Embedding 向量抓取。
- **连接可用性速测 (Ping Test Utility)**:
  - 设置底端加入“测试连接并连通 API”按钮。点击后发送微型 ping 报文给后端，前端展示微型加载圈：
    - **成功**: 绿光闪烁，文字变换并展示 `"成功连通 (API可用, 响应 120ms)"`。
    - **失败**: 琥珀红光闪烁，文字展示并输出具体的排查报错内容。
- **持久化配置管理**:
  - “保存并注入” 按钮动作：配置项通过 Node 本地保存为 `~/.ppt_searcher/config.json`（避免暴露在前端造成密钥泄露），同时即刻热重载，刷新当前全部 Embedding 搜索通道的环境变量。

---

## 四、 全生命周期状态图 (System Full-State Transitions)

界面不是一成不变的，在从配置根目录到建库及查询的全生命周期中，UI 呈现高度一致的流转体验：

1. **零索引空状态 (Welcome & Drag State)**:
   - 展现巨幅呼吸质感的文件拖拽提示区。引导用户“直接将 PPT 目录拖入此窗口”以添加。
2. **扫描与向量索引实时生成状态 (Indexing Progress Block)**:
   - 右上角/状态条区域，会以优雅的骨架屏（Skeleton Loader）或渐变走马马条进度条展示：
     `"正在深度遍历 [企业汇报] 目录: 12/48 个文件已被语义化。"`
   - 伴随淡入淡出的信息流。
3. **完成状态 (Completed State)**:
   - 随着进度转为绿色，主搜索模块优雅地从虚无中向淡上滑入（`motion` 淡入动画，延迟 100ms），即刻准备迎接用户的智慧提问。

---

## 五、 后续 UI 开发同步检查单 (Development Checklist)

- [ ] 完成针对 `index.css` 的全新字体和背景设计声明。
- [ ] 封装 Left-Panel Treeview 的无卡顿 React 组件。
- [ ] 将 `@/arch.md` 重写引入的 Option B 作为后台模拟逻辑在 API 端承托输出。
- [ ] 为 Slide 卡片添加具有三维悬浮质感（3D hover parallax）或磨砂透光光影效果的 `motion` 实现。
