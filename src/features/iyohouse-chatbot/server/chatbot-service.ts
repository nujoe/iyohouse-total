import { runWikiAgent } from "./agent-harness";
import { GeminiClient } from "./gemini-client";
import { filterAnswerablePages, loadPages, loadPagesFromWikiApi, toSummary } from "./wiki-store";
import type { ChatbotPage } from "./types";

const DEFAULT_WIKI_URL = "https://dotiyo.dothome.co.kr";

type ChatbotAskBody = {
  question?: unknown;
  geminiApiKey?: unknown;
  includeTrace?: unknown;
};

export class ChatbotServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ChatbotServiceError";
    this.status = status;
  }
}

export async function getChatbotHealth() {
  const config = getChatbotServerConfig();
  const pageSource = await detectPageSource(config);

  return {
    ok: true,
    runtimeMode: "next-internal",
    llmMode: getLlmMode(config),
    model: config.geminiModel,
    thinkingLevel: config.geminiThinkingLevel,
    pageSource,
    wikiUrl: config.wikiUrl,
    contentDir: config.contentDir,
    metadataPath: config.metadataPath,
    wikiDefaults: config.wikiDefaults,
    allowClientApiKey: config.allowClientApiKey,
    requestTraceEnabled: config.enableRequestTrace,
  };
}

export async function listChatbotPages() {
  const pages = filterAnswerablePages(await loadPagesForRequest(getChatbotServerConfig()));
  return pages.map(toSummary);
}

export async function askChatbot(body: ChatbotAskBody) {
  const config = getChatbotServerConfig();
  const question = String(body.question || "").trim();
  if (!question) {
    throw new ChatbotServiceError("question is required", 400);
  }

  const requestApiKey = String(body.geminiApiKey || "").trim();
  const selectedApiKey = config.serverApiKey || (config.allowClientApiKey ? requestApiKey : "");
  if (!selectedApiKey) {
    const error = config.allowClientApiKey ? "Gemini API key is required" : "Server Gemini API key is not configured";
    throw new ChatbotServiceError(error, 400);
  }

  const pages = await loadPagesForRequest(config);
  const model = new GeminiClient({
    apiKey: selectedApiKey,
    model: config.geminiModel,
    thinkingLevel: config.geminiThinkingLevel,
  });

  return runWikiAgent({
    question,
    pages,
    model,
    includeTrace: config.enableRequestTrace && Boolean(body.includeTrace),
  });
}

function getChatbotServerConfig() {
  return {
    wikiUrl: process.env.CHATBOT_WIKI_URL || process.env.WIKI_URL || DEFAULT_WIKI_URL,
    preferWikiApi: process.env.CHATBOT_PREFER_WIKI_API !== "false",
    metadataPath: process.env.CHATBOT_WIKI_METADATA_PATH || process.env.WIKI_METADATA_PATH,
    contentDir: process.env.CHATBOT_WIKI_CONTENT_DIR || process.env.WIKI_CONTENT_DIR,
    wikiDefaults: {
      defaultVisibility: process.env.WIKI_DEFAULT_VISIBILITY || "public",
      defaultStatus: process.env.WIKI_DEFAULT_STATUS || "published",
      defaultCategory: process.env.WIKI_DEFAULT_CATEGORY || "wiki",
    },
    serverApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
    allowClientApiKey:
      process.env.CHATBOT_ALLOW_CLIENT_GEMINI_KEY !== "false" && process.env.ALLOW_CLIENT_GEMINI_KEY !== "false",
    enableRequestTrace: process.env.ENABLE_REQUEST_TRACE !== "false",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || "low",
  };
}

type ChatbotServerConfig = ReturnType<typeof getChatbotServerConfig>;

async function loadPagesForRequest(config: ChatbotServerConfig): Promise<ChatbotPage[]> {
  if (config.preferWikiApi) {
    try {
      return await loadPagesFromWikiApi(config.wikiUrl, config.metadataPath, config.wikiDefaults);
    } catch (error) {
      if (!config.contentDir) throw error;
      return loadPages(config.contentDir, config.metadataPath);
    }
  }

  if (!config.contentDir) {
    throw new ChatbotServiceError("CHATBOT_WIKI_CONTENT_DIR is required when CHATBOT_PREFER_WIKI_API=false", 500);
  }

  return loadPages(config.contentDir, config.metadataPath);
}

async function detectPageSource(config: ChatbotServerConfig) {
  if (config.preferWikiApi) {
    try {
      await loadPagesFromWikiApi(config.wikiUrl, config.metadataPath, config.wikiDefaults);
      return "wiki-api";
    } catch {
      if (!config.contentDir) return "unavailable";
      await loadPages(config.contentDir, config.metadataPath);
      return "seed-folder";
    }
  }

  if (!config.contentDir) return "unavailable";
  await loadPages(config.contentDir, config.metadataPath);
  return "seed-folder";
}

function getLlmMode(config: ChatbotServerConfig) {
  if (config.serverApiKey) return "server-key";
  if (config.allowClientApiKey) return "client-key";
  return "missing-key";
}
