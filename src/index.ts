// Public API — for programmatic usage and Claude Code integration
export { routeTask } from './engine/router.js';
export { assembleContext, listContextFiles } from './engine/context.js';
export { planWorkflow, formatPlan } from './engine/planner.js';
export { verifyStep } from './engine/verifier.js';
export { detectProject } from './engine/detect.js';
export { generatePreset } from './presets/index.js';
export {
  ensureGlobalDir,
  loadRegistry,
  registerProject,
  unregisterProject,
  mergeRoutes,
  mergeWorkflows,
  mergeContextManifest,
  GLOBAL_DIR,
} from './engine/config.js';

// OpenClaw adapter
export { handleTask, getChannelMode, shouldUseIcexFlow, routeViaCLI, planViaCLI } from './adapters/index.js';

export type {
  WorkflowDefinition,
  WorkflowStep,
  StepVerification,
  RoutesConfig,
  Route,
  RouteMatch,
  ContextManifest,
  TaskInput,
  RouteResult,
  ExecutionPlan,
  PlannedStep,
  VerifyResult,
  IcexFlowConfig,
  GlobalConfig,
  ProjectRegistry,
  ProjectRegistryEntry,
  DetectedProject,
  PresetType,
} from './types.js';
