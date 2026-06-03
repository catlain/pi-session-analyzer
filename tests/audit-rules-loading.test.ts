/**
 * session-analyzer audit 模块 — doAudit 规则加载测试（全局/项目/组合/覆盖建议）
 *
 * 规则头（"已加载的规则文件"）只在有违规时显示。因此需要带违规条目的测试同时
 * 验证规则头内容。无违规场景只返回 "未发现违规问题"。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../audit-types";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { doAudit } from "../audit";

function sessionEntry(cwd: string): Entry {
	return { type: "session", cwd };
}

/** 一个能触发文件修改规则的 bash 结果，用来让审计产生违规 */
function bashWriteViolation(): Entry {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "bash",
			content: "cat > /tmp/x.txt",
		},
	};
}

describe("doAudit — 规则加载", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("全局 AGENTS.md 存在时规则头显示 [global]", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (
				normalized.includes("AGENTS.md") &&
				normalized.includes(".pi/agent")
			) {
				return Promise.resolve("test: always use edit");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit([bashWriteViolation()]);
		const text = result.content[0].text;
		expect(text).toContain("已加载的规则文件");
		expect(text).toContain("[global]");
		expect(text).toContain("AGENTS.md");
	});

	it("有全局规则时规则头不显示覆盖建议", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (
				normalized.includes("AGENTS.md") &&
				normalized.includes(".pi/agent")
			) {
				return Promise.resolve("test: always use edit");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit([bashWriteViolation()]);
		expect(result.content[0].text).not.toContain("规则覆盖");
	});

	it("无全局规则时显示创建 AGENTS.md 建议", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([bashWriteViolation()]);
		const text = result.content[0].text;
		expect(text).toContain("规则覆盖");
		expect(text).toContain("创建 ~/.pi/agent/AGENTS.md");
	});

	it("无任何规则文件时显示 (无)", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([bashWriteViolation()]);
		expect(result.content[0].text).toContain("(无)");
	});

	it("sessionCwd 时加载项目 CLAUDE.md", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (
				normalized.includes("AGENTS.md") &&
				normalized.includes(".pi/agent")
			) {
				return Promise.resolve("global rules");
			}
			if (normalized.includes("CLAUDE.md")) {
				return Promise.resolve("project specific rules");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit(
			[sessionEntry("/project"), bashWriteViolation()],
			"/project",
		);
		const text = result.content[0].text;
		expect(text).toContain("[global]");
		expect(text).toContain("[project]");
		expect(text).toContain("CLAUDE.md");
	});

	it("sessionCwd 无项目规则时只显示全局", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (
				normalized.includes("AGENTS.md") &&
				normalized.includes(".pi/agent")
			) {
				return Promise.resolve("global rules");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit(
			[sessionEntry("/project"), bashWriteViolation()],
			"/project",
		);
		const text = result.content[0].text;
		expect(text).toContain("[global]");
		expect(text).not.toContain("[project]");
	});

	it("项目 CLAUDE.md 和项目 AGENTS.md 都加载", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (normalized.includes("AGENTS.md")) {
				return Promise.resolve("agent rules");
			}
			if (normalized.includes("CLAUDE.md")) {
				return Promise.resolve("claude rules");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit(
			[sessionEntry("/project"), bashWriteViolation()],
			"/project",
		);
		const text = result.content[0].text;
		expect(text).toContain("AGENTS.md");
		expect(text).toContain("CLAUDE.md");
	});

	it("全局规则缺失时显示全局路径", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([]);
		const text = result.content[0].text;
		expect(text).toContain("修复范围:");
		expect(text).toContain("全局");
	});
});
