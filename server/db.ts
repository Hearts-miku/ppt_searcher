import fs from "fs";
import path from "path";
import os from "os";
import { SlideItem } from "../src/types";

export interface IndexedDocument {
  filePath: string;
  documentName: string;
  sha256: string;
  lastModified: string;
  slides: SlideItem[];
  vectorModelUsed?: string;
}

export interface DatabaseSchema {
  documents: { [filePath: string]: IndexedDocument };
  vectors: { [slideId: string]: number[] };
}

let currentDbPath = "";

function resolveDbPath(): string {
  if (currentDbPath) return currentDbPath;

  const homeDir = os.homedir();
  const dirPath = path.join(homeDir, ".ppt_searcher");
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    currentDbPath = path.join(dirPath, "db.json");
    fs.writeFileSync(path.join(dirPath, ".db_write_test"), "ok");
    fs.unlinkSync(path.join(dirPath, ".db_write_test"));
  } catch {
    console.warn("DB Home directory not writable, using local workspace path.");
    const localDirPath = path.join(process.cwd(), ".ppt_searcher");
    if (!fs.existsSync(localDirPath)) {
      fs.mkdirSync(localDirPath, { recursive: true });
    }
    currentDbPath = path.join(localDirPath, "db.json");
  }
  return currentDbPath;
}

let dbInstance: DatabaseSchema = {
  documents: {},
  vectors: {}
};

export function loadDatabase(): DatabaseSchema {
  const file = resolveDbPath();
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as DatabaseSchema;
      dbInstance = {
        documents: parsed.documents || {},
        vectors: parsed.vectors || {}
      };
      return dbInstance;
    }
  } catch (err) {
    console.error("Failed to read slide database metadata. Re-initializing empty schema.", err);
  }
  dbInstance = { documents: {}, vectors: {} };
  saveDatabase();
  return dbInstance;
}

export function saveDatabase(): void {
  const file = resolveDbPath();
  try {
    fs.writeFileSync(file, JSON.stringify(dbInstance, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write persistence database update", err);
  }
}

export function getDatabase(): DatabaseSchema {
  return dbInstance;
}

export function updateDocument(doc: IndexedDocument): void {
  dbInstance.documents[doc.filePath] = doc;
  saveDatabase();
}

export function removeDocument(filePath: string): void {
  const doc = dbInstance.documents[filePath];
  if (doc) {
    doc.slides.forEach(slide => {
      delete dbInstance.vectors[slide.id];
    });
    delete dbInstance.documents[filePath];
    saveDatabase();
  }
}

export function updateSlideVector(slideId: string, vector: number[]): void {
  dbInstance.vectors[slideId] = vector;
  saveDatabase();
}
