/**
 * S2: 统一序号 — index=N 始终在原始 entries 数组中定位
 */

import { describe, expect, it } from "vitest";
import type { Entry } from "../core";
import { doEntries } from "../entries";

export const ENTRIES: Entry[] = [
	{ type: "session", cwd: "/project", parentSession: "p1" } as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:00.000Z",
		message: {
			role: "user",
			content: [{ type: "text", text: "帮我分析这个项目的架构" }],
			model: "gpt-4",
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:01.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "toolCall", name: "read", arguments: { path: "/src/main.ts" } },
			],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:02.000Z",
		message: {
			role: "toolResult",
			content: [{ type: "text", text: "file content here" }],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:03.000Z",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "Let me check more files" }],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:04.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
				{ type: "toolCall", name: "bash", arguments: { cmd: "npm test" } },
			],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:05.000Z",
		message: { role: "user", content: "edit the config" },
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:06.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "toolCall", name: "edit", arguments: { path: "/config.json" } },
			],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:07.000Z",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "All done, tests pass" }],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:08.000Z",
		message: {
			role: "user",
			content: [{ type: "text", text: "好的，提交吧" }],
		},
	} as Entry,
	{
		type: "message",
		timestamp: "2026-05-12T02:00:09.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "toolCall", name: "bash", arguments: { cmd: "git commit" } },
			],
		},
	} as Entry,
];

export function getText(result: ReturnType<typeof doEntries>): string {
	return result.content[0].text;
}

describe("S2: 统一序号 — index=N 在原始 entries 中定位", () => {
	describe("无过滤时 index 行为不变", () => {
		it("index=5 直接定位到原始 entries[5]", () => {
			const result = doEntries(ENTRIES, { index: 5 });
			const text = getText(result);
			expect(text).toContain("edit");
			expect(text).toContain("/src/main.ts");
			expect(text).toContain("[5]");
		});

		it("index=0 定位到第一条（session start）", () => {
			const result = doEntries(ENTRIES, { index: 0 });
			const text = getText(result);
			expect(text).toContain("[0]");
		});
	});

	describe("grep 过滤后 index 仍用原始索引", () => {
		it("grep='edit' + index=5 → 直接定位到原始 entry[5]", () => {
			const result = doEntries(ENTRIES, { grep: "edit", index: 5 });
			const text = getText(result);
			expect(text).toContain("[5]");
			expect(text).toContain("edit");
			expect(text).toContain("/src/main.ts");
		});

		it("grep='edit' + index=7 → 直接定位到原始 entry[7]", () => {
			const result = doEntries(ENTRIES, { grep: "edit", index: 7 });
			const text = getText(result);
			expect(text).toContain("[7]");
			expect(text).toContain("/config.json");
		});

		it("grep='edit' 过滤后列表显示原始索引号", () => {
			const result = doEntries(ENTRIES, { grep: "edit", limit: 10 });
			const text = getText(result);
			expect(text).toMatch(/5 \|/);
			expect(text).toMatch(/6 \|/);
			expect(text).toMatch(/7 \|/);
		});
	});

	describe("toolName 过滤后 index 仍用原始索引", () => {
		it("toolName='edit' + index=5 → 定位到原始 entry[5]", () => {
			const result = doEntries(ENTRIES, { toolName: "edit", index: 5 });
			const text = getText(result);
			expect(text).toContain("[5]");
			expect(text).toContain("/src/main.ts");
		});

		it("toolName='edit' + index=7 → 定位到原始 entry[7]", () => {
			const result = doEntries(ENTRIES, { toolName: "edit", index: 7 });
			const text = getText(result);
			expect(text).toContain("[7]");
			expect(text).toContain("/config.json");
		});

		it("toolName='edit' 过滤后列表显示原始索引号", () => {
			const result = doEntries(ENTRIES, { toolName: "edit", limit: 10 });
			const text = getText(result);
			expect(text).toMatch(/5 \|/);
			expect(text).toMatch(/7 \|/);
			expect(text).not.toMatch(/\b0 \|/);
			expect(text).not.toMatch(/\b1 \|/);
		});
	});

	describe("错误处理", () => {
		it("index 超出原始数组范围返回错误", () => {
			const result = doEntries(ENTRIES, { index: 999 });
			const text = getText(result);
			expect(text).toContain("❌");
		});
	});

	describe("导航提示不包含 rawIndex", () => {
		it("grep 过滤后的导航提示不出现 rawIndex", () => {
			const result = doEntries(ENTRIES, { grep: "edit", limit: 5 });
			const text = getText(result);
			expect(text).not.toContain("rawIndex");
		});

		it("无过滤时的导航提示不出现 rawIndex", () => {
			const result = doEntries(ENTRIES, { limit: 5 });
			const text = getText(result);
			expect(text).not.toContain("rawIndex");
		});
	});
});
