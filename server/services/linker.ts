import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { ClassifierService } from './classifier';
import { JunctionUtils } from './junction-utils';

export interface LinkAction {
  skillName: string;
  type: 'missing-in-platform' | 'platform-new-candidate' | 'platform-specific' | 'conflict' | 'broken-link' | 'valid-link' | 'garbage';
  currentState: string;
  targetPath: string;
  reason: string;
  conflictDetails?: {
    platformSize: number;
    platformMtime: string;
    masterSize: number;
    masterMtime: string;
    masterHash?: string;
    platformHash?: string;
  };
  resolution?: 'skip' | 'symlink' | 'promote-and-symlink' | 'overwrite-with-master' | 'overwrite-with-platform' | 'remove' | 'promote-only';
}

export interface LinkPlan {
  platformDir: string;
  platformName: string;
  readsFromUniversal: boolean;
  actions: LinkAction[];
  summary: { toLink: number; toSkip: number; alreadyLinked: number; broken: number; };
}

async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        size += await getDirSize(fullPath);
      } else {
        size += stat.size;
      }
    }
  } catch {
    // Ignore errors for unreadable files
  }
  return size;
}

/**
 * Compute SHA-256 hash of SKILL.md for content verification
 */
async function computeSkillHash(skillPath: string): Promise<string | null> {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!await fs.pathExists(skillMdPath)) return null;
  const content = await fs.readFile(skillMdPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export class LinkerService {
  /**
   * Generate a link plan for a platform.
   * @param readsFromUniversal If true, the platform reads ~/.agents/skills/ natively.
   *   Junctions are redundant — missing-in-platform actions are skipped, and
   *   promote-and-symlink becomes promote-only (no junction created).
   */
  static async generateLinkPlan(
    platformDir: string, masterDir: string, platformName: string,
    readsFromUniversal = false
  ): Promise<LinkPlan> {
    const actions: LinkAction[] = [];
    let toLink = 0, toSkip = 0, alreadyLinked = 0, broken = 0;

    if (!await fs.pathExists(platformDir)) {
      return { platformDir, platformName, readsFromUniversal, actions, summary: { toLink, toSkip, alreadyLinked, broken } };
    }

    const entries = await fs.readdir(platformDir);
    const seenSkills = new Set<string>();

    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
      seenSkills.add(entry);
      const fullPath = path.join(platformDir, entry);
      const targetPath = path.join(masterDir, entry);

      const stat = await fs.lstat(fullPath).catch(() => null);
      if (!stat) continue;

      // Use JunctionUtils for reliable junction detection on Windows
      const isJunction = JunctionUtils.isJunction(fullPath);

      if (isJunction) {
        const isBroken = JunctionUtils.isBrokenJunction(fullPath);
        if (isBroken) {
          actions.push({
            skillName: entry,
            type: 'broken-link',
            currentState: 'junction-broken',
            targetPath,
            reason: 'Invalid symlink. Recommend cleanup.',
            resolution: 'remove'
          });
          broken++;
        } else {
          actions.push({
            skillName: entry,
            type: 'valid-link',
            currentState: 'junction-valid',
            targetPath,
            reason: readsFromUniversal
              ? 'Redundant junction (platform reads universal dir natively). Recommend removal.'
              : 'Properly linked to master.',
            resolution: readsFromUniversal ? 'remove' : 'skip'
          });
          if (readsFromUniversal) broken++; else alreadyLinked++;
        }
      } else if (stat.isDirectory()) {
        // 跳过无 SKILL.md 的目录（非技能目录不处理）
        if (!await fs.pathExists(path.join(fullPath, 'SKILL.md'))) continue;
        const classResult = await ClassifierService.classifySkill(fullPath, masterDir, platformName);
        if (classResult.existsInMaster) {
          // Conflict: Both have real dir
          const masterStat = await fs.stat(targetPath).catch(() => null);
          actions.push({
            skillName: entry,
            type: 'conflict',
            currentState: 'real-dir',
            targetPath,
            reason: 'Conflict: Both platform and master have real directories.',
            resolution: 'skip',
            conflictDetails: {
              platformSize: await getDirSize(fullPath),
              platformMtime: stat.mtime.toISOString(),
              masterSize: masterStat ? await getDirSize(targetPath) : 0,
              masterMtime: masterStat ? masterStat.mtime.toISOString() : '',
              masterHash: await computeSkillHash(targetPath) || undefined,
              platformHash: await computeSkillHash(fullPath) || undefined,
            }
          });
          toSkip++;
        } else if (classResult.classification === 'garbage') {
          actions.push({ skillName: entry, type: 'garbage', currentState: 'real-dir', targetPath, reason: classResult.recommendation, resolution: 'remove' });
          broken++;
        } else if (classResult.classification === 'candidate-promote') {
          actions.push({
            skillName: entry,
            type: 'platform-new-candidate',
            currentState: 'real-dir',
            targetPath,
            reason: readsFromUniversal
              ? 'New skill detected. Recommend promoting to master (no junction needed — platform reads universal).'
              : 'New skill detected without platform-specific code. Recommend promoting to master.',
            resolution: readsFromUniversal ? 'promote-only' : 'promote-and-symlink'
          });
          toLink++;
        } else {
          actions.push({
            skillName: entry,
            type: 'platform-specific',
            currentState: 'real-dir',
            targetPath,
            reason: classResult.recommendation,
            resolution: 'skip'
          });
          toSkip++;
        }
      }
    }

    // Only suggest missing-in-platform for non-universal platforms
    if (!readsFromUniversal) {
      const masterEntries = await fs.pathExists(masterDir) ? await fs.readdir(masterDir) : [];
      for (const mEntry of masterEntries) {
        if (mEntry.startsWith('.') || mEntry.startsWith('_tmp_')) continue;
        const mPath = path.join(masterDir, mEntry);
        const mStat = await fs.lstat(mPath).catch(() => null);
        if (mStat && mStat.isDirectory() && !seenSkills.has(mEntry)) {
          // 跳过无 SKILL.md 的目录（非技能目录不处理）
          if (!await fs.pathExists(path.join(mPath, 'SKILL.md'))) continue;
          actions.push({
            skillName: mEntry,
            type: 'missing-in-platform',
            currentState: 'not-exists',
            targetPath: mPath,
            reason: 'Universal skill missing in platform. Recommend symlink.',
            resolution: 'symlink'
          });
          toLink++;
        }
      }
    }

    return {
      platformDir,
      platformName,
      readsFromUniversal,
      actions,
      summary: { toLink, toSkip, alreadyLinked, broken }
    };
  }

  static async executeLinkPlan(plan: LinkPlan): Promise<void> {
    await fs.ensureDir(plan.platformDir);
    const isUniversal = plan.readsFromUniversal;

    for (const action of plan.actions) {
      const platformPath = path.join(plan.platformDir, action.skillName);
      const masterPath = action.targetPath;

      try {
        if (action.resolution === 'remove') {
          // Safe junction deletion — never use fs.remove() on junctions
          await JunctionUtils.safeDeleteAsync(platformPath);
        } else if (action.resolution === 'promote-only') {
          // readsFromUniversal: copy to master, delete platform dir, NO junction
          await fs.copy(platformPath, masterPath);
          await JunctionUtils.safeDeleteAsync(platformPath);
        } else if (action.resolution === 'symlink' && !isUniversal) {
          await JunctionUtils.safeDeleteAsync(platformPath);
          await JunctionUtils.createJunction(masterPath, platformPath);
        } else if (action.resolution === 'promote-and-symlink' && !isUniversal) {
          await fs.copy(platformPath, masterPath);
          await JunctionUtils.safeDeleteAsync(platformPath);
          await JunctionUtils.createJunction(masterPath, platformPath);
        } else if (action.resolution === 'overwrite-with-master' && !isUniversal) {
          await JunctionUtils.safeDeleteAsync(platformPath);
          await JunctionUtils.createJunction(masterPath, platformPath);
        } else if (action.resolution === 'overwrite-with-platform' && !isUniversal) {
          await fs.remove(masterPath);
          await fs.copy(platformPath, masterPath);
          await JunctionUtils.safeDeleteAsync(platformPath);
          await JunctionUtils.createJunction(masterPath, platformPath);
        }
        // 'skip' and universal-symlink/promote-and-symlink do nothing
      } catch (err) {
        console.error(`Error executing resolution ${action.resolution} on ${platformPath}:`, err);
      }
    }
  }
}
