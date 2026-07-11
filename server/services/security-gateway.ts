import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { SecurityAuditService, type SecurityAuditResult } from './market';
import { SkillManifestService } from './skill-manifest';

/**
 * SecurityGatewayService — extends the existing SecurityAuditService with
 * comprehensive pre-installation security checks, backdoor detection,
 * permission verification, sandbox generation, and quarantine support.
 *
 * This service acts as a "gateway" that every skill must pass through
 * before being installed into a platform's skills directory. It delegates
 * baseline scanning (secrets, malicious scripts, suspicious files) to
 * `SecurityAuditService` and layers additional heuristics on top:
 *
 * - Reverse shell detection
 * - Data exfiltration detection (network + base64 correlation)
 * - Cryptocurrency miner detection
 * - OS persistence mechanism detection
 * - Environment-variable harvesting detection
 *
 * Follows the static-class-method pattern used across the backend.
 */

// ==================== Type Definitions ====================

/** Sandbox enforcement level. */
type SandboxLevel = 'none' | 'filesystem' | 'strict';

/** Security policy that governs pre-installation checks. */
export interface SecurityPolicy {
  /** Permission scopes that skills are allowed to declare. */
  allowedPermissions: string[];
  /** Regex patterns (as strings) whose presence blocks installation. */
  blockedPatterns: string[];
  /** Maximum allowed file size in bytes for any single file in the skill. */
  maxFileSize: number;
  /** Sandbox strictness level applied to the skill after install. */
  sandboxLevel: SandboxLevel;
}

/** A single risk identified during a security check. */
export interface SecurityRisk {
  /** Severity ranking. */
  level: 'critical' | 'high' | 'medium' | 'low';
  /** Risk category / identifier. */
  type: string;
  /** Human-readable description. */
  message: string;
  /** Relative file path where the risk was found, if applicable. */
  file?: string;
}

/** Result of a comprehensive pre-installation security check. */
export interface InstallSecurityReport {
  /** Name of the skill being checked (derived from directory name). */
  skillName: string;
  /** Whether the skill passed all checks (no critical/high risks). */
  passed: boolean;
  /** Overall security score (0–100). */
  score: number;
  /** All risks found, sorted by severity. */
  risks: SecurityRisk[];
  /** Actionable recommendations for the user. */
  recommendations: string[];
  /** Policy rules that were violated. */
  policyViolations: string[];
}

/** Result of a backdoor pattern scan. */
export interface BackdoorFinding {
  /** Relative file path where the pattern was detected. */
  file: string;
  /** The pattern (or description) that matched. */
  pattern: string;
  /** Severity of the finding. */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/** Result of a permission verification. */
export interface PermissionCheckResult {
  /** Declared permissions that are allowed by the active policy. */
  allowed: string[];
  /** Declared permissions that are denied by the active policy. */
  denied: string[];
  /** Permissions detected in code but not declared in the manifest. */
  undeclared: string[];
}

/** Sandbox configuration derived from a skill's permissions. */
export interface SandboxConfig {
  /** Whether the skill should run in read-only filesystem mode. */
  readOnly: boolean;
  /** Whether the skill is permitted network access. */
  networkAccess: boolean;
  /** Whether the skill is permitted to spawn child processes. */
  processSpawn: boolean;
}

// ==================== Constants ====================

/** Default security policy applied when none is supplied. */
const DEFAULT_POLICY: SecurityPolicy = {
  allowedPermissions: ['filesystem', 'network', 'process', 'clipboard', 'environment'],
  blockedPatterns: [],
  maxFileSize: 5 * 1024 * 1024, // 5 MB per file
  sandboxLevel: 'filesystem',
};

/** Directory used to hold quarantined skills. */
const QUARANTINE_DIR = path.join(os.homedir(), '.agents', 'skills-quarantine');

/**
 * Backdoor detection patterns.
 *
 * Each entry defines a regex, a human-readable label, and a severity.
 * Some categories (e.g. data exfiltration) require two correlated
 * signals in the same file and are handled specially in code.
 */
interface BackdoorPattern {
  /** Compiled regex to test file content against. */
  regex: RegExp;
  /** Human-readable description of what was detected. */
  label: string;
  /** Severity assigned on match. */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * NOTE: All module-level regexes below use the `i` flag only (NOT `g`).
 * The global flag causes `.test()` to advance `lastIndex`, which produces
 * inconsistent results when the same regex is reused across multiple
 * files. Since we only test for presence, the `g` flag is omitted.
 */

/** Reverse shell command patterns. */
const REVERSE_SHELL_PATTERNS: BackdoorPattern[] = [
  { regex: /bash\s+-i\b/i, label: 'Interactive bash shell invocation (reverse shell)', severity: 'critical' },
  { regex: /\bnc\s+-e\b/i, label: 'netcat execute flag (reverse shell via nc -e)', severity: 'critical' },
  { regex: /\/dev\/tcp\//i, label: 'Bash /dev/tcp device path (reverse shell)', severity: 'critical' },
  { regex: /\bsh\s+-i\b/i, label: 'Interactive sh shell invocation', severity: 'high' },
];

/** Cryptocurrency miner indicators. */
const CRYPTO_MINER_PATTERNS: BackdoorPattern[] = [
  { regex: /\bcoinhive\b/i, label: 'CoinHive crypto miner reference', severity: 'high' },
  { regex: /\bcrypto-wasm\b/i, label: 'crypto-wasm miner reference', severity: 'high' },
  { regex: /\bwebminer\b/i, label: 'Web miner reference', severity: 'high' },
  { regex: /\bmonero\s*pool\b/i, label: 'Monero mining pool reference', severity: 'medium' },
];

/** OS persistence mechanism patterns. */
const PERSISTENCE_PATTERNS: BackdoorPattern[] = [
  { regex: /\bcrontab\b/i, label: 'crontab modification (Unix persistence)', severity: 'high' },
  { regex: /\bschtasks\b/i, label: 'schtasks invocation (Windows persistence)', severity: 'high' },
  { regex: /\bLaunchAgent\b/i, label: 'macOS LaunchAgent persistence', severity: 'high' },
  { regex: /\\Software\\Microsoft\\Windows\\CurrentVersion\\Run/i, label: 'Windows registry Run key persistence', severity: 'critical' },
];

/** Network exfiltration primitives — must be correlated with base64. */
const EXFIL_NETWORK_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
  /\bnavigator\.sendBeacon\b/i,
];

/** Base64 encoding indicator — used to correlate with exfiltration primitives. */
const BASE64_PATTERN = /\b(?:atob|btoa|Buffer\.from\([^)]*,\s*['"]base64['"]\)|toString\(\s*['"]base64['"]\s*\))/i;

/** Environment-variable access pattern. */
const ENV_HARVEST_PATTERN = /\bprocess\.env\b/i;

/** Network-call patterns used to correlate with env harvesting. */
const NETWORK_CALL_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/i,
  /\bhttp\.request\b/i,
  /\bhttps\.request\b/i,
  /\baxios\b/i,
  /\bXMLHttpRequest\b/i,
];

// ==================== Service ====================

export class SecurityGatewayService {
  /**
   * Run a comprehensive pre-installation security check on a skill.
   *
   * Combines the baseline `SecurityAuditService.audit` scan with backdoor
   * detection, permission verification, file-size enforcement, and
   * blocked-pattern matching against the supplied (or default) policy.
   *
   * @param skillPath Absolute path to the skill directory.
   * @param policy Partial security policy to override defaults.
   * @returns A full security report with score, risks, and recommendations.
   */
  static async preInstallCheck(
    skillPath: string,
    policy?: Partial<SecurityPolicy>,
  ): Promise<InstallSecurityReport> {
    const effectivePolicy: SecurityPolicy = { ...DEFAULT_POLICY, ...policy };
    const skillName = path.basename(skillPath);

    const risks: SecurityRisk[] = [];
    const recommendations: string[] = [];
    const policyViolations: string[] = [];

    // --- 1. Delegate baseline scanning to SecurityAuditService ---
    let baseline: SecurityAuditResult;
    try {
      baseline = await SecurityAuditService.audit(skillPath);
    } catch {
      baseline = { score: 0, risks: [], passed: false };
      risks.push({
        level: 'high',
        type: 'baseline-scan-failed',
        message: 'Baseline security scan could not be completed.',
      });
    }

    // Convert baseline risks into our SecurityRisk shape.
    for (const r of baseline.risks) {
      risks.push({ level: r.level, type: r.type, message: r.message, file: r.file });
    }

    // --- 2. Backdoor detection ---
    const backdoors = await this.scanForBackdoors(skillPath);
    for (const b of backdoors) {
      risks.push({
        level: b.severity,
        type: 'backdoor',
        message: b.pattern,
        file: b.file,
      });
    }

    // --- 3. File-size enforcement ---
    const oversized = await this.checkFileSizes(skillPath, effectivePolicy.maxFileSize);
    for (const f of oversized) {
      risks.push({
        level: 'medium',
        type: 'oversized-file',
        message: `File exceeds max size (${effectivePolicy.maxFileSize} bytes): ${f.file} (${f.size} bytes)`,
        file: f.file,
      });
      policyViolations.push(`maxFileSize exceeded: ${f.file}`);
    }

    // --- 4. Blocked patterns ---
    if (effectivePolicy.blockedPatterns.length > 0) {
      const blocked = await this.checkBlockedPatterns(skillPath, effectivePolicy.blockedPatterns);
      for (const b of blocked) {
        risks.push({
          level: 'high',
          type: 'blocked-pattern',
          message: `Blocked pattern detected: ${b.pattern}`,
          file: b.file,
        });
        policyViolations.push(`blockedPattern "${b.pattern}" in ${b.file}`);
      }
    }

    // --- 5. Permission verification ---
    const manifest = await SkillManifestService.read(skillPath);
    const declaredPermissions = manifest?.permissions ?? [];
    if (declaredPermissions.length > 0) {
      const permCheck = await this.checkPermissions(skillPath, declaredPermissions);
      for (const denied of permCheck.denied) {
        policyViolations.push(`Permission "${denied}" is not allowed by policy.`);
        risks.push({
          level: 'medium',
          type: 'permission-denied',
          message: `Permission "${denied}" is not in the allowed list.`,
        });
      }
      for (const undeclared of permCheck.undeclared) {
        risks.push({
          level: 'high',
          type: 'undeclared-permission',
          message: `Skill uses "${undeclared}" operations but did not declare this permission.`,
        });
        recommendations.push(`Declare the "${undeclared}" permission in skill.json for transparency.`);
      }
    }

    // --- 6. Compute score ---
    let score = 100;
    for (const r of risks) {
      const deduction =
        r.level === 'critical' ? 25 :
        r.level === 'high' ? 15 :
        r.level === 'medium' ? 8 :
        2;
      score -= deduction;
    }
    score = Math.max(0, Math.min(100, score));

    // --- 7. Recommendations ---
    if (risks.some(r => r.level === 'critical')) {
      recommendations.push('Do NOT install this skill — critical security risks were found.');
    }
    if (risks.some(r => r.type === 'backdoor')) {
      recommendations.push('Review all backdoor findings before proceeding.');
    }
    if (oversized.length > 0) {
      recommendations.push('Remove or shrink oversized files to reduce attack surface.');
    }
    if (recommendations.length === 0 && score >= 80) {
      recommendations.push('Skill passed security checks. Safe to install.');
    }

    // --- 8. Sort risks by severity ---
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    risks.sort((a, b) => severityOrder[a.level] - severityOrder[b.level]);

    const passed =
      score >= 60 &&
      !risks.some(r => r.level === 'critical') &&
      policyViolations.length === 0;

    return {
      skillName,
      passed,
      score,
      risks,
      recommendations,
      policyViolations,
    };
  }

  /**
   * Scan a skill directory for backdoor patterns.
   *
   * Detects reverse shells, data exfiltration (network + base64 correlation),
   * cryptocurrency miners, OS persistence mechanisms, and environment-variable
   * harvesting.
   *
   * @param skillPath Absolute path to the skill directory.
   * @returns Array of findings with file, pattern, and severity.
   */
  static async scanForBackdoors(
    skillPath: string,
  ): Promise<BackdoorFinding[]> {
    const findings: BackdoorFinding[] = [];
    const allFiles = await this.walkDir(skillPath);

    for (const filePath of allFiles) {
      const relPath = path.relative(skillPath, filePath);
      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');

      // --- Reverse shells ---
      for (const p of REVERSE_SHELL_PATTERNS) {
        if (p.regex.test(content)) {
          findings.push({ file: relPath, pattern: p.label, severity: p.severity });
        }
      }

      // --- Crypto miners ---
      for (const p of CRYPTO_MINER_PATTERNS) {
        if (p.regex.test(content)) {
          findings.push({ file: relPath, pattern: p.label, severity: p.severity });
        }
      }

      // --- Persistence mechanisms ---
      for (const p of PERSISTENCE_PATTERNS) {
        if (p.regex.test(content)) {
          findings.push({ file: relPath, pattern: p.label, severity: p.severity });
        }
      }

      // --- Data exfiltration (network primitive + base64 correlation) ---
      const hasExfilNetwork = EXFIL_NETWORK_PATTERNS.some(rx => rx.test(content));
      const hasBase64 = BASE64_PATTERN.test(content);
      if (hasExfilNetwork && hasBase64) {
        findings.push({
          file: relPath,
          pattern: 'Data exfiltration: network call combined with base64 encoding',
          severity: 'high',
        });
      }

      // --- Environment-variable harvesting (process.env + network call) ---
      const hasEnvAccess = ENV_HARVEST_PATTERN.test(content);
      const hasNetworkCall = NETWORK_CALL_PATTERNS.some(rx => rx.test(content));
      if (hasEnvAccess && hasNetworkCall) {
        findings.push({
          file: relPath,
          pattern: 'Environment variable harvesting: process.env combined with network call',
          severity: 'high',
        });
      }
    }

    return findings;
  }

  /**
   * Verify a skill's declared permissions against the active policy and
   * detect undeclared permissions used in code.
   *
   * @param skillPath Absolute path to the skill directory.
   * @param declared Permissions declared in the skill manifest.
   * @returns Allowed, denied, and undeclared permission lists.
   */
  static async checkPermissions(
    skillPath: string,
    declared: string[],
  ): Promise<PermissionCheckResult> {
    const allowed: string[] = [];
    const denied: string[] = [];

    for (const perm of declared) {
      if (DEFAULT_POLICY.allowedPermissions.includes(perm)) {
        allowed.push(perm);
      } else {
        denied.push(perm);
      }
    }

    // Detect permissions actually used in code that were not declared.
    const detected = await this.detectUsedPermissions(skillPath);
    const undeclared = detected.filter(p => !declared.includes(p));

    return { allowed, denied, undeclared };
  }

  /**
   * Generate a sandbox configuration based on a skill's declared permissions.
   *
   * @param skillPath Absolute path to the skill directory (unused but kept
   *                  for API symmetry and future extensibility).
   * @param permissions Permissions the skill declares.
   * @returns Sandbox config with readOnly, networkAccess, and processSpawn flags.
   */
  static generateSandboxConfig(
    skillPath: string,
    permissions: string[],
  ): SandboxConfig {
    // `skillPath` is accepted for API symmetry; referenced to satisfy lint.
    void skillPath;

    const hasFilesystem = permissions.includes('filesystem');
    const hasNetwork = permissions.includes('network');
    const hasProcess = permissions.includes('process');

    return {
      // Read-only unless the skill explicitly needs filesystem write access.
      readOnly: !hasFilesystem,
      networkAccess: hasNetwork,
      processSpawn: hasProcess,
    };
  }

  /**
   * Move a suspicious skill to the quarantine directory, preventing
   * it from being loaded by any AI platform.
   *
   * The original directory is removed after a successful copy to the
   * quarantine location. A timestamped suffix is added to avoid name
   * collisions in the quarantine folder.
   *
   * @param skillPath Absolute path to the skill directory to quarantine.
   */
  static async quarantine(skillPath: string): Promise<void> {
    if (!await fs.pathExists(skillPath)) {
      throw new Error(`Skill path does not exist: ${skillPath}`);
    }

    await fs.ensureDir(QUARANTINE_DIR);

    const skillName = path.basename(skillPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const quarantinePath = path.join(QUARANTINE_DIR, `${skillName}.${timestamp}`);

    // Copy first, then remove the original — safer than a direct move.
    await fs.copy(skillPath, quarantinePath);
    await fs.remove(skillPath);

    // Drop a marker file explaining why the skill was quarantined.
    const markerPath = path.join(quarantinePath, '.QUARANTINED');
    await fs.writeFile(
      markerPath,
      `Quarantined on ${new Date().toISOString()}\nOriginal path: ${skillPath}\n`,
      'utf-8',
    );
  }

  // ==================== Private Helpers ====================

  /**
   * Recursively walk a directory, returning all file paths.
   * Skips `.git`, `.snapshots`, and `node_modules`.
   */
  private static async walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    if (!await fs.pathExists(dir)) return results;

    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.snapshots' || entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await this.walkDir(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * Check all files in a skill directory against the max-file-size limit.
   */
  private static async checkFileSizes(
    skillPath: string,
    maxSize: number,
  ): Promise<Array<{ file: string; size: number }>> {
    const oversized: Array<{ file: string; size: number }> = [];
    const allFiles = await this.walkDir(skillPath);

    for (const filePath of allFiles) {
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat && stat.size > maxSize) {
        oversized.push({
          file: path.relative(skillPath, filePath),
          size: stat.size,
        });
      }
    }
    return oversized;
  }

  /**
   * Check all files for user-supplied blocked patterns.
   */
  private static async checkBlockedPatterns(
    skillPath: string,
    patterns: string[],
  ): Promise<Array<{ file: string; pattern: string }>> {
    const matches: Array<{ file: string; pattern: string }> = [];
    const allFiles = await this.walkDir(skillPath);

    // Pre-compile patterns, skipping any that are invalid regexes.
    // Use 'i' flag only (no 'g') to avoid lastIndex state issues with .test().
    const compiled: Array<{ regex: RegExp; source: string }> = [];
    for (const p of patterns) {
      try {
        compiled.push({ regex: new RegExp(p, 'i'), source: p });
      } catch {
        // Invalid regex — treat as a literal string match.
        compiled.push({ regex: new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), source: p });
      }
    }

    for (const filePath of allFiles) {
      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
      for (const { regex, source } of compiled) {
        if (regex.test(content)) {
          matches.push({ file: path.relative(skillPath, filePath), pattern: source });
        }
      }
    }
    return matches;
  }

  /**
   * Detect permissions that a skill's code actually uses by scanning
   * for telltale API patterns.
   */
  private static async detectUsedPermissions(skillPath: string): Promise<string[]> {
    const used = new Set<string>();
    const allFiles = await this.walkDir(skillPath);

    for (const filePath of allFiles) {
      const ext = path.extname(filePath).toLowerCase();
      // Only scan text-based code files.
      if (!['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx', '.py', '.sh', '.ps1'].includes(ext)) continue;

      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');

      // Filesystem: fs / path module usage or file reads/writes.
      if (/\b(?:fs|fs-extra|graceful-fs)\b|\breadFile\b|\bwriteFile\b|\bmkdir\b|\bunlink\b/i.test(content)) {
        used.add('filesystem');
      }

      // Network: fetch / http / axios / XMLHttpRequest.
      if (/\bfetch\s*\(|\bhttp\.request\b|\bhttps\.request\b|\baxios\b|\bXMLHttpRequest\b|\bWebSocket\b/i.test(content)) {
        used.add('network');
      }

      // Process: child_process / exec / spawn.
      if (/\bchild_process\b|\bexec\b|\bspawn\b|\bexecSync\b|\bspawnSync\b/i.test(content)) {
        used.add('process');
      }

      // Environment: process.env access.
      if (/\bprocess\.env\b/i.test(content)) {
        used.add('environment');
      }

      // Clipboard: clipboard-related APIs.
      if (/\bclipboard\b|\bnavigator\.clipboard\b|\bpbcopy\b|\bpbpaste\b/i.test(content)) {
        used.add('clipboard');
      }
    }

    return Array.from(used);
  }
}
