import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { DetectedProject, PresetType } from '../types.js';

/**
 * Auto-detect project characteristics by scanning directory contents.
 * Pure filesystem inspection — no network calls, no prompts.
 */
export function detectProject(dir: string): DetectedProject {
  const features: string[] = [];
  const languages: string[] = [];
  let ci: string | undefined;
  let deployment: string | undefined;
  let testCommand: string | undefined;
  let buildCommand: string | undefined;
  let hasMigrations = false;
  let containerized = false;
  let isClaudeCode = false;
  let isMonorepo = false;
  let repoUrl: string | undefined;

  // --- Git repo URL ---
  const gitConfigPath = join(dir, '.git', 'config');
  if (existsSync(gitConfigPath)) {
    features.push('git');
    const gitConfig = readFileSync(gitConfigPath, 'utf-8');
    const urlMatch = gitConfig.match(/url\s*=\s*(.+)/);
    if (urlMatch) {
      repoUrl = urlMatch[1].trim();
      // Normalize SSH URL to HTTPS
      if (repoUrl.startsWith('git@')) {
        repoUrl = repoUrl
          .replace(/^git@([^:]+):/, 'https://$1/')
          .replace(/\.git$/, '');
      } else if (repoUrl.endsWith('.git')) {
        repoUrl = repoUrl.replace(/\.git$/, '');
      }
    }
  }

  // --- CI detection ---
  if (existsSync(join(dir, '.github', 'workflows'))) {
    ci = 'github-actions';
    features.push('ci:github-actions');
  } else if (existsSync(join(dir, '.gitlab-ci.yml'))) {
    ci = 'gitlab-ci';
    features.push('ci:gitlab-ci');
  } else if (existsSync(join(dir, 'Jenkinsfile'))) {
    ci = 'jenkins';
    features.push('ci:jenkins');
  } else if (existsSync(join(dir, '.circleci'))) {
    ci = 'circleci';
    features.push('ci:circleci');
  }

  // --- Deployment detection ---
  if (existsSync(join(dir, 'helm')) || existsSync(join(dir, 'Chart.yaml'))) {
    deployment = 'helm';
    features.push('deploy:helm');
  } else if (existsSync(join(dir, 'k8s')) || existsSync(join(dir, 'kubernetes'))) {
    deployment = 'kubernetes';
    features.push('deploy:kubernetes');
  } else if (existsSync(join(dir, 'terraform'))) {
    deployment = 'terraform';
    features.push('deploy:terraform');
  } else if (existsSync(join(dir, 'serverless.yml')) || existsSync(join(dir, 'serverless.ts'))) {
    deployment = 'serverless';
    features.push('deploy:serverless');
  }

  // --- Language / package detection ---
  if (existsSync(join(dir, 'package.json'))) {
    languages.push('node');
    features.push('lang:node');
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
      // Detect test command
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        testCommand = `npm test`;
        features.push('test:npm');
      }
      if (pkg.scripts?.build) {
        buildCommand = 'npm run build';
        features.push('build:npm');
      }
      // Detect frontend frameworks
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps?.react || allDeps?.['react-dom']) {
        languages.push('react');
        features.push('framework:react');
      }
      if (allDeps?.next) {
        languages.push('nextjs');
        features.push('framework:nextjs');
      }
      if (allDeps?.vue) {
        languages.push('vue');
        features.push('framework:vue');
      }
      if (allDeps?.angular || allDeps?.['@angular/core']) {
        languages.push('angular');
        features.push('framework:angular');
      }
      // Detect monorepo tools
      if (pkg.workspaces || existsSync(join(dir, 'lerna.json')) || existsSync(join(dir, 'nx.json')) || existsSync(join(dir, 'turbo.json')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) {
        isMonorepo = true;
        features.push('monorepo');
      }
    } catch {
      // Invalid package.json — continue
    }
  }

  if (existsSync(join(dir, 'tsconfig.json'))) {
    languages.push('typescript');
    features.push('lang:typescript');
  }

  if (existsSync(join(dir, 'pom.xml'))) {
    languages.push('java');
    features.push('lang:java');
    testCommand = testCommand ?? 'mvn test';
    buildCommand = buildCommand ?? 'mvn package';
  }

  if (existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'))) {
    languages.push('java');
    features.push('lang:java');
    testCommand = testCommand ?? './gradlew test';
    buildCommand = buildCommand ?? './gradlew build';
  }

  if (existsSync(join(dir, 'go.mod'))) {
    languages.push('go');
    features.push('lang:go');
    testCommand = testCommand ?? 'go test ./...';
    buildCommand = buildCommand ?? 'go build ./...';
  }

  if (existsSync(join(dir, 'Cargo.toml'))) {
    languages.push('rust');
    features.push('lang:rust');
    testCommand = testCommand ?? 'cargo test';
    buildCommand = buildCommand ?? 'cargo build';
  }

  const hasPyProject = existsSync(join(dir, 'pyproject.toml'));
  const hasSetupPy = existsSync(join(dir, 'setup.py'));
  const hasRequirements = existsSync(join(dir, 'requirements.txt'));
  if (hasPyProject || hasSetupPy || hasRequirements) {
    languages.push('python');
    features.push('lang:python');
    testCommand = testCommand ?? 'pytest';
  }

  // --- DB migrations ---
  if (
    existsSync(join(dir, 'liquibase')) ||
    existsSync(join(dir, 'migrations')) ||
    existsSync(join(dir, 'db', 'migrations')) ||
    existsSync(join(dir, 'alembic')) ||
    existsSync(join(dir, 'prisma'))
  ) {
    hasMigrations = true;
    features.push('db:migrations');
  }

  // --- Containerized ---
  if (existsSync(join(dir, 'Dockerfile')) || existsSync(join(dir, 'docker-compose.yml')) || existsSync(join(dir, 'docker-compose.yaml'))) {
    containerized = true;
    features.push('container:docker');
  }

  // --- Claude Code ---
  if (existsSync(join(dir, 'CLAUDE.md'))) {
    isClaudeCode = true;
    features.push('claude-code');
  }

  // --- Data pipeline indicators ---
  const hasAirflow = existsSync(join(dir, 'dags'));
  const hasDBT = existsSync(join(dir, 'dbt_project.yml'));
  if (hasAirflow) features.push('data:airflow');
  if (hasDBT) features.push('data:dbt');

  // --- Determine preset ---
  const preset = selectPreset({
    languages,
    features,
    isMonorepo,
    hasMigrations,
    containerized,
    deployment,
    hasAirflow,
    hasDBT,
  });

  // --- Determine primary language ---
  const primaryLang = languages[0] ?? 'unknown';

  return {
    name: basename(dir) || 'project',
    repo_url: repoUrl,
    language: primaryLang,
    languages,
    ci,
    deployment,
    test_command: testCommand,
    build_command: buildCommand,
    has_db_migrations: hasMigrations,
    containerized,
    is_claude_code: isClaudeCode,
    is_monorepo: isMonorepo,
    preset,
    detected_features: features,
  };
}

interface PresetInput {
  languages: string[];
  features: string[];
  isMonorepo: boolean;
  hasMigrations: boolean;
  containerized: boolean;
  deployment?: string;
  hasAirflow: boolean;
  hasDBT: boolean;
}

function selectPreset(input: PresetInput): PresetType {
  // Monorepo takes top priority
  if (input.isMonorepo) return 'monorepo';

  // Data pipeline
  if (input.hasAirflow || input.hasDBT) return 'data-pipeline';

  // Frontend detection
  const frontendFrameworks = ['react', 'nextjs', 'vue', 'angular'];
  const hasFrontend = input.languages.some((l) => frontendFrameworks.includes(l));
  const hasBackendSignals = input.containerized || !!input.deployment || input.hasMigrations;

  if (hasFrontend && !hasBackendSignals) return 'frontend';

  // Microservice: has backend language + containerized/deployable/has DB
  if (hasBackendSignals && input.languages.length > 0) return 'microservice';

  // Library: has a language but no deployment/container signals
  const hasLang = input.languages.length > 0;
  if (hasLang && !input.containerized && !input.deployment) return 'library';

  return 'generic';
}
