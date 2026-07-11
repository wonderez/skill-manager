import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

export type CategoryId = 'document' | 'data' | 'content' | 'dev' | 'productivity' | 'api' | 'system' | 'uncategorized';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  nameEn: string;
  icon: string;
  keywords: string[];
  description: string;
}

export interface ClassificationResult {
  skillName: string;
  category: CategoryId;
  confidence: number;          // 0-1
  reason: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'document',
    name: '文档创作',
    nameEn: 'Document',
    icon: '📄',
    keywords: ['docx', 'pptx', 'pdf', 'html', 'report', 'deck', 'slide', 'presentation', 'word', 'excel', 'xlsx'],
    description: '文档/报告/演示文稿/表格生成',
  },
  {
    id: 'data',
    name: '数据分析',
    nameEn: 'Data',
    icon: '📊',
    keywords: ['data', 'chart', 'sql', 'csv', 'analysis', 'visualization', 'order', 'rfm', 'funnel', 'cohort', 'ltv', 'statistics'],
    description: '数据分析/可视化/SQL查询',
  },
  {
    id: 'content',
    name: '内容创作',
    nameEn: 'Content',
    icon: '✍️',
    keywords: ['content', 'video', 'script', 'mimeng', 'brainstorm', 'topic', 'subtitle', 'blog', 'article', 'seo', 'social', 'media'],
    description: '内容创作/视频脚本/自媒体',
  },
  {
    id: 'dev',
    name: '开发工具',
    nameEn: 'Dev',
    icon: '🛠️',
    keywords: ['git', 'code', 'chrome', 'extension', 'react', 'vercel', 'composition', 'codex', 'cli', 'mcp-builder', 'plugin', 'frontend', 'api'],
    description: '开发工具/Chrome扩展/MCP服务',
  },
  {
    id: 'productivity',
    name: '效率工具',
    nameEn: 'Productivity',
    icon: '⚡',
    keywords: ['email', 'doc', 'notion', 'obsidian', 'task', 'schedule', 'note', 'lark', 'feishu', 'wecom', 'calendar', 'reminder', 'tencent-docs', 'kdocs', 'youdao'],
    description: '效率工具/邮件/笔记/日程',
  },
  {
    id: 'api',
    name: 'API集成',
    nameEn: 'API',
    icon: '🔌',
    keywords: ['figma', 'qcc', 'tongdaxin', 'search', 'fetch', 'crawl', 'scraper', 'web-search', 'baidu', 'flyai', 'meituan', 'chengxin', 'weiyun', 'bdpan'],
    description: 'API集成/数据源/第三方服务',
  },
  {
    id: 'system',
    name: '系统管理',
    nameEn: 'System',
    icon: '⚙️',
    keywords: ['qclaw', 'env', 'rules', 'windows', 'agent', 'survival', 'skill-creator', 'config', 'setup', 'install', 'upgrade', 'memory', 'proactive', 'ontology', 'vm-error', 'feedback'],
    description: '系统管理/环境配置/Agent基础设施',
  },
];

export class CategoryService {
  /**
   * Classify a skill based on name, frontmatter, and content
   */
  static async classify(skillName: string, skillPath: string): Promise<ClassificationResult> {
    // 1. Check frontmatter category field first
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (await fs.pathExists(skillMdPath)) {
      try {
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const { data } = matter(content);

        if (data.category && typeof data.category === 'string') {
          const cat = data.category as CategoryId;
          if (CATEGORIES.some(c => c.id === cat)) {
            return {
              skillName,
              category: cat,
              confidence: 1.0,
              reason: 'Frontmatter category field',
            };
          }
        }
      } catch {
        // YAML parse failed, fall through to keyword matching
      }
    }

    // 2. Match by skill name keywords
    const nameLower = skillName.toLowerCase();
    for (const cat of CATEGORIES) {
      for (const keyword of cat.keywords) {
        if (nameLower.includes(keyword)) {
          return {
            skillName,
            category: cat.id,
            confidence: 0.8,
            reason: `Skill name matches keyword: "${keyword}"`,
          };
        }
      }
    }

    // 3. Match by content keywords (first 500 chars)
    if (await fs.pathExists(skillMdPath)) {
      try {
        const content = (await fs.readFile(skillMdPath, 'utf-8')).slice(0, 500).toLowerCase();
        for (const cat of CATEGORIES) {
          for (const keyword of cat.keywords) {
            if (content.includes(keyword)) {
              return {
                skillName,
                category: cat.id,
                confidence: 0.6,
                reason: `Content matches keyword: "${keyword}"`,
              };
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 4. Fallback
    return {
      skillName,
      category: 'uncategorized',
      confidence: 0,
      reason: 'No matching keywords found',
    };
  }

  /**
   * Get all category definitions
   */
  static getCategories(): CategoryDef[] {
    return CATEGORIES;
  }

  /**
   * Get a single category by ID
   */
  static getCategory(id: CategoryId): CategoryDef | undefined {
    return CATEGORIES.find(c => c.id === id);
  }

  /**
   * Batch classify all skills in a directory
   */
  static async classifyAll(masterDir: string, ignoreList: string[] = []): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();
    if (!await fs.pathExists(masterDir)) return results;

    const entries = await fs.readdir(masterDir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
      if (ignoreList.includes(entry)) continue;

      const fullPath = path.join(masterDir, entry);
      const stat = await fs.lstat(fullPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const result = await this.classify(entry, fullPath);
      results.set(entry, result);
    }

    return results;
  }
}
