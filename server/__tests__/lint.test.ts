import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { LintService } from '../services/lint';

describe('LintService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `lint-test-${Date.now()}`);
    await fs.ensureDir(tmpDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  it('should return grade F for missing SKILL.md', async () => {
    const skillPath = path.join(tmpDir, 'empty-skill');
    await fs.ensureDir(skillPath);
    const report = await LintService.analyzeSkill(skillPath);
    expect(report.grade).toBe('F');
    expect(report.score).toBe(0);
    expect(report.issues.some(i => i.rule === 'skill-md-missing')).toBe(true);
  });

  it('should return grade A for a well-formed skill', async () => {
    const skillPath = path.join(tmpDir, 'good-skill');
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---
name: good-skill
description: 当用户需要代码审查时自动触发，帮助检测代码中的安全漏洞和最佳实践问题
---

## Instructions

- Review code for security issues
- Check for hardcoded secrets
- Suggest improvements

## Examples

- Example 1: Review a PR
`);
    const report = await LintService.analyzeSkill(skillPath);
    expect(report.score).toBeGreaterThanOrEqual(75);
    expect(['A', 'B']).toContain(report.grade);
    expect(report.metrics.hasFrontmatter).toBe(true);
    expect(report.metrics.hasName).toBe(true);
    expect(report.metrics.hasDescription).toBe(true);
  });

  it('should detect API keys', async () => {
    const skillPath = path.join(tmpDir, 'leaky-skill');
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---
name: leaky-skill
description: 当用户需要配置API时触发
---

Use this key: sk-abcdefghijklmnopqrstuvwxyz123456
`);
    const report = await LintService.analyzeSkill(skillPath);
    expect(report.issues.some(i => i.rule === 'secret-api-key')).toBe(true);
  });

  it('should detect internal URLs', async () => {
    const skillPath = path.join(tmpDir, 'internal-skill');
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---
name: internal-skill
description: 当用户需要访问内部系统时触发
---

Visit https://docs.alibaba-inc.com/api for details.
`);
    const report = await LintService.analyzeSkill(skillPath);
    expect(report.issues.some(i => i.rule === 'secret-internal-url')).toBe(true);
  });

  it('should cap score at 30 when frontmatter is missing', async () => {
    const skillPath = path.join(tmpDir, 'no-frontmatter');
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# Just a plain markdown file\nNo frontmatter here.');
    const report = await LintService.analyzeSkill(skillPath);
    expect(report.score).toBeLessThanOrEqual(30);
  });

  it('should warn for short descriptions', async () => {
    const skillPath = path.join(tmpDir, 'short-desc');
    await fs.ensureDir(skillPath);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), `---
name: short-desc
description: Too short
---

Content here.
`);
    const report = await LintService.analyzeSkill(skillPath);
    expect(report.issues.some(i => i.rule === 'desc-too-short')).toBe(true);
  });
});
