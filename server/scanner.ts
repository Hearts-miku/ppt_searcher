import fs from "fs";
import path from "path";
import crypto from "crypto";
import chokidar from "chokidar";
import { loadConfig, saveConfig } from "./configStore";
import { getDatabase, updateDocument, removeDocument, updateSlideVector } from "./db";
import { parsePptx } from "./parser";
import { computeEmbedding } from "./modelAdapter";
import { SlideItem } from "../src/types";

// Generate unique hash based on metadata - incredibly fast, zero-disk I/O bottlenecks
export function generateFileHash(filePath: string): string {
  const stat = fs.statSync(filePath);
  const key = `${filePath}_${stat.size}_${stat.mtimeMs}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Global watcher state, keyed by monitored path
const watchers: { [folderPath: string]: any } = {};

let indexingProgress: { [filePath: string]: string } = {};

export function getIndexingStatus() {
  return indexingProgress;
}

// Recursively traverse folder and return all .pptx files
export function scanFolderRecursive(dir: string, pptxFiles: string[] = []): string[] {
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    
    // Visited set context should be evaluated if symmetric links could cause loops, simple path tracker
    for (const item of list) {
      const fullPath = path.resolve(dir, item.name);
      
      // Skip ignorable node structures
      if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "Temp" || item.name === "dist") {
        continue;
      }
      
      if (item.isDirectory()) {
        scanFolderRecursive(fullPath, pptxFiles);
      } else if (item.isFile() && (item.name.endsWith(".pptx") || item.name.endsWith(".ppt"))) {
        pptxFiles.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory for traversal: ${dir}`, err);
  }
  return pptxFiles;
}

// Unify a document's embedding logic in sequence with index caching
export async function indexSingleFile(filePath: string, force = false): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found for indexation: ${filePath}`);
    return;
  }

  const db = getDatabase();
  const fileHash = generateFileHash(filePath);
  const docName = path.basename(filePath);

  // Jump indexing if already processed and matching signature
  const existing = db.documents[filePath];
  if (!force && existing && existing.sha256 === fileHash) {
    console.log(`[Cache Hit] Already indexed and matching hash for: ${docName}`);
    return;
  }

  console.log(`[Indexing Started] Scanning deep elements of file: ${docName}`);
  indexingProgress[filePath] = "Parsing presentation structure...";

  try {
    // Parse slides and annotations
    const parsedSlides = parsePptx(filePath);
    const config = loadConfig();
    const slideItems: SlideItem[] = [];

    indexingProgress[filePath] = `Vectorizing slides (0/${parsedSlides.length})...`;

    for (let i = 0; i < parsedSlides.length; i++) {
      const s = parsedSlides[i];
      const slideId = `${filePath}#${s.slideIndex}`;
      const textToEmbed = `Title: ${s.title}\nContent: ${s.text}\nPresenterNotes: ${s.note}`;
      
      // Gentle pacing delay to respect Gemini RPM rate limit
      if (config.settings.embeddingMode === "online") {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Compute vector
      const vector = await computeEmbedding(textToEmbed, config.settings);
      updateSlideVector(slideId, vector);

      slideItems.push({
        id: slideId,
        documentName: docName,
        filePath: filePath,
        slideIndex: s.slideIndex,
        title: s.title,
        text: s.text,
        note: s.note
      });

      indexingProgress[filePath] = `Vectorizing slides (${i + 1}/${parsedSlides.length})...`;
    }

    // Capture index schema back into SQL/JSON DB
    updateDocument({
      filePath,
      documentName: docName,
      sha256: fileHash,
      lastModified: fs.statSync(filePath).mtime.toISOString(),
      slides: slideItems,
      vectorModelUsed: config.settings.embeddingMode === "offline" ? "LocalVocabulary" : config.settings.provider
    });

    console.log(`[Indexing Success] Vector index saved for PPT: ${docName}`);
    delete indexingProgress[filePath];
  } catch (err: any) {
    console.error(`[Indexing Failure] Encountered error on processing document ${docName}:`, err);
    indexingProgress[filePath] = `Failure: ${err.message}`;
    setTimeout(() => {
      delete indexingProgress[filePath];
    }, 10000);
  }
}

// Auto-align monitored folders on load (Startup Sync)
export async function startupAutoLoad(): Promise<void> {
  const cfg = loadConfig();
  console.log(`[BOOTSTRAP] Loading ${cfg.monitoredFolders.length} previously monitored folder trees...`);
  
  for (const folder of cfg.monitoredFolders) {
    if (fs.existsSync(folder)) {
      console.log(`[Bootstrap Auto-Scan] Queueing background alignment scan on: ${folder}`);
      // Perform non-blocking async alignment scan
      setTimeout(async () => {
        try {
          const pptFiles = scanFolderRecursive(folder);
          for (const file of pptFiles) {
            await indexSingleFile(file); // Only processes if SHA changes
          }
          // Enable background file system watcher
          setupWatcherForFolder(folder);
        } catch (err) {
          console.error(`Bootstrap alignment failed for path ${folder}`, err);
        }
      }, 100);
    } else {
      console.warn(`Configured monitored directory no longer exists on disk: ${folder}. Skipping.`);
    }
  }

  // Start periodic background auto-sync & reconciliation
  startPeriodicSync();
}

// Reconcile database records with actual physical files on disk
export async function reconcileMonitoredFolders(): Promise<void> {
  const cfg = loadConfig();
  const db = getDatabase();
  
  for (const folder of cfg.monitoredFolders) {
    if (!fs.existsSync(folder)) {
      continue;
    }
    
    // 1. Scan actual files on physical disk
    const physicalFiles = scanFolderRecursive(folder);
    const physicalFilesSet = new Set(physicalFiles);

    // 2. Discover newly added or modified files (hash changed or missing from DB)
    for (const file of physicalFiles) {
      try {
        if (!fs.existsSync(file)) continue;
        const fileHash = generateFileHash(file);
        const existing = db.documents[file];
        
        if (!existing || existing.sha256 !== fileHash) {
          // Double check to avoid parallel scanning of the exact same file
          if (!indexingProgress[file]) {
            console.log(`[Auto-Sync] Found new/modified ppt file: ${path.basename(file)}. Indexing...`);
            indexSingleFile(file).catch(err => {
              console.error(`[Auto-Sync] Async index failed for ${file}:`, err);
            });
          }
        }
      } catch (err) {
        console.error(`[Auto-Sync] Error checking individual file: ${file}`, err);
      }
    }

    // 3. Clean up deleted files (files in DB starting with the folder path but no longer on disk) - with cross-platform slash matching
    const dbPaths = Object.keys(db.documents);
    for (const dbPath of dbPaths) {
      const stdDbPath = dbPath.replace(/\\/g, "/").toLowerCase();
      const stdFolder = folder.replace(/\\/g, "/").toLowerCase();
      if (stdDbPath.startsWith(stdFolder)) {
        if (!physicalFilesSet.has(dbPath) || !fs.existsSync(dbPath)) {
          console.log(`[Auto-Sync] Detected deleted file in monitored directory: ${path.basename(dbPath)}. Removing from indices...`);
          removeDocument(dbPath);
        }
      }
    }
  }
}

// Background periodic sync timer
let syncInterval: NodeJS.Timeout | null = null;

export function startPeriodicSync(intervalMs = 8000) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  syncInterval = setInterval(async () => {
    try {
      await reconcileMonitoredFolders();
    } catch (err) {
      console.error("[Periodic Auto-Sync Error]", err);
    }
  }, intervalMs);
  console.log(`[Auto-Sync] Background reconciliation service started (interval: ${intervalMs}ms)`);
}

// Debounced file indexes to avoid multi-write event lockouts
const debouncedIndexTimers: { [filePath: string]: NodeJS.Timeout } = {};

// Watch events on monitored folders and run hot sync
export function setupWatcherForFolder(folderPath: string): void {
  if (watchers[folderPath]) {
    try {
      watchers[folderPath].close();
    } catch {}
  }

  console.log(`[chokidar] Initiating structural watcher for path: ${folderPath}`);

  const watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    ignoreInitial: true,
    persistent: true,
    depth: undefined // infinite nested traversal
  });

  watcher.on("add", (filePath) => {
    if (filePath.endsWith(".pptx") || filePath.endsWith(".ppt")) {
      console.log(`[File Watch Event] Added PPT draft detected: ${path.basename(filePath)}`);
      triggerDebouncedIndex(filePath);
    }
  });

  watcher.on("change", (filePath) => {
    if (filePath.endsWith(".pptx") || filePath.endsWith(".ppt")) {
      console.log(`[File Watch Event] Document edit detected: ${path.basename(filePath)}`);
      triggerDebouncedIndex(filePath);
    }
  });

  watcher.on("unlink", (filePath) => {
    if (filePath.endsWith(".pptx") || filePath.endsWith(".ppt")) {
      console.log(`[File Watch Event] Document deletion: removing from active databases: ${path.basename(filePath)}`);
      removeDocument(filePath);
    }
  });

  watchers[folderPath] = watcher;
}

function triggerDebouncedIndex(filePath: string) {
  if (debouncedIndexTimers[filePath]) {
    clearTimeout(debouncedIndexTimers[filePath]);
  }
  // Debounce 3 seconds
  debouncedIndexTimers[filePath] = setTimeout(async () => {
    try {
      await indexSingleFile(filePath, true); // force re-indexing on manual saved change
    } catch (err) {
      console.error(`Failed to process document sync updates: ${filePath}`, err);
    } finally {
      delete debouncedIndexTimers[filePath];
    }
  }, 3000);
}

// Stop watcher on user removal
export function stopWatcherForFolder(folderPath: string): void {
  if (watchers[folderPath]) {
    try {
      watchers[folderPath].close();
      delete watchers[folderPath];
      console.log(`[chokidar] Suspended observer on: ${folderPath}`);
    } catch (err) {
      console.error(`Error halting directory watcher for: ${folderPath}`, err);
    }
  }
}
