/**
 * entries 导航增强测试 — toolName 过滤 + 参数组合
 */

import { describe, it, expect } from "vitest";
import { doEntries } from "../entries";
import type { Entry } from "../core";

const ENTRIES: Entry[] = [
	{ type: "session", cwd: "/project", parentSession: "p1" } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "帮我分析这个项目的架构" }], model: "gpt-4" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: { path: "/src/main.ts" } }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "toolResult", content: [{ type: "text", text: "file content here" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:04.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
		{ type: "toolCall", name: "bash", arguments: { cmd: "npm test" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:06.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { path: "/config.json" } }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:09.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { cmd: "git commit" } }] } } as Entry,
];

function getText(result: ReturnType<typeof doEntries>): string {
	return result.content[0].text;
}

// ── toolName 过滤 ────────────────────────────────────

describe("entries toolName 过滤", () => {
	it("toolName='edit' 返回包含 edit 的条目（含多 toolCall 条目）", () => {
		const result = doEntries(ENTRIES, { toolName: "edit" });
		const text = getText(result);
		expect(text).toContain("edit(...)");
		expect(text).not.toContain("read(...)");
		// 条目 4 同时含 edit+bash，整个条目被保留
		expect(text).toContain("bash(...)");
	});

	it("toolName='bash' 返回包含 bash 的条目", () => {
		const result = doEntries(ENTRIES, { toolName: "bash" });
		const text = getText(result);
		expect(text).toContain("bash(...)");
		// 条目 4 同时含 edit+bash，整个条目被保留
		expect(text).toContain("edit(...)");
	});

	it("toolName='read' 只返回 read 工具调用", () => {
		const result = doEntries(ENTRIES, { toolName: "read" });
		const text = getText(result);
		expect(text).toContain("read(");
		expect(text).not.toContain("edit(");
	});

	it("toolName 不匹配返回 0 条", () => {
		const result = doEntries(ENTRIES, { toolName: "nonexist" });
		const text = getText(result);
		expect(text).toMatch(/0\/\d+/);
	});

	it("toolName 包含 toolResult 关联条目", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: {} }] } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "toolResult", content: [{ type: "text", text: "result" }], toolName: "read" } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: {} }] } } as Entry,
		];
		const result = doEntries(entries, { toolName: "read" });
		const text = getText(result);
		expect(text).toContain("read(");
		expect(text).toContain("result");
		expect(text).not.toContain("edit(");
	});
});

// ── 参数组合 ─────────────────────────────────────────

describe("entries 参数组合", () => {
	it("range + grep 组合", () => {
		// ENTRIES 不含 "edit the config"，用 "bash" 过滤
		const result = doEntries(ENTRIES, { range: "last:5", grep: "bash" });
		const text = getText(result);
		expect(text).toContain("bash(...)");
		expect(text).not.toContain("帮我分析");
	});

	it("range + toolName 组合", () => {
		const result = doEntries(ENTRIES, { range: "last:5", toolName: "edit" });
		const text = getText(result);
		expect(text).toContain("edit(");
		expect(text).not.toContain("read(");
	});

	it("toolName + grep 组合", () => {
		// 先过滤 bash 条目，再 grep 过滤 "config"
		const result = doEntries(ENTRIES, { toolName: "edit", grep: "config" });
		const text = getText(result);
		expect(text).toContain("config");
		expect(text).not.toContain("main.ts");
	});

	it("index + compact 组合", () => {
		const result = doEntries(ENTRIES, { index: 1, compact: true });
		const text = getText(result);
		expect(text).toContain("帮我分析");
	});

	it("offset 和 range 互斥 — range 优先", () => {
		const result = doEntries(ENTRIES, { offset: 0, range: "last:2" });
		const text = getText(result);
		expect(text).toContain("bash(...)"); // 最后一条
		expect(text).not.toContain("帮我分析");
	});
});
