import type {
  WorkflowDefinition,
  ExecutionPlan,
  PlannedStep,
} from '../types.js';
import { resolveTemplate } from '../utils.js';

/**
 * Generate a deterministic execution plan from a workflow definition + input variables.
 *
 * The plan is a fully-resolved, step-by-step sequence with all templates expanded.
 * The LLM follows this plan mechanically — no freestyle decisions.
 */
export function planWorkflow(
  workflow: WorkflowDefinition,
  input: Record<string, string>,
): ExecutionPlan {
  const vars = resolveInputs(workflow, input);

  const steps: PlannedStep[] = workflow.steps.map((step) => {
    // Evaluate condition
    if (step.condition) {
      const resolved = resolveTemplate(step.condition, vars);
      // Simple truthy check: skip if variable is empty or "false"
      if (!resolved || resolved === 'false' || resolved === '{{' + step.condition.slice(2)) {
        return {
          id: step.id,
          name: step.name,
          action: step.action,
          status: 'skipped' as const,
        };
      }
    }

    return {
      id: step.id,
      name: step.name,
      action: step.action,
      resolved_command: step.command
        ? resolveTemplate(step.command, vars)
        : undefined,
      resolved_input: step.input
        ? resolveTemplate(step.input, vars)
        : undefined,
      timeout: step.timeout,
      verify: step.verify
        ? {
            command: resolveTemplate(step.verify.command, vars),
            expect: step.verify.expect
              ? resolveTemplate(step.verify.expect, vars)
              : undefined,
            expect_exit: step.verify.expect_exit,
          }
        : undefined,
      status: 'pending' as const,
    };
  });

  return {
    workflow: workflow.name,
    steps,
    context_files: workflow.context?.always ?? [],
    variables: vars,
  };
}

/**
 * Format an execution plan as human/agent-readable text output.
 */
export function formatPlan(plan: ExecutionPlan): string {
  const lines: string[] = [];

  lines.push(`# Execution Plan: ${plan.workflow}`);
  lines.push('');
  lines.push(`Variables: ${JSON.stringify(plan.variables, null, 2)}`);
  lines.push('');

  if (plan.context_files.length) {
    lines.push('## Context Files');
    for (const f of plan.context_files) {
      lines.push(`  - ${f}`);
    }
    lines.push('');
  }

  lines.push('## Steps');
  lines.push('');

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const num = i + 1;

    if (step.status === 'skipped') {
      lines.push(`### Step ${num}: ${step.name} [SKIPPED]`);
      lines.push('');
      continue;
    }

    lines.push(`### Step ${num}: ${step.name}`);
    lines.push(`- Action: ${step.action}`);

    if (step.resolved_command) {
      lines.push(`- Command: \`${step.resolved_command}\``);
    }
    if (step.resolved_input) {
      lines.push(`- Input: ${step.resolved_input}`);
    }
    if (step.timeout) {
      lines.push(`- Timeout: ${step.timeout}s`);
    }
    if (step.verify) {
      lines.push(`- Verify: \`${step.verify.command}\``);
      if (step.verify.expect) {
        lines.push(`  - Expect output: "${step.verify.expect}"`);
      }
      if (step.verify.expect_exit !== undefined) {
        lines.push(`  - Expect exit code: ${step.verify.expect_exit}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    'IMPORTANT: Execute steps in order. Do NOT skip steps. Run verification after each step. Stop on failure.',
  );

  return lines.join('\n');
}

function resolveInputs(
  workflow: WorkflowDefinition,
  input: Record<string, string>,
): Record<string, string> {
  const vars: Record<string, string> = {};

  // Apply defaults from workflow definition
  if (workflow.inputs) {
    for (const [key, def] of Object.entries(workflow.inputs)) {
      if (input[key] !== undefined) {
        vars[key] = String(input[key]);
      } else if (def.default !== undefined) {
        vars[key] = String(def.default);
      } else if (def.required) {
        throw new Error(
          `Missing required input: ${key} (${def.description ?? 'no description'})`,
        );
      }
    }
  }

  // Include any extra input vars not in the definition
  for (const [key, val] of Object.entries(input)) {
    if (!(key in vars)) {
      vars[key] = val;
    }
  }

  return vars;
}
