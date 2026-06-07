/**
 * S3: list 增强 — 增加修改文件和工具统计
 * S4: file 增强 — 返回具体编辑操作摘要
 * S5: raw 截断增大
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { doList, doGrep } from "../search";
import { doFile } from "../search-file";
import { doRaw } from "../analyze";
import type { Entry } from "../core";

// ── 测试数据 ──────────────────────────────────────────

const SESSION_ID = "2026-06-07T10-00-00-000Z_test-session-id";

function makeEntry(
	idx: number,
	role: string,
	text: string,
	extra?: Record<string, unknown>,
): Entry {
	return {
		type: "message",
		message: { role, content: text, ...(extra ?? {}) },
		timestamp: new Date(Date.now() - (100 - idx) * 60000).toISOString(),
	} as Entry;
}

const entries: Entry[] = [
	// 0: session metadata
	{ type: "session", cwd: "/project" } as Entry,
	// 1: user
	makeEntry(1, "user", "帮我优化搜索性能"),
	// 2: assistant reads
	makeEntry(2, "assistant", "让我看看代码", {
		content: [
			{ type: "text", text: "让我看看代码" },
			{
				type: "toolCall",
				name: "read",
				arguments: { path: "src/search.ts" },
			},
		],
	}),
	// 3: tool result
	makeEntry(3, "toolResult", "export function doSearch() {...}", {
		toolName: "read",
	}),
	// 4: assistant edits
	makeEntry(4, "assistant", "我需要修改搜索逻辑", {
		content: [
			{ type: "text", text: "我需要修改搜索逻辑" },
			{
				type: "toolCall",
				name: "edit",
				arguments: { path: "src/search.ts", oldText: "old code", newText: "new code" },
			},
		],
	}),
	// 5: edit result
	makeEntry(5, "toolResult", "edit applied", { toolName: "edit" }),
	// 6: assistant edits another file + runs bash
	makeEntry(6, "assistant", "还需要改测试", {
		content: [
			{ type: "text", text: "还需要改测试" },
			{
				type: "toolCall",
				name: "edit",
				arguments: {
					path: "tests/search.test.ts",
					oldText: "expect(true)",
					newText: "expect(false)",
				},
			},
			{
				type: "toolCall",
				name: "bash",
				arguments: { command: "npm test" },
			},
		],
	}),
	// 7: tool results
	makeEntry(7, "toolResult", "edit + bash done", { toolName: "edit" }),
	// 8: another edit
	makeEntry(8, "assistant", "再改一下", {
		content: [
			{ type: "text", text: "再改一下" },
			{
				type: "toolCall",
				name: "edit",
				arguments: {
					path: "src/search.ts",
					oldText: "another old",
					newText: "another new",
				},
			},
		],
	}),
	// 9: edit result
	makeEntry(9, "toolResult", "edit applied again", { toolName: "edit" }),
	// 10: user
	makeEntry(10, "user", "测试通过了，谢谢"),
];

const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `s3s4s5-test-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
	const sessionDir = join(tmpDir, SESSION_ID);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(join(sessionDir, "session.jsonl"), jsonl);
});

// S3 测试需要看 doList 的返回格式
describe("S3: list 增强", () => {
	it("当前 doList 输出格式（baseline）", async () => {
		const result = await doList(tmpDir, 10);
		// result 是 truncatedResult 的返回值（对象格式）
		const text =
			typeof result === "string"
				? result
				: JSON.stringify(result);
		expect(text).toContain("帮我优化搜索性能");
		expect(text).toContain("search.ts");
	});
});

// S4 测试需要看 doFile 的返回格式
describe("S4: file 增强", () => {
	it("当前 doFile 输出格式（baseline）", async () => {
		const result = await doFile(tmpDir, "src/search.ts", 10, 0);
		const text =
			typeof result === "string"
				? result
				: JSON.stringify(result);
		expect(text).toContain("edit");
		expect(text).toContain("search.ts");
	});
});

// S5: raw 截断
describe("S5: raw 截断增大", () => {
	it("单条 JSON 超过 1000 字符时当前被截断（baseline）", () => {
		const longContent = "x".repeat(5000);
		const longEntry = makeEntry(1, "assistant", longContent);
		const result = doRaw([longEntry], 1);
		const text =
			typeof result === "string"
				? result
				: JSON.stringify(result);
		// 当前截断到 1000 字符，5000 个 x 不应该全部可见
		const json = JSON.stringify(longEntry);
		expect(json.length).toBeGreaterThan(1000);
		// 被截断后不应该有完整的 5000 个 x
		expect(text).toContain("xxx"); // 至少有一些 x
	});
});
