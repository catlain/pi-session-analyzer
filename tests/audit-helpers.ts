import type { Entry } from "../audit-types";

export function toolResult(toolName: string, content: string): Entry {
	return {
		type: "message",
		message: { role: "toolResult", toolName, content },
	};
}

export function assistantWithToolCalls(
	calls: { name: string; args?: Record<string, unknown> }[],
): Entry {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: calls.map((c) => ({
				type: "toolCall",
				name: c.name,
				arguments: c.args ?? {},
			})),
		},
	};
}

export function errorResult(toolName: string, content: string): Entry {
	return {
		type: "message",
		message: { role: "toolResult", toolName, content, isError: true },
	};
}
