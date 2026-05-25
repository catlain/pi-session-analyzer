# pi-session-analyzer

Session search and analysis extension for [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) — search historical sessions, reconstruct timelines, audit behavior, and generate takeover reports.

## What It Does

When you need to find what you did last week, or continue work from a previous session, pi-session-analyzer lets you search and inspect every session pi has ever run:

- **Search sessions** — Grep across all sessions for keywords, or find sessions that modified specific files
- **Timeline reconstruction** — See a chronological timeline of events with automatic branch detection
- **Behavior audit** — Check sessions for rule violations and anti-patterns
- **Takeover reports** — Generate a 5-dimension handoff report for continuing work from a previous session
- **Sub-agent chains** — Trace sub-agent execution chains across sessions

## Installation

```bash
pi install git:github.com/catlain/pi-session-analyzer
```

## Tools

### `session_search`

Search across all sessions. Three modes:

| Action | Description |
|--------|-------------|
| `grep` | Full-text search across sessions (supports regex) |
| `file` | Find sessions that modified a specific file |
| `list` | List recent sessions |

**Examples:**
```
# Find sessions about "roadmap"
session_search(action: "grep", query: "roadmap")

# Find who modified this file
session_search(action: "file", query: "src/index.ts")

# List last 10 sessions
session_search(action: "list", limit: 10)
```

### `session_analyze`

Deep-dive into a specific session:

| Action | Description |
|--------|-------------|
| `summary` | Session metadata + summary (start here) |
| `entries` | List session entries (with keyword filtering) |
| `timeline` | Chronological timeline with branch labels |
| `chain` | Sub-agent chain trace |
| `audit` | Check for rule violations |
| `digest` | User/assistant conversation sequence |
| `branches` | Analyze parallel branches |
| `takeover` | Generate handoff report (5 dimensions: intent, files, steps, next steps, decisions) |

**Examples:**
```
# Quick overview of a session
session_analyze(sessionId: "abc123", action: "summary")

# Find all errors in a session
session_analyze(sessionId: "abc123", action: "entries", grep: "error|fail")

# Generate a takeover report to continue work
session_analyze(sessionId: "abc123", action: "takeover")
```

## Use Cases

- **"What did I do last week?"** — `session_search(action: "list")` → `session_analyze(action: "summary")`
- **"Who changed this file?"** — `session_search(action: "file", query: "path/to/file")`
- **"Continue where I left off"** — `session_analyze(action: "takeover")` gives you a complete handoff
- **"Why did this break?"** — `session_analyze(action: "audit")` to find rule violations

## Dependencies

- `@pi-atelier/shared-utils` (bundled) — `truncatedResult` for large outputs
- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
