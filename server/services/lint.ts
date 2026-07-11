import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

export type LintLevel = 'error' | 'warning' | 'info';

export interface LintIssue {
  id: string;
  level: LintLevel;
  rule: string;
  message: string;
  suggestion?: string;
  /** True when this issue's rule matches the user's audit whitelist (ignored). */
  ignored?: boolean;
}

export interface SkillMetrics {
  descLength: number;
  fileSize: number;       // Lines in SKILL.md
  refsCount: number;      // Number of files in references/
  hasFrontmatter: boolean;
  hasName: boolean;
  hasDescription: boolean;
}

export interface SkillHealthReport {
  score: number;                  // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: LintIssue[];
  metrics: SkillMetrics;
  trace?: TraceReport;
}

export interface TraceReport {
  completeness: number;       // 0-10
  triggerAccuracy: number;    // 0-10
  resourceRationality: number; // 0-10
  overallScore: number;       // weighted average (0-10)
  details: {
    hasInstructions: boolean;
    hasExamples: boolean;
    hasLimitations: boolean;
    descHasTrigger: boolean;
    descLength: number;
    hasReferences: boolean;
    refsCount: number;
    fileSize: number;
  };
}

const TRIGGER_KEYWORDS = [
  '当用户', '使用时', '用于', '触发', '场景',
  'when user', 'when the user', 'use this', 'use when',
];

const API_KEY_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'OpenAI sk-xxx', pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'AWS Access Key', pattern: /AKIA[A-Z0-9]{16}/g },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'Generic API Key', pattern: /[aA][pP][iI][_-]?[kK][eE][yY]\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/g },
];

const INTERNAL_URL_PATTERNS: RegExp[] = [
  /https?:\/\/[\w\-.]+\.alibaba-inc\.com/gi,
  /https?:\/\/[\w\-.]+\.taobao\.org/gi,
  /https?:\/\/[\w\-.]+\.alipay\.net/gi,
  /https?:\/\/(?:127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/gi,
];

const PASSWORD_PATTERNS: RegExp[] = [
  /(?:password|passwd|pwd|secret)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
];

const ISSUE_WEIGHTS: Record<LintLevel, number> = {
  error: 25,
  warning: 8,
  info: 2,
};

/**
 * Security audit whitelist — rules listed here are flagged as `ignored: true`
 * in analyzeSkill results. Stored as a plain JSON array at ~/.skills_audit_whitelist.json.
 */
const WHITELIST_PATH = path.join(os.homedir(), '.skills_audit_whitelist.json');

export class LintService {
  /** Read the whitelist rules (rule ids). Returns an empty array if absent. */
  static async getWhitelist(): Promise<string[]> {
    if (!await fs.pathExists(WHITELIST_PATH)) return [];
    try {
      const data = await fs.readJson(WHITELIST_PATH);
      return Array.isArray(data) ? data.filter((r: unknown) => typeof r === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Add a rule to the whitelist (idempotent). Returns the updated list. */
  static async addToWhitelist(rule: string): Promise<string[]> {
    const list = await this.getWhitelist();
    if (!rule || list.includes(rule)) return list;
    list.push(rule);
    await fs.writeJson(WHITELIST_PATH, list, { spaces: 2 });
    return list;
  }

  /** Remove a rule from the whitelist. Returns the updated list. */
  static async removeFromWhitelist(rule: string): Promise<string[]> {
    const list = await this.getWhitelist();
    const next = list.filter(r => r !== rule);
    await fs.writeJson(WHITELIST_PATH, next, { spaces: 2 });
    return next;
  }

  static async analyzeSkill(skillPath: string): Promise<SkillHealthReport> {
    const issues: LintIssue[] = [];
    const skillFile = path.join(skillPath, 'SKILL.md');

    const metrics: SkillMetrics = {
      descLength: 0,
      fileSize: 0,
      refsCount: 0,
      hasFrontmatter: false,
      hasName: false,
      hasDescription: false,
    };

    if (!await fs.pathExists(skillFile)) {
      issues.push({
        id: 'missing-skill-md',
        level: 'error',
        rule: 'skill-md-missing',
        message: 'SKILL.md 文件不存在',
        suggestion: '请在 Skill 目录下创建 SKILL.md 文件',
      });
      return { score: 0, grade: 'F', issues, metrics };
    }

    const content = await fs.readFile(skillFile, 'utf-8');
    const lines = content.split('\n').length;
    metrics.fileSize = lines;

    try {
      const { data } = matter(content);
      metrics.hasFrontmatter = true;
      metrics.hasName = !!data.name;
      metrics.hasDescription = !!data.description;
      metrics.descLength = data.description?.length || 0;

      // 1. Description Quality
      if (!data.description) {
        issues.push({
          id: 'no-description',
          level: 'error',
          rule: 'desc-missing',
          message: 'description 字段缺失',
          suggestion: '在 frontmatter 中添加 description 字段，描述 Skill 的用途和触发场景',
        });
      } else {
        if (data.description.length < 30) {
          issues.push({
            id: 'desc-short',
            level: 'warning',
            rule: 'desc-too-short',
            message: `description 过短（${data.description.length} 字符），AI 可能难以正确触发`,
            suggestion: 'description 建议 50-500 字符，清晰说明用途、触发场景和触发词',
          });
        }
        const descLower = data.description.toLowerCase();
        const hasTrigger = TRIGGER_KEYWORDS.some(kw => descLower.includes(kw.toLowerCase()));
        if (!hasTrigger) {
          issues.push({
            id: 'desc-no-trigger',
            level: 'info',
            rule: 'desc-no-trigger',
            message: 'description 缺少明确的触发场景描述',
            suggestion: '建议添加 "当用户..." / "use when..." 等触发词，提升 AI 触发准确率',
          });
        }
      }

      // 2. Structure Checks
      if (lines > 500) {
        issues.push({
          id: 'file-large',
          level: 'warning',
          rule: 'file-too-large',
          message: `SKILL.md 行数过多（${lines} 行），会大量消耗上下文 token`,
          suggestion: '建议控制在 500 行内，长内容拆到 references/ 目录按需引用',
        });
      }

      const refsDir = path.join(skillPath, 'references');
      if (await fs.pathExists(refsDir)) {
        const refs = await fs.readdir(refsDir);
        metrics.refsCount = refs.filter(f => !f.startsWith('.')).length;

        // Reference mentioning check
        const refMentions = content.matchAll(/references\/([a-zA-Z0-9_.-]+)/g);
        for (const m of refMentions) {
          const refFile = m[1];
          const refPath = path.join(refsDir, refFile);
          if (!await fs.pathExists(refPath)) {
            issues.push({
              id: 'ref-not-found',
              level: 'warning',
              rule: 'refs-not-found',
              message: `引用的文件 references/${refFile} 不存在`,
              suggestion: `创建该文件或更新 SKILL.md 中的引用路径`,
            });
          }
        }
      }

      // 3. Security Checks
      for (const { name, pattern } of API_KEY_PATTERNS) {
        pattern.lastIndex = 0;
        if (content.match(pattern)) {
          issues.push({
            id: 'security-api-key',
            level: 'error',
            rule: 'secret-api-key',
            message: `检测到疑似 ${name}，存在密钥泄露风险`,
            suggestion: '移除硬编码的密钥，使用环境变量或外部配置',
          });
        }
      }
      for (const pattern of PASSWORD_PATTERNS) {
        pattern.lastIndex = 0;
        if (content.match(pattern)) {
          issues.push({
            id: 'security-password',
            level: 'warning',
            rule: 'secret-password',
            message: '检测到疑似密码硬编码',
            suggestion: '避免在 Skill 中硬编码密码，使用环境变量或外部配置',
          });
        }
      }
      for (const pattern of INTERNAL_URL_PATTERNS) {
        pattern.lastIndex = 0;
        if (content.match(pattern)) {
          issues.push({
            id: 'security-internal-url',
            level: 'warning',
            rule: 'secret-internal-url',
            message: '检测到内网 URL，分享时可能泄露内部信息',
            suggestion: '如果需要公开分享，请将内网 URL 替换为占位符或外部链接',
          });
        }
      }

      // 4. Consistency Checks
      if (data.name) {
        const dirName = path.basename(skillPath);
        const dirNameNoVer = dirName.replace(/-\d+(\.\d+)*$/, '');
        if (data.name !== dirName && data.name !== dirNameNoVer) {
          issues.push({
            id: 'name-mismatch',
            level: 'warning',
            rule: 'name-mismatch',
            message: `name 字段（${data.name}）与目录名（${dirName}）不一致`,
            suggestion: '保持 name 与目录名一致，便于识别和检索',
          });
        }
      }

    } catch {
      issues.push({
        id: 'invalid-yaml',
        level: 'error',
        rule: 'yaml-invalid',
        message: 'Invalid YAML frontmatter',
        suggestion: 'Ensure the YAML block starts and ends with ---',
      });
    }

    // Apply the security audit whitelist — matching risk rules are flagged ignored.
    const whitelist = await this.getWhitelist();
    if (whitelist.length > 0) {
      for (const issue of issues) {
        if (whitelist.includes(issue.rule)) {
          issue.ignored = true;
        }
      }
    }

    const score = this.calculateScore(issues, metrics);
    const trace = await this.analyzeTrace(skillPath, content, metrics);
    return {
      score,
      grade: this.scoreToGrade(score),
      issues,
      metrics,
      trace,
    };
  }

  /**
   * TRACE-lite: Three-dimensional quality assessment
   * Completeness (0-10): Instructions + Examples + Limitations
   * TriggerAccuracy (0-10): Description has trigger keywords + sufficient length
   * ResourceRationality (0-10): File size reasonable + references valid
   */
  static async analyzeTrace(skillPath: string, content?: string, _metrics?: SkillMetrics): Promise<TraceReport> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!content) {
      if (!await fs.pathExists(skillFile)) {
        return {
          completeness: 0, triggerAccuracy: 0, resourceRationality: 0, overallScore: 0,
          details: { hasInstructions: false, hasExamples: false, hasLimitations: false, descHasTrigger: false, descLength: 0, hasReferences: false, refsCount: 0, fileSize: 0 },
        };
      }
      content = await fs.readFile(skillFile, 'utf-8');
    }

    const lines = content.split('\n').length;

    // Parse frontmatter for description
    let description = '';
    try {
      const { data } = matter(content);
      description = data.description || '';
    } catch {
      // invalid YAML
    }

    // Completeness checks (0-10): 4 + 3 + 3
    const hasInstructions = /##\s*(Instructions|Usage|How to Use|How\s*to)/i.test(content);
    const hasExamples = /##\s*(Examples?|Sample|Usage Examples?)|```[\s\S]*?```/i.test(content);
    const hasLimitations = /##\s*(Limitations?|Constraints?|Caveats?|Notes?|注意事项|限制)/i.test(content);
    const completeness = (hasInstructions ? 4 : 0) + (hasExamples ? 3 : 0) + (hasLimitations ? 3 : 0);

    // Trigger accuracy (0-10): 6 + 4
    const descLower = description.toLowerCase();
    const descHasTrigger = TRIGGER_KEYWORDS.some(kw => descLower.includes(kw.toLowerCase()));
    const descLength = description.length;
    const triggerAccuracy = (descHasTrigger ? 6 : 0) + (descLength >= 30 ? 4 : 0);

    // Resource rationality (0-10): 5 + 5
    const refsDir = path.join(skillPath, 'references');
    const hasReferences = await fs.pathExists(refsDir);
    const refsCount = hasReferences ? (await fs.readdir(refsDir)).filter(f => !f.startsWith('.')).length : 0;
    const fileSizeReasonable = lines <= 500;
    const resourceRationality = (fileSizeReasonable ? 5 : 0) + (hasReferences && refsCount > 0 ? 5 : 0);

    const overallScore = Math.round(((completeness + triggerAccuracy + resourceRationality) / 3) * 10) / 10;

    return {
      completeness,
      triggerAccuracy,
      resourceRationality,
      overallScore,
      details: {
        hasInstructions,
        hasExamples,
        hasLimitations,
        descHasTrigger,
        descLength,
        hasReferences,
        refsCount,
        fileSize: lines,
      },
    };
  }

  private static calculateScore(issues: LintIssue[], metrics: SkillMetrics): number {
    let score = 100;
    for (const issue of issues) {
      score -= ISSUE_WEIGHTS[issue.level] || 0;
    }
    if (!metrics.hasFrontmatter || !metrics.hasName || !metrics.hasDescription) {
      score = Math.min(score, 30);
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private static scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }
}
