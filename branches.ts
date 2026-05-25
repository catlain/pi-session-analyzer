/** 分支分析 — 分析 parentId 树结构，识别 /tree 产生的分支 */

import { type Entry, extractText, fmtTime } from "./core";

export interface BranchPoint {
  id: string;
  entry: Entry;
  timestamp: string;
  brief: string;
  branches: Branch[];
}

export interface Branch {
  index: number;
  rootEntry: Entry;
  entries: Entry[];
  triggerMsg: string;
  startTime: string;
  count: number;
  keyEvents: KeyEvent[];
}

export interface KeyEvent {
  timestamp: string;
  role: string;
  brief: string;
}

// ── 纯函数 ──────────────────────────────────────────────

/** 从 parentId 构建 parent→children 映射 */
export function buildParentChildMap(
  entries: Entry[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const pid = entry.parentId;
    if (pid && typeof pid === "string" && pid.length > 0) {
      const list = map.get(pid) ?? [];
      list.push(entry.id ?? "");
      map.set(pid, list);
    }
  }
  return map;
}

/** 构建 id→entry 映射 */
export function buildEntryMap(entries: Entry[]): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const entry of entries) {
    if (entry.id) map.set(entry.id, entry);
  }
  return map;
}

/** 从 startId 沿线性链（每步只有 1 个 child）收集所有 entry，遇到分支点停止 */
function collectLinearChain(
  startId: string,
  parentChildMap: Map<string, string[]>,
  entryMap: Map<string, Entry>,
  maxDepth = 500,
): Entry[] {
  const result: Entry[] = [];
  let current = startId;
  let depth = 0;
  while (current && depth < maxDepth) {
    const entry = entryMap.get(current);
    if (!entry) break;
    result.push(entry);
    const children = parentChildMap.get(current);
    if (!children || children.length === 0) break;
    if (children.length === 1) {
      current = children[0];
    } else {
      // 遇到新的分支点，停止
      break;
    }
    depth++;
  }
  return result;
}

/** 找出所有分支点（同一 parentId 有 2+ user children 的） */
export function findBranchPoints(entries: Entry[]): BranchPoint[] {
  const parentChildMap = buildParentChildMap(entries);
  const entryMap = buildEntryMap(entries);
  const branchPoints: BranchPoint[] = [];

  for (const [parentId, children] of parentChildMap) {
    if (children.length < 2) continue;
    const parent = entryMap.get(parentId);
    if (!parent) continue;

    // 只关注 user 触发的分支（/tree 操作产生的）
    const userChildren = children.filter((cid) => {
      const e = entryMap.get(cid);
      return e?.message?.role === "user";
    });

    if (userChildren.length < 2) continue;

    const branches: Branch[] = userChildren.map((cid, idx) => {
      const rootEntry = entryMap.get(cid)!;
      const branchEntries = collectLinearChain(cid, parentChildMap, entryMap);
      return {
        index: idx + 1,
        rootEntry,
        entries: branchEntries,
        triggerMsg: extractText(rootEntry.message?.content).slice(0, 120),
        startTime: rootEntry.timestamp ?? "",
        count: branchEntries.length,
        keyEvents: extractKeyEvents(branchEntries),
      };
    });

    branchPoints.push({
      id: parentId,
      entry: parent,
      timestamp: parent.timestamp ?? "",
      brief: extractText(parent.message?.content).slice(0, 80),
      branches,
    });
  }

  return branchPoints;
}

/** 从分支的 entry 列表中提取关键事件 */
function extractKeyEvents(entries: Entry[]): KeyEvent[] {
  const events: KeyEvent[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const role = entry.message.role ?? "";
    const content = entry.message.content;
    if (role === "user") {
      const text = extractText(content).slice(0, 100);
      if (text) {
        events.push({ timestamp: entry.timestamp ?? "", role, brief: text });
      }
    } else if (role === "assistant" && Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "toolCall" && part.name === "pv") {
          const action = String(part.arguments?.action ?? "");
          events.push({ timestamp: entry.timestamp ?? "", role: "assistant", brief: `pv(${action})` });
        }
      }
    }
  }
  return events;
}

/** 判断 entry 属于哪个分支（通过 parentId 链回溯） */
export function assignBranch(
  entry: Entry,
  branchPoints: BranchPoint[],
  entryMap: Map<string, Entry>,
): { bpIdx: number; branchIdx: number } | null {
  if (branchPoints.length === 0) return null;

  let current: string | undefined = entry.id;
  if (!current) return null;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const e = entryMap.get(current);
    if (!e) break;
    const pid = e.parentId as string | undefined;
    if (!pid) break;

    for (let bi = 0; bi < branchPoints.length; bi++) {
      const bp = branchPoints[bi];
      if (bp.id === pid) {
        for (let bj = 0; bj < bp.branches.length; bj++) {
          if (bp.branches[bj].rootEntry.id === current) {
            return { bpIdx: bi, branchIdx: bj };
          }
        }
      }
    }

    current = pid;
  }

  return null;
}


