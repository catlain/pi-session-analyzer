/**
 * doGrep 增强功能测试 — 会话级输出格式
 *
 * 测试：doGrep 只输出会话级概要（ID + 匹配数 + 标题），
 * 不展开详细 entry 内容，引导 AI 用 session_analyze 查看详情
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doGrep } from "../search";

// ── 共享测试数据 ─────────────────────────────────────────

const tmpDir = path.join(os.tmpdir(), `session-analyzer-test-${Date.now()}`);
const sessionSubDir = path.join(tmpDir, "20260512");
const SESSION_FILE = path.join(sessionSubDir, "20260512T100000_test001.jsonl");

const SESSION_1_ENTRIES = [
	{ type: "session", cwd: "/project" },
	{
		type: "message",
		message: {
			role: "user",
			content: [{ type: "text", text: "Edit main.ts" }],
		},
	},
	{
		type: "message",
		message: {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					name: "edit",
					arguments: { path: "/project/src/main.ts" },
				},
			],
		},
	},
	{
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "Done editing main.ts" }],
		},
	},
];

function setupSessionFiles() {
	fs.mkdirSync(sessionSubDir, { recursive: true });
	fs.writeFileSync(
		SESSION_FILE,
		SESSION_1_ENTRIES.map((e) => JSON.stringify(e)).join("\n"),
		"utf-8",
	);
}

function cleanupSessionFiles() {
	try {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

// ── 会话级输出格式 ──────────────────────────────────────

describe("doGrep 会话级概要输出", () => {
	beforeEach(setupSessionFiles);
	afterEach(cleanupSessionFiles);

	it("输出包含会话 ID 和匹配数", async () => {
		const result = await doGrep(tmpDir, "main\\.ts", 10, false);
		const text = result.content[0].text;
		// 应包含 "N 匹配" 格式
		expect(text).toMatch(/\d+ 匹配/);
		// 应包含 session_analyze 引导
		expect(text).toContain("session_analyze");
	});

	it("输出不包含详细 entry 内容（不再有 entry#N）", async () => {
		const result = await doGrep(tmpDir, "main\\.ts", 10, false);
		const text = result.content[0].text;
		// 精简模式下不再展示 entry# 详情
		expect(text).not.toContain("entry#");
	});

	it("搜索 project 能匹配 session cwd", async () => {
		const result = await doGrep(tmpDir, "project", 10, false);
		const text = result.content[0].text;
		expect(text).toMatch(/\d+ 匹配/);
	});
});

// ── 输出容量（精简格式） ─────────────────────────────────

describe("doGrep 输出容量（精简格式）", () => {
	it("多匹配会话只显示总数，不展开详情", async () => {
		const manyMatchesDir = path.join(os.tmpdir(), `session-many-${Date.now()}`);
		const subDir = path.join(manyMatchesDir, "20260512");
		const fp = path.join(subDir, "20260512T120000_many.jsonl");
		fs.mkdirSync(subDir, { recursive: true });

		const entries = [
			{ type: "session", cwd: "/test" },
			...Array.from({ length: 15 }, (_, i) => ({
				type: "message",
				message: {
					role: "user",
					content: [{ type: "text", text: `keyword_match_${i}` }],
				},
			})),
		];
		fs.writeFileSync(
			fp,
			entries.map((e) => JSON.stringify(e)).join("\n"),
			"utf-8",
		);

		try {
			const result = await doGrep(manyMatchesDir, "keyword_match", 10, false);
			const text = result.content[0].text;
			// 应显示匹配数（15 条）
			expect(text).toContain("15 匹配");
			// 不应展开 entry 详情
			expect(text).not.toContain("entry#");
		} finally {
			fs.rmSync(manyMatchesDir, { recursive: true, force: true });
		}
	});

	it("大 toolCall arguments 也能匹配到（会话级）", async () => {
		const bigDir = path.join(os.tmpdir(), `session-big-${Date.now()}`);
		const subDir = path.join(bigDir, "20260512");
		const fp = path.join(subDir, "20260512T140000_bigargs.jsonl");
		fs.mkdirSync(subDir, { recursive: true });

		const bigArgs: Record<string, unknown> = {};
		for (let i = 0; i < 50; i++) {
			bigArgs[`field_${i}`] = `padding_${"_".repeat(80)}_${i}`;
		}
		bigArgs.deep_key = "INTEGRATION_TEST_MARKER";

		const entries = [
			{ type: "session", cwd: "/test" },
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", name: "roadmap_plan", arguments: bigArgs },
					],
				},
			},
		];
		fs.writeFileSync(
			fp,
			entries.map((e) => JSON.stringify(e)).join("\n"),
			"utf-8",
		);

		try {
			const result = await doGrep(bigDir, "INTEGRATION_TEST_MARKER", 10, false);
			const text = result.content[0].text;
			// 应能找到匹配
			expect(text).toContain("1 匹配");
			// 不应展示 entry 详情（不含 roadmap_plan 或 entry#）
			expect(text).not.toContain("entry#");
		} finally {
			fs.rmSync(bigDir, { recursive: true, force: true });
		}
	});
});
