/**
 * session-analyzer analyze 模块 — doBranches 单元测试
 *
 * 覆盖：doBranches 的全部路径（无分支点、有分支点、多事件、pv 调用）
 */

import { describe, expect, it } from "vitest";
import { doBranches } from "../analyze";

describe("doBranches", () => {
	it("returns no-branch message when no branch points exist", () => {
		const entries = [
			{
				type: "message",
				id: "m1",
				timestamp: "2026-05-12T10:00:00Z",
				message: { role: "user", content: "hi" },
			},
		];
		const result = doBranches(entries);
		const text = result.content[0].text;
		expect(text).toContain("没有分支");
	});

	it("returns no-branch for empty entries", () => {
		const result = doBranches([]);
		const text = result.content[0].text;
		expect(text).toContain("没有分支");
	});

	it("formats branch points with branches", () => {
		const entries: any[] = [
			{
				type: "message",
				id: "root",
				timestamp: "2026-05-12T10:00:00Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "What do you want?" }],
				},
			},
			{
				type: "message",
				id: "m1",
				parentId: "root",
				timestamp: "2026-05-12T10:00:10Z",
				message: { role: "user", content: "Option A" },
			},
			{
				type: "message",
				id: "m1a",
				parentId: "m1",
				timestamp: "2026-05-12T10:00:20Z",
				message: { role: "assistant", content: "Result A" },
			},
			{
				type: "message",
				id: "m2",
				parentId: "root",
				timestamp: "2026-05-12T10:00:30Z",
				message: { role: "user", content: "Option B" },
			},
			{
				type: "message",
				id: "m2a",
				parentId: "m2",
				timestamp: "2026-05-12T10:00:40Z",
				message: { role: "assistant", content: "Result B" },
			},
		];
		const result = doBranches(entries);
		const text = result.content[0].text;
		expect(text).toContain("分支点");
		expect(text).toContain("Option A");
		expect(text).toContain("Option B");
	});

	it("shows (no text) when branch point brief is empty", () => {
		const entries: any[] = [
			{
				type: "message",
				id: "root",
				timestamp: "2026-05-12T10:00:00Z",
				message: { role: "assistant", content: "" },
			},
			{
				type: "message",
				id: "m1",
				parentId: "root",
				timestamp: "2026-05-12T10:00:10Z",
				message: { role: "user", content: "Choice 1" },
			},
			{
				type: "message",
				id: "m2",
				parentId: "root",
				timestamp: "2026-05-12T10:00:20Z",
				message: { role: "user", content: "Choice 2" },
			},
		];
		const result = doBranches(entries);
		const text = result.content[0].text;
		expect(text).toContain("(无文本)");
	});

	it("shows ellipsis for branches with > 30 events", () => {
		const entries: any[] = [
			{
				type: "message",
				id: "root",
				timestamp: "2026-05-12T10:00:00Z",
				message: { role: "assistant", content: "Pick" },
			},
			{
				type: "message",
				id: "m1",
				parentId: "root",
				timestamp: "2026-05-12T10:00:10Z",
				message: { role: "user", content: "A" },
			},
			{
				type: "message",
				id: "m2",
				parentId: "root",
				timestamp: "2026-05-12T10:00:20Z",
				message: { role: "user", content: "B" },
			},
		];
		// 给 m1 分支加 35 个后续节点（形成线性链）
		let prevId = "m1";
		for (let i = 0; i < 35; i++) {
			const id = `m1_${i}`;
			entries.push({
				type: "message",
				id,
				parentId: prevId,
				timestamp: `2026-05-12T10:00:${30 + i}Z`,
				message: { role: "user", content: `event ${i}` },
			});
			prevId = id;
		}
		const result = doBranches(entries);
		const text = result.content[0].text;
		expect(text).toContain("还有");
		expect(text).toContain("个事件");
	});

	it("recognizes pv tool calls as key events", () => {
		const entries: any[] = [
			{
				type: "message",
				id: "root",
				timestamp: "2026-05-12T10:00:00Z",
				message: { role: "assistant", content: "Options" },
			},
			{
				type: "message",
				id: "m1",
				parentId: "root",
				timestamp: "2026-05-12T10:00:10Z",
				message: { role: "user", content: "A" },
			},
			{
				type: "message",
				id: "m2",
				parentId: "root",
				timestamp: "2026-05-12T10:00:20Z",
				message: { role: "user", content: "B" },
			},
		];
		// m1 链上放一个 pv 工具调用
		entries.push({
			type: "message",
			id: "m1a",
			parentId: "m1",
			timestamp: "2026-05-12T10:00:30Z",
			message: {
				role: "assistant",
				content: [
					{ type: "toolCall", name: "pv", arguments: { action: "process" } },
				],
			},
		});
		const result = doBranches(entries);
		const text = result.content[0].text;
		expect(text).toContain("pv");
		expect(text).toContain("process");
	});
});
