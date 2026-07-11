import { spawnSync, exec, type SpawnSyncOptions } from 'child_process';

interface RunOptions {
  cwd?: string;
  stdio?: SpawnSyncOptions['stdio'];
  encoding?: BufferEncoding;
}

export class CommandService {
  static run(command: string, args: string[], options: RunOptions = {}): string {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? 'pipe',
      encoding: options.encoding ?? 'utf-8',
      shell: false,
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
      throw new Error(stderr || `${command} exited with code ${result.status}`);
    }

    return typeof result.stdout === 'string' ? result.stdout : '';
  }

  static git(args: string[], cwd?: string, options: RunOptions = {}): string {
    return this.run('git', args, { ...options, cwd });
  }

  static openFolder(targetPath: string): void {
    exec(`start "" "${targetPath}"`);
  }

  static runCommand(command: string, options: RunOptions = {}): string {
    const result = spawnSync(command, {
      cwd: options.cwd,
      stdio: options.stdio ?? 'pipe',
      encoding: options.encoding ?? 'utf-8',
      shell: true,
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
      throw new Error(stderr || `Command exited with code ${result.status}`);
    }

    return typeof result.stdout === 'string' ? result.stdout : '';
  }
}
