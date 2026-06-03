/**
 * entries 导航增强测试 — range / index / 默认行为变更
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

// ── range="last:N" 尾部直达 ────────────────────────────

describe("entries range 尾部直达", () => {
	it("range='last:3' 返回最后 3 条", () => {
		const result = doEntries(ENTRIES, { range: "last:3" });
		const text = getText(result);
		expect(text).toContain("好的，提交吧");
		expect(text).toContain("All done");
		expect(text).toContain("bash(...)");
		expect(text).not.toContain("帮我分析");
	});

	it("range='last:100' 超出总数时返回全部", () => {
		const result = doEntries(ENTRIES, { range: "last:100" });
		const text = getText(result);
		expect(text).toContain("帮我分析");
		expect(text).toContain("bash(...)"); // 最后一条 git commit 以 bash(...) 显示
	});

	it("range='last:1' 只返回最后 1 条", () => {
		const result = doEntries(ENTRIES, { range: "last:1" });
		const text = getText(result);
		expect(text).toContain("bash(...)");
		expect(text).not.toContain("好的，提交吧");
	});
});

// ── range="M-N" 区间 ─────────────────────────────────

describe("entries range 区间", () => {
	it("range='2-4' 返回第 2 到 4 条", () => {
		const result = doEntries(ENTRIES, { range: "2-4" });
		const text = getText(result);
		expect(text).toContain("read(");
		expect(text).toContain("file content");
		expect(text).toContain("check more files");
		expect(text).not.toContain("帮我分析");
		expect(text).not.toContain("edit the config");
	});

	it("range='0-0' 返回第 1 条（session start）", () => {
		const result = doEntries(ENTRIES, { range: "0-0" });
		const text = getText(result);
		expect(text).toContain("session start");
		expect(text).not.toContain("帮我分析");
	});

	it("range='10-11' 超出范围时自动截断", () => {
		const result = doEntries(ENTRIES, { range: "10-11" });
		const text = getText(result);
		expect(text).toContain("bash(...)");
	});

	it("range='5-3' 起止反转返回错误", () => {
		const result = doEntries(ENTRIES, { range: "5-3" });
		const text = getText(result);
		expect(text).toContain("❌");
	});
});

// ── index=N 详情模式 ─────────────────────────────────

describe("entries index 详情", () => {
	it("index=1 显示详情 + 上下文", () => {
		const result = doEntries(ENTRIES, { index: 1 });
		const text = getText(result);
		expect(text).toContain("[1]");
		expect(text).toContain("帮我分析");
		// 上下文行使用列表格式："   0 | session |"
		expect(text).toContain("   0 | session");
		expect(text).toContain("   2 | message");
	});

	it("index=0 显示 session start", () => {
		const result = doEntries(ENTRIES, { index: 0 });
		const text = getText(result);
		expect(text).toContain("session start");
	});

	it("index 超出范围返回错误", () => {
		const result = doEntries(ENTRIES, { index: 999 });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("index 负数返回错误", () => {
		const result = doEntries(ENTRIES, { index: -1 });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("最后一条上下文只有前面的", () => {
		const result = doEntries(ENTRIES, { index: 10 });
		const text = getText(result);
		expect(text).toContain("git commit");
		// 上下文行使用列表格式："   9 | message |"
		expect(text).toContain("   9 | message");
		expect(text).not.toContain("  11 | message");
	});

	it("详情模式显示完整内容", () => {
		const longText = "这是一段很长很长的内容".repeat(20);
		const entries: Entry[] = [
			{ type: "message", message: { role: "user", content: "short" } } as Entry,
			{ type: "message", timestamp: "2026-05-12T02:00:00.000Z", message: { role: "assistant", content: longText } } as Entry,
			{ type: "message", message: { role: "user", content: "end" } } as Entry,
		];
		const result = doEntries(entries, { index: 1 });
		const text = getText(result);
		expect(text).toContain("这是一段很长很长的内容这是一段很长很长的内容");
	});
});

// ── 默认行为变更 ──────────────────────────────────────

describe("entries 默认行为 — 显示前 N 条", () => {
	it("无参时显示前 N 条（含用户原始意图）", () => {
		const result = doEntries(ENTRIES, { limit: 5 });
		const text = getText(result);
		expect(text).toContain("帮我分析");
		expect(text).toContain("session start");
		expect(text).not.toContain("git commit");
	});

	it("无参时 rangeDesc 显示 '前 N/M 条'", () => {
		const result = doEntries(ENTRIES, { limit: 5 });
		const text = getText(result);
		expect(text).toMatch(/前 \d+\/\d+ 条/);
	});

	it("无参时尾部提示 range='last:N'", () => {
		const result = doEntries(ENTRIES, { limit: 5 });
		const text = getText(result);
		expect(text).toMatch(/last:\d+/);
	});
});

// ── 边缘 + 向后兼容 ──────────────────────────────────

describe("entries 导航边缘情况", () => {
	it("空条目列表 range 不崩溃", () => {
		const result = doEntries([], { range: "last:5" });
		const text = getText(result);
		// 空列表应正常输出
		expect(text).toContain("条目");
	});

	it("空条目列表 index 不崩溃", () => {
		const result = doEntries([], { index: 0 });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("无效 range 格式返回错误", () => {
		const result = doEntries(ENTRIES, { range: "invalid" });
		const text = getText(result);
		expect(text).toContain("❌");
	});

	it("range='last:0' 返回空", () => {
		const result = doEntries(ENTRIES, { range: "last:0" });
		const text = getText(result);
		expect(text).toMatch(/0\/\d+/);
	});

	it("旧参数 offset/limit 仍正常工作", () => {
		const result = doEntries(ENTRIES, 3, 5);
		const text = getText(result);
		expect(text).toContain("条目 5-");
	});
});
