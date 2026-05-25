/**
 * 审计模块共享类型 — 供 audit.ts 和 audit-rules.ts 共用
 */
import { type ContentPart } from "./core";

export interface Entry {
  type: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
  parentSession?: string;
  message?: {
    role?: string;
    content?: ContentPart[] | string;
    model?: string;
    toolName?: string;
    isError?: boolean;
    customType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AuditIssue {
  rule: string;
  severity: "error" | "warning" | "info";
  detail: string;
  evidence: string;
  fixScope: "global" | "project" | "none";
  fixTarget?: string;
  fixSuggestion?: string;
}

export interface AgentRules {
  source: "AGENTS.md" | "CLAUDE.md" | "default";
  scope: "global" | "project";
  path: string;
  content: string;
}

export { extractText } from "./core";
