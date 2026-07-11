import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { LintService } from './lint';
import type { TraceReport } from './lint';
import { CategoryService } from './category';
import type { CategoryId } from './category';
import { HealthCheckService } from './health-check';
import { getAllAdapters } from './adapters';

export interface RegistryEntry {
  name: string;
  path: string;
  category: CategoryId;
  categoryConfidence: number;
  tags: string[];
  version: string | null;
  source: string | null;
  platforms: string[];
  qualityScore: number;
  qualityGrade: string;
  traceScore: TraceReport | null;
  linkedCount: number;
  modifiedTime: string;
  size: number;
}

export interface RegistryStats {
  totalSkills: number;
  categoryDistribution: Record<string, number>;
  qualityDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  averageTraceScore: number;
  lastBuiltAt: string | null;
}

export interface RegistryFile {
  entries: RegistryEntry[];
  stats: RegistryStats;
  builtAt: string;
  masterDir: string;
}

const REGISTRY_FILE = '.registry.json';

export class RegistryService {
  /**
   * Build the complete registry by scanning master repo
   */
  static async buildRegistry(masterDir: string): Promise<RegistryFile> {
    const ignoreList = await HealthCheckService.readIgnoreFile(masterDir);
    const entries: RegistryEntry[] = [];

    if (!await fs.pathExists(masterDir)) {
      return { entries: [], stats: this.emptyStats(), builtAt: new Date().toISOString(), masterDir };
    }

    const dirEntries = await fs.readdir(masterDir);

    // Get all installed platforms for linkedCount computation
    const installedAdapters = [];
    for (const adapter of getAllAdapters()) {
      if (await adapter.isInstalled()) {
        installedAdapters.push(adapter);
      }
    }

    for (const entry of dirEntries) {
      if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
      if (HealthCheckService.isIgnored(entry, ignoreList)) continue;

      const skillPath = path.join(masterDir, entry);
      const stat = await fs.lstat(skillPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // Run Lint + TRACE
      const healthReport = await LintService.analyzeSkill(skillPath);

      // Run Category classification
      const classResult = await CategoryService.classify(entry, skillPath);

      // Compute linkedCount
      let linkedCount = 0;
      for (const adapter of installedAdapters) {
        if (await adapter.isSkillInstalled(entry)) {
          linkedCount++;
        }
      }

      // Parse frontmatter
      let version: string | null = null;
      let source: string | null = null;
      let platforms: string[] = [];
      let tags: string[] = [];
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      if (await fs.pathExists(skillMdPath)) {
        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const { data } = matter(content);
          version = data.version || null;
          source = data.source || null;
          platforms = Array.isArray(data.platforms) ? data.platforms : [];
          tags = Array.isArray(data.tags) ? data.tags : [];
        } catch { /* ignore */ }
      }

      // Compute size
      const size = await this.computeDirSize(skillPath);

      entries.push({
        name: entry,
        path: skillPath,
        category: classResult.category,
        categoryConfidence: classResult.confidence,
        tags,
        version,
        source,
        platforms,
        qualityScore: healthReport.score,
        qualityGrade: healthReport.grade,
        traceScore: healthReport.trace || null,
        linkedCount,
        modifiedTime: stat.mtime.toISOString(),
        size,
      });
    }

    // Load existing tags from previous registry (preserve user-added tags)
    const existingRegistry = await this.getRegistry(masterDir);
    if (existingRegistry && Array.isArray(existingRegistry.entries)) {
      for (const entry of entries) {
        const oldEntry = existingRegistry.entries.find(e => e.name === entry.name);
        if (oldEntry && oldEntry.tags.length > 0) {
          // Merge: preserve user tags not in frontmatter
          const frontmatterTags = new Set(entry.tags);
          for (const tag of oldEntry.tags) {
            if (!frontmatterTags.has(tag)) entry.tags.push(tag);
          }
        }
      }
    }

    const stats = this.computeStats(entries);
    const registry: RegistryFile = {
      entries,
      stats,
      builtAt: new Date().toISOString(),
      masterDir,
    };

    // Save to file
    const registryPath = path.join(masterDir, REGISTRY_FILE);
    await fs.writeJson(registryPath, registry, { spaces: 2 });

    return registry;
  }

  /**
   * Get cached registry from file
   */
  static async getRegistry(masterDir?: string): Promise<RegistryFile | null> {
    const dir = masterDir || path.join(os.homedir(), '.agents', 'skills');
    const registryPath = path.join(dir, REGISTRY_FILE);
    if (!await fs.pathExists(registryPath)) return null;
    try {
      const data = await fs.readJson(registryPath);
      // Validate structure: must have entries array (reject incompatible formats from other tools)
      if (!data || !Array.isArray(data.entries)) return null;
      return data as RegistryFile;
    } catch {
      return null;
    }
  }

  /**
   * Update a single entry (e.g., add/remove tag)
   */
  static async updateEntry(masterDir: string, skillName: string, patch: Partial<RegistryEntry>): Promise<boolean> {
    const registry = await this.getRegistry(masterDir);
    if (!registry) return false;

    const idx = registry.entries.findIndex(e => e.name === skillName);
    if (idx === -1) return false;

    registry.entries[idx] = { ...registry.entries[idx], ...patch };
    registry.stats = this.computeStats(registry.entries);
    registry.builtAt = new Date().toISOString();

    const registryPath = path.join(masterDir, REGISTRY_FILE);
    await fs.writeJson(registryPath, registry, { spaces: 2 });
    return true;
  }

  /**
   * Add a tag to a skill
   */
  static async addTag(masterDir: string, skillName: string, tag: string): Promise<boolean> {
    const registry = await this.getRegistry(masterDir);
    if (!registry) return false;

    const entry = registry.entries.find(e => e.name === skillName);
    if (!entry) return false;

    if (!entry.tags.includes(tag)) {
      entry.tags.push(tag);
      return this.updateEntry(masterDir, skillName, { tags: entry.tags });
    }
    return true;
  }

  /**
   * Remove a tag from a skill
   */
  static async removeTag(masterDir: string, skillName: string, tag: string): Promise<boolean> {
    const registry = await this.getRegistry(masterDir);
    if (!registry) return false;

    const entry = registry.entries.find(e => e.name === skillName);
    if (!entry) return false;

    entry.tags = entry.tags.filter(t => t !== tag);
    return this.updateEntry(masterDir, skillName, { tags: entry.tags });
  }

  /**
   * Get statistics from cached registry
   */
  static async getStats(masterDir?: string): Promise<RegistryStats | null> {
    const registry = await this.getRegistry(masterDir);
    return registry?.stats || null;
  }

  /**
   * Compute statistics from entries
   */
  private static computeStats(entries: RegistryEntry[]): RegistryStats {
    const categoryDistribution: Record<string, number> = {};
    const qualityDistribution: Record<string, number> = {};
    const sourceDistribution: Record<string, number> = {};
    let traceSum = 0;
    let traceCount = 0;

    for (const entry of entries) {
      categoryDistribution[entry.category] = (categoryDistribution[entry.category] || 0) + 1;
      qualityDistribution[entry.qualityGrade] = (qualityDistribution[entry.qualityGrade] || 0) + 1;
      const source = entry.source ? 'git' : 'local';
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
      if (entry.traceScore) {
        traceSum += entry.traceScore.overallScore;
        traceCount++;
      }
    }

    return {
      totalSkills: entries.length,
      categoryDistribution,
      qualityDistribution,
      sourceDistribution,
      averageTraceScore: traceCount > 0 ? Math.round((traceSum / traceCount) * 10) / 10 : 0,
      lastBuiltAt: new Date().toISOString(),
    };
  }

  private static emptyStats(): RegistryStats {
    return {
      totalSkills: 0,
      categoryDistribution: {},
      qualityDistribution: {},
      sourceDistribution: {},
      averageTraceScore: 0,
      lastBuiltAt: null,
    };
  }

  private static async computeDirSize(dirPath: string): Promise<number> {
    let size = 0;
    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        if (entry === '.snapshots' || entry === '.git') continue;
        const fullPath = path.join(dirPath, entry);
        const stat = await fs.lstat(fullPath);
        if (stat.isDirectory()) {
          size += await this.computeDirSize(fullPath);
        } else {
          size += stat.size;
        }
      }
    } catch {
      // ignore
    }
    return size;
  }
}
