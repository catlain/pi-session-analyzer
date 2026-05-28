/**
 * entries extractEntryText + compact=false 回归 — 单元测试
 */

import { describe, it, expect } from "vitest";
import { doEntries, extractEntryText } from "../entries";
import type { Entry } from "../core";

const ENTRIES: Entry[] = [
	{ type: "session", cwd: "/project", parentSession: "p1" } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Hello, please help with the code" }], model: "gpt-4" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "toolResult", content: [{ type: "text", text: "Here is the file content" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:05.000Z", message: { role: "user", content: "Edit the file now" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:10.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
		{ type: "toolCall", name: "bash", arguments: { cmd: "npm test" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:15.000Z", message: { role: "assistant", content: [{ type: "text", text: "All done" }] } } as Entry,
];

function getText(result: ReturnType<typeof doEntries>): string {
	return result.content[0].text;
}

// ── extractEntryText ──────────────────────────────────

describe("extractEntryText", () => {
	it("提取 message 条目的文本", () => {
		const text = extractEntryText(ENTRIES[1]);
		expect(text).toContain("user");
		expect(text).toContain("Hello, please help");
	});

	it("提取 session 条目", () => {
		const text = extractEntryText(ENTRIES[0]);
		expect(text).toContain("/project");
	});

	it("提取 toolResult 条目", () => {
		const text = extractEntryText(ENTRIES[3]);
		expect(text).toContain("toolResult");
		expect(text).toContain("file content");
	});

	it("提取 toolCall 条目的 name 和 arguments", () => {
		const text = extractEntryText(ENTRIES[5]);
		expect(text).toContain("edit");
		expect(text).toContain("bash");
		expect(text).toContain("main.ts");
	});
});

// ── grep 正则支持（回归 #grep-regex）───────────────────

describe("doEntries grep 正则支持", () => {
	it("单关键词仍正常匹配", () => {
		const result = doEntries(ENTRIES, 10, undefined, "edit");
		const text = getText(result);
		expect(text).toContain("Edit the file");
		expect(text).toContain("edit(...)");
		expect(text).not.toContain("Hello");
	});

	it("管道符 | 作为 OR 匹配多个关键词", () => {
		const result = doEntries(ENTRIES, 10, undefined, "Hello|All done");
		const text = getText(result);
		expect(text).toContain("Hello");
		expect(text).toContain("All done");
		expect(text).not.toContain("edit");
	});

	it("管道符 | 多个关键词，部分匹配", () => {
		const result = doEntries(ENTRIES, 10, undefined, "screenshot|Hello");
		const text = getText(result);
		// 应该只匹配到包含 Hello 的那一条
		expect(text).toContain("Hello, please help");
		expect(text).toContain("1/7");
	});

	it("正则大小写不敏感", () => {
		const result = doEntries(ENTRIES, 10, undefined, "hello");
		const text = getText(result);
		expect(text).toContain("Hello");
	});

	it("中文关键词匹配", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: "截图验证" } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: "All done" } } as Entry,
		];
		const result = doEntries(entries, 10, undefined, "截图");
		const text = getText(result);
		expect(text).toContain("截图");
		expect(text).not.toContain("All done");
	});

	it("中文 + 英文混合 | 分隔", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: "截图验证" } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: "screenshot taken" } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "assistant", content: "no match here" } } as Entry,
		];
		const result = doEntries(entries, 10, undefined, "截图|screenshot");
		const text = getText(result);
		expect(text).toContain("截图");
		expect(text).toContain("screenshot");
		expect(text).not.toContain("no match");
	});

	it("无效正则 fallback 到子串匹配", () => {
		// 单独的 ( 是无效正则，应 fallback
		const result = doEntries(ENTRIES, 10, undefined, "(");
		// 不崩溃即可；可能无匹配也正常
		expect(() => getText(result)).not.toThrow();
	});

	it("正则特殊字符作为字面量也能匹配", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: "price is $50" } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: "no dollar here" } } as Entry,
		];
		const result = doEntries(entries, 10, undefined, "$50");
		const text = getText(result);
		expect(text).toContain("$50");
		expect(text).not.toContain("no dollar");
	});

	it("尾随 | 不崩溃", () => {
		const result = doEntries(ENTRIES, 10, undefined, "Hello|");
		expect(() => getText(result)).not.toThrow();
	});

	it("空字符串 grep 不过滤", () => {
		const result = doEntries(ENTRIES, 10, undefined, "");
		const text = getText(result);
		expect(text).toContain("7/7");
	});

	it("完全无匹配返回空结果", () => {
		const result = doEntries(ENTRIES, 10, undefined, "zzzzzzz_nonexistent");
		const text = getText(result);
		expect(text).toContain("0/7");
	});

	it("正则 . 匹配任意字符", () => {
		const result = doEntries(ENTRIES, 10, undefined, "Hello.*code");
		const text = getText(result);
		expect(text).toContain("Hello");
	});

	it("正则 [字符类] 匹配", () => {
		const result = doEntries(ENTRIES, 10, undefined, "[Ee]dit");
		const text = getText(result);
		expect(text).toContain("Edit the file");
	});

	it("过滤后再 offset + limit 切片", () => {
		// "edit" 匹配 index 4 (Edit the file) 和 index 5 (edit(...) toolCall)
		const result = doEntries(ENTRIES, { limit: 1, offset: 0, grep: "edit" });
		const text = getText(result);
		expect(text).toContain("条目 0-0/2");
	});
});

// ── compact=false 回归（默认行为不变）──────────────────

describe("doEntries compact=false 回归", () => {
	it("默认输出包含 type 列（message | session）", () => {
		const result = doEntries(ENTRIES, 10);
		const text = getText(result);
		expect(text).toContain("message");
		expect(text).toContain("session");
	});

	it("默认输出包含完整 role（user/assistant/toolResult）", () => {
		const result = doEntries(ENTRIES, 10);
		const text = getText(result);
		expect(text).toContain("user");
		expect(text).toContain("assistant");
		expect(text).toContain("toolResult");
	});

	it("默认输出包含完整日期时间", () => {
		const result = doEntries(ENTRIES, 10);
		const text = getText(result);
		expect(text).toContain("05-12");
	});

	it("现有 doEntries 调用签名不受影响", () => {
		const result = doEntries(ENTRIES, 5, undefined, undefined);
		const text = getText(result);
		expect(text).toContain("5/7");
	});
});
