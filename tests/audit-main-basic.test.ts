/**
 * session-analyzer audit 模块 — doAudit 基础测试（空/无违规/文件写入）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../audit-types";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { doAudit } from "../audit";

function bashToolResult(content: string): Entry {
	return {
		type: "message",
		message: { role: "toolResult", toolName: "bash", content },
	};
}

describe("doAudit — 基础", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("空条目返回未发现违规（有全局规则时）", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (
				normalized.includes("AGENTS.md") &&
				normalized.includes(".pi/agent")
			) {
				return Promise.resolve("some global rules");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit([]);
		expect(result.content[0].text).toContain("未发现违规问题");
	});

	it("无违规条目返回未发现违规", async () => {
		(readFile as any).mockImplementation((path: string) => {
			const normalized = path.replace(/\\/g, "/");
			if (
				normalized.includes("AGENTS.md") &&
				normalized.includes(".pi/agent")
			) {
				return Promise.resolve("some global rules");
			}
			return Promise.reject(new Error("not found"));
		});
		const result = await doAudit([
			{ type: "message", message: { role: "user", content: "hello" } },
		]);
		expect(result.content[0].text).toContain("未发现违规问题");
	});

	it("检测到 cat > 写入违规", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([bashToolResult("cat > /tmp/test.txt")]);
		expect(result.content[0].text).toContain("文件修改规则");
		expect(result.content[0].text).toContain("cat >");
	});

	it("检测到 sed -i 写入违规", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([
			bashToolResult("sed -i 's/foo/bar/g' file.txt"),
		]);
		expect(result.content[0].text).toContain("文件修改规则");
		expect(result.content[0].text).toContain("sed -i");
	});

	it("检测到 echo >> 写入违规", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		// 正则 echo\s+>>，echo 后紧跟空格再 >>
		const result = await doAudit([bashToolResult("echo >>/tmp/test.txt")]);
		expect(result.content[0].text).toContain("文件修改规则");
	});

	it("检测到 python -c open 写入违规", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([
			bashToolResult("python3 -c \"open('/tmp/x', 'w')\""),
		]);
		expect(result.content[0].text).toContain("文件修改规则");
		expect(result.content[0].text).toContain("python3 -c");
	});

	it("检测到 tee 写入违规", async () => {
		(readFile as any).mockRejectedValue(new Error("not found"));
		const result = await doAudit([
			bashToolResult("echo data | tee /tmp/test.txt"),
		]);
		expect(result.content[0].text).toContain("文件修改规则");
		expect(result.content[0].text).toContain("tee");
	});
});
