import fs from 'fs-extra';
import path from 'path';
import { ConfigService } from './config';
import { getAllAdapters } from './adapters';
import type { PlatformAdapter } from './adapters';
import { CommandService } from './command';
import { LinkerService } from './linker';
import type { LinkPlan } from './linker';
import { HealthCheckService } from './health-check';
import { ToolRegistryService } from './tool-registry';
import { JunctionUtils } from './junction-utils';

/**
 * v3.0 Master-Centric Sync Engine
 * Enhanced with incremental sync and dynamic adapter injection
 */

export interface IncrementalSyncReport {
  scannedSkills: number;
  changedSkills: string[];
  newSkills: string[];
  removedSkills: string[];
  platformsUpdated: string[];
  totalJunctionsCreated: number;
  totalJunctionsRemoved: number;
  duration: number;
}

export class SyncService {
  /**
   * Get all adapters including dynamically injected ones from ToolRegistry
   */
  static async getAllAdaptersDynamic(): Promise<PlatformAdapter[]> {
    const staticAdapters = getAllAdapters();
    const existingIds = new Set<string>();
    const existingDirs = new Set<string>();

    for (const adapter of staticAdapters) {
      existingIds.add(adapter.id);
      existingDirs.add(adapter.getSkillsDir().replace(/\\/g, '/').toLowerCase());
    }

    try {
      const dynamicAdapters = await ToolRegistryService.injectAdapters(new Set([...existingIds, ...existingDirs]));
      return [...staticAdapters, ...dynamicAdapters as unknown as typeof staticAdapters];
    } catch {
      // If tool registry fetch fails, fall back to static adapters only
      return staticAdapters;
    }
  }

  /**
   * Scan all platforms and generate link plans
   */
  static async scanAllPlatforms(): Promise<LinkPlan[]> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;
    const adapters = await this.getAllAdaptersDynamic();
    const plans: LinkPlan[] = [];

    for (const adapter of adapters) {
      if (await adapter.isInstalled()) {
        const plan = await LinkerService.generateLinkPlan(adapter.getSkillsDir(), masterDir, adapter.id, adapter.readsFromUniversal);
        plans.push(plan);
      }
    }
    return plans;
  }

  /**
   * Execute link plans for all platforms
   */
  static async executeAllPlans(plans: LinkPlan[]): Promise<void> {
    for (const plan of plans) {
      await LinkerService.executeLinkPlan(plan);
    }
  }

  /**
   * Incremental sync: only process skills changed since last sync
   */
  static async incrementalSync(): Promise<IncrementalSyncReport> {
    const startTime = Date.now();
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;
    const lastSyncTime = config.lastSyncTime ?? 0;

    const ignoreList = await HealthCheckService.readIgnoreFile(masterDir);
    const changedSkills: string[] = [];
    const newSkills: string[] = [];
    const removedSkills: string[] = [];

    // Scan master for changes
    const currentSkills = new Set<string>();
    if (await fs.pathExists(masterDir)) {
      const entries = await fs.readdir(masterDir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
        if (HealthCheckService.isIgnored(entry, ignoreList)) continue;

        const fullPath = path.join(masterDir, entry);
        const stat = await fs.lstat(fullPath).catch(() => null);
        if (!stat || !stat.isDirectory()) continue;

        currentSkills.add(entry);

        if (stat.mtime.getTime() > lastSyncTime) {
          if (lastSyncTime === 0) {
            // First sync, treat all as "changed"
            changedSkills.push(entry);
          } else {
            // Check if it existed before (by checking if any platform has it)
            const adapters = await this.getAllAdaptersDynamic();
            let existedBefore = false;
            for (const adapter of adapters) {
              if (await adapter.isInstalled()) {
                const platformPath = path.join(adapter.getSkillsDir(), entry);
                const platformStat = await fs.lstat(platformPath).catch(() => null);
                if (platformStat) {
                  existedBefore = true;
                  break;
                }
              }
            }
            if (existedBefore) {
              changedSkills.push(entry);
            } else {
              newSkills.push(entry);
            }
          }
        }
      }
    }

    // Detect removed skills by checking previous sync state
    if (lastSyncTime > 0) {
      const adapters = await this.getAllAdaptersDynamic();
      for (const adapter of adapters) {
        if (!await adapter.isInstalled()) continue;
        // Skip universal-reading platforms — they don't have junctions to clean
        if (adapter.readsFromUniversal) continue;
        const platformDir = adapter.getSkillsDir();
        if (!await fs.pathExists(platformDir)) continue;

        const platformEntries = await fs.readdir(platformDir);
        for (const entry of platformEntries) {
          if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
          if (HealthCheckService.isIgnored(entry, ignoreList)) continue;

          // If platform has a junction but master doesn't have the skill
          if (JunctionUtils.isJunction(path.join(platformDir, entry)) && !currentSkills.has(entry)) {
            if (!removedSkills.includes(entry)) {
              removedSkills.push(entry);
            }
          }
        }
      }
    }

    // Execute sync for changed/new skills
    const platformsUpdated: string[] = [];
    let totalJunctionsCreated = 0;
    let totalJunctionsRemoved = 0;

    const allChanged = [...changedSkills, ...newSkills];

    if (allChanged.length > 0 || removedSkills.length > 0) {
      const adapters = await this.getAllAdaptersDynamic();
      for (const adapter of adapters) {
        if (!await adapter.isInstalled()) continue;
        // Skip universal-reading platforms — no junctions needed
        if (adapter.readsFromUniversal) continue;
        const platformDir = adapter.getSkillsDir();
        if (!await fs.pathExists(platformDir)) continue;

        let platformChanged = false;

        // Create/update junctions for changed & new skills
        for (const skillName of allChanged) {
          const masterPath = path.join(masterDir, skillName);
          const platformPath = path.join(platformDir, skillName);

          if (!await fs.pathExists(masterPath)) continue;

          const platformStat = await fs.lstat(platformPath).catch(() => null);
          if (!platformStat || !JunctionUtils.isJunction(platformPath)) {
            // Need to create junction
            try {
              if (platformStat) await JunctionUtils.safeDeleteAsync(platformPath);
              await JunctionUtils.createJunction(masterPath, platformPath);
              totalJunctionsCreated++;
              platformChanged = true;
            } catch {
              // skip on error
            }
          }
        }

        // Remove junctions for removed skills
        for (const skillName of removedSkills) {
          const platformPath = path.join(platformDir, skillName);
          if (JunctionUtils.exists(platformPath)) {
            try {
              await JunctionUtils.safeDeleteAsync(platformPath);
              totalJunctionsRemoved++;
              platformChanged = true;
            } catch {
              // skip on error
            }
          }
        }

        if (platformChanged) platformsUpdated.push(adapter.id);
      }
    }

    // Update lastSyncTime
    config.lastSyncTime = Date.now();
    await ConfigService.saveConfig(config);

    return {
      scannedSkills: currentSkills.size,
      changedSkills,
      newSkills,
      removedSkills,
      platformsUpdated,
      totalJunctionsCreated,
      totalJunctionsRemoved,
      duration: Date.now() - startTime,
    };
  }

  // ==================== Git 远程同步 (Simplified) ====================

  static async gitPush(): Promise<{ success: boolean; message: string }> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;

    if (!await fs.pathExists(path.join(masterDir, '.git'))) {
      return { success: false, message: 'No Git repository initialized in master repo.' };
    }

    try {
      CommandService.git(['add', '-A'], masterDir, { stdio: 'ignore' });
      try {
        CommandService.git(['commit', '-m', 'skill-manager: manual sync push'], masterDir, { stdio: 'ignore' });
      } catch {
        // nothing to commit
      }
      CommandService.git(['push'], masterDir, { stdio: 'ignore' });
      return { success: true, message: 'Pushed master repo to remote successfully.' };
    } catch (err) {
      return { success: false, message: `git push failed: ${(err as Error).message}` };
    }
  }

  static async gitPull(): Promise<{ success: boolean; message: string }> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;

    if (!await fs.pathExists(path.join(masterDir, '.git'))) {
      return { success: false, message: 'No Git repository initialized in master repo.' };
    }

    try {
      CommandService.git(['pull'], masterDir, { stdio: 'ignore' });
      return { success: true, message: 'Pulled master repo from remote successfully.' };
    } catch (err) {
      return { success: false, message: `git pull failed: ${(err as Error).message}` };
    }
  }
}
