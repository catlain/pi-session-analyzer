/**
 * session-takeover 提取函数：最近步骤 + 下一步 + 决策 — 单元测试
 */

import { describe, it, expect } from "vitest";
import { makeUser, makeAssistant, makeAssistantWithTs } from "./helpers";
import { extractRecentSteps, extractNextSteps, extractKeyDecisions } from "../../takeover";

// ── extractRecentSteps ────────────────────────────────────

describe("extractRecentSteps", () => {
	it("提取最后 N 个 assistant 消息", () => {
		const entries = [
			makeAssistant([{ type: "text", text: "s1" }], 0),
			makeAssistant([{ type: "text", text: "s2" }], 1),
			makeAssistant([{ type: "text", text: "s3" }], 2),
		];
		const r = extractRecentSteps(entries, 2);
		expect(r).toHaveLength(2);
		expect(r[0].summary).toContain("s2");
		expect(r[1].summary).toContain("s3");
	});

	it("摘要截断到 200 字符", () => {
		const long = "x".repeat(300);
		const r = extractRecentSteps([makeAssistant([{ type: "text", text: long }], 0)], 5);
		expect(r[0].summary.length).toBeLessThanOrEqual(800);
	});

	it("无 assistant 消息返回空数组", () => {
		expect(extractRecentSteps([makeUser("hi", 0)], 5)).toEqual([]);
	});

	it("空 entries 返回空数组", () => {
		expect(extractRecentSteps([], 5)).toEqual([]);
	});

	it("不传 n 默认 5", () => {
		const entries = Array.from({ length: 6 }, (_, i) =>
			makeAssistant([{ type: "text", text: `s${i}` }], i),
		);
		expect(extractRecentSteps(entries)).toHaveLength(5);
	});

	it("Step 包含 timestamp 和 summary", () => {
		const r = extractRecentSteps(
			[makeAssistantWithTs("hi", "2026-05-12T10:00:00.000Z", 0)], 5,
		);
		expect(r[0]).toHaveProperty("timestamp");
		expect(r[0]).toHaveProperty("summary");
	});
});

// ── extractNextSteps ──────────────────────────────────────

describe("extractNextSteps", () => {
	it("匹配「继续 Step」模式", () => {
		const r = extractNextSteps([
			makeAssistant([{ type: "text", text: "继续 Step 3：添加测试" }], 0),
		]);
		expect(r.some((s) => s.includes("Step 3"))).toBe(true);
	});

	it("匹配「接下来」「下一步」", () => {
		const entries = [
			makeAssistant([{ type: "text", text: "接下来需要实现 API" }], 0),
			makeAssistant([{ type: "text", text: "下一步是优化性能" }], 1),
		];
		const r = extractNextSteps(entries);
		expect(r.some((s) => s.includes("接下来"))).toBe(true);
		expect(r.some((s) => s.includes("下一步"))).toBe(true);
	});

	it("匹配 TODO / FIXME / 待完成", () => {
		const entries = [
			makeAssistant([{ type: "text", text: "TODO: 添加错误处理" }], 0),
			makeAssistant([{ type: "text", text: "FIXME: 修复泄漏" }], 1),
			makeAssistant([{ type: "text", text: "待完成：补充文档" }], 2),
		];
		const r = extractNextSteps(entries);
		expect(r.some((s) => s.includes("TODO"))).toBe(true);
		expect(r.some((s) => s.includes("FIXME"))).toBe(true);
		expect(r.some((s) => s.includes("待完成"))).toBe(true);
	});

	it("无匹配返回空数组", () => {
		const r = extractNextSteps([
			makeAssistant([{ type: "text", text: "已完成全部修改" }], 0),
		]);
		expect(r).toEqual([]);
	});

	it("空 entries 返回空数组", () => {
		expect(extractNextSteps([])).toEqual([]);
	});
});

// ── extractKeyDecisions ───────────────────────────────────

describe("extractKeyDecisions", () => {
	it("匹配「不用」「改为」「换成」", () => {
		const entries = [
			makeUser("不用 FastAPI，改为用 Flask", 0),
			makeUser("把 logging 换成 loguru", 1),
		];
		const r = extractKeyDecisions(entries);
		expect(r.some((s) => s.includes("FastAPI"))).toBe(true);
		expect(r.some((s) => s.includes("loguru"))).toBe(true);
	});

	it("匹配「用.*不要」「必须」「禁止」", () => {
		const entries = [
			makeUser("用 pydantic 不要用 marshmallow", 0),
			makeUser("必须用 TypeScript 严格模式", 1),
			makeUser("禁止使用 any", 2),
		];
		const r = extractKeyDecisions(entries);
		expect(r.some((s) => s.includes("pydantic"))).toBe(true);
		expect(r.some((s) => s.includes("TypeScript"))).toBe(true);
		expect(r.some((s) => s.includes("any"))).toBe(true);
	});

	it("匹配「我觉得」", () => {
		const r = extractKeyDecisions([makeUser("我觉得用 vitest 比较好", 0)]);
		expect(r.some((s) => s.includes("vitest"))).toBe(true);
	});

	it("无决策模式返回空数组", () => {
		const entries = [
			makeUser("帮我看看这个文件", 0),
			makeUser("运行测试", 1),
		];
		expect(extractKeyDecisions(entries)).toEqual([]);
	});

	it("空 entries 返回空数组", () => {
		expect(extractKeyDecisions([])).toEqual([]);
	});
});
