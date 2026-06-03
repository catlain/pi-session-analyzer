import { describe, expect, it } from "vitest";
import {
	assignBranch,
	buildEntryMap,
	buildParentChildMap,
	findBranchPoints,
} from "../branches";
import type { Entry } from "../core";

// helper：构造带 id/parentId 的 entry
function entry(
	id: string,
	parentId?: string,
	role?: string,
	content?: string,
): Entry {
	const e: Entry = { type: "message", id };
	if (parentId) e.parentId = parentId;
	if (role || content) {
		e.message = {
			role: role ?? "user",
			content: content ?? "test",
		};
	}
	return e;
}

describe("buildParentChildMap", () => {
	it("正确映射 parent→children", () => {
		const entries = [
			entry("a"),
			entry("b", "a"),
			entry("c", "a"),
			entry("d", "b"),
		];
		const map = buildParentChildMap(entries);
		expect(map.get("a")).toEqual(["b", "c"]);
		expect(map.get("b")).toEqual(["d"]);
		expect(map.has("d")).toBe(false);
	});

	it("空 entries 返回空 map", () => {
		expect(buildParentChildMap([]).size).toBe(0);
	});
});

describe("buildEntryMap", () => {
	it("id→entry 映射", () => {
		const e = entry("x");
		const map = buildEntryMap([e]);
		expect(map.get("x")).toBe(e);
	});

	it("无 id 的 entry 被跳过", () => {
		expect(buildEntryMap([{ type: "message" }]).size).toBe(0);
	});
});

describe("findBranchPoints", () => {
	it("无分支时返回空", () => {
		// 线性链：a→b→c
		const entries = [
			entry("a"),
			entry("b", "a", "assistant"),
			entry("c", "b", "user"),
		];
		expect(findBranchPoints(entries)).toHaveLength(0);
	});

	it("检测 user 触发的分支点", () => {
		// a 有两个 user children: b1, b2
		const entries = [
			entry("a", undefined, "assistant", "模型回复"),
			entry("b1", "a", "user", "分支1消息"),
			entry("b2", "a", "user", "分支2消息"),
			entry("c1", "b1", "assistant", "回复1"),
			entry("c2", "b2", "assistant", "回复2"),
		];
		const bps = findBranchPoints(entries);
		expect(bps).toHaveLength(1);
		expect(bps[0].id).toBe("a");
		expect(bps[0].branches).toHaveLength(2);
		expect(bps[0].branches[0].triggerMsg).toContain("分支1");
		expect(bps[0].branches[1].triggerMsg).toContain("分支2");
	});

	it("只有 assistant children 不算分支", () => {
		const entries = [
			entry("a", undefined, "user", "用户消息"),
			entry("b1", "a", "assistant", "回复1"),
			entry("b2", "a", "assistant", "回复2"),
		];
		expect(findBranchPoints(entries)).toHaveLength(0);
	});
});

describe("assignBranch", () => {
	it("entry 属于某个分支时返回索引", () => {
		const entries = [
			entry("a", undefined, "assistant"),
			entry("b1", "a", "user", "分支1"),
			entry("b2", "a", "user", "分支2"),
			entry("c1", "b1", "assistant"),
		];
		const bps = findBranchPoints(entries);
		const entryMap = buildEntryMap(entries);
		const result = assignBranch(entries[3], bps, entryMap);
		expect(result).toEqual({ bpIdx: 0, branchIdx: 0 });
	});

	it("entry 不属于任何分支时返回 null", () => {
		const entries = [entry("a"), entry("b", "a", "assistant")];
		const bps = findBranchPoints(entries);
		const entryMap = buildEntryMap(entries);
		expect(assignBranch(entries[1], bps, entryMap)).toBeNull();
	});
});
