import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

/**
 * v3.0 智能市场与 MCP 融合（Smart Market + MCP Fusion）
 *
 * - 社区市场聚合：聚合 GitHub awesome-agent-skills / anthropics/skills 等元数据
 * - Skills + MCP 配对推荐："Works Well With" 关系图谱
 * - MCP Server 管理：管理 MCP Server 配置
 * - LLM 驱动优化：对 SKILL.md 进行语义优化
 * - Skill 依赖图：声明式依赖
 * - 安全审计增强：供应链安全扫描
 */

// ==================== 类型定义 ====================

export interface MarketSkill {
  name: string;
  author: string;
  description: string;
  githubUrl: string;
  stars: number;
  tags: string[];
  category: string;
  installCommand?: string;
  worksWellWith?: string[]; // 推荐配对的 MCP server 或 Skill
}

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

export interface McpConfig {
  servers: McpServer[];
}

export interface DependencyNode {
  name: string;
  dependencies: string[];
  installed: boolean;
}

export interface SecurityAuditResult {
  score: number;
  risks: Array<{
    level: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    message: string;
    file?: string;
  }>;
  passed: boolean;
}

// ==================== 市场聚合服务 ====================

// Community registry is populated dynamically via GitHub Search API.
// The hardcoded sample entries were removed to avoid shipping stale/fake data.
const COMMUNITY_REGISTRY: MarketSkill[] = [];

// MCP Server 推荐配对表
const MCP_RECOMMENDATIONS: Record<string, string[]> = {
  'filesystem': ['filesystem'],
  'git': ['git'],
  'github-api': ['github'],
  'puppeteer': ['puppeteer'],
  'fetch': ['fetch'],
  'sequential-thinking': ['sequential-thinking'],
};

export class MarketService {
  /** 搜索社区市场 */
  static search(query: string, category?: string): MarketSkill[] {
    let results = COMMUNITY_REGISTRY;

    if (category && category !== 'all') {
      results = results.filter(s => s.category === category);
    }

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.author.toLowerCase().includes(q)
      );
    }

    return results.sort((a, b) => b.stars - a.stars);
  }

  /** 获取分类列表 */
  static getCategories(): string[] {
    const cats = new Set(COMMUNITY_REGISTRY.map(s => s.category));
    return Array.from(cats).sort();
  }

  /** 获取推荐配对 */
  static getRecommendations(skillName: string): { mcpServers: string[]; relatedSkills: string[] } {
    const skill = COMMUNITY_REGISTRY.find(s => s.name === skillName);
    if (!skill) return { mcpServers: [], relatedSkills: [] };

    const mcpServers = new Set<string>();
    for (const w of skill.worksWellWith || []) {
      const mcps = MCP_RECOMMENDATIONS[w] || [];
      mcps.forEach(m => mcpServers.add(m));
    }

    const relatedSkills = COMMUNITY_REGISTRY
      .filter(s => s.name !== skillName && s.tags.some(t => skill.tags.includes(t)))
      .map(s => s.name);

    return {
      mcpServers: Array.from(mcpServers),
      relatedSkills,
    };
  }

  /** 获取市场统计 */
  static getStats(): { total: number; categories: number; topAuthors: Array<{ name: string; count: number }> } {
    const authors = new Map<string, number>();
    for (const skill of COMMUNITY_REGISTRY) {
      authors.set(skill.author, (authors.get(skill.author) || 0) + 1);
    }

    return {
      total: COMMUNITY_REGISTRY.length,
      categories: this.getCategories().length,
      topAuthors: Array.from(authors.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }
}

// ==================== GitHub 远程市场代理服务 ====================

/**
 * GitHubMarketService 通过 GitHub REST API 聚合社区 Agent Skills。
 *
 * - 排行榜 / 搜索 / 详情：直接代理 GitHub Search & Repos API
 * - 精选列表（curated）：基于 topics (claude-skills / ai-skills / agent-skills) 按星数排序
 * - 安全审计（audit）：委托本地 SecurityAuditService 扫描已安装的 skill 目录
 *
 * 文档：https://docs.github.com/en/rest/search
 * Base URL：https://api.github.com
 * 未鉴权时受 IP 限速 60/min，已实现 15 分钟内存缓存。
 */
export interface GitHubMarketItem {
  id: string;
  slug: string;
  name: string;
  source: string;
  sourceType?: string;
  installs: number;
  installUrl?: string;
  url?: string;
}

export interface GitHubMarketCuratedItem {
  name: string;
  fullName: string;
  description: string;
  url: string;
  stars: number;
  updatedAt: string;
}

export interface GitHubMarketDetail extends GitHubMarketItem {
  description?: string;
  readme?: string;
  author?: string;
  homepage?: string;
  topics?: string[];
  stars?: number;
  forks?: number;
  updatedAt?: string;
  audit?: {
    score?: number;
    issues?: Array<{ level: string; rule: string; message: string }>;
  };
}

/** Shape of a single GitHub repository object returned by the Search/Repos API. */
interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  stargazers_count: number;
  forks_count: number;
  clone_url: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  updated_at: string;
}

/** Shape of the GitHub Search API response. */
interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

export class GitHubMarketService {
  private static readonly GITHUB_API = 'https://api.github.com';
  private static cache = new Map<string, { ts: number; data: GitHubSearchResponse | GitHubRepo }>();
  private static readonly TTL_MS = 15 * 60 * 1000; // 15 mins cache for GitHub rate limits

  private static mapRepoToItem(repo: GitHubRepo): GitHubMarketItem {
    return {
      id: String(repo.id),
      slug: repo.name,
      name: repo.name,
      source: repo.owner?.login || 'unknown',
      sourceType: 'github',
      installs: repo.stargazers_count, // Use stars as "installs" for leaderboard ranking
      installUrl: repo.clone_url,
      url: repo.html_url
    };
  }

  /** Fetch Leaderboard from GitHub */
  static async leaderboard(view: 'all-time' | 'trending' | 'hot' = 'all-time', page = 1, perPage = 30): Promise<{ data: GitHubMarketItem[]; total: number; hasMore: boolean }> {
    // GitHub pagination is 1-indexed
    const pageNum = Math.max(1, page);
    // Search for repos with topics mcp-server or ai-skills
    const q = encodeURIComponent('topic:mcp-server OR topic:ai-skills OR topic:cline-skills');
    const sort = view === 'trending' ? 'updated' : 'stars';
    const url = `${this.GITHUB_API}/search/repositories?q=${q}&sort=${sort}&order=desc&per_page=${perPage}&page=${pageNum}`;
    const json = await this.fetchJson(url) as GitHubSearchResponse;
    const items = (json.items || []).map((repo: GitHubRepo) => this.mapRepoToItem(repo));
    return {
      data: items,
      total: json.total_count ?? 0,
      hasMore: items.length === perPage,
    };
  }

  /** Search GitHub */
  static async search(q: string, limit = 30): Promise<{ data: GitHubMarketItem[]; searchType: string }> {
    const query = encodeURIComponent(`${q} in:name,description,readme (topic:mcp-server OR topic:ai-skills OR topic:cline-skills)`);
    const url = `${this.GITHUB_API}/search/repositories?q=${query}&sort=stars&order=desc&per_page=${limit}`;
    const json = await this.fetchJson(url) as GitHubSearchResponse;
    return {
      data: (json.items || []).map((repo: GitHubRepo) => this.mapRepoToItem(repo)),
      searchType: 'github-search',
    };
  }

  /** Curated list — top repos tagged with skill-related topics, ranked by stars. */
  static async curated(): Promise<{ data: GitHubMarketCuratedItem[] }> {
    try {
      const q = encodeURIComponent('topic:claude-skills OR topic:ai-skills OR topic:agent-skills');
      const url = `${this.GITHUB_API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`;
      const json = await this.fetchJson(url) as GitHubSearchResponse;
      const data: GitHubMarketCuratedItem[] = (json.items || []).map((repo: GitHubRepo) => ({
        name: repo.name ?? '',
        fullName: repo.full_name ?? '',
        description: repo.description ?? '',
        url: repo.html_url ?? '',
        stars: repo.stargazers_count ?? 0,
        updatedAt: repo.updated_at ?? '',
      }));
      return { data };
    } catch {
      // API failure (rate limit / network) — degrade gracefully to empty list.
      return { data: [] };
    }
  }

  /** Detail view */
  static async detail(source: string, skill: string): Promise<GitHubMarketDetail> {
    const url = `${this.GITHUB_API}/repos/${encodeURIComponent(source)}/${encodeURIComponent(skill)}`;
    const repo = await this.fetchJson(url) as GitHubRepo;
    const item = this.mapRepoToItem(repo);
    return {
      ...item,
      description: repo.description ?? undefined,
      homepage: repo.homepage ?? undefined,
      topics: repo.topics,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      updatedAt: repo.updated_at
    };
  }

  /**
   * Security audit — delegates to the local SecurityAuditService.
   * Audits an already-installed skill directory identified by `skillPath`.
   */
  static async audit(skillPath: string): Promise<SecurityAuditResult> {
    return SecurityAuditService.audit(skillPath);
  }

  private static async fetchJson(url: string): Promise<GitHubSearchResponse | GitHubRepo> {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.ts < this.TTL_MS) return cached.data;

    const res = await fetch(url, {
      headers: { 
        'Accept': 'application/vnd.github.v3+json', 
        'User-Agent': 'SkillManager/5.2 (+https://github.com)' 
      },
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) throw new Error('GitHub API rate limit exceeded — please retry later');
      throw new Error(`GitHub API error ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    const data = await res.json() as GitHubSearchResponse | GitHubRepo;
    this.cache.set(url, { ts: Date.now(), data });
    return data;
  }
}

// ==================== MCP Server 管理服务 ====================

export class McpService {
  private static readonly MCP_CONFIG_PATH = path.join(os.homedir(), '.skills_enhance_mcp.json');

  static async getConfig(): Promise<McpConfig> {
    if (!await fs.pathExists(this.MCP_CONFIG_PATH)) {
      return { servers: [] };
    }
    return fs.readJson(this.MCP_CONFIG_PATH);
  }

  static async saveConfig(config: McpConfig): Promise<void> {
    await fs.writeJson(this.MCP_CONFIG_PATH, config, { spaces: 2 });
  }

  static async addServer(server: McpServer): Promise<{ added: boolean; servers: McpServer[] }> {
    const config = await this.getConfig();
    if (config.servers.find(s => s.name === server.name)) {
      return { added: false, servers: config.servers };
    }
    config.servers.push(server);
    await this.saveConfig(config);
    return { added: true, servers: config.servers };
  }

  static async removeServer(name: string): Promise<{ removed: boolean; servers: McpServer[] }> {
    const config = await this.getConfig();
    const before = config.servers.length;
    config.servers = config.servers.filter(s => s.name !== name);
    const removed = config.servers.length < before;
    if (removed) await this.saveConfig(config);
    return { removed, servers: config.servers };
  }

  static async toggleServer(name: string): Promise<{ enabled: boolean; servers: McpServer[] } | null> {
    const config = await this.getConfig();
    const server = config.servers.find(s => s.name === name);
    if (!server) return null;
    server.enabled = !server.enabled;
    await this.saveConfig(config);
    return { enabled: server.enabled, servers: config.servers };
  }

  /** 生成 Claude Code 格式的 MCP 配置 */
  static async generateClaudeMcpConfig(): Promise<string> {
    const config = await this.getConfig();
    const mcpServers: Record<string, unknown> = {};
    for (const server of config.servers.filter(s => s.enabled)) {
      mcpServers[server.name] = {
        command: server.command,
        args: server.args,
        ...(server.env ? { env: server.env } : {}),
      };
    }
    return JSON.stringify({ mcpServers }, null, 2);
  }
}

// ==================== LLM 驱动优化服务 ====================

export class LlmOptimizeService {
  /**
   * LLM 驱动的语义优化。
   * 当前为规则化增强版（不依赖外部 LLM API），后续可接入真实 LLM。
   */
  static async optimize(skillPath: string): Promise<{
    original: string;
    optimized: string;
    changes: Array<{ type: string; description: string }>;
  }> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillFile)) {
      throw new Error('SKILL.md not found');
    }

    const original = await fs.readFile(skillFile, 'utf-8');
    const changes: Array<{ type: string; description: string }> = [];

    const { data, content } = matter(original);

    // 1. 增强 description：添加触发场景关键词
    if (data.description && data.description.length < 100) {
      const enhanced = data.description.includes('当用户') || data.description.includes('use when')
        ? data.description
        : `${data.description} 当用户需要${data.name || '此技能'}时自动触发。`;
      if (enhanced !== data.description) {
        changes.push({
          type: 'description-enhance',
          description: 'Enhanced description with trigger keywords for better AI activation.',
        });
      }
      data.description = enhanced;
    }

    // 2. 补全 frontmatter 字段
    if (!data.version) {
      data.version = '1.0.0';
      changes.push({ type: 'version-add', description: 'Added version field (1.0.0).' });
    }

    // 3. 结构化 body：确保有 Instructions 和 Examples 章节
    let body = content;
    if (!body.includes('## Instructions') && !body.includes('## Summary')) {
      body = `## Instructions\n${body}\n\n## Examples\n- Add usage examples here to improve AI performance.`;
      changes.push({ type: 'structure-add', description: 'Added Instructions and Examples sections.' });
    }

    // 4. 添加最佳实践提示
    if (!body.includes('## Best Practices') && body.length < 2000) {
      body += '\n\n## Best Practices\n- Keep instructions concise and specific.\n- Use examples to guide AI behavior.\n- Reference external files for complex logic.';
      changes.push({ type: 'best-practices-add', description: 'Added Best Practices section.' });
    }

    // 5. 限制文件长度
    const lines = body.split('\n');
    if (lines.length > 500) {
      body = lines.slice(0, 500).join('\n') + '\n\n<!-- Content truncated. See references/ for additional details. -->';
      changes.push({ type: 'length-trim', description: 'Trimmed to 500 lines to reduce token consumption.' });
    }

    // 重新组装
    const optimized = matter.stringify(body, data);

    return { original, optimized, changes };
  }

  static async apply(skillPath: string, content: string): Promise<void> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    await fs.writeFile(skillFile, content, 'utf-8');
  }
}

// ==================== 依赖图服务 ====================

export class DependencyService {
  /** 解析 Skill 的依赖关系 */
  static async getDependencies(skillPath: string): Promise<DependencyNode[]> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillFile)) return [];

    const content = await fs.readFile(skillFile, 'utf-8');
    const { data } = matter(content);
    const deps = Array.isArray(data.dependencies) ? data.dependencies : [];

    const config = await (await import('./config')).ConfigService.getConfig();
    const nodes: DependencyNode[] = [];

    for (const dep of deps) {
      const depPath = path.join(config.masterSkillsDir, dep);
      nodes.push({
        name: dep,
        dependencies: [],
        installed: await fs.pathExists(depPath),
      });
    }

    return nodes;
  }

  /** 构建全局依赖图 */
  static async buildDependencyGraph(): Promise<Record<string, string[]>> {
    const config = await (await import('./config')).ConfigService.getConfig();
    const graph: Record<string, string[]> = {};

    if (!await fs.pathExists(config.masterSkillsDir)) return graph;

    const entries = await fs.readdir(config.masterSkillsDir);
    for (const entry of entries) {
      const depPath = path.join(config.masterSkillsDir, entry);
      const stat = await fs.lstat(depPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const skillFile = path.join(depPath, 'SKILL.md');
      if (!await fs.pathExists(skillFile)) continue;

      const content = await fs.readFile(skillFile, 'utf-8');
      let deps: string[];
      try {
        const { data } = matter(content);
        deps = Array.isArray(data.dependencies) ? data.dependencies : [];
      } catch {
        // Malformed YAML frontmatter — skip dependency extraction for this skill
        deps = [];
      }
      graph[entry] = deps;
    }

    return graph;
  }
}

// ==================== 安全审计增强服务 ====================

export class SecurityAuditService {
  /** 供应链安全扫描 */
  static async audit(skillPath: string): Promise<SecurityAuditResult> {
    const risks: SecurityAuditResult['risks'] = [];
    let score = 100;

    // 扫描所有文件
    const allFiles = await this.walkDir(skillPath);

    for (const filePath of allFiles) {
      const relPath = path.relative(skillPath, filePath);
      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');

      // 1. 检测恶意脚本模式
      const maliciousPatterns = [
        { pattern: /eval\s*\(\s*atob/gi, type: 'malicious-script', level: 'critical' as const, msg: 'Detected eval(atob()) pattern — potential obfuscated malware.' },
        { pattern: /child_process/gi, type: 'dangerous-import', level: 'high' as const, msg: 'Uses child_process — can execute arbitrary commands.' },
        { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/gi, type: 'dangerous-import', level: 'high' as const, msg: 'Requires child_process module.' },
        { pattern: /powershell\s+-enc/gi, type: 'encoded-command', level: 'critical' as const, msg: 'Uses PowerShell encoded command — potential evasion.' },
        { pattern: /curl\s+.*\|\s*(sh|bash)/gi, type: 'pipe-to-shell', level: 'critical' as const, msg: 'Pipes download to shell — remote code execution risk.' },
        { pattern: /wget\s+.*\|\s*(sh|bash)/gi, type: 'pipe-to-shell', level: 'critical' as const, msg: 'Pipes download to shell — remote code execution risk.' },
      ];

      for (const { pattern, type, level, msg } of maliciousPatterns) {
        if (pattern.test(content)) {
          risks.push({ level, type, message: msg, file: relPath });
          score -= level === 'critical' ? 40 : level === 'high' ? 20 : 10;
        }
      }

      // 2. 检测硬编码密钥
      const secretPatterns = [
        { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'OpenAI API Key' },
        { pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g, name: 'GitHub Token' },
        { pattern: /AKIA[A-Z0-9]{16}/g, name: 'AWS Access Key' },
        { pattern: /AIza[0-9A-Za-z\-_]{35}/g, name: 'Google API Key' },
      ];

      for (const { pattern, name } of secretPatterns) {
        if (pattern.test(content)) {
          risks.push({
            level: 'high',
            type: 'hardcoded-secret',
            message: `Detected ${name} — supply chain security risk.`,
            file: relPath,
          });
          score -= 20;
        }
      }

      // 3. 检测可疑的网络请求
      const networkPatterns = [
        { pattern: /https?:\/\/[\w\-.]+\.onion/gi, type: 'tor-hidden-service', level: 'high' as const, msg: 'References .onion address — potential dark web communication.' },
        { pattern: /https?:\/\/(?:127\.0\.0\.1|localhost):\d{4,5}/gi, type: 'local-service', level: 'low' as const, msg: 'References local service — may indicate testing or local exploitation.' },
      ];

      for (const { pattern, type, level, msg } of networkPatterns) {
        if (pattern.test(content)) {
          risks.push({ level, type, message: msg, file: relPath });
          score -= level === 'high' ? 15 : 5;
        }
      }

      // 4. 检测可疑文件类型
      const ext = path.extname(filePath).toLowerCase();
      if (['.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1'].includes(ext)) {
        risks.push({
          level: 'medium',
          type: 'suspicious-file',
          message: `Binary/script file detected: ${relPath}`,
          file: relPath,
        });
        score -= 10;
      }
    }

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      risks: risks.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.level] - order[b.level];
      }),
      passed: score >= 60 && !risks.some(r => r.level === 'critical'),
    };
  }

  /** 递归遍历目录 */
  private static async walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    if (!await fs.pathExists(dir)) return results;

    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry === '.snapshots' || entry === '.git') continue;
      const fullPath = path.join(dir, entry);
      const stat = await fs.lstat(fullPath);
      if (stat.isDirectory()) {
        results.push(...await this.walkDir(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }
}

export interface CliExtension {
  id: string;
  name: string;
  command: string;
  args: string[];
  description: string;
  installed: boolean;
}

export class CliService {
  private static readonly CLI_CONFIG_PATH = path.join(os.homedir(), '.skills_enhance_cli.json');

  static async getConfig(): Promise<{ extensions: CliExtension[] }> {
    if (!await fs.pathExists(this.CLI_CONFIG_PATH)) {
      return { extensions: [] };
    }
    return fs.readJson(this.CLI_CONFIG_PATH);
  }

  static async saveConfig(config: { extensions: CliExtension[] }): Promise<void> {
    await fs.writeJson(this.CLI_CONFIG_PATH, config, { spaces: 2 });
  }

  static async addExtension(ext: CliExtension): Promise<void> {
    const config = await this.getConfig();
    const existingIndex = config.extensions.findIndex(e => e.id === ext.id);
    if (existingIndex >= 0) {
      config.extensions[existingIndex] = ext;
    } else {
      config.extensions.push(ext);
    }
    await this.saveConfig(config);
  }

  static async removeExtension(id: string): Promise<void> {
    const config = await this.getConfig();
    config.extensions = config.extensions.filter(e => e.id !== id);
    await this.saveConfig(config);
  }

  static async launch(id: string): Promise<void> {
    const config = await this.getConfig();
    const ext = config.extensions.find(e => e.id === id);
    if (ext) {
      const { spawn } = await import('child_process');
      const cmdArgs = ['/c', 'start', 'cmd.exe', '/k', ext.command, ...(ext.args || [])];
      spawn('cmd.exe', cmdArgs, { detached: true, stdio: 'ignore' }).unref();
    }
  }
}
