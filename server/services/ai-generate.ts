import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { CategoryService } from './category';

/**
 * AI-Driven Skill Generation & Optimization Service
 *
 * This service provides structured skill generation using template-driven
 * patterns and heuristic analysis. It does NOT call external LLM APIs
 * (per AGENTS.md constraint on optimize.ts), but provides the interface
 * and scaffolding for AI-assisted skill creation.
 *
 * The generated content follows the SKILL.md standard with:
 * - Complete YAML frontmatter (name, description, version, category, etc.)
 * - Structured sections (Instructions, Examples, Limitations)
 * - Best-practice patterns from top-rated skills
 * - Trigger keyword optimization
 */

export interface SkillTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  triggerKeywords: string[];
  sections: { title: string; content: string }[];
  metadata: Record<string, unknown>;
}

export interface GenerationRequest {
  skillName: string;
  description: string;
  category?: string;
  triggerKeywords?: string[];
  targetPlatforms?: string[];
  complexity?: 'simple' | 'moderate' | 'advanced';
  customInstructions?: string;
}

export interface GenerationResult {
  skillName: string;
  content: string;
  manifest: {
    name: string;
    description: string;
    version: string;
    category: string;
    platforms: string[];
    triggerKeywords: string[];
  };
  suggestions: string[];
  qualityScore: number;
}

export interface OptimizationSuggestion {
  type: 'structure' | 'content' | 'metadata' | 'safety' | 'performance';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  fix?: string;
}

export class AiGenerateService {
  /**
   * Built-in skill templates organized by category
   */
  private static readonly TEMPLATES: SkillTemplate[] = [
    {
      id: 'document-processing',
      name: 'Document Processing Skill',
      category: 'document',
      description: 'Process, convert, and manipulate document files',
      triggerKeywords: ['document', 'pdf', 'docx', 'convert', 'extract', 'parse'],
      sections: [
        {
          title: '## Instructions',
          content: `- Read the input file and determine its format\n- Apply the appropriate processing pipeline\n- Output the result in the requested format\n- Handle errors gracefully with descriptive messages`,
        },
        {
          title: '## Examples',
          content: `- Input: report.pdf → Output: report.md (markdown conversion)\n- Input: data.xlsx → Output: data.json (structured data extraction)\n- Input: presentation.pptx → Output: slides/ (image extraction)`,
        },
        {
          title: '## Limitations',
          content: `- Maximum file size: 50MB\n- Does not support encrypted/password-protected files\n- OCR quality depends on input image resolution`,
        },
      ],
      metadata: { complexity: 'moderate', permissions: ['filesystem'] },
    },
    {
      id: 'data-analysis',
      name: 'Data Analysis Skill',
      category: 'data',
      description: 'Analyze, visualize, and interpret data datasets',
      triggerKeywords: ['analyze', 'data', 'statistics', 'chart', 'visualization', 'report'],
      sections: [
        {
          title: '## Instructions',
          content: `- Load and validate the input dataset\n- Perform exploratory data analysis (EDA)\n- Generate statistical summaries and visualizations\n- Identify trends, outliers, and correlations\n- Produce a structured analysis report`,
        },
        {
          title: '## Examples',
          content: `- Input: sales.csv → Output: Sales analysis with trend chart and key metrics\n- Input: survey.json → Output: Demographic breakdown with distribution charts\n- Input: logs.txt → Output: Error pattern analysis with frequency table`,
        },
        {
          title: '## Limitations',
          content: `- Requires structured or semi-structured input data\n- Maximum dataset size: 100K rows for in-memory processing\n- Visualization limited to 2D charts`,
        },
      ],
      metadata: { complexity: 'advanced', permissions: ['filesystem'] },
    },
    {
      id: 'content-creation',
      name: 'Content Creation Skill',
      category: 'content',
      description: 'Generate, transform, and optimize written content',
      triggerKeywords: ['write', 'content', 'article', 'blog', 'copy', 'optimize', 'rewrite'],
      sections: [
        {
          title: '## Instructions',
          content: `- Understand the target audience and tone\n- Research and gather relevant context\n- Draft content following the specified structure\n- Review and refine for clarity, engagement, and accuracy\n- Output in the requested format (markdown, HTML, plain text)`,
        },
        {
          title: '## Examples',
          content: `- Input: "product launch announcement" → Output: Press release with headline, body, and call-to-action\n- Input: "technical blog about APIs" → Output: 1500-word article with code examples\n- Input: "social media campaign" → Output: 10-post thread with hashtags`,
        },
        {
          title: '## Limitations',
          content: `- Cannot generate copyrighted content\n- Requires clear topic specification for quality output\n- Maximum output length: 5000 words per request`,
        },
      ],
      metadata: { complexity: 'moderate', permissions: [] },
    },
    {
      id: 'api-integration',
      name: 'API Integration Skill',
      category: 'api',
      description: 'Connect to, interact with, and orchestrate external APIs',
      triggerKeywords: ['api', 'integration', 'webhook', 'request', 'endpoint', 'rest', 'graphql'],
      sections: [
        {
          title: '## Instructions',
          content: `- Validate API credentials and connectivity\n- Map input parameters to API request format\n- Execute the API call with proper error handling\n- Parse and transform the response\n- Retry on transient failures with exponential backoff`,
        },
        {
          title: '## Examples',
          content: `- Input: GET /users/123 → Output: User profile JSON\n- Input: POST /webhooks/subscribe → Output: Subscription confirmation\n- Input: batch query → Output: Aggregated results with status codes`,
        },
        {
          title: '## Limitations',
          content: `- Requires valid API credentials in environment variables\n- Rate limiting: 100 requests/minute\n- Does not support streaming APIs (SSE/WebSocket)`,
        },
      ],
      metadata: { complexity: 'advanced', permissions: ['network'] },
    },
    {
      id: 'system-automation',
      name: 'System Automation Skill',
      category: 'system',
      description: 'Automate system tasks, file operations, and workflows',
      triggerKeywords: ['automate', 'system', 'file', 'batch', 'script', 'workflow', 'schedule'],
      sections: [
        {
          title: '## Instructions',
          content: `- Identify the automation target and trigger conditions\n- Execute operations with proper logging\n- Handle edge cases (missing files, permissions, conflicts)\n- Provide rollback capability for destructive operations\n- Report execution results`,
        },
        {
          title: '## Examples',
          content: `- Input: "organize downloads folder" → Output: Files sorted into category folders\n- Input: "backup config files" → Output: Timestamped backup archive\n- Input: "clean temp files" → Output: Deleted file count and freed space`,
        },
        {
          title: '## Limitations',
          content: `- Requires filesystem write permissions\n- Does not modify system registry or services\n- Maximum batch size: 1000 files per operation`,
        },
      ],
      metadata: { complexity: 'moderate', permissions: ['filesystem', 'process'] },
    },
    {
      id: 'productivity-tool',
      name: 'Productivity Tool Skill',
      category: 'productivity',
      description: 'Enhance productivity with task management and workflow tools',
      triggerKeywords: ['task', 'todo', 'schedule', 'reminder', 'productivity', 'organize', 'plan'],
      sections: [
        {
          title: '## Instructions',
          content: `- Parse the input command or task description\n- Create, update, or query tasks as needed\n- Apply priority and deadline rules\n- Generate a summary or action items list`,
        },
        {
          title: '## Examples',
          content: `- Input: "add task: review PR by Friday" → Output: Task created with deadline\n- Input: "show this week's priorities" → Output: Sorted task list\n- Input: "mark task #5 as done" → Output: Updated task status`,
        },
        {
          title: '## Limitations',
          content: `- Task storage is session-based unless persistent backend configured\n- Does not sync with external calendar apps\n- Maximum 1000 active tasks`,
        },
      ],
      metadata: { complexity: 'simple', permissions: ['filesystem'] },
    },
  ];

  /**
   * Get all available templates
   */
  static getTemplates(): SkillTemplate[] {
    return this.TEMPLATES;
  }

  /**
   * Get a template by ID
   */
  static getTemplate(id: string): SkillTemplate | null {
    return this.TEMPLATES.find(t => t.id === id) ?? null;
  }

  /**
   * Generate a new SKILL.md based on a request
   */
  static async generateSkill(req: GenerationRequest): Promise<GenerationResult> {
    const skillName = req.skillName.trim();
    const category = req.category || (await CategoryService.classify(skillName, '')).category;
    const template = this.findBestTemplate(category, req.description);
    const triggerKeywords = req.triggerKeywords || template?.triggerKeywords || [];
    const platforms = req.targetPlatforms || [];

    // Build frontmatter
    const frontmatter = this.buildFrontmatter({
      name: skillName,
      description: req.description,
      version: '1.0.0',
      category,
      platforms,
      triggerKeywords,
    });

    // Build content sections
    const sections: string[] = [frontmatter, ''];

    if (template) {
      for (const section of template.sections) {
        sections.push(section.title);
        sections.push(section.content);
        sections.push('');
      }
    } else {
      // Default structure when no template matches
      sections.push('## Instructions');
      sections.push(`- ${req.description}`);
      if (req.customInstructions) {
        sections.push(`- ${req.customInstructions}`);
      }
      sections.push('- Implement the core functionality with proper error handling');
      sections.push('');
      sections.push('## Examples');
      sections.push('- Input: [describe input] → Output: [describe output]');
      sections.push('');
      sections.push('## Limitations');
      sections.push('- Describe any constraints or edge cases here.');
      sections.push('');
    }

    // Add trigger keywords section if any
    if (triggerKeywords.length > 0) {
      sections.push('## Triggers');
      sections.push(`This skill activates when the conversation contains: ${triggerKeywords.join(', ')}`);
      sections.push('');
    }

    const content = sections.join('\n');
    const suggestions = this.generateSuggestions(req, template);
    const qualityScore = this.calculateQualityScore(content, triggerKeywords);

    return {
      skillName,
      content,
      manifest: {
        name: skillName,
        description: req.description,
        version: '1.0.0',
        category,
        platforms,
        triggerKeywords,
      },
      suggestions,
      qualityScore,
    };
  }

  /**
   * Analyze an existing skill and provide optimization suggestions
   */
  static async analyzeSkill(skillPath: string): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const skillFile = path.join(skillPath, 'SKILL.md');

    if (!await fs.pathExists(skillFile)) {
      suggestions.push({
        type: 'structure',
        severity: 'critical',
        message: 'SKILL.md file not found',
        fix: 'Create a SKILL.md file with proper frontmatter and instructions.',
      });
      return suggestions;
    }

    const content = await fs.readFile(skillFile, 'utf-8');
    const skillName = path.basename(skillPath);

    // Check frontmatter
    if (!content.startsWith('---')) {
      suggestions.push({
        type: 'metadata',
        severity: 'critical',
        message: 'Missing YAML frontmatter',
        fix: 'Add frontmatter with name, description, version, and category fields.',
      });
    } else {
      try {
        const { data } = matter(content);
        if (!data.name) {
          suggestions.push({ type: 'metadata', severity: 'warning', message: 'Missing "name" field in frontmatter' });
        }
        if (!data.description || (typeof data.description === 'string' && data.description.length < 30)) {
          suggestions.push({
            type: 'metadata',
            severity: 'warning',
            message: 'Description is too short (should be ≥30 characters for better AI triggering)',
            fix: 'Expand the description with trigger keywords and use cases.',
          });
        }
        if (!data.version) {
          suggestions.push({ type: 'metadata', severity: 'info', message: 'Missing "version" field', fix: 'Add version: "1.0.0"' });
        }
        if (!data.category) {
          suggestions.push({
            type: 'metadata',
            severity: 'info',
            message: 'Missing "category" field',
            fix: `Add category: "${(await CategoryService.classify(skillName, skillPath)).category}"`,
          });
        }
      } catch {
        suggestions.push({ type: 'metadata', severity: 'critical', message: 'Invalid YAML frontmatter syntax' });
      }
    }

    // Check sections
    const requiredSections = ['## Instructions', '## Examples'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        suggestions.push({
          type: 'structure',
          severity: 'warning',
          message: `Missing "${section}" section`,
          fix: `Add a "${section}" section with relevant content.`,
        });
      }
    }

    // Check for Limitations section
    if (!/##\s*(Limitations?|Constraints?|Caveats?)/i.test(content)) {
      suggestions.push({
        type: 'structure',
        severity: 'info',
        message: 'Missing "Limitations" section',
        fix: 'Add a "## Limitations" section to document edge cases and constraints.',
      });
    }

    // Content quality checks
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('#'));
    if (lines.length < 10) {
      suggestions.push({
        type: 'content',
        severity: 'warning',
        message: 'Content is too sparse (fewer than 10 non-empty lines)',
        fix: 'Add more detailed instructions and examples to improve AI performance.',
      });
    }

    // Check for trigger keywords in description
    if (content.startsWith('---')) {
      try {
        const { data } = matter(content);
        const desc = typeof data.description === 'string' ? data.description : '';
        const words = desc.toLowerCase().split(/\s+/);
        if (words.length < 5) {
          suggestions.push({
            type: 'content',
            severity: 'info',
            message: 'Description has too few keywords for reliable AI triggering',
            fix: 'Add 3-5 relevant trigger keywords to the description.',
          });
        }
      } catch { /* ignore */ }
    }

    // Safety checks
    if (/eval\s*\(/i.test(content) && /atob/i.test(content)) {
      suggestions.push({
        type: 'safety',
        severity: 'critical',
        message: 'Detected eval(atob()) pattern — potential obfuscated code',
        fix: 'Remove obfuscated code patterns for security.',
      });
    }

    if (/sk-[a-zA-Z0-9]{20,}/.test(content)) {
      suggestions.push({
        type: 'safety',
        severity: 'critical',
        message: 'Detected potential API key in skill content',
        fix: 'Remove hardcoded API keys and use environment variables instead.',
      });
    }

    return suggestions;
  }

  /**
   * Generate an optimized version of a skill based on analysis
   */
  static async optimizeWithAi(skillPath: string): Promise<{ original: string; optimized: string; suggestions: OptimizationSuggestion[] }> {
    const skillFile = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillFile)) {
      throw new Error('SKILL.md not found');
    }

    const original = await fs.readFile(skillFile, 'utf-8');
    const suggestions = await this.analyzeSkill(skillPath);
    const skillName = path.basename(skillPath);

    let optimized = original;

    // Apply fixes for critical and warning suggestions
    for (const suggestion of suggestions) {
      if (suggestion.severity === 'critical' || suggestion.severity === 'warning') {
        switch (suggestion.type) {
          case 'metadata':
            if (!optimized.startsWith('---')) {
              const cat = await CategoryService.classify(skillName, skillPath);
              const frontmatter = this.buildFrontmatter({
                name: skillName,
                description: `Skill for ${skillName}`,
                version: '1.0.0',
                category: cat.category,
                platforms: [],
                triggerKeywords: [],
              });
              optimized = frontmatter + '\n\n' + optimized;
            }
            break;
          case 'structure':
            if (suggestion.message.includes('Instructions') && !optimized.includes('## Instructions')) {
              optimized += '\n\n## Instructions\n- Add detailed instructions here.';
            }
            if (suggestion.message.includes('Examples') && !optimized.includes('## Examples')) {
              optimized += '\n\n## Examples\n- Input: [example] → Output: [result]';
            }
            if (suggestion.message.includes('Limitations') && !/##\s*Limitations/i.test(optimized)) {
              optimized += '\n\n## Limitations\n- Describe constraints and edge cases here.';
            }
            break;
          case 'content':
            // Enrich sparse content with structured guidance
            if (!optimized.includes('## Best Practices')) {
              optimized += '\n\n## Best Practices\n- Validate inputs before processing\n- Handle errors with descriptive messages\n- Log important operations for debugging';
            }
            break;
          case 'safety':
            // Remove dangerous patterns
            optimized = optimized.replace(/eval\s*\(\s*atob[^)]*\)/gi, '[removed obfuscated code]');
            optimized = optimized.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
            break;
        }
      }
    }

    // Enrich with trigger keywords if missing
    if (optimized.startsWith('---')) {
      try {
        const parsed = matter(optimized);
        if (!parsed.data.triggerKeywords && !parsed.data.triggers) {
          const keywords = this.extractKeywords(skillName, optimized);
          if (keywords.length > 0) {
            const newData: Record<string, unknown> = { ...parsed.data, triggerKeywords: keywords };
            const newFrontmatter = this.buildFrontmatter({
              name: String(newData.name || skillName),
              description: String(newData.description || ''),
              version: String(newData.version || '1.0.0'),
              category: String(newData.category || 'general'),
              platforms: Array.isArray(newData.platforms) ? newData.platforms as string[] : [],
              triggerKeywords: keywords,
            });
            optimized = newFrontmatter + '\n' + parsed.content;
          }
        }
      } catch { /* ignore YAML parse errors */ }
    }

    return { original, optimized, suggestions };
  }

  /**
   * Find the best matching template for a request
   */
  private static findBestTemplate(category: string, description: string): SkillTemplate | null {
    // Try exact category match first
    const exactMatch = this.TEMPLATES.find(t => t.category === category);
    if (exactMatch) return exactMatch;

    // Try keyword matching from description
    const descLower = description.toLowerCase();
    let bestMatch: SkillTemplate | null = null;
    let bestScore = 0;

    for (const template of this.TEMPLATES) {
      let score = 0;
      for (const keyword of template.triggerKeywords) {
        if (descLower.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    return bestMatch;
  }

  /**
   * Build YAML frontmatter from structured data
   */
  private static buildFrontmatter(data: {
    name: string;
    description: string;
    version: string;
    category: string;
    platforms: string[];
    triggerKeywords: string[];
  }): string {
    const lines: string[] = ['---'];
    lines.push(`name: ${data.name}`);
    lines.push(`description: "${data.description.replace(/"/g, '\\"')}"`);
    lines.push(`version: "${data.version}"`);
    lines.push(`category: ${data.category}`);

    if (data.platforms.length > 0) {
      lines.push('platforms:');
      for (const p of data.platforms) lines.push(`  - ${p}`);
    } else {
      lines.push('platforms: []');
    }

    if (data.triggerKeywords.length > 0) {
      lines.push('triggerKeywords:');
      for (const kw of data.triggerKeywords) lines.push(`  - "${kw}"`);
    }

    lines.push('---');
    return lines.join('\n');
  }

  /**
   * Generate post-generation suggestions
   */
  private static generateSuggestions(req: GenerationRequest, template: SkillTemplate | null): string[] {
    const suggestions: string[] = [];

    if (!template) {
      suggestions.push('No matching template found — generated with default structure. Consider adding more specific instructions.');
    }

    if (!req.triggerKeywords || req.triggerKeywords.length === 0) {
      suggestions.push('No trigger keywords provided — auto-generated keywords may need refinement.');
    }

    if (req.complexity === 'advanced') {
      suggestions.push('For advanced skills, consider adding a "## Architecture" section explaining the internal design.');
    }

    suggestions.push('Review the generated content and customize instructions for your specific use case.');
    suggestions.push('Test the skill with real inputs to validate trigger behavior.');

    return suggestions;
  }

  /**
   * Calculate a quality score for generated content (0-100)
   */
  private static calculateQualityScore(content: string, triggerKeywords: string[]): number {
    let score = 50; // Base score

    // Has frontmatter
    if (content.startsWith('---')) score += 15;

    // Has Instructions section
    if (content.includes('## Instructions')) score += 10;

    // Has Examples section
    if (content.includes('## Examples')) score += 10;

    // Has Limitations section
    if (/##\s*Limitations/i.test(content)) score += 5;

    // Has trigger keywords
    if (triggerKeywords.length >= 3) score += 5;
    else if (triggerKeywords.length > 0) score += 2;

    // Content length (more content = better, up to a cap)
    const lines = content.split('\n').filter(l => l.trim()).length;
    if (lines > 20) score += 5;
    else if (lines > 10) score += 3;

    return Math.min(100, score);
  }

  /**
   * Extract potential trigger keywords from skill name and content
   */
  private static extractKeywords(skillName: string, content: string): string[] {
    const keywords = new Set<string>();
    const nameWords = skillName.split(/[-_]/).filter(w => w.length > 2);
    nameWords.forEach(w => keywords.add(w.toLowerCase()));

    // Extract from headings
    const headings = content.match(/^##+\s+(.+)$/gm) || [];
    headings.forEach(h => {
      const words = h.replace(/^#+\s+/, '').toLowerCase().split(/\s+/);
      words.forEach(w => {
        if (w.length > 3 && !['instructions', 'examples', 'limitations', 'practices'].includes(w)) {
          keywords.add(w);
        }
      });
    });

    return Array.from(keywords).slice(0, 8);
  }
}
