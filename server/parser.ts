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
