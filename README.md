# icex-flow

**Deterministic agent workflow orchestration.** Eliminate randomness in AI agent pipelines.

> JSON decides. LLM executes. Every time, the same way.

## The Problem

AI agents (OpenClaw, Claude Code, etc.) make freestyle decisions about:
- Which agent handles a task → **random routing**
- What context to inject → **forgotten rules, missed files**
- What steps to follow → **different path every run**
- Whether to verify results → **lies about success**

## The Solution

`icex-flow` replaces LLM judgment with structured JSON definitions:

| Component | What it does | LLM decides? |
|-----------|-------------|:---:|
| **Routes** (`routes.json`) | Maps tasks → agents + workflows | No |
| **Context** (`context.manifest.json`) | Lists files to inject per step | No |
| **Workflows** (`*.flow.json`) | Defines steps + verification | No |
| **Verification** (built-in) | Checks step completion | No |

The LLM still does the intelligent work (writing code, analyzing problems). It just doesn't decide the **process**.

## Install

```bash
npm install -g icex-flow
```

## Quick Start

```bash
# Initialize in your project
icex-flow init

# Edit the generated files
vim .icex-flow/routes.json
vim .icex-flow/context.manifest.json
vim .icex-flow/workflows/dev-chain.flow.json

# Validate
icex-flow validate

# Route a task
icex-flow route "fix the login bug" --labels bug
# → Agent: dev, Workflow: dev-chain, Confidence: keyword

# Generate execution plan
icex-flow plan dev-chain --input '{"issue_number":"42","branch_name":"fix/login","pr_title":"Fix login bug"}'
# → Step-by-step plan with resolved commands and verification

# Assemble context for a step
icex-flow context dev-chain --step implement
# → Concatenated content of all required files
```

## Commands

| Command | Description |
|---------|-------------|
| `icex-flow init [dir]` | Scaffold `.icex-flow/` with templates |
| `icex-flow validate [dir]` | Validate all JSON definitions |
| `icex-flow route "<task>"` | Route task to agent + workflow |
| `icex-flow plan <workflow>` | Generate deterministic execution plan |
| `icex-flow context [workflow]` | Assemble context from manifest |
| `icex-flow verify --command "..."` | Run step verification |
| `icex-flow list` | List workflows and routes |

## Workflow Definition

A workflow is a JSON file defining a deterministic sequence of steps:

```json
{
  "name": "dev-chain",
  "version": "1.0.0",
  "description": "Issue → Code → Test → PR → Merge",
  "inputs": {
    "issue_number": { "type": "string", "required": true },
    "branch_name": { "type": "string", "required": true }
  },
  "steps": [
    {
      "id": "create-branch",
      "name": "Create Feature Branch",
      "action": "shell",
      "command": "git checkout -b {{branch_name}}",
      "verify": {
        "command": "git branch --show-current",
        "expect": "{{branch_name}}"
      }
    },
    {
      "id": "implement",
      "name": "Implement Changes",
      "action": "agent",
      "agent": "dev-coder",
      "timeout": 600,
      "input": "Implement issue #{{issue_number}}",
      "verify": {
        "command": "pytest tests/ -v",
        "expect_exit": 0
      }
    }
  ]
}
```

### Step Types

- **`shell`** — Run a command. Optionally capture output.
- **`agent`** — Spawn a subagent with input and timeout.
- **`notify`** — Send notifications to channels.
- **`gate`** — Wait for a condition (with retries).

### Verification

Every step can have a `verify` block:

```json
{
  "verify": {
    "command": "gh pr checks main --json state",
    "expect": "SUCCESS",
    "retry": 10,
    "retry_delay": 30
  }
}
```

Verification runs after each step. If it fails, the workflow stops.

## Platform Support

| Platform | Status | Integration |
|----------|--------|------------|
| **OpenClaw** | ✅ Supported | SKILL.md included, install as skill |
| **Claude Code** | 🔜 Planned | Programmatic API via `import { routeTask } from 'icex-flow'` |

## Programmatic API

```typescript
import { routeTask, planWorkflow, assembleContext, verifyStep } from 'icex-flow';

const result = routeTask(routesConfig, { description: "fix login bug", labels: ["bug"] });
// → { agent: "dev", workflow: "dev-chain", confidence: "keyword" }

const plan = planWorkflow(workflowDef, { issue_number: "42", branch_name: "fix/login" });
// → { steps: [...], variables: {...} }
```

## License

MIT — [icex-labs](https://github.com/icex-labs)
