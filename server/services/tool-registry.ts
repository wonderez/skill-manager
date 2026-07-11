import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import axios from 'axios';
import type { PlatformAdapter, SkillSource, InstallResult } from './adapters';

const REGISTRY_CACHE_DIR = path.join(os.homedir(), '.skills_enhance_config');
const REGISTRY_CACHE_FILE = path.join(REGISTRY_CACHE_DIR, 'tool_registry.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SKILLS_HUB_RAW_URL = 'https://raw.githubusercontent.com/qufei1993/skills-hub/main/src-tauri/src/core/tool_adapters/mod.rs';

export interface ToolRegistryEntry {
  id: string;               // slugified ID
  displayName: string;
  relativeSkillsDir: string; // e.g. ".trae-cn/skills"
  relativeDetectDir: string; // e.g. ".trae-cn"
  installed: boolean;        // computed at runtime
}

export interface ToolRegistryFile {
  tools: ToolRegistryEntry[];
  fetchedAt: string;         // ISO timestamp
  source: string;
}

/**
 * Dynamic adapter generated from Tool Registry entries.
 * These are adapters NOT in the hardcoded ALL_ADAPTERS list.
 */
class DynamicAdapter implements PlatformAdapter {
  id: string;
  name: string;
  icon: string = '🔌';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;
  private skillsDir: string;
  private detectDir: string;

  constructor(entry: ToolRegistryEntry) {
    this.id = entry.id;
    this.name = entry.displayName;
    this.skillsDir = path.join(os.homedir(), entry.relativeSkillsDir);
    this.detectDir = path.join(os.homedir(), entry.relativeDetectDir);
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }

  async isInstalled(): Promise<boolean> {
    return fs.pathExists(this.detectDir);
  }

  async isSkillInstalled(skillName: string): Promise<boolean> {
    return fs.pathExists(path.join(this.skillsDir, skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    // Dynamic adapters use junction-based install (native-copy)
    const targetDir = path.join(this.skillsDir, source.name);
    try {
      await fs.ensureDir(this.skillsDir);
      if (source.localPath) {
        await fs.copy(source.localPath, targetDir);
      }
      return {
        success: true,
        method: 'native-copy',
        installedTo: targetDir,
        postInstallSteps: [`Restart ${this.name} to load the new skill.`],
      };
    } catch (err) {
      return {
        success: false,
        method: 'native-copy',
        installedTo: targetDir,
        postInstallSteps: [],
        error: (err as Error).message,
      };
    }
  }

  getPostInstallHint(): string {
    return `Restart ${this.name} to load the new skill.`;
  }
}

export class ToolRegistryService {
  /**
   * Fetch the tool_adapters/mod.rs from Skills Hub GitHub and parse it
   */
  static async fetchRegistry(): Promise<ToolRegistryFile> {
    const response = await axios.get(SKILLS_HUB_RAW_URL, {
      timeout: 15000,
      responseType: 'text',
    });
    const content = response.data as string;
    const tools = this.parseRustAdapters(content);

    const registryFile: ToolRegistryFile = {
      tools,
      fetchedAt: new Date().toISOString(),
      source: SKILLS_HUB_RAW_URL,
    };

    // Cache to file
    await fs.ensureDir(REGISTRY_CACHE_DIR);
    await fs.writeJson(REGISTRY_CACHE_FILE, registryFile, { spaces: 2 });

    return registryFile;
  }

  /**
   * Get cached registry (fetch if missing or stale)
   */
  static async getRegistry(forceRefresh: boolean = false): Promise<ToolRegistryFile> {
    if (!forceRefresh && await fs.pathExists(REGISTRY_CACHE_FILE)) {
      const cached = await fs.readJson(REGISTRY_CACHE_FILE) as ToolRegistryFile;
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return cached;
      }
    }

    try {
      return await this.fetchRegistry();
    } catch (err) {
      // If fetch fails and we have a cached version, use it
      if (await fs.pathExists(REGISTRY_CACHE_FILE)) {
        return await fs.readJson(REGISTRY_CACHE_FILE) as ToolRegistryFile;
      }
      throw new Error(`Failed to fetch tool registry: ${(err as Error).message}`, { cause: err });
    }
  }

  /**
   * Detect which tools from the registry are installed on this system
   */
  static async detectInstalled(tools?: ToolRegistryEntry[]): Promise<ToolRegistryEntry[]> {
    const registry = tools ? { tools, fetchedAt: '', source: '' } : await this.getRegistry();
    const entries = tools || registry.tools;

    const results: ToolRegistryEntry[] = [];
    for (const entry of entries) {
      const detectPath = path.join(os.homedir(), entry.relativeDetectDir);
      const installed = await fs.pathExists(detectPath);
      results.push({ ...entry, installed });
    }
    return results;
  }

  /**
   * Generate DynamicAdapter instances for tools NOT already covered by hardcoded adapters
   */
  static async injectAdapters(existingAdapterIds: Set<string>): Promise<DynamicAdapter[]> {
    const registry = await this.getRegistry();
    const installed = await this.detectInstalled(registry.tools);

    const dynamicAdapters: DynamicAdapter[] = [];
    for (const entry of installed) {
      if (!entry.installed) continue;
      if (existingAdapterIds.has(entry.id)) continue;

      // Check if the skillsDir is already covered by an existing adapter
      const skillsDirNormalized = entry.relativeSkillsDir.replace(/\\/g, '/').toLowerCase();
      if (existingAdapterIds.has(skillsDirNormalized)) continue;

      dynamicAdapters.push(new DynamicAdapter(entry));
    }

    return dynamicAdapters;
  }

  /**
   * Parse Rust source code to extract tool adapter definitions
   * The mod.rs file defines tools in default_tool_adapters() as:
   *   ToolAdapter {
   *     id: ToolId::VariantName,
   *     display_name: "Display Name",
   *     relative_skills_dir: ".some-dir/skills".into(),
   *     relative_detect_dir: ".some-dir".into(),
   *   },
   */
  static parseRustAdapters(source: string): ToolRegistryEntry[] {
    const tools: ToolRegistryEntry[] = [];

    // Match each ToolAdapter { ... } block
    const blockRegex = /ToolAdapter\s*\{([^}]+)\}/gs;
    const idRegex = /id:\s*ToolId::(\w+)/;
    const displayRegex = /display_name:\s*"([^"]+)"/;
    const skillsDirRegex = /relative_skills_dir:\s*"([^"]+)"/;
    const detectDirRegex = /relative_detect_dir:\s*"([^"]+)"/;

    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(source)) !== null) {
      const body = match[1];

      const idMatch = body.match(idRegex);
      const displayMatch = body.match(displayRegex);
      const skillsDirMatch = body.match(skillsDirRegex);
      const detectDirMatch = body.match(detectDirRegex);

      if (displayMatch && skillsDirMatch && detectDirMatch) {
        const variantName = idMatch ? idMatch[1] : displayMatch[1];
        const displayName = displayMatch[1];
        const relativeSkillsDir = skillsDirMatch[1];
        const relativeDetectDir = detectDirMatch[1];

        // Generate a slug ID from the variant name
        const id = variantName
          .replace(/([a-z])([A-Z])/g, '$1-$2')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '');

        tools.push({
          id,
          displayName,
          relativeSkillsDir,
          relativeDetectDir,
          installed: false,
        });
      }
    }

    // Deduplicate by relativeSkillsDir
    const seen = new Set<string>();
    const deduped = tools.filter(t => {
      const key = t.relativeSkillsDir.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped;
  }

  /**
   * Get registry statistics
   */
  static async getStats(): Promise<{
    totalTools: number;
    installedCount: number;
    fetchedAt: string | null;
  }> {
    const registry = await this.getRegistry();
    const installed = await this.detectInstalled(registry.tools);

    return {
      totalTools: registry.tools.length,
      installedCount: installed.filter(t => t.installed).length,
      fetchedAt: registry.fetchedAt || null,
    };
  }
}

export { DynamicAdapter };
