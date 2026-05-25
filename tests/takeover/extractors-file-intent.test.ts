/**
 * session-takeover 提取函数：用户意图 + 修改文件 — 单元测试
 */

import { describe, it, expect } from "vitest";
import { makeSession, makeUser, makeToolCall } from "./helpers";
import { extractUserIntent, extractModifiedFiles } from "../../takeover";

// ── extractUserIntent ─────────────────────────────────────

describe("extractUserIntent", () => {
	it("提取第 1 条 user 消息", () => {
		const r = extractUserIntent([makeSession(), makeUser("帮我分析项目", 0)]);
		expect(r).toHaveLength(1);
		expect(r[0]).toContain("帮我分析项目");
	});

	it("空 entries 返回空数组", () => {
		expect(extractUserIntent([])).toEqual([]);
	});

	it("只有 assistant 消息返回空数组", () => {
		const r = extractUserIntent([makeSession()]);
		expect(r).toEqual([]);
	});

	it("只有 1 条 user 消息返回单元素", () => {
		const r = extractUserIntent([makeSession(), makeUser("开始任务", 0)]);
		expect(r).toHaveLength(1);
		expect(r[0]).toContain("开始任务");
	});

	it("多条 user 消息取前 3 条", () => {
		const entries = [
			makeSession(),
			makeUser("m1", 0), makeUser("m2", 1),
			makeUser("m3", 2), makeUser("m4", 3),
		];
		expect(extractUserIntent(entries).length).toBeLessThanOrEqual(8);
	});
});

// ── extractModifiedFiles ──────────────────────────────────

describe("extractModifiedFiles", () => {
	it("提取 edit/write 的 path 参数", () => {
		const entries = [
			makeToolCall("edit", { path: "/src/main.ts" }, 0),
			makeToolCall("write", { path: "/src/helper.ts" }, 1),
		];
		const r = extractModifiedFiles(entries);
		expect(r).toContain("/src/main.ts");
		expect(r).toContain("/src/helper.ts");
	});

	it("去重：同一路径只出现一次", () => {
		const entries = [
			makeToolCall("edit", { path: "/src/main.ts" }, 0),
			makeToolCall("write", { path: "/src/main.ts" }, 1),
		];
		expect(extractModifiedFiles(entries)).toEqual(["/src/main.ts"]);
	});

	it("无 edit/write 返回空数组", () => {
		expect(extractModifiedFiles([makeToolCall("read", { path: "/x.ts" }, 0)])).toEqual([]);
	});

	it("空 entries 返回空数组", () => {
		expect(extractModifiedFiles([])).toEqual([]);
	});

	it("结果按字母序排序", () => {
		const entries = [
			makeToolCall("edit", { path: "/zzz/last.ts" }, 0),
			makeToolCall("write", { path: "/aaa/first.ts" }, 1),
		];
		expect(extractModifiedFiles(entries)).toEqual(["/aaa/first.ts", "/zzz/last.ts"]);
	});
});
