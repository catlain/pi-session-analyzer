/**
 * session-analyzer 扩展入口 — session_analyze 工具测试
 */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("typebox", () => ({
	Type: {
		Object: vi.fn(() => ({})),
		Union: vi.fn(() => ({})),
		Literal: vi.fn(() => ({})),
		String: vi.fn(() => ({})),
		Number: vi.fn(() => ({})),
		Boolean: vi.fn(() => ({})),
		Optional: vi.fn((s: any) => s),
	},
}));

vi.mock("../core", () => ({
	getSessionDir: vi.fn(() => "/mock/sessions"),
	resolveSession: vi.fn(),
	readJsonlFile: vi.fn(),
}));

vi.mock("../search", () => ({ doList: vi.fn(), doGrep: vi.fn() }));
vi.mock("../search-file", () => ({ doFile: vi.fn() }));

vi.mock("../analyze", () => ({
	doSummary: vi.fn(),
	doEntries: vi.fn(),
	doTimeline: vi.fn(),
	doChain: vi.fn(),
	doRaw: vi.fn(),
	doBranches: vi.fn(),
}));

vi.mock("../digest", () => ({ doDigest: vi.fn() }));
vi.mock("../audit", () => ({ doAudit: vi.fn() }));
vi.mock("../takeover", () => ({ doTakeover: vi.fn() }));
vi.mock("../audit-types", () => ({}));

import {
	doBranches,
	doChain,
	doEntries,
	doRaw,
	doSummary,
	doTimeline,
} from "../analyze";
import { doAudit } from "../audit";
import { readJsonlFile, resolveSession } from "../core";
import { doDigest } from "../digest";
import ext from "../index";
import { doTakeover } from "../takeover";

const stubResult: AgentToolResult = {
	content: [{ type: "text", text: "ok" }],
	details: {},
};

describe("index.ts — session_analyze 工具", () => {
	let analyzeExecute: Function;

	beforeEach(() => {
		vi.clearAllMocks();

		(resolveSession as any).mockResolvedValue({
			ok: true,
			filepath: "/mock/abc.jsonl",
		});
		(readJsonlFile as any).mockResolvedValue([
			{ type: "session", cwd: "/proj" },
			{ type: "message" },
		]);
		(
			[
				doSummary,
				doEntries,
				doTimeline,
				doChain,
				doRaw,
				doBranches,
				doDigest,
				doAudit,
				doTakeover,
			] as any[]
		).forEach((fn) => {
			fn.mockResolvedValue(stubResult);
		});

		const api = { registerTool: vi.fn() };
		ext(api);
		analyzeExecute = (api.registerTool as any).mock.calls[1][0].execute;
	});

	it("resolveSession 失败返回错误", async () => {
		(resolveSession as any).mockResolvedValue({
			ok: false,
			error: "未找到会话 abc",
		});
		const res = await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "summary" },
			null,
			undefined,
			undefined,
		);
		expect(res.content[0].text).toContain("未找到会话 abc");
	});

	it("空条目返回消息", async () => {
		(readJsonlFile as any).mockResolvedValue([]);
		const res = await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "summary" },
			null,
			undefined,
			undefined,
		);
		expect(res.content[0].text).toBe("会话为空");
	});

	it("summary action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "summary" },
			null,
			undefined,
			undefined,
		);
		expect(doSummary).toHaveBeenCalledWith(
			expect.any(Array),
			"/mock/abc.jsonl",
		);
	});

	it("entries action 传递默认参数", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "entries" },
			null,
			undefined,
			undefined,
		);
		expect(doEntries).toHaveBeenCalledWith(expect.any(Array), {
			limit: 20,
			offset: undefined,
			grep: undefined,
			compact: undefined,
			range: undefined,
			index: undefined,
			toolName: undefined,
		});
	});

	it("entries action 传递自定义参数", async () => {
		await analyzeExecute(
			"id",
			{
				sessionId: "abc",
				action: "entries",
				limit: 10,
				offset: 5,
				grep: "error",
				compact: true,
				range: "last:50",
				index: 3,
				toolName: "edit",
			},
			null,
			undefined,
			undefined,
		);
		expect(doEntries).toHaveBeenCalledWith(expect.any(Array), {
			limit: 10,
			offset: 5,
			grep: "error",
			compact: true,
			range: "last:50",
			index: 3,
			toolName: "edit",
		});
	});

	it("timeline action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "timeline" },
			null,
			undefined,
			undefined,
		);
		expect(doTimeline).toHaveBeenCalledWith(expect.any(Array));
	});

	it("chain action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "chain" },
			null,
			undefined,
			undefined,
		);
		expect(doChain).toHaveBeenCalledWith(
			expect.any(Array),
			"/mock/abc.jsonl",
			"/mock/sessions",
		);
	});

	it("raw action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "raw" },
			null,
			undefined,
			undefined,
		);
		expect(doRaw).toHaveBeenCalledWith(expect.any(Array), 10);
	});

	it("audit action 传递 cwd", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "audit" },
			null,
			undefined,
			undefined,
		);
		expect(doAudit).toHaveBeenCalledWith(expect.any(Array), "/proj");
	});

	it("audit action 无 cwd 时传 undefined", async () => {
		(readJsonlFile as any).mockResolvedValue([{ type: "message" }]);
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "audit" },
			null,
			undefined,
			undefined,
		);
		expect(doAudit).toHaveBeenCalledWith(expect.any(Array), undefined);
	});

	it("digest action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "digest" },
			null,
			undefined,
			undefined,
		);
		expect(doDigest).toHaveBeenCalledWith(expect.any(Array));
	});

	it("branches action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "branches" },
			null,
			undefined,
			undefined,
		);
		expect(doBranches).toHaveBeenCalledWith(expect.any(Array));
	});

	it("takeover action", async () => {
		await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "takeover" },
			null,
			undefined,
			undefined,
		);
		expect(doTakeover).toHaveBeenCalledWith("abc", 5);
	});

	it("未知 action 返回错误", async () => {
		const res = await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "unknown" },
			null,
			undefined,
			undefined,
		);
		expect(res.content[0].text).toContain("未知 action");
	});

	it("异常时返回错误信息", async () => {
		(readJsonlFile as any).mockRejectedValue(new Error("文件损坏"));
		const res = await analyzeExecute(
			"id",
			{ sessionId: "abc", action: "summary" },
			null,
			undefined,
			undefined,
		);
		expect(res.content[0].text).toContain("文件损坏");
	});
});
