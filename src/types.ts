// ── Workflow Definition ──────────────────────────────────────────────

export interface WorkflowDefinition {
  name: string;
  version: string;
  description: string;
  triggers?: {
    labels?: string[];
    keywords?: string[];
  };
  context?: {
    always?: string[];
    per_step?: Record<string, string[]>;
  };
  inputs?: Record<string, InputDefinition>;
  steps: WorkflowStep[];
  on_failure?: FailureHandler;
}

export interface InputDefinition {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: 'shell' | 'agent' | 'notify' | 'gate';
  command?: string;
  agent?: string;
  timeout?: number;
  input?: string;
  channels?: string[];
  message?: string;
  capture?: string;
  condition?: string;
  verify?: StepVerification;
}

export interface StepVerification {
  command: string;
  expect?: string;
  expect_exit?: number;
  retry?: number;
  retry_delay?: number;
}

export interface FailureHandler {
  action: 'notify' | 'rollback';
  channels?: string[];
  message?: string;
  rollback_steps?: string[];
}

// ── Routes ──────────────────────────────────────────────────────────

export interface RoutesConfig {
  version: string;
  default_agent: string;
  default_workflow?: string;
  routes: Route[];
}

export interface Route {
  match: RouteMatch;
  workflow: string;
  agent: string;
  priority?: number;
}

export interface RouteMatch {
  labels?: string[];
  keywords?: string[];
  channel?: string;
  sender?: string;
}

// ── Context Manifest ────────────────────────────────────────────────

export interface ContextManifest {
  version: string;
  base_dir?: string;
  global: {
    always_inject: string[];
    inject_if_exists?: string[];
  };
  workflows?: Record<string, WorkflowContextDef>;
}

export interface WorkflowContextDef {
  always_inject?: string[];
  inject_if_exists?: string[];
  steps?: Record<string, { inject?: string[] }>;
}

// ── Runtime Types ───────────────────────────────────────────────────

export interface TaskInput {
  description: string;
  labels?: string[];
  channel?: string;
  sender?: string;
}

export interface RouteResult {
  agent: string;
  workflow: string;
  matched_route?: Route;
  confidence: 'exact' | 'keyword' | 'default';
}

export interface ExecutionPlan {
  workflow: string;
  steps: PlannedStep[];
  context_files: string[];
  variables: Record<string, string>;
}

export interface PlannedStep {
  id: string;
  name: string;
  action: string;
  resolved_command?: string;
  resolved_input?: string;
  timeout?: number;
  verify?: {
    command: string;
    expect?: string;
    expect_exit?: number;
  };
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
}

export interface VerifyResult {
  passed: boolean;
  output: string;
  expected?: string;
  exit_code?: number;
}

// ── Config ──────────────────────────────────────────────────────────

export interface IcexFlowConfig {
  workflows_dir: string;
  routes_file: string;
  context_file: string;
  base_dir: string;
}

export const DEFAULT_CONFIG: IcexFlowConfig = {
  workflows_dir: '.icex-flow/workflows',
  routes_file: '.icex-flow/routes.json',
  context_file: '.icex-flow/context.manifest.json',
  base_dir: '.',
};

// ── Global Config ──────────────────────────────────────────────────

export interface GlobalConfig {
  version: string;
  notification_channel?: string;
  safety_constraints?: string[];
}

export interface ProjectRegistryEntry {
  path: string;
  name: string;
  preset?: string;
  registered_at: string;
  repo_url?: string;
}

export interface ProjectRegistry {
  version: string;
  projects: ProjectRegistryEntry[];
}

// ── Detection ──────────────────────────────────────────────────────

export type PresetType = 'microservice' | 'monorepo' | 'frontend' | 'library' | 'data-pipeline' | 'generic';

export interface DetectedProject {
  name: string;
  repo_url?: string;
  language: string;
  languages: string[];
  ci?: string;
  deployment?: string;
  test_command?: string;
  build_command?: string;
  has_db_migrations: boolean;
  containerized: boolean;
  is_claude_code: boolean;
  is_monorepo: boolean;
  preset: PresetType;
  detected_features: string[];
}
