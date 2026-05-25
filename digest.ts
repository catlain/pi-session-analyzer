/**
 * session_analyze digest 模式 — 提取 user/assistant 文本对话序列
 *
 * 用于判断会话内容是否值得记录到记忆系统。
 * 纯程序提取，零 LLM 成本。
 */

import { truncatedResult } from "@pi-atelier/shared-utils";
import { type Entry, fmtTime } from "./core";

/** 提取所有 user/assistant 文本消息，按序列出 */
export function doDigest(entries: Entry[]) {
  const lines: string[] = [];
  let idx = 0;

  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const role = entry.message.role ?? "";
    if (role !== "user" && role !== "assistant") continue;

    const content = entry.message.content;
    let text: string;

    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      // assistant 消息可能混合 text + toolCall，只取 text 部分
      const texts = content
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text!);
      text = texts.join("\n");
    } else {
      continue;
    }

    // 跳过空消息
    const trimmed = text.trim();
    if (!trimmed) continue;

    idx++;
    const time = entry.timestamp ? fmtTime(entry.timestamp) : "";
    const label = role === "user" ? "👤" : "🤖";

    // assistant 消息截断到 300 字（够判断主题，不浪费 token）
    // user 消息保留完整
    const display = role === "assistant" && trimmed.length > 300
      ? trimmed.slice(0, 300) + "..."
      : trimmed;

    lines.push(`${label} [${idx}] ${time}\n${display}`);
  }

  return truncatedResult(
    `会话摘要（${lines.length} 条对话）：\n\n${lines.join("\n\n")}`,
    { toolName: "session_analyze", label: "digest" },
  );
}
