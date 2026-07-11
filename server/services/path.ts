import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ConfigService, type ManagedPathInfo } from './config';

/**
 * AI 软件目录自动发现服务。
 *
 * POTENTIAL_PATHS 覆盖所有主流 AI agent 软件的 skills 目录，
 * 数据来源：agentskill.sh 官方目录参考 + 本地用户文件夹扫描验证。
 *
 * 自定义路径：用户可通过 ConfigService.customPaths 添加额外扫描路径，
 * discoverPaths() 会合并内置路径与自定义路径。
 */

interface BuiltinPathEntry {
  path: string;
  platformName: string;
  isUniversal: boolean;
}

export class PathDiscoveryService {
  /**
   * 内置的潜在 skills 目录清单，每条路径携带平台名称和是否通用目录的元数据。
   */
  private static readonly POTENTIAL_PATHS: BuiltinPathEntry[] = [
    // ===== 通用用户目录（多个 AI 工具共享） =====
    { path: path.join(os.homedir(), '.agents', 'skills'), platformName: 'Agents (Universal)', isUniversal: true },

    // ===== 主流 CLI / IDE Agent =====
    { path: path.join(os.homedir(), '.claude', 'skills'), platformName: 'Claude Code', isUniversal: false },
    { path: path.join(os.homedir(), '.codex', 'skills'), platformName: 'Codex CLI', isUniversal: false },
    { path: path.join(os.homedir(), '.cursor', 'skills'), platformName: 'Cursor', isUniversal: false },
    { path: path.join(os.homedir(), '.windsurf', 'skills'), platformName: 'Windsurf', isUniversal: false },
    { path: path.join(os.homedir(), '.gemini', 'skills'), platformName: 'Gemini CLI', isUniversal: false },
    { path: path.join(os.homedir(), '.gemini', 'antigravity', 'skills'), platformName: 'Antigravity', isUniversal: false },

    // ===== Trae 系列（字节） =====
    { path: path.join(os.homedir(), '.trae', 'skills'), platformName: 'Trae', isUniversal: false },
    { path: path.join(os.homedir(), '.trae-cn', 'skills'), platformName: 'Trae CN', isUniversal: false },
    { path: path.join(os.homedir(), '.trae', 'builtin_skills'), platformName: 'Trae Built-in', isUniversal: false },
    { path: path.join(os.homedir(), '.trae-cn', 'builtin_skills'), platformName: 'Trae CN Built-in', isUniversal: false },

    // ===== Qoder 系列 =====
    { path: path.join(os.homedir(), '.qoderwork', 'skills'), platformName: 'Qoder Work', isUniversal: false },
    { path: path.join(os.homedir(), '.qoder', 'skills'), platformName: 'Qoder', isUniversal: false },

    // ===== OpenClaw =====
    { path: path.join(os.homedir(), '.openclaw', 'skills'), platformName: 'OpenClaw', isUniversal: false },
    { path: path.join(os.homedir(), '.openclaw', 'plugin-skills'), platformName: 'OpenClaw Plugins', isUniversal: false },

    // ===== VS Code 扩展形态 Agent =====
    { path: path.join(os.homedir(), '.cline', 'skills'), platformName: 'Cline', isUniversal: false },
    { path: path.join(os.homedir(), '.roo-code', 'skills'), platformName: 'Roo Code', isUniversal: false },

    // ===== 其他知名 Agent =====
    { path: path.join(os.homedir(), '.aider', 'skills'), platformName: 'Aider', isUniversal: false },
    { path: path.join(os.homedir(), '.goose', 'skills'), platformName: 'Goose', isUniversal: false },
    { path: path.join(os.homedir(), '.opencode', 'skills'), platformName: 'OpenCode', isUniversal: false },
    { path: path.join(process.env.APPDATA || '', 'amp', 'skills'), platformName: 'Amp', isUniversal: false },
    { path: path.join(os.homedir(), '.workbuddy', 'skills'), platformName: 'WorkBuddy', isUniversal: false },
    { path: path.join(os.homedir(), '.hermes', 'skills'), platformName: 'Hermes', isUniversal: false },
    { path: path.join(os.homedir(), '.qclaw', 'skills'), platformName: 'QClaw', isUniversal: false },

    // ===== GitHub Copilot =====
    { path: path.join(os.homedir(), '.github', 'copilot', 'skills'), platformName: 'GitHub Copilot', isUniversal: false },

    // ===== Windows AppData 特定路径 =====
    { path: path.join(process.env.APPDATA || '', 'Cursor', 'User', 'skills'), platformName: 'Cursor (AppData)', isUniversal: false },
    { path: path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'roovet.roo-cline', 'skills'), platformName: 'Roo Code (VS Code)', isUniversal: false },
    { path: path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'skills'), platformName: 'Cline (VS Code)', isUniversal: false },
    { path: path.join(process.env.APPDATA || '', 'Windsurf', 'User', 'skills'), platformName: 'Windsurf (AppData)', isUniversal: false },
    { path: path.join(process.env.APPDATA || '', 'Trae', 'User', 'skills'), platformName: 'Trae (AppData)', isUniversal: false },
    { path: path.join(process.env.APPDATA || '', 'Trae CN', 'User', 'skills'), platformName: 'Trae CN (AppData)', isUniversal: false },
  ];

  /**
   * 发现所有实际存在的 skills 目录（内置 + 自定义），返回带元数据的路径列表。
   */
  static async discoverPathsWithInfo(): Promise<ManagedPathInfo[]> {
    const results: ManagedPathInfo[] = [];
    const seen = new Set<string>();

    const checkAndAdd = async (entry: BuiltinPathEntry) => {
      const normalized = path.resolve(entry.path);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      const exists = await fs.pathExists(entry.path);
      results.push({
        path: normalized,
        platformName: entry.platformName,
        isUniversal: entry.isUniversal,
        isCustom: false,
        exists,
      });
    };

    // 1. 内置潜在路径
    for (const entry of this.POTENTIAL_PATHS) {
      await checkAndAdd(entry);
    }

    // 2. 用户自定义路径（从 customPaths 合并）
    try {
      const config = await ConfigService.getConfig();
      for (const p of config.customPaths || []) {
        const normalized = path.resolve(p);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        const exists = await fs.pathExists(p);
        results.push({
          path: normalized,
          platformName: 'Custom',
          isUniversal: false,
          isCustom: true,
          exists,
        });
      }
    } catch {
      // 配置读取失败时忽略自定义路径
    }

    return results;
  }

  /**
   * 兼容旧接口：仅返回路径字符串数组。
   */
  static async discoverPaths(): Promise<string[]> {
    const infos = await this.discoverPathsWithInfo();
    return infos.filter(i => i.exists).map(i => i.path);
  }
}
