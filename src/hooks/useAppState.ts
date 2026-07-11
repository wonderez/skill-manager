import { useState, useRef } from 'react';
import type { Skill, Platform, KnownPackage, ManagedPath, SkillTemplate, GenerationResult, OptimizationSuggestion, InstallSecurityReport, BackdoorFinding, SandboxConfig, SkillManifest, ManifestValidation, CacheStats } from '../types';

export function useAppState() {
  // UI state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'market' | 'translate' | 'sync' | 'collections' | 'settings'>('dashboard');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [customPaths, setCustomPaths] = useState<string[]>([]);
  const [newCustomPath, setNewCustomPath] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTargetPlatform, setLinkTargetPlatform] = useState<string>('');
  const [linkConflicts, setLinkConflicts] = useState<any[]>([]);
  const [linkResolutions, setLinkResolutions] = useState<Record<string, 'overwrite' | 'skip' | 'keep-target'>>({});
  const [linkLoading, setLinkLoading] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareData, setCompareData] = useState<{ hubContent: string; targetContent: string; hubModified: string; targetModified: string } | null>(null);
  const [compareSkillName, setCompareSkillName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', description: '', template: 'basic' });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'health' | 'modified' | 'platforms'>('name');

  // Managed Paths state
  const [managedPaths, setManagedPaths] = useState<ManagedPath[]>([]);
  // pathFilter: 默认 'universal'（.agents/skills），也可选具体 managedPath.path
  const [pathFilter, setPathFilter] = useState<string>('universal');
  // secondaryFilter: 'all' | 'private' | 'platform' | 'duplicates'
  const [secondaryFilter, setSecondaryFilter] = useState<string>('all');
  // Skill action modal
  const [showSkillActionModal, setShowSkillActionModal] = useState(false);
  const [skillActionTarget, setSkillActionTarget] = useState<Skill | null>(null);

  // v1.0: Format Translator state
  const [transpileTargetSkill, setTranspileTargetSkill] = useState<Skill | null>(null);
  const [transpileTargetDir, setTranspileTargetDir] = useState('');
  const [selectedTranspileFormat, setSelectedTranspileFormat] = useState('cursor');

  // Git bind modal
  const [showGitBindModal, setShowGitBindModal] = useState(false);
  const [gitBindUrl, setGitBindUrl] = useState('');

  // API data state
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [knownPackages, setKnownPackages] = useState<KnownPackage[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>({ clientPaths: [], tools: [], customPaths: [], managedPaths: [] });
  const [syncing, setSyncing] = useState(false);
  const [transpileFormats, setTranspileFormats] = useState<string[]>([]);
  const [transpilePreview, setTranspilePreview] = useState<any>(null);
  const [translateSearch, setTranslateSearch] = useState('');
  const [translateSelected, setTranslateSelected] = useState<string[]>([]);
  const [syncConflicts, setSyncConflicts] = useState<any[]>([]);
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [syncGroups, setSyncGroups] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSkills, setNewGroupSkills] = useState('');
  const [marketResults, setMarketResults] = useState<any[]>([]);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketCategory, setMarketCategory] = useState('all');
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [newMcp, setNewMcp] = useState({ name: '', command: '', args: '', description: '' });
  const [marketStats, setMarketStats] = useState<any>(null);

  // Refs
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // AI Generation state
  const [showAiGenerateModal, setShowAiGenerateModal] = useState(false);
  const [aiTemplates, setAiTemplates] = useState<SkillTemplate[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<GenerationResult | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [showAiOptimize, setShowAiOptimize] = useState(false);

  // Security Gateway state
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityReport, setSecurityReport] = useState<InstallSecurityReport | null>(null);
  const [backdoorResults, setBackdoorResults] = useState<BackdoorFinding[]>([]);
  const [backdoorScanned, setBackdoorScanned] = useState(false);
  const [sandboxConfig, setSandboxConfig] = useState<SandboxConfig | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  // Manifest state
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [manifestData, setManifestData] = useState<SkillManifest | null>(null);
  const [manifestValidation, setManifestValidation] = useState<ManifestValidation | null>(null);
  const [manifestEditing, setManifestEditing] = useState(false);

  // Cache Management state
  const [showCachePanel, setShowCachePanel] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  return {
    activeTab, setActiveTab,
    selectedSkill, setSelectedSkill,
    showHistory, setShowHistory,
    history, setHistory,
    showHealthDetails, setShowHealthDetails,
    customPaths, setCustomPaths,
    newCustomPath, setNewCustomPath,
    selectedSkillIds, setSelectedSkillIds,
    showLinkModal, setShowLinkModal,
    linkTargetPlatform, setLinkTargetPlatform,
    linkConflicts, setLinkConflicts,
    linkResolutions, setLinkResolutions,
    linkLoading, setLinkLoading,
    showCompareModal, setShowCompareModal,
    compareData, setCompareData,
    compareSkillName, setCompareSkillName,
    showCreateModal, setShowCreateModal,
    newSkill, setNewSkill,
    viewMode, setViewMode,
    sortBy, setSortBy,
    managedPaths, setManagedPaths,
    pathFilter, setPathFilter,
    secondaryFilter, setSecondaryFilter,
    showSkillActionModal, setShowSkillActionModal,
    skillActionTarget, setSkillActionTarget,
    transpileTargetSkill, setTranspileTargetSkill,
    transpileTargetDir, setTranspileTargetDir,
    selectedTranspileFormat, setSelectedTranspileFormat,
    showGitBindModal, setShowGitBindModal,
    gitBindUrl, setGitBindUrl,
    platforms, setPlatforms,
    knownPackages, setKnownPackages,
    skills, setSkills,
    loading, setLoading,
    config, setConfig,
    syncing, setSyncing,
    transpileFormats, setTranspileFormats,
    transpilePreview, setTranspilePreview,
    translateSearch, setTranslateSearch,
    translateSelected, setTranslateSelected,
    syncConflicts, setSyncConflicts,
    gitStatus, setGitStatus,
    syncGroups, setSyncGroups,
    newGroupName, setNewGroupName,
    newGroupSkills, setNewGroupSkills,
    marketResults, setMarketResults,
    marketQuery, setMarketQuery,
    marketCategory, setMarketCategory,
    mcpServers, setMcpServers,
    newMcp, setNewMcp,
    marketStats, setMarketStats,
    openMenuId, setOpenMenuId,
    menuRef,
    // AI Generation
    showAiGenerateModal, setShowAiGenerateModal,
    aiTemplates, setAiTemplates,
    aiGenerating, setAiGenerating,
    aiResult, setAiResult,
    aiSuggestions, setAiSuggestions,
    showAiOptimize, setShowAiOptimize,
    // Security Gateway
    showSecurityModal, setShowSecurityModal,
    securityReport, setSecurityReport,
    backdoorResults, setBackdoorResults,
    backdoorScanned, setBackdoorScanned,
    sandboxConfig, setSandboxConfig,
    securityLoading, setSecurityLoading,
    // Manifest
    showManifestModal, setShowManifestModal,
    manifestData, setManifestData,
    manifestValidation, setManifestValidation,
    manifestEditing, setManifestEditing,
    // Cache
    showCachePanel, setShowCachePanel,
    cacheStats, setCacheStats,
  };
}
