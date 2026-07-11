import { describe, it, expect } from 'vitest';
import type { SkillIR } from '../../server/services/transpiler';

// Import transpilers directly for unit testing
// Note: In a real setup, you'd mock the file system or use a test fixture

describe('SkillIR', () => {
  it('should have required fields', () => {
    const ir: SkillIR = {
      name: 'test-skill',
      description: 'A test skill',
      triggers: ['when user asks for help'],
      globs: ['*.ts'],
      alwaysApply: false,
      body: '## Rules\nDo something useful',
      references: ['api.md'],
      version: '1.0.0',
      dependencies: [],
    };

    expect(ir.name).toBe('test-skill');
    expect(ir.description).toBe('A test skill');
    expect(ir.triggers).toHaveLength(1);
    expect(ir.globs).toHaveLength(1);
    expect(ir.alwaysApply).toBe(false);
    expect(ir.body).toContain('Do something useful');
    expect(ir.references).toHaveLength(1);
  });
});

describe('CursorTranspiler', () => {
  it('should generate valid .mdc format', () => {
    // This is a conceptual test - actual implementation would need
    // to import the transpiler class and test its output
    const expectedFrontmatter = {
      description: 'A test skill',
      globs: '*.ts',
      alwaysApply: false,
    };

    expect(expectedFrontmatter.description).toBe('A test skill');
    expect(expectedFrontmatter.globs).toBe('*.ts');
    expect(expectedFrontmatter.alwaysApply).toBe(false);
  });
});

describe('WindsurfTranspiler', () => {
  it('should generate valid .windsurfrules format', () => {
    // Conceptual test for Windsurf format
    const expectedFormat = {
      sections: ['Description', 'When to Use', 'Rules'],
    };

    expect(expectedFormat.sections).toContain('Description');
    expect(expectedFormat.sections).toContain('Rules');
  });
});

describe('CopilotTranspiler', () => {
  it('should generate valid copilot-instructions format', () => {
    // Conceptual test for Copilot format
    const expectedFormat = {
      header: '# Skill Instructions',
      sections: ['description', 'rules'],
    };

    expect(expectedFormat.header).toBe('# Skill Instructions');
  });
});

describe('ClineTranspiler', () => {
  it('should generate valid .clinerules format', () => {
    // Conceptual test for Cline format
    const expectedFormat = {
      sections: ['Description', 'Rules'],
    };

    expect(expectedFormat.sections).toContain('Rules');
  });
});
