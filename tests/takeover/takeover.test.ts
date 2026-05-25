/**
 * session-takeover doTakeover — 集成测试
 *
 * 测试 doTakeover 主函数与外部依赖的协作
 * @pi-atelier/shared-utils 由 vitest.config.ts 的 alias 重定向到 mock
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Entry } from "../../core";

// 先 mock 依赖
vi.mock("../../core", () => ({
	resolveSession: vi.fn(),
	readJsonlFile: vi.fn(),
	extractSummary: vi.fn(),
	extractText: vi.fn((content: any) => {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.filter((p: any) => p.type === "text" && typeof p.text === "string")
			.map((p: any) => p.text!)
			.join(" ");
	}),
	fmtTime: vi.fn(),
	getSessionInfoFromEntries: vi.fn(),
}));

import * as core from "../../core";
import { doTakeover } from "../../takeover";

// ── 测试数据工厂 ─────────────────────────────────────────

function makeSession(cwd = "/home/project"): Entry {
	return { type: "session", cwd };
}

function makeUser(text: string, idx = 0): Entry {
	return {
		type: "message",
		id: `u-${idx}`,
		message: { role: "user", content: [{ type: "text", text }] },
	};
}

function makeAssistant(parts: Array<{ type: string; text?: string }>, idx = 0): Entry {
	return {
		type: "message",
		id: `a-${idx}`,
		message: { role: "assistant", content: parts },
	};
}

function makeToolCall(name: string, args: Record<string, unknown>, idx = 0): Entry {
	return {
		type: "message",
		id: `tc-${idx}`,
		message: { role: "assistant", content: [{ type: "toolCall", name, arguments: args }] },
	};
}

// ── 测试用例 ─────────────────────────────────────────────

describe("doTakeover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("正常路径：返回完整报告，包含 5 维 + stats", async () => {
		const entries: Entry[] = [
			makeSession(),
			makeUser("帮我开发一个 CLI 工具", 0),
			makeAssistant([{ type: "text", text: "好的，开始吧" }], 0),
			makeUser("用 commander 不用 yargs", 1),
			makeToolCall("edit", { path: "/src/cli.ts" }, 0),
			makeToolCall("write", { path: "/src/commands.ts" }, 1),
			makeAssistant([{ type: "text", text: "完成了 CLI 框架\n接下来需要实现子命令" }], 1),
		];

		vi.mocked(core.resolveSession).mockResolvedValue({ ok: true, filepath: "/s/t123.jsonl" });
		vi.mocked(core.readJsonlFile).mockResolvedValue(entries);
		vi.mocked(core.fmtTime).mockReturnValue("05-15 20:15:00");
		vi.mocked(core.getSessionInfoFromEntries).mockReturnValue({
			sessionId: "t123", filepath: "/s/t123.jsonl", startTime: "05-15 20:15:00",
			model: "gpt-4", firstMsg: "帮我开发一个 CLI 工具",
			editCount: 1, writeCount: 1,
			filesEdited: ["/src/cli.ts", "/src/commands.ts"],
			status: "completed", userMsgCount: 2, assistantMsgCount: 3, toolCallCount: 2,
		});

		const result = await doTakeover("t123", 3);

		// doTakeover 通过 truncatedResult 返回 { content, details }
		expect(result).toHaveProperty("content");
		expect(result).toHaveProperty("details");
		// 验证 content 包含报告文本
		const text = result.content?.[0]?.text ?? "";
		expect(text).toContain("t123");
		expect(text).toContain("/src/cli.ts");
		expect(text).toContain("/src/commands.ts");
	});

	it("会话不存在返回错误消息", async () => {
		vi.mocked(core.resolveSession).mockResolvedValue({
			ok: false, error: "未找到会话: nonexistent",
		});

		const result = await doTakeover("nonexistent");
		const text = JSON.stringify(result);
		expect(text).toContain("错误");
	});

	it("空会话（只有 session 元信息）返回空字段", async () => {
		vi.mocked(core.resolveSession).mockResolvedValue({ ok: true, filepath: "/s/empty.jsonl" });
		vi.mocked(core.readJsonlFile).mockResolvedValue([makeSession()]);
		vi.mocked(core.getSessionInfoFromEntries).mockReturnValue({
			sessionId: "empty", filepath: "/s/empty.jsonl", startTime: "",
			model: "", firstMsg: "", editCount: 0, writeCount: 0,
			filesEdited: [], status: "empty", userMsgCount: 0,
			assistantMsgCount: 0, toolCallCount: 0,
		});

		const result = await doTakeover("empty");
		// truncatedResult 包装后包含 content 和 details
		expect(result).toHaveProperty("content");
		expect(result).toHaveProperty("details");
	});

	it("readJsonlFile 返回空数组时容错", async () => {
		vi.mocked(core.resolveSession).mockResolvedValue({ ok: true, filepath: "/s/bad.jsonl" });
		vi.mocked(core.readJsonlFile).mockResolvedValue([]);
		vi.mocked(core.getSessionInfoFromEntries).mockReturnValue({
			sessionId: "bad", filepath: "/s/bad.jsonl", startTime: "",
			model: "", firstMsg: "", editCount: 0, writeCount: 0,
			filesEdited: [], status: "empty", userMsgCount: 0,
			assistantMsgCount: 0, toolCallCount: 0,
		});

		const result = await doTakeover("bad");
		expect(result).toHaveProperty("content");
		expect(result).toHaveProperty("details");
	});

	it("recentSteps 参数控制返回步数", async () => {
		const entries: Entry[] = [
			makeSession(),
			makeAssistant([{ type: "text", text: "s1" }], 0),
			makeAssistant([{ type: "text", text: "s2" }], 1),
			makeAssistant([{ type: "text", text: "s3" }], 2),
		];

		vi.mocked(core.resolveSession).mockResolvedValue({ ok: true, filepath: "/s/steps.jsonl" });
		vi.mocked(core.readJsonlFile).mockResolvedValue(entries);
		vi.mocked(core.getSessionInfoFromEntries).mockReturnValue({
			sessionId: "steps", filepath: "/s/steps.jsonl", startTime: "",
			model: "", firstMsg: "", editCount: 0, writeCount: 0,
			filesEdited: [], status: "completed", userMsgCount: 0,
			assistantMsgCount: 3, toolCallCount: 0,
		});

		const result = await doTakeover("steps", 2);
		const text = result.content?.[0]?.text ?? "";
		// 验证报告文本包含 recentSteps 内容
		expect(text).toContain("s2");
	});

	it("输出经过 truncatedResult 包装", async () => {
		vi.mocked(core.resolveSession).mockResolvedValue({ ok: true, filepath: "/s/w.jsonl" });
		vi.mocked(core.readJsonlFile).mockResolvedValue([makeSession()]);
		vi.mocked(core.getSessionInfoFromEntries).mockReturnValue({
			sessionId: "w", filepath: "/s/w.jsonl", startTime: "",
			model: "", firstMsg: "", editCount: 0, writeCount: 0,
			filesEdited: [], status: "empty", userMsgCount: 0,
			assistantMsgCount: 0, toolCallCount: 0,
		});

		const result = await doTakeover("w");
		expect(result).toHaveProperty("content");
		expect(result).toHaveProperty("details");
	});
});
