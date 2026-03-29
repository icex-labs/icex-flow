import { join, resolve } from 'node:path';
import { loadJson, parseFlags } from '../utils.js';
import { routeTask } from '../engine/router.js';
import type { RoutesConfig } from '../types.js';

export function cmdRoute(args: string[]): void {
  const { positional, flags } = parseFlags(args);
  const description = positional[0];

  if (!description) {
    console.error('Usage: icex-flow route "<task description>" [--labels bug,feature] [--channel dev]');
    process.exit(1);
  }

  const dir = flags['dir'] ?? '.';
  const routesPath = join(resolve(dir), '.icex-flow', 'routes.json');

  const config = loadJson<RoutesConfig>(routesPath);
  const result = routeTask(config, {
    description,
    labels: flags['labels']?.split(','),
    channel: flags['channel'],
    sender: flags['sender'],
  });

  if (flags['json'] === 'true') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Agent:      ${result.agent}`);
    console.log(`Workflow:   ${result.workflow}`);
    console.log(`Confidence: ${result.confidence}`);
    if (result.matched_route) {
      console.log(`Match:      ${JSON.stringify(result.matched_route.match)}`);
    }
  }
}
