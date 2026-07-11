#!/usr/bin/env node

/**
 * skill-manager — Command-line interface for the Skill Manager backend.
 *
 * Provides terminal access to skill listing, searching, linting, installing,
 * syncing, and introspection. All commands proxy to the backend REST API
 * running at http://localhost:3001.
 *
 * Usage:
 *   skill-manager list            List all installed skills
 *   skill-manager search <query>  Search skills by name
 *   skill-manager lint <name>     Run lint / health check on a skill
 *   skill-manager install <url>   Install a skill from a GitHub URL
 *   skill-manager sync            Trigger sync verification across platforms
 *   skill-manager info <name>     Show detailed info about a skill
 *   skill-manager version         Show CLI version
 *   skill-manager help            Show this help message
 */

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import axios, { type AxiosInstance, type AxiosError } from 'axios';

// ==================== Constants ====================

const API_BASE = 'http://localhost:3001/api';
const CLI_VERSION = '1.0.0';

/** ANSI escape codes for colored terminal output (no external dependency). */
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
} as const;

// ==================== Type Definitions ====================

interface SkillEntry {
  id: string;
  name: string;
  path: string;
  type: string;
  sourceType: string;
  linked: boolean;
  linkedCount: number;
  modifiedTime: string;
  platforms: string[];
  health: SkillHealthReport | undefined;
  sources: SkillSourceInfo[];
  isDuplicate: boolean;
}

interface SkillSourceInfo {
  path: string;
  platform: string;
  type: string;
}

interface SkillHealthReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: LintIssue[];
  metrics: SkillMetrics;
}

interface LintIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  suggestion?: string;
  ignored?: boolean;
}

interface SkillMetrics {
  descLength: number;
  fileSize: number;
  refsCount: number;
  hasFrontmatter: boolean;
  hasName: boolean;
  hasDescription: boolean;
}

interface PlatformInfo {
  id: string;
  name: string;
  icon: string;
  discoveryMethod: string;
  readsFromUniversal: boolean;
  skillsDir: string;
  installed: boolean;
  postInstallHint: string;
}

interface SyncVerifyReport {
  platform: string;
  synced: number;
  missing: number;
  broken: number;
  details?: unknown;
}

interface ApiResponse {
  error?: string;
  [key: string]: unknown;
}

// ==================== HTTP Client ====================

const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ==================== Output Helpers ====================

function colorize(text: string, color: string): string {
  return `${color}${text}${c.reset}`;
}

function printError(message: string): void {
  console.error(colorize(`  Error: ${message}`, c.red));
}

function printSuccess(message: string): void {
  console.log(colorize(`  ${message}`, c.green));
}

function printInfo(message: string): void {
  console.log(colorize(`  ${message}`, c.cyan));
}

function printDim(message: string): void {
  console.log(colorize(`  ${message}`, c.gray));
}

function printHeader(title: string): void {
  console.log();
  console.log(colorize(`  ${title}`, c.bold + c.white));
  console.log(colorize(`  ${'─'.repeat(Math.max(title.length, 50))}`, c.dim));
}

function handleError(error: unknown): void {
  if (error instanceof Error) {
    const axiosErr = error as AxiosError<{ error?: string }>;
    if (axiosErr.response) {
      const msg = axiosErr.response.data?.error ?? `HTTP ${axiosErr.response.status}`;
      printError(msg);
    } else if (axiosErr.code === 'ECONNREFUSED') {
      printError('Cannot connect to the Skill Manager backend.');
      console.error(colorize('  Make sure the server is running: pnpm server', c.gray));
    } else if (axiosErr.code === 'ETIMEDOUT') {
      printError('Request timed out. The backend may be busy or unresponsive.');
    } else {
      printError(error.message);
    }
  } else {
    printError('An unknown error occurred.');
  }
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return c.green;
    case 'B': return c.cyan;
    case 'C': return c.yellow;
    case 'D': return c.magenta;
    case 'F': return c.red;
    default: return c.white;
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return c.green;
  if (score >= 60) return c.yellow;
  return c.red;
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'error': return c.red;
    case 'warning': return c.yellow;
    case 'info': return c.cyan;
    default: return c.white;
  }
}

function isSkillEntryArray(data: unknown): data is SkillEntry[] {
  return Array.isArray(data) && data.every(item =>
    typeof item === 'object' && item !== null && 'name' in item && 'path' in item
  );
}

function isPlatformInfoArray(data: unknown): data is PlatformInfo[] {
  return Array.isArray(data) && data.every(item =>
    typeof item === 'object' && item !== null && 'id' in item && 'name' in item
  );
}

// ==================== Commands ====================

/** List all installed skills. */
async function listSkills(): Promise<void> {
  printHeader('Installed Skills');
  const res = await http.get('/skills');
  const skills = res.data;

  if (!isSkillEntryArray(skills)) {
    printError('Unexpected response format from server.');
    return;
  }

  if (skills.length === 0) {
    printDim('No skills found. Install one with: skill-manager install <github-url>');
    console.log();
    return;
  }

  console.log(colorize(`  Found ${skills.length} skill(s):`, c.gray));
  console.log();

  for (const skill of skills) {
    const health = skill.health;
    const grade = health ? colorize(`[${health.grade}]`, getGradeColor(health.grade)) : colorize('[?]', c.gray);
    const score = health ? colorize(`${health.score}`, getScoreColor(health.score)) : colorize('N/A', c.gray);
    const linked = skill.linked ? colorize('linked', c.green) : colorize('local', c.dim);

    console.log(`  ${grade} ${colorize(skill.name, c.bold)} ${colorize(`(score: ${score})`, c.dim)} — ${linked}`);

    if (skill.platforms.length > 0) {
      printDim(`    platforms: ${skill.platforms.join(', ')}`);
    }
    if (skill.isDuplicate) {
      console.log(colorize(`    ! duplicate detected`, c.yellow));
    }
  }
  console.log();
}

/** Search skills by name. */
async function searchSkills(query: string): Promise<void> {
  if (!query) {
    printError('Search query is required. Usage: skill-manager search <query>');
    return;
  }

  printHeader(`Search: "${query}"`);
  const res = await http.get('/skills');
  const allSkills = res.data;

  if (!isSkillEntryArray(allSkills)) {
    printError('Unexpected response format from server.');
    return;
  }

  const q = query.toLowerCase();
  const results = allSkills.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.type.toLowerCase().includes(q) ||
    s.platforms.some(p => p.toLowerCase().includes(q))
  );

  if (results.length === 0) {
    printDim(`No skills matching "${query}".`);
    console.log();
    return;
  }

  console.log(colorize(`  ${results.length} match(es):`, c.gray));
  console.log();

  for (const skill of results) {
    const health = skill.health;
    const grade = health ? colorize(`[${health.grade}]`, getGradeColor(health.grade)) : colorize('[?]', c.gray);
    console.log(`  ${grade} ${colorize(skill.name, c.bold)} — ${colorize(skill.type, c.dim)}`);
    printDim(`    path: ${skill.path}`);
  }
  console.log();
}

/** Run lint / health check on a skill. */
async function lintSkill(skillName: string): Promise<void> {
  if (!skillName) {
    printError('Skill name is required. Usage: skill-manager lint <skill-name>');
    return;
  }

  const res = await http.get('/skills');
  const allSkills = res.data;

  if (!isSkillEntryArray(allSkills)) {
    printError('Unexpected response format from server.');
    return;
  }

  const skill = allSkills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) {
    printError(`Skill "${skillName}" not found.`);
    return;
  }

  printHeader(`Lint Report: ${skill.name}`);

  const health = skill.health;
  if (!health) {
    printDim('No health data available for this skill.');
    console.log();
    return;
  }

  // Score & grade
  const grade = colorize(health.grade, getGradeColor(health.grade));
  const score = colorize(`${health.score}/100`, getScoreColor(health.score));
  console.log(`  ${colorize('Grade:', c.bold)} ${grade}    ${colorize('Score:', c.bold)} ${score}`);
  console.log();

  // Metrics
  const m = health.metrics;
  printInfo('Metrics:');
  printDim(`    Description length: ${m.descLength} chars`);
  printDim(`    File size:          ${m.fileSize} lines`);
  printDim(`    References:         ${m.refsCount} file(s)`);
  printDim(`    Has frontmatter:    ${m.hasFrontmatter ? 'yes' : 'no'}`);
  printDim(`    Has name:           ${m.hasName ? 'yes' : 'no'}`);
  printDim(`    Has description:    ${m.hasDescription ? 'yes' : 'no'}`);
  console.log();

  // Issues
  if (health.issues.length === 0) {
    printSuccess('No issues found. This skill passes all lint checks.');
  } else {
    printInfo(`Issues (${health.issues.length}):`);
    for (const issue of health.issues) {
      const levelTag = colorize(`[${issue.level.toUpperCase()}]`, getLevelColor(issue.level));
      const ignored = issue.ignored ? colorize(' (ignored)', c.dim) : '';
      console.log(`    ${levelTag} ${colorize(issue.rule, c.bold)}${ignored}`);
      console.log(colorize(`      ${issue.message}`, c.gray));
      if (issue.suggestion) {
        console.log(colorize(`      Suggestion: ${issue.suggestion}`, c.dim));
      }
    }
  }
  console.log();
}

/** Install a skill from a GitHub URL. */
async function installSkill(githubUrl: string): Promise<void> {
  if (!githubUrl) {
    printError('GitHub URL is required. Usage: skill-manager install <github-url>');
    return;
  }

  printHeader(`Installing from: ${githubUrl}`);
  printDim('Cloning repository and scanning for skills...');

  const res = await http.post('/import/github', { repoUrl: githubUrl });
  const data = res.data as ApiResponse & {
    imported?: string[];
    skillName?: string;
    path?: string;
    subSkills?: unknown[];
  };

  if (data.error) {
    printError(data.error);
    return;
  }

  if (Array.isArray(data.imported) && data.imported.length > 0) {
    printSuccess(`Successfully imported ${data.imported.length} skill(s):`);
    for (const name of data.imported) {
      console.log(colorize(`    + ${name}`, c.green));
    }
  } else if (typeof data.skillName === 'string') {
    printSuccess(`Successfully imported: ${data.skillName}`);
  } else {
    printSuccess('Import completed.');
  }

  if (typeof data.path === 'string') {
    printDim(`    location: ${data.path}`);
  }
  console.log();
}

/** Trigger sync verification across all platforms. */
async function syncPlatforms(): Promise<void> {
  printHeader('Platform Sync');

  // Fetch all platforms to know what we are syncing
  const platformsRes = await http.get('/platforms');
  const platforms = platformsRes.data;

  if (!isPlatformInfoArray(platforms)) {
    printError('Unexpected response format from server.');
    return;
  }

  const installed = platforms.filter(p => p.installed);

  if (installed.length === 0) {
    printDim('No installed AI platforms detected.');
    console.log();
    return;
  }

  console.log(colorize(`  Verifying sync for ${installed.length} platform(s):`, c.gray));
  console.log();

  for (const platform of installed) {
    try {
      const verifyRes = await http.get(`/sync/verify/${encodeURIComponent(platform.id)}`);
      const report = verifyRes.data as SyncVerifyReport;

      const status = report.missing === 0 && report.broken === 0
        ? colorize('OK', c.green)
        : colorize('NEEDS ATTENTION', c.yellow);

      console.log(`  ${status}  ${colorize(platform.name, c.bold)}`);
      printDim(`    synced: ${report.synced}  missing: ${report.missing}  broken: ${report.broken}`);
    } catch {
      console.log(`  ${colorize('ERROR', c.red)}  ${colorize(platform.name, c.bold)}`);
      printDim(`    could not verify this platform`);
    }
  }
  console.log();
  printInfo('Sync verification complete. Use the web UI to fix any issues.');
  console.log();
}

/** Show detailed info about a skill. */
async function skillInfo(skillName: string): Promise<void> {
  if (!skillName) {
    printError('Skill name is required. Usage: skill-manager info <skill-name>');
    return;
  }

  const res = await http.get('/skills');
  const allSkills = res.data;

  if (!isSkillEntryArray(allSkills)) {
    printError('Unexpected response format from server.');
    return;
  }

  const skill = allSkills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) {
    printError(`Skill "${skillName}" not found.`);
    return;
  }

  printHeader(`Skill: ${skill.name}`);

  console.log(`  ${colorize('Name:', c.bold)}          ${skill.name}`);
  console.log(`  ${colorize('Type:', c.bold)}          ${skill.type}`);
  console.log(`  ${colorize('Source Type:', c.bold)}   ${skill.sourceType}`);
  console.log(`  ${colorize('Path:', c.bold)}          ${colorize(skill.path, c.dim)}`);
  console.log(`  ${colorize('Modified:', c.bold)}      ${skill.modifiedTime || 'unknown'}`);
  console.log(`  ${colorize('Linked:', c.bold)}        ${skill.linked ? 'yes' : 'no'} (${skill.linkedCount} link(s))`);
  console.log(`  ${colorize('Duplicate:', c.bold)}     ${skill.isDuplicate ? colorize('yes', c.yellow) : 'no'}`);

  if (skill.platforms.length > 0) {
    console.log(`  ${colorize('Platforms:', c.bold)}    ${skill.platforms.join(', ')}`);
  }

  if (skill.sources.length > 0) {
    console.log();
    printInfo('Sources:');
    for (const src of skill.sources) {
      console.log(`    ${colorize(src.platform, c.bold)} — ${colorize(src.path, c.dim)} (${src.type})`);
    }
  }

  const health = skill.health;
  if (health) {
    console.log();
    printInfo('Health:');
    const grade = colorize(health.grade, getGradeColor(health.grade));
    const score = colorize(`${health.score}/100`, getScoreColor(health.score));
    console.log(`    Grade: ${grade}    Score: ${score}    Issues: ${health.issues.length}`);

    if (health.issues.length > 0) {
      const errors = health.issues.filter(i => i.level === 'error').length;
      const warnings = health.issues.filter(i => i.level === 'warning').length;
      const infos = health.issues.filter(i => i.level === 'info').length;
      printDim(`    Breakdown: ${errors} error(s), ${warnings} warning(s), ${infos} info`);
    }
  }

  console.log();
}

/** Show CLI version. */
function showVersion(): void {
  console.log(colorize(`  skill-manager v${CLI_VERSION}`, c.bold));
  printDim(`  Backend API: ${API_BASE}`);
  console.log();
}

/** Show help message. */
function showHelp(): void {
  console.log();
  console.log(colorize('  skill-manager', c.bold + c.cyan) + colorize(` v${CLI_VERSION}`, c.dim));
  console.log(colorize('  Command-line interface for the Skill Manager backend.', c.gray));
  console.log();
  console.log(colorize('  USAGE', c.bold));
  console.log(colorize('    skill-manager <command> [arguments]', c.dim));
  console.log();
  console.log(colorize('  COMMANDS', c.bold));
  console.log(`    ${colorize('list, ls', c.green)}             List all installed skills`);
  console.log(`    ${colorize('search <query>', c.green)}       Search skills by name`);
  console.log(`    ${colorize('lint <skill-name>', c.green)}    Run lint / health check on a skill`);
  console.log(`    ${colorize('install <github-url>', c.green)} Install a skill from a GitHub URL`);
  console.log(`    ${colorize('sync', c.green)}                 Trigger sync verification across platforms`);
  console.log(`    ${colorize('info <skill-name>', c.green)}    Show detailed info about a skill`);
  console.log(`    ${colorize('version, v', c.green)}           Show CLI version`);
  console.log(`    ${colorize('help, h', c.green)}              Show this help message`);
  console.log();
  console.log(colorize('  EXAMPLES', c.bold));
  console.log(colorize('    skill-manager list', c.dim));
  console.log(colorize('    skill-manager search filesystem', c.dim));
  console.log(colorize('    skill-manager lint my-skill', c.dim));
  console.log(colorize('    skill-manager install https://github.com/user/repo', c.dim));
  console.log(colorize('    skill-manager info my-skill', c.dim));
  console.log();
  console.log(colorize('  The backend server must be running at http://localhost:3001', c.gray));
  console.log(colorize('  Start it with: pnpm server', c.gray));
  console.log();
}

// ==================== Main Entry ====================

/** Command handler type for dispatch table. */
type CommandHandler = (args: string[]) => Promise<void> | void;

const commands: Record<string, CommandHandler> = {
  list: (_args) => listSkills(),
  ls: (_args) => listSkills(),
  search: (args) => searchSkills(args[0] ?? ''),
  lint: (args) => lintSkill(args[0] ?? ''),
  install: (args) => installSkill(args[0] ?? ''),
  sync: (_args) => syncPlatforms(),
  info: (args) => skillInfo(args[0] ?? ''),
  version: (_args) => showVersion(),
  v: (_args) => showVersion(),
  help: (_args) => showHelp(),
  h: (_args) => showHelp(),
};

/**
 * Main entry point for the CLI.
 * Parses arguments using Node.js built-in parseArgs and dispatches
 * to the appropriate command handler.
 */
export async function main(): Promise<void> {
  const { positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    args: process.argv.slice(2),
  });

  const command = positionals[0] ?? '';
  const args = positionals.slice(1);

  if (!command) {
    showHelp();
    return;
  }

  const handler = commands[command];
  if (!handler) {
    printError(`Unknown command: "${command}"`);
    console.log();
    showHelp();
    process.exitCode = 1;
    return;
  }

  try {
    await handler(args);
  } catch (error) {
    handleError(error);
    process.exitCode = 1;
  }
}

// Run when executed directly (not imported)
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main();
}
