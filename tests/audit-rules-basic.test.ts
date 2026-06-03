import { describe, expect, it } from "vitest";
import {
	checkBashFileWrite,
	checkFileOver500Lines,
	checkSearchBeforeEdit,
} from "../audit-rules";
import { assistantWithToolCalls, toolResult } from "./audit-helpers";

describe("checkBashFileWrite", () => {
	it("检测 sed -i 写入", () => {
		const issues = checkBashFileWrite([
			toolResult("bash", "sed -i 's/old/new/g' file.ts"),
		]);
		expect(issues).toHaveLength(1);
		expect(issues[0].rule).toBe("文件修改规则");
	});

	it("检测 cat > 写入", () => {
		expect(
			checkBashFileWrite([toolResult("bash", "cat > out.txt <<EOF")]),
		).toHaveLength(1);
	});

	it("正常 bash 命令不报警", () => {
		expect(checkBashFileWrite([toolResult("bash", "npm test")])).toHaveLength(
			0,
		);
	});

	it("非 bash 工具不检查", () => {
		expect(
			checkBashFileWrite([toolResult("edit", "sed -i 's/old/new/g'")]),
		).toHaveLength(0);
	});
});

describe("checkSearchBeforeEdit", () => {
	it("多次 edit 前有搜索时不报警", () => {
		const entries = [
			assistantWithToolCalls([{ name: "grep" }]),
			assistantWithToolCalls([{ name: "edit" }]),
			assistantWithToolCalls([{ name: "edit" }]),
			assistantWithToolCalls([{ name: "edit" }]),
		];
		expect(checkSearchBeforeEdit(entries)).toHaveLength(0);
	});

	it("3 次 edit 前无搜索时报 warning", () => {
		const entries = [
			assistantWithToolCalls([{ name: "edit" }]),
			assistantWithToolCalls([{ name: "edit" }]),
			assistantWithToolCalls([{ name: "edit" }]),
		];
		const issues = checkSearchBeforeEdit(entries);
		expect(issues).toHaveLength(1);
		expect(issues[0].rule).toBe("抽象优先原则");
	});

	it("2 次 edit 无搜索不报警", () => {
		const entries = [
			assistantWithToolCalls([{ name: "edit" }]),
			assistantWithToolCalls([{ name: "edit" }]),
		];
		expect(checkSearchBeforeEdit(entries)).toHaveLength(0);
	});
});

describe("checkFileOver500Lines", () => {
	it("检测超过 500 行的文件", () => {
		const issues = checkFileOver500Lines([
			toolResult("bash", "  600 src/main.ts\n  200 src/util.ts"),
		]);
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe("error");
		expect(issues[0].detail).toContain("600");
	});

	it("500 行以下不报警", () => {
		expect(
			checkFileOver500Lines([toolResult("bash", "  400 src/main.ts")]),
		).toHaveLength(0);
	});

	it("忽略超大数字（>10000）", () => {
		expect(
			checkFileOver500Lines([toolResult("bash", "  50000 data.json")]),
		).toHaveLength(0);
	});
});
