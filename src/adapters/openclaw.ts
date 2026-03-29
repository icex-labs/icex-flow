/**
 * OpenClaw adapter for icex-flow
 * Provides helpers for OpenClaw skills to use icex-flow routing and planning
 */

import { routeTask } from '../engine/router.js';
import { planWorkflow } from '../engine/planner.js';
import { assembleContext } from '../engine/context.js';
import { mergeRoutes, mergeWorkflows, mergeContextManifest } from '../engine/config.js';
import type {
  RoutesConfig,
  WorkflowDefinition,
  ContextManifest,
  RouteResult,
  ExecutionPlan,
} from '../types.js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface OpenClawContext {
  workspacePath: string;      // ~/.openclaw/workspace
  channelId?: string;         // Discord channel ID
  agentId?: string;           // Current agent ID
  sessionKey?: string;        // Current session key
}

interface OpenClawTaskInput {
  description: string;
  labels?: string[];
  issueNumber?: string;
  channelId?: string;
}

interface HandleTaskResult {
  success: boolean;
  error?: string;
  route?: RouteResult;
  plan?: ExecutionPlan;
  context?: string;
  configDir?: string;
}

// Resolve icex-flow config directory
// Priority: project-specific .icex-flow/ > workspace .icex-flow/ > ~/.icex-flow/
function resolveConfigDir(workspacePath: string, projectPath?: string): string {
  const candidates = [
    projectPath && join(projectPath, '.icex-flow'),
    join(workspacePath, '.icex-flow'),
    join(process.env.HOME || '~', '.icex-flow'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No .icex-flow configuration found. Run: icex-flow init');
}

// Channel ID to mode mapping
const CHANNEL_MODES: Record<string, string> = {
  '1477537830053089341': 'dev-execute',    // #dev
  '1477537900437438474': 'dev-execute',    // #ops
  '1477549408487997520': 'dev-execute',    // #qa
  '1477549454339866716': 'dev-discuss',    // #arch
  '1476693934255247545': 'casual',         // #general
  '1477538241233885296': 'read-only',      // #notifications
};

export function getChannelMode(channelId: string): string {
  return CHANNEL_MODES[channelId] || 'casual';
}

export function shouldUseIcexFlow(channelId: string): boolean {
  const mode = getChannelMode(channelId);
  return mode === 'dev-execute' || mode === 'dev-discuss';
}

// Main entry point for OpenClaw skills
export async function handleTask(
  ctx: OpenClawContext,
  task: OpenClawTaskInput,
): Promise<HandleTaskResult> {
  const configDir = resolveConfigDir(ctx.workspacePath);
  const projectDir = resolve(configDir, '..');

  // 1. Route the task
  const routes = mergeRoutes(projectDir);
  if (!routes) {
    return {
      success: false,
      error: 'No routes configuration found. Run: icex-flow init',
    };
  }

  const routeResult = routeTask(routes, {
    description: task.description,
    labels: task.labels,
    channel: task.channelId,
  });

  // 2. Find workflow
  const allWorkflows = mergeWorkflows(projectDir);
  const workflow = allWorkflows.find((w) => w.name === routeResult.workflow);

  if (!workflow) {
    // Also try loading directly from the workflows directory
    const workflowPath = join(configDir, 'workflows', `${routeResult.workflow}.flow.json`);
    if (!existsSync(workflowPath)) {
      return {
        success: false,
        error: `Workflow "${routeResult.workflow}" not found`,
        route: routeResult,
      };
    }

    const loadedWorkflow: WorkflowDefinition = JSON.parse(
      readFileSync(workflowPath, 'utf-8'),
    );
    return buildResult(loadedWorkflow, routeResult, task, configDir, projectDir);
  }

  return buildResult(workflow, routeResult, task, configDir, projectDir);
}

function buildResult(
  workflow: WorkflowDefinition,
  routeResult: RouteResult,
  task: OpenClawTaskInput,
  configDir: string,
  projectDir: string,
): HandleTaskResult {
  // 3. Generate plan
  const variables: Record<string, string> = {};
  if (task.issueNumber) variables.issue_number = task.issueNumber;
  if (task.description) variables.task_description = task.description;

  const plan = planWorkflow(workflow, variables);

  // 4. Assemble context for the workflow
  const manifest = mergeContextManifest(projectDir);
  let context: string | undefined;
  if (manifest) {
    try {
      const firstStepId = plan.steps[0]?.id;
      context = assembleContext(
        manifest,
        projectDir,
        routeResult.workflow,
        firstStepId,
        plan.variables,
      );
    } catch {
      // Context assembly is best-effort; don't fail the whole task
    }
  }

  return {
    success: true,
    route: routeResult,
    plan,
    context,
    configDir,
  };
}

// CLI wrapper for simple cases
export function routeViaCLI(description: string, labels?: string[]): string {
  const args = [`icex-flow route "${description}"`];
  if (labels?.length) args.push(`--labels ${labels.join(',')}`);
  return execSync(args.join(' '), { encoding: 'utf-8' });
}

export function planViaCLI(workflow: string, input?: Record<string, string>): string {
  const args = [`icex-flow plan ${workflow}`];
  if (input) args.push(`--input '${JSON.stringify(input)}'`);
  return execSync(args.join(' '), { encoding: 'utf-8' });
}
