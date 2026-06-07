/**
 * session_search file 模式 — 查找修改过特定文件的会话
 */

import * as path from "node:path";

import { truncatedResult } from "@pi-atelier/shared-utils/tool-output";
import {
	extractSummary,
	extractTimestamp,
	getSessionFiles,
	parseSessionId,
	readJsonl,
} from "./core";
import { tryReadFile } from "./search";

const SEARCH_MAX_LINES = 500;
const SEARCH_MAX_BYTES = 20 * 1024; // 20KB

export async function doFile(
	sessionDir: string,
	filePath: string,
	limit: number,
) {
	if (!filePath) {
		return {
			content: [{ type: "text", text: "需要文件路径 (query 参数)" }],
		};
	}

	const files = await getSessionFiles(sessionDir);
	const results: Array<{
		sessionId: string;
		time: string;
		editCount: number;
		writeCount: number;
		firstMsg: string;
	}> = [];

	for (const fp of files) {
		if (results.length >= limit) break;

		const rawText = await tryReadFile(fp);
		if (!rawText) continue;

		if (!rawText.includes(filePath)) continue;

		const entries = readJsonl(rawText);
		let editCount = 0;
		let writeCount = 0;
		let found = false;
		const operations: Array<{ tool: string; path: string; summary: string }> = [];

		for (const entry of entries) {
			if (entry.type !== "message" || !entry.message) continue;
			const content = entry.message.content;
			if (!Array.isArray(content)) continue;

			for (const part of content) {
				if (
					part.type === "toolCall" &&
					(part.name === "edit" || part.name === "write")
				) {
					const pathArg = String(part.arguments?.path ?? "");
					if (
						path.normalize(pathArg).includes(path.normalize(filePath)) ||
						path.normalize(filePath).includes(path.normalize(pathArg))
					) {
						found = true;
						if (part.name === "edit") editCount++;
						if (part.name === "write") writeCount++;
						operations.push({
							tool: part.name,
							path: pathArg,
							summary: String(part.arguments?.oldText ?? "").replace(/\n/g, " ").slice(0, 50),
						});
					}
				}
			}
		}

		if (!found) continue;

		const summary = extractSummary(entries);
		results.push({
			sessionId: parseSessionId(fp),
			time: extractTimestamp(fp),
			editCount,
			writeCount,
			firstMsg: summary.firstMsg.slice(0, 60),
			operations,
		});
	}

	if (results.length === 0) {
		return {
			content: [{ type: "text", text: `未找到修改过 "${filePath}" 的会话` }],
		};
	}

	const output = results
		.map((r) => {
			const opLines = r.operations
				.slice(0, 5) // S4: 每个会话最多展示 5 个操作
				.map(
					(op) =>
						`      ${op.tool} ${path.basename(op.path)}: "${op.summary.replace(/\n/g, " ").slice(0, 50)}..."`,
				);
			const rest = r.operations.length - 5;
				if (rest > 0) opLines.push(`      ... 还有 ${rest} 个操作`);
			const ops = opLines.length > 0 ? `\n${opLines.join("\n")}` : "";
			return (
				`━━━ ${r.sessionId.slice(0, 18)}  ${r.time}\n` +
				`    编辑 ${r.editCount} 次, 写入 ${r.writeCount} 次\n` +
				`    摘要: ${r.firstMsg}${ops}`
			);
		})
		.join("\n\n");

	return truncatedResult(
		`查找修改过 "${filePath}" 的会话 — 共 ${results.length} 个：\n\n${output}`,
		{
			toolName: "session_search",
			label: filePath,
			maxLines: SEARCH_MAX_LINES,
			maxBytes: SEARCH_MAX_BYTES,
		},
	);
}
