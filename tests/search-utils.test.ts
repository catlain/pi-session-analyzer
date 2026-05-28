/**
 * search-utils 模块 — 单元测试
 *
 * 测试：extractMatchContext（text 分支、toolCall 分支、non-message 分支）
 */

import { describe, it, expect } from "vitest";
import { extractMatchContext, escapeRegex } from "../search-utils";
import type { Entry } from "../core";

// ── escapeRegex ──────────────────────────────────────────

describe("escapeRegex", () => {
  it("转义正则特殊字符", () => {
    expect(escapeRegex("hello.world")).toBe("hello\\.world");
    expect(escapeRegex("a+b*c?")).toBe("a\\+b\\*c\\?");
    expect(escapeRegex("(group)")).toBe("\\(group\\)");
    expect(escapeRegex("[set]")).toBe("\\[set\\]");
    expect(escapeRegex("a{1}^$|")).toBe("a\\{1\\}\\^\\$\\|");
  });

  it("普通字符串不变", () => {
    expect(escapeRegex("hello")).toBe("hello");
    expect(escapeRegex("中文测试")).toBe("中文测试");
  });
});

// ── extractMatchContext — text 分支 ──────────────────────

describe("extractMatchContext — text 内容", () => {
  it("string content 匹配返回上下文", () => {
    const entry: Entry = {
      type: "message",
      message: { role: "user", content: "请帮我重构 main.ts 文件中的代码" },
    };
    const result = extractMatchContext(entry, /main\.ts/);
    expect(result).toContain("main.ts");
    // 上下文窗口 ±200，应该包含前后文
    expect(result).toContain("重构");
    expect(result).toContain("文件");
  });

  it("ContentPart text 匹配返回上下文", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "text", text: "这是一个关于 TypeScript 的讨论" }],
      },
    };
    const result = extractMatchContext(entry, /TypeScript/);
    expect(result).toContain("TypeScript");
    expect(result).toContain("讨论");
  });

  it("无匹配返回空字符串", () => {
    const entry: Entry = {
      type: "message",
      message: { role: "user", content: "hello world" },
    };
    const result = extractMatchContext(entry, /ZZZ_notfound/);
    expect(result).toBe("");
  });

  it("text 分支上下文窗口 ±200 字符", () => {
    const longText = "A".repeat(500) + "TARGET" + "B".repeat(500);
    const entry: Entry = {
      type: "message",
      message: { role: "user", content: longText },
    };
    const result = extractMatchContext(entry, /TARGET/);
    // 匹配上下文应该包含 TARGET 前后各约 200 字符
    expect(result).toContain("TARGET");
    // 不应该包含最前面的 A 和最后面的 B
    expect(result).not.toContain("A".repeat(300));
    expect(result).not.toContain("B".repeat(300));
  });
});

// ── extractMatchContext — toolCall 分支 ──────────────────

describe("extractMatchContext — toolCall 匹配", () => {
  it("toolCall name 匹配返回上下文", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
        ],
      },
    };
    const result = extractMatchContext(entry, /main\.ts/);
    expect(result).toContain("🛠");
    expect(result).toContain("edit");
    expect(result).toContain("main.ts");
  });

  it("toolCall arguments 中间位置匹配返回上下文（不只前 100 字符）", () => {
    // 构造一个大 arguments 对象，关键信息在中间
    const bigArgs: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      bigArgs[`field_${i}`] = `value_${"_".repeat(100)}_${i}`;
    }
    bigArgs["target_key"] = "这是要搜索的关键信息_UNIQUE_MARKER";
    for (let i = 50; i < 100; i++) {
      bigArgs[`field_${i}`] = `value_${"_".repeat(100)}_${i}`;
    }

    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", name: "roadmap_plan", arguments: bigArgs },
        ],
      },
    };
    const result = extractMatchContext(entry, /UNIQUE_MARKER/);
    expect(result).toContain("🛠");
    expect(result).toContain("roadmap_plan");
    expect(result).toContain("UNIQUE_MARKER");
    // 关键：不应该只取前 100 字符（前 100 字符里只有 field_0，没有 UNIQUE_MARKER）
    expect(result).not.toContain("field_0");
  });

  it("toolCall 多个匹配点各返回上下文", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            name: "edit",
            arguments: {
              path: "/src/feature_A.ts",
              content: "// feature_A implementation",
            },
          },
        ],
      },
    };
    const result = extractMatchContext(entry, /feature_[AB]/g);
    expect(result).toContain("feature_A");
    // 两个匹配应该在同一行（join by \n 前分别是两段上下文）
    // 至少包含一次 🛠 标记
    const toolMarkers = result.match(/🛠/g);
    expect(toolMarkers).toBeTruthy();
  });

  it("toolCall 无匹配返回空", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", name: "edit", arguments: { path: "/src/main.ts" } },
        ],
      },
    };
    const result = extractMatchContext(entry, /ZZZ_notfound/);
    expect(result).toBe("");
  });

  it("toolCall arguments 为空对象时也能处理", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "bash", arguments: {} }],
      },
    };
    const result = extractMatchContext(entry, /bash/);
    expect(result).toContain("🛠");
    expect(result).toContain("bash");
  });

  it("toolCall arguments 为 undefined 时也能处理", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "bash" }],
      },
    };
    const result = extractMatchContext(entry, /bash/);
    expect(result).toContain("🛠");
  });
});

// ── extractMatchContext — non-message entry ──────────────

describe("extractMatchContext — non-message entry", () => {
  it("session 类型 entry 匹配返回上下文", () => {
    const entry: Entry = {
      type: "session",
      cwd: "/home/user/project_alpha",
    };
    const result = extractMatchContext(entry, /project_alpha/);
    expect(result).toContain("project_alpha");
  });

  it("non-message 无匹配返回空", () => {
    const entry: Entry = { type: "session", cwd: "/home/user" };
    const result = extractMatchContext(entry, /ZZZ_notfound/);
    expect(result).toBe("");
  });
});

// ── extractMatchContext — 混合 content parts ─────────────

describe("extractMatchContext — 混合 text + toolCall", () => {
  it("text 和 toolCall 同时匹配，都返回", () => {
    const entry: Entry = {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "我来帮你修改 feature_X 的代码" },
          {
            type: "toolCall",
            name: "edit",
            arguments: { path: "/src/feature_X.ts" },
          },
        ],
      },
    };
    const result = extractMatchContext(entry, /feature_X/g);
    expect(result).toContain("feature_X");
    // 应该包含 text 部分和 toolCall 部分的匹配
    const matches = result.split("\n");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
