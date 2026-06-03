/**
 * entries rawIndex 原始索引定位测试
 *
 * rawIndex 允许在 grep/toolName/file 过滤后，
 * 用过滤后的序号跳回原始列表查看该条目的上下文。
 *
 * 例如：grep 过滤后显示 [0] [1] [2]，rawIndex=1 表示
 * 查看过滤后第 1 条在原始列表中的位置及其上下文。
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

describe("entries rawIndex 过滤后序号映射", () => {
	it("rawIndex=0 + grep='edit' → 映射到原始索引中第一个匹配 edit 的位置", () => {
		// grep "edit" 匹配：[5](edit main.ts), [6](edit the config), [7](edit config.json)
		// rawIndex=0 → 原始索引 5 → 显示 entry[5] 及上下文 [2..8]
		const result = doEntries(ENTRIES, { grep: "edit", rawIndex: 0 });
		const text = getText(result);
		expect(text).toContain("edit");     // 目标条目内容
		expect(text).toContain("[5]");      // 原始索引 5
		expect(text).toContain("[4]");      // 上下文
	});

	it("rawIndex=1 + grep='edit' → 映射到第二个匹配的原始索引", () => {
		// grep "edit" 匹配：[5], [6], [7]
		// rawIndex=1 → 原始索引 6 → "edit the config"
		const result = doEntries(ENTRIES, { grep: "edit", rawIndex: 1 });
		const text = getText(result);
		expect(text).toContain("edit the config");
		expect(text).toContain("[6]");
	});

	it("rawIndex=0 + toolName='edit' → 映射到第一个 edit 工具调用的原始索引", () => {
		// toolName="edit" 匹配：[5](edit main.ts), [7](edit config.json)
		// rawIndex=0 → 原始索引 5
		const result = doEntries(ENTRIES, { toolName: "edit", rawIndex: 0 });
		const text = getText(result);
		expect(text).toContain("edit");
		expect(text).toContain("[5]");
	});

	it("rawIndex 超出范围返回错误", () => {
		const result = doEntries(ENTRIES, { rawIndex: 999 });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("rawIndex 超出过滤后范围返回错误", () => {
		// grep "edit" 只有 3 个匹配，rawIndex=10 应该报错
		const result = doEntries(ENTRIES, { grep: "edit", rawIndex: 10 });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("rawIndex 显示原始上下文（不因过滤而断裂）", () => {
		// grep "edit" 过滤后 [0]→orig[5], [1]→orig[6], [2]→orig[7]
		// rawIndex=2 → 原始索引 7 → "edit config.json" 的上下文
		const result = doEntries(ENTRIES, { grep: "edit", rawIndex: 2 });
		const text = getText(result);
		expect(text).toContain("[7]");
		expect(text).toContain("edit");
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
