import express from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

import { LintService, type SkillHealthReport } from './services/lint';
import { ConfigService, type ManagedPathInfo } from './services/config';
import { PathDiscoveryService } from './services/path';
import { VersionService } from './services/version';
import { OptimizeService } from './services/optimize';
import {
  getAllAdapters, getAdapter, getInstalledPlatforms,
  KNOWN_PACKAGES, type SkillSource
} from './services/adapters';
import { TranspileService } from './services/transpiler';
import { SyncService } from './services/sync';
import { LinkerService } from './services/linker';
import { MarketService, McpService, CliService, LlmOptimizeService, DependencyService, SecurityAuditService, GitHubMarketService } from './services/market';
import { ImportService } from './services/import';
import { CollectionService } from './services/collections';
import { CommandService } from './services/command';
import { HealthCheckService } from './services/health-check';
import { RecycleBinService } from './services/recycle-bin';
import { VerifyService } from './services/verify';
import { ToolRegistryService } from './services/tool-registry';
import { CategoryService } from './services/category';
import { RegistryService } from './services/registry';
import { InstallService } from './services/install';
import { JunctionUtils } from './services/junction-utils';
import { AiGenerateService } from './services/ai-generate';
import { SkillManifestService, type SkillManifest } from './services/skill-manifest';
import { CacheService } from './services/cache';
import { SecurityGatewayService, type SecurityPolicy, type InstallSecurityReport } from './services/security-gateway';

dotenv.config();

/**
 * Sanitize a skill name to prevent path traversal.
 * Rejects any name containing path separators or `..`.
 */
function sanitizeSkillName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const cleaned = name.trim();
  if (cleaned.includes('\\') || cleaned.includes('/') || cleaned.includes('..')) return null;
  return cleaned;
}

/**
 * Sanitize a raw path string to reject `..` traversal segments.
 * Note: the path may still contain drive letters / absolute paths,
 * but `..` is blocked to prevent escaping intended directories.
 */
function sanitizePath(p: unknown): string | null {
  if (typeof p !== 'string' || !p.trim()) return null;
  if (/\.\./.test(p)) return null;
  return p.trim();
}

/**
 * Redact the user's home directory from error messages to avoid
 * leaking absolute filesystem paths in API responses.
 */
function sanitizeErrorMessage(msg: string): string {
  return msg.replace(os.homedir(), '~');
}

// ==================== /api/skills mtime cache ====================

interface SkillSourceInfo {
  path: string;
  managedPath: string;
  platformName: string;
  isUniversal: boolean;
  isSymlink: boolean;
  isRealFile: boolean;
  symlinkTarget: string;
  modifiedTime: string;
  health: SkillHealthReport | undefined;
  isBroken: boolean;
}

interface SkillEntry {
  id: string;
  name: string;
  path: string;
  type: string;
  sourceType: string;
  linked: boolean;
  linkedCount: number;
  modifiedTime: string;
  platforms: string[];
  health: SkillHealthReport | undefined;
  sources: SkillSourceInfo[];
  isDuplicate: boolean;
}

let skillsCache: { ts: number; data: SkillEntry[]; pathMtimes: Map<string, number> } | null = null;

// Cache for LintService.analyzeSkill results — keyed by SKILL.md mtime
const analyzeSkillCache = new Map<string, { mtime: number; result: SkillHealthReport }>();

async function cachedAnalyzeSkill(fullPath: string): Promise<SkillHealthReport> {
  const skillMdPath = path.join(fullPath, 'SKILL.md');
  const stat = await fs.stat(skillMdPath).catch(() => null);
  if (stat) {
    const mtime = stat.mtime.getTime();
    const cached = analyzeSkillCache.get(fullPath);
    if (cached && cached.mtime === mtime) {
      return cached.result;
    }
    const result = await LintService.analyzeSkill(fullPath);
    analyzeSkillCache.set(fullPath, { mtime, result });
    return result;
  }
  return LintService.analyzeSkill(fullPath);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

async function findSkillPathByName(skillName: string): Promise<string | null> {
  const config = await ConfigService.getConfig();
  const candidates: string[] = [];

  if (config.masterSkillsDir) {
    candidates.push(path.join(config.masterSkillsDir, skillName));
  }

  const managedPaths = await ConfigService.getManagedPaths();
  for (const managedPath of managedPaths) {
    candidates.push(path.join(managedPath.path, skillName));
  }

  for (const candidate of candidates) {
    const stats = await fs.lstat(candidate).catch(() => null);
    if (stats && (stats.isDirectory() || stats.isSymbolicLink())) {
      return candidate;
    }
  }

  return null;
}

// ==================== Sync Groups Storage ====================
// User-defined skill groupings for batch sync. Stored at ~/.skills_sync_groups.json.

interface SyncGroup {
  id: string;
  name: string;
  skills: string[];
  platformIds: string[];
  createdAt: string;
}

const SYNC_GROUPS_PATH = path.join(os.homedir(), '.skills_sync_groups.json');

async function readSyncGroups(): Promise<SyncGroup[]> {
  if (!await fs.pathExists(SYNC_GROUPS_PATH)) return [];
  try {
    const data = await fs.readJson(SYNC_GROUPS_PATH);
    return Array.isArray(data) ? (data as SyncGroup[]) : [];
  } catch {
    return [];
  }
}

async function writeSyncGroups(groups: SyncGroup[]): Promise<void> {
  await fs.writeJson(SYNC_GROUPS_PATH, groups, { spaces: 2 });
}

// Root health check
app.get('/', (req, res) => {
  res.json({ name: 'AI Skill Manager API', status: 'online', version: '2.0.0' });
});

// ==================== Skills Inventory ====================
// Hub 仅作备份，不作为活跃技能来源。技能从 managedPaths 扫描。

app.get('/api/skills', async (req, res) => {
  try {
    const managedPaths = await ConfigService.getManagedPaths();
    // 如果 managedPaths 为空，触发首次扫描
    const activePaths = managedPaths.length > 0
      ? managedPaths.filter(p => p.exists)
      : await PathDiscoveryService.discoverPathsWithInfo().then(list => list.filter(p => p.exists));

    // ---- mtime cache check ----
    // Stat each managed path's directory mtime. If all match the cache,
    // return the cached skills array without re-scanning.
    const currentMtimes = new Map<string, number>();
    for (const mp of activePaths) {
      const stat = await fs.stat(mp.path).catch(() => null);
      if (stat) {
        currentMtimes.set(mp.path, stat.mtime.getTime());
      }
    }
    if (skillsCache && skillsCache.pathMtimes.size === currentMtimes.size) {
      let allMatch = true;
      for (const [p, mtime] of currentMtimes) {
        if (skillsCache.pathMtimes.get(p) !== mtime) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        res.json(skillsCache.data);
        return;
      }
    }

    // ---- full scan ----
    const allSkills: SkillEntry[] = [];

    // Intermediate result from concurrent per-entry scan
    interface ScanEntry {
      name: string;
      fullPath: string;
      modifiedTime: string;
      isSymlink: boolean;
      symlinkTarget: string;
      isBroken: boolean;
      isRealFile: boolean;
      health: SkillHealthReport | undefined;
    }

    // 扫描每个 managed path
    for (const mp of activePaths) {
      if (!await fs.pathExists(mp.path)) continue;

      const items = await fs.readdir(mp.path).catch(() => []);
      // Load .skillignore list for this managed path
      const ignoreList = await HealthCheckService.readIgnoreFile(mp.path);

      // Filter candidate entries early (skip hidden / tmp / ignored)
      const candidateNames = items.filter(name => {
        if (name.startsWith('.') || name.startsWith('_tmp_')) return false;
        if (HealthCheckService.isIgnored(name, ignoreList)) return false;
        return true;
      });

      // Concurrently gather per-entry info (stats, junction, SKILL.md, health)
      const scanResults = await Promise.all(candidateNames.map(async (name): Promise<ScanEntry | null> => {
        const fullPath = path.join(mp.path, name);
        const stats = await fs.lstat(fullPath).catch(() => null);
        if (!stats) return null;
        if (!stats.isDirectory() && !stats.isSymbolicLink()) return null;

        // Use JunctionUtils for reliable junction detection on Windows
        const isSymlink = JunctionUtils.isJunction(fullPath);
        let symlinkTarget = '';
        let isBroken = false;

        if (isSymlink) {
          symlinkTarget = JunctionUtils.getJunctionTarget(fullPath) || '';
          isBroken = JunctionUtils.isBrokenJunction(fullPath);
        }

        // 过滤无 SKILL.md 的目录（非技能目录不显示、不处理）
        if (!isBroken && !await fs.pathExists(path.join(fullPath, 'SKILL.md'))) return null;

        const isRealFile = !isSymlink;
        // 如果是死链，analyzeSkill 可能会报错，所以跳过
        const health = !isBroken ? await cachedAnalyzeSkill(fullPath) : undefined;

        return {
          name,
          fullPath,
          modifiedTime: stats.mtime.toISOString(),
          isSymlink,
          symlinkTarget,
          isBroken,
          isRealFile,
          health,
        };
      }));

      // Process results sequentially — dedup logic depends on insertion order
      for (const result of scanResults) {
        if (!result) continue;
        const { name, fullPath, modifiedTime, isSymlink, symlinkTarget, isBroken, isRealFile, health } = result;

        // 检查是否已有同名技能
        const existing = allSkills.find(s => s.name === name);
        const sourceInfo: SkillSourceInfo = {
          path: fullPath,
          managedPath: mp.path,
          platformName: mp.platformName,
          isUniversal: mp.isUniversal,
          isSymlink,
          isRealFile,
          symlinkTarget,
          modifiedTime,
          health,
          isBroken,
        };

        if (existing) {
          if (!existing.sources) existing.sources = [];
          existing.sources.push(sourceInfo);
          // 仅当有两个以上的真实目录时才算作重复，符号链接不算
          const realSources = existing.sources.filter((s: SkillSourceInfo) => s.isRealFile);
          existing.isDuplicate = realSources.length > 1;
        } else {
          allSkills.push({
            id: `${mp.path}-${name}`,
            name,
            path: fullPath,
            type: 'client',
            sourceType: mp.isUniversal ? 'agents-dir' : 'local',
            linked: false,
            linkedCount: 0,
            modifiedTime,
            platforms: [],
            health,
            sources: [sourceInfo],
            isDuplicate: false,
          });
        }
      }
    }

    // 同时备份到 Hub（静默，不阻塞响应）
    const config = await ConfigService.getConfig();
    if (await fs.pathExists(config.masterSkillsDir)) {
      // Hub 中的技能仅作备份展示，不加入 allSkills
    }

    // Update the mtime cache
    skillsCache = { ts: Date.now(), data: allSkills, pathMtimes: currentMtimes };

    res.json(allSkills);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Utility ====================
app.post('/api/open-folder', async (req, res) => {
  const { targetPath } = req.body;
  try {
    const stats = await fs.lstat(targetPath).catch(() => null);
    if (stats) {
       CommandService.openFolder(targetPath);
       res.json({ success: true });
    } else {
       res.status(404).json({ error: 'Folder not found' });
    }
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Import Skill to Universal ====================
// 将技能从私有路径复制/链接到通用 .agents/skills 目录

app.post('/api/skills/import-universal', async (req, res) => {
  const { sourcePath, skillName, mode } = req.body as { sourcePath: string; skillName: string; mode: 'copy' | 'link' };
  try {
    if (!sourcePath || !skillName) {
      return res.status(400).json({ error: 'sourcePath and skillName are required' });
    }
    const universalDir = path.join(os.homedir(), '.agents', 'skills');
    await fs.ensureDir(universalDir);
    const targetPath = path.join(universalDir, skillName);

    if (await fs.pathExists(targetPath)) {
      return res.status(409).json({ error: `"${skillName}" already exists in universal directory` });
    }

    if (mode === 'link') {
      // 创建 junction（使用 JunctionUtils 安全创建）
      await JunctionUtils.createJunction(sourcePath, targetPath);
    } else {
      // 复制
      await fs.copy(sourcePath, targetPath);
    }

    // 同时备份到 Hub
    const config = await ConfigService.getConfig();
    if (await fs.pathExists(config.masterSkillsDir)) {
      const hubTarget = path.join(config.masterSkillsDir, skillName);
      if (!await fs.pathExists(hubTarget)) {
        await fs.copy(sourcePath, hubTarget);
      }
    }

    res.json({ success: true, targetPath, mode: mode === 'link' ? 'junction' : 'copy' });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Backup to Hub ====================
// 将技能备份到 Storage Hub

app.post('/api/skills/backup-hub', async (req, res) => {
  const { sourcePath, skillName } = req.body as { sourcePath: string; skillName: string };
  try {
    if (!sourcePath || !skillName) {
      return res.status(400).json({ error: 'sourcePath and skillName are required' });
    }
    const config = await ConfigService.getConfig();
    const hubTarget = path.join(config.masterSkillsDir, skillName);
    await fs.ensureDir(config.masterSkillsDir);

    // 如果已存在则先删除再覆盖
    if (await fs.pathExists(hubTarget)) {
      await fs.remove(hubTarget);
    }
    await fs.copy(sourcePath, hubTarget);

    res.json({ success: true, hubPath: hubTarget });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});


// ==================== GitHub & Archive Import ====================

app.post('/api/import/github', async (req, res) => {
  const { repoUrl } = req.body as { repoUrl: string };
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }
  // Basic command-injection guard: only allow http(s) URLs and git@ ssh URLs
  if (!/^https?:\/\/[\w.-]+\/.+\.git$|^git@[\w.-]+:.+\.git$/.test(repoUrl) && !/^https?:\/\/[\w.-]+\/.+\/?$/.test(repoUrl)) {
    return res.status(400).json({ error: 'repoUrl must be a GitHub (or compatible) HTTP(S) URL' });
  }
  try {
    const config = await ConfigService.getConfig();
    const hubPath = config.masterSkillsDir;
    if (!hubPath) {
      return res.status(400).json({ error: 'Skills Hub path is not configured.' });
    }
    const result = await ImportService.importFromGithub(repoUrl, hubPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/import/archive', async (req, res) => {
  const { archivePath } = req.body as { archivePath: string };
  if (!archivePath) {
    return res.status(400).json({ error: 'archivePath is required' });
  }
  // Resolve to absolute and verify it exists locally
  const abs = path.resolve(archivePath);
  if (!await fs.pathExists(abs)) {
    return res.status(404).json({ error: `Archive not found: ${abs}` });
  }
  // Guard against path traversal — must be under user temp or user home
  const tmpRoot = path.join(os.tmpdir());
  const homeRoot = os.homedir();
  if (!abs.startsWith(tmpRoot) && !abs.startsWith(homeRoot)) {
    return res.status(400).json({ error: 'Archive must reside under user home or temp directory.' });
  }
  try {
    const config = await ConfigService.getConfig();
    const hubPath = config.masterSkillsDir;
    if (!hubPath) {
      return res.status(400).json({ error: 'Skills Hub path is not configured.' });
    }
    const result = await ImportService.importFromArchive(abs, hubPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Collections (User Skill Groupings) ====================

app.get('/api/collections', async (req, res) => {
  try {
    res.json({ collections: await CollectionService.list() });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/collections', async (req, res) => {
  const { name, description, color, icon } = req.body as { name: string; description?: string; color?: string; icon?: string };
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const col = await CollectionService.create(name.trim(), description?.trim() || undefined, color, icon);
    res.json(col);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.put('/api/collections/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, color, icon } = req.body as { name?: string; description?: string; color?: string; icon?: string };
  try {
    const col = await CollectionService.update(id, { name, description, color, icon });
    res.json(col);
  } catch (error) {
    res.status(404).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/collections/:id', async (req, res) => {
  const { id } = req.params;
  try {
    res.json(await CollectionService.delete(id));
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

app.post('/api/collections/:id/skills', async (req, res) => {
  const { id } = req.params;
  const { skillName, skillPath, note } = req.body as { skillName: string; skillPath?: string; note?: string };
  if (!skillName) {
    return res.status(400).json({ error: 'skillName is required' });
  }
  try {
    const col = await CollectionService.addSkill(id, skillName, skillPath, note);
    res.json(col);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

app.delete('/api/collections/:id/skills', async (req, res) => {
  const { id } = req.params;
  const { skillName, skillPath } = req.body as { skillName: string; skillPath?: string };
  if (!skillName) {
    return res.status(400).json({ error: 'skillName is required' });
  }
  try {
    const col = await CollectionService.removeSkill(id, skillName, skillPath);
    res.json(col);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

app.get('/api/collections/:id/export', async (req, res) => {
  const { id } = req.params;
  try {
    const manifest = await CollectionService.exportManifest(id);
    res.json(manifest);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// Import a collection manifest (shareable skill grouping) and create a new Collection
app.post('/api/collections/import', async (req, res) => {
  try {
    const col = await CollectionService.importCollection(req.body);
    res.json(col);
  } catch (error) {
    res.status(400).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Platform Adapters ====================


app.get('/api/platforms', async (req, res) => {
  try {
    const result = await CacheService.getOrSet('platforms', async () => {
      const all = getAllAdapters();
      const results = [];
      for (const adapter of all) {
        const installed = await adapter.isInstalled();
        results.push({
          id: adapter.id,
          name: adapter.name,
          icon: adapter.icon,
          discoveryMethod: adapter.discoveryMethod,
          readsFromUniversal: adapter.readsFromUniversal,
          skillsDir: adapter.getSkillsDir(),
          installed,
          postInstallHint: adapter.getPostInstallHint()
        });
      }
      return results;
    }, 60000); // Cache platforms for 60 seconds
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/platforms/installed', async (req, res) => {
  try {
    const installed = await getInstalledPlatforms();
    res.json(installed.map(a => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      discoveryMethod: a.discoveryMethod,
      skillsDir: a.getSkillsDir()
    })));
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Smart Install ====================

app.post('/api/install', async (req, res) => {
  const { platformId, source } = req.body as { platformId?: string; source?: SkillSource };
  if (!platformId || typeof platformId !== 'string') {
    return res.status(400).json({ error: 'platformId is required' });
  }
  if (!source || !source.type) {
    return res.status(400).json({ error: 'source with a valid type is required' });
  }
  try {
    const adapter = getAdapter(platformId);
    if (!adapter) {
      return res.status(400).json({ error: `Unknown platform: ${platformId}` });
    }

    if (!(await adapter.isInstalled())) {
      return res.status(400).json({ error: `${adapter.name} is not installed on this system.` });
    }

    // Check for known packages and use their dedicated install commands
    const known = KNOWN_PACKAGES.find(p => 
      source.url?.includes(p.githubUrl) || source.name === p.name
    );

    if (known && known.installCommands[platformId]) {
      source.installCommand = known.installCommands[platformId];
    }

    const result = await adapter.install(source);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Known Packages (Registry) ====================

app.get('/api/packages', (req, res) => {
  res.json(KNOWN_PACKAGES);
});

// ==================== Skill CRUD ====================

// SKILL.md content read/save — powers Markdown preview editor
app.get('/api/skills/content', async (req, res) => {
  const { skillPath } = req.query as { skillPath?: string };
  if (!skillPath) return res.status(400).json({ error: 'skillPath is required' });
  const abs = path.resolve(skillPath);
  // Must be a directory containing SKILL.md
  const file = path.join(abs, 'SKILL.md');
  if (!await fs.pathExists(file)) return res.status(404).json({ error: 'SKILL.md not found at: ' + file });
  try {
    const content = await fs.readFile(file, 'utf8');
    res.json({ content, path: file });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.put('/api/skills/content', async (req, res) => {
  const { skillPath, content } = req.body as { skillPath: string; content: string };
  if (!skillPath) return res.status(400).json({ error: 'skillPath is required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  const abs = path.resolve(skillPath);
  const file = path.join(abs, 'SKILL.md');
  if (!await fs.pathExists(file)) return res.status(404).json({ error: 'SKILL.md not found at: ' + file });
  try {
    // Write atomically via tmp + rename
    const tmp = file + '.tmp-' + Date.now();
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, file);
    res.json({ saved: true, path: file, bytes: content.length });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/skills/create', async (req, res) => {
  const { name, description, template } = req.body as { name?: string; description?: string; template?: string };
  const safeName = sanitizeSkillName(name);
  if (!safeName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const config = await ConfigService.getConfig();
    const skillPath = path.join(config.masterSkillsDir, safeName);
    if (await fs.pathExists(skillPath)) return res.status(400).json({ error: 'Skill already exists' });
    await fs.ensureDir(skillPath);
    const skillFile = path.join(skillPath, 'SKILL.md');
    let content = `---\nname: ${safeName}\ndescription: ${description || 'New skill'}\n---\n\n`;
    content += template === 'advanced' 
      ? `## Instructions\n- Define the core logic here.\n\n## Rules\n- Rule 1\n\n## Examples\n- Example 1\n`
      : `## Summary\nBasic skill structure.\n\n## Usage\nHow to use this skill.\n`;
    await fs.writeFile(skillFile, content);
    res.json({ success: true, path: skillPath });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/skills/:name/rollback', async (req, res) => {
  const { timestamp } = req.body as { timestamp?: string };
  const skillName = req.params.name;
  if (!timestamp) return res.status(400).json({ error: 'timestamp is required' });

  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    await VersionService.rollback(skillPath, timestamp);
    res.json({ success: true, path: skillPath });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Compare SKILL.md content between two snapshots of the same skill
app.get('/api/skills/:name/diff', async (req, res) => {
  const { name } = req.params;
  const { snapshot1, snapshot2 } = req.query as Record<string, string>;
  if (!snapshot1 || !snapshot2) {
    return res.status(400).json({ error: 'snapshot1 and snapshot2 are required' });
  }
  try {
    const skillPath = await findSkillPathByName(name);
    if (!skillPath) return res.status(404).json({ error: `Skill "${name}" not found` });
    const result = await VersionService.diffSnapshots(skillPath, snapshot1, snapshot2);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Optimization ====================

app.get('/api/optimize/preview', async (req, res) => {
  const { path: skillPath } = req.query;
  const safePath = sanitizePath(skillPath);
  if (!safePath) return res.status(400).json({ error: 'Invalid skillPath' });
  try {
    const result = await OptimizeService.optimizeSkill(safePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/optimize/apply', async (req, res) => {
  const { path: skillPath, content } = req.body as { path?: string; content?: string };
  const safePath = sanitizePath(skillPath);
  if (!safePath) return res.status(400).json({ error: 'Invalid skillPath' });
  try {
    await VersionService.createSnapshot(safePath);
    await OptimizeService.applyOptimization(safePath, content || '');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Config ====================

app.get('/api/config', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/config/scan', async (req, res) => {
  try {
    const paths = await PathDiscoveryService.discoverPaths();
    res.json({ success: true, paths });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/custom-paths', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    res.json({ customPaths: config.customPaths || [] });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Managed Paths ====================
// 统一管理自动扫描 + 手动添加的技能路径，带元数据。

app.get('/api/managed-paths', async (req, res) => {
  try {
    const saved = await ConfigService.getManagedPaths();
    // 如果还没有保存过，触发一次扫描
    if (saved.length === 0) {
      const discovered = await PathDiscoveryService.discoverPathsWithInfo();
      await ConfigService.saveManagedPaths(discovered);
      res.json({ managedPaths: discovered });
    } else {
      // 检查已保存路径的 exists 状态是否过期
      const updated = await Promise.all(saved.map(async (p: ManagedPathInfo) => {
        const exists = await fs.pathExists(p.path);
        return { ...p, exists };
      }));
      res.json({ managedPaths: updated });
    }
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/managed-paths/scan', async (req, res) => {
  try {
    const discovered = await PathDiscoveryService.discoverPathsWithInfo();
    // 保留用户手动添加的自定义路径（合并到扫描结果）
    const existing = await ConfigService.getManagedPaths();
    const customPaths = existing.filter(p => p.isCustom);
    // 合并：扫描结果 + 旧的自定义路径（去重）
    const seen = new Set(discovered.map(p => p.path));
    for (const cp of customPaths) {
      if (!seen.has(cp.path)) {
        discovered.push(cp);
        seen.add(cp.path);
      }
    }
    await ConfigService.saveManagedPaths(discovered);
    res.json({ success: true, managedPaths: discovered });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/managed-paths', async (req, res) => {
  const { path: customPath, platformName } = req.body as { path: string; platformName?: string };
  try {
    if (!customPath || typeof customPath !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }
    const normalized = path.resolve(customPath);
    const existing = await ConfigService.getManagedPaths();
    // 检查重复
    if (existing.some(p => p.path === normalized)) {
      return res.json({ success: true, added: false, reason: 'duplicate', managedPaths: existing });
    }
    const exists = await fs.pathExists(normalized);
    const newEntry: ManagedPathInfo = {
      path: normalized,
      platformName: platformName || 'Custom',
      isUniversal: false,
      isCustom: true,
      exists,
    };
    existing.push(newEntry);
    await ConfigService.saveManagedPaths(existing);
    // 同时更新 customPaths（向后兼容）
    await ConfigService.addCustomPath(normalized);
    res.json({ success: true, added: true, managedPaths: existing });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.put('/api/managed-paths', async (req, res) => {
  const { originalPath, updated } = req.body as { originalPath: string; updated: Partial<ManagedPathInfo> };
  try {
    if (!originalPath || !updated) {
      return res.status(400).json({ error: 'originalPath and updated are required' });
    }
    const ok = await ConfigService.updateManagedPath(originalPath, updated);
    const managedPaths = await ConfigService.getManagedPaths();
    res.json({ success: ok, managedPaths });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/managed-paths', async (req, res) => {
  const { path: targetPath } = req.body as { path: string };
  try {
    if (!targetPath || typeof targetPath !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }
    const ok = await ConfigService.removeManagedPath(targetPath);
    // 同时从 customPaths 移除（向后兼容）
    if (ok) await ConfigService.removeCustomPath(targetPath);
    const managedPaths = await ConfigService.getManagedPaths();
    res.json({ success: ok, managedPaths });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Version History ====================

app.get('/api/skills/history', async (req, res) => {
  const { skillName, path: skillPath } = req.query;
  try {
    const resolvedPath = skillPath as string || (skillName ? path.join((await ConfigService.getConfig()).masterSkillsDir, skillName as string) : undefined);
    if (!resolvedPath) return res.status(400).json({ error: 'skillName or path is required' });
    const snapshots = await VersionService.listSnapshots(resolvedPath);
    res.json({ snapshots });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== v1.0: Format Translator ====================

app.get('/api/transpile/formats', (req, res) => {
  res.json({ formats: TranspileService.getSupportedFormats() });
});

app.post('/api/transpile/preview', async (req, res) => {
  const { skillPath, format } = req.body;
  try {
    const result = await TranspileService.previewDiff(skillPath, format);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/transpile/install', async (req, res) => {
  const { skillPath, format, targetDir } = req.body;
  try {
    const result = await TranspileService.transpileAndInstall(skillPath, format, targetDir);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== v3.0: Two-Way Sync & Linker Engine ====================

app.get('/api/link/plan', async (req, res) => {
  const platformId = req.query.platformId as string;
  if (!platformId) return res.status(400).json({ error: 'platformId is required' });
  try {
    const config = await ConfigService.getConfig();
    const adapter = getAdapter(platformId);
    if (!adapter) return res.status(400).json({ error: 'Unknown platform' });
    
    // Pass readsFromUniversal to generateLinkPlan — it handles filtering internally
    const plan = await LinkerService.generateLinkPlan(
      adapter.getSkillsDir(), config.masterSkillsDir, adapter.id, adapter.readsFromUniversal
    );
    
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/link/execute', async (req, res) => {
  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });
  try {
    await LinkerService.executeLinkPlan(plan);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// 清理 readsFromUniversal=true 平台的冗余符号链接
interface CleanupResult {
  platform: string;
  deleted: number;
  skipped: number;
  failedPaths?: string[];
}

app.post('/api/link/cleanup-redundant', async (req, res) => {
  try {
    const all = getAllAdapters();
    const results: CleanupResult[] = [];
    for (const adapter of all) {
      if (!adapter.readsFromUniversal) continue;
      const installed = await adapter.isInstalled();
      if (!installed) continue;
      const skillsDir = adapter.getSkillsDir();
      if (!await fs.pathExists(skillsDir)) continue;
      // 收集所有需要扫描的目录（qoder 有 .qoder 和 .qoderwork 两个目录）
      const dirsToScan = [skillsDir];
      if (adapter.id === 'qoder') {
        const altDir = path.join(os.homedir(), '.qoder', 'skills');
        if (altDir !== skillsDir && await fs.pathExists(altDir)) dirsToScan.push(altDir);
      }
      if (adapter.id === 'trae-cn') {
        const traeDir = path.join(os.homedir(), '.trae-cn', 'skills');
        if (traeDir !== skillsDir && await fs.pathExists(traeDir)) dirsToScan.push(traeDir);
      }
      let deleted = 0;
      let skipped = 0;
      const failedPaths: string[] = [];
      for (const scanDir of dirsToScan) {
        const entries = await fs.readdir(scanDir);
        for (const entry of entries) {
          const fullPath = path.join(scanDir, entry);
          // Use JunctionUtils for reliable detection
          if (!JunctionUtils.isJunction(fullPath)) continue;
          // Safe deletion via PowerShell (Get-Item).Delete()
          const ok = JunctionUtils.safeDelete(fullPath);
          if (ok) {
            deleted++;
          } else {
            skipped++;
            failedPaths.push(fullPath);
            console.log(`[cleanup] FAILED: ${fullPath}`);
          }
        }
      }
      if (deleted > 0 || skipped > 0) {
        results.push({ platform: adapter.id, deleted, skipped, failedPaths: skipped > 0 ? failedPaths : undefined });
      }
    }
    res.json({ success: true, results, totalDeleted: results.reduce((s, r) => s + r.deleted, 0), totalSkipped: results.reduce((s, r) => s + r.skipped, 0) });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/transpile/reverse-collect', async (req, res) => {
  const { dirPath } = req.body;
  try {
    const results = await TranspileService.reverseCollect(dirPath);
    res.json({ collected: results });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/sync/git/push', async (req, res) => {
  try {
    const result = await SyncService.gitPush();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/sync/git/pull', async (req, res) => {
  try {
    const result = await SyncService.gitPull();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Git repo status — is the master skills dir a git repo, and how far ahead/behind upstream?
app.get('/api/sync/git/status', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const gitDir = config.masterSkillsDir;
    if (!await fs.pathExists(path.join(gitDir, '.git'))) {
      return res.json({ initialized: false, remote: null, ahead: 0, behind: 0, modified: 0 });
    }

    let remote: string | null = null;
    let ahead = 0;
    let behind = 0;
    let modified = 0;

    try {
      remote = CommandService.git(['remote', 'get-url', 'origin'], gitDir).trim() || null;
    } catch {
      remote = null;
    }

    try {
      // Returns "<behind>\t<ahead>" relative to upstream
      const counts = CommandService.git(['rev-list', '--left-right', '--count', '@{u}...HEAD'], gitDir).trim();
      const parts = counts.split(/\s+/);
      if (parts.length >= 2) {
        behind = parseInt(parts[0], 10) || 0;
        ahead = parseInt(parts[1], 10) || 0;
      }
    } catch {
      // No upstream configured yet
      ahead = 0;
      behind = 0;
    }

    try {
      const status = CommandService.git(['status', '--porcelain'], gitDir).trim();
      modified = status ? status.split('\n').length : 0;
    } catch {
      modified = 0;
    }

    res.json({ initialized: true, remote, ahead, behind, modified });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Bind (or rebind) the master skills dir to a remote git repository
app.post('/api/sync/git/bind', async (req, res) => {
  const { repoUrl, remoteUrl } = req.body as { repoUrl?: string; remoteUrl?: string };
  const url = repoUrl || remoteUrl;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }
  // Basic command-injection guard: only allow http(s) or git@ ssh URLs
  if (!/^https?:\/\/[\w.-]+\/.+|^git@[\w.-]+:.+/.test(url.trim())) {
    return res.status(400).json({ error: 'repoUrl must be an http(s) or git@ URL' });
  }
  try {
    const config = await ConfigService.getConfig();
    const gitDir = config.masterSkillsDir;
    if (!await fs.pathExists(path.join(gitDir, '.git'))) {
      CommandService.git(['init'], gitDir);
    }
    // Remove existing origin (ignore error if none)
    try {
      CommandService.git(['remote', 'remove', 'origin'], gitDir);
    } catch {
      // no existing origin — safe to ignore
    }
    CommandService.git(['remote', 'add', 'origin', url.trim()], gitDir);
    res.json({ success: true, message: `Bound to ${url.trim()}`, bound: url.trim() });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== v3.0: Smart Market + MCP ====================

app.get('/api/market/search', (req, res) => {
  const { q, category } = req.query;
  try {
    const results = MarketService.search((q as string) || '', category as string);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/market/categories', (req, res) => {
  res.json({ categories: MarketService.getCategories() });
});

app.get('/api/market/stats', (req, res) => {
  res.json(MarketService.getStats());
});

app.get('/api/market/recommendations/:skillName', (req, res) => {
  try {
    const recommendations = MarketService.getRecommendations(req.params.skillName);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/market/install', async (req, res) => {
  const { name, url } = req.body as { name?: string; url?: string };
  try {
    const skill = name ? MarketService.search(name).find(s => s.name === name) : undefined;
    const repoUrl = url || skill?.githubUrl;
    if (!repoUrl) return res.status(400).json({ error: 'name or url is required' });

    const config = await ConfigService.getConfig();
    const result = await ImportService.importFromGithub(repoUrl, config.masterSkillsDir);
    res.json({ ...result, message: `Imported ${result.name}` });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== skills.sh Remote Marketplace ====================

app.get('/api/marketplace/leaderboard', async (req, res) => {
  try {
    const view = (req.query.view as 'all-time' | 'trending' | 'hot') || 'all-time';
    const page = parseInt((req.query.page as string) || '0', 10);
    const perPage = Math.min(parseInt((req.query.per_page as string) || '50', 10), 200);
    const result = await GitHubMarketService.leaderboard(view, page, perPage);
    res.json(result);
  } catch {
    // GitHub API rate limit or network error — degrade gracefully to empty result
    res.json({ data: [], total: 0, hasMore: false, error: 'GitHub API rate limit or network error' });
  }
});

app.get('/api/marketplace/search', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
    if (q.length < 2) {
      res.status(400).json({ error: 'Query must be at least 2 characters' });
      return;
    }
    const result = await GitHubMarketService.search(q, limit);
    res.json(result);
  } catch {
    // GitHub API rate limit or network error — degrade gracefully
    res.json({ data: [], searchType: 'github-search', error: 'GitHub API rate limit or network error' });
  }
});

app.get('/api/marketplace/curated', async (req, res) => {
  try {
    const result = await GitHubMarketService.curated();
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// Install a skill from the GitHub marketplace (clone into Hub)
app.post('/api/marketplace/install', async (req, res) => {
  const { name, url } = req.body as { name: string; url: string };
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  // Basic command-injection guard
  if (!/^https?:\/\/[\w.-]+\/.+\.git$|^git@[\w.-]+:.+\.git$/.test(url) && !/^https?:\/\/[\w.-]+\/.+\/?$/.test(url)) {
    return res.status(400).json({ error: 'url must be a GitHub (or compatible) HTTP(S) URL' });
  }
  try {
    const config = await ConfigService.getConfig();
    const hubPath = config.masterSkillsDir;
    if (!hubPath) {
      return res.status(400).json({ error: 'Skills Hub path is not configured.' });
    }
    const result = await ImportService.importFromGithub(url, hubPath);
    res.json({ success: true, message: `Installed "${name || url}"`, ...(result as Record<string, unknown>) });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/marketplace/skills/:source/:skill', async (req, res) => {
  try {
    const { source, skill } = req.params;
    const detail = await GitHubMarketService.detail(source, skill);
    res.json(detail);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

app.get('/api/marketplace/skills/:source/:skill/audit', async (req, res) => {
  try {
    const { skill } = req.params;
    // Resolve skill name to a local directory path for security audit
    const skillPath = await findSkillPathByName(skill);
    if (!skillPath) {
      return res.status(404).json({ error: `Skill "${skill}" not found locally. Install it first to audit.` });
    }
    const audit = await GitHubMarketService.audit(skillPath);
    res.json(audit);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// MCP Server Management
app.get('/api/mcp', async (req, res) => {
  try {
    const config = await McpService.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/mcp/servers', async (req, res) => {
  try {
    const config = await McpService.getConfig();
    res.json(config.servers);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/mcp', async (req, res) => {
  const { name, command, args, env, description } = req.body as { name?: string; command?: string; args?: string[] | string; env?: Record<string, string>; description?: string };
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  try {
    const parsedArgs = Array.isArray(args) ? args : typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
    const result = await McpService.addServer({ name, command: command || '', args: parsedArgs, env, description, enabled: true });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/mcp/servers', async (req, res) => {
  const { name, command, args, env, description } = req.body as { name?: string; command?: string; args?: string[] | string; env?: Record<string, string>; description?: string };
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  try {
    const parsedArgs = Array.isArray(args) ? args : typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
    const result = await McpService.addServer({ name, command: command || '', args: parsedArgs, env, description, enabled: true });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/mcp', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  try {
    const result = await McpService.removeServer(name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/mcp/servers/:name', async (req, res) => {
  try {
    const result = await McpService.removeServer(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/mcp/toggle', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await McpService.toggleServer(name);
    if (!result) return res.status(404).json({ error: 'Server not found' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/mcp/servers/:name/toggle', async (req, res) => {
  try {
    const result = await McpService.toggleServer(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/mcp/claude-config', async (req, res) => {
  try {
    const config = await McpService.generateClaudeMcpConfig();
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// LLM Optimization
app.get('/api/llm-optimize/preview', async (req, res) => {
  const { path: skillPath } = req.query;
  const safePath = sanitizePath(skillPath);
  if (!safePath) return res.status(400).json({ error: 'Invalid skillPath' });
  try {
    const result = await LlmOptimizeService.optimize(safePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/llm-optimize/apply', async (req, res) => {
  const { path: skillPath, content } = req.body as { path?: string; content?: string };
  const safePath = sanitizePath(skillPath);
  if (!safePath) return res.status(400).json({ error: 'Invalid skillPath' });
  try {
    await VersionService.createSnapshot(safePath);
    await LlmOptimizeService.apply(safePath, content || '');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Dependency Graph
app.get('/api/dependencies/graph', async (req, res) => {
  try {
    const graph = await DependencyService.buildDependencyGraph();
    // Convert Record<string, string[]> to { nodes, edges } format for frontend
    const nodes = Object.keys(graph).map(name => ({ id: name, label: name }));
    const edges: Array<{ from: string; to: string }> = [];
    for (const [skill, deps] of Object.entries(graph)) {
      for (const dep of deps) {
        edges.push({ from: skill, to: dep });
      }
    }
    res.json({ nodes, edges, graph });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/dependencies/:skillPath', async (req, res) => {
  try {
    const deps = await DependencyService.getDependencies(decodeURIComponent(req.params.skillPath));
    res.json({ dependencies: deps });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Security Audit
app.post('/api/security/audit', async (req, res) => {
  const { skillPath } = req.body;
  try {
    const result = await SecurityAuditService.audit(skillPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Security Audit Whitelist — rules listed here are flagged as ignored in lint results
app.get('/api/security/whitelist', async (req, res) => {
  try {
    const rules = await LintService.getWhitelist();
    res.json({ rules });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/security/whitelist', async (req, res) => {
  const { rule } = req.body as { rule?: string };
  if (!rule || !rule.trim()) {
    return res.status(400).json({ error: 'rule is required' });
  }
  try {
    const rules = await LintService.addToWhitelist(rule.trim());
    res.json({ success: true, rules });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/security/whitelist/:rule', async (req, res) => {
  try {
    const rule = decodeURIComponent(req.params.rule);
    const rules = await LintService.removeFromWhitelist(rule);
    res.json({ success: true, rules });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== CLI Extensions ====================
app.get('/api/cli/extensions', async (req, res) => {
  try {
    const config = await CliService.getConfig();
    res.json(config.extensions);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/cli/extensions', async (req, res) => {
  try {
    await CliService.addExtension(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/cli/extensions/:id', async (req, res) => {
  try {
    await CliService.removeExtension(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/cli/extensions/:id/launch', (req, res) => {
  try {
    CliService.launch(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Health Check ====================

app.get('/api/health-check', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const report = await HealthCheckService.checkHealth(config.masterSkillsDir);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/health-check/fix', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const report = await HealthCheckService.checkHealth(config.masterSkillsDir);
    const result = await HealthCheckService.fixBrokenJunctions(report);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/health-check/ignore', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const list = await HealthCheckService.readIgnoreFile(config.masterSkillsDir);
    res.json({ entries: list });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/health-check/ignore', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const { entries } = req.body as { entries: string[] };
    await HealthCheckService.writeIgnoreFile(config.masterSkillsDir, entries || []);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Recycle Bin ====================

app.get('/api/recycle-bin', async (req, res) => {
  try {
    const list = await RecycleBinService.list();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Batch restore multiple backups at once (placed before :name routes to avoid shadowing)
app.post('/api/recycle-bin/batch-restore', async (req, res) => {
  const { names } = req.body as { names?: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names must be a non-empty array' });
  }
  try {
    const config = await ConfigService.getConfig();
    const result = await RecycleBinService.batchRestore(names, config.masterSkillsDir);
    res.json({
      restored: result.restored.length,
      failed: result.failed.length,
      restoredItems: result.restored,
      failedItems: result.failed,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/recycle-bin/:name/restore', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const targetDir = path.join(config.masterSkillsDir, req.params.name.split('_')[0]);
    const result = await RecycleBinService.restore(req.params.name, targetDir);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/recycle-bin/:name', async (req, res) => {
  try {
    const result = await RecycleBinService.purge(req.params.name);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/recycle-bin', async (req, res) => {
  try {
    const result = await RecycleBinService.purgeAll();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/recycle-bin/stats', async (req, res) => {
  try {
    const stats = await RecycleBinService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Tool Registry ====================

app.get('/api/tool-registry', async (req, res) => {
  try {
    const registry = await ToolRegistryService.getRegistry();
    const tools = await ToolRegistryService.detectInstalled(registry.tools);
    res.json({ tools, fetchedAt: registry.fetchedAt, source: registry.source });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/tool-registry/refresh', async (req, res) => {
  try {
    const registry = await ToolRegistryService.fetchRegistry();
    const tools = await ToolRegistryService.detectInstalled(registry.tools);
    res.json({ tools, fetchedAt: registry.fetchedAt });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/tool-registry/installed', async (req, res) => {
  try {
    const tools = await ToolRegistryService.detectInstalled();
    res.json(tools.filter(t => t.installed));
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/tool-registry/stats', async (req, res) => {
  try {
    const stats = await ToolRegistryService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Verify (Content Hash) ====================

app.get('/api/sync/verify', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const report = await VerifyService.verifyAll(config.masterSkillsDir);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/sync/verify/:platformId', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const adapter = getAdapter(req.params.platformId);
    if (!adapter) {
      res.status(404).json({ error: 'Platform not found' });
      return;
    }
    const report = await VerifyService.verifyPlatform(
      req.params.platformId,
      adapter.getSkillsDir(),
      config.masterSkillsDir
    );
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Registry Index ====================

app.get('/api/registry', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    let registry = await RegistryService.getRegistry(config.masterSkillsDir);
    if (!registry) {
      registry = await RegistryService.buildRegistry(config.masterSkillsDir);
    }
    res.json(registry);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/registry/rebuild', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const registry = await RegistryService.buildRegistry(config.masterSkillsDir);
    res.json(registry);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/registry/stats', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const stats = await RegistryService.getStats(config.masterSkillsDir);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Categories & Tags ====================

app.get('/api/categories', (req, res) => {
  res.json(CategoryService.getCategories());
});

app.post('/api/skills/:name/tags', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const { tag } = req.body as { tag: string };
    const result = await RegistryService.addTag(config.masterSkillsDir, req.params.name, tag);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/skills/:name/tags/:tag', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const result = await RegistryService.removeTag(config.masterSkillsDir, req.params.name, req.params.tag);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Install / Uninstall / Update ====================

app.post('/api/skills/install', async (req, res) => {
  try {
    const result = await InstallService.install(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.delete('/api/skills/:name', async (req, res) => {
  try {
    const result = await InstallService.uninstall(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/skills/:name/update', async (req, res) => {
  try {
    const { source } = req.body as { source?: string };
    const result = await InstallService.update(req.params.name, source);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/skills/:name/versions', async (req, res) => {
  try {
    const result = await InstallService.getVersions(req.params.name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Metadata Validation ====================

app.get('/api/metadata/validate-all', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const ignoreList = await HealthCheckService.readIgnoreFile(config.masterSkillsDir);
    const results = await OptimizeService.validateAll(config.masterSkillsDir, ignoreList);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/metadata/fix', async (req, res) => {
  try {
    const { skillPath } = req.body as { skillPath: string };
    const result = await OptimizeService.fixMetadata(skillPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== TRACE Quality ====================

app.get('/api/quality/trace', async (req, res) => {
  try {
    const skillPath = req.query.path as string;
    if (!skillPath) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }
    const report = await LintService.analyzeSkill(skillPath);
    res.json(report.trace);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Quality trend across all snapshots of a skill (time-series of TRACE scores)
app.get('/api/quality/trend/:skillName', async (req, res) => {
  try {
    const skillPath = await findSkillPathByName(req.params.skillName);
    if (!skillPath) {
      return res.status(404).json({ error: `Skill "${req.params.skillName}" not found` });
    }
    const trend = await VersionService.getQualityTrend(skillPath);
    res.json({ trend });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Incremental Sync ====================

app.post('/api/sync/incremental', async (req, res) => {
  try {
    const report = await SyncService.incrementalSync();
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Full / Link / Compare Sync ====================

// Full sync: regenerate and execute link plans for every installed non-universal platform
app.post('/api/sync/full', async (req, res) => {
  try {
    const config = await ConfigService.getConfig();
    const all = getAllAdapters();
    const results: Array<{ platform: string; actions: number }> = [];
    for (const adapter of all) {
      if (adapter.readsFromUniversal) continue;
      const installed = await adapter.isInstalled();
      if (!installed) continue;
      const plan = await LinkerService.generateLinkPlan(
        adapter.getSkillsDir(), config.masterSkillsDir, adapter.id, false
      );
      await LinkerService.executeLinkPlan(plan);
      results.push({ platform: adapter.id, actions: plan.actions.length });
    }
    skillsCache = null;
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Link selected skills to a target platform (batch). Conflicts (real dirs) are reported back.
app.post('/api/sync/link', async (req, res) => {
  const { skillNames, platformId } = req.body as { skillNames?: string[]; platformId?: string };
  if (!platformId) return res.status(400).json({ error: 'platformId is required' });
  if (!Array.isArray(skillNames) || skillNames.length === 0) {
    return res.status(400).json({ error: 'skillNames must be a non-empty array' });
  }
  try {
    const config = await ConfigService.getConfig();
    const adapter = getAdapter(platformId);
    if (!adapter) return res.status(400).json({ error: 'Unknown platform' });

    if (adapter.readsFromUniversal) {
      return res.json({
        conflicts: [],
        linked: skillNames,
        skipped: [],
        message: 'Platform reads from universal directory, no link needed',
      });
    }

    const platformDir = adapter.getSkillsDir();
    const linked: string[] = [];
    const skipped: string[] = [];
    const conflicts: string[] = [];

    for (const rawName of skillNames) {
      const skillName = sanitizeSkillName(rawName);
      if (!skillName) { skipped.push(rawName); continue; }
      const sourcePath = path.join(config.masterSkillsDir, skillName);
      const targetPath = path.join(platformDir, skillName);

      if (!await fs.pathExists(sourcePath)) { skipped.push(skillName); continue; }

      const targetStat = await fs.lstat(targetPath).catch(() => null);
      if (targetStat && !JunctionUtils.isJunction(targetPath)) {
        // Real directory already lives in the platform — surface as a conflict
        conflicts.push(skillName);
        continue;
      }

      // Replace any existing (junction) target with a fresh link to master
      if (JunctionUtils.isJunction(targetPath)) await JunctionUtils.safeDeleteAsync(targetPath);
      await JunctionUtils.createJunction(sourcePath, targetPath);
      linked.push(skillName);
    }

    skillsCache = null;
    res.json({ conflicts, linked, skipped });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Compare a skill's SKILL.md content between master and a target platform
app.get('/api/sync/compare', async (req, res) => {
  const { platformId, skillName } = req.query as Record<string, string>;
  if (!platformId || !skillName) {
    return res.status(400).json({ error: 'platformId and skillName are required' });
  }
  const safeName = sanitizeSkillName(skillName);
  if (!safeName) return res.status(400).json({ error: 'Invalid skillName' });
  try {
    const config = await ConfigService.getConfig();
    const adapter = getAdapter(platformId);
    if (!adapter) return res.status(400).json({ error: 'Unknown platform' });

    const masterFile = path.join(config.masterSkillsDir, safeName, 'SKILL.md');
    const platformFile = path.join(adapter.getSkillsDir(), safeName, 'SKILL.md');
    const masterStat = await fs.lstat(masterFile).catch(() => null);
    const platformStat = await fs.lstat(platformFile).catch(() => null);
    const masterContent = masterStat ? await fs.readFile(masterFile, 'utf-8') : null;
    const platformContent = platformStat ? await fs.readFile(platformFile, 'utf-8') : null;

    res.json({
      master: masterContent,
      platform: platformContent,
      identical: masterContent === platformContent,
      // Aliases used by the compare modal in the frontend
      hubContent: masterContent,
      hubModified: masterStat ? masterStat.mtime.toISOString() : null,
      targetContent: platformContent,
      targetModified: platformStat ? platformStat.mtime.toISOString() : null,
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Sync Groups ====================

// List all sync groups
app.get('/api/sync/groups', async (req, res) => {
  try {
    res.json({ groups: await readSyncGroups() });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Create a new sync group
app.post('/api/sync/groups', async (req, res) => {
  const { name, skills, skillNames, platformIds } = req.body as {
    name?: string;
    skills?: string[];
    skillNames?: string[];
    platformIds?: string[];
  };
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const groups = await readSyncGroups();
    const skillList = Array.isArray(skills) ? skills : (Array.isArray(skillNames) ? skillNames : []);
    const newGroup: SyncGroup = {
      id: Date.now().toString(),
      name: name.trim(),
      skills: skillList.filter(Boolean),
      platformIds: Array.isArray(platformIds) ? platformIds : [],
      createdAt: new Date().toISOString(),
    };
    groups.push(newGroup);
    await writeSyncGroups(groups);
    res.json({ success: true, group: newGroup });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Delete a sync group by id
app.delete('/api/sync/groups/:id', async (req, res) => {
  try {
    const groups = await readSyncGroups();
    const filtered = groups.filter(g => g.id !== req.params.id);
    await writeSyncGroups(filtered);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Install (link) all skills in a group to a specific platform
app.post('/api/sync/groups/install', async (req, res) => {
  const { name, groupId, platformId } = req.body as { name?: string; groupId?: string; platformId?: string };
  if (!name && !groupId) return res.status(400).json({ error: 'name or groupId is required' });
  if (!platformId || !platformId.trim()) {
    return res.status(400).json({ error: 'platformId is required' });
  }
  try {
    const groups = await readSyncGroups();
    const group = groupId
      ? groups.find(g => g.id === groupId)
      : groups.find(g => g.name === name);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const config = await ConfigService.getConfig();
    const adapter = getAdapter(platformId);
    if (!adapter) return res.status(400).json({ error: 'Unknown platform' });

    const installed: Array<{ skill: string; platform: string }> = [];

    if (!adapter.readsFromUniversal) {
      const isPlatformInstalled = await adapter.isInstalled();
      if (isPlatformInstalled) {
        for (const rawName of group.skills) {
          const skillName = sanitizeSkillName(rawName);
          if (!skillName) continue;
          const sourcePath = path.join(config.masterSkillsDir, skillName);
          const targetPath = path.join(adapter.getSkillsDir(), skillName);
          if (!await fs.pathExists(sourcePath)) continue;
          const targetStat = await fs.lstat(targetPath).catch(() => null);
          // Skip real directories (conflicts) — only replace/created junctions
          if (targetStat && !JunctionUtils.isJunction(targetPath)) continue;
          if (JunctionUtils.isJunction(targetPath)) await JunctionUtils.safeDeleteAsync(targetPath);
          await JunctionUtils.createJunction(sourcePath, targetPath);
          installed.push({ skill: skillName, platform: platformId });
        }
      }
    }

    skillsCache = null;
    res.json({ success: true, installed });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== AI-Driven Skill Generation ====================

// Get available skill templates
app.get('/api/ai/templates', async (_req, res) => {
  try {
    res.json({ templates: AiGenerateService.getTemplates() });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Generate a new skill
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { skillName, description, category, triggerKeywords, targetPlatforms, complexity, customInstructions } = req.body as {
      skillName?: string;
      description?: string;
      category?: string;
      triggerKeywords?: string[];
      targetPlatforms?: string[];
      complexity?: 'simple' | 'moderate' | 'advanced';
      customInstructions?: string;
    };
    if (!skillName || !description) {
      return res.status(400).json({ error: 'skillName and description are required' });
    }
    const result = await AiGenerateService.generateSkill({
      skillName,
      description,
      category,
      triggerKeywords,
      targetPlatforms,
      complexity,
      customInstructions,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// AI-optimize an existing skill
app.post('/api/ai/optimize', async (req, res) => {
  const { skillName } = req.body as { skillName?: string };
  if (!skillName) return res.status(400).json({ error: 'skillName is required' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const result = await AiGenerateService.optimizeWithAi(skillPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// Analyze a skill for optimization suggestions
app.get('/api/ai/analyze', async (req, res) => {
  const skillName = req.query.name as string;
  if (!skillName) return res.status(400).json({ error: 'name parameter is required' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const suggestions = await AiGenerateService.analyzeSkill(skillPath);
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Skill Manifest (skill.json) ====================

app.get('/api/manifest/:skillName', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const manifest = await SkillManifestService.read(skillPath);
    res.json({ manifest });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/manifest/:skillName', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const manifest = await SkillManifestService.create(skillPath, req.body as Partial<SkillManifest>);
    res.json({ success: true, manifest });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.put('/api/manifest/:skillName', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    await SkillManifestService.write(skillPath, req.body as SkillManifest);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/manifest/:skillName/validate', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const result = await SkillManifestService.validate(skillPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/manifest/:skillName/dependencies', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const deps = await SkillManifestService.getDependencies(skillPath);
    res.json({ dependencies: deps });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Security Gateway ====================

app.post('/api/security/gateway/check', async (req, res) => {
  const { skillName, policy } = req.body as { skillName?: string; policy?: Partial<SecurityPolicy> };
  if (!skillName) return res.status(400).json({ error: 'skillName is required' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const report: InstallSecurityReport = await SecurityGatewayService.preInstallCheck(skillPath, policy);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.get('/api/security/gateway/backdoors/:skillName', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const backdoors = await SecurityGatewayService.scanForBackdoors(skillPath);
    res.json({ backdoors });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

app.post('/api/security/gateway/sandbox/:skillName', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  const { permissions } = req.body as { permissions?: string[] };
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    const config = SecurityGatewayService.generateSandboxConfig(skillPath, permissions || []);
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Cache Management ====================

app.get('/api/cache/stats', (_req, res) => {
  res.json(CacheService.stats());
});

app.post('/api/cache/invalidate', (req, res) => {
  const { key, pattern } = req.body as { key?: string; pattern?: string };
  if (key) {
    CacheService.invalidate(key);
  } else if (pattern) {
    CacheService.invalidatePattern(pattern);
  } else {
    return res.status(400).json({ error: 'key or pattern is required' });
  }
  res.json({ success: true, stats: CacheService.stats() });
});

app.post('/api/cache/clear', (_req, res) => {
  CacheService.clear();
  res.json({ success: true });
});

// ==================== Security: Quarantine ====================

app.post('/api/security/gateway/quarantine/:skillName', async (req, res) => {
  const skillName = sanitizeSkillName(req.params.skillName);
  if (!skillName) return res.status(400).json({ error: 'Invalid skill name' });
  try {
    const skillPath = await findSkillPathByName(skillName);
    if (!skillPath) return res.status(404).json({ error: `Skill "${skillName}" not found` });
    await SecurityGatewayService.quarantine(skillPath);
    CacheService.invalidate('platforms');
    res.json({ success: true, message: 'Skill quarantined' });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Manifest: Find in Directory ====================

app.get('/api/manifests/scan', async (req, res) => {
  const dirPath = req.query.dir as string;
  if (!dirPath) return res.status(400).json({ error: 'dir parameter is required' });
  try {
    const manifests = await SkillManifestService.findInDir(dirPath);
    res.json({ manifests });
  } catch (error) {
    res.status(500).json({ error: sanitizeErrorMessage((error as Error).message) });
  }
});

// ==================== Global Error Handlers ====================
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});

app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  // Auto-clean recycle bin on startup (purge backups older than 30 days or exceeding size limit)
  try {
    const result = await RecycleBinService.autoClean();
    if (result.purged > 0) {
      console.log(`[recycle-bin] Auto-cleaned ${result.purged} backups, freed ${(result.freedBytes / 1024 / 1024).toFixed(1)}MB`);
    }
  } catch {
    // Non-fatal: auto-clean failure should not block startup
  }
});
