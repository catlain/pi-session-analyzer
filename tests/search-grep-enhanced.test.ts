/**
 * doGrep 增强功能测试 — entry index + 输出容量
 *
 * 测试：doGrep 的 entry#N 格式、匹配上限、文本长度、大 toolCall arguments
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { doGrep } from "../search";

// ── 共享测试数据 ─────────────────────────────────────────

const tmpDir = path.join(os.tmpdir(), `session-analyzer-test-${Date.now()}`);
const sessionSubDir = path.join(tmpDir, "20260512");
const SESSION_FILE = path.join(sessionSubDir, "20260512T100000_test001.jsonl");

const SESSION_1_ENTRIES = [
	{ type: "session", cwd: "/project" },
	{ type: "message", message: { role: "user", content: [{ type: "text", text: "Edit main.ts" }] } },
	{ type: "message", message: { role: "assistant", content: [
		{ type: "toolCall", name: "edit", arguments: { path: "/project/src/main.ts" } },
	] } },
	{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Done editing main.ts" }] } },
];

function setupSessionFiles() {
	fs.mkdirSync(sessionSubDir, { recursive: true });
	fs.writeFileSync(SESSION_FILE, SESSION_1_ENTRIES.map((e) => JSON.stringify(e)).join("\n"), "utf-8");
}

function cleanupSessionFiles() {
	try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── entry index (S3) ──────────────────────────────────

describe("doGrep entry index", () => {
	beforeEach(setupSessionFiles);
	afterEach(cleanupSessionFiles);

	it("输出包含 entry#N 格式（所有 entry 类型计数）", async () => {
		const result = await doGrep(tmpDir, "main\\.ts", 10, false);
		const text = result.content[0].text;
		// [0]=session, [1]=user("Edit main.ts"), [2]=asst(edit main.ts), [3]=asst("Done editing main.ts")
		expect(text).toContain("entry#");
		expect(text).toMatch(/entry#1/);
		expect(text).toMatch(/entry#2/);
	});

	it("entry index 从 0 开始，session 类型也计入", async () => {
		const result = await doGrep(tmpDir, "project", 10, false);
		const text = result.content[0].text;
		// session entry 的 cwd=/project，全局 index=0
		expect(text).toContain("entry#0");
	});

	it("entry index 与 session_analyze entries index 对齐", async () => {
		const result = await doGrep(tmpDir, "Done editing", 10, false);
		const text = result.content[0].text;
		// "Done editing main.ts" 是 index=3（session[0], user[1], asst-edit[2], asst-text[3]）
		expect(text).toContain("entry#3");
	});
});

// ── 输出容量 (S4) ─────────────────────────────────────

describe("doGrep 输出容量", () => {
	it("每会话最多 10 条匹配，超限显示提示", async () => {
		const manyMatchesDir = path.join(os.tmpdir(), `session-many-${Date.now()}`);
		const subDir = path.join(manyMatchesDir, "20260512");
		const fp = path.join(subDir, "20260512T120000_many.jsonl");
		fs.mkdirSync(subDir, { recursive: true });

		const entries = [
			{ type: "session", cwd: "/test" },
			...Array.from({ length: 15 }, (_, i) => ({
				type: "message",
				message: { role: "user", content: [{ type: "text", text: `keyword_match_${i}` }] },
			})),
		];
		fs.writeFileSync(fp, entries.map((e) => JSON.stringify(e)).join("\n"), "utf-8");

		try {
			const result = await doGrep(manyMatchesDir, "keyword_match", 10, false);
			const text = result.content[0].text;
			const matchCount = (text.match(/entry#/g) || []).length;
			expect(matchCount).toBe(10);
			expect(text).toContain("还有");
			expect(text).toContain("session_analyze");
		} finally {
			fs.rmSync(manyMatchesDir, { recursive: true, force: true });
		}
	});

	it("匹配文本截断到 200 字符", async () => {
		const longDir = path.join(os.tmpdir(), `session-long-${Date.now()}`);
		const subDir = path.join(longDir, "20260512");
		const fp = path.join(subDir, "20260512T130000_long.jsonl");
		fs.mkdirSync(subDir, { recursive: true });

		const longText = "A".repeat(500) + "TARGET_KEYWORD" + "B".repeat(500);
		const entries = [
			{ type: "session", cwd: "/test" },
			{ type: "message", message: { role: "user", content: longText } },
		];
		fs.writeFileSync(fp, entries.map((e) => JSON.stringify(e)).join("\n"), "utf-8");

		try {
			const result = await doGrep(longDir, "TARGET_KEYWORD", 10, false);
			const text = result.content[0].text;
			expect(text).toContain("TARGET_KEYWORD");
			const lines = text.split("\n").filter((l: string) => l.includes("entry#"));
			for (const line of lines) {
				const textPart = line.split("|").pop() ?? "";
				expect(textPart.length).toBeLessThanOrEqual(201);
			}
		} finally {
			fs.rmSync(longDir, { recursive: true, force: true });
		}
	});

	it("大 toolCall arguments 跨会话搜索集成测试", async () => {
		const bigDir = path.join(os.tmpdir(), `session-big-${Date.now()}`);
		const subDir = path.join(bigDir, "20260512");
		const fp = path.join(subDir, "20260512T140000_bigargs.jsonl");
		fs.mkdirSync(subDir, { recursive: true });

		const bigArgs: Record<string, unknown> = {};
		for (let i = 0; i < 50; i++) {
			bigArgs[`field_${i}`] = `padding_${"_".repeat(80)}_${i}`;
		}
		bigArgs["deep_key"] = "INTEGRATION_TEST_MARKER";

		const entries = [
			{ type: "session", cwd: "/test" },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", name: "roadmap_plan", arguments: bigArgs }],
				},
			},
		];
		fs.writeFileSync(fp, entries.map((e) => JSON.stringify(e)).join("\n"), "utf-8");

		try {
			const result = await doGrep(bigDir, "INTEGRATION_TEST_MARKER", 10, false);
			const text = result.content[0].text;
			expect(text).toContain("INTEGRATION_TEST_MARKER");
			expect(text).toContain("roadmap_plan");
			expect(text).toContain("entry#");
		} finally {
			fs.rmSync(bigDir, { recursive: true, force: true });
		}
	});
});
