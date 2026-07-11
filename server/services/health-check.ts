import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { getAllAdapters } from './adapters';
import { JunctionUtils } from './junction-utils';

export interface DuplicateLocation {
  platform: string;
  path: string;
  fileCount: number;
  size: number;
  skillMdHash: string | null;
}

export interface DuplicateEntry {
  skillName: string;
  locations: DuplicateLocation[];
  areIdentical: boolean;
  differences: string[];
}

export interface HealthReport {
  masterDir: string;
  totalDirectories: number;
  validSkills: number;
  missingSkillMd: string[];
  brokenJunctions: Array<{ platform: string; skillName: string; fullPath: string }>;
  redundantJunctions: Array<{ platform: string; skillName: string; fullPath: string }>;
  ignoredDirectories: string[];
  orphanedInPlatforms: Array<{ platform: string; skills: string[] }>;
  duplicates: DuplicateEntry[];
  timestamp: string;
}

export interface IgnoreEntry {
  name: string;
  reason?: string;
}

const IGNORE_FILE = '.skillignore';

export class HealthCheckService {
  /** In-memory cache for checkHealth results (TTL 30s) to avoid redundant scans. */
  private static cache: { ts: number; report: HealthReport } | null = null;
  private static readonly CACHE_TTL = 30000; // 30s

  /**
   * Read .skillignore file from master repo root
   */
  static async readIgnoreFile(masterDir: string): Promise<string[]> {
    const ignorePath = path.join(masterDir, IGNORE_FILE);
    if (!await fs.pathExists(ignorePath)) return [];
    const content = await fs.readFile(ignorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  }

  /**
   * Write .skillignore file
   */
  static async writeIgnoreFile(masterDir: string, entries: string[]): Promise<void> {
    const ignorePath = path.join(masterDir, IGNORE_FILE);
    const content = `# Skills Optimization Plan - .skillignore\n# 每行一个目录名，# 开头为注释\n# 这些目录不会被扫描、同步或展示\n\n${entries.join('\n')}\n`;
    await fs.writeFile(ignorePath, content, 'utf-8');
  }

  /**
   * Check if a directory name is in the ignore list
   */
  static isIgnored(dirName: string, ignoreList: string[]): boolean {
    return ignoreList.includes(dirName);
  }

  /**
   * Count files and compute total size in a single recursive traversal.
   */
  private static async getDirStats(dirPath: string): Promise<{ fileCount: number; size: number }> {
    let fileCount = 0;
    let size = 0;
    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = await fs.stat(fullPath).catch(() => null);
        if (!stat) continue;
        if (stat.isDirectory()) {
          const sub = await this.getDirStats(fullPath);
          fileCount += sub.fileCount;
          size += sub.size;
        } else {
          fileCount++;
          size += stat.size;
        }
      }
    } catch { /* ignore */ }
    return { fileCount, size };
  }

  /**
   * Compute SHA-256 hash of SKILL.md
   */
  private static async computeHash(skillPath: string): Promise<string | null> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) return null;
    const content = await fs.readFile(skillMdPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Full health check of master repo + all platforms.
   * Results are cached for CACHE_TTL (30s) unless `forceRefresh` is true.
   */
  static async checkHealth(masterDir: string, forceRefresh = false): Promise<HealthReport> {
    // Return cached report if still fresh
    if (!forceRefresh && this.cache && Date.now() - this.cache.ts < this.CACHE_TTL) {
      return this.cache.report;
    }

    const ignoreList = await this.readIgnoreFile(masterDir);
    const missingSkillMd: string[] = [];
    const brokenJunctions: HealthReport['brokenJunctions'] = [];
    const redundantJunctions: HealthReport['redundantJunctions'] = [];
    let validSkills = 0;
    let totalDirectories = 0;

    // Scan master repo
    if (await fs.pathExists(masterDir)) {
      const entries = await fs.readdir(masterDir);
      const masterScanResults = await Promise.all(entries.filter(entry => {
        if (entry.startsWith('.') || entry.startsWith('_tmp_')) return false;
        if (this.isIgnored(entry, ignoreList)) return false;
        return true;
      }).map(async (entry): Promise<{ entry: string; hasSkillMd: boolean } | null> => {
        const fullPath = path.join(masterDir, entry);
        const stat = await fs.lstat(fullPath).catch(() => null);
        if (!stat || !stat.isDirectory()) return null;
        const hasSkillMd = await fs.pathExists(path.join(fullPath, 'SKILL.md'));
        return { entry, hasSkillMd };
      }));
      for (const result of masterScanResults) {
        if (!result) continue;
        totalDirectories++;
        if (result.hasSkillMd) {
          validSkills++;
        } else {
          missingSkillMd.push(result.entry);
        }
      }
    }

    // Scan all platforms for broken/redundant junctions + collect real-dir skills for duplicate detection
    const adapters = getAllAdapters();
    const orphanedInPlatforms: HealthReport['orphanedInPlatforms'] = [];
    // Map: skillName -> list of {platform, path, fileCount, size, hash} (only real dirs, not junctions)
    const skillLocations = new Map<string, DuplicateLocation[]>();

    for (const adapter of adapters) {
      const platformDir = adapter.getSkillsDir();
      if (!await fs.pathExists(platformDir)) continue;

      const platformEntries = await fs.readdir(platformDir);
      const broken: string[] = [];
      const orphans: string[] = [];

      // Concurrently scan each entry in the platform directory
      const platformScanResults = await Promise.all(platformEntries.filter(entry => {
        if (entry.startsWith('.') || entry.startsWith('_tmp_')) return false;
        return true;
      }).map(async (entry): Promise<{
        entry: string;
        fullPath: string;
        kind: 'broken-junction' | 'redundant-junction' | 'real-skill';
        isOrphan?: boolean;
        loc?: DuplicateLocation;
      } | null> => {
        const fullPath = path.join(platformDir, entry);
        const stat = await fs.lstat(fullPath).catch(() => null);
        if (!stat) return null;

        const isJunction = JunctionUtils.isJunction(fullPath);

        if (isJunction) {
          const isBroken = JunctionUtils.isBrokenJunction(fullPath);
          if (isBroken) {
            return { entry, fullPath, kind: 'broken-junction' };
          } else if (adapter.readsFromUniversal) {
            return { entry, fullPath, kind: 'redundant-junction' };
          }
          return null; // valid junction, nothing to report
        } else if (stat.isDirectory()) {
          // Real directory — check for SKILL.md
          const hasSkillMd = await fs.pathExists(path.join(fullPath, 'SKILL.md'));
          if (!hasSkillMd) return null; // Skip non-skill dirs

          // Check if it's orphaned (not in master, not ignored)
          const inMaster = await fs.pathExists(path.join(masterDir, entry));
          const isOrphan = !inMaster && !this.isIgnored(entry, ignoreList);

          // Collect for duplicate detection (skip universal platforms — their skills ARE the master skills)
          if (!adapter.readsFromUniversal) {
            const { fileCount, size } = await this.getDirStats(fullPath);
            const hash = await this.computeHash(fullPath);
            const loc: DuplicateLocation = { platform: adapter.id, path: fullPath, fileCount, size, skillMdHash: hash };
            return { entry, fullPath, kind: 'real-skill', isOrphan, loc };
          }
          return { entry, fullPath, kind: 'real-skill', isOrphan };
        }
        return null;
      }));

      // Process results sequentially to accumulate per-platform and global state
      for (const result of platformScanResults) {
        if (!result) continue;
        switch (result.kind) {
          case 'broken-junction':
            broken.push(result.entry);
            brokenJunctions.push({ platform: adapter.id, skillName: result.entry, fullPath: result.fullPath });
            break;
          case 'redundant-junction':
            redundantJunctions.push({ platform: adapter.id, skillName: result.entry, fullPath: result.fullPath });
            break;
          case 'real-skill':
            if (result.isOrphan) orphans.push(result.entry);
            if (result.loc) {
              const existing = skillLocations.get(result.entry);
              if (existing) {
                existing.push(result.loc);
              } else {
                skillLocations.set(result.entry, [result.loc]);
              }
            }
            break;
        }
      }

      if (broken.length > 0 || orphans.length > 0) {
        orphanedInPlatforms.push({ platform: adapter.id, skills: [...broken, ...orphans] });
      }
    }

    // Also check master dir for duplicate detection
    if (await fs.pathExists(masterDir)) {
      const entries = await fs.readdir(masterDir);
      // Concurrently gather stats + hash for each real skill directory in master
      const masterDupResults = await Promise.all(entries.filter(entry => {
        if (entry.startsWith('.') || entry.startsWith('_tmp_')) return false;
        if (this.isIgnored(entry, ignoreList)) return false;
        return true;
      }).map(async (entry): Promise<{ entry: string; loc: DuplicateLocation } | null> => {
        const fullPath = path.join(masterDir, entry);
        const stat = await fs.lstat(fullPath).catch(() => null);
        if (!stat || !stat.isDirectory()) return null;
        if (!await fs.pathExists(path.join(fullPath, 'SKILL.md'))) return null;

        const { fileCount, size } = await this.getDirStats(fullPath);
        const hash = await this.computeHash(fullPath);
        const loc: DuplicateLocation = { platform: 'master', path: fullPath, fileCount, size, skillMdHash: hash };
        return { entry, loc };
      }));
      // Merge into skillLocations sequentially
      for (const result of masterDupResults) {
        if (!result) continue;
        const existing = skillLocations.get(result.entry);
        if (existing) {
          existing.push(result.loc);
        } else {
          skillLocations.set(result.entry, [result.loc]);
        }
      }
    }

    // Build duplicates list: skills with > 1 real directory location
    const duplicates: DuplicateEntry[] = [];
    for (const [skillName, locations] of skillLocations) {
      if (locations.length < 2) continue;
      const hashes = locations.map(l => l.skillMdHash).filter(Boolean);
      const allSameHash = hashes.length === locations.length && new Set(hashes).size === 1;
      const differences: string[] = [];

      if (!allSameHash) {
        differences.push('SKILL.md content differs');
      }
      const sizes = locations.map(l => l.size);
      const maxDiff = Math.max(...sizes) - Math.min(...sizes);
      if (maxDiff > 100) {
        differences.push(`Size variance: ${Math.round(maxDiff / 1024)}KB`);
      }
      const counts = locations.map(l => l.fileCount);
      const maxCountDiff = Math.max(...counts) - Math.min(...counts);
      if (maxCountDiff > 2) {
        differences.push(`File count variance: ${maxCountDiff} files`);
      }

      duplicates.push({ skillName, locations, areIdentical: allSameHash && maxDiff <= 100 && maxCountDiff <= 2, differences });
    }

    const report: HealthReport = {
      masterDir,
      totalDirectories,
      validSkills,
      missingSkillMd,
      brokenJunctions,
      redundantJunctions,
      ignoredDirectories: ignoreList,
      orphanedInPlatforms,
      duplicates,
      timestamp: new Date().toISOString(),
    };

    // Cache the freshly computed report
    this.cache = { ts: Date.now(), report };
    return report;
  }

  /**
   * Fix broken junctions by safely removing them
   */
  static async fixBrokenJunctions(report: HealthReport): Promise<{ fixed: number; failed: number }> {
    let fixed = 0;
    let failed = 0;
    for (const item of report.brokenJunctions) {
      try {
        await JunctionUtils.safeDeleteAsync(item.fullPath);
        if (!JunctionUtils.exists(item.fullPath)) {
          fixed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    // Also clean up redundant junctions on universal-reading platforms
    for (const item of report.redundantJunctions) {
      try {
        await JunctionUtils.safeDeleteAsync(item.fullPath);
        if (!JunctionUtils.exists(item.fullPath)) {
          fixed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    // Invalidate the health-check cache so the next checkHealth reflects the repairs
    this.cache = null;
    return { fixed, failed };
  }

}

