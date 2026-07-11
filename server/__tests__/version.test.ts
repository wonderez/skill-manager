import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { VersionService } from '../services/version';

describe('VersionService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `version-test-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    // Create a mock skill directory
    await fs.ensureDir(path.join(tmpDir, 'my-skill'));
    await fs.writeFile(path.join(tmpDir, 'my-skill', 'SKILL.md'), '---\nname: my-skill\n---\nOriginal content');
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  it('should create a snapshot', async () => {
    const skillPath = path.join(tmpDir, 'my-skill');
    const snapshotPath = await VersionService.createSnapshot(skillPath);

    expect(await fs.pathExists(snapshotPath)).toBe(true);
    const content = await fs.readFile(path.join(snapshotPath, 'SKILL.md'), 'utf-8');
    expect(content).toContain('Original content');
  });

  it('should list snapshots in reverse order', async () => {
    const skillPath = path.join(tmpDir, 'my-skill');
    await VersionService.createSnapshot(skillPath);
    // Small delay to get different timestamp
    await new Promise(r => setTimeout(r, 50));
    await VersionService.createSnapshot(skillPath);

    const snapshots = await VersionService.listSnapshots(skillPath);
    expect(snapshots.length).toBe(2);
    // Should be sorted reverse (newest first)
    expect(snapshots[0] >= snapshots[1]).toBe(true);
  });

  it('should rollback to a snapshot while preserving .snapshots', async () => {
    const skillPath = path.join(tmpDir, 'my-skill');
    const snapshotPath = await VersionService.createSnapshot(skillPath);
    const snapshotName = path.basename(snapshotPath);

    // Modify the skill
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '---\nname: my-skill\n---\nModified content');

    // Rollback
    await VersionService.rollback(skillPath, snapshotName);

    const content = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
    expect(content).toContain('Original content');
    // Snapshots should still exist
    expect(await fs.pathExists(path.join(skillPath, '.snapshots'))).toBe(true);
  });

  it('should throw for non-existent snapshot', async () => {
    const skillPath = path.join(tmpDir, 'my-skill');
    await expect(VersionService.rollback(skillPath, 'nonexistent'))
      .rejects.toThrow('Snapshot not found');
  });

  it('should return empty list when no snapshots exist', async () => {
    const skillPath = path.join(tmpDir, 'my-skill');
    const snapshots = await VersionService.listSnapshots(skillPath);
    expect(snapshots).toEqual([]);
  });
});
