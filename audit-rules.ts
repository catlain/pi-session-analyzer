/**
 * 审计规则检测器 — 7 个独立的规则检查函数
 */
import { type Entry, type AuditIssue, type AgentRules, extractText } from "./audit-types";

export function checkBashFileWrite(entries: Entry[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const forbidden = /sed\s+-i|echo\s+>>|python3\s+-c.*open\(|cat\s*>|tee\s+/;
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    if (entry.message.role !== "toolResult" || entry.message.toolName !== "bash") continue;
    const text = typeof entry.message.content === "string"
      ? entry.message.content : extractText(entry.message.content);
    if (forbidden.test(text)) {
      issues.push({
        rule: "文件修改规则", severity: "warning",
        detail: "bash 命令中疑似包含文件写入操作（应使用 edit/write 工具）",
        evidence: text.slice(0, 150), fixScope: "none",
      });
    }
  }
  return issues;
}

export function checkSearchBeforeEdit(entries: Entry[]): AuditIssue[] {
  const editIdx: number[] = [];
  const searchIdx: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "message" || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type !== "toolCall") continue;
      if (part.name === "edit" || part.name === "write") editIdx.push(i);
      if (part.name === "grep" || part.name === "find" || part.name === "search") searchIdx.push(i);
    }
  }
  if (editIdx.length > 2 && !searchIdx.some((si) => si < editIdx[0])) {
    return [{
      rule: "抽象优先原则", severity: "warning",
      detail: `执行了 ${editIdx.length} 次 edit/write 但未先搜索重复模式`,
      evidence: `首次 edit 在条目 ${editIdx[0]}，之前无搜索`, fixScope: "none",
    }];
  }
  return [];
}

export function checkFileOver500Lines(entries: Entry[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message || entry.message.role !== "toolResult") continue;
    const text = typeof entry.message.content === "string"
      ? entry.message.content : extractText(entry.message.content);
    // 匹配 wc -l 输出格式："  123 /path/to/file.ts"（行首或空白+数字+空格+路径）
    // 排除 git diff 输出中的权限位（如 "\t100644"）和超大数字
    for (const m of text.matchAll(/(?:^|\s)(\d{1,5})\s+(\S+\.(?:ts|js|py|rs))/gm)) {
      const count = parseInt(m[1]);
      if (count > 500 && count < 10000) {
        issues.push({
          rule: "文件格式规则", severity: "error",
          detail: `文件 ${m[2]} 有 ${count} 行，超过 500 行限制`,
          evidence: `${count} lines in ${m[2]}`, fixScope: "none",
        });
      }
    }
  }
  return issues;
}

export function checkSearchOnly(entries: Entry[]): AuditIssue[] {
  let searchCount = 0, readCount = 0;
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type !== "toolCall") continue;
      if (part.name === "web_search" || part.name === "gh_search_doc") searchCount++;
      if (part.name === "web_read" || part.name === "gh_read_file") readCount++;
    }
  }
  if (searchCount > 2 && readCount === 0) {
    return [{
      rule: "信息获取要求", severity: "warning",
      detail: `执行了 ${searchCount} 次搜索但未用 web_read/gh_read_file 深入阅读`,
      evidence: "搜索只是起点，不是终点", fixScope: "none",
    }];
  }
  return [];
}

export function checkRepeatedErrors(entries: Entry[]): AuditIssue[] {
  // 按错误内容分组（忽略工具名），统计每个错误影响了哪些工具
  const errorMsg = new Map<string, { tools: Set<string>; count: number; sample: string }>();
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message?.isError) continue;
    const text = typeof entry.message.content === "string"
      ? entry.message.content : extractText(entry.message.content);
    const tool = entry.message.toolName ?? "?";
    const key = text.slice(0, 80);
    const existing = errorMsg.get(key);
    if (existing) {
      existing.tools.add(tool);
      existing.count++;
    } else {
      errorMsg.set(key, { tools: new Set([tool]), count: 1, sample: text.slice(0, 120) });
    }
  }

  const issues: AuditIssue[] = [];
  for (const [key, data] of errorMsg) {
    if (data.count < 3) continue;
    const toolCount = data.tools.size;
    const toolList = [...data.tools].join(", ");

    if (toolCount >= 3) {
      // 跨 3+ 工具的系统性错误 → error 级别
      issues.push({
        rule: "框架级错误", severity: "error",
        detail: `系统性错误影响 ${toolCount} 种工具（${toolList}），重复 ${data.count} 次。所有工具不可用，模型应立即停止重试并告知用户`,
        evidence: key, fixScope: "none",
        fixSuggestion: "这是 pi 工具框架 bug，不是项目代码问题。应重启会话或报告给用户",
      });
    } else if (toolCount >= 2) {
      // 跨 2 种工具 → warning
      issues.push({
        rule: "解决问题原则", severity: "warning",
        detail: `错误影响 ${toolCount} 种工具（${toolList}），重复 ${data.count} 次`,
        evidence: key, fixScope: "none",
      });
    } else {
      // 单工具重复 → warning
      issues.push({
        rule: "解决问题原则", severity: "warning",
        detail: `工具 ${toolList} 同类错误重复 ${data.count} 次，未解决根本原因`,
        evidence: key, fixScope: "none",
      });
    }
  }
  return issues;
}

export function checkEditWriteRatio(entries: Entry[]): AuditIssue[] {
  let editCount = 0, writeCount = 0;
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type === "toolCall") {
        if (part.name === "edit") editCount++;
        if (part.name === "write") writeCount++;
      }
    }
  }
  if (writeCount > 5 && writeCount > editCount * 2) {
    return [{
      rule: "文件修改规则", severity: "info",
      detail: `write(${writeCount}) 远多于 edit(${editCount})，建议优先使用 edit`,
      evidence: `write=${writeCount}, edit=${editCount}`, fixScope: "none",
    }];
  }
  return [];
}

export function checkRulesCoverage(rules: AgentRules[]): AuditIssue[] {
  if (rules.some((r) => r.scope === "global")) return [];
  return [{
    rule: "规则覆盖", severity: "info",
    detail: "未找到全局 AGENTS.md，建议创建 ~/.pi/agent/AGENTS.md",
    evidence: "全局规则文件不存在", fixScope: "global",
    fixTarget: "~/.pi/agent/AGENTS.md",
    fixSuggestion: "创建全局 AGENTS.md，包含文件格式、工具使用、编码规范等规则",
  }];
}
