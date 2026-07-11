import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface ManagedPathInfo {
  path: string;
  platformName: string;
  isUniversal: boolean;
  isCustom: boolean;
  exists: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export interface UserConfig {
  projects: ProjectInfo[];
  masterSkillsDir: string;
  clientPaths: string[];
  customPaths: string[];
  managedPaths: ManagedPathInfo[];
  theme: string;
  syncMode: 'manual' | 'auto';
  lastSyncTime?: number;
}

const USER_CONFIG_PATH = path.join(os.homedir(), '.skills_enhance_config.json');

export class ConfigService {
  private static config: UserConfig | null = null;

  static async getConfig(): Promise<UserConfig> {
    if (this.config) return this.config;

    if (await fs.pathExists(USER_CONFIG_PATH)) {
      const loaded = await fs.readJson(USER_CONFIG_PATH);
      if (!Array.isArray(loaded.customPaths)) loaded.customPaths = [];
      if (!Array.isArray(loaded.managedPaths)) loaded.managedPaths = [];
      if (!loaded.masterSkillsDir) loaded.masterSkillsDir = path.join(os.homedir(), '.agents', 'skills');
      if (!loaded.syncMode) loaded.syncMode = 'manual';
      this.config = loaded;
    } else {
      this.config = {
        projects: [],
        masterSkillsDir: path.join(os.homedir(), '.agents', 'skills'),
        clientPaths: [],
        customPaths: [],
        managedPaths: [],
        theme: 'dark',
        syncMode: 'manual',
      };
      await this.saveConfig(this.config);
    }

    return this.config!;
  }

  static async saveConfig(config: UserConfig): Promise<void> {
    this.config = config;
    await fs.writeJson(USER_CONFIG_PATH, config, { spaces: 2 });
  }

  /** 添加自定义扫描路径，自动去重与路径规范化 */
  static async addCustomPath(customPath: string): Promise<boolean> {
    const config = await this.getConfig();
    const normalized = path.resolve(customPath);
    if (config.customPaths.includes(normalized)) return false;
    config.customPaths.push(normalized);
    await this.saveConfig(config);
    return true;
  }

  /** 移除自定义扫描路径 */
  static async removeCustomPath(customPath: string): Promise<boolean> {
    const config = await this.getConfig();
    const normalized = path.resolve(customPath);
    const before = config.customPaths.length;
    config.customPaths = config.customPaths.filter(p => p !== normalized);
    const removed = config.customPaths.length < before;
    if (removed) await this.saveConfig(config);
    return removed;
  }

  /** 保存扫描到的所有受管路径（覆盖式） */
  static async saveManagedPaths(paths: ManagedPathInfo[]): Promise<void> {
    const config = await this.getConfig();
    config.managedPaths = paths;
    await this.saveConfig(config);
  }

  /** 获取已保存的受管路径 */
  static async getManagedPaths(): Promise<ManagedPathInfo[]> {
    const config = await this.getConfig();
    return config.managedPaths || [];
  }

  /** 更新单个受管路径（编辑平台名称等） */
  static async updateManagedPath(originalPath: string, updated: Partial<ManagedPathInfo>): Promise<boolean> {
    const config = await this.getConfig();
    const idx = config.managedPaths.findIndex(p => p.path === originalPath);
    if (idx === -1) return false;
    config.managedPaths[idx] = { ...config.managedPaths[idx], ...updated };
    await this.saveConfig(config);
    return true;
  }

  /** 删除单个受管路径（仅限 isCustom） */
  static async removeManagedPath(targetPath: string): Promise<boolean> {
    const config = await this.getConfig();
    const before = config.managedPaths.length;
    config.managedPaths = config.managedPaths.filter(p => p.path !== targetPath);
    const removed = config.managedPaths.length < before;
    if (removed) await this.saveConfig(config);
    return removed;
  }
}
