/**
 * search 工具用的正则辅助函数
 */

import type { Entry } from "./core";

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 用正则匹配 entry 内容，返回匹配上下文片段 */
export function extractMatchContext(
  entry: Entry,
  regex: RegExp,
): string {
  // 确保正则有 g flag（matchAll 和手动遍历都需要）
  const gRegex = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);

  if (!entry.message) {
    const raw = JSON.stringify(entry);
    const m = gRegex.exec(raw);
    if (m) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(raw.length, m.index + m[0].length + 30);
      return raw.slice(start, end).replace(/\n/g, "↵");
    }
    return "";
  }

  const content = entry.message.content;
  const parts: string[] = [];

  if (typeof content === "string") {
    gRegex.lastIndex = 0;
    for (const m of content.matchAll(gRegex)) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(content.length, m.index + m[0].length + 40);
      parts.push(content.slice(start, end).replace(/\n/g, "↵"));
    }
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text" && part.text) {
        gRegex.lastIndex = 0;
        for (const m of part.text.matchAll(gRegex)) {
          const start = Math.max(0, m.index - 40);
          const end = Math.min(part.text.length, m.index + m[0].length + 40);
          parts.push(part.text.slice(start, end).replace(/\n/g, "↵"));
        }
      }
      if (part.type === "toolCall" && part.name) {
        const argsStr = JSON.stringify(part.arguments ?? {});
        const combined = `${part.name} ${argsStr}`;
        gRegex.lastIndex = 0;
        if (gRegex.test(combined)) {
          parts.push(`🛠 ${part.name}: ${argsStr.slice(0, 200)}`);
        }
      }
    }
  }
  return parts.join("\n");
}
