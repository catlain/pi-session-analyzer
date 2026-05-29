/**
 * entries rawIndex 原始索引定位测试
 *
 * rawIndex 允许在 grep/toolName/file 过滤后，
 * 用原始会话索引跳回未过滤列表查看上下文。
 */

import { describe, it, expect } from "vitest";
import { doEntries } from "../entries";
import type { Entry } from "../core";

const ENTRIES: Entry[] = [
	{ type: "session", cwd: "/project", parentSession: "p1" } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "帮我分析这个项目的架构" }], model: "gpt-4" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:01.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: { path: "/src/main.ts" } }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:02.000Z", message: { role: "toolResult", content: [{ type: "text", text: "file content here" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:03.000Z", message: { role: "assistant", content: [{ type: "text", text: "Let me check more files" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:04.000Z", message: { role: "assistant", content: [
		{ type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
		{ type: "toolCall", name: "bash", arguments: { cmd: "npm test" } },
	] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:05.000Z", message: { role: "user", content: "edit the config" } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:06.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "edit", arguments: { path: "/config.json" } }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:07.000Z", message: { role: "assistant", content: [{ type: "text", text: "All done, tests pass" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:08.000Z", message: { role: "user", content: [{ type: "text", text: "好的，提交吧" }] } } as Entry,
	{ type: "message", timestamp: "2026-05-12T02:00:09.000Z", message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { cmd: "git commit" } }] } } as Entry,
];

function getText(result: ReturnType<typeof doEntries>): string {
	return result.content[0].text;
}

describe("entries rawIndex 原始索引定位", () => {
	it("rawIndex 在原始列表中定位，忽略 grep 过滤", () => {
		const result = doEntries(ENTRIES, { grep: "edit", rawIndex: 1 });
		const text = getText(result);
		expect(text).toContain("帮我分析");
		expect(text).toContain("[0]"); // 前一条上下文
		expect(text).toContain("[2]"); // 后一条上下文
	});

	it("rawIndex 在原始列表中定位，忽略 toolName 过滤", () => {
		const result = doEntries(ENTRIES, { toolName: "edit", rawIndex: 0 });
		const text = getText(result);
		expect(text).toContain("session start");
	});

	it("rawIndex 超出范围返回错误", () => {
		const result = doEntries(ENTRIES, { rawIndex: 999 });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("rawIndex 显示原始上下文（不因过滤而断裂）", () => {
		// grep "edit" 过滤后只剩几条
		// rawIndex=7 应该显示原始列表中前后 3 条上下文
		const result = doEntries(ENTRIES, { grep: "edit", rawIndex: 7 });
		const text = getText(result);
		expect(text).toContain("[7]");
		expect(text).toContain("edit the config");
		expect(text).toContain("[6]"); // 前一条
		expect(text).toContain("[8]"); // 后一条
	});

	it("grep 结果导航提示包含 rawIndex 提示", () => {
		const result = doEntries(ENTRIES, { grep: "edit", limit: 5 });
		const text = getText(result);
		expect(text).toContain("rawIndex=N");
	});

	it("无过滤时导航提示不包含 rawIndex", () => {
		const result = doEntries(ENTRIES, { limit: 5 });
		const text = getText(result);
		expect(text).not.toContain("rawIndex=N");
	});
});
