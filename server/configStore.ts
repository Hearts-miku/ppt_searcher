import fs from "fs";
import path from "path";
import os from "os";
import { Settings } from "../src/types";

let currentConfigPath = "";

function resolveConfigPath(): string {
  if (currentConfigPath) return currentConfigPath;

  // Try creating a directory in home
  const homeDir = os.homedir();
  const dirPath = path.join(homeDir, ".ppt_searcher");
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    currentConfigPath = path.join(dirPath, "config.json");
    // Test write permission
    fs.writeFileSync(path.join(dirPath, ".write_test"), "ok");
    fs.unlinkSync(path.join(dirPath, ".write_test"));
  } catch (err) {
    // Fail-safe to workspace local
    console.warn("Home folder is not writable. Falling back to local workspace repository", err);
    const localDirPath = path.join(process.cwd(), ".ppt_searcher");
    if (!fs.existsSync(localDirPath)) {
      fs.mkdirSync(localDirPath, { recursive: true });
    }
    currentConfigPath = path.join(localDirPath, "config.json");
  }

  return currentConfigPath;
}

export interface StoredConfig {
  settings: Settings;
  monitoredFolders: string[];
}

const DEFAULT_CONFIG: StoredConfig = {
  settings: {
    provider: "gemini",
    apiKey: process.env.GEMINI_API_KEY || "",
    customEndpoint: "",
    modelName: "gemini-3.5-flash",
    embeddingMode: "offline",
    embeddingModelName: "gemini-embedding-2-preview"
  },
  monitoredFolders: []
};

export function loadConfig(): StoredConfig {
  const file = resolveConfigPath();
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw) as StoredConfig;
      // Sync environment key if config is empty
      if (!parsed.settings.apiKey && process.env.GEMINI_API_KEY) {
        parsed.settings.apiKey = process.env.GEMINI_API_KEY;
      }
      return parsed;
    }
  } catch (err) {
    console.error("Failed to load config, writing defaults.", err);
  }

  // Save the default config back
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

export function saveConfig(cfg: StoredConfig): void {
  const file = resolveConfigPath();
  try {
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write configurations to local database files.", err);
  }
}
