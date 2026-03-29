import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { loadJson, parseFlags } from '../utils.js';
import { planWorkflow, formatPlan } from '../engine/planner.js';
import type { WorkflowDefinition } from '../types.js';

export function cmdPlan(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  const workflowName = positional[0];

  if (!workflowName) {
    console.error('Usage: icex-flow plan <workflow-name> [--input \'{"key":"value"}\'] [--dir .]');
    process.exit(1);
  }

  const dir = flags['dir'] ?? '.';
  const wfDir = join(resolve(dir), '.icex-flow', 'workflows');

  // Find workflow file
  const workflow = findWorkflow(wfDir, workflowName);
  if (!workflow) {
    console.error(`Workflow not found: ${workflowName}`);
    console.error(`Available: ${listWorkflowNames(wfDir).join(', ')}`);
    process.exit(1);
  }

  // Parse input
  let input: Record<string, string> = {};
  if (flags['input']) {
    try {
      input = JSON.parse(flags['input']);
    } catch {
      console.error('Invalid --input JSON');
      process.exit(1);
    }
  }

  // Also accept individual --key value flags as input
  for (const [k, v] of Object.entries(flags)) {
    if (!['dir', 'input', 'json'].includes(k)) {
      input[k] = v;
    }
  }

  const plan = planWorkflow(workflow!, input);

  if (flags['json'] === 'true') {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(formatPlan(plan));
  }
}

function findWorkflow(
  wfDir: string,
  name: string,
): WorkflowDefinition | null {
  try {
    const files = readdirSync(wfDir).filter((f: string) => f.endsWith('.flow.json'));
    for (const file of files) {
      const wf = loadJson<WorkflowDefinition>(join(wfDir, file));
      if (wf.name === name) return wf;
    }
  } catch {
    // dir doesn't exist
  }
  return null;
}

function listWorkflowNames(wfDir: string): string[] {
  try {
    return readdirSync(wfDir)
      .filter((f: string) => f.endsWith('.flow.json'))
      .map((f: string) => {
        try {
          return loadJson<WorkflowDefinition>(join(wfDir, f)).name;
        } catch {
          return f;
        }
      });
  } catch {
    return [];
  }
}
