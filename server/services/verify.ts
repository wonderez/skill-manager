import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { getAllAdapters } from './adapters';
import { HealthCheckService } from './health-check';

export interface VerifyEntry {
  skillName: string;
  masterHash: string | null;
  platformHash: string | null;
  status: 'consistent' | 'inconsistent' | 'missing-in-master' | 'missing-in-platform';
}

export interface VerifyReport {
  platformId: string;
  platformDir: string;
  total: number;
  consistent: number;
  inconsistent: number;
  missingInMaster: number;
  missingInPlatform: number;
  entries: VerifyEntry[];
}

export interface VerifyAllReport {
  reports: VerifyReport[];
  summary: {
    totalPlatforms: number;
    totalSkills: number;
    totalConsistent: number;
    totalInconsistent: number;
  };
  timestamp: string;
}

export class VerifyService {
  /**
   * Compute SHA-256 hash of a file
   */
  static async computeHash(filePath: string): Promise<string | null> {
    if (!await fs.pathExists(filePath)) return null;
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify consistency between a platform directory and the master repo
   */
  static async verifyPlatform(platformId: string, platformDir: string, masterDir: string): Promise<VerifyReport> {
    const entries: VerifyEntry[] = [];
    let consistent = 0, inconsistent = 0, missingInMaster = 0, missingInPlatform = 0;

    const ignoreList = await HealthCheckService.readIgnoreFile(masterDir);

    // Get all skill names from both sides
    const platformSkills = await this.getSkillNames(platformDir, ignoreList);
    const masterSkills = await this.getSkillNames(masterDir, ignoreList);
    const allNames = new Set([...platformSkills, ...masterSkills]);

    for (const skillName of allNames) {
      const masterSkillMd = path.join(masterDir, skillName, 'SKILL.md');
      const platformSkillMd = path.join(platformDir, skillName, 'SKILL.md');

      const masterHash = await this.computeHash(masterSkillMd);
      const platformHash = await this.computeHash(platformSkillMd);

      let status: VerifyEntry['status'];

      if (masterHash && platformHash) {
        if (masterHash === platformHash) {
          status = 'consistent';
          consistent++;
        } else {
          status = 'inconsistent';
          inconsistent++;
        }
      } else if (masterHash && !platformHash) {
        status = 'missing-in-platform';
        missingInPlatform++;
      } else if (!masterHash && platformHash) {
        status = 'missing-in-master';
        missingInMaster++;
      } else {
        // Neither has SKILL.md — skip
        continue;
      }

      entries.push({ skillName, masterHash, platformHash, status });
    }

    return {
      platformId,
      platformDir,
      total: entries.length,
      consistent,
      inconsistent,
      missingInMaster,
      missingInPlatform,
      entries,
    };
  }

  /**
   * Verify all installed platforms
   */
  static async verifyAll(masterDir: string): Promise<VerifyAllReport> {
    const adapters = getAllAdapters();
    const reports: VerifyReport[] = [];

    for (const adapter of adapters) {
      if (!await adapter.isInstalled()) continue;
      const platformDir = adapter.getSkillsDir();
      if (!await fs.pathExists(platformDir)) continue;

      const report = await this.verifyPlatform(adapter.id, platformDir, masterDir);
      reports.push(report);
    }

    const summary = {
      totalPlatforms: reports.length,
      totalSkills: reports.reduce((sum, r) => sum + r.total, 0),
      totalConsistent: reports.reduce((sum, r) => sum + r.consistent, 0),
      totalInconsistent: reports.reduce((sum, r) => sum + r.inconsistent, 0),
    };

    return { reports, summary, timestamp: new Date().toISOString() };
  }

  /**
   * Get skill names from a directory, filtered by ignore list
   */
  private static async getSkillNames(dir: string, ignoreList: string[]): Promise<Set<string>> {
    const names = new Set<string>();
    if (!await fs.pathExists(dir)) return names;

    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
      if (ignoreList.includes(entry)) continue;

      const stat = await fs.lstat(path.join(dir, entry)).catch(() => null);
      if (stat && (stat.isDirectory() || stat.isSymbolicLink())) {
        names.add(entry);
      }
    }
    return names;
  }
}
