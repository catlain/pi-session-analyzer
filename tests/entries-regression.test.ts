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
