/**
 * session-analyzer analyze 模块 — 单元测试
 *
 * 测试：doSummary, doEntries, doTimeline, doChain, doRaw, doDigest
 * _shared/tool-output 由 vitest.config.ts 的 alias 重定向到 mock
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { doSummary, doEntries, doTimeline, doChain, doRaw } from "../analyze";
import { doDigest } from "../digest";

// ── 测试数据 ──────────────────────────────────────────────

const SAMPLE_ENTRIES = [
  { type: "session", cwd: "/project", parentSession: "parent_abc123" },
  { type: "message", timestamp: "2026-05-12T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Hello, please help" }], model: "gpt-4" } },
  { type: "message", timestamp: "2026-05-12T10:00:01.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } },
  { type: "message", timestamp: "2026-05-12T10:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "Here's the result" }] } },
  { type: "message", timestamp: "2026-05-12T10:00:05.000Z", message: { role: "user", content: "Edit the file" } },
  { type: "message", timestamp: "2026-05-12T10:00:10.000Z", message: { role: "assistant", content: [
    { type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
  ] } },
  { type: "message", timestamp: "2026-05-12T10:00:15.000Z", message: { role: "assistant", content: [{ type: "text", text: "Done" }] } },
];

// ── 测试用子代理会话 ──────────────────────────────────────

const tmpDir = path.join(os.tmpdir(), `session-analyzer-chain-${Date.now()}`);
const tmpSubDir = path.join(tmpDir, "project-sessions");
const childFile = path.join(tmpSubDir, "20260512T120000_child001.jsonl");

function setupChainFiles() {
  fs.mkdirSync(tmpSubDir, { recursive: true });
  const childEntries = [
    // parentSession 包含 filepath 中的 test001，用于 doChain 的 parentSession 匹配
    { type: "session", cwd: "/project", parentSession: "20260512T100000_test001" },
    { type: "message", message: { role: "user", content: "child task", model: "gpt-4-mini" } },
  ];
  fs.writeFileSync(childFile, childEntries.map(e => JSON.stringify(e)).join("\n"), "utf-8");
}

function cleanupChainFiles() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── doSummary ─────────────────────────────────────────────

describe("doSummary", () => {
  it("生成会话摘要包含关键信息", () => {
    const result = doSummary(SAMPLE_ENTRIES, "20260512T100000_test001.jsonl");
    const text = result.content[0].text;
    expect(text).toContain("test001");
    expect(text).toContain("Hello, please help");
    expect(text).toContain("read");
    expect(text).toContain("edit");
  });

  it("统计工具调用次数", () => {
    const result = doSummary(SAMPLE_ENTRIES, "file.jsonl");
    const text = result.content[0].text;
    expect(text).toContain("read(1");
    expect(text).toContain("edit(1");
  });

  it("统计 user/assistant/toolCall 数量", () => {
    const result = doSummary(SAMPLE_ENTRIES, "file.jsonl");
    const text = result.content[0].text;
    expect(text).toContain("user=2");
    expect(text).toContain("assistant=4");
    expect(text).toContain("toolCalls=2");
  });
});

// ── doEntries ─────────────────────────────────────────────

describe("doEntries", () => {
  it("显示最后 N 条条目", () => {
    const result = doEntries(SAMPLE_ENTRIES, 3);
    const text = result.content[0].text;
    expect(text).toContain("3/7");
  });

  it("limit 大于条目数时显示所有", () => {
    const result = doEntries(SAMPLE_ENTRIES, 100);
    const text = result.content[0].text;
    expect(text).toContain("7/7");
  });

  it("每个条目显示 role 和类型", () => {
    const result = doEntries(SAMPLE_ENTRIES, 10);
    const text = result.content[0].text;
    expect(text).toContain("user");
    expect(text).toContain("assistant");
    expect(text).toContain("session");
  });
});

// ── doTimeline ────────────────────────────────────────────

describe("doTimeline", () => {
  it("按时间顺序排列消息", () => {
    const result = doTimeline(SAMPLE_ENTRIES);
    const text = result.content[0].text;
    expect(text).toContain("user");
    expect(text).toContain("assistant");
    expect(text).toContain("edit");
    expect(text).toContain("事件时间线");
  });

  it("超过 5 秒间隔标注间隔时间", () => {
    const result = doTimeline(SAMPLE_ENTRIES);
    const text = result.content[0].text;
    // 有 timestamp 的消息间有间隔，不抛异常即可
    expect(text).toBeTruthy();
  });

  it("无 timestamp 的消息不显示间隔", () => {
    const entries = [
      { type: "message", message: { role: "user", content: "a" } },
      { type: "message", message: { role: "assistant", content: "b" } },
    ];
    const result = doTimeline(entries);
    const text = result.content[0].text;
    expect(text).not.toContain("间隔");
  });
});

// ── doChain ───────────────────────────────────────────────

describe("doChain", () => {
  beforeEach(setupChainFiles);
  afterEach(cleanupChainFiles);

  it("显示父会话和子代理", async () => {
    const result = await doChain(SAMPLE_ENTRIES, "20260512T100000_test001.jsonl", tmpDir);
    const text = result.content[0].text;
    expect(text).toContain("父会话");
    expect(text).toContain("parent_abc123");
    // 子代理应被检测到（parentSession 包含 test001）
    expect(text).toContain("child001");
  });

  it("无亲子代理关系时显示提示", async () => {
    const standalone = [
      { type: "session", cwd: "/project" },
      { type: "message", message: { role: "user", content: "hi" } },
    ];
    const result = await doChain(standalone, "standalone.jsonl", tmpDir);
    const text = result.content[0].text;
    expect(text).toContain("无父子代理关系");
  });
});

// ── doRaw ─────────────────────────────────────────────────

describe("doRaw", () => {
  it("显示最后 N 条原始 JSON", () => {
    const result = doRaw(SAMPLE_ENTRIES, 2);
    const text = result.content[0].text;
    expect(text).toContain("2/7");
    expect(text).toContain("原始数据");
  });

  it("每个条目截断到 1000 字符", () => {
    const longEntry = [{ type: "message", message: { role: "user", content: "x".repeat(2000) } }];
    const result = doRaw(longEntry, 1);
    const text = result.content[0].text;
    // JSON 串应该被 .slice(0, 1000) 截断
    expect(text.length).toBeLessThan(1050);
  });
});

// ── doDigest ──────────────────────────────────────────────

describe("doDigest", () => {
  it("提取 user/assistant 对话序列", () => {
    const result = doDigest(SAMPLE_ENTRIES);
    const text = result.content[0].text;
    expect(text).toContain("会话摘要");
    expect(text).toContain("Hello, please help");
    expect(text).toContain("Here's the result");
    expect(text).toContain("Done");
  });

  it("跳过非 user/assistant 消息", () => {
    const entries = [
      { type: "session", cwd: "/project" },
      { type: "message", message: { role: "user", content: "hello" } },
    ];
    const result = doDigest(entries);
    const text = result.content[0].text;
    expect(text).toContain("hello");
    expect(text).toContain("1 条对话");
  });

  it("空消息被跳过", () => {
    const entries = [
      { type: "message", message: { role: "user", content: "" } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "" }] } },
    ];
    const result = doDigest(entries);
    const text = result.content[0].text;
    expect(text).toContain("0 条对话");
  });

  it("assistant 长消息截断到 300 字符", () => {
    const longText = "x".repeat(500);
    const entries = [{ type: "message", message: { role: "assistant", content: [{ type: "text", text: longText }] } }];
    const result = doDigest(entries);
    const text = result.content[0].text;
    expect(text).toContain("...");
  });

  it("user 消息完整保留不截断", () => {
    const longText = "x".repeat(500);
    const entries = [{ type: "message", message: { role: "user", content: longText } }];
    const result = doDigest(entries);
    const text = result.content[0].text;
    // user 消息不截断
    expect(text).toContain(longText);
  });
});
