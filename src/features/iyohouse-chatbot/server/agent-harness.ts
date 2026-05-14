import { OUTPUT_FORMAT_INSTRUCTION } from "./prompts/output-format";
import { SYSTEM_INSTRUCTION } from "./prompts/system-instruction";
import {
  buildPublicCatalog,
  createWikiTools,
  selectPreloadPage,
} from "./wiki-store";
import type { AgentStep, ChatbotAnswer, ChatbotPage, ChatbotPageSummary, GeminiModelClient, GeminiPart } from "./types";

const FULL_SYSTEM_INSTRUCTION = `${SYSTEM_INSTRUCTION}

${OUTPUT_FORMAT_INSTRUCTION}`;

type RunWikiAgentOptions = {
  question: string;
  pages: ChatbotPage[];
  model: GeminiModelClient;
  maxTurns?: number;
  includeTrace?: boolean;
  includeCatalog?: boolean;
  enablePreflight?: boolean;
};

type FunctionCallPart = GeminiPart & {
  functionCall: {
    name: string;
    args?: Record<string, unknown>;
  };
};

export async function runWikiAgent({
  question,
  pages,
  model,
  maxTurns = 6,
  includeTrace = false,
  includeCatalog = true,
  enablePreflight = true,
}: RunWikiAgentOptions): Promise<ChatbotAnswer> {
  if (!model || typeof model.generateContent !== "function") {
    throw new Error("A Gemini-compatible model client is required");
  }

  const wikiTools = createWikiTools(pages);
  const catalog = includeCatalog ? buildPublicCatalog(pages) : [];
  const preloadedPage = enablePreflight ? selectPreloadPage(question, pages) : null;
  const preflightStep: AgentStep | null = preloadedPage
    ? {
        tool: "preload_page",
        args: { question, slug: preloadedPage.slug },
        result: {
          ok: true,
          page: {
            title: preloadedPage.title,
            slug: preloadedPage.slug,
            category: preloadedPage.category,
            status: preloadedPage.status,
            last_reviewed_at: preloadedPage.last_reviewed_at,
            summary: preloadedPage.summary,
            body: preloadedPage.body,
            url: preloadedPage.url,
          },
        },
      }
    : null;
  const contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [
    { role: "user", parts: [{ text: buildInitialPrompt({ question, catalog, preloadedPage }) }] },
  ];
  const steps: AgentStep[] = [];
  const sources = new Map<string, ChatbotPageSummary>();
  if (preflightStep) {
    steps.push(preflightStep);
    collectSources(preflightStep.result, sources);
  }
  const tools = [{ functionDeclarations: wikiTools.declarations }];
  const trace = includeTrace
    ? {
        note:
          "Hidden model chain-of-thought is not available. This trace shows prompt inputs, tool calls, tool observations, and final text. Opaque Gemini thought signatures are redacted here but preserved when sent back to Gemini.",
        systemInstruction: FULL_SYSTEM_INSTRUCTION,
        preflight: preflightStep ? sanitizeForTrace(preflightStep) : null,
        toolDeclarations: sanitizeForTrace(wikiTools.declarations),
        turns: [] as Array<{
          turn: number;
          modelRequest: unknown;
          modelResponse: unknown;
          toolCalls: unknown[];
        }>,
      }
    : null;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const modelRequest = {
      systemInstruction: FULL_SYSTEM_INSTRUCTION,
      contents,
      tools,
    };
    const turnTrace = trace
      ? {
          turn,
          modelRequest: sanitizeForTrace(modelRequest),
          modelResponse: null as unknown,
          toolCalls: [] as unknown[],
        }
      : null;
    if (turnTrace) trace?.turns.push(turnTrace);

    const response = await model.generateContent(modelRequest);
    const parts = Array.isArray(response.parts) ? response.parts : [];
    if (turnTrace) {
      turnTrace.modelResponse = sanitizeForTrace({ parts });
    }

    const functionCallParts = parts.filter(hasFunctionCall).map(preserveFunctionCallPart);
    const functionCalls = functionCallParts.map((part) => part.functionCall);

    if (functionCalls.length === 0) {
      const answer = parts
        .map((part) => part.text || "")
        .join("")
        .trim();

      if (!answer) {
        throw new Error("Agent returned no text or tool calls");
      }

      return {
        mode: "gemini-agent",
        answer,
        sources: [...sources.values()],
        steps,
        ...(trace ? { trace } : {}),
      };
    }

    contents.push({
      role: "model",
      parts: functionCallParts,
    });

    const functionResponses = functionCalls.map((functionCall) => {
      const result = wikiTools.execute(functionCall.name, toRecord(functionCall.args));
      collectSources(result, sources);
      const step: AgentStep = {
        tool: functionCall.name,
        args: toRecord(functionCall.args),
        result,
      };
      steps.push(step);
      if (turnTrace) {
        turnTrace.toolCalls.push(sanitizeForTrace(step));
      }
      return {
        functionResponse: {
          name: functionCall.name,
          response: result,
        },
      };
    });

    contents.push({
      role: "user",
      parts: functionResponses,
    });
  }

  throw new Error("Agent did not produce a final answer before maxTurns");
}

function buildInitialPrompt({
  question,
  catalog,
  preloadedPage,
}: {
  question: string;
  catalog: Array<Pick<ChatbotPage, "title" | "slug" | "category" | "summary">>;
  preloadedPage: ChatbotPage | null;
}) {
  if (catalog.length === 0 && !preloadedPage) {
    return question;
  }

  const sections = [`User question:\n${question}`];

  if (catalog.length > 0) {
    sections.push(
      [
        "Public wiki catalog:",
        ...catalog.map((page) => `- ${page.slug} | ${page.title} | ${page.category} | ${page.summary || ""}`),
      ].join("\n")
    );
  }

  if (preloadedPage) {
    sections.push(
      [
        "Preloaded public wiki context:",
        `slug: ${preloadedPage.slug}`,
        `title: ${preloadedPage.title}`,
        `summary: ${preloadedPage.summary || ""}`,
        "body:",
        preloadedPage.body || "",
      ].join("\n")
    );
    sections.push(
      "If the preloaded context is enough, answer directly from it. Call wiki tools only if more public context is needed."
    );
  }

  return sections.join("\n\n");
}

function hasFunctionCall(part: GeminiPart): part is FunctionCallPart {
  return Boolean(part.functionCall?.name);
}

function preserveFunctionCallPart(part: FunctionCallPart): FunctionCallPart {
  const preserved: FunctionCallPart = { functionCall: part.functionCall };
  const thoughtSignature = part.thoughtSignature || part.thought_signature;

  if (thoughtSignature) {
    preserved.thoughtSignature = thoughtSignature;
  }

  return preserved;
}

function collectSources(result: AgentStep["result"], sources: Map<string, ChatbotPageSummary>) {
  if (!result || result.ok !== true) return;

  if (result.page) {
    addSource(result.page, sources);
  }

  for (const page of result.results || []) {
    addSource(page, sources);
  }
}

function addSource(page: ChatbotPageSummary, sources: Map<string, ChatbotPageSummary>) {
  if (!page || !page.slug) return;
  sources.set(page.slug, {
    title: page.title,
    slug: page.slug,
    category: page.category,
    last_reviewed_at: page.last_reviewed_at,
    url: page.url,
  });
}

function sanitizeForTrace(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForTrace(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "thought") continue;
    if (key === "thoughtSignature" || key === "thought_signature") {
      sanitized[key] = "[redacted]";
      continue;
    }
    if (key === "apiKey" || key === "geminiApiKey") {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizeForTrace(item);
  }

  return sanitized;
}

function toRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
