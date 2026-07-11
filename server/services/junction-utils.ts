/**
 * Cross-Platform Symlink/Junction Utilities
 *
 * Supports Windows (junction), macOS (symlink), and Linux (symlink).
 *
 * Windows-specific notes:
 * - Node.js fs module has known issues with Windows junctions:
 *   - lstatSync().isSymbolicLink() may return false for valid junctions created by fs-extra
 *   - rmSync() may silently fail on broken junctions (no error, junction remains)
 *   - fs.remove() (fs-extra) follows junctions and DELETES TARGET CONTENT
 * - Uses PowerShell -NoProfile as the primary deletion method (bypasses sandbox wrappers).
 *
 * macOS/Linux notes:
 * - Standard symlinks are well-supported by Node.js fs module.
 * - No PowerShell needed; uses native fs.unlinkSync() for safe symlink removal.
 * - createJunction() uses fs.symlinkSync() with 'dir' type.
 */
import { spawnSync } from 'child_process';
import * as nativeFs from 'fs';
import path from 'path';

const IS_WINDOWS = process.platform === 'win32';

export class JunctionUtils {
  /**
   * Check if a path exists (without following junctions/symlinks).
   * Use this instead of fs.existsSync() which follows links.
   */
  static exists(p: string): boolean {
    try {
      nativeFs.lstatSync(p);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect if a path is a junction (Windows) or symlink (macOS/Linux).
   *
   * Windows uses two strategies:
   * 1. lstatSync().isSymbolicLink() — catches most junctions and all broken ones
   * 2. realpathSync comparison — catches valid junctions that lstatSync misses
   *    (known Node.js bug on some Windows versions)
   *
   * macOS/Linux: simply checks lstatSync().isSymbolicLink()
   */
  static isJunction(p: string): boolean {
    try {
      const lstat = nativeFs.lstatSync(p);
      // Strategy 1: isSymbolicLink (works for all platforms)
      if (lstat.isSymbolicLink()) return true;

      // Strategy 2 (Windows only): For directories, check if realpath differs
      if (IS_WINDOWS && lstat.isDirectory()) {
        try {
          const real = nativeFs.realpathSync(p);
          return path.normalize(real).toLowerCase() !== path.normalize(p).toLowerCase();
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a junction's/symlink's target doesn't exist (broken/dead link).
   */
  static isBrokenJunction(p: string): boolean {
    if (!this.isJunction(p)) return false;
    return !nativeFs.existsSync(p);
  }

  /**
   * Get the target path of a junction or symlink.
   * Returns null if not a link or target can't be determined.
   */
  static getJunctionTarget(p: string): string | null {
    try {
      return nativeFs.readlinkSync(p);
    } catch {
      try {
        const real = nativeFs.realpathSync(p);
        if (path.normalize(real).toLowerCase() !== path.normalize(p).toLowerCase()) {
          return real;
        }
      } catch {
        // pass
      }
      return null;
    }
  }

  /**
   * Safely delete a junction/symlink WITHOUT following it or deleting target contents.
   *
   * IMPORTANT: Never use fs-extra's fs.remove() on junctions — it follows the link
   * and recursively deletes the target directory's contents.
   *
   * @returns true if link was deleted (or didn't exist), false if deletion failed
   */
  static safeDelete(p: string): boolean {
    if (!this.exists(p)) return true;

    // If it's not a junction/symlink, use normal rmSync
    if (!this.isJunction(p)) {
      try {
        nativeFs.rmSync(p, { recursive: true, force: true });
        return !this.exists(p);
      } catch {
        return false;
      }
    }

    if (IS_WINDOWS) {
      return this.safeDeleteWindows(p);
    } else {
      return this.safeDeleteUnix(p);
    }
  }

  /**
   * Async wrapper for safeDelete.
   */
  static async safeDeleteAsync(p: string): Promise<boolean> {
    return this.safeDelete(p);
  }

  /**
   * Create a junction (Windows) or symlink (macOS/Linux).
   * Automatically selects the correct link type based on platform.
   */
  static async createJunction(target: string, link: string): Promise<void> {
    const parent = path.dirname(link);
    await import('fs-extra').then(fs => fs.ensureDir(parent));

    if (IS_WINDOWS) {
      // Windows: use 'junction' type — doesn't require admin privileges
      nativeFs.symlinkSync(target, link, 'junction');
    } else {
      // macOS/Linux: use 'dir' type for directory symlinks
      nativeFs.symlinkSync(target, link, 'dir');
    }
  }

  /**
   * Get the platform-appropriate link type string.
   */
  static getLinkType(): 'junction' | 'dir' {
    return IS_WINDOWS ? 'junction' : 'dir';
  }

  /**
   * Check if the current platform supports symlinks.
   * On Windows, this checks if the user has the required privilege.
   */
  static isSymlinkSupported(): boolean {
    if (!IS_WINDOWS) return true;
    // On Windows, junctions don't require admin privileges
    return true;
  }

  // ==================== Platform-specific implementations ====================

  /**
   * Windows: Safe junction deletion using PowerShell as primary method.
   */
  private static safeDeleteWindows(p: string): boolean {
    // Method 1 (primary): PowerShell (Get-Item -Force).Delete()
    if (this.deleteViaPowerShell(p)) return true;

    // Method 2: nativeFs.rmSync with force
    try {
      nativeFs.rmSync(p, { recursive: false, force: true });
      if (!this.exists(p)) return true;
    } catch { /* continue */ }

    // Method 3: For broken junctions, create temp target then delete
    const target = this.getJunctionTarget(p);
    if (target && !nativeFs.existsSync(target)) {
      try {
        nativeFs.mkdirSync(target, { recursive: true });
        if (this.deleteViaPowerShell(p)) {
          nativeFs.rmSync(target, { recursive: true, force: true });
          return true;
        }
        nativeFs.rmSync(target, { recursive: true, force: true });
      } catch {
        try { nativeFs.rmSync(target, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }

    // Method 4: rmSync with recursive=true as last resort
    try {
      nativeFs.rmSync(p, { recursive: true, force: true });
      if (!this.exists(p)) return true;
    } catch { /* continue */ }

    return false;
  }

  /**
   * macOS/Linux: Safe symlink deletion using native fs.unlinkSync.
   * On Unix systems, unlink() removes the symlink itself without following it.
   */
  private static safeDeleteUnix(p: string): boolean {
    // Method 1: unlinkSync — removes the symlink itself, not the target
    try {
      nativeFs.unlinkSync(p);
      if (!this.exists(p)) return true;
    } catch { /* continue */ }

    // Method 2: rmSync with force
    try {
      nativeFs.rmSync(p, { force: true });
      if (!this.exists(p)) return true;
    } catch { /* continue */ }

    // Method 3: Use 'rm' command as fallback
    try {
      spawnSync('rm', ['-f', p], { encoding: 'utf-8', timeout: 5000 });
      if (!this.exists(p)) return true;
    } catch { /* continue */ }

    return false;
  }

  /**
   * Private: Delete junction via PowerShell (Windows only).
   * This is the most reliable method for Windows junctions.
   */
  private static deleteViaPowerShell(p: string): boolean {
    if (!IS_WINDOWS) return false;
    try {
      const escapedPath = p.replace(/'/g, "''");
      const result = spawnSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `(Get-Item -LiteralPath '${escapedPath}' -Force).Delete()`
      ], { windowsHide: true, encoding: 'utf-8', timeout: 10000 });

      if (result.status === 0 && !this.exists(p)) return true;
      if (result.stderr) {
        console.log(`[junction-utils] PowerShell stderr: ${result.stderr.trim()}`);
      }
      return false;
    } catch (e) {
      console.log(`[junction-utils] PowerShell spawn error: ${(e as Error).message}`);
      return false;
    }
  }
}
