/**
 * session-analyzer 扩展入口
 *
 * 注册 2 个 pi 自定义工具：
 * - session_search: 跨会话搜索（grep/file/list）
 * - session_analyze: 单会话分析（summary/entries/timeline/chain/raw/audit）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getSessionDir, resolveSession, readJsonlFile } from "./core";
import { doList, doGrep } from "./search";
import { doFile } from "./search-file";
import {
  doSummary,
  doEntries,
  doTimeline,
  doChain,
  doRaw,
  doBranches,
} from "./analyze";
import { doDigest } from "./digest";
import { doAudit } from "./audit";
import { doTakeover } from "./takeover";

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
    parameters: Type.Object({
      action: Type.Union([Type.Literal("grep"), Type.Literal("file"), Type.Literal("list")]),
      query: Type.Optional(
        Type.String({ description: "搜索关键词 (grep) 或文件路径 (file)" }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "限制结果数，默认 20", default: 20 }),
      ),
      editOnly: Type.Optional(
        Type.Boolean({ description: "仅 grep 模式：只搜 edit/write 操作" }),
      ),
    }),

    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any): Promise<any> {
      try {
        const dir = getSessionDir();
        switch (params.action) {
          case "list":
            return await doList(dir, params.limit ?? 20);
          case "grep":
            return await doGrep(dir, params.query ?? "", params.limit ?? 20, params.editOnly ?? false);
          case "file":
            return await doFile(dir, params.query ?? "", params.limit ?? 20);
          default:
            return { content: [{ type: "text", text: `未知 action: ${params.action}` }], details: {} };
        }
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `❌ 错误: ${err instanceof Error ? err.message : String(err)}` }], details: {} };
      }
    },
  });

  // ── session_analyze ──────────────────────────────────────

  pi.registerTool({
    name: "session_analyze",
    label: "Session Analyze",
    description:
      "分析单个 Pi 会话。\n"
      + "⚠ 注意：action 只接受以下值，不要传 grep/file/list（那是 session_search 的 action）。\n"
      + "- summary: 元信息+摘要（首次分析首选）\n"
      + "- entries: 条目列表（支持 offset 偏移 + grep 关键词过滤）\n"
      + "- timeline: 时间线（自动标注分支）\n"
      + "- chain: 子代理链\n"
      + "- raw: 原始 JSONL\n"
      + "- audit: 审计违规问题\n"
      + "- digest: user/assistant 对话序列\n"
      + "- branches: 分支分析（/tree 产生的平行分支）\n"
      + "- takeover: 会话接手报告（5 维上下文）",
    promptSnippet: "深入分析单个 Pi 会话的详情",
    promptGuidelines: [
      "Use session_analyze to inspect a specific session: summary, entries, timeline, subagent chains, or raw JSONL.",
      "Use action='summary' for overview, action='entries' for compact list, action='chain' for subagent tracing, action='audit' to check for rule violations.",
      "Use action='branches' to analyze /tree fork branches — shows each branch's key events separately.",
      "Use action='takeover' to generate a handoff report for continuing work from a previous session (5 dimensions: user intent, modified files, recent steps, next steps, key decisions).",
      "When timeline shows [B1]/[B2] labels, use action='branches' for detailed per-branch analysis.",
    ],
    parameters: Type.Object({
      sessionId: Type.String({ description: "会话 ID（支持前缀匹配）" }),
      action: Type.Union([
        Type.Literal("summary"), Type.Literal("entries"), Type.Literal("timeline"),
        Type.Literal("chain"), Type.Literal("raw"), Type.Literal("audit"),
        Type.Literal("digest"), Type.Literal("branches"),
        Type.Literal("takeover"),
      ]),
      limit: Type.Optional(
        Type.Number({ description: "限制条目数", default: 20 }),
      ),
      offset: Type.Optional(
        Type.Number({ description: "entries 模式：从第 N 条开始（0-based），默认从尾部倒数。结合 limit 使用可实现分页浏览大会话" }),
      ),
      grep: Type.Optional(
        Type.String({ description: "entries 模式：关键词过滤，只返回包含此关键词的条目。支持正则表达式（如 'error|fail'）" }),
      ),
    }),

    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any): Promise<any> {
      try {
        const dir = getSessionDir();
        const resolved = await resolveSession(params.sessionId, dir);
        if (!resolved.ok) {
          return { content: [{ type: "text", text: `❌ ${resolved.error}` }], details: {} };
        }

        const entries = await readJsonlFile(resolved.filepath);
        if (entries.length === 0) {
          return { content: [{ type: "text", text: "会话为空" }], details: {} };
        }

        switch (params.action) {
          case "summary":
            return doSummary(entries, resolved.filepath);
          case "entries":
            return doEntries(entries, params.limit ?? 20, params.offset, params.grep);
          case "timeline":
            return doTimeline(entries);
          case "chain":
            return await doChain(entries, resolved.filepath, dir);
          case "raw":
            return doRaw(entries, params.limit ?? 10);
          case "audit": {
            const cwd = entries.find((e) => e.type === "session")?.cwd as string | undefined;
            return await doAudit(entries, cwd);
          }
          case "digest":
            return doDigest(entries);
          case "branches":
            return doBranches(entries);
          case "takeover":
            return await doTakeover(params.sessionId, params.limit ?? 5);
          default:
            return { content: [{ type: "text", text: `未知 action: ${params.action}` }], details: {} };
        }
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `❌ 错误: ${err instanceof Error ? err.message : String(err)}` }], details: {} };
      }
    },
  });
}
