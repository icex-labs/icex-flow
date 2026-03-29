import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Works from both src/ (dev) and dist/src/ (compiled)
const TEMPLATES_DIR = existsSync(resolve(__dirname, '../../templates'))
  ? resolve(__dirname, '../../templates')
  : resolve(__dirname, '../../../templates');

export function cmdInit(args: string[]): void {
  const targetDir = args[0] ?? '.';
  const flowDir = join(resolve(targetDir), '.icex-flow');

  if (existsSync(flowDir)) {
    console.error(`Already initialized: ${flowDir}`);
    process.exit(1);
  }

  mkdirSync(join(flowDir, 'workflows'), { recursive: true });

  // Copy template files
  const files = [
    ['routes.json', 'routes.json'],
    ['context.manifest.json', 'context.manifest.json'],
    ['dev-chain.flow.json', 'workflows/dev-chain.flow.json'],
  ];

  for (const [src, dest] of files) {
    const srcPath = join(TEMPLATES_DIR, src);
    const destPath = join(flowDir, dest);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
    } else {
      // Generate minimal defaults inline
      writeFileSync(destPath, getDefault(src), 'utf-8');
    }
  }

  console.log(`✅ Initialized icex-flow at ${flowDir}`);
  console.log('');
  console.log('Created:');
  console.log('  .icex-flow/routes.json              — task routing rules');
  console.log('  .icex-flow/context.manifest.json     — context assembly manifest');
  console.log('  .icex-flow/workflows/dev-chain.flow.json — dev workflow template');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit routes.json to match your agent/channel setup');
  console.log('  2. Edit context.manifest.json to list your project files');
  console.log('  3. Customize or add workflows in workflows/');
  console.log('  4. Run: icex-flow validate');
}

function getDefault(filename: string): string {
  switch (filename) {
    case 'routes.json':
      return JSON.stringify(
        {
          version: '1.0.0',
          default_agent: 'main',
          default_workflow: 'default',
          routes: [],
        },
        null,
        2,
      );
    case 'context.manifest.json':
      return JSON.stringify(
        {
          version: '1.0.0',
          global: { always_inject: [], inject_if_exists: [] },
          workflows: {},
        },
        null,
        2,
      );
    default:
      return '{}';
  }
}
