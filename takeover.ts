/**
 * session-takeover 5 维提取 + 主函数
 *
 * 从指定会话提取接手上下文：
 * 用户意图 / 修改文件 / 最近步骤 / 下一步推断 / 关键决策
 */

import type { Entry, ContentPart } from "./core";
import {
	resolveSession,
	readJsonlFile,
	fmtTime,
	getSessionInfoFromEntries,
} from "./core";
import { truncatedResult } from "@pi-atelier/shared-utils";
import {
	type TakeoverReport,
	MAX_INTENT_MSGS,
	MAX_SUMMARY_LEN,
	SCAN_TAIL_ASSISTANTS,
	NEXT_STEP_PATTERNS,
	DECISION_PATTERNS,
	getText,
	truncate,
	hasToolCall,
	formatReport,
} from "./takeover-core";

// ── 5 维提取函数 ────────────────────────────────────────

/** 提取用户意图：前 3 条 user 消息 */
export function extractUserIntent(entries: Entry[]): string[] {
	const intents: string[] = [];
	for (const entry of entries) {
		if (intents.length >= MAX_INTENT_MSGS) break;
		if (entry.type === "message" && entry.message?.role === "user") {
			const text = getText(entry);
			if (text) intents.push(truncate(text, MAX_SUMMARY_LEN));
		}
	}
	return intents;
}

/** 提取修改文件：收集 edit/write 的 path 参数，去重排序 */
export function extractModifiedFiles(entries: Entry[]): string[] {
	const files = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message) continue;
		const content = entry.message.content;
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			if (part.type === "toolCall" && (part.name === "edit" || part.name === "write")) {
				const path = String((part.arguments ?? {}).path ?? "");
				if (path) files.add(path);
			}
		}
	}
	return [...files].sort();
}

/** 提取最近 N 个 assistant 消息摘要 */
export function extractRecentSteps(entries: Entry[], n = 5) {
	const assistants: Entry[] = [];
	for (const entry of entries) {
		if (
			entry.type === "message"
			&& entry.message?.role === "assistant"
			&& Array.isArray(entry.message.content)
			&& !hasToolCall(entry.message.content)
		) {
			assistants.push(entry);
		}
	}
	const tail = assistants.slice(-n);
	return tail.map((e) => ({
		timestamp: e.timestamp ? fmtTime(e.timestamp) : "",
		summary: truncate(getText(e), MAX_SUMMARY_LEN),
	}));
}

/** 从最后几条 assistant 消息推断下一步 */
export function extractNextSteps(entries: Entry[]): string[] {
	const steps: string[] = [];
	const assistants = entries.filter(
		(e) => e.type === "message" && e.message?.role === "assistant",
	);
	const tail = assistants.slice(-SCAN_TAIL_ASSISTANTS);
	for (const entry of tail) {
		const text = getText(entry);
		let match: RegExpExecArray | null;
		NEXT_STEP_PATTERNS.lastIndex = 0;
		while ((match = NEXT_STEP_PATTERNS.exec(text)) !== null) {
			const start = text.lastIndexOf("\n", match.index) + 1;
			const end = text.indexOf("\n", match.index);
			const line = text.slice(start, end === -1 ? text.length : end);
			const trimmed = line.trim();
			if (trimmed && !steps.includes(trimmed)) {
				steps.push(truncate(trimmed, MAX_SUMMARY_LEN));
			}
		}
	}
	return steps;
}

/** 从 user 消息中提取关键决策 */
export function extractKeyDecisions(entries: Entry[]): string[] {
	const decisions: string[] = [];
	for (const entry of entries) {
		if (entry.type === "message" && entry.message?.role === "user") {
			const text = getText(entry);
			DECISION_PATTERNS.lastIndex = 0;
			if (DECISION_PATTERNS.test(text)) {
				DECISION_PATTERNS.lastIndex = 0;
				const trimmed = text.trim();
				if (trimmed && !decisions.includes(trimmed)) {
					decisions.push(truncate(trimmed, MAX_SUMMARY_LEN));
				}
			}
		}
	}
	return decisions;
}

// ── 主函数 ──────────────────────────────────────────────

export async function doTakeover(
	sessionId: string,
	recentSteps = 5,
): Promise<any> {
	const resolved = await resolveSession(sessionId, undefined);
	if (!resolved.ok) {
		return truncatedResult(
			`❌ 错误: ${resolved.error}`,
			{ toolName: "session_analyze", label: "takeover" },
		);
	}

	const entries = await readJsonlFile(resolved.filepath);
	const info = getSessionInfoFromEntries(entries, resolved.filepath);

	const report: TakeoverReport = {
		sessionId: info.sessionId,
		sessionStart: info.startTime,
		model: info.model,
		userIntent: extractUserIntent(entries),
		modifiedFiles: extractModifiedFiles(entries),
		recentSteps: extractRecentSteps(entries, recentSteps),
		nextSteps: extractNextSteps(entries),
		keyDecisions: extractKeyDecisions(entries),
		stats: {
			userMsgs: info.userMsgCount,
			assistantMsgs: info.assistantMsgCount,
			toolCalls: info.toolCallCount,
			edits: info.editCount,
			writes: info.writeCount,
		},
	};

	const lines = formatReport(report);
	return truncatedResult(lines.join("\n"), { toolName: "session_analyze", label: "takeover" });
}
