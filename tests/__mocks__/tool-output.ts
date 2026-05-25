/**
 * Mock for _shared/tool-output
 * 简化版本：truncatedResult 直接返回 content，不写临时文件
 */

export function truncatedResult(
  text: string,
  options?: { toolName?: string; label?: string; maxLines?: number; maxBytes?: number },
  existingDetails?: Record<string, unknown>,
): { content: Array<{ type: string; text: string }>; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      ...(existingDetails ?? {}),
      truncation: null,
    },
  };
}
