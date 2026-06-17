export interface Settings {
  provider: 'gemini' | 'openai' | 'deepseek' | 'ollama' | 'local';
  apiKey: string;
  customEndpoint: string;
  modelName: string;
  embeddingMode: 'offline' | 'online';
  embeddingModelName?: string;
}

export interface FileNode {
  name: string;
  type: 'directory' | 'file';
  absolutePath: string;
  size?: string;
  lastModified?: string;
  isMonitored?: boolean;
}

export interface SlideItem {
  id: string; // unique page identification: filePath + "#" + slideIndex
  documentName: string;
  filePath: string;
  slideIndex: number;
  title: string;
  text: string;
  note: string;
  score?: number; // Optional similarity index OR fused score
  vectorSimilarity?: number; // Dense cosine similarity percentage
  textRelevanceBM25?: number; // Sparse BM25 keyword score
  highlights?: string[]; // Query matching snippets
}

export interface SearchResult {
  done: boolean;
  query: string;
  vectorWeight?: number;
  fusionMethod?: string;
  aiSummary: string;
  slides: SlideItem[];
}

export interface MonitoredFolder {
  path: string;
  addedAt: string;
  filesCount: number;
}
