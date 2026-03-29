---
name: icex-flow
description: |
  Deterministic agent workflow orchestration. Use when receiving any task that
  should be routed to a specific agent or executed as a multi-step workflow.
  Eliminates LLM freestyle decisions — routing, context assembly, step execution,
  and verification are all defined in JSON, not left to model judgment.
  Triggers: receiving a new task, spawning a subagent, executing a dev chain,
  deploying changes, triaging inbox items, or any multi-step operation.
metadata:
  openclaw:
    emoji: "⚡"
    requires:
      bins: ["node"]
    install:
      - id: "npm"
        kind: "npm"
        package: "icex-flow"
        bins: ["icex-flow"]
        label: "Install icex-flow via npm"
---

# icex-flow — Deterministic Agent Workflows

**Core principle: JSON decides, LLM executes.** No freestyle routing, no ad-hoc context, no skipped steps.

## Quick Reference

```bash
icex-flow init                          # Scaffold .icex-flow/ directory
icex-flow validate                      # Validate all definitions
icex-flow route "<task>" [--labels x]   # Route task → agent + workflow
icex-flow plan <workflow> --input '{}'  # Generate execution plan
icex-flow context [workflow] [--step x] # Assemble context from manifest
icex-flow verify --command "<cmd>"      # Run step verification
icex-flow list                          # List workflows and routes
```

## MANDATORY: How to Use in Agent Sessions

When you receive a task, follow this exact sequence. **Do NOT deviate.**

### Step 1: Route

```bash
icex-flow route "<task description>" --labels "label1,label2"
```

This returns the **agent** and **workflow** to use. Do NOT choose yourself.

### Step 2: Assemble Context

```bash
icex-flow context <workflow> --step <current-step>
```

Read the output. This is the context you MUST inject before executing. Do NOT decide what files to read — the manifest decides.

### Step 3: Plan

```bash
icex-flow plan <workflow> --input '{"key":"value"}'
```

This returns a step-by-step execution plan with resolved commands and verification. Follow it **in order**.

### Step 4: Execute Each Step

For each step in the plan:
1. Execute the action (shell command, spawn agent, send notification)
2. Run verification: `icex-flow verify --command "<verify_cmd>" --expect "<expected>"`
3. If verification fails → **STOP**. Do not continue. Report failure.
4. If verification passes → proceed to next step.

### Step 5: Report

After all steps complete (or on failure), send notifications as defined in the plan.

## File Structure

```
.icex-flow/
├── routes.json              # Task → agent + workflow mapping
├── context.manifest.json    # What files to inject per workflow/step
└── workflows/
    ├── dev-chain.flow.json  # Development workflow
    ├── deploy.flow.json     # Deployment workflow
    └── *.flow.json          # Custom workflows
```

## Workflow Definition Format

```json
{
  "name": "dev-chain",
  "version": "1.0.0",
  "description": "Issue → Code → Test → PR → Merge",
  "inputs": {
    "issue_number": { "type": "string", "required": true }
  },
  "steps": [
    {
      "id": "lock",
      "name": "Lock Issue",
      "action": "shell",
      "command": "gh issue edit {{issue_number}} --add-label in-progress",
      "verify": {
        "command": "gh issue view {{issue_number}} --json labels",
        "expect": "in-progress"
      }
    }
  ]
}
```

### Step Actions

| Action | Description | Required Fields |
|--------|-------------|-----------------|
| `shell` | Run a shell command | `command` |
| `agent` | Spawn a subagent | `agent`, `input`, `timeout` |
| `notify` | Send notification | `channels`, `message` |
| `gate` | Wait for condition | `verify` (with retries) |

### Variables

Use `{{variable_name}}` in any string field. Variables come from:
- Workflow `inputs` definitions
- `--input` JSON passed to `icex-flow plan`
- `capture` field on previous steps (captures command stdout)

## Anti-Patterns (FORBIDDEN)

| Do NOT | Instead |
|--------|---------|
| Choose which agent handles a task | Run `icex-flow route` |
| Decide what context files to read | Run `icex-flow context` |
| Skip steps in a workflow | Follow the plan exactly |
| Skip verification after a step | Always run `icex-flow verify` |
| Improvise extra steps | Only execute what's in the plan |
| Report success without verification | Verify first, then report |
