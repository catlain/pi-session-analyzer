/**
 * session-analyzer 扩展入口 — 注册与 session_search 工具测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("../analyze", () => ({ doSummary: vi.fn() }));
vi.mock("../digest", () => ({ doDigest: vi.fn() }));
vi.mock("../audit", () => ({ doAudit: vi.fn() }));
vi.mock("../takeover", () => ({ doTakeover: vi.fn() }));
vi.mock("../audit-types", () => ({}));

import { getSessionDir } from "../core";
import { doList, doGrep } from "../search";
import { doFile } from "../search-file";
import ext from "../index";

describe("index.ts — 工具注册与 session_search", () => {
	let registerTool: any;
	let searchExecute: Function;

	beforeEach(() => {
		vi.clearAllMocks();
		registerTool = vi.fn();
		ext({ registerTool });
		searchExecute = registerTool.mock.calls[0][0].execute;
	});

	it("注册 2 个工具（session_search, session_analyze）", () => {
		expect(registerTool).toHaveBeenCalledTimes(2);
		const names = registerTool.mock.calls.map((c: any) => c[0].name);
		expect(names).toEqual(["session_search", "session_analyze"]);
	});

	it("session_search 包含 promptSnippet 和 promptGuidelines", () => {
		const tool = registerTool.mock.calls[0][0];
		expect(tool.promptSnippet).toBeDefined();
		expect(tool.promptGuidelines).toBeInstanceOf(Array);
		expect(tool.promptGuidelines.length).toBeGreaterThan(0);
	});

	it("session_search list action 调用 doList", async () => {
		await searchExecute("id", { action: "list" }, null, undefined, undefined);
		expect(doList).toHaveBeenCalledWith("/mock/sessions", 20);
	});

	it("session_search list 传递自定义 limit", async () => {
		await searchExecute("id", { action: "list", limit: 5 }, null, undefined, undefined);
		expect(doList).toHaveBeenCalledWith("/mock/sessions", 5);
	});

	it("session_search grep action 调用 doGrep", async () => {
		await searchExecute("id", { action: "grep", query: "error", editOnly: true }, null, undefined, undefined);
		expect(doGrep).toHaveBeenCalledWith("/mock/sessions", "error", 20, true);
	});

	it("session_search grep 默认 query 为空字符串", async () => {
		await searchExecute("id", { action: "grep" }, null, undefined, undefined);
		expect(doGrep).toHaveBeenCalledWith("/mock/sessions", "", 20, false);
	});

	it("session_search file action 调用 doFile", async () => {
		await searchExecute("id", { action: "file", query: "main.ts" }, null, undefined, undefined);
		expect(doFile).toHaveBeenCalledWith("/mock/sessions", "main.ts", 20);
	});

	it("session_search 未知 action 返回错误", async () => {
		const res = await searchExecute("id", { action: "unknown" }, null, undefined, undefined);
		expect(res.content[0].text).toContain("未知 action");
	});

	it("session_search 异常时返回错误信息", async () => {
		(doList as any).mockRejectedValue(new Error("磁盘错误"));
		const res = await searchExecute("id", { action: "list" }, null, undefined, undefined);
		expect(res.content[0].text).toContain("磁盘错误");
	});
});
