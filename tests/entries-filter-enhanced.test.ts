/**
 * entries 过滤增强测试 — toolName 通配符/多值 + file 过滤 + 组合
 */

import { describe, it, expect } from "vitest";
import { doEntries } from "../entries";
import type { Entry } from "../core";

// 测试数据：包含多种工具调用和文件路径
const ENTRIES: Entry[] = [
	{ type: "session", cwd: "/project", parentSession: "p1" } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "分析项目架构" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "code_graph_project_map", arguments: {} },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "toolResult", content: [{ type: "text", text: "project map result" }], toolName: "code_graph_project_map" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:03.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "code_graph_module_overview", arguments: { path: "src/core/" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:04.000Z", message: { role: "toolResult", content: [{ type: "text", text: "module overview" }], toolName: "code_graph_module_overview" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:05.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "edit", arguments: { path: "src/core/engine.ts", oldText: "foo", newText: "bar" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:06.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "edit", arguments: { path: "src/config/settings.json", oldText: "a", newText: "b" } },
		{ type: "toolCall", name: "bash", arguments: { command: "npm test" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:07.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "code_graph_find_references", arguments: { symbol_name: "doEntries", file_path: "entries.ts" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:08.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "bash", arguments: { command: "git commit -m 'refactor'" } },
	] } } as Entry,
];

function getText(result: ReturnType<typeof doEntries>): string {
	return result.content[0].text;
}

function countShown(text: string): number {
	// 从 "前 N/M 条" 或 "条目 X-Y/M" 中提取实际显示条目数
	const m = text.match(/前 (\d+)\/\d+ 条/);
	if (m) return parseInt(m[1]);
	const m2 = text.match(/条目 (\d+)-(\d+)\/(\d+)/);
	if (m2) return parseInt(m2[2]) - parseInt(m2[1]) + 1;
	return -1;
}

// ── toolName 增强匹配 ────────────────────────────────

describe("toolName 增强匹配", () => {
	it("通配符 code_graph* 匹配所有 code_graph_* 工具", () => {
		const result = doEntries(ENTRIES, { toolName: "code_graph*" });
		const text = getText(result);
		expect(text).toContain("code_graph_project_map");
		expect(text).toContain("code_graph_module_overview");
		expect(text).toContain("code_graph_find_references");
		expect(text).not.toContain("edit(");
		expect(text).not.toContain("bash(");
	});

	it("多值 edit|bash 匹配 edit 或 bash", () => {
		const result = doEntries(ENTRIES, { toolName: "edit|bash" });
		const text = getText(result);
		expect(text).toContain("edit(...)");
		expect(text).toContain("bash(...)");
		expect(text).not.toContain("code_graph");
	});

	it("精确匹配 edit 只匹配 edit（不匹配 edit_something）", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "assistant", content: [
				{ type: "toolCall", name: "edit", arguments: { path: "a.ts" } },
			] } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: [
				{ type: "toolCall", name: "edit_something", arguments: {} },
			] } } as Entry,
		];
		const result = doEntries(entries, { toolName: "edit" });
		const text = getText(result);
		expect(text).toContain("edit(");
		expect(text).not.toContain("edit_something");
	});

	it("通配符 code_graph_* 匹配所有 code_graph_ 前缀工具", () => {
		const result = doEntries(ENTRIES, { toolName: "code_graph_*" });
		const text = getText(result);
		expect(text).toContain("code_graph_project_map");
		expect(text).toContain("code_graph_module_overview");
		expect(text).toContain("code_graph_find_references");
	});
});

// ── file 过滤 ────────────────────────────────────────

describe("file 过滤", () => {
	it("按文件名子串过滤", () => {
		const result = doEntries(ENTRIES, { file: "engine.ts" });
		const text = getText(result);
		expect(text).toContain("engine.ts");
		// 不包含其他 edit 调用（settings.json）
		// 但条目中会显示完整内容，需要检查条目数
		expect(countShown(text)).toBe(1);
	});

	it("按路径前缀过滤", () => {
		const result = doEntries(ENTRIES, { file: "src/core/" });
		const text = getText(result);
		expect(text).toContain("src/core/");
		// 匹配 code_graph_module_overview(path="src/core/") 和 edit(path="src/core/engine.ts")
		expect(countShown(text)).toBe(2);
	});

	it("按扩展名通配符过滤 *.json", () => {
		const result = doEntries(ENTRIES, { file: "*.json" });
		const text = getText(result);
		// compact 模式不展开参数，只能验证条目数
		expect(countShown(text)).toBe(1);
	});

	it("多文件过滤 a.ts|b.ts 语法", () => {
		const entries: Entry[] = [
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "assistant", content: [
				{ type: "toolCall", name: "read", arguments: { path: "/src/a.ts" } },
			] } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: [
				{ type: "toolCall", name: "read", arguments: { path: "/src/b.ts" } },
			] } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "assistant", content: [
				{ type: "toolCall", name: "read", arguments: { path: "/src/c.ts" } },
			] } } as Entry,
		];
		const result = doEntries(entries, { file: "a.ts|b.ts" });
		expect(countShown(getText(result))).toBe(2);
	});

	it("file 不匹配时返回 0 条", () => {
		const result = doEntries(ENTRIES, { file: "nonexistent.file" });
		const text = getText(result);
		expect(text).toMatch(/0\/\d+/);
	});

	it("file 过滤描述出现在输出中", () => {
		const result = doEntries(ENTRIES, { file: "engine.ts" });
		const text = getText(result);
		expect(text).toContain('文件: "engine.ts"');
	});
});

// ── 组合过滤 ─────────────────────────────────────────

describe("组合过滤", () => {
	it("toolName + file 同时过滤", () => {
		// edit 工具 + 包含 engine.ts 的路径
		const result = doEntries(ENTRIES, { toolName: "edit", file: "engine.ts" });
		const text = getText(result);
		expect(text).toContain("engine.ts");
		// 不包含 settings.json 的 edit
		expect(text).not.toContain("settings.json");
		// 不包含 bash
		expect(text).not.toContain("bash(");
	});

	it("toolName + grep 组合", () => {
		// code_graph 工具 + grep "module"
		const result = doEntries(ENTRIES, { toolName: "code_graph*", grep: "module" });
		const text = getText(result);
		expect(text).toContain("code_graph_module_overview");
		// code_graph_project_map 的结果不含 "module" 文本
		// 但 toolResult "project map result" 不含 module，所以只保留 module_overview
	});

	it("file + grep 组合", () => {
		const result = doEntries(ENTRIES, { file: "settings.json", grep: "config" });
		const text = getText(result);
		expect(text).toContain("settings.json");
	});

	it("toolName + file + grep 三重过滤", () => {
		// edit + engine.ts + grep
		const result = doEntries(ENTRIES, { toolName: "edit", file: "engine.ts", grep: "engine" });
		const text = getText(result);
		expect(text).toContain("engine");
	});

	it("无匹配的组合返回 0 条", () => {
		const result = doEntries(ENTRIES, { toolName: "bash", file: "engine.ts" });
		const text = getText(result);
		expect(text).toMatch(/0\/\d+/);
	});
});
