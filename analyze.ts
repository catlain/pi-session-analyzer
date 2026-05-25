/**
 * session_analyze 工具实现 — 单会话分析（summary/entries/timeline/chain/raw）
 */

import {
  type Entry,
  extractText,
  readJsonlFile,
  getSessionFiles,
  getSessionDir,
  parseSessionId,
  extractSummary,
  fmtTime,
  getSessionInfoFromEntries,
} from "./core";
import { getVisibleSubagentFiles } from "./core-visible";
import {
  findBranchPoints,
  buildEntryMap,
  assignBranch,
} from "./branches";
import { truncatedResult } from "@pi-atelier/shared-utils";

export { doDigest } from "./digest";

// session_analyze 的输出阈值：结构化数据不需要那么大
const ANALYZE_MAX_LINES = 500;
const ANALYZE_MAX_BYTES = 20 * 1024; // 20KB

export function doSummary(entries: Entry[], filepath: string) {
  const info = getSessionInfoFromEntries(entries, filepath);
  const summary = extractSummary(entries);

  const toolLines = Object.entries(summary.toolStats)
    .map(
      ([name, st]) =>
        `${name}(${st.calls}${st.errors > 0 ? `, ${st.errors} errors` : ""})`,
    )
    .join(", ");

  const text = [
    `会话 ID: ${info.sessionId}`,
    `开始时间: ${info.startTime}`,
    `模型: ${info.model}`,
    `状态: ${info.status}`,
    `消息数: user=${info.userMsgCount} assistant=${info.assistantMsgCount} toolCalls=${info.toolCallCount}`,
    `工具: ${toolLines || "无"}`,
    `编辑: ${info.editCount} edits, ${info.writeCount} writes`,
    info.filesEdited.length > 0
      ? `修改文件: ${info.filesEdited.join(", ")}`
      : "",
    `首条消息: ${info.firstMsg}`,
  ]
    .filter(Boolean)
    .join("\n");

  return truncatedResult(text, { toolName: "session_analyze", label: "summary", maxLines: ANALYZE_MAX_LINES, maxBytes: ANALYZE_MAX_BYTES });
}

/** 提取条目的文本内容（用于 grep 过滤） */
function extractEntryText(entry: Entry): string {
  if (entry.message) {
    const content = entry.message.content;
    const text = typeof content === "string" ? content : extractText(content);
    return `${entry.message.role ?? ""} ${text} ${entry.message.model ?? ""} ${entry.message.toolName ?? ""}`;
  }
  if (entry.type === "session") {
    return `[session] cwd=${entry.cwd ?? ""} id=${entry.id ?? ""}`;
  }
  return entry.type;
}

export function doEntries(entries: Entry[], limit: number, offset?: number, grep?: string) {
  let items = entries;

  // 关键词过滤（先过滤再切片，减少输出量）
  if (grep) {
    const keyword = grep.toLowerCase();
    items = items.filter((entry) => {
      // 搜索文本内容
      const text = extractEntryText(entry);
      return text.toLowerCase().includes(keyword);
    });
  }

  // 偏移 + 限制
  const totalCount = items.length;
  const start = offset ? Math.max(0, offset) : Math.max(0, items.length - limit);
  items = items.slice(start, start + limit);
  const lines = items.map((entry, idx) => {
    const role = entry.message?.role ?? "";
    const time = entry.timestamp ? fmtTime(entry.timestamp) : "";
    let text = "";

    if (entry.message) {
      const content = entry.message.content;
      if (typeof content === "string") {
        text = content.slice(0, 100);
      } else if (Array.isArray(content)) {
        text = extractText(content).slice(0, 100);
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

    return `${String(idx).padStart(4)} | ${entry.type.padEnd(8)} | ${role.padEnd(12)} | ${time} | ${text}`;
  });

  const rangeDesc = offset != null
    ? `条目 ${start}-${start + items.length - 1}/${totalCount}`
    : `最后 ${items.length}/${entries.length} 条`;
  const filterDesc = grep ? `（过滤: "${grep}"）` : '';

  return truncatedResult(
    `条目列表 ${rangeDesc}${filterDesc}：\n${lines.join("\n")}`,
    { toolName: "session_analyze", label: "entries", maxLines: ANALYZE_MAX_LINES, maxBytes: ANALYZE_MAX_BYTES },
  );
}

export function doTimeline(entries: Entry[]) {
  const msgEntries = entries.filter(
    (e) => e.type === "message" && e.timestamp,
  );

  // 检测分支
  const branchPoints = findBranchPoints(entries);
  const entryMap = buildEntryMap(entries);
  const hasBranches = branchPoints.length > 0;

  // 为每个分支分配标签
  const branchLabels = new Map<string, string>();
  if (hasBranches) {
    for (const bp of branchPoints) {
      for (const branch of bp.branches) {
        const label = `B${branch.index}`;
        branchLabels.set(branch.rootEntry.id ?? "", label);
        for (const be of branch.entries) {
          branchLabels.set(be.id ?? "", label);
        }
      }
    }
  }

  // 查找 entry 属于哪个分支
  function getBranchLabel(entry: Entry): string {
    if (!hasBranches) return "";
    // 直接查缓存
    const cached = branchLabels.get(entry.id ?? "");
    if (cached) return cached;
    // 回溯查找
    const result = assignBranch(entry, branchPoints, entryMap);
    if (result) {
      const label = `B${branchPoints[result.bpIdx].branches[result.branchIdx].index}`;
      branchLabels.set(entry.id ?? "", label);
      return label;
    }
    return "";
  }

  const lines: string[] = [];
  let prevTime: number | null = null;
  let prevLabel = "";

  for (const entry of msgEntries) {
    const ts = entry.timestamp!;
    const role = entry.message?.role ?? "";
    const time = fmtTime(ts);
    const label = getBranchLabel(entry);

    let gap = "";
    if (prevTime !== null) {
      const diff = new Date(ts).getTime() - prevTime;
      if (diff > 5000) gap = `  [间隔 ${Math.round(diff / 1000)}s]\n`;
    }

    // 分支切换标注
    if (label && label !== prevLabel && prevLabel) {
      lines.push(`  ── 切换到分支 ${label} ──`);
    }
    if (label && !prevLabel && role === "user") {
      lines.push(`  ── 分支 ${label} 开始 ──`);
    }

    let detail = "";
    if (entry.message) {
      const content = entry.message.content;
      if (Array.isArray(content)) {
        const calls = content
          .filter((p) => p.type === "toolCall")
          .map((p) => p.name);
        if (calls.length) detail = ` → ${calls.join(", ")}`;
        else {
          const text = extractText(content).slice(0, 80);
          if (text) detail = `: ${text}`;
        }
      } else if (typeof content === "string") {
        detail = `: ${content.slice(0, 80)}`;
      }
    }

    const prefix = label ? `[${label}] ` : "";
    lines.push(`${gap}${time}  ${prefix}${role.padEnd(12)}${detail}`);
    prevTime = new Date(ts).getTime();
    if (label) prevLabel = label;
  }

  const branchInfo = hasBranches
    ? `\n⚠️ 该会话有 ${branchPoints.length} 个分支点（/tree 操作），带 [B1]/[B2] 标签区分。使用 action='branches' 查看详细分支分析。\n`
    : "";

  return truncatedResult(
    `${branchInfo}事件时间线（${msgEntries.length} 条消息）：\n${lines.join("\n")}`,
    { toolName: "session_analyze", label: "timeline", maxLines: ANALYZE_MAX_LINES, maxBytes: ANALYZE_MAX_BYTES },
  );
}

export async function doChain(
  entries: Entry[],
  filepath: string,
  sessionDir: string,
) {
  const sessionId = parseSessionId(filepath);
  const parentSession = entries.find(
    (e) => e.type === "session",
  )?.parentSession as string | undefined;

  const allFiles = [
    ...await getSessionFiles(sessionDir),
    ...await getVisibleSubagentFiles(),
  ];
  const children: Array<{
    sessionId: string;
    firstMsg: string;
    model: string;
  }> = [];

  for (const fp of allFiles) {
    if (fp === filepath) continue;
    const childEntries = await readJsonlFile(fp);
    const sessionEntry = childEntries.find((e) => e.type === "session");
    if (sessionEntry?.parentSession) {
      const parentPath = sessionEntry.parentSession as string;
      if (parentPath.includes(sessionId.slice(0, 14))) {
        const summary = extractSummary(childEntries);
        const model =
          childEntries.find(
            (e) => e.type === "message" && e.message?.model,
          )?.message?.model ?? "";
        const childId = sessionEntry.id
          ? String(sessionEntry.id).slice(0, 18)
          : parseSessionId(fp);
        children.push({
          sessionId: childId,
          firstMsg: summary.firstMsg.slice(0, 80),
          model,
        });
      }
    }
  }

  const lines: string[] = [];
  if (parentSession) lines.push(`⬆ 父会话: ${parentSession}`);
  lines.push(`⭐ 当前会话: ${sessionId}`);
  if (children.length > 0) {
    lines.push(`⬇ 子代理会话:`);
    for (const child of children) {
      lines.push(
        `  ├─ ${child.sessionId.slice(0, 18)}  ${child.model.slice(0, 20)}  ${child.firstMsg}`,
      );
    }
  }
  if (!parentSession && children.length === 0) {
    lines.push("(无父子代理关系)");
  }

  return truncatedResult(lines.join("\n"), { toolName: "session_analyze", label: "chain", maxLines: ANALYZE_MAX_LINES, maxBytes: ANALYZE_MAX_BYTES });
}

export function doRaw(entries: Entry[], limit: number) {
  const items = entries.slice(-limit);
  const lines = items.map(
    (entry, idx) =>
      `--- 条目 ${idx + 1} ---\n${JSON.stringify(entry).slice(0, 1000)}`,
  );

  return truncatedResult(
    `原始数据（最后 ${items.length}/${entries.length} 条）：\n${lines.join("\n\n")}`,
    { toolName: "session_analyze", label: "raw", maxLines: ANALYZE_MAX_LINES, maxBytes: ANALYZE_MAX_BYTES },
  );
}

export function doBranches(entries: Entry[]) {
  const branchPoints = findBranchPoints(entries);

  if (branchPoints.length === 0) {
    return {
      content: [{ type: "text" as const, text: "该会话没有分支（/tree 操作产生的平行分支）。所有消息在一条线性链上。" }],
      details: {},
    };
  }

  const lines: string[] = [];
  const totalBranches = branchPoints.reduce((s, bp) => s + bp.branches.length, 0);
  lines.push(`发现 ${branchPoints.length} 个分支点，共 ${totalBranches} 条分支\n`);

  for (const bp of branchPoints) {
    lines.push(`## 分支点 [${fmtTime(bp.timestamp)}]`);
    lines.push(`  助手回复: ${bp.brief || "(无文本)"}\n`);

    for (const branch of bp.branches) {
      lines.push(`### 分支 ${branch.index}（${branch.count} 条消息）`);
      lines.push(`  触发: ${branch.triggerMsg}`);
      lines.push(`  时间: ${fmtTime(branch.startTime)}\n`);

      const maxEvents = 30;
      const events = branch.keyEvents.slice(0, maxEvents);
      for (const evt of events) {
        const t = fmtTime(evt.timestamp);
        const prefix = evt.role === "user" ? "👤" : "🤖";
        lines.push(`  [${t}] ${prefix} ${evt.brief}`);
      }
      if (branch.keyEvents.length > maxEvents) {
        lines.push(`  ... 还有 ${branch.keyEvents.length - maxEvents} 个事件`);
      }
      lines.push("");
    }
  }

  const text = lines.join("\n");
  return truncatedResult(text, {
    toolName: "session_analyze",
    label: "branches",
    maxLines: ANALYZE_MAX_LINES,
    maxBytes: ANALYZE_MAX_BYTES,
  });
}
