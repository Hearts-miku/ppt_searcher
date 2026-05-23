import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

export interface ParsedSlide {
  slideIndex: number;
  title: string;
  text: string;
  note: string;
}

export function parsePptx(filePath: string): ParsedSlide[] {
  const result: ParsedSlide[] = [];
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    
    // Find slide files under ppt/slides/slide{index}.xml
    const slideEntries = entries.filter(e => 
      e.entryName.startsWith("ppt/slides/slide") && e.entryName.endsWith(".xml")
    );
    
    // Sort slide entries numerically
    slideEntries.sort((a, b) => {
      const aIdx = parseInt(a.entryName.match(/slide(\d+)\.xml/)?.[1] || "0");
      const bIdx = parseInt(b.entryName.match(/slide(\d+)\.xml/)?.[1] || "0");
      return aIdx - bIdx;
    });

    for (let i = 0; i < slideEntries.length; i++) {
      const slideEntry = slideEntries[i];
      const slideXml = slideEntry.getData().toString("utf-8");
      const slideIndex = parseInt(slideEntry.entryName.match(/slide(\d+)\.xml/)?.[1] || `${i + 1}`);

      // Robust regex regex match for all text nodes inside <a:t>
      const textMatches = slideXml.match(/<a:t[^>]*>(.*?)<\/a:t>/gs) || [];
      const texts = textMatches.map(m => {
        const textVal = m.replace(/<[^>]*>/g, ""); // strip nested elements
        return decodeXmlEntities(textVal);
      }).filter(t => t.trim().length > 0);

      // Title is usually the first big text entry, body is everything else
      const title = texts[0] || `Slide 页 - ${slideIndex}`;
      const bodyText = texts.slice(1).join("\n") || "";

      // Presenter Speech Notes
      const notesEntry = entries.find(e => 
        e.entryName === `ppt/notesSlides/notesSlide${slideIndex}.xml` ||
        e.entryName === `ppt/notesSlides/notesSlide0${slideIndex}.xml`
      );
      
      let note = "";
      if (notesEntry) {
        try {
          const notesXml = notesEntry.getData().toString("utf-8");
          const notesMatches = notesXml.match(/<a:t[^>]*>(.*?)<\/a:t>/gs) || [];
          note = notesMatches.map(m => {
            return decodeXmlEntities(m.replace(/<[^>]*>/g, ""));
          }).join("\n");
        } catch (err) {
          console.warn(`Error parsing presenter note slide for Index ${slideIndex}`, err);
        }
      }

      result.push({
        slideIndex,
        title,
        text: bodyText,
        note
      });
    }
  } catch (err) {
    console.error(`Error parsing PPTX ${filePath}:`, err);
  }
  return result;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function createMockPptx(slideContents: { title: string; text: string; note: string }[], outputPath: string) {
  const zip = new AdmZip();
  
  // 1. [Content_Types].xml
  let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`;

  for (let i = 0; i < slideContents.length; i++) {
    contentTypes += `\n  <Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    contentTypes += `\n  <Override PartName="/ppt/notesSlides/notesSlide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
  }
  contentTypes += `\n</Types>`;
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf-8"));

  // 2. _rels/.rels
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  zip.addFile("_rels/.rels", Buffer.from(rootRels, "utf-8"));

  // 3. ppt/presentation.xml
  let presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>`;
  for (let i = 0; i < slideContents.length; i++) {
    presentationXml += `\n    <p:sldId id="${256 + i}" r:id="rId${i+1}"/>`;
  }
  presentationXml += `\n  </p:sldIdLst>\n</p:presentation>`;
  zip.addFile("ppt/presentation.xml", Buffer.from(presentationXml, "utf-8"));

  // 4. ppt/_rels/presentation.xml.rels
  let presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
  for (let i = 0; i < slideContents.length; i++) {
    presRels += `\n  <Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`;
  }
  presRels += `\n</Relationships>`;
  zip.addFile("ppt/_rels/presentation.xml.rels", Buffer.from(presRels, "utf-8"));

  // 5. Slides and note relationships xmls
  for (let i = 0; i < slideContents.length; i++) {
    const s = slideContents[i];
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>${escapeXml(s.title)}</a:t>
            </a:r>
          </a:p>
          <a:p>
            <a:r>
              <a:t>${escapeXml(s.text)}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const notesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r>
              <a:t>${escapeXml(s.note)}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`;

    zip.addFile(`ppt/slides/slide${i+1}.xml`, Buffer.from(slideXml, "utf-8"));
    zip.addFile(`ppt/notesSlides/notesSlide${i+1}.xml`, Buffer.from(notesXml, "utf-8"));
  }

  zip.writeZip(outputPath);
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Prepopulate highly engaging sample pptx slide presentations on container bootstrap
export function prepopulateSampleFolder(): string {
  const sampleDirPath = path.join(process.cwd(), "sample_ppts");
  if (!fs.existsSync(sampleDirPath)) {
    fs.mkdirSync(sampleDirPath, { recursive: true });
  }

  const file1 = path.join(sampleDirPath, "01_AI与企业级数字化转型战略规划.pptx");
  const file2 = path.join(sampleDirPath, "02_二期混合协同部署与信息安全保障.pptx");
  const file3 = path.join(sampleDirPath, "03_高效办公：PowerPoint本地精确定位.pptx");

  if (!fs.existsSync(file1)) {
    createMockPptx([
      {
        title: "2026年企业级AI落地与数字化转型白皮书",
        text: "加速数字化深度跃迁，通过AI大语言模型多维度融合改造，重构组织效能与研发工作流、以及传统的ERP/CRM数据管理系统。",
        note: "各位领导好，今天我们将汇报2026年度AI在数字化升级中的路线方案。我们要打破之前部门间的壁垒，重组非结构化文档的检索路径。"
      },
      {
        title: "核心痛点分析：信息碎片化与知识遗忘",
        text: "企业内部大量珍贵商业智慧、决策流程与竞对分析，日常沉淀在各个深层嵌套文件夹的PPTX汇报中，造成搜索效率极差，寻找核心文字需要一页页人工翻阅。",
        note: "通过深度遍历哈希对齐，我们将可以实现对这些非结构化PPT文件的毫秒级检索，彻底解决员工每次写汇报都要四处找文件的问题。"
      },
      {
        title: "实施路径：三步打造无侵入语义智脑",
        text: "第一步：指定监控路径实现首添全量静默同步；第二步：自动计算SHA-256和提取Slide段落/Notes内容构建向量索引；第三步：支持大模型提炼摘要并直接触发本地双击精确定位！",
        note: "这三步不仅保证了数据的物理纯净，还结合了底层 chokidar 做到秒级实时同步，只要修改保存了PPT文本，向量库瞬间自动发生热更新。"
      }
    ], file1);
  }

  if (!fs.existsSync(file2)) {
    createMockPptx([
      {
        title: "多供应商适配与本地混合部署中控方案",
        text: "系统全面兼容：Google Gemini (官方推荐，高性能中英语义底座)、标准OpenAI、Anthropic Claude、以及国产大模型DeepSeek-Chat、还支持本地Ollama或vLLM无缝离线调用。",
        note: "为了照顾企业不同的公有云和本地化需求，我们的 Adapter 层做到了多端秒级温热切换。点击设置保存并注入后，全部Embedding通道即时热重载。"
      },
      {
        title: "100% 本地隐私：高维度无依赖向量离线引擎",
        text: "对于极高涉密要求的财务或战略部门，系统自加载离线高维稀疏/稠密双通道向量算法模型，配合纯内存高维哈希关联，可在无网络无API-Key状态下完全闭环！",
        note: "这是本地引擎的亮点。它不会向外部服务器泄露企业任何商业机密。在没有配置 API 秘钥时，前端会优雅提示处于离线引擎保障状态。"
      }
    ], file2);
  }

  if (!fs.existsSync(file3)) {
    createMockPptx([
      {
        title: "极效率革新：PowerPoint毫秒级精准定位拉起",
        text: "革命性的本地深度链接 (Local Deep Linking) 彻底替代了手动复制路径的老旧流程。点击搜索结果中的'🚀 启动此页'或直接双击幻灯片卡片，即可自动化直接打开幻灯片对应页码！",
        note: "在本地主机中，点击该按钮会发起一个API请求。Node后端根据当前所属操作系统，动态执行特定PowerShell/AppleScript命令，闪电唤醒PPT应用并直达光标。"
      },
      {
        title: "底层互操作逻辑：OS Script自动化调用",
        text: "Windows底层驱动：PowerShell Office.Interop 接口。macOS底层驱动：JXA (JavaScript for Automation) / AppleScript。后台还会异步维持独占任务信号量，绝对不会发生多实例卡堵和系统发热异常。",
        note: "这部分脚本执行逻辑采用完全非阻塞形式。如果是运行在浏览器或者沙盒容器场景中，系统会有序捕捉当前环境并弹框列出相应的实拟脚本，让用户一目了然。"
      }
    ], file3);
  }

  return sampleDirPath;
}
