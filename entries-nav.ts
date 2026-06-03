/**
 * entries 导航辅助函数 — parseRange / index 详情 / toolName 过滤
 */

import {
	extractStringValues,
	matchFile,
	matchToolName,
} from "@pi-atelier/shared-utils";
import type { Entry } from "./core";
import { fmtTime } from "./core";

// ── range 解析 ────────────────────────────────────────

export function parseRange(
	range: string,
	total: number,
): { start: number; end: number } | null {
	// "last:N"
	const lastM = range.match(/^last:(\d+)$/i);
	if (lastM) {
		const n = parseInt(lastM[1], 10);
		return { start: Math.max(0, total - n), end: total - 1 };
	}
	// "M-N"
	const rangeM = range.match(/^(\d+)-(\d+)$/);
	if (rangeM) {
		const s = parseInt(rangeM[1], 10);
		const e = parseInt(rangeM[2], 10);
		if (s > e) return null;
		return { start: s, end: Math.min(e, total - 1) };
	}
	return null;
}

// ── index 详情块 ──────────────────────────────────────

const INDEX_DETAIL_MAX = 5000;

/** 判断条目是否匹配指定 toolName（支持通配符/多值） */
function hasToolName(entry: Entry, toolName: string): boolean {
	if (!entry.message) return false;

	// assistant 消息含 toolCalls
	if (
		entry.message.role === "assistant" &&
		Array.isArray(entry.message.content)
	) {
		for (const part of entry.message.content) {
			if (part.type === "toolCall" && matchToolName(toolName, part.name))
				return true;
		}
	}

	// toolResult 消息的 message.toolName
	if (matchToolName(toolName, entry.message.toolName ?? "")) return true;

	return false;
}

/** 按工具名过滤条目 */
export function filterByToolName(entries: Entry[], toolName: string): Entry[] {
	return entries.filter((e) => hasToolName(e, toolName));
}

/** 从条目的工具调用参数中提取所有字符串值（用于 file 过滤） */
function extractFilePaths(entry: Entry): string[] {
	if (!entry.message) return [];
	const paths: string[] = [];

	if (
		entry.message.role === "assistant" &&
		Array.isArray(entry.message.content)
	) {
		for (const part of entry.message.content) {
			if (part.type === "toolCall" && part.arguments) {
				paths.push(...extractStringValues(part.arguments));
			}
		}
	}

	return paths;
}

/** 按文件路径过滤条目 */
export function filterByFile(entries: Entry[], file: string): Entry[] {
	return entries.filter((e) => matchFile(file, extractFilePaths(e)));
}

/** 获取条目完整文本（不截断） */
function fullText(entry: Entry): string {
	if (!entry.message) {
		if (entry.type === "session")
			return `[session start] cwd=${entry.cwd ?? "?"}`;
		return entry.type;
	}
	const content = entry.message.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const part of content) {
			if (part.type === "text" && part.text) parts.push(part.text);
			if (part.type === "toolCall") {
				parts.push(
					`${part.name}(${typeof part.arguments === "string" ? part.arguments : JSON.stringify(part.arguments ?? "")})`,
				);
			}
		}
		return parts.join("\n");
	}
	return "";
}

/** 生成条目列表末尾的导航提示 */
export function buildNavHint(
	total: number,
	start: number,
	shown: number,
	_rangeVal?: string,
	_offsetVal?: number,
	grepVal?: string,
	toolNameVal?: string,
	_indexVal?: number,
	hasGrepOrFilter?: boolean,
): string {
	if (total === 0) return "";

	const tips: string[] = [];
	const end = start + shown - 1;
	const isHead = start === 0;
	const isTail = end >= total - 1;

	// 当前位置不是尾部 → 提示查看末尾
	if (!isTail) {
		tips.push(`range="last:50"  查看末尾`);
	}

	// 当前位置不是头部 → 提示查看头部
	if (!isHead) {
		tips.push(`无参或 offset=0  查看开头`);
	}

	// range 区间提示
	tips.push(`range="${start}-${Math.min(end + 50, total - 1)}"  继续往后`);

	// 其他功能提示
	tips.push(`index=N  查看第 N 条详情`);
	if (hasGrepOrFilter)
		tips.push(
			`rawIndex=N  用原始会话索引定位上下文（grep/toolName 过滤后跳回原始上下文）`,
		);
	if (!grepVal) tips.push(`grep="关键词"  按内容过滤`);
	if (!toolNameVal) tips.push(`toolName="edit"  按工具名过滤`);

	return `\n\n📊 共 ${total} 条。继续查看请调用 session_analyze(sessionId, "entries", ...)：\n  • ${tips.join("\n  • ")}`;
}
export function indexDetail(
	entries: Entry[],
	index: number,
	compact?: boolean,
): string {
	if (index < 0 || index >= entries.length) {
		return `❌ 索引 ${index} 超出范围（0-${entries.length - 1}）`;
	}

	const CONTEXT = 3; // 前后各 3 条上下文
	const ctxStart = Math.max(0, index - CONTEXT);
	const ctxEnd = Math.min(entries.length - 1, index + CONTEXT);

	const lines: string[] = [];

	for (let i = ctxStart; i <= ctxEnd; i++) {
		const entry = entries[i];
		const isTarget = i === index;

		if (isTarget) {
			// 详情块
			const role = entry.message?.role ?? "";
			const time = entry.timestamp ? fmtTime(entry.timestamp) : "";
			const text = fullText(entry);
			const display =
				text.length > INDEX_DETAIL_MAX
					? `${text.slice(0, INDEX_DETAIL_MAX)}\n... (截断，原文 ${text.length} 字符)`
					: text;

			lines.push(`┌─── [${i}] ${role} ${time} ───`);
			if (entry.message?.toolName) {
				lines.push(`│ 工具: ${entry.message.toolName}`);
			}
			if (
				entry.message?.role === "assistant" &&
				Array.isArray(entry.message?.content)
			) {
				for (const part of entry.message.content) {
					if (part.type === "toolCall") {
						const args =
							typeof part.arguments === "string"
								? part.arguments
								: JSON.stringify(part.arguments ?? "");
						lines.push(`│ 调用: ${part.name}(${args.slice(0, 80)})`);
					}
				}
			}
			for (const line of display.split("\n")) {
				lines.push(`│ ${line}`);
			}
			lines.push("└───");
		} else {
			// 上下文行 — 格式与列表模式统一
			const role = entry.message?.role ?? "";
			const time = entry.timestamp ? fmtTime(entry.timestamp) : "";
			const text = fullText(entry)
				.slice(0, compact ? 60 : 100)
				.replace(/\n/g, "\\n");
			if (compact) {
				lines.push(
					`[${String(i).padStart(3)}] ${role.slice(0, 7).padEnd(7)} ${time.slice(11) || ""} ${text || "(empty)"}`,
				);
			} else {
				lines.push(
					`${String(i).padStart(4)} | ${entry.type.padEnd(8)} | ${role.padEnd(12)} | ${time} | ${text || "(empty)"}`,
				);
			}
		}
	}

	return lines.join("\n");
}
