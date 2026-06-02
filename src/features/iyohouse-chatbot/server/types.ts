export type ChatbotPage = {
  title?: string;
  slug?: string;
  category?: string;
  visibility?: string;
  status?: string;
  last_reviewed_at?: string;
  owner?: string;
  summary?: string;
  source_refs?: string[];
  body?: string;
  file?: string;
  url?: string;
  wikiTitle?: string;
};

export type ChatbotPageSummary = {
  title?: string;
  slug?: string;
  category?: string;
  status?: string;
  last_reviewed_at?: string;
  summary?: string;
  url?: string;
};

export type GeminiPart = {
  text?: string;
  thought?: string;
  thoughtSignature?: string;
  thought_signature?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: unknown;
  };
};

export type GeminiModelClient = {
  generateContent(request: {
    systemInstruction?: string;
    contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }>;
    tools?: Array<{ functionDeclarations: WikiToolDeclaration[] }>;
  }): Promise<{ parts: GeminiPart[]; raw?: unknown }>;
};

export type WikiToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type WikiToolResult =
  | {
      ok: true;
      page?: ChatbotPageSummary & { body?: string };
      results?: ChatbotPageSummary[];
    }
  | {
      ok: false;
      error: string;
      slug?: string;
      tool?: string;
    };

export type AgentStep = {
  tool: string;
  args: Record<string, unknown>;
  result: WikiToolResult;
};

export type ChatbotAnswer = {
  mode: "gemini-agent";
  answer: string;
  sources: ChatbotPageSummary[];
  steps: AgentStep[];
  trace?: unknown;
};
