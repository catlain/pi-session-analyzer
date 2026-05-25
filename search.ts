/**
 * session_search 工具实现 — 跨会话搜索（grep/file/list）
 */

import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { truncatedResult } from "@pi-atelier/shared-utils";

// session_search 的输出阈值
const SEARCH_MAX_LINES = 500;
const SEARCH_MAX_BYTES = 20 * 1024; // 20KB

import {
  type Entry,
  extractText,
  readJsonl,
  readJsonlFile,
  getSessionFiles,
  getSessionDir,
  parseSessionId,
  extractSummary,
  extractTimestamp,
  getSessionInfoFromEntries,
} from "./core";
import { escapeRegex, extractMatchContext } from "./search-utils";

/** 尝试读取文件内容，失败返回 null */
export async function tryReadFile(fp: string): Promise<string | null> {
  try { return await readFile(fp, "utf-8"); }
  catch { return null; }
}

export async function doList(sessionDir: string, limit: number) {
  const files = await getSessionFiles(sessionDir);
  const items = files.slice(0, limit);

  const results = await Promise.all(
    items.map(async (fp) => {
      const entries = await readJsonlFile(fp);
      return getSessionInfoFromEntries(entries, fp);
    }),
  );

  const lines = results.map((info) => {
    const edited =
      info.filesEdited.length > 0
        ? ` [✎ ${info.filesEdited.map((f) => basename(f)).join(", ")}]`
        : "";
    return (
      `${info.sessionId.slice(0, 18)}  ${info.startTime}  ` +
      `${info.model.slice(0, 20)}  ${info.status}  ` +
      `${info.firstMsg.slice(0, 60)}${edited}`
    );
  });

  return truncatedResult(
    `最近 ${results.length} 个会话（共 ${files.length} 个）：\n${lines.join("\n")}`,
    { toolName: "session_search", label: "list", maxLines: SEARCH_MAX_LINES, maxBytes: SEARCH_MAX_BYTES },
  );
}

export async function doGrep(
  sessionDir: string,
  query: string,
  limit: number,
  editOnly: boolean,
) {
  if (!query) {
    return {
      content: [{ type: "text", text: "需要搜索关键词 (query 参数)" }],
    };
  }

  let regex: RegExp;
  try {
    const flags = query === query.toLowerCase() ? "gi" : "g";
    regex = new RegExp(query, flags);
  } catch {
    regex = new RegExp(escapeRegex(query), "i");
  }

  const files = await getSessionFiles(sessionDir);
  const allMatches: Array<{
    sessionId: string;
    firstMsg: string;
    matches: Array<{ lineno: number; role: string; text: string }>;
  }> = [];

  for (const fp of files) {
    if (allMatches.length >= limit) break;

    const rawText = await tryReadFile(fp);
    if (!rawText) continue;

    const lines = rawText.split("\n");
    const sessionEntries: Entry[] = [];
    const matches: Array<{ lineno: number; role: string; text: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let entry: Entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      sessionEntries.push(entry);

      if (editOnly) {
        if (entry.type !== "message" || !entry.message) continue;
        const content = entry.message.content;
        if (!Array.isArray(content)) continue;
        const hasEdit = content.some(
          (p) =>
            p.type === "toolCall" && (p.name === "edit" || p.name === "write"),
        );
        if (!hasEdit) continue;
      }

      const serialized = JSON.stringify(entry);
      if (!regex.test(serialized)) continue;

      const matchedText = extractMatchContext(entry, regex);
      if (matchedText) {
        matches.push({
          lineno: i + 1,
          role: entry.message?.role ?? "?",
          text: matchedText,
        });
      }
    }

    if (matches.length > 0) {
      const summary = extractSummary(sessionEntries);
      allMatches.push({
        sessionId: parseSessionId(fp),
        firstMsg: summary.firstMsg.slice(0, 60),
        matches: matches.slice(0, 5),
      });
    }
  }

  if (allMatches.length === 0) {
    return {
      content: [{ type: "text", text: `未找到匹配 "${query}" 的内容` }],
    };
  }

  const output = allMatches
    .map(
      (s) =>
        `━━━ ${s.sessionId.slice(0, 18)}  ${s.firstMsg}\n` +
        s.matches
          .map((m) => `  [${m.lineno}] ${m.role} | ${m.text.slice(0, 200)}`)
          .join("\n"),
    )
    .join("\n\n");

  return truncatedResult(
    `跨会话搜索 "${query}" — 在 ${allMatches.length} 个会话中找到匹配：\n\n${output}`,
    { toolName: "session_search", label: query, maxLines: SEARCH_MAX_LINES, maxBytes: SEARCH_MAX_BYTES },
  );
}
