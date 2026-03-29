// Public API — for programmatic usage and Claude Code integration
export { routeTask } from './engine/router.js';
export { assembleContext, listContextFiles } from './engine/context.js';
export { planWorkflow, formatPlan } from './engine/planner.js';
export { verifyStep } from './engine/verifier.js';

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
} from './types.js';
