import fs from 'fs-extra';
import path from 'path';

/**
 * SkillManifestService — manages `skill.json` manifest files.
 *
 * A `skill.json` is to a Skill what `package.json` is to an npm package:
 * it declares metadata, dependencies, supported platforms, and required
 * permissions. This service provides CRUD, validation, and discovery
 * operations following the static-class-method pattern used across the
 * Skill Manager backend.
 *
 * File location convention: `<skill-dir>/skill.json`
 */

// ==================== Type Definitions ====================

/** A single skill dependency declaration. */
export interface SkillDependency {
  /** Dependency name / identifier. */
  name: string;
  /** Semver-ish version constraint (e.g. "^1.0.0", "latest"). */
  version: string;
  /** Source descriptor — a URL, npm package name, or local path. */
  source: string;
}

/** The canonical skill manifest shape, analogous to package.json. */
export interface SkillManifest {
  /** Human-readable skill name. */
  name: string;
  /** Semver version string. */
  version: string;
  /** Short one-line description of what the skill does. */
  description: string;
  /** Author name or organization. */
  author: string;
  /** SPDX license identifier (e.g. "MIT", "Apache-2.0"). */
  license: string;
  /** Homepage or documentation URL. */
  homepage: string;
  /** Source repository URL. */
  repository: string;
  /** Search/discovery keywords. */
  keywords: string[];
  /** Declared skill dependencies. */
  dependencies: SkillDependency[];
  /** Target AI platforms (e.g. "claude-code", "cursor", "codex"). */
  platforms: string[];
  /** Required permissions (e.g. "filesystem", "network", "process"). */
  permissions: string[];
  /** Entry-point file within the skill directory. */
  entryPoint: string;
  /** Icon path or identifier (emoji, URL, or relative path). */
  icon: string;
  /** Broad category label (e.g. "development", "productivity"). */
  category: string;
  /** Fine-grained tags for filtering. */
  tags: string[];
}

/** Result of validating a manifest. */
export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** A discovered manifest with its filesystem path. */
export interface FoundManifest {
  path: string;
  manifest: SkillManifest;
}

// ==================== Constants ====================

/** Filename for the manifest file inside a skill directory. */
const MANIFEST_FILENAME = 'skill.json';

/** Default values applied when creating a new manifest. */
const DEFAULT_MANIFEST: SkillManifest = {
  name: '',
  version: '1.0.0',
  description: '',
  author: '',
  license: 'MIT',
  homepage: '',
  repository: '',
  keywords: [],
  dependencies: [],
  platforms: [],
  permissions: [],
  entryPoint: 'SKILL.md',
  icon: '',
  category: 'general',
  tags: [],
};

/** Valid permission scopes that a skill may declare. */
const VALID_PERMISSIONS = new Set([
  'filesystem',
  'network',
  'process',
  'clipboard',
  'registry',
  'environment',
]);

// ==================== Type Guards ====================

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function isSkillDependencyArray(value: unknown): value is SkillDependency[] {
  if (!Array.isArray(value)) return false;
  return value.every(item =>
    typeof item === 'object' && item !== null &&
    typeof (item as Record<string, unknown>).name === 'string' &&
    typeof (item as Record<string, unknown>).version === 'string' &&
    typeof (item as Record<string, unknown>).source === 'string'
  );
}

// ==================== Service ====================

export class SkillManifestService {
  /**
   * Read a `skill.json` from a skill directory.
   *
   * @param skillPath Absolute path to the skill directory.
   * @returns The parsed manifest, or `null` if no manifest exists.
   */
  static async read(skillPath: string): Promise<SkillManifest | null> {
    const manifestPath = path.join(skillPath, MANIFEST_FILENAME);
    if (!await fs.pathExists(manifestPath)) return null;

    const raw = await fs.readJson(manifestPath);
    return this.normalize(raw);
  }

  /**
   * Write a manifest to a skill directory as `skill.json`.
   *
   * @param skillPath Absolute path to the skill directory.
   * @param manifest The manifest to persist.
   */
  static async write(skillPath: string, manifest: SkillManifest): Promise<void> {
    const manifestPath = path.join(skillPath, MANIFEST_FILENAME);
    await fs.ensureDir(skillPath);
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  }

  /**
   * Create a new `skill.json` with defaults merged over the supplied partial.
   *
   * @param skillPath Absolute path to the skill directory.
   * @param partial Fields to override the defaults.
   * @returns The fully-formed manifest that was written.
   */
  static async create(
    skillPath: string,
    partial: Partial<SkillManifest>,
  ): Promise<SkillManifest> {
    // If the directory name is available, use it as a default name.
    const dirName = path.basename(skillPath);

    const manifest: SkillManifest = {
      ...DEFAULT_MANIFEST,
      name: dirName || partial.name || DEFAULT_MANIFEST.name,
      ...partial,
    };

    await this.write(skillPath, manifest);
    return manifest;
  }

  /**
   * Validate a `skill.json` for completeness and correctness.
   *
   * Checks performed:
   * - Required fields present (name, version, description).
   * - Version follows basic semver shape.
   * - Permissions are from the known set.
   * - Entry-point file exists on disk.
   * - Dependencies have non-empty name/version/source.
   *
   * @param skillPath Absolute path to the skill directory.
   * @returns Validation result with errors and warnings.
   */
  static async validate(skillPath: string): Promise<ManifestValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const manifestPath = path.join(skillPath, MANIFEST_FILENAME);
    if (!await fs.pathExists(manifestPath)) {
      return { valid: false, errors: ['skill.json not found.'], warnings: [] };
    }

    let manifest: SkillManifest;
    try {
      const raw = await fs.readJson(manifestPath);
      manifest = this.normalize(raw);
    } catch {
      return { valid: false, errors: ['skill.json is not valid JSON.'], warnings: [] };
    }

    // --- Required fields ---
    if (!manifest.name || manifest.name.trim() === '') {
      errors.push('Field "name" is required and must not be empty.');
    }
    if (!manifest.version || manifest.version.trim() === '') {
      errors.push('Field "version" is required and must not be empty.');
    } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      warnings.push(`Version "${manifest.version}" does not follow semver (x.y.z).`);
    }
    if (!manifest.description || manifest.description.trim() === '') {
      errors.push('Field "description" is required and must not be empty.');
    }

    // --- Permissions ---
    for (const perm of manifest.permissions) {
      if (!VALID_PERMISSIONS.has(perm)) {
        warnings.push(`Unknown permission "${perm}". Known: ${Array.from(VALID_PERMISSIONS).join(', ')}.`);
      }
    }

    // --- Entry point ---
    if (manifest.entryPoint) {
      const entryPath = path.join(skillPath, manifest.entryPoint);
      if (!await fs.pathExists(entryPath)) {
        warnings.push(`Entry point "${manifest.entryPoint}" does not exist in the skill directory.`);
      }
    } else {
      warnings.push('Field "entryPoint" is empty; defaulting to "SKILL.md" is recommended.');
    }

    // --- Dependencies ---
    for (const dep of manifest.dependencies) {
      if (!dep.name) errors.push(`Dependency is missing "name".`);
      if (!dep.version) errors.push(`Dependency "${dep.name || '<unknown>'}" is missing "version".`);
      if (!dep.source) errors.push(`Dependency "${dep.name || '<unknown>'}" is missing "source".`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Find all `skill.json` files within a directory tree.
   *
   * Skips `.git`, `.snapshots`, and `node_modules` directories.
   *
   * @param dir Root directory to search recursively.
   * @returns Array of found manifests with their paths.
   */
  static async findInDir(dir: string): Promise<FoundManifest[]> {
    const results: FoundManifest[] = [];
    if (!await fs.pathExists(dir)) return results;

    await this.scanDir(dir, results);
    return results;
  }

  /**
   * Extract the dependency list from a skill's manifest.
   *
   * @param skillPath Absolute path to the skill directory.
   * @returns Array of dependencies, or an empty array if none declared.
   */
  static async getDependencies(
    skillPath: string,
  ): Promise<SkillDependency[]> {
    const manifest = await this.read(skillPath);
    if (!manifest) return [];
    return manifest.dependencies;
  }

  // ==================== Private Helpers ====================

  /**
   * Recursively scan a directory for `skill.json` files.
   * Mutates the `results` array in place.
   */
  private static async scanDir(
    dir: string,
    results: FoundManifest[],
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.agents') continue;
      if (entry.name === 'node_modules' || entry.name === '.snapshots') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.scanDir(fullPath, results);
      } else if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
        try {
          const raw = await fs.readJson(fullPath);
          const manifest = this.normalize(raw);
          results.push({ path: fullPath, manifest });
        } catch {
          // Skip malformed manifest files silently
        }
      }
    }
  }

  /**
   * Normalize a raw JSON object into a complete SkillManifest,
   * filling in defaults for missing fields and coercing types.
   */
  private static normalize(raw: unknown): SkillManifest {
    const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

    const dependencies: SkillDependency[] = isSkillDependencyArray(obj.dependencies)
      ? obj.dependencies
      : Array.isArray(obj.dependencies)
        ? (obj.dependencies as unknown[])
            .filter((d): d is Record<string, unknown> =>
              typeof d === 'object' && d !== null)
            .map(d => ({
              name: typeof d.name === 'string' ? d.name : '',
              version: typeof d.version === 'string' ? d.version : '',
              source: typeof d.source === 'string' ? d.source : '',
            }))
        : [];

    return {
      name: typeof obj.name === 'string' ? obj.name : '',
      version: typeof obj.version === 'string' ? obj.version : '1.0.0',
      description: typeof obj.description === 'string' ? obj.description : '',
      author: typeof obj.author === 'string' ? obj.author : '',
      license: typeof obj.license === 'string' ? obj.license : 'MIT',
      homepage: typeof obj.homepage === 'string' ? obj.homepage : '',
      repository: typeof obj.repository === 'string' ? obj.repository : '',
      keywords: isStringArray(obj.keywords) ? obj.keywords : [],
      dependencies,
      platforms: isStringArray(obj.platforms) ? obj.platforms : [],
      permissions: isStringArray(obj.permissions) ? obj.permissions : [],
      entryPoint: typeof obj.entryPoint === 'string' ? obj.entryPoint : 'SKILL.md',
      icon: typeof obj.icon === 'string' ? obj.icon : '',
      category: typeof obj.category === 'string' ? obj.category : 'general',
      tags: isStringArray(obj.tags) ? obj.tags : [],
    };
  }
}
