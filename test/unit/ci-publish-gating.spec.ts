import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

/**
 * A publicação de imagens só pode acontecer depois dos gates do MESMO SHA. Este teste lê o
 * workflow entregue e falha se a dependência explícita, o gatilho ou as permissões mudarem.
 */
type Step = { name?: string; uses?: string; with?: Record<string, unknown>; run?: string };
type Job = {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  'continue-on-error'?: boolean;
  steps: Step[];
};
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const ci = yaml.load(readFileSync(path.join(workflowsDir, 'ci.yml'), 'utf8')) as Workflow;

const GATES = ['build', 'e2e', 'security', 'image-scan'];

describe('CI publish gating', () => {
  it('publishes only after every gate of the same SHA', () => {
    const needs = ([] as string[]).concat(ci.jobs.publish.needs ?? []);
    for (const gate of GATES) expect(needs).toContain(gate);
    expect(([] as string[]).concat(ci.jobs['image-scan'].needs ?? [])).toEqual(
      expect.arrayContaining(['build', 'e2e', 'security']),
    );
  });

  it('publishes only on push to develop or master, never on pull requests', () => {
    const condition = ci.jobs.publish.if ?? '';
    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("refs/heads/master");
    expect(condition).toContain("refs/heads/develop");
    expect(condition).not.toContain('pull_request');
  });

  it('scans the final image with a blocking HIGH/CRITICAL policy before any push', () => {
    const scan = ci.jobs['image-scan'].steps.find((s) => (s.uses ?? '').startsWith('aquasecurity/trivy-action'));
    expect(scan?.with).toMatchObject({ severity: 'CRITICAL,HIGH', 'exit-code': '1', 'ignore-unfixed': false });
    const buildWithoutPush = ci.jobs['image-scan'].steps.find((s) => (s.uses ?? '').startsWith('docker/build-push-action'));
    expect(buildWithoutPush?.with).toMatchObject({ push: false });
  });

  it('keeps minimal permissions, no continue-on-error and no auto-merge', () => {
    expect(ci.jobs.publish.permissions).toEqual({ contents: 'read', packages: 'write' });
    for (const [name, job] of Object.entries(ci.jobs)) {
      expect({ name, continueOnError: job['continue-on-error'] ?? false }).toEqual({ name, continueOnError: false });
      for (const step of job.steps) {
        expect(step.run ?? '').not.toMatch(/gh pr merge|auto-merge|git push --force|reset --hard/);
      }
    }
  });

  it('tags the published image with the full validated SHA', () => {
    const meta = ci.jobs.publish.steps.find((s) => (s.uses ?? '').startsWith('docker/metadata-action'));
    expect(String(meta?.with?.tags)).toContain('type=sha,prefix=,format=long');
  });

  it('has no other workflow publishing images', () => {
    const others = readdirSync(workflowsDir).filter((f) => f !== 'ci.yml');
    for (const file of others) {
      const text = readFileSync(path.join(workflowsDir, file), 'utf8');
      expect({ file, publishes: /push:\s*true|docker push|ghcr\.io/.test(text) }).toEqual({ file, publishes: false });
    }
  });
});
