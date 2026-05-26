import { describe, it, expect } from "vitest";
import {
	checkSearchOnly,
	checkRepeatedErrors,
	checkEditWriteRatio,
	checkRulesCoverage,
} from "../audit-rules";
import { assistantWithToolCalls, errorResult } from "./audit-helpers";

describe("checkSearchOnly", () => {
	it("3 次搜索 0 次阅读报警", () => {
		const entries = [
			assistantWithToolCalls([{ name: "web_search" }]),
			assistantWithToolCalls([{ name: "web_search" }]),
			assistantWithToolCalls([{ name: "web_search" }]),
		];
		expect(checkSearchOnly(entries)).toHaveLength(1);
	});

	it("搜索后有 web_read 不报警", () => {
		const entries = [
			assistantWithToolCalls([{ name: "web_search" }]),
			assistantWithToolCalls([{ name: "web_search" }]),
			assistantWithToolCalls([{ name: "web_search" }]),
			assistantWithToolCalls([{ name: "web_read" }]),
		];
		expect(checkSearchOnly(entries)).toHaveLength(0);
	});

	it("2 次搜索不报警", () => {
		expect(
			checkSearchOnly([
				assistantWithToolCalls([{ name: "web_search" }]),
				assistantWithToolCalls([{ name: "web_search" }]),
			]),
		).toHaveLength(0);
	});
});

describe("checkRepeatedErrors", () => {
	it("单工具重复 3 次同错误报警", () => {
		const entries = [
			errorResult("edit", "ENOENT: no such file"),
			errorResult("edit", "ENOENT: no such file"),
			errorResult("edit", "ENOENT: no such file"),
		];
		const issues = checkRepeatedErrors(entries);
		expect(issues).toHaveLength(1);
		expect(issues[0].detail).toContain("重复 3 次");
	});

	it("跨 3+ 工具的系统性错误为 error 级别", () => {
		const msg = "connection refused";
		const issues = checkRepeatedErrors([
			errorResult("bash", msg),
			errorResult("bash", msg),
			errorResult("edit", msg),
			errorResult("read", msg),
		]);
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe("error");
		expect(issues[0].rule).toBe("框架级错误");
	});

	it("不足 3 次不报警", () => {
		expect(
			checkRepeatedErrors([errorResult("edit", "err"), errorResult("edit", "err")]),
		).toHaveLength(0);
	});
});

describe("checkEditWriteRatio", () => {
	it("write 远多于 edit 时报告 info", () => {
		const calls = Array.from({ length: 12 }, (_, i) => ({ name: i < 3 ? "edit" : "write" }));
		const issues = checkEditWriteRatio([assistantWithToolCalls(calls)]);
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe("info");
	});

	it("edit 和 write 均衡时不报警", () => {
		expect(
			checkEditWriteRatio([
				assistantWithToolCalls([
					{ name: "edit" },
					{ name: "edit" },
					{ name: "write" },
					{ name: "write" },
				]),
			]),
		).toHaveLength(0);
	});
});

describe("checkRulesCoverage", () => {
	it("有全局规则时不报警", () => {
		expect(
			checkRulesCoverage([{ source: "AGENTS.md", scope: "global", path: "/foo", content: "" }]),
		).toHaveLength(0);
	});

	it("无全局规则时报告 info", () => {
		expect(
			checkRulesCoverage([{ source: "AGENTS.md", scope: "project", path: "/foo", content: "" }]),
		).toHaveLength(1);
	});
});
