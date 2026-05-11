import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, FilePlus2, Loader2, RotateCcw, Send, SlidersHorizontal, TerminalSquare, XCircle } from "lucide-react";

import type { Block } from "@/entities/block";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";

interface AgentConversationPageProps {
  pageId: string;
}

type AgentMessageRole = "user" | "assistant";
type AgentToolStatus = "running" | "complete" | "error";

interface AgentToolEvent {
  id: string;
  name: string;
  status: AgentToolStatus;
  detail: string;
}

interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  body: string;
  createdAt: string;
  toolEvents?: AgentToolEvent[];
  createdPageId?: string;
  createdPageTitle?: string;
}

interface AgentRunSettings {
  agent: "default" | "general-purpose" | "Explore" | "Plan";
  model: "default" | "sonnet" | "opus" | "haiku";
  effort: "low" | "medium" | "high" | "xhigh";
  allowedTools: AgentToolKey[];
  mirrorCreatedPages: boolean;
}

type AgentToolKey = "app" | "status" | "workspace" | "list" | "search" | "read" | "create" | "update" | "archive";

type StreamPayload = Record<string, unknown> & {
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  toolUseId?: string;
  message?: string;
};



const AGENT_THREADS_STORAGE_KEY = "osionos:agent-conversations";
const AGENT_SETTINGS_STORAGE_KEY = "osionos:agent-settings";
const CONFIGURED_CLAUDE_BRIDGE_URL = ((import.meta.env as Record<string, string>)["VITE_OSIONOS_BRIDGE_URL"] ?? "").trim().replace(/\/$/, "");
const CLAUDE_BRIDGE_URLS = CONFIGURED_CLAUDE_BRIDGE_URL
  ? [CONFIGURED_CLAUDE_BRIDGE_URL]
  : ["http://localhost:4001", "http://localhost:4000"];
const DEFAULT_PROMPT = "Ask Claude anything, or ask it to create/update osionos pages through MCP.";

const TOOL_OPTIONS: Array<{ value: AgentToolKey; label: string }> = [
  { value: "app", label: "App map" },
  { value: "status", label: "Status" },
  { value: "workspace", label: "Workspaces" },
  { value: "list", label: "List pages" },
  { value: "search", label: "Search" },
  { value: "read", label: "Read" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "archive", label: "Archive" },
];

const DEFAULT_SETTINGS: AgentRunSettings = {
  agent: "default",
  model: "default",
  effort: "medium",
  allowedTools: ["app", "status", "workspace", "list", "search", "read", "create", "update"],
  mirrorCreatedPages: true,
};

const BLOCK_TYPES = new Set<Block["type"]>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "heading_5",
  "heading_6",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "image",
  "video",
  "audio",
  "file",
  "quote",
  "callout",
  "code",
  "equation",
  "layout",
  "column_list",
  "column",
  "divider",
  "table_block",
  "database_inline",
  "database_full_page",
]);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function readJsonStorage<TValue>(key: string, fallback: TValue): TValue {
  if (globalThis.window === undefined) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as TValue : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown) {
  if (globalThis.window === undefined) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function readThreads(): Record<string, AgentMessage[]> {
  return readJsonStorage<Record<string, AgentMessage[]>>(AGENT_THREADS_STORAGE_KEY, {});
}

function writeThread(pageId: string, messages: AgentMessage[]) {
  const threads = readThreads();
  threads[pageId] = messages;
  writeJsonStorage(AGENT_THREADS_STORAGE_KEY, threads);
}

function readSettings(pageId: string): AgentRunSettings {
  const allSettings = readJsonStorage<Record<string, AgentRunSettings>>(AGENT_SETTINGS_STORAGE_KEY, {});
  const storedSettings = allSettings[pageId];
  return storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : DEFAULT_SETTINGS;
}

function writeSettings(pageId: string, settings: AgentRunSettings) {
  const allSettings = readJsonStorage<Record<string, AgentRunSettings>>(AGENT_SETTINGS_STORAGE_KEY, {});
  allSettings[pageId] = settings;
  writeJsonStorage(AGENT_SETTINGS_STORAGE_KEY, allSettings);
}

function initialMessages(): AgentMessage[] {
  return [{
    id: createId("assistant"),
    role: "assistant",
    createdAt: nowIso(),
    body: "Claude is ready. Ask normally for conversation, or ask it to use the osionos MCP tools to work with pages.",
  }];
}

function loadMessages(pageId: string): AgentMessage[] {
  return readThreads()[pageId] ?? initialMessages();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function isBlockType(value: unknown): value is Block["type"] {
  return typeof value === "string" && BLOCK_TYPES.has(value as Block["type"]);
}

function blocksFromUnknown(value: unknown): Block[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value.map(toBlock).filter((block): block is Block => Boolean(block));
  return blocks.length ? blocks : undefined;
}

function tableDataFromUnknown(value: unknown): string[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")]);
}

function numberFromUnknown(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function layoutCellsFromUnknown(value: unknown): Block["layoutCells"] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((cell) => cell && typeof cell === "object").map((cell, index) => {
    const record = cell as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : createId("mcp-layout-cell"),
      colStart: numberFromUnknown(record.colStart, index + 1),
      colSpan: numberFromUnknown(record.colSpan, 1),
      rowStart: numberFromUnknown(record.rowStart, 1),
      rowSpan: numberFromUnknown(record.rowSpan, 1),
      label: typeof record.label === "string" ? record.label : undefined,
      blocks: blocksFromUnknown(record.blocks) ?? [],
    };
  });
}

function applyBlockCollections(block: Block, record: Record<string, unknown>) {
  const children = blocksFromUnknown(record.children);
  const tableData = tableDataFromUnknown(record.tableData);
  const layoutCells = layoutCellsFromUnknown(record.layoutCells);
  if (children) block.children = children;
  if (tableData) block.tableData = tableData;
  if (layoutCells) block.layoutCells = layoutCells;
}

function applyBlockMetadata(block: Block, record: Record<string, unknown>) {
  if (typeof record.checked === "boolean") block.checked = record.checked;
  if (typeof record.language === "string") block.language = record.language;
  if (typeof record.color === "string") block.color = record.color;
  if (typeof record.textColor === "string") block.textColor = record.textColor;
  if (typeof record.backgroundColor === "string") block.backgroundColor = record.backgroundColor;
  if (typeof record.collapsed === "boolean") block.collapsed = record.collapsed;
  if (typeof record.asset === "string") block.asset = record.asset;
  if (typeof record.databaseId === "string") block.databaseId = record.databaseId;
  if (typeof record.viewId === "string") block.viewId = record.viewId;
  if (typeof record.widthRatio === "number") block.widthRatio = record.widthRatio;
  if (typeof record.mediaWidth === "number") block.mediaWidth = record.mediaWidth;
}

function applyBlockLayoutMetadata(block: Block, record: Record<string, unknown>) {
  if (record.layoutMode === "inline" || record.layoutMode === "full_page") block.layoutMode = record.layoutMode;
  if (record.layoutConfig && typeof record.layoutConfig === "object") block.layoutConfig = record.layoutConfig as Block["layoutConfig"];
  if ([1, 2, 3, 4, 5, 6].includes(Number(record.headingLevel))) block.headingLevel = Number(record.headingLevel) as Block["headingLevel"];
}

function toBlock(value: unknown): Block | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isBlockType(record.type)) return null;
  const block: Block = {
    id: typeof record.id === "string" ? record.id : createId("mcp-block"),
    type: record.type,
    content: typeof record.content === "string" ? record.content : "",
  };
  applyBlockCollections(block, record);
  applyBlockMetadata(block, record);
  applyBlockLayoutMetadata(block, record);
  return block;
}

function fallbackBlocksFromText(text: string): Block[] {
  return text.split(/\r?\n/).filter(Boolean).map((line) => ({
    id: createId("mcp-mirror-block"),
    type: "paragraph",
    content: line,
  }));
}

function parseCreatedPageFromToolText(text: string): { externalPageId: string; title: string; content: Block[] } | null {
  try {
    const parsed = JSON.parse(text) as { created?: Record<string, unknown>; page?: Record<string, unknown> };
    const page = parsed.page ?? parsed.created;
    const rawExternalPageId = parsed.created?.id ?? page?._id;
    const rawTitle = page?.title ?? parsed.created?.title;
    const externalPageId = typeof rawExternalPageId === "string" || typeof rawExternalPageId === "number" ? String(rawExternalPageId) : "";
    const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : "Claude MCP page";
    const rawContent = Array.isArray(page?.content) ? page.content : [];
    const content = rawContent.map(toBlock).filter((item): item is Block => Boolean(item));
    return externalPageId ? { externalPageId, title, content: content.length ? content : fallbackBlocksFromText(text) } : null;
  } catch {
    return null;
  }
}

function toolDetail(name: string, input: unknown) {
  const suffix = input && typeof input === "object" && Object.keys(input).length > 0
    ? ` with ${JSON.stringify(input).slice(0, 180)}`
    : "";
  return `Running ${name}${suffix}`;
}

function resultSummary(text: string) {
  if (!text.trim()) return "Tool completed.";
  return text.replaceAll(/\s+/g, " ").slice(0, 260);
}

function upsertToolEvent(events: AgentToolEvent[] | undefined, nextEvent: AgentToolEvent) {
  const existing = events ?? [];
  return existing.some((event) => event.id === nextEvent.id)
    ? existing.map((event) => event.id === nextEvent.id ? { ...event, ...nextEvent } : event)
    : [...existing, nextEvent];
}

function updateToolEvent(events: AgentToolEvent[] | undefined, toolId: string, patch: Partial<AgentToolEvent>) {
  return (events ?? []).map((event) => event.id === toolId ? { ...event, ...patch } : event);
}

function parseSseBlock(block: string): { event: string; data: StreamPayload } | null {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  try {
    return { event: eventLine?.slice(6).trim() || "message", data: JSON.parse(dataLines.join("\n")) as StreamPayload };
  } catch {
    return null;
  }
}

async function streamClaude(body: unknown, onEvent: (event: string, data: StreamPayload) => Promise<void> | void) {
  const response = await openClaudeStream(body);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (parsed) await onEvent(parsed.event, parsed.data);
    }
  }
  const parsed = parseSseBlock(buffer);
  if (parsed) await onEvent(parsed.event, parsed.data);
}

async function openClaudeStream(body: unknown) {
  let lastError: Error | null = null;
  for (const bridgeUrl of CLAUDE_BRIDGE_URLS) {
    try {
      const response = await fetch(`${bridgeUrl}/api/agent/claude/stream`, {
        method: "POST",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok && response.body) return response;
      lastError = new Error(`Claude bridge ${bridgeUrl} returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Claude bridge ${bridgeUrl} failed.`);
    }
  }
  throw lastError ?? new Error("Claude bridge is unavailable.");
}

export const AgentConversationPage: React.FC<AgentConversationPageProps> = ({ pageId }) => {
  const page = usePageStore((state) => state.pageById(pageId));
  const addPage = usePageStore((state) => state.addPage);
  const openPage = usePageStore((state) => state.openPage);
  const updatePageTitle = usePageStore((state) => state.updatePageTitle);
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const jwt = useUserStore((state) => state.activePageJwt() ?? "");
  const workspaceId = page?.workspaceId ?? activeWorkspace?._id ?? "";
  const workspacePages = usePageStore((state) => workspaceId ? state.pages[workspaceId] ?? [] : []);
  const [draft, setDraft] = useState(DEFAULT_PROMPT);
  const [messages, setMessages] = useState<AgentMessage[]>(() => loadMessages(pageId));
  const [settings, setSettings] = useState<AgentRunSettings>(() => readSettings(pageId));
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mirroredExternalIds = useRef(new Set<string>());
  const title = page?.title || "Claude MCP agent";

  useEffect(() => {
    setMessages(loadMessages(pageId));
    setSettings(readSettings(pageId));
    setDraft(DEFAULT_PROMPT);
    mirroredExternalIds.current = new Set();
  }, [pageId]);

  useEffect(() => {
    writeThread(pageId, messages);
  }, [messages, pageId]);

  useEffect(() => {
    writeSettings(pageId, settings);
  }, [pageId, settings]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const latestCreatedPage = useMemo(() => [...messages].reverse().find((message) => message.createdPageId), [messages]);

  function patchMessage(messageId: string, patch: Partial<AgentMessage>) {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...patch } : message));
  }

  function patchAssistantText(messageId: string, body: string) {
    patchMessage(messageId, { body });
  }

  function addToolEvent(messageId: string, event: AgentToolEvent) {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, toolEvents: upsertToolEvent(message.toolEvents, event) } : message
    )));
  }

  function patchToolEvent(messageId: string, toolId: string, patch: Partial<AgentToolEvent>) {
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, toolEvents: updateToolEvent(message.toolEvents, toolId, patch) } : message
    )));
  }

  async function mirrorCreatedPage(messageId: string, text: string) {
    if (!settings.mirrorCreatedPages || !workspaceId) return;
    const created = parseCreatedPageFromToolText(text);
    if (!created || mirroredExternalIds.current.has(created.externalPageId)) return;
    mirroredExternalIds.current.add(created.externalPageId);
    const mirrored = await addPage(workspaceId, created.title, jwt, undefined, {
      icon: "icon:file-text",
      visibility: "private",
      content: created.content,
    });
    if (!mirrored) return;
    patchMessage(messageId, { createdPageId: mirrored._id, createdPageTitle: mirrored.title });
  }

  function appContext() {
    return {
      agentPageId: pageId,
      agentPageTitle: title,
      visibleWorkspaceId: workspaceId,
      visibleWorkspaceName: activeWorkspace?.name ?? "",
      visiblePageTitles: workspacePages.slice(0, 40).map((item) => item.title),
    };
  }

  async function handleStreamEvent(messageId: string, event: string, data: StreamPayload, currentText: { value: string }) {
    if (event === "delta") {
      currentText.value += data.text ?? "";
      patchAssistantText(messageId, currentText.value);
    }
    if (event === "tool" && data.id && data.name) {
      addToolEvent(messageId, { id: data.id, name: data.name, status: "running", detail: toolDetail(data.name, data.input) });
    }
    if (event === "tool_result" && data.toolUseId) {
      const text = data.text ?? "";
      patchToolEvent(messageId, data.toolUseId, { status: "complete", detail: resultSummary(text) });
      await mirrorCreatedPage(messageId, text);
    }
    if (event === "result" && !currentText.value.trim()) {
      currentText.value = data.text ?? "";
      patchAssistantText(messageId, currentText.value);
    }
    if (event === "error") {
      const message = data.message ?? "Claude bridge failed.";
      currentText.value = currentText.value || String(message);
      patchAssistantText(messageId, currentText.value);
    }
  }

  async function runAgent(prompt: string) {
    if (running || !workspaceId) return;
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) return;
    setRunning(true);
    setDraft("");

    if (title === "New agent") updatePageTitle(pageId, "Claude MCP agent");

    const userMessage: AgentMessage = { id: createId("user"), role: "user", body: cleanedPrompt, createdAt: nowIso() };
    const assistantMessage: AgentMessage = { id: createId("assistant"), role: "assistant", body: "", createdAt: nowIso(), toolEvents: [] };
    const currentText = { value: "" };
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      await streamClaude({ prompt: cleanedPrompt, ...settings, context: appContext() }, (event, data) => handleStreamEvent(assistantMessage.id, event, data, currentText));
      if (!currentText.value.trim()) patchAssistantText(assistantMessage.id, "Claude completed the request without a text response.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claude bridge failed.";
      patchAssistantText(assistantMessage.id, message);
      addToolEvent(assistantMessage.id, { id: createId("tool-error"), name: "claude-bridge", status: "error", detail: message });
    } finally {
      setRunning(false);
    }
  }

  function resetConversation() {
    setMessages(initialMessages());
  }

  function openCreatedPage(pageIdToOpen: string, pageTitle = "Claude MCP page") {
    if (!workspaceId) return;
    openPage({ id: pageIdToOpen, workspaceId, kind: "page", title: pageTitle, icon: "icon:file-text" });
  }

  function openLatestCreatedPage() {
    if (!latestCreatedPage?.createdPageId) return;
    openCreatedPage(latestCreatedPage.createdPageId, latestCreatedPage.createdPageTitle);
  }

  function patchSettings(patch: Partial<AgentRunSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function toggleTool(tool: AgentToolKey) {
    const allowedTools = settings.allowedTools.includes(tool)
      ? settings.allowedTools.filter((item) => item !== tool)
      : [...settings.allowedTools, tool];
    patchSettings({ allowedTools });
  }

  return (
    <div className="flex h-full min-w-0 bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--osio-border-default)] px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--osio-accent-soft)] text-[var(--osio-accent)]">
              <Bot size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{title}</h1>
              <p className="truncate text-xs text-[var(--osio-fg-muted)]">Claude MCP · {messages.length} messages · {settings.agent === "default" ? "default agent" : settings.agent}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {latestCreatedPage?.createdPageId ? (
              <button type="button" onClick={openLatestCreatedPage} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-3 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
                <FilePlus2 size={14} aria-hidden="true" />
                Open page
              </button>
            ) : null}
            <button type="button" onClick={resetConversation} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--osio-border-default)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" aria-label="Reset conversation" title="Reset conversation">
              <RotateCcw size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-5 py-3" aria-label="Claude agent parameters">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--osio-fg-muted)]"><SlidersHorizontal size={14} aria-hidden="true" /> Parameters</span>
            <select aria-label="Claude agent" value={settings.agent} onChange={(event) => patchSettings({ agent: event.target.value as AgentRunSettings["agent"] })} className="h-8 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 outline-none">
              <option value="default">Default agent</option>
              <option value="general-purpose">General purpose</option>
              <option value="Explore">Explore</option>
              <option value="Plan">Plan</option>
            </select>
            <select aria-label="Claude model" value={settings.model} onChange={(event) => patchSettings({ model: event.target.value as AgentRunSettings["model"] })} className="h-8 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 outline-none">
              <option value="default">Default model</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
            <select aria-label="Claude effort" value={settings.effort} onChange={(event) => patchSettings({ effort: event.target.value as AgentRunSettings["effort"] })} className="h-8 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 outline-none">
              <option value="low">Low effort</option>
              <option value="medium">Medium effort</option>
              <option value="high">High effort</option>
              <option value="xhigh">Extra high effort</option>
            </select>
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2">
              <input type="checkbox" checked={settings.mirrorCreatedPages} onChange={(event) => patchSettings({ mirrorCreatedPages: event.target.checked })} />{" "}
              Mirror pages
            </label>
          </div>
          <div className="mx-auto mt-2 flex max-w-4xl flex-wrap gap-1.5">
            {TOOL_OPTIONS.map((tool) => (
              <button key={tool.value} type="button" aria-pressed={settings.allowedTools.includes(tool.value)} data-agent-tool-toggle={tool.value} onClick={() => toggleTool(tool.value)} className="h-7 rounded-md border border-[var(--osio-border-default)] px-2 text-xs text-[var(--osio-fg-muted)] aria-pressed:border-[var(--osio-accent)] aria-pressed:bg-[var(--osio-accent-soft)] aria-pressed:text-[var(--osio-accent)] hover:bg-[var(--osio-bg-hover)]">
                {tool.label}
              </button>
            ))}
          </div>
        </section>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {messages.map((message) => (
              <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" ? (
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]"><Bot size={16} aria-hidden="true" /></span>
                ) : null}
                <div className={`max-w-[min(44rem,85%)] rounded-lg border px-3 py-2 ${message.role === "user" ? "border-[var(--osio-accent)] bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]"}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs opacity-80"><span>{message.role === "user" ? "You" : "Claude MCP"}</span><span>{formatTime(message.createdAt)}</span></div>
                  {message.body ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p> : <p className="text-sm text-[var(--osio-fg-muted)]">Claude is writing...</p>}
                  {message.toolEvents?.length ? (
                    <div className="mt-3 grid gap-2" data-agent-tool-list="true">
                      {message.toolEvents.map((event) => (
                        <div key={event.id} data-agent-tool={event.name} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2.5 py-2 text-xs text-[var(--osio-fg-muted)]">
                          <div className="mb-1 flex items-center gap-2 font-medium text-[var(--osio-fg-default)]">
                            {event.status === "running" ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                            {event.status === "complete" ? <CheckCircle2 size={13} aria-hidden="true" /> : null}
                            {event.status === "error" ? <XCircle size={13} aria-hidden="true" /> : null}
                            <span>{event.name}</span>
                          </div>
                          <p>{event.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void runAgent(draft); }} className="border-t border-[var(--osio-border-default)] p-4">
          <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-2 focus-within:border-[var(--osio-accent)]">
            <span className="mb-2 ml-1 hidden text-[var(--osio-fg-subtle)] sm:inline-flex"><TerminalSquare size={16} aria-hidden="true" /></span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void runAgent(draft);
                }
              }}
              rows={2}
              placeholder="Message Claude MCP"
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
            />
            <button type="submit" disabled={running || !draft.trim()} className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
              {running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};
