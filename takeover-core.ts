/**
 * session-takeover 类型、常量、辅助函数、格式化
 */

import type { Entry, ContentPart } from "./core";
import { extractText, fmtTime } from "./core";

// ── 类型 ────────────────────────────────────────────────

export interface Step {
	timestamp: string;
	summary: string;
}

export interface TakeoverReport {
	sessionId: string;
	sessionStart: string;
	model: string;
	userIntent: string[];
	modifiedFiles: string[];
	recentSteps: Step[];
	nextSteps: string[];
	keyDecisions: string[];
	stats: {
		userMsgs: number;
		assistantMsgs: number;
		toolCalls: number;
		edits: number;
		writes: number;
	};
}

// ── 常量 ────────────────────────────────────────────────

export const MAX_INTENT_MSGS = 8;
export const MAX_SUMMARY_LEN = 800;
export const SCAN_TAIL_ASSISTANTS = 5;

export const NEXT_STEP_PATTERNS = /继续\s*Step|接下来|下一步|TODO|FIXME|待完成/g;
export const DECISION_PATTERNS = /不用|改为|换成|必须|禁止|我觉得|用.*不要/g;

// ── 辅助函数 ────────────────────────────────────────────

/** 从 entry 的 content 中提取文本 */
export function getText(entry: Entry): string {
	if (!entry.message?.content) return "";
	return extractText(entry.message.content as ContentPart[] | string);
}

/** 截断文本到指定长度 */
export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max - 3) + "...";
}

/** 检查 content parts 中是否包含 toolCall */
export function hasToolCall(content: ContentPart[] | string | undefined): boolean {
	if (!Array.isArray(content)) return false;
	return content.some((p) => p.type === "toolCall");
}

// ── 格式化 ──────────────────────────────────────────────

export function formatReport(r: TakeoverReport): string[] {
	const L: string[] = [];
	L.push(`# 会话接手报告: ${r.sessionId}`);
	L.push(`开始: ${r.sessionStart}  模型: ${r.model}`);
	L.push(`统计: ${r.stats.userMsgs} user / ${r.stats.assistantMsgs} assistant / ${r.stats.toolCalls} toolCalls / ${r.stats.edits} edits / ${r.stats.writes} writes`);
	L.push("");

	if (r.userIntent.length > 0) {
		L.push("## 用户意图");
		for (const u of r.userIntent) L.push(`- ${u}`);
		L.push("");
	}

	if (r.modifiedFiles.length > 0) {
		L.push("## 修改过的文件");
		for (const f of r.modifiedFiles) L.push(`- ${f}`);
		L.push("");
	}

	if (r.recentSteps.length > 0) {
		L.push("## 最近步骤");
		for (const s of r.recentSteps) {
			L.push(`- [${s.timestamp}] ${s.summary}`);
		}
		L.push("");
	}

	if (r.nextSteps.length > 0) {
		L.push("## 推断的下一步");
		for (const s of r.nextSteps) L.push(`- ${s}`);
		L.push("");
	}

	if (r.keyDecisions.length > 0) {
		L.push("## 关键决策");
		for (const d of r.keyDecisions) L.push(`- ${d}`);
		L.push("");
	}

	return L;
}
