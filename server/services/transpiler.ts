import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

/**
 * v1.0 格式翻译官（Format Translator）
 *
 * 核心架构：SKILL.md → [Parser] → IR → [Transpiler] → 目标格式
 * IR（中间表示）是平台无关的 Skill 数据结构，每种目标格式一个 Transpiler 插件。
 */

// ==================== IR（中间表示） ====================

export interface SkillIR {
  name: string;
  description: string;
  triggers: string[];
  globs: string[];
  alwaysApply: boolean;
  body: string;
  references: string[];
  version?: string;
  dependencies?: string[];
}

// ==================== Parser：SKILL.md → IR ====================

export class SkillParser {
  static async parse(skillPath: string): Promise<SkillIR> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillFile)) {
      throw new Error('SKILL.md not found');
    }

    const raw = await fs.readFile(skillFile, 'utf-8');
    const { data, content } = matter(raw);

    // 提取触发词
    const triggers: string[] = [];
    if (Array.isArray(data.triggers)) {
      triggers.push(...data.triggers);
    }
    if (data.description) {
      const triggerKeywords = ['当用户', '使用此', '使用本', '触发', '场景', 'when user', 'use when', 'use this'];
      const descLower = String(data.description).toLowerCase();
      for (const kw of triggerKeywords) {
        if (descLower.includes(kw.toLowerCase()) && !triggers.includes(kw)) {
          triggers.push(kw);
        }
      }
    }

    // 提取 globs（文件匹配模式）
    const globs: string[] = [];
    if (Array.isArray(data.globs)) {
      globs.push(...data.globs);
    } else if (typeof data.globs === 'string') {
      globs.push(data.globs);
    }

    // 提取引用文件
    const references: string[] = [];
    const refsDir = path.join(skillPath, 'references');
    if (await fs.pathExists(refsDir)) {
      const files = await fs.readdir(refsDir);
      references.push(...files.filter(f => !f.startsWith('.')));
    }

    return {
      name: data.name || path.basename(skillPath),
      description: data.description || '',
      triggers,
      globs,
      alwaysApply: Boolean(data.alwaysApply),
      body: content.trim(),
      references,
      version: data.version,
      dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
    };
  }
}

// ==================== Transpiler 接口 ====================

export interface Transpiler {
  targetFormat: string;
  fileExtension: string;
  transpile(ir: SkillIR): string;
}

// ==================== Cursor Transpiler (.mdc) ====================

export class CursorTranspiler implements Transpiler {
  targetFormat = 'cursor';
  fileExtension = '.mdc';

  transpile(ir: SkillIR): string {
    const frontmatter: Record<string, unknown> = {
      description: ir.description,
    };

    if (ir.globs.length > 0) {
      frontmatter.globs = ir.globs.join(',');
    }
    frontmatter.alwaysApply = ir.alwaysApply;

    let yaml = '---\n';
    for (const [key, val] of Object.entries(frontmatter)) {
      yaml += `${key}: ${typeof val === 'boolean' ? val : `"${val}"`}\n`;
    }
    yaml += '---\n\n';

    let body = '';
    if (ir.triggers.length > 0) {
      body += `# Triggers\n${ir.triggers.map(t => `- ${t}`).join('\n')}\n\n`;
    }
    body += ir.body;

    if (ir.references.length > 0) {
      body += `\n\n# References\n${ir.references.map(r => `- ${r}`).join('\n')}`;
    }

    return yaml + body;
  }
}

// ==================== Windsurf Transpiler (.windsurfrules) ====================

export class WindsurfTranspiler implements Transpiler {
  targetFormat = 'windsurf';
  fileExtension = '.windsurfrules';

  transpile(ir: SkillIR): string {
    let output = `# ${ir.name}\n\n`;

    if (ir.description) {
      output += `## Description\n${ir.description}\n\n`;
    }

    if (ir.triggers.length > 0) {
      output += `## Triggers\n${ir.triggers.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    if (ir.globs.length > 0) {
      output += `## File Patterns\n${ir.globs.map(g => `- \`${g}\``).join('\n')}\n\n`;
    }

    output += `## Rules\n${ir.body}\n`;

    if (ir.references.length > 0) {
      output += `\n## References\n${ir.references.map(r => `- ${r}`).join('\n')}`;
    }

    return output;
  }
}

// ==================== Copilot Transpiler (copilot-instructions.md) ====================

export class CopilotTranspiler implements Transpiler {
  targetFormat = 'copilot';
  fileExtension = 'copilot-instructions.md';

  transpile(ir: SkillIR): string {
    let output = `# Copilot Instructions: ${ir.name}\n\n`;

    if (ir.description) {
      output += `${ir.description}\n\n`;
    }

    if (ir.triggers.length > 0) {
      output += `## When to Use\n${ir.triggers.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    output += `## Instructions\n${ir.body}\n`;

    if (ir.references.length > 0) {
      output += `\n## Reference Files\n${ir.references.map(r => `- ${r}`).join('\n')}`;
    }

    return output;
  }
}

// ==================== Cline Transpiler (.clinerules) ====================

export class ClineTranspiler implements Transpiler {
  targetFormat = 'cline';
  fileExtension = '.clinerules';

  transpile(ir: SkillIR): string {
    let output = `# ${ir.name}\n\n`;

    if (ir.description) {
      output += `> ${ir.description}\n\n`;
    }

    if (ir.triggers.length > 0) {
      output += `## Trigger Conditions\n${ir.triggers.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    if (ir.globs.length > 0) {
      output += `## Applicable Files\n${ir.globs.map(g => `- \`${g}\``).join('\n')}\n\n`;
    }

    output += `## Rules\n${ir.body}\n`;

    if (ir.references.length > 0) {
      output += `\n## References\n${ir.references.map(r => `- ${r}`).join('\n')}`;
    }

    return output;
  }
}

// ==================== Transpiler Registry ====================

const TRANSPILERS: Record<string, Transpiler> = {
  cursor: new CursorTranspiler(),
  windsurf: new WindsurfTranspiler(),
  copilot: new CopilotTranspiler(),
  cline: new ClineTranspiler(),
};

// ==================== Transpile Service ====================

export class TranspileService {
  static getSupportedFormats(): string[] {
    return Object.keys(TRANSPILERS);
  }

  /** 将 SKILL.md 翻译为目标格式，返回翻译后的内容 */
  static async transpile(skillPath: string, targetFormat: string): Promise<{
    format: string;
    extension: string;
    content: string;
    ir: SkillIR;
  }> {
    const transpiler = TRANSPILERS[targetFormat];
    if (!transpiler) {
      throw new Error(`Unsupported target format: ${targetFormat}. Supported: ${Object.keys(TRANSPILERS).join(', ')}`);
    }

    const ir = await SkillParser.parse(skillPath);
    const content = transpiler.transpile(ir);

    return {
      format: transpiler.targetFormat,
      extension: transpiler.fileExtension,
      content,
      ir,
    };
  }

  /** 翻译并写入目标平台目录 */
  static async transpileAndInstall(skillPath: string, targetFormat: string, targetDir: string): Promise<{
    success: boolean;
    installedTo: string;
    content: string;
  }> {
    const result = await this.transpile(skillPath, targetFormat);
    const skillName = path.basename(skillPath);
    const fileName = skillName + result.extension;
    const fullPath = path.join(targetDir, fileName);

    await fs.ensureDir(targetDir);
    await fs.writeFile(fullPath, result.content, 'utf-8');

    return {
      success: true,
      installedTo: fullPath,
      content: result.content,
    };
  }

  /** 生成 diff 预览：对比原始 SKILL.md 和翻译后内容 */
  static async previewDiff(skillPath: string, targetFormat: string): Promise<{
    original: string;
    translated: string;
    format: string;
    extension: string;
    linesAdded: number;
    linesRemoved: number;
  }> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    const original = await fs.readFile(skillFile, 'utf-8');
    const result = await this.transpile(skillPath, targetFormat);

    // 简单的行级 diff 统计
    const origLines = original.split('\n');
    const newLines = result.content.split('\n');
    const maxLen = Math.max(origLines.length, newLines.length);
    let added = 0;
    let removed = 0;
    for (let i = 0; i < maxLen; i++) {
      if (i >= origLines.length) {
        added++;
      } else if (i >= newLines.length) {
        removed++;
      } else if (origLines[i] !== newLines[i]) {
        added++;
        removed++;
      }
    }

    return {
      original,
      translated: result.content,
      format: result.format,
      extension: result.extension,
      linesAdded: added,
      linesRemoved: removed,
    };
  }

  /** 反向收集：从平台特定格式文件解析回 SKILL.md 格式 */
  static async reverseParse(filePath: string, format: string): Promise<SkillIR> {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const skillName = fileName.replace(/\.(mdc|windsurfrules|clinerules)$/, '').replace(/^copilot-instructions-/, '');

    // 尝试解析 frontmatter（Cursor .mdc 格式）
    if (format === 'cursor' || fileName.endsWith('.mdc')) {
      try {
        const { data, content: body } = matter(content);
        return {
          name: data.name || skillName,
          description: data.description || '',
          triggers: [],
          globs: data.globs ? String(data.globs).split(',').map(g => g.trim()) : [],
          alwaysApply: Boolean(data.alwaysApply),
          body: body.trim(),
          references: [],
        };
      } catch {
        // fall through to generic parsing
      }
    }

    // 通用解析：从 Markdown 结构提取
    const lines = content.split('\n');
    let name = skillName;
    let description = '';
    let body = content;
    const triggers: string[] = [];
    const globs: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('# ') && !name) {
        name = line.replace('# ', '').trim();
      }
      if (line.startsWith('> ') && !description) {
        description = line.replace('> ', '').trim();
      }
      if (line.startsWith('## Description') || line.startsWith('## When to Use') || line.startsWith('## Trigger')) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          description = description || nextLine.trim();
        }
      }
      if (line.startsWith('- ')) {
        const item = line.replace('- ', '').trim();
        if (line.includes('`*') || line.includes('`.')) {
          globs.push(item.replace(/`/g, ''));
        } else {
          triggers.push(item);
        }
      }
    }

    // 提取 body（去掉标题和描述部分）
    const bodyStart = content.indexOf('## Rules') || content.indexOf('## Instructions');
    if (bodyStart > 0) {
      body = content.substring(bodyStart).replace(/^## (Rules|Instructions)\n/, '').trim();
    }

    return {
      name,
      description,
      triggers,
      globs,
      alwaysApply: false,
      body,
      references: [],
    };
  }

  /** 扫描平台目录，反向收集所有非 SKILL.md 格式的规则文件 */
  static async reverseCollect(dirPath: string): Promise<Array<{
    file: string;
    format: string;
    ir: SkillIR;
  }>> {
    const results: Array<{ file: string; format: string; ir: SkillIR }> = [];
    if (!await fs.pathExists(dirPath)) return results;

    const entries = await fs.readdir(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = await fs.lstat(fullPath).catch(() => null);
      if (!stat || stat.isDirectory()) continue;

      let format = '';
      if (entry.endsWith('.mdc')) format = 'cursor';
      else if (entry.endsWith('.windsurfrules')) format = 'windsurf';
      else if (entry.endsWith('.clinerules')) format = 'cline';
      else if (entry.startsWith('copilot-instructions')) format = 'copilot';

      if (format) {
        try {
          const ir = await this.reverseParse(fullPath, format);
          results.push({ file: fullPath, format, ir });
        } catch {
          // skip unparseable files
        }
      }
    }
    return results;
  }
}
