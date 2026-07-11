import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const RECYCLE_BIN_DIR = path.join(os.homedir(), '.skills_recycle');
const MAX_SIZE_MB = 500;

export interface RecycleEntry {
  name: string;          // backup directory name (skillName_timestamp)
  skillName: string;
  timestamp: string;
  path: string;          // full path in recycle bin
  size: number;          // bytes
  fileCount: number;
}

export class RecycleBinService {
  /**
   * Ensure recycle bin directory exists
   */
  static async ensureBin(): Promise<void> {
    await fs.ensureDir(RECYCLE_BIN_DIR);
  }

  /**
   * Backup a skill directory to recycle bin before deletion
   */
  static async backup(skillPath: string): Promise<RecycleEntry> {
    await this.ensureBin();
    const skillName = path.basename(skillPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${skillName}_${timestamp}`;
    const backupPath = path.join(RECYCLE_BIN_DIR, backupName);

    if (!await fs.pathExists(skillPath)) {
      throw new Error(`Skill path does not exist: ${skillPath}`);
    }

    await fs.copy(skillPath, backupPath);
    const stats = await this.computeSize(backupPath);

    return {
      name: backupName,
      skillName,
      timestamp,
      path: backupPath,
      size: stats.size,
      fileCount: stats.fileCount,
    };
  }

  /**
   * List all backups in recycle bin
   */
  static async list(): Promise<RecycleEntry[]> {
    await this.ensureBin();
    const entries = await fs.readdir(RECYCLE_BIN_DIR);
    const results: RecycleEntry[] = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(RECYCLE_BIN_DIR, entry);
      const stat = await fs.lstat(fullPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // Parse name format: skillName_ISO_timestamp
      const parts = entry.split('_');
      const skillName = parts[0];
      const stats = await this.computeSize(fullPath);

      results.push({
        name: entry,
        skillName,
        timestamp: stat.mtime.toISOString(),
        path: fullPath,
        size: stats.size,
        fileCount: stats.fileCount,
      });
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  }

  /**
   * Restore a backup to a target directory
   */
  static async restore(backupName: string, targetDir: string): Promise<{ success: boolean; restoredPath: string }> {
    const backupPath = path.join(RECYCLE_BIN_DIR, backupName);
    if (!await fs.pathExists(backupPath)) {
      throw new Error(`Backup not found: ${backupName}`);
    }

    await fs.ensureDir(targetDir);
    await fs.copy(backupPath, targetDir);

    return { success: true, restoredPath: targetDir };
  }

  /**
   * Restore multiple backups in one shot.
   * Each backup is restored into `baseDir/<skillName>` where skillName is the
   * portion of the backup name before the first underscore.
   */
  static async batchRestore(names: string[], baseDir: string): Promise<{
    restored: Array<{ name: string; restoredPath: string }>;
    failed: Array<{ name: string; error: string }>;
  }> {
    const restored: Array<{ name: string; restoredPath: string }> = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const name of names) {
      try {
        const skillName = name.split('_')[0];
        const targetDir = path.join(baseDir, skillName);
        const result = await this.restore(name, targetDir);
        restored.push({ name, restoredPath: result.restoredPath });
      } catch (err) {
        failed.push({ name, error: (err as Error).message });
      }
    }

    return { restored, failed };
  }

  /**
   * Permanently delete a specific backup
   */
  static async purge(backupName: string): Promise<boolean> {
    const backupPath = path.join(RECYCLE_BIN_DIR, backupName);
    if (!await fs.pathExists(backupPath)) return false;
    await fs.remove(backupPath);
    return true;
  }

  /**
   * Clear the entire recycle bin
   */
  static async purgeAll(): Promise<{ purged: number; freedBytes: number }> {
    await this.ensureBin();
    const entries = await fs.readdir(RECYCLE_BIN_DIR);
    let purged = 0;
    let freedBytes = 0;

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(RECYCLE_BIN_DIR, entry);
      const stats = await this.computeSize(fullPath);
      freedBytes += stats.size;
      await fs.remove(fullPath);
      purged++;
    }

    return { purged, freedBytes };
  }

  /**
   * Get recycle bin statistics
   */
  static async getStats(): Promise<{ totalBackups: number; totalSize: number; oldestBackup: string | null }> {
    const entries = await this.list();
    let totalSize = 0;
    let oldestTime: number | null = null;

    for (const entry of entries) {
      totalSize += entry.size;
      const ts = new Date(entry.timestamp).getTime();
      if (oldestTime === null || ts < oldestTime) {
        oldestTime = ts;
      }
    }

    return {
      totalBackups: entries.length,
      totalSize,
      oldestBackup: oldestTime ? new Date(oldestTime).toISOString() : null,
    };
  }

  /**
   * Auto-clean backups older than 30 days or when exceeding size limit
   */
  static async autoClean(): Promise<{ purged: number; freedBytes: number }> {
    const entries = await this.list();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    let totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    let purged = 0;
    let freedBytes = 0;

    for (const entry of entries) {
      const age = now - new Date(entry.timestamp).getTime();
      const shouldPurge = age > thirtyDays || totalSize > MAX_SIZE_MB * 1024 * 1024;

      if (shouldPurge) {
        await fs.remove(entry.path);
        totalSize -= entry.size;
        freedBytes += entry.size;
        purged++;
      }
    }

    return { purged, freedBytes };
  }

  /**
   * Compute directory size and file count
   */
  private static async computeSize(dirPath: string): Promise<{ size: number; fileCount: number }> {
    let size = 0;
    let fileCount = 0;
    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = await fs.lstat(fullPath);
        if (stat.isDirectory()) {
          const sub = await this.computeSize(fullPath);
          size += sub.size;
          fileCount += sub.fileCount;
        } else {
          size += stat.size;
          fileCount++;
        }
      }
    } catch {
      // ignore
    }
    return { size, fileCount };
  }
}
