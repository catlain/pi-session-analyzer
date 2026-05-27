/**
 * entries action — 条目列表输出（含 compact 紧凑模式）
 */

import { truncatedResult } from "@pi-atelier/shared-utils/tool-output";
import { type Entry, fmtTime } from "./core";
import { extractText } from "./core";

// ── compact 模式辅助 ──────────────────────────────────

const ROLE_SHORT: Record<string, string> = {
	assistant: "asst",
	toolResult: "toolRes",
	user: "user",
	system: "sys",
};

function roleShort(role: string): string {
	return ROLE_SHORT[role] ?? role.slice(0, 6);
}

function fmtTimeShort(tsStr: string): string {
	if (!tsStr) return "";
	try {
		const d = new Date(tsStr);
		if (isNaN(d.getTime())) return "";
		const bj = new Date(d.getTime() + 8 * 3600_000);
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`;
	} catch {
		return "";
	}
}

// ── 类型 ──────────────────────────────────────────────

export interface DoEntriesOptions {
	limit?: number;
	offset?: number;
	grep?: string;
	compact?: boolean;
}

// ── extractEntryText（从 analyze.ts 移出）──────────────

export function extractEntryText(entry: Entry): string {
	if (entry.message) {
		const content = entry.message.content;
		let text: string;
		if (typeof content === "string") {
			text = content;
		} else if (Array.isArray(content)) {
			// 提取 text + toolCall name + toolCall arguments
			const parts: string[] = [];
			for (const part of content) {
				if (part.type === "text" && part.text) parts.push(part.text);
				if (part.type === "toolCall") {
					parts.push(part.name ?? "");
					if (part.arguments) parts.push(typeof part.arguments === "string" ? part.arguments : JSON.stringify(part.arguments));
				}
			}
			text = parts.join(" ");
		} else {
			text = "";
		}
		return `${entry.message.role ?? ""} ${text} ${entry.message.model ?? ""} ${entry.message.toolName ?? ""}`;
	}
	if (entry.type === "session") {
		return `[session] cwd=${entry.cwd ?? ""} id=${entry.id ?? ""}`;
	}
	return entry.type;
}

// ── doEntries ─────────────────────────────────────────

const ANALYZE_MAX_LINES = 500;
const ANALYZE_MAX_BYTES = 50_000;

export function doEntries(entries: Entry[], limit: number, offset?: number, grep?: string, compact?: boolean): ReturnType<typeof truncatedResult>;
export function doEntries(entries: Entry[], opts: DoEntriesOptions): ReturnType<typeof truncatedResult>;
export function doEntries(
	entries: Entry[],
	limitOrOpts: number | DoEntriesOptions,
	offset?: number,
	grep?: string,
	compact?: boolean,
): ReturnType<typeof truncatedResult> {
	let limitVal: number;
	let offsetVal: number | undefined;
	let grepVal: string | undefined;
	let compactVal: boolean | undefined;

	if (typeof limitOrOpts === "object") {
		limitVal = limitOrOpts.limit ?? 20;
		offsetVal = limitOrOpts.offset;
		grepVal = limitOrOpts.grep;
		compactVal = limitOrOpts.compact;
	} else {
		limitVal = limitOrOpts;
		offsetVal = offset;
		grepVal = grep;
		compactVal = compact;
	}

	let items = entries;

	// 关键词过滤（先过滤再切片，减少输出量）
	if (grepVal) {
		const keyword = grepVal.toLowerCase();
		items = items.filter((entry) => {
			const text = extractEntryText(entry);
			return text.toLowerCase().includes(keyword);
		});
	}

	// 偏移 + 限制
	const totalCount = items.length;
	const start = offsetVal != null ? Math.max(0, offsetVal) : Math.max(0, items.length - limitVal);
	items = items.slice(start, start + limitVal);

	const isCompact = compactVal === true;
	const previewLen = isCompact ? 60 : 100;

	const lines = items.map((entry, idx) => {
		const role = entry.message?.role ?? "";
		const timeFull = entry.timestamp ? fmtTime(entry.timestamp) : "";
		const timeShort = entry.timestamp ? fmtTimeShort(entry.timestamp) : "";
		let text = "";

		if (entry.message) {
			const content = entry.message.content;
			if (typeof content === "string") {
				text = content.slice(0, previewLen);
			} else if (Array.isArray(content)) {
				text = extractText(content).slice(0, previewLen);
				if (!text) {
					const calls = content
						.filter((p) => p.type === "toolCall")
						.map((p) => `${p.name}(...)`);
					if (calls.length) text = calls.join(", ");
				}
			}
		} else if (entry.type === "session") {
			text = `[session start] cwd=${entry.cwd ?? "?"}`;
		}

		if (isCompact) {
			const r = roleShort(role).padEnd(7);
			return `[${String(idx).padStart(3)}] ${r} ${timeShort} ${text}`;
		}
		return `${String(idx).padStart(4)} | ${entry.type.padEnd(8)} | ${role.padEnd(12)} | ${timeFull} | ${text}`;
	});

	const rangeDesc = offsetVal != null
		? `条目 ${start}-${start + items.length - 1}/${totalCount}`
		: `最后 ${items.length}/${entries.length} 条`;
	const filterDesc = grepVal ? `（过滤: "${grepVal}"）` : '';

	return truncatedResult(
		`条目列表 ${rangeDesc}${filterDesc}：\n${lines.join("\n")}`,
		{ toolName: "session_analyze", label: "entries", maxLines: ANALYZE_MAX_LINES, maxBytes: ANALYZE_MAX_BYTES },
	);
}
