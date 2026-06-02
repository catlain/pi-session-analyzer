> 📖 **[pi-atelier 实战指南](https://catlain.github.io/pi-atelier/)** — 从零教会你使用 pi-atelier 扩展生态，包含完整示例和最佳实践。

[English](README.en.md) | 程序中文文档

# pi-session-analyzer

[源码仓库](https://github.com/catlain/pi-session-analyzer) | [npm](https://www.npmjs.com/package/pi-session-analyzer)

Session search and analysis for [pi](https://github.com/earendil-works/pi-coding-agent) — search historical sessions, reconstruct timelines, audit behavior, and generate takeover reports.

## Why You Need It

pi generates rich session logs (JSONL), but they're scattered across directories and hard to navigate. When you need to:

- Find what you did last week
- Continue work from a previous session
- Check who modified a file and why
- Audit an agent session for rule violations

...you'd have to manually dig through JSONL files. pi-session-analyzer gives the AI structured access to every session pi has ever run.

## How It Works

```
┌─── session_search ──────────────────────────────┐
│                                                  │
│  grep ──→ 全文搜索所有会话（支持正则）           │
│  file ──→ 查找修改过特定文件的会话               │
│  list ──→ 列出最近 N 个会话                      │
│                                                  │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼ 找到 sessionId
┌─── session_analyze ─────────────────────────────┐
│                                                  │
│  summary ──→ 元信息 + 摘要（首次分析首选）       │
│  entries ──→ 条目列表（支持 grep + 分页）        │
│  timeline ─→ 时间线（自动标注 [B1][B2] 分支）    │
│  chain ────→ 子代理调用链追踪                    │
│  audit ────→ 规则违规检查                        │
│  digest ───→ user/assistant 对话序列             │
│  branches ─→ 并行分支分析（/tree 产生）          │
│  takeover ─→ 5 维接手报告                        │
│  raw ──────→ 原始 JSONL 数据                     │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Installation

```bash
pi install git:github.com/catlain/pi-session-analyzer
```

> **Prerequisite**: [pi](https://github.com/earendil-works/pi-coding-agent) must be installed.

## Tools

### `session_search`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | `"grep"` \| `"file"` \| `"list"` | ✅ | — | Search mode |
| `query` | string | grep/file | — | Keyword (grep) or file path (file) |
| `limit` | number | ❌ | `20` | Max results |
| `editOnly` | boolean | ❌ | `false` | grep mode: only search edit/write operations |

**Examples:**

```
session_search(action: "grep", query: "roadmap")
session_search(action: "file", query: "src/index.ts")
session_search(action: "list", limit: 10)
session_search(action: "grep", query: "error", editOnly: true)
```

### `session_analyze`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sessionId` | string | ✅ | — | Session ID (supports prefix match) |
| `action` | enum | ✅ | — | See action table below |
| `limit` | number | ❌ | `20` | Max entries |
| `offset` | number | ❌ | — | Start position (0-based, entries mode) |
| `grep` | string | ❌ | — | Keyword filter (entries mode, supports regex) |
| `compact` | boolean | ❌ | `false` | Compact output (entries mode) |
| `range` | string | ❌ | — | Entry range, e.g. `'5-10'` or `'last:5'` (entries mode) |
| `index` | number | ❌ | — | Show Nth entry with context (entries mode) |
| `rawIndex` | number | ❌ | — | Jump to raw index after filtering (entries mode) |
| `toolName` | string | ❌ | — | Filter by tool name, supports `*` wildcard and `|` for multi-value (entries mode) |
| `file` | string | ❌ | — | Filter by file path, supports `*` wildcard and `|` for multi-value (entries mode) |

**Action reference:**

| Action | Output | Best for |
|--------|--------|----------|
| `summary` | Metadata + abstract | First look at a session |
| `entries` | Filtered entry list | Finding specific events |
| `timeline` | Chronological with branch labels | Understanding session flow |
| `chain` | Sub-agent call trace | Debugging sub-agent workflows |
| `audit` | Rule violations | Checking agent behavior |
| `digest` | User/assistant conversation | Reading what happened |
| `branches` | Per-branch analysis | Analyzing `/tree` forks |
| `takeover` | 5-dimension handoff report | Continuing from a past session |
| `raw` | Raw JSONL entries | Low-level debugging |

**Examples:**

```
session_analyze(sessionId: "abc123", action: "summary")
session_analyze(sessionId: "abc123", action: "entries", grep: "error|fail")
session_analyze(sessionId: "abc123", action: "takeover")
session_analyze(sessionId: "abc", action: "entries", range: "last:5")
session_analyze(sessionId: "abc", action: "entries", toolName: "edit|write")
session_analyze(sessionId: "abc", action: "entries", file: "*.test.ts")
session_analyze(sessionId: "abc", action: "entries", offset: 0, limit: 10)  # pagination
```

## Storage

Session data is stored in pi's data directory:

| Data | Location |
|------|----------|
| Session JSONL files | `~/.local/share/pi-coding-agent/sessions/` |
| Per-session entries | `{sessionId}.jsonl` |
| Session ID matching | Prefix match — pass `abc` to match `abc123def...` |

## Use Cases

| Scenario | Workflow |
|----------|----------|
| **"What did I do last week?"** | `list` → `summary` → `digest` |
| **"Who changed this file?"** | `file(query: "path/to/file")` → `timeline` |
| **"Continue where I left off"** | `takeover` → get 5-dimension handoff (intent, files, steps, next steps, decisions) |
| **"Why did this break?"** | `entries(grep: "error")` → `audit` |
| **"What did the sub-agent do?"** | `chain` → trace sub-agent execution |

## Best Practices

### ✅ Recommended
- Always start with `summary` — it's fast and gives you the full picture before drilling in
- Use `grep` filter in `entries` mode to find specific events without loading everything
- Use prefix match for sessionId — no need to type the full ID
- For large sessions (>100 entries), use `offset` + `limit` for pagination instead of loading all at once
- Use `takeover` when switching machines or resuming work the next day

### ❌ Not Recommended
- Don't use `raw` for large sessions — use `entries` with pagination instead
- Don't confuse `session_search` actions (`grep`/`file`/`list`) with `session_analyze` actions — they're different tools
- Don't skip `summary` and go straight to `raw` — you'll waste context on irrelevant data

## Limitations

| Limitation | Detail |
|------------|--------|
| Read-only | Cannot modify session data, only analyze it |
| No real-time streaming | Analyzes completed sessions only |
| Prefix match ambiguity | Short prefixes may match multiple sessions |
| Audit rules are static | Custom audit rules require code changes |

## Architecture

```
pi-session-analyzer/
├── index.ts              # Entry: register session_search + session_analyze tools
├── core.ts               # Session resolution, JSONL reader, types
├── core-visible.ts       # Visible sub-agent file resolution
├── search.ts             # list + grep implementation
├── search-file.ts        # file search (find sessions editing specific files)
├── search-utils.ts       # Shared search helpers
├── analyze.ts            # summary/entries/timeline/chain/raw/branches
├── digest.ts             # User/assistant conversation extraction
├── audit.ts              # Rule violation checker
├── audit-rules.ts        # Audit rule definitions
├── audit-types.ts        # Audit-specific types
├── takeover.ts           # Takeover tool entry point
├── takeover-core.ts      # 5-dimension takeover report logic
├── tests/                # Unit tests
└── package.json
```

**Dependencies**:
- `@pi-atelier/shared-utils` (bundled) — `truncatedResult` for large outputs
- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
