// ==================== Types ====================

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export interface LintIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  suggestion?: string;
}

export interface SkillMetrics {
  descLength: number;
  fileSize: number;
  refsCount: number;
}

export interface LintResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: LintIssue[];
  metrics: SkillMetrics;
}

export interface SkillSourceInfo {
  path: string;
  managedPath: string;
  platformName: string;
  isUniversal: boolean;
  isSymlink: boolean;
  isRealFile: boolean;
  symlinkTarget: string;
  modifiedTime: string;
  health?: LintResult;
  isBroken?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  path: string;
  type: 'hub' | 'client';
  sourceType: 'hub' | 'junction' | 'agents-dir' | 'local';
  linked: boolean;
  linkedCount: number;
  modifiedTime: string;
  platforms?: {
    platformId: string;
    path: string;
    isLink: boolean;
    sourceType: 'junction' | 'agents-dir' | 'local';
  }[];
  status: 'synced' | 'local' | 'conflict';
  health?: LintResult;
  isCollection?: boolean;
  subSkills?: string[];
  sources?: SkillSourceInfo[];
  isDuplicate?: boolean;
}

export interface Platform {
  id: string;
  name: string;
  icon: string;
  discoveryMethod: string;
  skillsDir: string;
  installed: boolean;
  postInstallHint: string;
}

export interface KnownPackage {
  name: string;
  description: string;
  type: 'collection' | 'single';
  platforms: string[];
  installCommands: Record<string, string>;
  githubUrl: string;
  tags: string[];
}

export interface ManagedPath {
  path: string;
  platformName: string;
  isUniversal: boolean;
  isCustom: boolean;
  exists: boolean;
}

export interface LinkAction {
  skillName: string;
  type: 'missing-in-platform' | 'platform-new-candidate' | 'platform-specific' | 'conflict' | 'broken-link' | 'valid-link' | 'garbage';
  currentState: string;
  targetPath: string;
  reason: string;
  conflictDetails?: {
    platformSize: number;
    platformMtime: string;
    masterSize: number;
    masterMtime: string;
    masterHash?: string;
    platformHash?: string;
  };
  resolution?: 'skip' | 'symlink' | 'promote-and-symlink' | 'overwrite-with-master' | 'overwrite-with-platform' | 'remove' | 'promote-only';
}

export interface LinkPlan {
  platformDir: string;
  platformName: string;
  readsFromUniversal: boolean;
  actions: LinkAction[];
  summary: { toLink: number; toSkip: number; alreadyLinked: number; broken: number; };
}

export interface ClassificationResult {
  skillName: string;
  classification: 'universal' | 'platform-specific' | 'candidate-promote';
  confidence: number;
  platformHints: string[];
  existsInMaster: boolean;
  existsInPlatforms: string[];
  recommendation: string;
}

// ==================== Optimization Plan Types ====================

export interface TraceReport {
  completeness: number;
  triggerAccuracy: number;
  resourceRationality: number;
  overallScore: number;
  details: {
    hasInstructions: boolean;
    hasExamples: boolean;
    hasLimitations: boolean;
    descHasTrigger: boolean;
    descLength: number;
    hasReferences: boolean;
    refsCount: number;
    fileSize: number;
  };
}

export interface DuplicateLocation {
  platform: string;
  path: string;
  fileCount: number;
  size: number;
  skillMdHash: string | null;
}

export interface DuplicateEntry {
  skillName: string;
  locations: DuplicateLocation[];
  areIdentical: boolean;
  differences: string[];
}

export interface HealthReport {
  masterDir: string;
  totalDirectories: number;
  validSkills: number;
  missingSkillMd: string[];
  brokenJunctions: Array<{ platform: string; skillName: string; fullPath: string }>;
  redundantJunctions: Array<{ platform: string; skillName: string; fullPath: string }>;
  ignoredDirectories: string[];
  orphanedInPlatforms: Array<{ platform: string; skills: string[] }>;
  duplicates: DuplicateEntry[];
  timestamp: string;
}

export interface VerifyEntry {
  skillName: string;
  masterHash: string | null;
  platformHash: string | null;
  status: 'consistent' | 'inconsistent' | 'missing-in-master' | 'missing-in-platform';
}

export interface VerifyReport {
  platformId: string;
  platformDir: string;
  total: number;
  consistent: number;
  inconsistent: number;
  missingInMaster: number;
  missingInPlatform: number;
  entries: VerifyEntry[];
}

export interface VerifyAllReport {
  reports: VerifyReport[];
  summary: {
    totalPlatforms: number;
    totalSkills: number;
    totalConsistent: number;
    totalInconsistent: number;
  };
  timestamp: string;
}

export type CategoryId = 'document' | 'data' | 'content' | 'dev' | 'productivity' | 'api' | 'system' | 'uncategorized';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  nameEn: string;
  icon: string;
  keywords: string[];
  description: string;
}

export interface RegistryEntry {
  name: string;
  path: string;
  category: CategoryId;
  categoryConfidence: number;
  tags: string[];
  version: string | null;
  source: string | null;
  platforms: string[];
  qualityScore: number;
  qualityGrade: string;
  traceScore: TraceReport | null;
  linkedCount: number;
  modifiedTime: string;
  size: number;
}

export interface RegistryStats {
  totalSkills: number;
  categoryDistribution: Record<string, number>;
  qualityDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  averageTraceScore: number;
  lastBuiltAt: string | null;
}

export interface RegistryFile {
  entries: RegistryEntry[];
  stats: RegistryStats;
  builtAt: string;
  masterDir: string;
}

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

export interface ToolRegistryEntry {
  id: string;
  displayName: string;
  relativeSkillsDir: string;
  relativeDetectDir: string;
  installed: boolean;
}

export interface RecycleEntry {
  name: string;
  skillName: string;
  timestamp: string;
  path: string;
  size: number;
  fileCount: number;
}

export interface InstallResult {
  success: boolean;
  name: string;
  path: string;
  linkedPlatforms: string[];
  error?: string;
}

export interface UninstallResult {
  success: boolean;
  skillName: string;
  recycledPath: string;
  removedJunctions: string[];
  error?: string;
}

export interface IncrementalSyncReport {
  scannedSkills: number;
  changedSkills: string[];
  newSkills: string[];
  removedSkills: string[];
  platformsUpdated: string[];
  totalJunctionsCreated: number;
  totalJunctionsRemoved: number;
  duration: number;
}

// ==================== AI Generation Types ====================

export interface SkillTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  triggerKeywords: string[];
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

// ==================== Skill Manifest Types ====================

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  dependencies?: Array<{ name: string; version: string; source: string }>;
  platforms?: string[];
  permissions?: string[];
  entryPoint?: string;
  icon?: string;
  category?: string;
  tags?: string[];
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== Security Gateway Types ====================

export interface SecurityRisk {
  level: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  message: string;
  file?: string;
}

export interface InstallSecurityReport {
  skillName: string;
  passed: boolean;
  score: number;
  risks: SecurityRisk[];
  recommendations: string[];
  policyViolations: string[];
}

export interface BackdoorFinding {
  file: string;
  pattern: string;
  severity: string;
}

export interface SandboxConfig {
  readOnly: boolean;
  networkAccess: boolean;
  processSpawn: boolean;
}

// ==================== Cache Types ====================

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
}
