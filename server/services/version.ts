import fs from 'fs-extra';
import path from 'path';
import { LintService } from './lint';

export interface SnapshotDiff {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}

export interface QualityTrendPoint {
  snapshot: string;
  timestamp: string;
  score: number;
  completeness: number;
  triggerAccuracy: number;
  resourceRationality: number;
  overallScore: number;
}

export class VersionService {
  static async createSnapshot(skillPath: string): Promise<string> {
    const snapshotsDir = path.join(skillPath, '.snapshots');
    await fs.ensureDir(snapshotsDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(snapshotsDir, `${timestamp}`);
    await fs.ensureDir(snapshotPath);
    
    const entries = await fs.readdir(skillPath);
    for (const entry of entries) {
      if (entry === '.snapshots') continue;
      const src = path.join(skillPath, entry);
      const dest = path.join(snapshotPath, entry);
      await fs.copy(src, dest);
    }
    
    return snapshotPath;
  }

  static async listSnapshots(skillPath: string): Promise<string[]> {
    const snapshotsDir = path.join(skillPath, '.snapshots');
    if (!await fs.pathExists(snapshotsDir)) return [];
    
    const entries = await fs.readdir(snapshotsDir);
    return entries.sort().reverse();
  }

  static async rollback(skillPath: string, snapshotName: string) {
    const snapshotPath = path.join(skillPath, '.snapshots', snapshotName);
    if (!await fs.pathExists(snapshotPath)) throw new Error('Snapshot not found');
    
    // Move .snapshots out before clearing skillPath
    const actualSnapshots = path.join(skillPath, '.snapshots');
    const tempSnapshots = path.join(path.dirname(skillPath), '.temp_snapshots');
    
    if (await fs.pathExists(actualSnapshots)) {
      await fs.move(actualSnapshots, tempSnapshots, { overwrite: true });
    }
    
    // Clear skillPath (now .snapshots is gone, so this is safe)
    await fs.emptyDir(skillPath);
    
    // Copy snapshot content back
    const snapshotContent = path.join(tempSnapshots, snapshotName);
    const snapshotEntries = await fs.readdir(snapshotContent);
    for (const entry of snapshotEntries) {
      await fs.copy(path.join(snapshotContent, entry), path.join(skillPath, entry));
    }
    
    // Move .snapshots back
    if (await fs.pathExists(tempSnapshots)) {
      await fs.move(tempSnapshots, actualSnapshots, { overwrite: true });
    }
  }

  /**
   * Compare SKILL.md content between two snapshots.
   * Returns the raw content of each side plus their labels.
   */
  static async diffSnapshots(skillPath: string, snapshot1: string, snapshot2: string): Promise<SnapshotDiff> {
    const dir = path.join(skillPath, '.snapshots');
    const content1 = await fs.readFile(path.join(dir, snapshot1, 'SKILL.md'), 'utf-8').catch(() => '');
    const content2 = await fs.readFile(path.join(dir, snapshot2, 'SKILL.md'), 'utf-8').catch(() => '');
    return { left: content1, right: content2, leftLabel: snapshot1, rightLabel: snapshot2 };
  }

  /**
   * Build a quality time-series across all snapshots of a skill.
   * For each snapshot, run the TRACE assessment and collect the scores.
   */
  static async getQualityTrend(skillPath: string): Promise<QualityTrendPoint[]> {
    const snapshotsDir = path.join(skillPath, '.snapshots');
    if (!await fs.pathExists(snapshotsDir)) return [];

    const names = await this.listSnapshots(skillPath); // reverse-chronological
    const points: QualityTrendPoint[] = [];

    for (const name of names) {
      const snapshotPath = path.join(snapshotsDir, name);
      if (!await fs.pathExists(snapshotPath)) continue;

      // Determine snapshot timestamp from directory mtime (snapshot names are ISO-derived)
      const stat = await fs.lstat(snapshotPath).catch(() => null);
      const timestamp = stat ? stat.mtime.toISOString() : name;

      // analyzeSkill already computes the TRACE report internally
      const report = await LintService.analyzeSkill(snapshotPath);
      const trace = report.trace;

      points.push({
        snapshot: name,
        timestamp,
        score: report.score,
        completeness: trace?.completeness ?? 0,
        triggerAccuracy: trace?.triggerAccuracy ?? 0,
        resourceRationality: trace?.resourceRationality ?? 0,
        overallScore: trace?.overallScore ?? 0,
      });
    }

    // Reverse to chronological order for trend charts
    return points.reverse();
  }
}
