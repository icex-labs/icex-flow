import type { RoutesConfig, TaskInput, RouteResult, Route } from '../types.js';

/**
 * Deterministic task routing — no LLM judgment, pure rule matching.
 *
 * Priority: label match (exact) → keyword match (scored) → channel match → default
 */
export function routeTask(
  config: RoutesConfig,
  task: TaskInput,
): RouteResult {
  // 1. Label match (exact — highest priority)
  if (task.labels?.length) {
    for (const route of config.routes) {
      if (route.match.labels?.some((l) => task.labels!.includes(l))) {
        return hit(route, 'exact');
      }
    }
  }

  // 2. Keyword match (scored — best match wins)
  const desc = task.description.toLowerCase();
  let best: { route: Route; score: number } | null = null;

  for (const route of config.routes) {
    if (!route.match.keywords?.length) continue;
    const score = route.match.keywords.filter((k) =>
      desc.includes(k.toLowerCase()),
    ).length;
    if (
      score > 0 &&
      (!best ||
        score > best.score ||
        (score === best.score &&
          (route.priority ?? 0) > (best.route.priority ?? 0)))
    ) {
      best = { route, score };
    }
  }

  if (best) {
    return hit(best.route, 'keyword');
  }

  // 3. Channel match
  if (task.channel) {
    for (const route of config.routes) {
      if (route.match.channel === task.channel) {
        return hit(route, 'exact');
      }
    }
  }

  // 4. Default
  return {
    agent: config.default_agent,
    workflow: config.default_workflow ?? 'default',
    confidence: 'default',
  };
}

function hit(
  route: Route,
  confidence: 'exact' | 'keyword',
): RouteResult {
  return {
    agent: route.agent,
    workflow: route.workflow,
    matched_route: route,
    confidence,
  };
}
