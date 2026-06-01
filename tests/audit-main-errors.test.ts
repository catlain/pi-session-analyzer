/**
 * session-analyzer audit 模块 — 重复错误/文件行数/比例/多规则/格式测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Entry } from "../audit-types";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { doAudit } from "../audit";

function assistantWithToolCall(name: string): Entry {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", name, arguments: {} }],
		},
	};
}

function bashToolResult(content: string): Entry {
	return {
		type: "message",
		message: { role: "toolResult", toolName: "bash", content },
	};
}

function errorResult(toolName: string, content: string): Entry {
	return {
		type: "message",
		message: { role: "toolResult", toolName, content, isError: true },
	};
}

/** 带搜索的辅助函数：先搜索再执行工具，避免触发 抽象优先原则 */
function withSearch(...toolNames: string[]): Entry[] {
	const entries: Entry[] = [
		{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "grep", arguments: {} }] } },
	];
	for (const name of toolNames) {
		entries.push(assistantWithToolCall(name));
	}
	return entries;
}

function mockGlobalRulesExist() {
	(readFile as any).mockImplementation((path: string) => {
		const normalized = path.replace(/\\/g, "/");
		if (normalized.includes("AGENTS.md") && normalized.includes(".pi/agent")) {
			return Promise.resolve("some global rules");
		}
		return Promise.reject(new Error("not found"));
	});
}

function mockNoRules() {
	(readFile as any).mockRejectedValue(new Error("not found"));
}

describe("doAudit — 错误/行数/比例/格式", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 重复错误 ───────────────────────────────

	it("跨 3 种工具重复错误触发框架级错误", async () => {
		mockNoRules();
		const result = await doAudit([
			errorResult("bash", "Connection refused"),
			errorResult("edit", "Connection refused"),
			errorResult("write", "Connection refused"),
			errorResult("bash", "Connection refused"),
		]);
		const text = result.content[0].text;
		expect(text).toContain("框架级错误");
		expect(text).toContain("3 种工具");
	});

	it("单工具 2 次重复错误不触发", async () => {
		mockGlobalRulesExist();
		const result = await doAudit([
			errorResult("bash", "Connection refused"),
			errorResult("bash", "Connection refused"),
		]);
		expect(result.content[0].text).toContain("未发现违规问题");
	});

	// ── 文件行数 ───────────────────────────────

	it("文件超过 500 行触发文件格式规则", async () => {
		mockNoRules();
		const result = await doAudit([
			bashToolResult(" 1234 /path/to/main.ts"),
		]);
		expect(result.content[0].text).toContain("文件格式规则");
	});

	it("文件行数在 500 以下忽略", async () => {
		mockGlobalRulesExist();
		const result = await doAudit([
			bashToolResult("  123 /path/to/main.ts"),
		]);
		expect(result.content[0].text).toContain("未发现违规问题");
	});

	// ── Edit/Write 比例 ─────────────────────────

	it("write(7) vs edit(0) 远多于 edit 触发比例违规", async () => {
		mockNoRules();
		const result = await doAudit([
			...withSearch("write", "write", "write", "write", "write", "write", "write"),
		]);
		expect(result.content[0].text).toContain("文件修改规则");
		expect(result.content[0].text).toContain("write(7) 远多于 edit(0)");
	});

	it("write=5 不触发比例违规", async () => {
		mockGlobalRulesExist();
		const result = await doAudit([
			...withSearch("write", "write", "write", "write", "write"),
		]);
		expect(result.content[0].text).toContain("未发现违规问题");
	});

	it("write(6) vs edit(4) 比例正常时不触发", async () => {
		mockGlobalRulesExist();
		const result = await doAudit([
			...withSearch("write", "write", "write", "write", "write", "write", "edit", "edit", "edit", "edit"),
		]);
		expect(result.content[0].text).toContain("未发现违规问题");
	});

	// ── 多规则 & 输出格式 ───────────────────────

	it("多个违规按规则分组显示计数", async () => {
		mockNoRules();
		// 产生: 文件修改(cat>) + 抽象优先(4 edits no search) + 规则覆盖
		const result = await doAudit([
			bashToolResult("cat > /tmp/a.txt"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
		]);
		const text = result.content[0].text;
		expect(text).toContain("文件修改规则");
		expect(text).toContain("抽象优先原则");
	});

	it("违规按严重程度排序（error > warning）", async () => {
		mockNoRules();
		const result = await doAudit([
			bashToolResult(" 1234 /path/to/main.ts"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
		]);
		const lines = result.content[0].text.split("\n");
		const errorIdx = lines.findIndex((l) => l.includes("🔴"));
		const warningIdx = lines.findIndex((l) => l.includes("🟡"));
		expect(errorIdx).toBeGreaterThan(-1);
		expect(warningIdx).toBeGreaterThan(-1);
		expect(errorIdx).toBeLessThan(warningIdx);
	});

	it("违规显示证据和修复建议", async () => {
		mockNoRules();
		const result = await doAudit([
			bashToolResult("sed -i 's/a/b/g' file.txt"),
		]);
		const text = result.content[0].text;
		expect(text).toContain("证据:");
		expect(text).toContain("sed -i");
	});
});
