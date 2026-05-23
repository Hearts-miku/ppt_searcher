import { GoogleGenAI } from "@google/genai";
import { Settings } from "../src/types";

// Tokenizer utility for fallback search index
export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  const cleanText = text.toLowerCase();

  // English words and numbers
  const enMatches = cleanText.match(/[a-z0-9]+/g) || [];
  tokens.push(...enMatches);

  // Chinese characters and bigrams
  const cnChars = cleanText.match(/[\u4e00-\u9fa5]/g) || [];
  if (cnChars.length > 0) {
    tokens.push(...cnChars);
    // Add bigrams for high-accuracy contextual Chinese match
    for (let i = 0; i < cnChars.length - 1; i++) {
      tokens.push(cnChars[i] + cnChars[i + 1]);
    }
  }

  return tokens;
}

// Convert string into a simple term vector
export function getLocalVector(text: string, vocab: string[]): number[] {
  const tokens = tokenize(text);
  const vector = new Array(vocab.length).fill(0);
  const tokenCounts: { [key: string]: number } = {};
  
  tokens.forEach(tok => {
    tokenCounts[tok] = (tokenCounts[tok] || 0) + 1;
  });

  vocab.forEach((term, idx) => {
    if (tokenCounts[term]) {
      // Basic log-frequency weighting
      vector[idx] = 1 + Math.log(tokenCounts[term]);
    }
  });

  // L2 normalization to make dot product translate to cosine similarity
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  if (sumSq > 0) {
    const norm = Math.sqrt(sumSq);
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

export async function computeEmbedding(text: string, settings: Settings): Promise<number[]> {
  const mode = settings.embeddingMode;
  
  // If explicitly offline, generate simple hash or return high-dimensional vocabulary term index
  if (mode === "offline" || !settings.apiKey) {
    // Generate a pseudo-embedding vector of 768 dimensions based on hash seeds
    // This maintains structure matching double[] requirements but uses stable text hashes
    const vector = new Array(768).fill(0);
    const words = tokenize(text);
    if (words.length === 0) return vector;

    words.forEach(word => {
      // Standard stable string hash
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 31 + word.charCodeAt(i)) | 0;
      }
      // Distribute weight in 768 dimensions
      const index = Math.abs(hash) % 768;
      vector[index] += 1;
    });

    // L2 normalized
    const sq = vector.reduce((acc, val) => acc + val * val, 0);
    if (sq > 0) {
      const norm = Math.sqrt(sq);
      return vector.map(v => v / norm);
    }
    return vector;
  }

  // Else, use online provider
  if (settings.provider === "gemini") {
    const ai = new GoogleGenAI({
      apiKey: settings.apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const model = settings.embeddingModelName || "gemini-embedding-2-preview";
    const response = await ai.models.embedContent({
      model: model,
      contents: text
    }) as any;

    if (response?.embedding?.values) {
      return response.embedding.values;
    }
    if (response?.embeddings?.[0]?.values) {
      return response.embeddings[0].values;
    }
    throw new Error("Unable to retrieve embeddings from Gemini API response");
  }

  // Custom endpoints (OpenAI or DeepSeek-compatible endpoints)
  const endpoint = settings.customEndpoint || (settings.provider === "deepseek" ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1");
  const model = settings.embeddingModelName || "text-embedding-3-small";

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: model
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Embedding provider returned status ${res.status}: ${errText}`);
    }

    const json = await res.json() as any;
    const values = json?.data?.[0]?.embedding;
    if (Array.isArray(values)) {
      return values;
    }
    throw new Error("Embedding payload format mismatch");
  } catch (err: any) {
    console.warn("Retrying embedding calculation natively due to external failure", err.message);
    return computeEmbedding(text, { ...settings, embeddingMode: "offline" });
  }
}

export async function askAI(prompt: string, context: string, settings: Settings): Promise<string> {
  const defaultPrompt = `你是一个PPT文件智能助手。请根据以下提取的幻灯片内容来回答用户的问题。如果内容里没有合适答案，可以结合你的常识做出合理解释或提示用户在哪些文件里或许更合适找寻。建议排版优雅、详尽科学。
用户问题：${prompt}

可供参考的幻灯片片段：
${context}`;

  if (settings.embeddingMode === "offline" || !settings.apiKey) {
    return `[100% 本地离线分析中] 您尚未配置或激活 API 密钥。系统当前运行于安全沙盒离线阶段。以下为本地关键词语义关联排查出的幻灯片要点建议：
  
  检索匹配到的主要章节：
  ${context.split("\n\n").map((part, index) => `${index + 1}. ${part.split("\n")[0] || ""}`).join("\n")}
  
  如果您已完成 API 供应商高级配置，我们将自动为您连接 ${settings.provider === "gemini" ? "Google Gemini 3.5-Flash" : settings.provider} 大模型来解答汇总本页！`;
  }

  if (settings.provider === "gemini") {
    try {
      const ai = new GoogleGenAI({
        apiKey: settings.apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: defaultPrompt
      });

      return response.text || "无法生成大模型总结。";
    } catch (err: any) {
      return `【大语言模型总结调用发生异常】\n原因：${err.message}\n您可以到右上角设置修改API Key或网络节点。`;
    }
  }

  // Standard chat completions for OpenAI-Compatible providers (DeepSeek, Custom endpoints, Ollama, etc.)
  const endpoint = settings.customEndpoint || (settings.provider === "deepseek" ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1");
  const model = settings.modelName || (settings.provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: "You are an expert slides search analyst." },
          { role: "user", content: defaultPrompt }
        ],
        temperature: 0.7
      })
    });

    if (!res.ok) {
      throw new Error(`Chat completions returned status ${res.status}`);
    }

    const data = await res.json() as any;
    return data?.choices?.[0]?.message?.content || "API未返回有效文本内容。";
  } catch (err: any) {
    return `配置的大模型厂商返回了连接错误: ${err.message}`;
  }
}
