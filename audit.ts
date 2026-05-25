/**
 * session_analyze 审计功能 — 扫描会话违规，参考 AGENTS.md/CLAUDE.md 提出修复建议
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { type Entry, type AgentRules } from "./audit-types";
import {
	checkBashFileWrite,
	checkSearchBeforeEdit,
	checkFileOver500Lines,
	checkSearchOnly,
	checkRepeatedErrors,
	checkEditWriteRatio,
	checkRulesCoverage,
} from "./audit-rules";

async function loadRules(sessionCwd?: string): Promise<AgentRules[]> {
  const rules: AgentRules[] = [];
  const globalPath = join(homedir(), ".pi", "agent", "AGENTS.md");
  try {
    rules.push({ source: "AGENTS.md", scope: "global", path: globalPath, content: await readFile(globalPath, "utf-8") });
  } catch { /* not found */ }

  if (sessionCwd) {
    for (const name of ["AGENTS.md", "CLAUDE.md"] as const) {
      for (const dir of [
        join(sessionCwd, ".pi"),
        sessionCwd,
      ]) {
        const p = join(dir, name);
        try {
          const content = await readFile(p, "utf-8");
          if (!rules.some((r) => r.path === p)) {
            rules.push({ source: name, scope: "project", path: p, content });
          }
        } catch { /* not found */ }
      }
    }
  }
  return rules;
}

export async function doAudit(entries: Entry[], sessionCwd?: string) {
  const rules = await loadRules(sessionCwd);
	const allIssues = [
		...checkBashFileWrite(entries),
    ...checkSearchBeforeEdit(entries),
    ...checkFileOver500Lines(entries),
    ...checkSearchOnly(entries),
    ...checkRepeatedErrors(entries),
    ...checkEditWriteRatio(entries),
    ...checkRulesCoverage(rules),
  ];

  const order = { error: 0, warning: 1, info: 2 };
  allIssues.sort((a, b) => order[a.severity] - order[b.severity]);

  if (allIssues.length === 0) {
    return { content: [{ type: "text", text: "✅ 未发现违规问题" }] };
  }

  const icon = { error: "🔴", warning: "🟡", info: "ℹ️" };
  const grouped = new Map<string, typeof allIssues>();
  for (const issue of allIssues) {
    if (!grouped.has(issue.rule)) grouped.set(issue.rule, []);
    grouped.get(issue.rule)!.push(issue);
  }

  const lines: string[] = [`审计发现 ${allIssues.length} 个问题：\n`];
  for (const [rule, issues] of grouped) {
    lines.push(`### ${rule}`);
    for (const issue of issues) {
      const scope = issue.fixScope !== "none" ? ` [修复范围: ${issue.fixScope === "global" ? "全局 AGENTS.md" : "项目 CLAUDE.md"}]` : "";
      const fix = issue.fixSuggestion ? `\n  💡 修复建议: ${issue.fixSuggestion}` : "";
      lines.push(`${icon[issue.severity]} ${issue.detail}${scope}`, `  证据: ${issue.evidence}${fix}`, "");
    }
  }

  lines.push("---", "已加载的规则文件：");
  for (const r of rules) lines.push(`  - [${r.scope}] ${r.path}`);
  if (rules.length === 0) lines.push("  (无)");

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
