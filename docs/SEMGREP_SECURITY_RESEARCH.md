# Semgrep Integration Research — SpaceCode Security & Code Quality

**Tool**: [Semgrep](https://github.com/semgrep/semgrep) (LGPL-2.1, open-source)
**Purpose**: Static analysis engine for Phase 6 Security Tab + Code Quality Tab
**Status**: Research complete, ready for implementation

---

## 1. What Semgrep Is

Semgrep is a fast, open-source static analysis tool that finds bugs, enforces coding standards, and detects security vulnerabilities. It uses semantic pattern matching — rules look like actual source code, not regex or DSL.

- **30+ languages** including TypeScript, JavaScript, C#, C++, Python
- **CLI-first**: `semgrep --config <rules> --json <path>` — JSON output, no build step needed
- **Custom rules in YAML**: patterns resemble real code, easy to write
- **2,000+ community rules** + 20,000+ Pro rules (paid tier)
- **Median scan time**: ~10 seconds on CI

---

## 2. Language Support Relevant to SpaceCode

### TypeScript / JavaScript
- Full AST-based pattern matching
- Framework-aware rules for Express, NestJS, React, Angular (50+ frameworks)
- Limitation: does not use the TypeScript compiler for type resolution — cannot detect issues depending on resolved types, generics, or inferred values
- Cross-file analysis available in Pro tier only

### C# (Unity Projects)
- Parse rate > 99%
- Covers CWE-89 (SQL injection), CWE-90 (LDAP injection), and common .NET patterns
- NuGet dependency scanning via Semgrep Supply Chain
- No Unity-specific rulesets exist — custom rules needed for Unity patterns
- Framework-specific Pro rules require paid tier for best C# coverage

---

## 3. Mapping to SpaceCode Phase 6

### 3.1 Security Tab (Phase 6.3) — Strong Fit

| V2 Feature | Semgrep Coverage | Rule Source |
|------------|-----------------|-------------|
| Secret scanner (API keys, passwords) | Built-in secrets detection | `p/secrets` ruleset |
| Hardcoded credentials detection | Built-in | `p/secrets` |
| Dependency CVE checks | Semgrep Supply Chain (NuGet + npm) | `--supply-chain` flag |
| Injection vulnerability analysis | SAST rules (SQL, XSS, command injection) | `p/security-audit`, `p/owasp-top-ten` |
| Results grouped by severity | JSON output includes severity field | Parse from `--json` output |
| "Fix with Engineer" handoff | Semgrep provides fix suggestions + autofix | Map to Gears handoff |

### 3.2 Code Quality Tab (Phase 6.4) — Partial Fit

| V2 Feature | Semgrep? | Notes |
|------------|----------|-------|
| Magic number/hardcoded string scan | Yes | Custom YAML rule |
| Dead code detection | Partial | Pattern-based, not full flow analysis |
| Unused imports | Partial | Pattern match, but TS compiler does this better |
| God class detector (>500 lines) | No | Semgrep doesn't count lines; use custom metric |
| Duplicate function detection | No | Use jscpd or custom AST tool |
| Similar code block detection | No | Use jscpd |
| Circular dependency checker | No | Use madge (JS/TS), custom for C# |
| High coupling analysis | No | Custom metric needed |
| SA sector violation checker | No | Existing `AsmdefGate` already handles this |

### 3.3 Unity-Specific Checks (Phase 6.5) — Custom Rules Needed

| V2 Feature | Semgrep Approach |
|------------|-----------------|
| Expensive `Update()` calls | Rule: match `void Update()` containing `Find(` / `GetComponent(` |
| Missing null checks for GetComponent | Rule: match `GetComponent<$T>()` not followed by null check |
| `Find()` in hot paths | Rule: match `GameObject.Find(` inside `Update`/`FixedUpdate`/`LateUpdate` |
| Allocations in loops | Rule: match `new $T()` inside `for`/`while`/`foreach` in MonoBehaviour |
| Missing prefab refs | Harder — requires runtime context Semgrep can't see |

Example custom rule (Unity `Find()` in Update):

```yaml
rules:
  - id: unity-find-in-update
    pattern: |
      void Update() {
        ...
        GameObject.Find(...);
        ...
      }
    message: "GameObject.Find() in Update() is expensive. Cache the reference in Start() or Awake()."
    severity: WARNING
    languages: [csharp]
    metadata:
      category: performance
      technology: [unity]
```

---

## 4. Integration Architecture

### 4.1 CLI Wrapper

```
src/security/
  SemgrepRunner.ts      — Spawns CLI, parses JSON output
  SemgrepRules.ts       — Manages rule configs (built-in + custom)
  SemgrepTypes.ts       — Finding, Severity, RuleMatch types
```

### 4.2 Execution Flow

```
User clicks "Run Security Scan" (Security tab)
  → SemgrepRunner.scan({ target: workspaceRoot, config: ['p/security-audit', '.spacecode/rules/'] })
  → Spawns: semgrep --config p/security-audit --config .spacecode/rules/ --json <workspace>
  → Parses JSON → Finding[]
  → Groups by severity (ERROR / WARNING / INFO)
  → Posts to webview: { type: 'securityResults', findings }
  → Webview renders in Security tab with clickable file:line links
  → Critical findings → SoundService.play('sectorViolation')
```

### 4.3 JSON Output Structure (what we parse)

```json
{
  "results": [
    {
      "check_id": "javascript.express.security.injection.tainted-sql-string",
      "path": "src/api/users.ts",
      "start": { "line": 42, "col": 5 },
      "end": { "line": 42, "col": 68 },
      "extra": {
        "message": "User input flows into SQL query without sanitization",
        "severity": "ERROR",
        "metadata": {
          "cwe": ["CWE-89"],
          "owasp": ["A03:2021"],
          "confidence": "HIGH"
        },
        "fix": "Use parameterized queries instead"
      }
    }
  ],
  "errors": []
}
```

### 4.4 Custom Rules Location

SpaceCode ships Unity/game-dev rules in:
```
.spacecode/rules/
  unity-performance.yml    — Find() in Update, allocations in loops
  unity-null-safety.yml    — Missing null checks after GetComponent
  csharp-security.yml      — Hardcoded secrets, SQL injection in .NET
  typescript-security.yml  — XSS, command injection in Node/TS
```

These are version-controlled with the SpaceCode extension (bundled in `media/semgrep-rules/` and copied to `.spacecode/rules/` on first run).

---

## 5. Installation & Prerequisites

Semgrep must be installed on the user's machine. SpaceCode handles this gracefully:

```typescript
// SemgrepRunner.ts
async checkInstalled(): Promise<boolean> {
  try {
    await exec('semgrep --version');
    return true;
  } catch {
    return false;
  }
}

// If not installed, show banner in Security tab:
// "Semgrep not found. Install with: brew install semgrep (macOS) or pip install semgrep"
```

Installation methods:
- **macOS**: `brew install semgrep`
- **Any OS**: `pip install semgrep` or `pipx install semgrep`
- **Docker**: `docker run semgrep/semgrep`

No build step or project compilation required — Semgrep scans source files directly.

---

## 6. Licensing

- **Semgrep CLI**: LGPL-2.1 — free to use, SpaceCode calls it as external process (no linking)
- **Community rules**: Semgrep Rules License (free for use)
- **Pro rules + Supply Chain**: Paid tier, not required for core functionality
- **No licensing concern** for SpaceCode — we spawn the CLI and parse output

---

## 7. What Semgrep Does NOT Cover

These Phase 6 features need separate tools:

| Feature | Recommended Tool |
|---------|-----------------|
| Duplicate/similar code detection | [jscpd](https://github.com/kucherenko/jscpd) (CLI, MIT) |
| Circular dependency checking | [madge](https://github.com/pahen/madge) (JS/TS), custom for C# |
| God class / high coupling metrics | Custom LOC + coupling counter |
| Architecture (sector) violations | Existing `AsmdefGate` + `SectorConfig` |
| Asset validation / missing prefab refs | Unity Editor via MCP tools |

---

## 8. Alternatives Considered

| Tool | Verdict | Why Not |
|------|---------|---------|
| SonarQube | Overkill | Server-based, heavy setup, wrong for a VS Code extension |
| ESLint (security plugins) | Too narrow | JS/TS only, no C#, no SAST depth |
| CodeQL | Good but heavy | Requires build step, GitHub-centric, slower scans |
| Opengrep (Semgrep fork) | Watch | Open-source fork, less mature, fewer rules |
| Snyk | Overkill | Cloud-based, auth required, dependency-focused |

Semgrep hits the right balance: CLI-based, fast, multi-language, free tier sufficient, custom rules easy to write.

---

## 9. Implementation Priority

1. **Phase 6.3 (Security Tab)**: Wire `SemgrepRunner` + built-in rulesets (`p/security-audit`, `p/secrets`)
2. **Phase 6.5 (Unity Checks)**: Write custom YAML rules for Unity performance patterns
3. **Phase 6.4 (Code Quality)**: Use Semgrep for pattern-based checks; add jscpd for duplication
4. **Post-V2**: Consider Semgrep Supply Chain for dependency CVE scanning

---

*Last updated: 2026-02-04*
