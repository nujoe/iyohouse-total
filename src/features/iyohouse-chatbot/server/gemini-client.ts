import type { GeminiModelClient } from "./types";

type GeminiClientOptions = {
  apiKey: string;
  model?: string;
  thinkingLevel?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class GeminiClient implements GeminiModelClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly thinkingLevel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor({
    apiKey,
    model = "gemini-3-flash-preview",
    thinkingLevel = "low",
    baseUrl = "https://generativelanguage.googleapis.com/v1beta",
    timeoutMs = 60000,
  }: GeminiClientOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.thinkingLevel = thinkingLevel;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async generateContent({ systemInstruction, contents, tools }: Parameters<GeminiModelClient["generateContent"]>[0]) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }

    const body: Record<string, unknown> = {
      contents,
      tools,
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (this.thinkingLevel) {
      body.generationConfig = {
        thinkingConfig: {
          thinkingLevel: this.thinkingLevel,
        },
      };
    }

    const response = await fetch(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    return { parts, raw: data };
  }
}
