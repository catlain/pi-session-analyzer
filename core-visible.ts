// 可见模式子代理会话扫描
//
// 子代理（tmux 可见模式）的 session.jsonl 存储在 /tmp/pi-visible-*/ 下，
// 不在 ~/.pi/agent/sessions/ 中，需要额外的扫描和 ID 解析逻辑。

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

// 扫描 /tmp/pi-visible-*/session.jsonl
export async function getVisibleSubagentFiles(): Promise<string[]> {
	const tmp = tmpdir();
	const results: string[] = [];
	let entries: string[];
	try {
		entries = await readdir(tmp);
	} catch {
		return results;
	}
	for (const name of entries) {
		if (!name.startsWith("pi-visible-")) continue;
		const sessionFile = join(tmp, name, "session.jsonl");
		try {
			const s = await stat(sessionFile);
			if (s.isFile()) results.push(sessionFile);
		} catch {
			continue;
		}
	}
	return results;
}

// 从 session.jsonl 首行提取 session ID
export function extractSessionIdFromFirstLine(line: string): string | undefined {
	try {
		const obj = JSON.parse(line);
		if (obj.type === "session" && typeof obj.id === "string") return obj.id;
	} catch { /* skip */ }
	return undefined;
}

/**
 * 在可见模式子代理文件中按 session ID 查找匹配
 * 返回匹配的文件路径，或 undefined
 */
export async function resolveVisibleSession(
	sessionId: string,
	visibleFiles: string[],
): Promise<string | undefined> {
	for (const f of visibleFiles) {
		try {
			const content = await readFile(f, "utf-8");
			const firstLine = content.split("\n")[0]?.trim();
			if (firstLine) {
				const id = extractSessionIdFromFirstLine(firstLine);
				if (id && id.includes(sessionId)) return f;
			}
		} catch { /* skip */ }
	}
	return undefined;
}
