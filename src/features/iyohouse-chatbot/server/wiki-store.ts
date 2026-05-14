import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ChatbotPage, ChatbotPageSummary, WikiToolDeclaration, WikiToolResult } from "./types";

const APPROVED_STATUSES = new Set(["published", "reviewed"]);
const ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/이요\s*하우스/gi, "이요하우스"],
  [/iyohouse/gi, "이요하우스"],
  [/개요/g, "소개"],
  [/뭐\s*하는\s*곳/g, "소개"],
  [/어떤\s*곳/g, "소개"],
  [/다음\s*번/g, "다음"],
  [/다음\s*주/g, "다음주"],
];

type WikiDefaults = {
  defaultVisibility?: string;
  defaultStatus?: string;
  defaultCategory?: string;
};

export async function loadPages(contentDir: string, metadataPath?: string) {
  const files = await listMarkdownFiles(contentDir);
  const metadata = await loadMetadataIndex(metadataPath);
  const pages: ChatbotPage[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const parsed = parsePage(raw);
    const externalMetadata = metadata.get(fileKey(file)) || metadata.get(String(parsed.frontmatter.slug || ""));
    pages.push({
      ...externalMetadata,
      ...parsed.frontmatter,
      body: parsed.body,
      file,
      url: externalMetadata?.url,
    });
  }

  return sortPages(pages);
}

export async function loadPagesFromWikiApi(wikiUrl: string, metadataPath?: string, options: WikiDefaults = {}) {
  const baseUrl = String(wikiUrl || "").replace(/\/+$/, "");
  const metadata = await loadMetadataIndex(metadataPath);
  const index = await fetchJson<{ pages?: Array<{ title?: string; redirect_target?: string; url?: string; modified_at?: unknown }> }>(
    `${baseUrl}/api/all`
  );
  const apiPages = Array.isArray(index.pages) ? index.pages : [];
  const pages: ChatbotPage[] = [];

  for (const item of apiPages) {
    const wikiTitle = String(item.title || "").trim();
    if (!wikiTitle || item.redirect_target) continue;

    const document = await fetchJson<{
      content?: string;
      modified_at?: unknown;
      url?: string;
    }>(`${baseUrl}/api/wiki/${encodeWikiTitle(wikiTitle)}`);
    const parsed = parsePage(String(document.content || ""));
    const pageUrl = document.url || item.url || `${baseUrl}/wiki/${encodeWikiTitle(wikiTitle)}`;
    const externalMetadata =
      metadata.get(wikiTitle) ||
      metadata.get(String(parsed.frontmatter.slug || "")) ||
      metadata.get(`${wikiTitle.replaceAll("/", "--")}.txt`);
    const fallbackMetadata = buildWikiApiFallbackMetadata({
      wikiTitle,
      body: parsed.body,
      modifiedAt: document.modified_at || item.modified_at,
      pageUrl,
      baseUrl,
      options,
    });

    pages.push({
      ...fallbackMetadata,
      ...externalMetadata,
      ...parsed.frontmatter,
      body: parsed.body,
      file: pageUrl,
      url: parsed.frontmatter.url || externalMetadata?.url || fallbackMetadata.url,
      wikiTitle,
    });
  }

  return sortPages(pages);
}

export function filterAnswerablePages(pages: ChatbotPage[]) {
  return pages.filter((page) => page.visibility === "public" && APPROVED_STATUSES.has(String(page.status || "")));
}

export function buildPublicCatalog(pages: ChatbotPage[], limit = 20) {
  return filterAnswerablePages(pages)
    .slice(0, limit)
    .map((page) => ({
      title: page.title,
      slug: page.slug,
      category: page.category,
      summary: page.summary,
    }));
}

export function selectPreloadPage(question: string, pages: ChatbotPage[]) {
  const publicPages = filterAnswerablePages(pages);
  const normalizedQuestion = normalize(question);
  const queryTokens = tokenize(question);
  const scored = publicPages
    .map((page) => ({
      page,
      score: scorePage(page, normalizedQuestion, queryTokens),
    }))
    .filter((entry) => entry.score >= 10)
    .sort((a, b) => b.score - a.score || String(a.page.slug).localeCompare(String(b.page.slug)));

  return scored[0]?.page || null;
}

export function createWikiTools(pages: ChatbotPage[]) {
  const publicPages = filterAnswerablePages(pages);
  const pageBySlug = new Map(publicPages.map((page) => [String(page.slug), page]));

  return {
    declarations: [
      {
        name: "wiki_search",
        description:
          "Search approved public iyohouse wiki pages. Use this before answering factual questions when you do not know the exact slug.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Natural language search query in Korean or English.",
            },
            limit: {
              type: "integer",
              description: "Maximum number of public page summaries to return, from 1 to 10.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "wiki_read",
        description:
          "Read one approved public iyohouse wiki page by slug. Internal, draft, and stale pages are never returned.",
        parameters: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "The public wiki page slug, for example about/iyohouse.",
            },
          },
          required: ["slug"],
        },
      },
      {
        name: "wiki_list",
        description:
          "List approved public wiki page summaries, optionally filtered by category. Use this to orient yourself before choosing pages to read.",
        parameters: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Optional category name to filter by.",
            },
            limit: {
              type: "integer",
              description: "Maximum number of public page summaries to return, from 1 to 20.",
            },
          },
        },
      },
    ] satisfies WikiToolDeclaration[],
    execute(name: string, args: Record<string, unknown> = {}): WikiToolResult {
      if (name === "wiki_search") return searchPublicPages(publicPages, args);
      if (name === "wiki_read") return readPublicPage(pageBySlug, args);
      if (name === "wiki_list") return listPublicPages(publicPages, args);
      return { ok: false, error: "unknown_tool", tool: name };
    },
  };
}

export function parsePage(raw: string) {
  if (!raw.startsWith("---")) {
    return { frontmatter: {} as Partial<ChatbotPage>, body: raw.trim() };
  }

  const closingIndex = raw.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return { frontmatter: {} as Partial<ChatbotPage>, body: raw.trim() };
  }

  const frontmatterText = raw.slice(3, closingIndex).trim();
  const body = raw.slice(closingIndex + 4).trim();
  return {
    frontmatter: parseFrontmatter(frontmatterText),
    body,
  };
}

export async function loadMetadataIndex(metadataPath?: string) {
  const index = new Map<string, Partial<ChatbotPage>>();
  if (!metadataPath) return index;

  let raw: string;
  try {
    raw = await readFile(metadataPath, "utf8");
  } catch {
    return index;
  }

  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : parsed.pages || [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const metadata = { ...(entry as ChatbotPage) };
    delete metadata.file;
    delete metadata.wikiTitle;

    for (const key of [entry.slug, entry.file, entry.wikiTitle]) {
      if (key) index.set(String(key), metadata);
    }
  }

  return index;
}

function searchPublicPages(pages: ChatbotPage[], args: Record<string, unknown>): WikiToolResult {
  const query = String(args.query || "").trim();
  const limit = clamp(Number(args.limit || 5), 1, 10);
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);

  if (!queryTokens.length) {
    return {
      ok: true,
      results: pages.slice(0, limit).map(toSummary),
    };
  }

  const results = pages
    .map((page) => ({
      page,
      score: scorePage(page, normalizedQuery, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.page.slug).localeCompare(String(b.page.slug)))
    .slice(0, limit)
    .map((entry) => toSummary(entry.page));

  return { ok: true, results };
}

function readPublicPage(pageBySlug: Map<string, ChatbotPage>, args: Record<string, unknown>): WikiToolResult {
  const slug = String(args.slug || "").trim();
  const page = pageBySlug.get(slug);

  if (!page) {
    return {
      ok: false,
      error: "not_found_or_not_public",
      slug,
    };
  }

  return {
    ok: true,
    page: {
      ...toSummary(page),
      body: page.body,
    },
  };
}

function listPublicPages(pages: ChatbotPage[], args: Record<string, unknown>): WikiToolResult {
  const category = String(args.category || "").trim();
  const limit = clamp(Number(args.limit || 10), 1, 20);
  const normalizedCategory = normalize(category);
  const filtered = normalizedCategory ? pages.filter((page) => normalize(page.category) === normalizedCategory) : pages;

  return {
    ok: true,
    results: filtered.slice(0, limit).map(toSummary),
  };
}

export function toSummary(page: ChatbotPage): ChatbotPageSummary {
  return {
    title: page.title,
    slug: page.slug,
    category: page.category,
    status: page.status,
    last_reviewed_at: page.last_reviewed_at,
    summary: page.summary,
    url: page.url,
  };
}

function scorePage(page: ChatbotPage, normalizedQuery: string, queryTokens: string[]) {
  const title = normalize(page.title);
  const slug = normalize(page.slug);
  const category = normalize(page.category);
  const summary = normalize(page.summary);
  const body = normalize(page.body);
  const aliases = aliasesForPage(page).map((alias) => normalize(alias));
  let score = 0;

  if (title && normalizedQuery.includes(title)) score += 12;
  if (slug && normalizedQuery.includes(slug)) score += 10;
  if (summary && summary.includes(normalizedQuery)) score += 8;
  for (const alias of aliases) {
    if (alias && normalizedQuery.includes(alias)) score += 6;
  }

  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (title.includes(token)) score += 6;
    if (slug.includes(token)) score += 5;
    if (category.includes(token)) score += 4;
    if (summary.includes(token)) score += 3;
    if (aliases.some((alias) => alias.includes(token))) score += 4;
    if (body.includes(token)) score += 1;
  }

  return score;
}

function aliasesForPage(page: ChatbotPage) {
  const slug = String(page.slug || "");
  const category = String(page.category || "");
  const title = String(page.title || "");
  const aliases = [title, slug, category];

  if (slug === "about/iyohouse" || title.includes("이요하우스")) {
    aliases.push("iyohouse", "이요하우스", "이요 하우스", "소개", "개요", "뭐하는 곳", "어떤 곳");
  }
  if (slug.startsWith("workshops/") || category.includes("워크숍") || title.includes("워크숍")) {
    aliases.push("워크숍", "일정", "행사", "다음 워크숍", "다음주", "언제");
  }
  if (slug.startsWith("participation/") || category.includes("참여")) {
    aliases.push("참여", "방문", "신청", "처음", "문의", "어떻게");
  }
  if (slug.startsWith("members/") || category.includes("멤버")) {
    aliases.push("멤버", "구성원", "누구", "사람", "역할");
  }
  if (slug.startsWith("activities/") || category.includes("활동")) {
    aliases.push("활동", "현재", "지금", "프로젝트", "작업");
  }
  if (slug.startsWith("philosophy/") || category.includes("철학")) {
    aliases.push("철학", "원칙", "가치", "방향");
  }

  return aliases.filter(Boolean);
}

function parseFrontmatter(text: string): Partial<ChatbotPage> {
  const metadata: Record<string, unknown> = {};

  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    metadata[key] = parseValue(rawValue);
  }

  return metadata as Partial<ChatbotPage>;
}

function parseValue(rawValue: string) {
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }

  if (
    (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue.slice(1, -1);
    }
  }

  return rawValue;
}

function buildWikiApiFallbackMetadata({
  wikiTitle,
  body,
  modifiedAt,
  pageUrl,
  baseUrl,
  options,
}: {
  wikiTitle: string;
  body: string;
  modifiedAt: unknown;
  pageUrl: string;
  baseUrl: string;
  options: WikiDefaults;
}): ChatbotPage {
  const metadata: ChatbotPage = {
    title: wikiTitle,
    slug: wikiTitle,
    category: options.defaultCategory || "wiki",
    summary: extractSummary(body),
    last_reviewed_at: modifiedAtToDate(modifiedAt),
    source_refs: [baseUrl],
    url: pageUrl,
  };

  if (options.defaultVisibility) metadata.visibility = options.defaultVisibility;
  if (options.defaultStatus) metadata.status = options.defaultStatus;

  return metadata;
}

function extractSummary(body: string) {
  const line = String(body || "")
    .split(/\r?\n/)
    .map((entry) => cleanMarkdown(entry))
    .find((entry) => entry && !entry.startsWith("#") && !entry.startsWith("-"));

  return truncate(line || "", 160);
}

function cleanMarkdown(value: string) {
  return String(value || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function modifiedAtToDate(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if ([".md", ".txt"].includes(extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) {
    throw new Error(`Wiki API request failed: ${response.status} ${url}`);
  }
  return response.json() as Promise<T>;
}

function encodeWikiTitle(title: string) {
  return title
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function sortPages(pages: ChatbotPage[]) {
  return pages.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

function fileKey(file: string) {
  return basename(file);
}

function normalize(value: unknown) {
  let normalized = String(value || "").toLowerCase();
  for (const [pattern, replacement] of ALIAS_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}/-]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
