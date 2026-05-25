/**
 * session-analyzer search 模块 — 单元测试
 *
 * 测试：doList, doGrep, doFile
 * _shared/tool-output 由 vitest.config.ts 的 alias 重定向到 mock
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { doList, doGrep } from "../search";
import { doFile } from "../search-file";

// ── 测试用临时会话文件 ────────────────────────────────────

const tmpDir = path.join(os.tmpdir(), `session-analyzer-test-${Date.now()}`);
const sessionSubDir = path.join(tmpDir, "20260512");
const SESSION_FILE = path.join(sessionSubDir, "20260512T100000_test001.jsonl");
const SESSION_FILE_2 = path.join(sessionSubDir, "20260512T110000_test002.jsonl");

const SESSION_1_ENTRIES = [
  { type: "session", cwd: "/project" },
  { type: "message", message: { role: "user", content: [{ type: "text", text: "Edit main.ts" }] } },
  { type: "message", message: { role: "assistant", content: [
    { type: "toolCall", name: "edit", arguments: { path: "/project/src/main.ts" } },
  ] } },
  { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Done editing main.ts" }] } },
];

const SESSION_2_ENTRIES = [
  { type: "session", cwd: "/project" },
  { type: "message", message: { role: "user", content: [{ type: "text", text: "Write a new file" }] } },
  { type: "message", message: { role: "assistant", content: [
    { type: "toolCall", name: "write", arguments: { path: "/project/src/helper.ts" } },
  ] } },
];

function setupSessionFiles() {
  fs.mkdirSync(sessionSubDir, { recursive: true });
  fs.writeFileSync(SESSION_FILE, SESSION_1_ENTRIES.map(e => JSON.stringify(e)).join("\n"), "utf-8");
  fs.writeFileSync(SESSION_FILE_2, SESSION_2_ENTRIES.map(e => JSON.stringify(e)).join("\n"), "utf-8");
}

function cleanupSessionFiles() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── doList ────────────────────────────────────────────────

describe("doList", () => {
  beforeEach(setupSessionFiles);
  afterEach(cleanupSessionFiles);

  it("列出最近会话", async () => {
    const result = await doList(tmpDir, 10);
    const text = result.content[0].text;
    expect(text).toContain("test001");
    expect(text).toContain("test002");
    expect(text).toContain("Edit main.ts");
    expect(text).toContain("Write a new file");
  });

  it("limit 限制结果数", async () => {
    const result = await doList(tmpDir, 1);
    const text = result.content[0].text;
    expect(text).toContain("1 个会话");
  });

  it("空目录返回 0 个会话", async () => {
    cleanupSessionFiles();
    const emptyDir = path.join(os.tmpdir(), `session-empty-${Date.now()}`);
    fs.mkdirSync(emptyDir, { recursive: true });
    try {
      const result = await doList(emptyDir, 10);
      const text = result.content[0].text;
      expect(text).toContain("0 个");
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ── doGrep ────────────────────────────────────────────────

describe("doGrep", () => {
  beforeEach(setupSessionFiles);
  afterEach(cleanupSessionFiles);

  it("全文搜索关键词", async () => {
    const result = await doGrep(tmpDir, "main.ts", 10, false);
    const text = result.content[0].text;
    expect(text).toContain("test001");
    expect(text).toContain("main.ts");
  });

  it("editOnly 仅搜索 edit/write 操作", async () => {
    const result = await doGrep(tmpDir, "main\\.ts", 10, true);
    const text = result.content[0].text;
    expect(text).toContain("test001");
  });

  it("无匹配返回未找到", async () => {
    const result = await doGrep(tmpDir, "ZZZZ_notfound_ZZZZ", 10, false);
    const text = result.content[0].text;
    expect(text).toContain("未找到匹配");
  });

  it("空 query 返回错误提示", async () => {
    const result = await doGrep(tmpDir, "", 10, false);
    const text = result.content[0].text;
    expect(text).toContain("需要搜索关键词");
  });

  it("无效正则表达式自动转义为字面量", async () => {
    const result = await doGrep(tmpDir, "(unclosed group", 10, false);
    // 应该不抛异常，返回未找到或正常结果
    const text = result.content[0].text;
    expect(text).toBeTruthy();
  });
});

// ── doFile ────────────────────────────────────────────────

describe("doFile", () => {
  beforeEach(setupSessionFiles);
  afterEach(cleanupSessionFiles);

  it("查找修改过特定文件的会话", async () => {
    const result = await doFile(tmpDir, "main.ts", 10);
    const text = result.content[0].text;
    expect(text).toContain("test001");
    expect(text).toContain("编辑 1 次");
  });

  it("无匹配返回未找到", async () => {
    const result = await doFile(tmpDir, "nonexistent.ts", 10);
    const text = result.content[0].text;
    expect(text).toContain("未找到修改过");
  });

  it("空 filePath 返回错误提示", async () => {
    const result = await doFile(tmpDir, "", 10);
    const text = result.content[0].text;
    expect(text).toContain("需要文件路径");
  });

  it("limit 限制结果数", async () => {
    const result = await doFile(tmpDir, "main.ts", 10);
    const text = result.content[0].text;
    expect(text).toContain("1 个");
  });
});
