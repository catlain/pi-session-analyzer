/**
 * entries 共用辅助函数 — 从 entries.ts 和 entries-nav.ts 提取
 */

import {
	extractStringValues,
	matchFile,
	matchToolName,
} from "@pi-atelier/shared-utils";
import type { Entry } from "./core";

/** 判断条目是否匹配指定 toolName（支持通配符/多值） */
export function hasToolName(entry: Entry, toolName: string): boolean {
	if (!entry.message) return false;
	if (
		entry.message.role === "assistant" &&
		Array.isArray(entry.message.content)
	) {
		for (const part of entry.message.content) {
			if (part.type === "toolCall" && matchToolName(toolName, part.name))
				return true;
		}
	}
	if (matchToolName(toolName, entry.message.toolName ?? "")) return true;
	return false;
}

/** 从条目的工具调用参数中提取所有字符串值 */
export function extractFilePaths(entry: Entry): string[] {
	if (!entry.message) return [];
	const paths: string[] = [];
	if (
		entry.message.role === "assistant" &&
		Array.isArray(entry.message.content)
	) {
		for (const part of entry.message.content) {
			if (part.type === "toolCall" && part.arguments) {
				paths.push(...extractStringValues(part.arguments));
			}
		}
	}
	return paths;
}

/** 判断条目是否匹配指定文件路径 */
export function matchFileEntry(entry: Entry, file: string): boolean {
	return matchFile(file, extractFilePaths(entry));
}
