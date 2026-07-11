import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { CategoryService } from './category';

export interface MetadataFieldStatus {
  present: boolean;
  valid: boolean;
}

export interface MetadataValidation {
  skillName: string;
  hasFrontmatter: boolean;
  fields: {
    name: MetadataFieldStatus;
    description: MetadataFieldStatus;
    version: MetadataFieldStatus;
    category: MetadataFieldStatus;
    source: MetadataFieldStatus;
    platforms: MetadataFieldStatus;
  };
  missingFields: string[];
  invalidFields: string[];
  suggestions: string[];
}

export class OptimizeService {
  /**
   * Optimize a SKILL.md: ensure frontmatter + core sections exist
   * Enhanced to include full 8-field metadata standard
   */
  static async optimizeSkill(skillPath: string): Promise<{ original: string; optimized: string }> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      throw new Error('SKILL.md not found');
    }

    const content = await fs.readFile(skillFile, 'utf-8');
    const skillName = path.basename(skillPath);
    let optimized = content;

    // Ensure YAML frontmatter exists with full standard
    if (!content.startsWith('---')) {
      const category = await CategoryService.classify(skillName, skillPath);
      optimized = this.generateFrontmatter(skillName, { category: category.category }) + '\n' + optimized;
    } else {
      // Parse existing frontmatter and fill missing fields
      try {
        const parsed = matter(content);
        const data = parsed.data || {};
        const patch: Record<string, unknown> = {};

        if (!data.name) patch.name = skillName;
        if (!data.description) patch.description = `Auto-generated description for ${skillName}`;
        if (!data.version) {
          // Try to extract version from directory name
          const versionMatch = skillName.match(/(\d+\.\d+\.\d+)$/);
          patch.version = versionMatch ? versionMatch[1] : '1.0.0';
        }
        if (!data.category) {
          const cat = await CategoryService.classify(skillName, skillPath);
          patch.category = cat.category;
        }
        if (!data.platforms) patch.platforms = [];
        if (!data.source) {
          // Try to read from .git config
          const gitDir = path.join(skillPath, '.git');
          if (await fs.pathExists(gitDir)) {
            try {
              const gitConfig = await fs.readFile(path.join(gitDir, 'config'), 'utf-8');
              const urlMatch = gitConfig.match(/url\s*=\s*(.+)/);
              if (urlMatch) patch.source = urlMatch[1].trim();
            } catch { /* ignore */ }
          }
        }

        if (Object.keys(patch).length > 0) {
          const newData = { ...data, ...patch };
          const newFrontmatter = this.generateFrontmatter(skillName, newData);
          optimized = newFrontmatter + '\n' + parsed.content;
        }
      } catch {
        // Invalid YAML, regenerate
        const category = await CategoryService.classify(skillName, skillPath);
        optimized = this.generateFrontmatter(skillName, { category: category.category }) + '\n' + content;
      }
    }

    // Ensure core sections exist
    const requiredSections = ['## Instructions', '## Examples'];
    requiredSections.forEach(section => {
      if (!optimized.includes(section)) {
        optimized += `\n\n${section}\n- Add details here to improve AI performance.`;
      }
    });

    // Ensure ## Limitations section (for TRACE completeness)
    if (!/##\s*(Limitations?|Constraints?|Caveats?|Notes?|注意事项|限制)/i.test(optimized)) {
      optimized += '\n\n## Limitations\n- Describe any constraints or edge cases here.';
    }

    return { original: content, optimized };
  }

  /**
   * Generate a YAML frontmatter block
   */
  private static generateFrontmatter(skillName: string, data: Record<string, unknown>): string {
    const lines: string[] = ['---'];
    lines.push(`name: ${data.name || skillName}`);
    if (data.description) lines.push(`description: "${data.description}"`);
    if (data.version) lines.push(`version: "${data.version}"`);
    if (data.category) lines.push(`category: ${data.category}`);
    if (data.source) lines.push(`source: "${data.source}"`);
    if (data.platforms) {
      if (Array.isArray(data.platforms) && data.platforms.length > 0) {
        lines.push(`platforms:`);
        for (const p of data.platforms) lines.push(`  - ${p}`);
      } else {
        lines.push(`platforms: []`);
      }
    }
    lines.push('---');
    return lines.join('\n');
  }

  static async applyOptimization(skillPath: string, content: string): Promise<void> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    await fs.writeFile(skillFile, content, 'utf-8');
  }

  /**
   * Validate metadata of a single skill
   */
  static async validateMetadata(skillPath: string): Promise<MetadataValidation> {
    const skillName = path.basename(skillPath);
    const skillFile = path.join(skillPath, 'SKILL.md');
    const result: MetadataValidation = {
      skillName,
      hasFrontmatter: false,
      fields: {
        name: { present: false, valid: false },
        description: { present: false, valid: false },
        version: { present: false, valid: false },
        category: { present: false, valid: false },
        source: { present: false, valid: false },
        platforms: { present: false, valid: false },
      },
      missingFields: [],
      invalidFields: [],
      suggestions: [],
    };

    if (!await fs.pathExists(skillFile)) {
      result.missingFields = ['name', 'description', 'version', 'category', 'source', 'platforms'];
      result.suggestions.push('SKILL.md not found. Create it with proper frontmatter.');
      return result;
    }

    const content = await fs.readFile(skillFile, 'utf-8');
    result.hasFrontmatter = content.startsWith('---');

    if (!result.hasFrontmatter) {
      result.missingFields = ['name', 'description', 'version', 'category', 'source', 'platforms'];
      result.suggestions.push('Add YAML frontmatter at the top of SKILL.md.');
      return result;
    }

    try {
      const { data } = matter(content);

      // name
      result.fields.name.present = !!data.name;
      result.fields.name.valid = typeof data.name === 'string' && data.name.length > 0;
      if (!result.fields.name.present) result.missingFields.push('name');
      else if (!result.fields.name.valid) result.invalidFields.push('name');

      // description
      result.fields.description.present = !!data.description;
      result.fields.description.valid = typeof data.description === 'string' && data.description.length >= 30;
      if (!result.fields.description.present) result.missingFields.push('description');
      else if (!result.fields.description.valid) {
        result.invalidFields.push('description');
        result.suggestions.push('description should be at least 30 characters with trigger keywords.');
      }

      // version
      result.fields.version.present = !!data.version;
      result.fields.version.valid = typeof data.version === 'string' && /^\d+\.\d+\.\d+$/.test(data.version);
      if (!result.fields.version.present) result.missingFields.push('version');
      else if (!result.fields.version.valid) result.invalidFields.push('version');

      // category
      result.fields.category.present = !!data.category;
      result.fields.category.valid = typeof data.category === 'string' && ['document', 'data', 'content', 'dev', 'productivity', 'api', 'system'].includes(data.category);
      if (!result.fields.category.present) result.missingFields.push('category');
      else if (!result.fields.category.valid) result.invalidFields.push('category');

      // source
      result.fields.source.present = !!data.source;
      result.fields.source.valid = typeof data.source === 'string' && (data.source.startsWith('http') || data.source.startsWith('git'));
      if (!result.fields.source.present) result.missingFields.push('source');

      // platforms
      result.fields.platforms.present = !!data.platforms;
      result.fields.platforms.valid = Array.isArray(data.platforms);
      if (!result.fields.platforms.present) result.missingFields.push('platforms');
      else if (!result.fields.platforms.valid) result.invalidFields.push('platforms');

    } catch {
      result.invalidFields.push('yaml');
      result.suggestions.push('Invalid YAML frontmatter. Check syntax.');
    }

    return result;
  }

  /**
   * Validate metadata for all skills in master dir
   */
  static async validateAll(masterDir: string, ignoreList: string[] = []): Promise<MetadataValidation[]> {
    const results: MetadataValidation[] = [];
    if (!await fs.pathExists(masterDir)) return results;

    const entries = await fs.readdir(masterDir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('_tmp_')) continue;
      if (ignoreList.includes(entry)) continue;

      const fullPath = path.join(masterDir, entry);
      const stat = await fs.lstat(fullPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      results.push(await this.validateMetadata(fullPath));
    }

    return results;
  }

  /**
   * Auto-fix metadata: add missing fields and sections
   */
  static async fixMetadata(skillPath: string): Promise<{ before: string; after: string }> {
    const { original, optimized } = await this.optimizeSkill(skillPath);
    await this.applyOptimization(skillPath, optimized);
    return { before: original, after: optimized };
  }
}
