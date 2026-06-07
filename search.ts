/**
 * session_search 工具实现 — 跨会话搜索（grep/file/list）
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { truncatedResult } from "@pi-atelier/shared-utils/tool-output";

// session_search 的输出阈值
const SEARCH_MAX_LINES = 500;
const SEARCH_MAX_BYTES = 20 * 1024; // 20KB

import {
	type Entry,
	extractSummary,
	getSessionFiles,
	getSessionInfoFromEntries,
	parseSessionId,
	readJsonlFile,
} from "./core";
import { escapeRegex, extractMatchContext } from "./search-utils";

/** 尝试读取文件内容，失败返回 null */
export async function tryReadFile(fp: string): Promise<string | null> {
	try {
		return await readFile(fp, "utf-8");
	} catch {
		return null;
	}
}

export async function doList(sessionDir: string, limit: number) {
	const files = await getSessionFiles(sessionDir);
	const items = files.slice(0, limit);

	const results = await Promise.all(
		items.map(async (fp) => {
			const entries = await readJsonlFile(fp);
			return getSessionInfoFromEntries(entries, fp);
		}),
	);

	const lines = results.map((info) => {
		const edited =
			info.filesEdited.length > 0
				? ` [✎ ${info.filesEdited.map((f) => basename(f)).join(", ")}]`
				: "";
		return (
			`${info.sessionId.slice(0, 18)}  ${info.startTime}  ` +
			`${info.model.slice(0, 20)}  ${info.status}  ` +
			`${info.firstMsg.slice(0, 60)}${edited}`
		);
	});

	return truncatedResult(
		`最近 ${results.length} 个会话（共 ${files.length} 个）：\n${lines.join("\n")}`,
		{
			toolName: "session_search",
			label: "list",
			maxLines: SEARCH_MAX_LINES,
			maxBytes: SEARCH_MAX_BYTES,
		},
	);
}

export async function doGrep(
	sessionDir: string,
	query: string,
	limit: number,
	editOnly: boolean,
) {
	if (!query) {
		return {
			content: [{ type: "text", text: "需要搜索关键词 (query 参数)" }],
		};
	}

	let regex: RegExp;
	try {
		const flags = query === query.toLowerCase() ? "gi" : "g";
		// 多关键词自动 OR 语义："词A 词B 词C" → /词A|词B|词C/gi
		// 如果用户已经用了 |（知道正则语法），保持原样
		const parts = query.split(/\s+/).filter(Boolean);
		const queryExpr =
			parts.length > 1 && !query.includes("|") ? parts.join("|") : query;
		regex = new RegExp(queryExpr, flags);
	} catch {
		// 正则语法错误 → 转义所有词再用 OR 连接
		const parts = query.split(/\s+/).filter(Boolean).map(escapeRegex);
		regex = new RegExp(parts.join("|"), "i");
	}

	const files = await getSessionFiles(sessionDir);
	const allMatches: Array<{
		sessionId: string;
		firstMsg: string;
		matches: Array<{
			entryIdx: number;
			role: string;
			text: string;
			truncated: number;
		}>;
		truncatedCount: number;
	}> = [];

	for (const fp of files) {
		if (allMatches.length >= limit) break;

		const rawText = await tryReadFile(fp);
		if (!rawText) continue;

		const lines = rawText.split("\n");
		const sessionEntries: Entry[] = [];
		const matches: Array<{
			entryIdx: number;
			role: string;
			text: string;
			truncated: number;
		}> = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;
			let entry: Entry;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			sessionEntries.push(entry);

			// entryIdx 与 session_analyze entries index=N 对齐（所有类型，0-based）
			const entryIdx = sessionEntries.length - 1;

			if (editOnly) {
				if (entry.type !== "message" || !entry.message) continue;
				const content = entry.message.content;
				if (!Array.isArray(content)) continue;
				const hasEdit = content.some(
					(p) =>
						p.type === "toolCall" && (p.name === "edit" || p.name === "write"),
				);
				if (!hasEdit) continue;
			}

			// 跳过没有 message 的条目（JSON 元数据行，对 AI 无用）
			if (!entry.message) continue;

			const serialized = JSON.stringify(entry);
			if (!regex.test(serialized)) continue;

			const matchedText = extractMatchContext(entry, regex);
			if (matchedText) {
				// 每个匹配点独立截断，避免多匹配 entry 后面的匹配点丢失
				const textSlice = matchedText
					.split("\n")
					.map((p) => p.slice(0, 200))
					.join("\n");
				matches.push({
					entryIdx,
					role: entry.message.role ?? "unknown",
					text: textSlice,
				});
			}
		}

		if (matches.length > 0) {
			const MAX_MATCHES_PER_SESSION = 10;
			const truncated = matches.length > MAX_MATCHES_PER_SESSION;
			const summary = extractSummary(sessionEntries);
			allMatches.push({
				sessionId: parseSessionId(fp),
				firstMsg: summary.firstMsg.slice(0, 40),
				matches: matches.slice(0, MAX_MATCHES_PER_SESSION),
				truncatedCount: truncated
					? matches.length - MAX_MATCHES_PER_SESSION
					: 0,
			});
		}
	}

	if (allMatches.length === 0) {
		return {
			content: [{ type: "text", text: `未找到匹配 "${query}" 的内容` }],
		};
	}

	const GREP_CONTEXT_LINES = 6; // 每个会话最多显示的匹配行数

	const output = allMatches
		.map((s) => {
			const total = s.matches.length + s.truncatedCount;
			const sid = s.sessionId;
			const header = `── ${sid}  (${total} 匹配)  ${s.firstMsg}`;
			const previewLines = s.matches
				.slice(0, GREP_CONTEXT_LINES)
				.map(
					(m) =>
						`   [${m.entryIdx}] ${m.role.padEnd(9)} ${m.text.split("\n")[0].slice(0, 150)}`,
				);
			if (total > GREP_CONTEXT_LINES) {
				previewLines.push(
					`   ... 还有 ${total - GREP_CONTEXT_LINES} 条匹配`,
				);
			}
			return header + "\n" + previewLines.join("\n");
		})
		.join("\n\n");

	return truncatedResult(
		`跨会话搜索 "${query}" — 在 ${allMatches.length} 个会话中找到匹配：\n\n${output}\n\n用 session_analyze(sessionId, "entries", index=N) 跳转到指定条目查看详情，或 session_analyze(sessionId, "entries", grep="${query}") 浏览该会话所有匹配。`,
		{
			toolName: "session_search",
			label: query,
			maxLines: SEARCH_MAX_LINES,
			maxBytes: SEARCH_MAX_BYTES,
		},
	);
}
