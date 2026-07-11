import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { CommandService } from './command';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Platform Adapter System
 * 
 * Each AI tool has its own way to discover, load, and activate Skills.
 * Simply copying a SKILL.md folder into another tool's directory does NOT work
 * because each platform requires specific "activation files" (manifests, configs, hooks).
 * 
 * This module provides per-platform adapters that understand:
 *   1. WHERE skills go for that platform
 *   2. HOW to properly install them (setup scripts, manifests, etc.)
 *   3. WHAT post-install steps are needed (restart, reload, update context files)
 */

export interface PlatformAdapter {
  id: string;
  name: string;
  icon: string;
  /** Discovery mechanism: how the platform finds skills */
  discoveryMethod: 'native-scan' | 'plugin-manifest' | 'context-file' | 'extension-config';
  /**
   * Whether this platform natively reads from ~/.agents/skills/ (the universal master dir).
   * If true, symlinking skills to its own directory is redundant — the platform already sees them.
   * The Sync & Optimize engine will skip "missing-in-platform" actions for such platforms.
   */
  readsFromUniversal: boolean;
  /** Where skills live on disk */
  getSkillsDir(): string;
  /** Check if this platform is installed on the system */
  isInstalled(): Promise<boolean>;
  /** 
   * Install a skill package to this platform using the CORRECT method.
   * Returns instructions for post-install steps.
   */
  install(source: SkillSource): Promise<InstallResult>;
  /** Check if a specific skill is already installed */
  isSkillInstalled(skillName: string): Promise<boolean>;
  /** Get post-install instructions for the user */
  getPostInstallHint(): string;
}

export interface SkillSource {
  type: 'github' | 'npm' | 'local' | 'collection';
  url?: string;          // GitHub URL or npm package name
  localPath?: string;    // Local path for already-cloned repos
  name: string;          // Human-readable name
  installCommand?: string; // e.g. "npx superpowers-zh"
}

export interface InstallResult {
  success: boolean;
  method: 'npx-installer' | 'git-clone-setup' | 'native-copy' | 'manual';
  installedTo: string;
  postInstallSteps: string[];
  error?: string;
}

// ==================== Claude Code Adapter ====================

class ClaudeCodeAdapter implements PlatformAdapter {
  id = 'claude-code';
  name = 'Claude Code';
  icon = '🤖';
  discoveryMethod = 'plugin-manifest' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.claude', 'skills');
  }

  async isInstalled() {
    // Check if .claude directory exists (indicates Claude Code is configured)
    return fs.pathExists(path.join(os.homedir(), '.claude'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    // Case 1: Has a dedicated installer command (e.g. superpowers, gstack)
    if (source.installCommand) {
      return this.runInstaller(source);
    }

    // Case 2: GitHub repo with setup script (e.g. gstack)
    if (source.type === 'github' && source.url) {
      return this.installFromGithub(source);
    }

    // Case 3: Local path — use native copy but warn about activation
    if (source.type === 'local' && source.localPath) {
      return this.installFromLocal(source);
    }

    return {
      success: false,
      method: 'manual',
      installedTo: '',
      postInstallSteps: ['This skill type requires manual installation.'],
      error: 'Unsupported source type'
    };
  }

  private async runInstaller(source: SkillSource): Promise<InstallResult> {
    try {
      CommandService.runCommand(source.installCommand!, { cwd: os.homedir(), stdio: 'inherit' });
      return {
        success: true,
        method: 'npx-installer',
        installedTo: this.getSkillsDir(),
        postInstallSteps: [
          'Restart Claude Code session or run /reload-plugins',
          'Verify by asking Claude to use the new skill'
        ]
      };
    } catch (error) {
      return {
        success: false,
        method: 'npx-installer',
        installedTo: '',
        postInstallSteps: [],
        error: `Installer failed: ${(error as Error).message}`
      };
    }
  }

  private async installFromGithub(source: SkillSource): Promise<InstallResult> {
    const targetDir = path.join(this.getSkillsDir(), source.name);
    
    try {
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }

      CommandService.git(['clone', '--single-branch', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });

      // Check if there's a setup script
      const setupScript = path.join(targetDir, 'setup');
      const setupSh = path.join(targetDir, 'setup.sh');
      const hasSetup = await fs.pathExists(setupScript) || await fs.pathExists(setupSh);

      if (hasSetup) {
        try {
          const scriptPath = await fs.pathExists(setupScript) ? setupScript : setupSh;
          CommandService.runCommand(scriptPath, { cwd: targetDir, stdio: 'ignore' });
        } catch {
          // Setup script failure is non-fatal
        }
      }

      // Check if it has a plugin manifest
      const hasPlugin = await fs.pathExists(path.join(targetDir, '.claude-plugin', 'plugin.json'));

      return {
        success: true,
        method: 'git-clone-setup',
        installedTo: targetDir,
        postInstallSteps: [
          hasPlugin ? 'Plugin detected. Run /reload-plugins in Claude Code.' : 'No plugin.json found. You may need to update CLAUDE.md manually.',
          'Restart Claude Code session to activate new skills.',
          hasSetup ? 'Setup script was executed automatically.' : ''
        ].filter(Boolean)
      };
    } catch (error) {
      return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: (error as Error).message };
    }
  }

  private async installFromLocal(source: SkillSource): Promise<InstallResult> {
    const targetDir = path.join(this.getSkillsDir(), source.name);
    try {
      await fs.copy(source.localPath!, targetDir);
      return {
        success: true,
        method: 'native-copy',
        installedTo: targetDir,
        postInstallSteps: [
          '⚠️ Copied files only. Claude Code may require a plugin.json to fully activate.',
          'Consider adding a .claude-plugin/plugin.json manifest.',
          'Restart Claude Code session or run /reload-plugins.'
        ]
      };
    } catch (error) {
      return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: (error as Error).message };
    }
  }

  getPostInstallHint() {
    return 'Restart Claude Code or run /reload-plugins to activate.';
  }
}

// ==================== Codex / Agents Adapter ====================

class CodexAdapter implements PlatformAdapter {
  id = 'codex';
  name = 'Codex';
  icon = '⚡';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;

  getSkillsDir() {
    return path.join(os.homedir(), '.codex', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.codex'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { cwd: os.homedir(), stdio: 'inherit' });
        return { success: true, method: 'npx-installer', installedTo: skillsDir, postInstallSteps: ['Skills are available immediately via native scanning.'] };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // Codex uses native scanning — simply placing SKILL.md folders works
    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Skills discovered automatically via native scan. No additional config needed.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Skills discovered automatically via native scan.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: ['Manual installation required.'], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Codex uses native scanning — skills are available immediately.';
  }
}

// ==================== Cursor Adapter ====================
// Cursor 官方 skills 目录为 ~/.cursor/skills/（参考 agentskill.sh 官方文档）。
// 旧版代码使用 skills-cursor 是历史遗留，现统一为标准路径。
class CursorAdapter implements PlatformAdapter {
  id = 'cursor';
  name = 'Cursor';
  icon = '📝';
  discoveryMethod = 'plugin-manifest' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.cursor', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.cursor'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    // Prefer dedicated installer
    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand + ' --tool cursor', { stdio: 'inherit' });
        return { success: true, method: 'npx-installer', installedTo: skillsDir, postInstallSteps: ['Start a new Cursor chat session to activate.'] };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return {
        success: true,
        method: 'git-clone-setup',
        installedTo: targetDir,
        postInstallSteps: [
          '⚠️ Cursor requires a plugin.json manifest for full activation.',
          'Start a new chat session for changes to take effect.'
        ]
      };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Start a new Cursor chat session to activate.';
  }
}

// ==================== Gemini CLI Adapter ====================

class GeminiAdapter implements PlatformAdapter {
  id = 'gemini';
  name = 'Gemini CLI';
  icon = '💎';
  discoveryMethod = 'extension-config' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.gemini'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { stdio: 'inherit' });
        return { success: true, method: 'npx-installer', installedTo: skillsDir, postInstallSteps: ['Gemini requires gemini-extension.json and GEMINI.md context files.', 'Verify in your project root.'] };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    if ((source.type === 'github' || source.type === 'local') && (source.url || source.localPath)) {
      const targetDir = path.join(skillsDir, source.name);
      if (source.type === 'github') {
        CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      } else {
        await fs.copy(source.localPath!, targetDir);
      }
      return {
        success: true,
        method: source.type === 'github' ? 'git-clone-setup' : 'native-copy',
        installedTo: targetDir,
        postInstallSteps: [
          '⚠️ Gemini CLI uses gemini-extension.json for skill discovery.',
          'You may need to configure GEMINI.md in your project root.',
          'Skills without extension config may not be auto-detected.'
        ]
      };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Gemini requires gemini-extension.json and GEMINI.md context files.';
  }
}

// ==================== Antigravity Adapter ====================
// Google Antigravity 是 Gemini 的 IDE 形态，skills 目录与 Gemini CLI 不同。
class AntigravityAdapter implements PlatformAdapter {
  id = 'antigravity';
  name = 'Antigravity';
  icon = '🪐';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.gemini', 'antigravity'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { stdio: 'inherit' });
        return { success: true, method: 'npx-installer', installedTo: skillsDir, postInstallSteps: ['Antigravity auto-detects skills on next session.'] };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Antigravity auto-detects skills. No additional config needed.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Antigravity auto-detects skills.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Antigravity auto-detects skills on next session.';
  }
}

// ==================== Windsurf Adapter ====================
// Windsurf（原 Codeium，被 OpenAI 收购）使用 ~/.windsurf/skills/。
class WindsurfAdapter implements PlatformAdapter {
  id = 'windsurf';
  name = 'Windsurf';
  icon = '🏄';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.windsurf', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.windsurf'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { stdio: 'inherit' });
        return { success: true, method: 'npx-installer', installedTo: skillsDir, postInstallSteps: ['Restart Windsurf session to activate.'] };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Restart Windsurf session to activate.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Restart Windsurf session to activate.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Restart Windsurf session to activate.';
  }
}

// ==================== GitHub Copilot Adapter ====================
// Copilot 仅支持项目级 skills（.github/copilot/skills/），无全局目录。
class CopilotAdapter implements PlatformAdapter {
  id = 'copilot';
  name = 'GitHub Copilot';
  icon = '🐙';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    // 项目级目录，使用当前工作目录下的 .github/copilot/skills
    // 全局扫描时返回用户主目录下的 .github/copilot/skills 作为 fallback
    return path.join(os.homedir(), '.github', 'copilot', 'skills');
  }

  async isInstalled() {
    // Copilot 通过 VS Code 扩展或 GitHub CLI 运行，检查 .github 目录
    return fs.pathExists(path.join(os.homedir(), '.github'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Reopen the Copilot session to activate.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Reopen the Copilot session to activate.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Reopen the Copilot session to activate.';
  }
}

// ==================== Cline Adapter ====================
// Cline（VS Code 扩展）使用 ~/.cline/skills/。
class ClineAdapter implements PlatformAdapter {
  id = 'cline';
  name = 'Cline';
  icon = '🦘';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.cline', 'skills');
  }

  async isInstalled() {
    // Cline 是 VS Code 扩展，检查 globalStorage 目录
    const vscodeStorage = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev');
    return fs.pathExists(path.join(os.homedir(), '.cline')) || fs.pathExists(vscodeStorage);
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Cline discovers skills via experimental flag. Restart session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Cline discovers skills via experimental flag. Restart session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Cline discovers skills via experimental flag. Restart session.';
  }
}

// ==================== Roo Code Adapter ====================
// Roo Code（Cline 分支）使用 ~/.roo-code/skills/。
class RooCodeAdapter implements PlatformAdapter {
  id = 'roo-code';
  name = 'Roo Code';
  icon = '🦘';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.roo-code', 'skills');
  }

  async isInstalled() {
    const vscodeStorage = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'roovet.roo-cline');
    return fs.pathExists(path.join(os.homedir(), '.roo-code')) || fs.pathExists(vscodeStorage);
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Restart Roo Code session to activate.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Restart Roo Code session to activate.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Restart Roo Code session to activate.';
  }
}

// ==================== Aider Adapter ====================
// Aider 使用 ~/.aider/skills/。
class AiderAdapter implements PlatformAdapter {
  id = 'aider';
  name = 'Aider';
  icon = '🤝';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.aider', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.aider'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Aider auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Aider auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Aider auto-detects skills on next session.';
  }
}

// ==================== Goose Adapter ====================
// Goose（Block 出品）使用 ~/.goose/skills/。
class GooseAdapter implements PlatformAdapter {
  id = 'goose';
  name = 'Goose';
  icon = '🪿';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.goose', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.goose'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Goose auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Goose auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Goose auto-detects skills on next session.';
  }
}

// ==================== OpenCode Adapter ====================
// OpenCode（开源）使用 ~/.opencode/skills/。
class OpenCodeAdapter implements PlatformAdapter {
  id = 'opencode';
  name = 'OpenCode';
  icon = '🔓';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.opencode', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.opencode'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['OpenCode auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['OpenCode auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'OpenCode auto-detects skills on next session.';
  }
}

// ==================== OpenClaw Adapter ====================
// OpenClaw 使用 ~/.openclaw/skills/ 与 ~/.openclaw/plugin-skills/。
class OpenClawAdapter implements PlatformAdapter {
  id = 'openclaw';
  name = 'OpenClaw';
  icon = '🦞';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;

  getSkillsDir() {
    return path.join(os.homedir(), '.openclaw', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.openclaw'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['OpenClaw auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['OpenClaw auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'OpenClaw auto-detects skills on next session.';
  }
}

// ==================== Trae Adapter ====================
// Trae（字节出品）使用 ~/.trae/skills/。
class TraeAdapter implements PlatformAdapter {
  id = 'trae';
  name = 'Trae';
  icon = '🚀';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.trae', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.trae'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Trae auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Trae auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Trae auto-detects skills on next session.';
  }
}

// ==================== Trae CN Adapter ====================
// Trae 国内版使用 ~/.trae-cn/skills/。
class TraeCnAdapter implements PlatformAdapter {
  id = 'trae-cn';
  name = 'Trae CN';
  icon = '🚀';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;

  getSkillsDir() {
    return path.join(os.homedir(), '.trae-cn', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.trae-cn'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Trae CN auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Trae CN auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Trae CN auto-detects skills on next session.';
  }
}

// ==================== Qoder Adapter ====================
// Qoder 使用 ~/.qoderwork/skills/（本地验证存在该目录）。
class QoderAdapter implements PlatformAdapter {
  id = 'qoder';
  name = 'Qoder';
  icon = '🔧';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;

  getSkillsDir() {
    return path.join(os.homedir(), '.qoderwork', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.qoderwork')) || fs.pathExists(path.join(os.homedir(), '.qoder'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Qoder auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Qoder auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Qoder auto-detects skills on next session.';
  }
}

// ==================== Amp Adapter ====================
// Amp 使用 ~/.config/amp/skills/。
class AmpAdapter implements PlatformAdapter {
  id = 'amp';
  name = 'Amp';
  icon = '⚡';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = false;

  getSkillsDir() {
    return path.join(os.homedir(), '.config', 'amp', 'skills');
  }

  async isInstalled() {
    return fs.pathExists(path.join(os.homedir(), '.config', 'amp'));
  }

  async isSkillInstalled(skillName: string) {
    return fs.pathExists(path.join(this.getSkillsDir(), skillName));
  }

  async install(source: SkillSource): Promise<InstallResult> {
    const skillsDir = this.getSkillsDir();
    await fs.ensureDir(skillsDir);

    if (source.type === 'github' && source.url) {
      const targetDir = path.join(skillsDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists` };
      }
      CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
      return { success: true, method: 'git-clone-setup', installedTo: targetDir, postInstallSteps: ['Amp auto-detects skills on next session.'] };
    }

    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(skillsDir, source.name);
      await fs.copy(source.localPath, targetDir);
      return { success: true, method: 'native-copy', installedTo: targetDir, postInstallSteps: ['Amp auto-detects skills on next session.'] };
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source' };
  }

  getPostInstallHint() {
    return 'Amp auto-detects skills on next session.';
  }
}

// ==================== Well-known Skill Packages ====================

export interface KnownPackage {
  name: string;
  description: string;
  type: 'collection' | 'single';
  platforms: string[];  // adapter IDs
  installCommands: Record<string, string>; // platform -> command
  githubUrl: string;
  tags: string[];
}

// Load KNOWN_PACKAGES from external config file
const PACKAGES_CONFIG_PATH = path.join(__dirname, '..', 'config', 'known_packages.json');

function loadKnownPackages(): KnownPackage[] {
  try {
    if (fs.existsSync(PACKAGES_CONFIG_PATH)) {
      const content = fs.readFileSync(PACKAGES_CONFIG_PATH, 'utf-8').replace(/^\uFEFF/, '');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Failed to load known_packages.json, using empty list:', err);
  }
  return [];
}

export const KNOWN_PACKAGES: KnownPackage[] = loadKnownPackages();

// ==================== WorkBuddy Adapter ====================
class WorkBuddyAdapter implements PlatformAdapter {
  id = 'workbuddy';
  name = 'WorkBuddy';
  icon = '💼';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;
  getSkillsDir() { return path.join(os.homedir(), '.workbuddy', 'skills'); }
  async isInstalled() { return fs.pathExists(path.join(os.homedir(), '.workbuddy')); }
  async isSkillInstalled(name: string) { return fs.pathExists(path.join(this.getSkillsDir(), name)); }
  async install(source: SkillSource): Promise<InstallResult> {
    const universalDir = path.join(os.homedir(), '.agents', 'skills');
    await fs.ensureDir(universalDir);

    // 如果有安装命令，优先使用
    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { cwd: os.homedir(), stdio: 'inherit' });
        return {
          success: true,
          method: 'npx-installer',
          installedTo: universalDir,
          postInstallSteps: ['Skill installed via installer. Platform reads universal directory automatically.']
        };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // GitHub 源：克隆到通用目录
    if (source.type === 'github' && source.url) {
      const targetDir = path.join(universalDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists in universal directory` };
      }
      try {
        CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
        return {
          success: true,
          method: 'git-clone-setup',
          installedTo: targetDir,
          postInstallSteps: ['Skill added to ~/.agents/skills/. Platform discovers it automatically via native scan.']
        };
      } catch (error) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // 本地路径：复制到通用目录
    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(universalDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists in universal directory` };
      }
      try {
        await fs.copy(source.localPath, targetDir);
        return {
          success: true,
          method: 'native-copy',
          installedTo: targetDir,
          postInstallSteps: ['Skill copied to ~/.agents/skills/. Platform discovers it automatically via native scan.']
        };
      } catch (error) {
        return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source type' };
  }
  getPostInstallHint() { return 'Skills in ~/.agents/skills/ are automatically discovered by WorkBuddy.'; }
}

// ==================== Hermes Adapter ====================
class HermesAdapter implements PlatformAdapter {
  id = 'hermes';
  name = 'Hermes';
  icon = '🕊️';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;
  getSkillsDir() { return path.join(os.homedir(), '.hermes', 'skills'); }
  async isInstalled() { return fs.pathExists(path.join(os.homedir(), '.hermes')); }
  async isSkillInstalled(name: string) { return fs.pathExists(path.join(this.getSkillsDir(), name)); }
  async install(source: SkillSource): Promise<InstallResult> {
    const universalDir = path.join(os.homedir(), '.agents', 'skills');
    await fs.ensureDir(universalDir);

    // 如果有安装命令，优先使用
    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { cwd: os.homedir(), stdio: 'inherit' });
        return {
          success: true,
          method: 'npx-installer',
          installedTo: universalDir,
          postInstallSteps: ['Skill installed via installer. Platform reads universal directory automatically.']
        };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // GitHub 源：克隆到通用目录
    if (source.type === 'github' && source.url) {
      const targetDir = path.join(universalDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists in universal directory` };
      }
      try {
        CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
        return {
          success: true,
          method: 'git-clone-setup',
          installedTo: targetDir,
          postInstallSteps: ['Skill added to ~/.agents/skills/. Platform discovers it automatically via native scan.']
        };
      } catch (error) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // 本地路径：复制到通用目录
    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(universalDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists in universal directory` };
      }
      try {
        await fs.copy(source.localPath, targetDir);
        return {
          success: true,
          method: 'native-copy',
          installedTo: targetDir,
          postInstallSteps: ['Skill copied to ~/.agents/skills/. Platform discovers it automatically via native scan.']
        };
      } catch (error) {
        return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source type' };
  }
  getPostInstallHint() { return 'Skills in ~/.agents/skills/ are automatically discovered by Hermes.'; }
}

// ==================== QClaw Adapter ====================
class QClawAdapter implements PlatformAdapter {
  id = 'qclaw';
  name = 'QClaw';
  icon = '🐾';
  discoveryMethod = 'native-scan' as const;
  readsFromUniversal = true;
  getSkillsDir() { return path.join(os.homedir(), '.qclaw', 'skills'); }
  async isInstalled() { return fs.pathExists(path.join(os.homedir(), '.qclaw')); }
  async isSkillInstalled(name: string) { return fs.pathExists(path.join(this.getSkillsDir(), name)); }
  async install(source: SkillSource): Promise<InstallResult> {
    const universalDir = path.join(os.homedir(), '.agents', 'skills');
    await fs.ensureDir(universalDir);

    // 如果有安装命令，优先使用
    if (source.installCommand) {
      try {
        CommandService.runCommand(source.installCommand!, { cwd: os.homedir(), stdio: 'inherit' });
        return {
          success: true,
          method: 'npx-installer',
          installedTo: universalDir,
          postInstallSteps: ['Skill installed via installer. Platform reads universal directory automatically.']
        };
      } catch (error) {
        return { success: false, method: 'npx-installer', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // GitHub 源：克隆到通用目录
    if (source.type === 'github' && source.url) {
      const targetDir = path.join(universalDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists in universal directory` };
      }
      try {
        CommandService.git(['clone', '--depth', '1', source.url!, targetDir], undefined, { stdio: 'ignore' });
        return {
          success: true,
          method: 'git-clone-setup',
          installedTo: targetDir,
          postInstallSteps: ['Skill added to ~/.agents/skills/. Platform discovers it automatically via native scan.']
        };
      } catch (error) {
        return { success: false, method: 'git-clone-setup', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    // 本地路径：复制到通用目录
    if (source.type === 'local' && source.localPath) {
      const targetDir = path.join(universalDir, source.name);
      if (await fs.pathExists(targetDir)) {
        return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: `"${source.name}" already exists in universal directory` };
      }
      try {
        await fs.copy(source.localPath, targetDir);
        return {
          success: true,
          method: 'native-copy',
          installedTo: targetDir,
          postInstallSteps: ['Skill copied to ~/.agents/skills/. Platform discovers it automatically via native scan.']
        };
      } catch (error) {
        return { success: false, method: 'native-copy', installedTo: '', postInstallSteps: [], error: (error as Error).message };
      }
    }

    return { success: false, method: 'manual', installedTo: '', postInstallSteps: [], error: 'Unsupported source type' };
  }
  getPostInstallHint() { return 'Skills in ~/.agents/skills/ are automatically discovered by QClaw.'; }
}

// ==================== Registry ====================

const ALL_ADAPTERS: PlatformAdapter[] = [
  new WorkBuddyAdapter(),
  new HermesAdapter(),
  new QClawAdapter(),
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new CursorAdapter(),
  new GeminiAdapter(),
  new AntigravityAdapter(),
  new WindsurfAdapter(),
  new CopilotAdapter(),
  new ClineAdapter(),
  new RooCodeAdapter(),
  new AiderAdapter(),
  new GooseAdapter(),
  new OpenCodeAdapter(),
  new OpenClawAdapter(),
  new TraeAdapter(),
  new TraeCnAdapter(),
  new QoderAdapter(),
  new AmpAdapter()
];

export function getAdapter(platformId: string): PlatformAdapter | undefined {
  return ALL_ADAPTERS.find(a => a.id === platformId);
}

export function getAllAdapters(): PlatformAdapter[] {
  return ALL_ADAPTERS;
}

export async function getInstalledPlatforms(): Promise<PlatformAdapter[]> {
  const results: PlatformAdapter[] = [];
  for (const adapter of ALL_ADAPTERS) {
    if (await adapter.isInstalled()) {
      results.push(adapter);
    }
  }
  return results;
}

