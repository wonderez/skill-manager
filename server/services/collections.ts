import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * 用户自定义技能合集（Collections）
 *
 * - 一个 Collection 是命名的技能分组，可包含备注、预设标签
 * - 数据存储于 ~/.skills_enhance_collections.json
 * - 用例：「日常写作栈」「数据分析套件」「安全审计包」一键加载
 */

export interface CollectionEntry {
  skillName: string;
  skillPath?: string;     // 若已锁定到具体路径，则保留
  addedAt: string;
  note?: string;
}

export interface Collection {
  id: string;             // slugified name
  name: string;
  description?: string;
  color?: string;         // 6位十六进制，无 #
  icon?: string;          // emoji
  skills: CollectionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionsFile {
  version: 1;
  collections: Collection[];
}

export class CollectionService {
  private static readonly FILE = path.join(os.homedir(), '.skills_enhance_collections.json');
  private static cache: CollectionsFile | null = null;

  private static async load(): Promise<CollectionsFile> {
    if (this.cache) return this.cache;
    if (!await fs.pathExists(this.FILE)) {
      this.cache = { version: 1, collections: [] };
      return this.cache;
    }
    try {
      const raw = await fs.readJson(this.FILE);
      if (!Array.isArray(raw.collections)) raw.collections = [];
      this.cache = raw as CollectionsFile;
    } catch {
      this.cache = { version: 1, collections: [] };
    }
    return this.cache;
  }

  private static async save(): Promise<void> {
    if (!this.cache) return;
    this.cache.collections.sort((a, b) => a.name.localeCompare(b.name));
    await fs.writeJson(this.FILE, this.cache, { spaces: 2 });
  }

  private static slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
  }

  static async list(): Promise<Collection[]> {
    const data = await this.load();
    return data.collections;
  }

  static async create(name: string, description?: string, color?: string, icon?: string): Promise<Collection> {
    const data = await this.load();
    const id = this.slugify(name) || `col-${Date.now()}`;
    if (data.collections.find(c => c.id === id || c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Collection "${name}" already exists`);
    }
    const now = new Date().toISOString();
    const col: Collection = {
      id, name, description, color, icon,
      skills: [],
      createdAt: now,
      updatedAt: now,
    };
    data.collections.push(col);
    await this.save();
    return col;
  }

  static async update(id: string, patch: Partial<Pick<Collection, 'name' | 'description' | 'color' | 'icon'>>): Promise<Collection> {
    const data = await this.load();
    const col = data.collections.find(c => c.id === id);
    if (!col) throw new Error(`Collection "${id}" not found`);
    if (patch.name !== undefined) col.name = patch.name;
    if (patch.description !== undefined) col.description = patch.description;
    if (patch.color !== undefined) col.color = patch.color;
    if (patch.icon !== undefined) col.icon = patch.icon;
    col.updatedAt = new Date().toISOString();
    await this.save();
    return col;
  }

  static async delete(id: string): Promise<{ removed: boolean }> {
    const data = await this.load();
    const idx = data.collections.findIndex(c => c.id === id);
    if (idx < 0) return { removed: false };
    data.collections.splice(idx, 1);
    await this.save();
    return { removed: true };
  }

  static async addSkill(id: string, skillName: string, skillPath?: string, note?: string): Promise<Collection> {
    const data = await this.load();
    const col = data.collections.find(c => c.id === id);
    if (!col) throw new Error(`Collection "${id}" not found`);
    if (!col.skills.find(s => s.skillName === skillName && s.skillPath === skillPath)) {
      col.skills.push({ skillName, skillPath, note, addedAt: new Date().toISOString() });
      col.updatedAt = new Date().toISOString();
      await this.save();
    }
    return col;
  }

  static async removeSkill(id: string, skillName: string, skillPath?: string): Promise<Collection> {
    const data = await this.load();
    const col = data.collections.find(c => c.id === id);
    if (!col) throw new Error(`Collection "${id}" not found`);
    col.skills = col.skills.filter(s => !(s.skillName === skillName && s.skillPath === skillPath));
    col.updatedAt = new Date().toISOString();
    await this.save();
    return col;
  }

  /** 一键导出 Collection 为 JSON 清单（用于分享、备份） */
  static async exportManifest(id: string): Promise<{ name: string; skills: Array<{ name: string; note?: string }> }> {
    const data = await this.load();
    const col = data.collections.find(c => c.id === id);
    if (!col) throw new Error(`Collection "${id}" not found`);
    return {
      name: col.name,
      skills: col.skills.map(s => ({ name: s.skillName, note: s.note })),
    };
  }

  /**
   * Import a collection manifest (as produced by exportManifest) and create a
   * new Collection from it. Useful for sharing a curated skill set.
   *
   * Accepts either an object `{ name, description?, color?, icon?, skills: [{ name, note? }] }`
   * or the legacy shape `{ name, skillNames: string[], platformIds?: string[] }`.
   */
  static async importCollection(data: unknown): Promise<Collection> {
    const manifest = data as {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
      skills?: Array<{ name: string; note?: string }>;
      skillNames?: string[];
      platformIds?: string[];
    };

    if (!manifest || typeof manifest !== 'object' || !manifest.name) {
      throw new Error('Invalid collection manifest: name is required');
    }

    const col = await this.create(
      manifest.name,
      manifest.description,
      manifest.color,
      manifest.icon
    );

    // Normalize both manifest shapes into a list of skill entries
    const skillEntries: Array<{ name: string; note?: string }> = Array.isArray(manifest.skills)
      ? manifest.skills.map(s => ({ name: s.name, note: s.note }))
      : Array.isArray(manifest.skillNames)
        ? manifest.skillNames.map(n => ({ name: n }))
        : [];

    for (const entry of skillEntries) {
      if (entry.name) {
        await this.addSkill(col.id, entry.name, undefined, entry.note);
      }
    }

    // Re-read to get the populated collection
    const fresh = await this.load();
    const populated = fresh.collections.find(c => c.id === col.id);
    return populated ?? col;
  }
}
