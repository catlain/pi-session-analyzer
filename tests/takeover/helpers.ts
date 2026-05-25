/**
 * session-takeover 测试辅助函数
 */

import type { Entry } from "../core";

/** 创建 session 元信息 entry */
export function makeSession(): Entry {
	return { type: "session", cwd: "/project" };
}

/** 创建用户消息 entry */
export function makeUser(text: string, idx = 0): Entry {
	return {
		type: "message",
		id: `u-${idx}`,
		message: { role: "user", content: [{ type: "text", text }] },
	};
}

/** 创建 assistant 消息 entry（纯文本 parts） */
export function makeAssistant(parts: Array<{ type: string; text?: string; name?: string }>, idx = 0): Entry {
	return {
		type: "message",
		id: `a-${idx}`,
		message: { role: "assistant", content: parts },
	};
}

/** 创建带 timestamp 的 assistant entry */
export function makeAssistantWithTs(text: string, ts: string, idx = 0): Entry {
	return {
		type: "message",
		id: `a-${idx}`,
		timestamp: ts,
		message: { role: "assistant", content: [{ type: "text", text }] },
	};
}

/** 创建 toolCall entry */
export function makeToolCall(name: string, args: Record<string, unknown>, idx = 0): Entry {
	return {
		type: "message",
		id: `t-${idx}`,
		message: {
			role: "assistant",
			content: [{ type: "toolCall", name, arguments: args }],
		},
	};
}
