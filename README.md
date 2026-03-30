# icex-flow

**Deterministic agent workflow orchestration.** Eliminate randomness in AI agent pipelines.

> JSON decides. LLM executes. Every time, the same way.

[![npm](https://img.shields.io/npm/v/@icex-labs/icex-flow)](https://www.npmjs.com/package/@icex-labs/icex-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## The Problem

AI agents (OpenClaw, Claude Code, Codex, etc.) make freestyle decisions about:

- **Which agent handles a task** — random routing, inconsistent delegation
- **What context to inject** — forgotten rules, missed project docs
- **What steps to follow** — different execution path every run
- **Whether to verify results** — agents lie about success

When your agent forgets to read the deployment rules and pushes untested code to production, that's not an AI problem — that's a **process problem**.

## The Solution

`icex-flow` replaces LLM judgment with structured JSON definitions:

```
Task arrives → routes.json picks the agent + workflow
             → context.manifest.json injects the right files
             → workflow.flow.json defines exact steps
             → Each step is verified before proceeding
```

The LLM still does the intelligent work (writing code, analyzing problems). It just doesn't decide the **process**.

| Component | What it controls | LLM freestyle? |
|-----------|-----------------|:-:|
| `routes.json` | Task → agent + workflow | No |
| `context.manifest.json` | Files injected per step | No |
| `*.flow.json` | Step sequence + verification | No |
| `knowledge.json` | Persistent project knowledge | No |
| `PROJECT.md` | Auto-generated project context | No |

## Install

```bash
npm install -g @icex-labs/icex-flow
```

Requires Node.js >= 18.

## Quick Start

### 1. Initialize in your project

```bash
cd my-project
icex-flow init
```

You can also scan a remote directory without `cd`-ing into it:

```bash
# Scan a remote project, but write .icex-flow/ config to the current directory
icex-flow init --path /path/to/remote/project

# Same for generate — scan remotely, write locally
icex-flow generate --path /path/to/remote/project
```

`init` auto-detects your project:

- **Language** — Python, Node.js, Go, Java, Rust, etc.
- **Frameworks** — monorepo structure, microservices
- **CI/CD** — GitHub Actions, GitLab CI
- **Deployment** — Helm, Docker Compose, Kubernetes
- **Database** — Liquibase migrations, Prisma, etc.
- **Preset** — auto-selects from `microservice`, `monorepo`, `frontend`, `library`, `data-pipeline`, or `generic`

This generates a `.icex-flow/` directory with routes, context manifest, and workflow definitions — pre-configured for your stack.

### 2. Teach it what can't be auto-detected

```bash
icex-flow learn "production cluster is u9 at 192.168.1.200" --category environment
icex-flow learn "never push directly to main branch" --category safety
icex-flow learn "signal-runner feeds quant-bridge via Redis" --category architecture
```

Knowledge is persisted in `.icex-flow/knowledge.json` — survives agent restarts, session resets, and redeployments.

### 3. Generate project context

```bash
icex-flow generate
```

Produces `.icex-flow/context/L1-project/PROJECT.md` — a complete project knowledge document combining auto-detected facts + learned knowledge. Agents get this injected automatically so they never start from zero.

### 4. Use it

```bash
# Route a task to the right agent + workflow
icex-flow route "fix the login bug" --labels bug
# → { agent: "dev", workflow: "dev-chain", confidence: "keyword" }

# Assemble context for a specific step
icex-flow context dev-chain --step implement
# → Concatenated content of all required files (rules, docs, API refs)

# Generate a deterministic execution plan
icex-flow plan dev-chain --input '{"issue_number":"42","branch_name":"fix/login","pr_title":"Fix login"}'
# → Step-by-step plan with resolved commands and verification checks

# Resume a plan from a specific step (skip earlier steps)
icex-flow plan dev-chain --from-step 6 --input '{"issue_number":"42","branch_name":"fix/login"}'
# → Only steps 6 onwards (steps 1-5 skipped)

# Resume by step ID instead of number
icex-flow plan dev-chain --from-step create-pr --input '{"issue_number":"42","branch_name":"fix/login"}'
# → Steps from create-pr onwards

# Verify a step completed successfully
icex-flow verify --command "gh pr view 42 --json state -q '.state'" --expect "MERGED"
# → ✅ PASS or ❌ FAIL
```

## Commands

| Command | Description |
|---------|-------------|
| `icex-flow init [--path <dir>]` | Auto-detect project + scaffold `.icex-flow/` |
| `icex-flow validate [dir]` | Validate all JSON definitions |
| `icex-flow route "<task>"` | Route task → agent + workflow |
| `icex-flow plan <workflow> [--from-step <n\|id>]` | Generate deterministic execution plan (optionally resume from step) |
| `icex-flow context [workflow]` | Assemble context from manifest |
| `icex-flow verify --command "..."` | Run step verification |
| `icex-flow list` | List workflows and routes |
| `icex-flow generate [--path <dir>]` | Auto-generate PROJECT.md from detection + knowledge |
| `icex-flow learn "<fact>"` | Add persistent knowledge |
| `icex-flow learn --project <name>` | Associate knowledge with a registered project |
| `icex-flow learn --list` | List all learned knowledge |
| `icex-flow learn --remove <id>` | Remove a knowledge entry |
| `icex-flow projects [list\|add\|remove]` | Manage project registry |

## Directory Structure

After `icex-flow init`, your project gets:

```
.icex-flow/
├── routes.json                   # Task routing rules
├── context.manifest.json         # What files to inject, per workflow/step
├── knowledge.json                # Persistent learned knowledge
├── context/
│   ├── L0-global/                # Always injected (all workflows)
│   │   ├── workflow-rules.md     # Dev process rules
│   │   └── soul.md               # Agent identity
│   ├── L1-project/               # Injected for project-specific workflows
│   │   └── PROJECT.md            # Auto-generated project overview
│   └── L2-reference/             # Injected on-demand per step
│       └── api-docs.md           # API reference, etc.
└── workflows/
    ├── dev-chain.flow.json       # Development pipeline
    ├── deploy.flow.json          # Deployment pipeline
    └── db-migration.flow.json    # Database change pipeline
```

### Context Layers

| Layer | Purpose | When injected |
|-------|---------|---------------|
| **L0-global** | Universal rules (coding standards, safety, identity) | Every workflow, every step |
| **L1-project** | Project architecture, environments, services | Per-workflow |
| **L2-reference** | API docs, tool guides, detailed specs | Per-step (to save tokens) |

Files in these directories can be actual files or symlinks to files elsewhere in your project.

## Routing

`routes.json` maps tasks to agents and workflows using labels and keywords:

```json
{
  "version": "1.0.0",
  "default_agent": "main",
  "default_workflow": "default",
  "routes": [
    {
      "match": { "labels": ["auto-ok"] },
      "workflow": "dev-chain",
      "agent": "dev",
      "priority": 10
    },
    {
      "match": { "keywords": ["deploy", "rollout", "k3d"] },
      "workflow": "deploy",
      "agent": "ops",
      "priority": 5
    }
  ]
}
```

**Priority** — higher number wins when multiple routes match.

**Matching** — `labels` requires exact match; `keywords` matches against the task description (case-insensitive substring).

**Fallback** — if no route matches, uses `default_agent` + `default_workflow`.

## Workflows

A workflow defines a deterministic sequence of steps:

```json
{
  "name": "dev-chain",
  "version": "1.0.0",
  "description": "Issue → Code → Test → PR → Merge → Deploy → Notify",
  "inputs": {
    "issue_number": { "type": "string", "required": true },
    "branch_name": { "type": "string", "required": true },
    "repo": { "type": "string", "default": "my-org/my-repo" }
  },
  "steps": [
    {
      "id": "create-branch",
      "name": "Create Feature Branch",
      "action": "shell",
      "command": "git checkout -b {{branch_name}} && git push -u origin {{branch_name}}",
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
      "input": "Implement issue #{{issue_number}} on branch {{branch_name}}. Run tests.",
      "verify": {
        "command": "pytest tests/ -v",
        "expect_exit": 0
      }
    },
    {
      "id": "wait-ci",
      "name": "Wait for CI",
      "action": "gate",
      "verify": {
        "command": "gh pr checks {{branch_name}} --json state -q '.[].state' | sort -u",
        "expect": "SUCCESS",
        "retry": 12,
        "retry_delay": 30
      }
    },
    {
      "id": "notify",
      "name": "Notify Completion",
      "action": "notify",
      "channels": ["telegram:notify"],
      "message": "✅ PR merged for issue #{{issue_number}}"
    }
  ],
  "on_failure": {
    "action": "notify",
    "channels": ["telegram:notify"],
    "message": "❌ Failed at step '{{failed_step}}' for issue #{{issue_number}}: {{error}}"
  }
}
```

### Step Types

| Action | Purpose | Required Fields |
|--------|---------|-----------------|
| `shell` | Run a shell command | `command` |
| `agent` | Spawn a subagent | `agent`, `input`, `timeout` |
| `notify` | Send notifications | `channels`, `message` |
| `gate` | Wait for a condition with retries | `verify` (with `retry` + `retry_delay`) |

### Resuming from a Step

When a workflow fails partway through, you can resume from a specific step instead of re-running from the beginning:

```bash
# By step number (1-based)
icex-flow plan dev-chain --from-step 4 --input '{"issue_number":"42","branch_name":"fix/login"}'

# By step ID
icex-flow plan dev-chain --from-step create-pr --input '{"issue_number":"42","branch_name":"fix/login"}'
```

Both forms produce a plan that only includes the requested step and all subsequent steps. Step numbers in the output preserve their original position in the workflow for clarity.

### Variables

Use `{{variable_name}}` in any string field. Variables come from:

1. **Workflow inputs** — defined in the `inputs` section
2. **`--input` flag** — JSON passed to `icex-flow plan`
3. **Step capture** — `"capture": "pr_url"` saves a step's stdout as a variable for later steps

### Verification

Every step can have a `verify` block:

```json
{
  "verify": {
    "command": "gh pr view 42 --json state -q '.state'",
    "expect": "MERGED",
    "retry": 5,
    "retry_delay": 10
  }
}
```

- `expect` — output must contain this string
- `expect_exit` — command must exit with this code
- `retry` / `retry_delay` — retry N times with delay (seconds) between attempts
- If verification fails after all retries → workflow stops, `on_failure` fires

## Knowledge System

Agents lose context on restart. `icex-flow learn` gives them persistent memory:

```bash
# Add knowledge with categories
icex-flow learn "k3d is dev environment, U9 is production" --category environment
icex-flow learn "quant-bridge connects IBKR TWS via socat relay" --category architecture
icex-flow learn "never kubectl apply on production without approval" --category safety

# List what the project knows
icex-flow learn --list

# Remove outdated knowledge
icex-flow learn --remove <id>
```

### Categories

| Category | Purpose |
|----------|---------|
| `environment` | Clusters, servers, IPs, namespaces |
| `architecture` | Services, data flow, dependencies |
| `safety` | Rules, constraints, things to never do |
| `workflow` | Process overrides, special handling |
| `custom` | Anything else |

Knowledge is stored in `.icex-flow/knowledge.json` and merged into `PROJECT.md` when you run `icex-flow generate`.

## Project Registry

When you `init` a project, it's registered in `~/.icex-flow/projects.json`. This lets agents find all configured projects:

```bash
icex-flow projects list          # Show all registered projects
icex-flow projects add /path     # Register a project manually
icex-flow projects remove /path  # Unregister a project
```

## Platform Integration

### OpenClaw

icex-flow ships with a `SKILL.md` — drop it into your skills directory:

```bash
# Option 1: Symlink to installed package
ln -s $(npm root -g)/@icex-labs/icex-flow ~/.openclaw/workspace/skills/icex-flow

# Option 2: Copy SKILL.md only
cp $(npm root -g)/@icex-labs/icex-flow/SKILL.md ~/.openclaw/workspace/skills/icex-flow/
```

The skill teaches agents to use `icex-flow route → context → plan → verify` instead of freestyle execution. OpenClaw adapter is included at `src/adapters/openclaw.ts`.

### Claude Code

Use the programmatic API in your CLAUDE.md or custom tools:

```typescript
import { routeTask, planWorkflow, assembleContext, verifyStep } from '@icex-labs/icex-flow';

// Route
const result = routeTask(routesConfig, { description: "fix login bug", labels: ["bug"] });
// → { agent: "dev", workflow: "dev-chain", confidence: "keyword" }

// Plan
const plan = planWorkflow(workflowDef, { issue_number: "42", branch_name: "fix/login" });
// → { steps: [...], variables: {...} }
```

Or use the CLI in your CLAUDE.md instructions:

```markdown
## Task Execution
Before starting any task, run `icex-flow route "<task>"` to determine the correct workflow.
Follow the plan from `icex-flow plan <workflow>` exactly — do not skip steps.
```

## Example: Full Dev Pipeline

Here's what happens when an agent receives "fix issue #42":

```
1. icex-flow route "fix issue #42" --labels auto-ok
   → agent: dev, workflow: dev-chain

2. icex-flow context dev-chain --step implement
   → Injects: workflow rules + project architecture + API docs

3. icex-flow plan dev-chain --input '{"issue_number":"42","branch_name":"fix/42-login-bug"}'
   → 7-step plan:
     Step 1: Lock issue (add in-progress label)
     Step 2: Create branch (git checkout -b)
     Step 3: Implement (spawn dev-coder agent, 600s timeout)
     Step 4: Create PR (gh pr create)
     Step 5: Wait CI (gate with 12 retries × 30s)
     Step 6: Merge PR (squash merge)
     Step 7: Notify (Telegram message)

4. Agent executes each step, running icex-flow verify after each one.
   If any step fails → on_failure notification fires, workflow stops.
```

**Same input, same output. Every time.**

## Why Not Just Prompt Better?

Prompting works for simple tasks. For multi-step pipelines, it breaks down:

| Approach | Works for | Fails at |
|----------|-----------|----------|
| Detailed prompts | Simple tasks | Agent still forgets steps under load |
| System instructions | Setting tone/rules | Can't enforce step ordering |
| CLAUDE.md / AGENTS.md | Conventions | Agent reads selectively |
| **icex-flow** | **Multi-step pipelines** | — |

icex-flow doesn't replace prompting — it handles the structural parts (routing, ordering, verification) so the LLM can focus on the creative parts (writing code, solving problems).

## Contributing

```bash
git clone https://github.com/icex-labs/icex-flow.git
cd icex-flow
npm install
npm run build
npm link  # for local testing
```

## License

MIT — [icex-labs](https://github.com/icex-labs)
