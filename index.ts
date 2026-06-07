/**
 * session-analyzer 扩展入口
 *
 * 注册 2 个 pi 自定义工具：
 * - session_search: 跨会话搜索（grep/file/list）
 * - session_analyze: 单会话分析（summary/entries/timeline/chain/raw/audit）
 */

import type {
	AgentToolResult,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	doBranches,
	doChain,
	doEntries,
	doRaw,
	doSummary,
	doTimeline,
} from "./analyze";
import { doAudit } from "./audit";
import { getSessionDir, readJsonlFile, resolveSession } from "./core";
import { doDigest } from "./digest";
import { doGrep, doList } from "./search";
import { doFile } from "./search-file";
import { doTakeover } from "./takeover";

// ── Schema 定义 ──────────────────────────────────────────

const sessionSearchSchema = Type.Object({
	action: Type.Union([
		Type.Literal("grep"),
		Type.Literal("file"),
		Type.Literal("list"),
	]),
	query: Type.Optional(
		Type.String({ description: "搜索关键词 (grep) 或文件路径 (file)" }),
	),
	limit: Type.Optional(
		Type.Number({ description: "限制结果数，默认 20", default: 20 }),
	),
	editOnly: Type.Optional(
		Type.Boolean({ description: "仅 grep 模式：只搜 edit/write 操作" }),
	),
	days: Type.Optional(
		Type.Number({ description: "搜索最近 N 天的会话，默认 7 天。设为 0 表示不限制", default: 7 }),
	),
	startDate: Type.Optional(
		Type.String({ description: "精确起始日期，格式 YYYY-MM-DD（设此参数时 days 被忽略）" }),
	),
	endDate: Type.Optional(
		Type.String({ description: "精确结束日期，格式 YYYY-MM-DD（设此参数时 days 被忽略）" }),
	),
});

const sessionAnalyzeSchema = Type.Object({
	sessionId: Type.String({ description: "会话 ID（支持前缀匹配）" }),
	action: Type.Union([
		Type.Literal("summary"),
		Type.Literal("entries"),
		Type.Literal("timeline"),
		Type.Literal("chain"),
		Type.Literal("raw"),
		Type.Literal("audit"),
		Type.Literal("digest"),
		Type.Literal("branches"),
		Type.Literal("takeover"),
	]),
	limit: Type.Optional(
		Type.Number({ description: "限制条目数（默认 20）", default: 20 }),
	),
	offset: Type.Optional(
		Type.Number({
			description:
				"entries: 从第 N 条开始（0-based）。与 range 互斥，range 优先",
		}),
	),
	grep: Type.Optional(
		Type.String({ description: "entries: 关键词/正则过滤（如 'error|fail'）" }),
	),
	compact: Type.Optional(
		Type.Boolean({
			description:
				"entries: 紧凑输出（去 type 列、role 缩写、预览 60 字符）。默认 false",
		}),
	),
	range: Type.Optional(
		Type.String({
			description:
				"entries: 范围直取。'last:50' 查看末尾，'100-150' 指定区间。与 offset 互斥，优先级高于 offset",
		}),
	),
	index: Type.Optional(
		Type.Number({
			description: "entries: 查看第 N 条详情（0-based，始终按原始会话索引定位，过滤后也直接用显示的序号跳转）",
		}),
	),
	rawEntry: Type.Optional(
		Type.Boolean({
			description:
				"entries: 仅与 index 联用。rawEntry=true 时返回该条目的完整原始内容（无上下文、无截断）",
		}),
	),
	toolName: Type.Optional(
		Type.String({
			description:
				"entries: 按工具名过滤。支持通配符（'code_graph*'）和多值（'edit|write'）",
		}),
	),
	file: Type.Optional(
		Type.String({
			description:
				"entries: 按文件路径过滤（匹配工具参数中的路径）。支持通配符（'*.test.ts'）和多值（'a.ts|b.ts'）",
		}),
	),
});

// ── Params 类型推断 ─────────────────────────────────────

type SessionSearchParams = {
	action: "grep" | "file" | "list";
	query?: string;
	limit?: number;
	editOnly?: boolean;
	days?: number;
	startDate?: string;
	endDate?: string;
};

type SessionAnalyzeParams = {
	sessionId: string;
	action:
		| "summary"
		| "entries"
		| "timeline"
		| "chain"
		| "raw"
		| "audit"
		| "digest"
		| "branches"
		| "takeover";
	limit?: number;
	offset?: number;
	grep?: string;
	compact?: boolean;
	range?: string;
	index?: number;
	rawEntry?: boolean;
	toolName?: string;
	file?: string;
};

// ── 扩展入口 ─────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── session_search ──────────────────────────────────────

	pi.registerTool({
		name: "session_search",
		label: "Session Search",
		description:
			"搜索 Pi 会话。支持三种模式：grep（跨会话全文搜索关键词）、file（查找修改过特定文件的会话）、list（列出最近会话）。",
		promptSnippet: "搜索历史 Pi 会话：关键词、文件修改、会话列表",
		promptGuidelines: [
			"Use session_search to find past discussions, decisions, or file modifications across all Pi sessions.",
			"Use action='grep' for keyword search, action='file' to find sessions that edited a file, action='list' to browse recent sessions.",
		],
		parameters: sessionSearchSchema,

		async execute(
			_id: string,
			params: SessionSearchParams,
			_signal: AbortSignal,
			_onUpdate: undefined,
			_ctx: undefined,
		): Promise<AgentToolResult> {
			try {
				const dir = getSessionDir();
				switch (params.action) {
					case "list":
						return await doList(dir, params.limit ?? 20);
					case "grep":
						return await doGrep(
							dir,
							params.query ?? "",
							params.limit ?? 20,
							params.editOnly ?? false,
							params.days,
							params.startDate,
							params.endDate,
						);
					case "file":
						return await doFile(dir, params.query ?? "", params.limit ?? 20);
					default:
						return {
							content: [
								{ type: "text", text: `未知 action: ${params.action}` },
							],
							details: {},
						};
				}
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `❌ 错误: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
				};
			}
		},
	});

	// ── session_analyze ──────────────────────────────────────

	pi.registerTool({
		name: "session_analyze",
		label: "Session Analyze",
		description:
			"分析单个 Pi 会话。\n" +
			"⚠ 注意：action 只接受以下值，不要传 grep/file/list（那是 session_search 的 action）。\n" +
			"- summary: 元信息+摘要（首次分析首选）\n" +
			"- entries: 条目列表（无参显示前 N 条含用户意图；支持 range/offset/grep/toolName 过滤）\n" +
			"- timeline: 时间线（自动标注分支）\n" +
			"- chain: 子代理链\n" +
			"- raw: 原始 JSONL\n" +
			"- audit: 审计违规问题\n" +
			"- digest: user/assistant 对话序列\n" +
			"- branches: 分支分析（/tree 产生的平行分支）\n" +
			"- takeover: 会话接手报告（5 维上下文）",
		promptSnippet: "深入分析单个 Pi 会话的详情",
		promptGuidelines: [
			"Use session_analyze to inspect a specific session: summary, entries, timeline, subagent chains, or raw JSONL.",
			"Use action='summary' for overview, action='entries' for compact list, action='chain' for subagent tracing, action='audit' to check for rule violations.",
			"Use action='branches' to analyze /tree fork branches — shows each branch's key events separately.",
			"Use action='takeover' to generate a handoff report for continuing work from a previous session (5 dimensions: user intent, modified files, recent steps, next steps, key decisions).",
			"When timeline shows [B1]/[B2] labels, use action='branches' for detailed per-branch analysis.",
		],
		parameters: sessionAnalyzeSchema,

		async execute(
			_id: string,
			params: SessionAnalyzeParams,
			_signal: AbortSignal,
			_onUpdate: undefined,
			_ctx: undefined,
		): Promise<AgentToolResult> {
			try {
				const dir = getSessionDir();
				const resolved = await resolveSession(params.sessionId, dir);
				if (!resolved.ok) {
					return {
						content: [{ type: "text", text: `❌ ${resolved.error}` }],
						details: {},
					};
				}

				const entries = await readJsonlFile(resolved.filepath);
				if (entries.length === 0) {
					return { content: [{ type: "text", text: "会话为空" }], details: {} };
				}

				switch (params.action) {
					case "summary":
						return doSummary(entries, resolved.filepath);
					case "entries":
						return doEntries(entries, {
							limit: params.limit ?? 20,
							offset: params.offset,
							grep: params.grep,
							compact: params.compact,
							range: params.range,
							index: params.index,
							rawEntry: params.rawEntry,
							toolName: params.toolName,
							file: params.file,
						});
					case "timeline":
						return doTimeline(entries);
					case "chain":
						return await doChain(entries, resolved.filepath, dir);
					case "raw":
						return doRaw(entries, params.limit ?? 10);
					case "audit": {
						const cwd = entries.find((e) => e.type === "session")?.cwd as
							| string
							| undefined;
						return await doAudit(entries, cwd);
					}
					case "digest":
						return doDigest(entries);
					case "branches":
						return doBranches(entries);
					case "takeover":
						return await doTakeover(params.sessionId, params.limit ?? 5);
					default:
						return {
							content: [
								{ type: "text", text: `未知 action: ${params.action}` },
							],
							details: {},
						};
				}
			} catch (err: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `❌ 错误: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
				};
			}
		},
	});
}
