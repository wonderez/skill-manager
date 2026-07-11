import fs from 'fs-extra';
import path from 'path';
import { ConfigService } from './config';
import { ImportService } from './import';
import { VersionService } from './version';
import { RecycleBinService } from './recycle-bin';
import { SyncService } from './sync';
import { RegistryService } from './registry';
import { getAllAdapters } from './adapters';
import { CommandService } from './command';
import { JunctionUtils } from './junction-utils';

export interface InstallOptions {
  source: 'github' | 'local';
  url?: string;          // GitHub URL (when source = 'github')
  localPath?: string;    // Local path (when source = 'local')
  name?: string;         // Override skill name
}

export interface InstallResult {
  success: boolean;
  name: string;
  path: string;
  linkedPlatforms: string[];
  error?: string;
}

export interface UninstallResult {
  success: boolean;
  skillName: string;
  recycledPath: string;
  removedJunctions: string[];
  error?: string;
}

export interface UpdateResult {
  success: boolean;
  skillName: string;
  before: string;
  after: string;
  changes: string[];
  error?: string;
}

export interface SkillVersionInfo {
  skillName: string;
  currentVersion: string | null;
  snapshots: Array<{ name: string; timestamp: string }>;
  source: string | null;
}

export class InstallService {
  /**
   * Install a skill from GitHub URL or local path
   */
  static async install(options: InstallOptions): Promise<InstallResult> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;

    let skillName: string;
    let skillPath: string;

    if (options.source === 'github' && options.url) {
      // Validate Git URL format (prevent command injection)
      if (!/^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/i.test(options.url)) {
        return { success: false, name: '', path: '', linkedPlatforms: [], error: 'Invalid GitHub URL format' };
      }

      // Use ImportService for GitHub import
      const result = await ImportService.importFromGithub(options.url, masterDir);
      if (!result.success) {
        return { success: false, name: result.name, path: '', linkedPlatforms: [], error: 'Git clone failed' };
      }
      skillName = result.name;
      skillPath = path.join(masterDir, skillName);
    } else if (options.source === 'local' && options.localPath) {
      // Validate local path exists
      if (!await fs.pathExists(options.localPath)) {
        return { success: false, name: '', path: '', linkedPlatforms: [], error: 'Local path does not exist' };
      }

      skillName = options.name || path.basename(options.localPath);
      skillPath = path.join(masterDir, skillName);

      // Check conflict
      if (await fs.pathExists(skillPath)) {
        return { success: false, name: skillName, path: '', linkedPlatforms: [], error: `Skill "${skillName}" already exists in master repo` };
      }

      // Copy to master repo
      await fs.copy(options.localPath, skillPath);
    } else {
      return { success: false, name: '', path: '', linkedPlatforms: [], error: 'Invalid install options' };
    }

    // Create snapshot
    try {
      await VersionService.createSnapshot(skillPath);
    } catch {
      // snapshot failure is not critical
    }

    // Sync to all platforms
    const plans = await SyncService.scanAllPlatforms();
    await SyncService.executeAllPlans(plans);

    // Update registry
    try {
      await RegistryService.buildRegistry(masterDir);
    } catch {
      // registry build failure is not critical
    }

    // Compute linked platforms
    const linkedPlatforms: string[] = [];
    for (const adapter of getAllAdapters()) {
      if (await adapter.isInstalled() && await adapter.isSkillInstalled(skillName)) {
        linkedPlatforms.push(adapter.id);
      }
    }

    return {
      success: true,
      name: skillName,
      path: skillPath,
      linkedPlatforms,
    };
  }

  /**
   * Uninstall a skill: backup to recycle bin → remove junctions → delete from master
   */
  static async uninstall(skillName: string): Promise<UninstallResult> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;
    const skillPath = path.join(masterDir, skillName);

    if (!await fs.pathExists(skillPath)) {
      return { success: false, skillName, recycledPath: '', removedJunctions: [], error: 'Skill not found in master repo' };
    }

    // 1. Backup to recycle bin
    let recycledPath: string;
    try {
      const backup = await RecycleBinService.backup(skillPath);
      recycledPath = backup.path;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, skillName, recycledPath: '', removedJunctions: [], error: `Backup failed: ${message}` };
    }

    // 2. Remove junctions from all platforms
    const removedJunctions: string[] = [];
    for (const adapter of getAllAdapters()) {
      if (!await adapter.isInstalled()) continue;
      const platformSkillPath = path.join(adapter.getSkillsDir(), skillName);
      if (JunctionUtils.exists(platformSkillPath)) {
        try {
          // Safe junction deletion — never follows link or deletes target content
          await JunctionUtils.safeDeleteAsync(platformSkillPath);
          removedJunctions.push(adapter.id);
        } catch {
          // continue even if one fails
        }
      }
    }

    // 3. Delete from master repo
    try {
      await fs.remove(skillPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, skillName, recycledPath, removedJunctions, error: `Failed to delete: ${message}` };
    }

    // 4. Update registry
    try {
      await RegistryService.buildRegistry(masterDir);
    } catch {
      // not critical
    }

    return {
      success: true,
      skillName,
      recycledPath,
      removedJunctions,
    };
  }

  /**
   * Update a skill from its source
   */
  static async update(skillName: string, source?: string): Promise<UpdateResult> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;
    const skillPath = path.join(masterDir, skillName);

    if (!await fs.pathExists(skillPath)) {
      return { success: false, skillName, before: '', after: '', changes: [], error: 'Skill not found' };
    }

    // Read current content
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const before = await fs.readFile(skillMdPath, 'utf-8').catch(() => '');

    // Determine source
    let gitUrl = source;
    if (!gitUrl) {
      // Try to read from frontmatter
      try {
        const matter = (await import('gray-matter')).default;
        const parsed = matter(before);
        gitUrl = parsed.data?.source;
      } catch { /* ignore */ }
    }

    if (!gitUrl) {
      return { success: false, skillName, before, after: before, changes: [], error: 'No source URL available. Provide a source parameter or set source in frontmatter.' };
    }

    // Create snapshot before update
    try {
      await VersionService.createSnapshot(skillPath);
    } catch { /* ignore */ }

    // Clone to temp directory
    const tempDir = path.join(masterDir, `_tmp_${skillName}_${Date.now()}`);
    try {
      CommandService.git(['clone', gitUrl, tempDir], undefined, { stdio: 'ignore' });

      // Check if it has the skill
      const tempSkillPath = path.join(tempDir, skillName);
      let sourcePath = tempDir;
      if (await fs.pathExists(tempSkillPath)) {
        sourcePath = tempSkillPath;
      }

      // Read new content
      const newSkillMdPath = path.join(sourcePath, 'SKILL.md');
      const after = await fs.readFile(newSkillMdPath, 'utf-8').catch(() => '');

      // Compute changes
      const changes: string[] = [];
      if (before !== after) {
        changes.push('SKILL.md content updated');
      }

      // Copy new content over
      await fs.copy(sourcePath, skillPath, { overwrite: true });

      // Clean up temp
      await fs.remove(tempDir);

      // Re-sync to platforms
      const plans = await SyncService.scanAllPlatforms();
      await SyncService.executeAllPlans(plans);

      // Update registry
      try {
        await RegistryService.buildRegistry(masterDir);
      } catch { /* ignore */ }

      return {
        success: true,
        skillName,
        before,
        after,
        changes,
      };
    } catch (err) {
      // Clean up temp on failure
      await fs.remove(tempDir).catch(() => {});
      return { success: false, skillName, before, after: before, changes: [], error: `Update failed: ${(err as Error).message}` };
    }
  }

  /**
   * Get version info for a skill
   */
  static async getVersions(skillName: string): Promise<SkillVersionInfo> {
    const config = await ConfigService.getConfig();
    const masterDir = config.masterSkillsDir;
    const skillPath = path.join(masterDir, skillName);

    let version: string | null = null;
    let source: string | null = null;

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (await fs.pathExists(skillMdPath)) {
      try {
        const matter = (await import('gray-matter')).default;
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const parsed = matter(content);
        version = parsed.data?.version || null;
        source = parsed.data?.source || null;
      } catch { /* ignore */ }
    }

    const snapshots = await VersionService.listSnapshots(skillPath);

    return {
      skillName,
      currentVersion: version,
      snapshots: snapshots.map(s => ({ name: s, timestamp: s })),
      source,
    };
  }
}
