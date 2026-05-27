/**
 * entries compact=true 紧凑格式 — 单元测试
 *
 * 覆盖：紧凑格式、grep+compact、offset+compact、Options签名、边缘情况
 */

import { describe, it, expect } from "vitest";
import { doEntries } from "../entries";
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

// ── compact=true 紧凑格式 ─────────────────────────────

describe("doEntries compact=true", () => {
	it("不包含 type 列", () => {
		const result = doEntries(ENTRIES, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).not.toMatch(/\bmessage\s+\|/);
		expect(text).not.toMatch(/\bsession\s+\|/);
	});

	it("role 使用缩写", () => {
		const result = doEntries(ENTRIES, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("asst");
		expect(text).toContain("user");
		expect(text).toContain("toolRes");
	});

	it("时间只保留 HH:MM", () => {
		const result = doEntries(ENTRIES, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toMatch(/\d{2}:\d{2}/);
		expect(text).not.toContain("05-12");
	});

	it("预览限制在 60 字符", () => {
		const longText = "a".repeat(200);
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: longText } } as Entry,
		];
		const result = doEntries(entries, 10, undefined, undefined, true);
		const text = getText(result);
		const previewLine = text.split("\n").find(l => l.includes("aaaa"));
		expect(previewLine).toBeDefined();
		const aCount = previewLine!.split("").filter(c => c === "a").length;
		expect(aCount).toBeLessThanOrEqual(60);
	});

	it("使用 [N] 索引格式", () => {
		const result = doEntries(ENTRIES, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toMatch(/\[\s*0\]/);
		expect(text).toMatch(/\[\s*1\]/);
	});

	it("tool call 只显示工具名", () => {
		const result = doEntries(ENTRIES, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("read(...)");
		expect(text).toContain("edit(...)");
	});

	it("多 tool call 用逗号分隔", () => {
		const result = doEntries(ENTRIES, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("edit(...), bash(...)");
	});
});

// ── compact + grep 组合 ────────────────────────────────

describe("doEntries compact + grep", () => {
	it("grep 过滤后用紧凑格式输出", () => {
		const result = doEntries(ENTRIES, 10, undefined, "edit", true);
		const text = getText(result);
		expect(text).toContain("Edit the file");
		expect(text).toContain("edit(...)");
		expect(text).not.toContain("Hello");
	});
});

// ── compact + offset 组合 ──────────────────────────────

describe("doEntries compact + offset", () => {
	it("offset + compact 组合正确切片", () => {
		const result = doEntries(ENTRIES, 3, 2, undefined, true);
		const text = getText(result);
		expect(text).toContain("条目 2-");
	});

	it("无 offset 默认从末尾取", () => {
		const result = doEntries(ENTRIES, 3, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("3/7");
	});
});

// ── DoEntriesOptions 对象签名 ──────────────────────────

describe("doEntries DoEntriesOptions 签名", () => {
	it("对象签名支持 compact", () => {
		const result = doEntries(ENTRIES, { limit: 5, compact: true });
		const text = getText(result);
		expect(text).toContain("asst");
		expect(text).not.toMatch(/\bmessage\s+\|/);
	});

	it("对象签名支持 grep + compact", () => {
		const result = doEntries(ENTRIES, { limit: 10, grep: "edit", compact: true });
		const text = getText(result);
		expect(text).toContain("edit");
		expect(text).not.toContain("Hello");
	});

	it("对象签名不传 compact 默认非紧凑", () => {
		const result = doEntries(ENTRIES, { limit: 10 });
		const text = getText(result);
		expect(text).toMatch(/\bmessage\s+\|/);
	});
});

// ── 边缘情况 ──────────────────────────────────────────

describe("doEntries 边缘情况", () => {
	it("空条目列表", () => {
		const result = doEntries([], 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("0/0");
	});

	it("无 timestamp 的条目不崩溃", () => {
		const entries: Entry[] = [
			{ type: "message", message: { role: "user", content: "hi" } } as Entry,
		];
		const result = doEntries(entries, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("user");
	});

	it("未知 role 使用截断处理", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "custom_role", content: "test" } } as Entry,
		];
		const result = doEntries(entries, 10, undefined, undefined, true);
		const text = getText(result);
		expect(text).toContain("custom");
		expect(text).not.toContain("custom_role");
	});
});
