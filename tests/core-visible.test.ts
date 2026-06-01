/**
 * core-visible.ts 单元测试
 *
 * 测试 getVisibleSubagentFiles、extractSessionIdFromFirstLine、resolveVisibleSession
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Mock } from "vitest";

// 模拟 node:os 和 node:fs/promises
const mockTmpdir = vi.fn(() => "/tmp");
const mockReaddir = vi.fn() as Mock;
const mockStat = vi.fn() as Mock;
const mockReadFile = vi.fn() as Mock;

vi.mock("node:os", () => ({ tmpdir: mockTmpdir }));
vi.mock("node:fs/promises", () => ({
	readdir: mockReaddir,
	stat: mockStat,
	readFile: mockReadFile,
}));

const { getVisibleSubagentFiles, extractSessionIdFromFirstLine, resolveVisibleSession } =
	await import("../core-visible.js");

// ── getVisibleSubagentFiles ──

describe("getVisibleSubagentFiles", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("readdir 失败时返回空数组", async () => {
		mockReaddir.mockRejectedValue(new Error("permission denied"));
		const result = await getVisibleSubagentFiles();
		expect(result).toEqual([]);
	});

	it("只收集 pi-visible-* 目录的 session.jsonl", async () => {
		mockTmpdir.mockReturnValue("/tmp");
		mockReaddir.mockResolvedValue(["pi-visible-a1b2", "other-dir", "pi-visible-c3d4"]);
		mockStat.mockImplementation(async (p: string) => {
			expect(p).toMatch(/[\\/]tmp[\\/]pi-visible-[^\\/]+[\\/]session\.jsonl$/);
			return { isFile: () => true };
		});
		const result = await getVisibleSubagentFiles();
		expect(result).toHaveLength(2);
		expect(result[0]).toMatch(/[\\/]tmp[\\/]pi-visible-a1b2[\\/]session\.jsonl$/);
		expect(result[1]).toMatch(/[\\/]tmp[\\/]pi-visible-c3d4[\\/]session\.jsonl$/);
	});

	it("跳过 stat 失败或无 session.jsonl 的目录", async () => {
		mockTmpdir.mockReturnValue("/tmp");
		mockReaddir.mockResolvedValue(["pi-visible-no-file", "pi-visible-ok", "pi-visible-bad"]);
		let callCount = 0;
		mockStat.mockImplementation(async (_p: string) => {
			callCount++;
			if (callCount === 2) return { isFile: () => true }; // pi-visible-ok: ok
			throw new Error("ENOENT"); // pi-visible-no-file and pi-visible-bad: fail
		});
		const result = await getVisibleSubagentFiles();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatch(/[\\/]tmp[\\/]pi-visible-ok[\\/]session\.jsonl$/);
	});
});

// ── extractSessionIdFromFirstLine ──

describe("extractSessionIdFromFirstLine", () => {
	it("有效 session 行返回 id", () => {
		expect(extractSessionIdFromFirstLine('{"type":"session","id":"abc123"}')).toBe("abc123");
	});

	it("非 session 类型返回 undefined", () => {
		expect(extractSessionIdFromFirstLine('{"type":"message","id":"x"}')).toBeUndefined();
	});

	it("无 id 字段返回 undefined", () => {
		expect(extractSessionIdFromFirstLine('{"type":"session"}')).toBeUndefined();
	});

	it("无效 JSON 返回 undefined", () => {
		expect(extractSessionIdFromFirstLine("not json")).toBeUndefined();
	});
});

// ── resolveVisibleSession ──

describe("resolveVisibleSession", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("找到匹配 sessionId 的文件", async () => {
		mockReadFile.mockResolvedValue('{"type":"session","id":"sess-xyz-123"}');
		const result = await resolveVisibleSession("xyz", [
			"/tmp/pi-visible-1/session.jsonl",
			"/tmp/pi-visible-2/session.jsonl",
		]);
		expect(result).toBe("/tmp/pi-visible-1/session.jsonl");
	});

	it("读文件失败时跳过继续扫描", async () => {
		mockReadFile
			.mockRejectedValueOnce(new Error("ENOENT"))
			.mockResolvedValueOnce('{"type":"session","id":"target-999"}');
		const result = await resolveVisibleSession("target-999", [
			"/tmp/pi-visible-a/session.jsonl",
			"/tmp/pi-visible-b/session.jsonl",
		]);
		expect(result).toBe("/tmp/pi-visible-b/session.jsonl");
	});

	it("首行为空时跳过", async () => {
		mockReadFile.mockResolvedValue("\n\n");
		const result = await resolveVisibleSession("xyz", [
			"/tmp/pi-visible-x/session.jsonl",
		]);
		expect(result).toBeUndefined();
	});

	it("无可匹配文件时返回 undefined", async () => {
		mockReadFile.mockResolvedValue('{"type":"session","id":"aaa"}');
		const result = await resolveVisibleSession("bbb", [
			"/tmp/pi-visible-x/session.jsonl",
		]);
		expect(result).toBeUndefined();
	});
});
