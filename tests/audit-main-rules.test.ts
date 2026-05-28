/**
 * session-analyzer audit 模块 — 抽象优先 + 信息获取规则触发测试
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

describe("doAudit — 抽象优先 + 信息获取", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(readFile as any).mockRejectedValue(new Error("not found"));
	});

	it("3 次 edit/write 无搜索触发抽象优先违规", async () => {
		const result = await doAudit([
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
		]);
		expect(result.content[0].text).toContain("抽象优先原则");
	});

	it("仅计数 edit 和 write 工具", async () => {
		const result = await doAudit([
			assistantWithToolCall("read"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("bash"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
		]);
		expect(result.content[0].text).toContain("抽象优先原则");
	});

	it("2 次 edit/write 不触发抽象优先违规", async () => {
		const result = await doAudit([
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
		]);
		expect(result.content[0].text).not.toContain("抽象优先原则");
	});

	it("有匹配搜索工具时 edit/write >=3 不触发抽象优先违规", async () => {
		// checkSearchBeforeEdit 只认 grep/find/search
		const result = await doAudit([
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "grep", arguments: {} }] } },
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
			assistantWithToolCall("edit"),
		]);
		expect(result.content[0].text).not.toContain("抽象优先原则");
	});

	it("web_search 未跟 web_read 触发信息获取违规", async () => {
		const result = await doAudit([
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "web_search" },
						{ type: "toolCall", name: "web_search" },
						{ type: "toolCall", name: "web_search" },
					],
				},
			},
		]);
		expect(result.content[0].text).toContain("信息获取要求");
	});

	it("gh_search_doc 也算搜索工具", async () => {
		const result = await doAudit([
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "gh_search_doc" },
						{ type: "toolCall", name: "gh_search_doc" },
						{ type: "toolCall", name: "gh_search_doc" },
					],
				},
			},
		]);
		expect(result.content[0].text).toContain("信息获取要求");
	});

	it("搜索后有阅读操作不触发信息获取违规", async () => {
		const result = await doAudit([
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "web_search" },
						{ type: "toolCall", name: "web_search" },
						{ type: "toolCall", name: "web_search" },
						{ type: "toolCall", name: "web_read" },
					],
				},
			},
		]);
		expect(result.content[0].text).not.toContain("信息获取要求");
	});
});
