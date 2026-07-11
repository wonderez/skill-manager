import fs from 'fs-extra';
import path from 'path';

export interface ClassificationResult {
  skillName: string;
  classification: 'universal' | 'platform-specific' | 'candidate-promote' | 'garbage';
  confidence: number;
  platformHints: string[];
  existsInMaster: boolean;
  existsInPlatforms: string[];
  recommendation: string;
}

export class ClassifierService {
  static async classifySkill(skillPath: string, masterDir: string, platformName: string): Promise<ClassificationResult> {
    const skillName = path.basename(skillPath);
    const inMaster = await fs.pathExists(path.join(masterDir, skillName));
    
    if (inMaster) {
      return {
        skillName,
        classification: 'universal',
        confidence: 1,
        platformHints: [],
        existsInMaster: true,
        existsInPlatforms: [platformName],
        recommendation: 'Keep as universal (already in master).'
      };
    }

    const hints: string[] = [];
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    if (!(await fs.pathExists(skillMdPath))) { return { skillName, classification: 'garbage', confidence: 1, platformHints: [], existsInMaster: false, existsInPlatforms: [platformName], recommendation: 'Not a valid skill (missing SKILL.md). Recommend cleanup.' }; }
    if (await fs.pathExists(path.join(skillPath, '.cursorrules'))) hints.push('has .cursorrules');
    if (await fs.pathExists(path.join(skillPath, 'mcp_config.json'))) hints.push('has mcp_config.json');
    if (await fs.pathExists(path.join(skillPath, 'qclaw_manifest.json'))) hints.push('has qclaw manifest');
    if (await fs.pathExists(path.join(skillPath, '.claude-plugin'))) hints.push('has .claude-plugin');
    
    if (await fs.pathExists(skillMdPath)) {
      const content = await fs.readFile(skillMdPath, 'utf8');
      if (/platform:\s*\w+/i.test(content)) hints.push('frontmatter specifies platform');
      if (/(use claude_bash|call qclaw_api|windsurf\.|cline\.)/i.test(content)) hints.push('platform specific tool call detected');
    }

    const confidence = hints.length > 0 ? 0.9 : 0.4;
    const classification = hints.length > 0 ? 'platform-specific' : 'candidate-promote';
    const rec = hints.length > 0 
      ? 'Retain as platform-specific due to detected constraints.'
      : 'No platform-specific traits found. Consider promoting to universal.';

    return {
      skillName,
      classification,
      confidence,
      platformHints: hints,
      existsInMaster: false,
      existsInPlatforms: [platformName],
      recommendation: rec
    };
  }
}
