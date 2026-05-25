/**
 * session-analyzer core 纯函数 — 单元测试
 *
 * 测试解析：parseSessionId, fmtTime, extractText, readJsonl,
 * extractSummary, extractTimestamp, getSessionInfoFromEntries,
 * escapeRegex, extractMatchContext
 */

import { describe, it, expect } from "vitest";
import {
  parseSessionId,
  fmtTime,
  extractText,
  readJsonl,
  extractSummary,
  extractTimestamp,
  getSessionInfoFromEntries,
} from "../core";
import { escapeRegex, extractMatchContext } from "../search-utils";

// ── parseSessionId ────────────────────────────────────────

describe("parseSessionId", () => {
  it("标准格式：20260512T170326_id123.jsonl", () => {
    expect(parseSessionId("/sessions/20260512T170326_abc123def.jsonl")).toBe("abc123def");
  });

  it("无时间戳前缀：some_id.jsonl → 取第一个 _ 后的 id", () => {
    expect(parseSessionId("/sessions/some_id.jsonl")).toBe("id");
  });

  it("无下划线：nojsonl.jsonl → 移除后缀", () => {
    expect(parseSessionId("nojsonl.jsonl")).toBe("nojsonl");
  });

  it("带路径的完整路径", () => {
    expect(parseSessionId("/home/user/.pi/agent/sessions/20260512/20260512T170326_sessionXYZ.jsonl")).toBe("sessionXYZ");
  });

  it("空文件名返回空字符串", () => {
    expect(parseSessionId("")).toBe("");
  });

  it("只有.jsonl后缀", () => {
    expect(parseSessionId(".jsonl")).toBe("");
  });
});

// ── fmtTime ───────────────────────────────────────────────

describe("fmtTime", () => {
  it("ISO 时间格式化为北京时间", () => {
    // 2026-05-12T10:00:00Z = 北京时间 18:00:00
    const result = fmtTime("2026-05-12T10:00:00.000Z");
    expect(result).toContain("05-12");
    expect(result).toContain("18:00:00");
  });

  it("空字符串返回 ?", () => {
    expect(fmtTime("")).toBe("?");
  });

  it("无效时间字符串原样返回", () => {
    const result = fmtTime("2026-05-12T10:00:00.000Z");
    expect(result).not.toBe("?");
  });

  it("null 输入容错", () => {
    expect(fmtTime(null as unknown as string)).toBe("?");
  });
});

// ── extractText ───────────────────────────────────────────

describe("extractText", () => {
  it("从 text 类型 content parts 中提取文本（空格连接）", () => {
    const parts = [
      { type: "text", text: "Hello" },
      { type: "text", text: "World" },
    ];
    expect(extractText(parts)).toBe("Hello World");
  });

  it("纯字符串直接返回", () => {
    expect(extractText("plain string")).toBe("plain string");
  });

  it("跳过非 text 类型的 parts", () => {
    const parts = [
      { type: "toolCall", name: "read" },
      { type: "text", text: "only this" },
    ];
    expect(extractText(parts)).toBe("only this");
  });

  it("空数组返回空字符串", () => {
    expect(extractText([])).toBe("");
  });

  it("undefined 输入返回空字符串", () => {
    expect(extractText(undefined as unknown as any[])).toBe("");
  });
});

// ── readJsonl ─────────────────────────────────────────────

describe("readJsonl", () => {
  it("解析多行 JSONL", () => {
    const text = [
      '{"type":"session","cwd":"/home"}',
      '{"type":"message","message":{"role":"user","content":"hello"}}',
    ].join("\n");
    const result = readJsonl(text);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("session");
    expect(result[1].type).toBe("message");
  });

  it("跳过空行", () => {
    const text = [
      '{"type":"session"}',
      "",
      "",
      '{"type":"message"}',
    ].join("\n");
    const result = readJsonl(text);
    expect(result).toHaveLength(2);
  });

  it("跳过无效 JSON 行", () => {
    const text = [
      '{"type":"session"}',
      "not valid json",
      '{"type":"message"}',
    ].join("\n");
    const result = readJsonl(text);
    expect(result).toHaveLength(2);
  });

  it("空字符串返回空数组", () => {
    expect(readJsonl("")).toEqual([]);
  });

  it("只有空行返回空数组", () => {
    expect(readJsonl("\n\n\n")).toEqual([]);
  });
});

// ── extractSummary ────────────────────────────────────────

describe("extractSummary", () => {
  it("提取工具调用统计和文件编辑信息", () => {
    const entries = [
      { type: "message", message: { role: "user", content: [{ type: "text", text: "hello" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }, { type: "toolCall", name: "read" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } }, { type: "toolCall", name: "write", arguments: { path: "/src/helper.ts" } }] } },
    ];
    const result = extractSummary(entries);
    expect(result.editCount).toBe(1);
    expect(result.writeCount).toBe(1);
    expect(result.filesEdited).toContain("/src/main.ts");
    expect(result.filesEdited).toContain("/src/helper.ts");
    expect(result.toolStats.read).toBeDefined();
    expect(result.toolStats.read.calls).toBe(2);
    expect(result.toolStats.edit.calls).toBe(1);
  });

  it("首条 user 消息被截断到 120 字符", () => {
    const longMsg = "x".repeat(200);
    const entries = [
      { type: "message", message: { role: "user", content: [{ type: "text", text: longMsg }] } },
    ];
    const result = extractSummary(entries);
    expect(result.firstMsg.length).toBe(120);
  });

  it("无 user 消息时 firstMsg 为空", () => {
    const entries = [
      { type: "message", message: { role: "assistant", content: "help" } },
    ];
    const result = extractSummary(entries);
    expect(result.firstMsg).toBe("");
  });

  it("空 entries 返回全零默认值", () => {
    const result = extractSummary([]);
    expect(result.editCount).toBe(0);
    expect(result.writeCount).toBe(0);
    expect(result.filesEdited).toEqual([]);
    expect(result.toolStats).toEqual({});
  });
});

// ── extractTimestamp ──────────────────────────────────────

describe("extractTimestamp", () => {
  it("从文件名提取 ISO 时间", () => {
    const result = extractTimestamp("20260512T17-02-26-123_abc123.jsonl");
    expect(result).toBeTruthy();
    expect(result).not.toBe("?");
  });

  it("无下划线文件名返回空字符串", () => {
    expect(extractTimestamp("abc123.jsonl")).toBe("");
  });

  it("无 T 分隔符返回空字符串", () => {
    expect(extractTimestamp("20260512_abc123.jsonl")).toBe("");
  });
});

// ── getSessionInfoFromEntries ─────────────────────────────

describe("getSessionInfoFromEntries", () => {
  it("提取会话元信息", () => {
    const entries = [
      { type: "session", cwd: "/home" },
      { type: "message", message: { role: "user", content: "hi", model: "gpt-4" } },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } },
      { type: "message", message: { role: "assistant", content: "done" } },
    ];
    const result = getSessionInfoFromEntries(entries, "20260512T170326_sess1.jsonl");
    expect(result.sessionId).toBe("sess1");
    expect(result.model).toBe("gpt-4");
    expect(result.userMsgCount).toBe(1);
    expect(result.assistantMsgCount).toBe(2);
    expect(result.toolCallCount).toBe(1);
  });

  it("空 entries 状态为 empty", () => {
    const result = getSessionInfoFromEntries([], "file.jsonl");
    expect(result.status).toBe("empty");
  });

  it("最后一条消息是 toolCall → 状态为 waiting", () => {
    const entries = [
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } },
    ];
    const result = getSessionInfoFromEntries(entries, "file.jsonl");
    expect(result.status).toBe("waiting");
  });

  it("最后一条消息没有 toolCall → 状态为 completed", () => {
    const entries = [
      { type: "message", message: { role: "assistant", content: "finished" } },
    ];
    const result = getSessionInfoFromEntries(entries, "file.jsonl");
    expect(result.status).toBe("completed");
  });

  it("filesEdited 限制 5 个", () => {
    const entries = [
      { type: "message", message: { role: "assistant", content: [
        { type: "toolCall", name: "edit", arguments: { path: "/a" } },
        { type: "toolCall", name: "edit", arguments: { path: "/b" } },
        { type: "toolCall", name: "edit", arguments: { path: "/c" } },
        { type: "toolCall", name: "edit", arguments: { path: "/d" } },
        { type: "toolCall", name: "edit", arguments: { path: "/e" } },
        { type: "toolCall", name: "edit", arguments: { path: "/f" } },
      ] } },
    ];
    const result = getSessionInfoFromEntries(entries, "file.jsonl");
    expect(result.filesEdited.length).toBeLessThanOrEqual(5);
  });
});

// ── escapeRegex ───────────────────────────────────────────

describe("escapeRegex", () => {
  it("转义特殊字符", () => {
    expect(escapeRegex("hello.world")).toBe("hello\\.world");
    expect(escapeRegex("foo$bar")).toBe("foo\\$bar");
    expect(escapeRegex("a+b?c")).toBe("a\\+b\\?c");
  });

  it("普通字符串不受影响", () => {
    expect(escapeRegex("helloworld")).toBe("helloworld");
    expect(escapeRegex("")).toBe("");
  });
});

// ── extractMatchContext ───────────────────────────────────

describe("extractMatchContext", () => {
  const helloEntry = {
    type: "message",
    message: { role: "user", content: [{ type: "text", text: "Hello World from pi" }] },
  };

  it("匹配 text 内容并返回上下文", () => {
    const result = extractMatchContext(helloEntry, /Hello/);
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("无匹配返回空字符串", () => {
    const result = extractMatchContext(helloEntry, /NotFound/);
    expect(result).toBe("");
  });

  it("匹配 toolCall 的 name 和 arguments", () => {
    const entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } }],
      },
    };
    const result = extractMatchContext(entry, /main\.ts/);
    expect(result).toContain("edit");
    expect(result).toContain("main.ts");
  });

  it("匹配整个 entry 的 JSON（无 message 字段时）", () => {
    const entry = { type: "session", cwd: "/project" };
    const result = extractMatchContext(entry, /project/);
    expect(result).toBeTruthy();
  });
});
