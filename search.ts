/**
 * session_search 工具实现 — 跨会话搜索（grep/file/list）
 */

import { readFile, stat } from "node:fs/promises";
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

/** S3: 格式化工具统计为 Top 5 简要行 */
function formatToolStats(
	toolStats: Record<string, { calls: number; errors: number }>,
): string {
	const entries = Object.entries(toolStats)
		.sort((a, b) => b[1].calls - a[1].calls);
	if (entries.length === 0) return "";
	const top5 = entries.slice(0, 5);
	const rest = entries.length - 5;
	const parts = top5.map(([name, stat]) => `${name}(${stat.calls})`);
	if (rest > 0) parts.push(`+${rest}more`);
	return `  🛠 ${parts.join(" ")}`;
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
		const toolLine = formatToolStats(info.toolStats);
		return (
			`${info.sessionId.slice(0, 18)}  ${info.startTime}  ` +
			`${info.model.slice(0, 20)}  ${info.status}  ` +
			`${info.firstMsg.slice(0, 60)}${edited}${toolLine}`
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

/** 从文件名解析会话时间戳（文件名格式：2026-05-21T02-32-56-378Z_uuid.jsonl） */
function parseSessionTime(filepath: string): number {
	const name = basename(filepath);
	// 匹配文件名开头的 ISO 时间戳
	const m = name.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
	if (m) {
		const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`;
		return new Date(iso).getTime();
	}
	return 0; // 无时间戳的文件排最后
}

/** 解析 startDate/endDate 参数为毫秒时间戳 */
function parseDateRange(
	days?: number,
	startDate?: string,
	endDate?: string,
): { startMs: number; endMs: number } {
	const now = Date.now() + 1000; // +1s 缓冲，避免 mtime 略大于 now 被误过滤

	if (startDate || endDate) {
		// 精确日期模式：startDate/endDate 优先，days 被忽略
		const start = startDate
			? new Date(`${startDate}T00:00:00.000Z`).getTime()
			: 0; // 无起始限制
		const end = endDate
			? new Date(`${endDate}T23:59:59.999Z`).getTime()
			: now;
		return { startMs: start, endMs: end };
	}

	// days 模式
	const d = days ?? 7; // 默认 7 天
	if (d === 0) return { startMs: 0, endMs: now }; // 0 = 不限制
	return { startMs: now - d * 24 * 3600 * 1000, endMs: now };
}

export async function doGrep(
	sessionDir: string,
	query: string,
	limit: number,
	editOnly: boolean,
	days?: number,
	startDate?: string,
	endDate?: string,
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

	// 时间过滤：只搜索时间范围内的会话
	const { startMs, endMs } = parseDateRange(days, startDate, endDate);
	const GREP_MAX_SESSIONS = 5; // 最多返回 5 个会话

	const allMatches: Array<{
		sessionId: string;
		sessionTime: number;
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
		if (allMatches.length >= GREP_MAX_SESSIONS) break;

		// 时间过滤
		if (startMs > 0 || endMs < Date.now()) {
			const sessionTime = parseSessionTime(fp);
			if (sessionTime === 0) {
				// 无时间戳前缀的文件，用 mtime 作为备选
				try {
					const mtime = (await stat(fp)).mtimeMs;
					if (mtime < startMs || mtime > endMs) continue;
				} catch {
					continue;
				}
			} else if (sessionTime < startMs || sessionTime > endMs) {
				continue;
			}
		}

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
