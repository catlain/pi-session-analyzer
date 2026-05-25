/**
 * session-analyzer 核心类型和纯函数
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { getVisibleSubagentFiles, resolveVisibleSession } from "./core-visible";

// ── 类型 ────────────────────────────────────────────────

export interface Entry {
  type: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
  parentSession?: string;
  message?: {
    role?: string;
    content?: ContentPart[] | string;
    model?: string;
    toolName?: string;
    isError?: boolean;
    customType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ContentPart {
  type: string;
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SessionSummary {
  firstMsg: string;
  editCount: number;
  writeCount: number;
  filesEdited: string[];
  toolStats: Record<string, { calls: number; errors: number }>;
}

export interface SessionInfo {
  sessionId: string;
  filepath: string;
  startTime: string;
  model: string;
  firstMsg: string;
  editCount: number;
  writeCount: number;
  filesEdited: string[];
  status: string;
  userMsgCount: number;
  assistantMsgCount: number;
  toolCallCount: number;
}

// ── 纯函数 ──────────────────────────────────────────────

export function getSessionDir(): string {
  return join(homedir(), ".pi", "agent", "sessions");
}

export function parseSessionId(filepath: string): string {
  const name = basename(filepath);
  const idx = name.indexOf("_");
  if (idx === -1) return name.replace(/\.jsonl$/, "");
  return name.slice(idx + 1).replace(/\.jsonl$/, "");
}

export function fmtTime(tsStr: string): string {
  if (!tsStr) return "?";
  try {
    const d = new Date(tsStr);
    if (isNaN(d.getTime())) return tsStr.slice(0, 19);
    const bj = new Date(d.getTime() + 8 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
  } catch {
    return tsStr.slice(0, 19);
  }
}

export function extractText(content?: ContentPart[] | string): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join(" ");
}
export function readJsonl(text: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // skip
    }
  }
  return entries;
}
export function extractSummary(entries: Entry[]): SessionSummary {
  const result: SessionSummary = {
    firstMsg: "",
    editCount: 0,
    writeCount: 0,
    filesEdited: [],
    toolStats: {},
  };
  const filesSet = new Set<string>();

  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const content = entry.message.content;

    if (!result.firstMsg && entry.message.role === "user") {
      const text = extractText(content);
      if (text) result.firstMsg = text.slice(0, 120);
    }

    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type === "toolCall" && part.name) {
        const name = part.name;
        if (!result.toolStats[name]) {
          result.toolStats[name] = { calls: 0, errors: 0 };
        }
        result.toolStats[name].calls += 1;
        if (name === "edit" || name === "write") {
          if (name === "edit") result.editCount++;
          if (name === "write") result.writeCount++;
          const path = String((part.arguments ?? {}).path ?? "");
          if (path) filesSet.add(path);
        }
      }
    }
  }
  result.filesEdited = [...filesSet];
  return result;
}
export function extractTimestamp(filepath: string): string {
  const name = basename(filepath);
  const idx = name.indexOf("_");
  if (idx === -1) return "";
  const raw = name.slice(0, idx);
  const tIdx = raw.indexOf("T");
  if (tIdx === -1) return "";
  const datePart = raw.slice(0, tIdx);
  const segs = raw.slice(tIdx + 1).split("-");
  if (segs.length < 3) return "";
  const iso = `${datePart}T${segs[0]}:${segs[1]}:${segs[2]}${segs.length >= 4 ? "." + segs[3].replace("Z", "") + "Z" : "Z"}`;
  return fmtTime(iso);
}

export function getSessionInfoFromEntries(
  entries: Entry[],
  filepath: string,
): SessionInfo {
  const summary = extractSummary(entries);

  // 从 session 事件提取真实 ID 和时间（适用于子代理 session.jsonl）
  const sessionEvent = entries.find((e) => e.type === "session");
  const sessionIdFromFile = parseSessionId(filepath);
  const realSessionId = sessionEvent?.id ?? sessionIdFromFile;
  const realStartTime = sessionEvent?.timestamp
    ? fmtTime(sessionEvent.timestamp)
    : extractTimestamp(filepath);

  const info: SessionInfo = {
    sessionId: realSessionId,
    filepath,
    startTime: realStartTime,
    model: "",
    firstMsg: summary.firstMsg,
    editCount: summary.editCount,
    writeCount: summary.writeCount,
    filesEdited: summary.filesEdited.slice(0, 5),
    status: "?",
    userMsgCount: 0,
    assistantMsgCount: 0,
    toolCallCount: 0,
  };

  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const role = entry.message.role ?? "";
    if (role === "user") info.userMsgCount++;
    if (role === "assistant") info.assistantMsgCount++;
    const content = entry.message.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "toolCall") info.toolCallCount++;
      }
    }
    if (!info.model && entry.message.model) {
      info.model = entry.message.model;
    }
  }

  if (entries.length === 0) {
    info.status = "empty";
  } else {
    const last = entries[entries.length - 1];
    if (last.type === "message" && last.message) {
      const content = last.message.content;
      info.status =
        Array.isArray(content) && content.some((p) => p.type === "toolCall")
          ? "waiting"
          : "completed";
    } else {
      info.status = "completed";
    }
  }

  return info;
}

// ── 异步 I/O ────────────────────────────────────────────

export async function getSessionFiles(sessionDir?: string): Promise<string[]> {
  const dir = sessionDir ?? getSessionDir();
  const results: string[] = [];
  let subdirs: string[];
  try {
    subdirs = await readdir(dir);
  } catch {
    return results;
  }
  for (const sub of subdirs) {
    const subPath = join(dir, sub);
    try {
      const s = await stat(subPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    let files: string[];
    try {
      files = await readdir(subPath);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith(".jsonl")) results.push(join(subPath, f));
    }
  }

  // 2. 可见模式子代理 /tmp/pi-visible-*/session.jsonl
  const visibleFiles = await getVisibleSubagentFiles();
  results.push(...visibleFiles);

  const withMtime = await Promise.all(
    results.map(async (p) => {
      try {
        return { path: p, mtime: (await stat(p)).mtimeMs };
      } catch {
        return { path: p, mtime: 0 };
      }
    }),
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return withMtime.map((x) => x.path);
}

export async function resolveSession(
  sessionId: string,
  sessionDir?: string,
): Promise<{ ok: true; filepath: string } | { ok: false; error: string }> {
  const files = await getSessionFiles(sessionDir);

  // 第一轮：按文件名匹配（主会话的 UUID 在文件名中）
  const byName = files.filter((f) => f.includes(sessionId));
  if (byName.length === 1) return { ok: true, filepath: byName[0] };
  if (byName.length > 1) {
    const ids = byName.map((f) => parseSessionId(f));
    return { ok: false, error: `前缀 "${sessionId}" 匹配到 ${byName.length} 个会话，请指定完整 ID:\n${ids.join("\n")}` };
  }

  // 第二轮：按内容首行 session ID 匹配（可见模式子代理 session.jsonl）
  const visibleFiles = files.filter((f) => basename(f) === "session.jsonl");
  const found = await resolveVisibleSession(sessionId, visibleFiles);
  if (found) return { ok: true, filepath: found };

  return { ok: false, error: `未找到会话: ${sessionId}` };
}

export async function readJsonlFile(filepath: string): Promise<Entry[]> {
  try {
    return readJsonl(await readFile(filepath, "utf-8"));
  } catch {
    return [];
  }
}
