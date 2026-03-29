import type { PresetType, DetectedProject, RoutesConfig, WorkflowDefinition } from '../types.js';

export interface PresetOutput {
  routes: RoutesConfig;
  workflows: WorkflowDefinition[];
  context_manifest: object;
}

/**
 * Generate config files based on detected project type.
 * Each preset produces routes, workflows, and a context manifest.
 */
export function generatePreset(detected: DetectedProject): PresetOutput {
  const generator = PRESETS[detected.preset] ?? PRESETS.generic;
  return generator(detected);
}

const PRESETS: Record<PresetType, (d: DetectedProject) => PresetOutput> = {
  microservice: generateMicroservice,
  monorepo: generateMonorepo,
  frontend: generateFrontend,
  library: generateLibrary,
  'data-pipeline': generateDataPipeline,
  generic: generateGeneric,
};

// ── Microservice ─────────────────────────────────────────────────────

function generateMicroservice(d: DetectedProject): PresetOutput {
  const testCmd = d.test_command ?? 'npm test';
  const repo = d.repo_url ? repoSlug(d.repo_url) : d.name;

  return {
    routes: {
      version: '1.0.0',
      default_agent: 'main',
      default_workflow: 'dev-chain',
      routes: [
        {
          match: { labels: ['auto-ok'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 10,
        },
        {
          match: { keywords: ['implement', 'fix', 'bug', 'feature', 'refactor', 'add'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 5,
        },
        {
          match: { keywords: ['deploy', 'rollout', 'release', 'helm', 'cluster'] },
          workflow: 'dev-chain',
          agent: 'ops',
          priority: 5,
        },
        {
          match: { keywords: ['test', 'validate', 'qa', 'regression', 'lint', 'coverage'] },
          workflow: 'dev-chain',
          agent: 'qa',
          priority: 5,
        },
        {
          match: { keywords: ['architecture', 'design', 'rfc', 'review'] },
          workflow: 'dev-chain',
          agent: 'arch',
          priority: 5,
        },
      ],
    },
    workflows: [devChainWorkflow(d, testCmd, repo)],
    context_manifest: contextManifest(),
  };
}

// ── Monorepo ─────────────────────────────────────────────────────────

function generateMonorepo(d: DetectedProject): PresetOutput {
  const testCmd = d.test_command ?? 'npm test';
  const repo = d.repo_url ? repoSlug(d.repo_url) : d.name;

  return {
    routes: {
      version: '1.0.0',
      default_agent: 'main',
      default_workflow: 'dev-chain',
      routes: [
        {
          match: { labels: ['auto-ok'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 10,
        },
        {
          match: { keywords: ['implement', 'fix', 'bug', 'feature', 'refactor'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 5,
        },
        {
          match: { keywords: ['deploy', 'rollout', 'release'] },
          workflow: 'dev-chain',
          agent: 'ops',
          priority: 5,
        },
        {
          match: { keywords: ['test', 'lint', 'ci'] },
          workflow: 'dev-chain',
          agent: 'qa',
          priority: 5,
        },
      ],
    },
    workflows: [devChainWorkflow(d, testCmd, repo)],
    context_manifest: contextManifest(),
  };
}

// ── Frontend ─────────────────────────────────────────────────────────

function generateFrontend(d: DetectedProject): PresetOutput {
  const testCmd = d.test_command ?? 'npm test';
  const repo = d.repo_url ? repoSlug(d.repo_url) : d.name;

  return {
    routes: {
      version: '1.0.0',
      default_agent: 'main',
      default_workflow: 'dev-chain',
      routes: [
        {
          match: { labels: ['auto-ok'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 10,
        },
        {
          match: { keywords: ['implement', 'fix', 'bug', 'feature', 'refactor', 'component', 'ui'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 5,
        },
        {
          match: { keywords: ['test', 'lint', 'accessibility', 'e2e', 'storybook'] },
          workflow: 'dev-chain',
          agent: 'qa',
          priority: 5,
        },
        {
          match: { keywords: ['design', 'review', 'ux'] },
          workflow: 'dev-chain',
          agent: 'arch',
          priority: 5,
        },
      ],
    },
    workflows: [devChainWorkflow(d, testCmd, repo)],
    context_manifest: contextManifest(),
  };
}

// ── Library ──────────────────────────────────────────────────────────

function generateLibrary(d: DetectedProject): PresetOutput {
  const testCmd = d.test_command ?? 'npm test';
  const repo = d.repo_url ? repoSlug(d.repo_url) : d.name;

  return {
    routes: {
      version: '1.0.0',
      default_agent: 'main',
      default_workflow: 'dev-chain',
      routes: [
        {
          match: { labels: ['auto-ok'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 10,
        },
        {
          match: { keywords: ['implement', 'fix', 'bug', 'feature', 'refactor'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 5,
        },
        {
          match: { keywords: ['test', 'lint', 'coverage'] },
          workflow: 'dev-chain',
          agent: 'qa',
          priority: 5,
        },
        {
          match: { keywords: ['release', 'publish', 'version'] },
          workflow: 'dev-chain',
          agent: 'ops',
          priority: 5,
        },
      ],
    },
    workflows: [devChainWorkflow(d, testCmd, repo)],
    context_manifest: contextManifest(),
  };
}

// ── Data Pipeline ────────────────────────────────────────────────────

function generateDataPipeline(d: DetectedProject): PresetOutput {
  const testCmd = d.test_command ?? 'pytest';
  const repo = d.repo_url ? repoSlug(d.repo_url) : d.name;

  return {
    routes: {
      version: '1.0.0',
      default_agent: 'main',
      default_workflow: 'dev-chain',
      routes: [
        {
          match: { labels: ['auto-ok'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 10,
        },
        {
          match: { keywords: ['implement', 'fix', 'pipeline', 'etl', 'transform'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 5,
        },
        {
          match: { keywords: ['test', 'validate', 'data-quality'] },
          workflow: 'dev-chain',
          agent: 'qa',
          priority: 5,
        },
        {
          match: { keywords: ['deploy', 'schedule', 'orchestrate'] },
          workflow: 'dev-chain',
          agent: 'ops',
          priority: 5,
        },
      ],
    },
    workflows: [devChainWorkflow(d, testCmd, repo)],
    context_manifest: contextManifest(),
  };
}

// ── Generic ──────────────────────────────────────────────────────────

function generateGeneric(d: DetectedProject): PresetOutput {
  const testCmd = d.test_command ?? 'echo "no tests configured"';
  const repo = d.repo_url ? repoSlug(d.repo_url) : d.name;

  return {
    routes: {
      version: '1.0.0',
      default_agent: 'main',
      default_workflow: 'default',
      routes: [
        {
          match: { keywords: ['implement', 'fix', 'bug', 'feature'] },
          workflow: 'dev-chain',
          agent: 'dev',
          priority: 5,
        },
      ],
    },
    workflows: [devChainWorkflow(d, testCmd, repo)],
    context_manifest: contextManifest(),
  };
}

// ── Shared helpers ───────────────────────────────────────────────────

function devChainWorkflow(d: DetectedProject, testCmd: string, repo: string): WorkflowDefinition {
  return {
    name: 'dev-chain',
    version: '1.0.0',
    description: 'Issue → Branch → Implement → Test → PR → Merge',
    triggers: {
      labels: ['auto-ok', 'bug', 'feature', 'enhancement'],
      keywords: ['implement', 'fix', 'add', 'refactor', 'build'],
    },
    context: {
      always: ['.icex-flow/context/L1-project/'],
      per_step: {},
    },
    inputs: {
      issue_number: { type: 'string', required: true, description: 'Issue number' },
      branch_name: { type: 'string', required: true, description: 'Feature branch name' },
      repo: { type: 'string', default: repo, description: 'Repository slug' },
      pr_title: { type: 'string', required: true, description: 'Pull request title' },
    },
    steps: [
      {
        id: 'lock-issue',
        name: 'Lock Issue',
        action: 'shell',
        command: 'gh issue edit {{issue_number}} --add-label in-progress --repo {{repo}}',
        verify: {
          command: "gh issue view {{issue_number}} --repo {{repo}} --json labels -q '.labels[].name'",
          expect: 'in-progress',
        },
      },
      {
        id: 'create-branch',
        name: 'Create Feature Branch',
        action: 'shell',
        command: 'git checkout -b {{branch_name}} && git push -u origin {{branch_name}}',
        verify: {
          command: 'git branch --show-current',
          expect: '{{branch_name}}',
        },
      },
      {
        id: 'implement',
        name: 'Implement Changes',
        action: 'agent',
        agent: 'dev-coder',
        timeout: 600,
        input: 'Implement the changes described in issue #{{issue_number}}. Branch: {{branch_name}}. Run tests before committing.',
        verify: {
          command: testCmd,
          expect_exit: 0,
        },
      },
      {
        id: 'create-pr',
        name: 'Create Pull Request',
        action: 'shell',
        command: "gh pr create --base main --head {{branch_name}} --title '{{pr_title}}' --body 'Closes #{{issue_number}}' --repo {{repo}}",
        capture: 'pr_url',
      },
      {
        id: 'merge-pr',
        name: 'Merge PR',
        action: 'shell',
        command: 'gh pr merge {{branch_name}} --squash --delete-branch --repo {{repo}}',
        verify: {
          command: "gh pr view {{branch_name}} --repo {{repo}} --json state -q '.state'",
          expect: 'MERGED',
        },
      },
      {
        id: 'notify',
        name: 'Notify Completion',
        action: 'notify',
        channels: ['telegram:notify'],
        message: 'dev-chain complete: {{pr_title}} (issue #{{issue_number}}) merged',
      },
    ],
    on_failure: {
      action: 'notify',
      channels: ['telegram:notify'],
      message: "dev-chain failed at step '{{failed_step}}' for issue #{{issue_number}}: {{error}}",
    },
  };
}

function contextManifest(): object {
  return {
    version: '1.0.0',
    base_dir: '.',
    global: {
      always_inject: ['context/L0-global/'],
      inject_if_exists: [],
    },
    workflows: {
      'dev-chain': {
        always_inject: ['context/L1-project/'],
        inject_if_exists: ['context/L2-reference/'],
        steps: {},
      },
    },
  };
}

function repoSlug(url: string): string {
  // Extract owner/repo from URL like https://github.com/owner/repo
  const match = url.match(/(?:github\.com|gitlab\.com)[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1] ?? url;
}
