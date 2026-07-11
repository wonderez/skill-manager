import { describe, it, expect } from 'vitest';
import { CommandService } from '../services/command';

describe('CommandService', () => {
  describe('run', () => {
    it('should execute a command and return stdout', () => {
      const result = CommandService.run('node', ['-e', 'console.log("hello")']);
      expect(result.trim()).toBe('hello');
    });

    it('should throw on non-zero exit code', () => {
      expect(() => {
        CommandService.run('node', ['-e', 'process.exit(1)']);
      }).toThrow();
    });

    it('should pass args as array without shell interpretation', () => {
      // This ensures command injection via shell metacharacters is blocked
      // node -e just echoes the literal args
      const result = CommandService.run('node', ['-e', 'console.log(process.argv.slice(1).join(" "))', '--', 'hello', '&&', 'world']);
      expect(result.trim()).toBe('hello && world');
    });
  });

  describe('git', () => {
    it('should run git --version', () => {
      const result = CommandService.git(['--version']);
      expect(result).toContain('git version');
    });
  });

  describe('runCommand', () => {
    it('should execute a simple shell command via shell:true', () => {
      const result = CommandService.runCommand('node -e "console.log(42)"');
      expect(result.trim()).toBe('42');
    });
  });
});
