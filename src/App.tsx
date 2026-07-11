import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  Package,
  Link as LinkIcon,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Download,
  Github,
  CheckCircle2,
  AlertCircle,
  Wand2,
  History,
  Shield,
  Activity,
  FileText,
  FolderOpen,
  Globe,
  Languages,
  GitBranch,
  Cpu,
  Boxes,
  Zap,
  ArrowLeftRight,
  Server,
  Lock,
  Star,
  Sun,
  Moon,
  Database,
  X,
  MoreHorizontal,
  Inbox,
  CheckCheck,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  List,
  ArrowUpDown,
  RefreshCw,
  Edit2,
  Copy,
  Link2,
  FileArchive,
  Layers,
  Trophy,
  Terminal,
  BarChart2,
  ChevronDown,
  Wrench,
  XCircle,
  Eye,
  TrendingUp,
  GitFork,
  CheckSquare,
  Sparkles,
  ShieldCheck,
  FileJson,
  Save,
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

import { ToastContainer } from './components';
import type { Toast, Skill, KnownPackage, LinkAction } from './types';
import { TRANSLATIONS } from './translations';
import { useAppState } from './hooks';
import { useCollections } from './hooks/useCollections';
import { useOptimization } from './hooks/useOptimization';
import { CollectionsView } from './components/CollectionsView';
import { SkillMarkdownEditor } from './components/SkillMarkdownEditor';
import { EmptyState } from './components';
import { InlineModal } from './components';
import { Trash2, RotateCcw } from 'lucide-react';

const App: React.FC = () => {
  const [lang, setLang] = useState<'en'|'zh'>(navigator.language.startsWith('zh') ? 'zh' : 'en');
  const t = TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [aiGenerateForm, setAiGenerateForm] = useState<Record<string, string>>({});

  // Theme system
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Toast system
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((type: Toast['type'], title: string, message?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  // Aliases from hooks for JSX compatibility

  // P2-14: Global loading bar state
  const [globalLoading, setGlobalLoading] = useState(false);

  // Skill action menu
  // All state from useAppState hook
  const state = useAppState();
  const {
    activeTab, setActiveTab, selectedSkill, setSelectedSkill,
    showHistory, setShowHistory, history, setHistory,
    showHealthDetails, setShowHealthDetails,
    newCustomPath, setNewCustomPath,
    managedPaths, setManagedPaths,
    pathFilter, setPathFilter,
    secondaryFilter, setSecondaryFilter,
    showSkillActionModal, setShowSkillActionModal,
    skillActionTarget,
    selectedSkillIds, setSelectedSkillIds,
    showLinkModal, setShowLinkModal, linkTargetPlatform, setLinkTargetPlatform,
    linkConflicts, setLinkConflicts, linkResolutions, setLinkResolutions,
    linkLoading, setLinkLoading,
    showCompareModal, setShowCompareModal, compareData, setCompareData, compareSkillName, setCompareSkillName,
    showCreateModal, setShowCreateModal, newSkill, setNewSkill,
    viewMode, setViewMode, sortBy, setSortBy,
    selectedTranspileFormat, setSelectedTranspileFormat,
    setTranspileTargetSkill,
    setTranspileTargetDir,
    showGitBindModal, setShowGitBindModal, gitBindUrl, setGitBindUrl,
    platforms, setPlatforms, setKnownPackages,
    skills, setSkills, loading, setLoading, config, setConfig,
    transpileFormats, setTranspileFormats, transpilePreview, setTranspilePreview,
    translateSearch, setTranslateSearch, translateSelected, setTranslateSelected,
     gitStatus, setGitStatus,
    syncGroups, setSyncGroups, newGroupName, setNewGroupName,
    newGroupSkills, setNewGroupSkills,
    marketResults, setMarketResults, marketQuery, setMarketQuery,
    marketCategory, setMarketCategory, mcpServers, setMcpServers,
    newMcp, setNewMcp, setMarketStats,
    openMenuId, setOpenMenuId, menuRef,
    // AI Generation
    showAiGenerateModal, setShowAiGenerateModal,
    aiTemplates, setAiTemplates,
    aiGenerating, setAiGenerating,
    aiResult, setAiResult,
    // aiSuggestions and showAiOptimize reserved for future AI optimize panel
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
  } = state;

  // Memoized filtered & sorted skills — avoids recomputing on every render
  const filteredSkills = useMemo(() => {
    return skills
      .filter(s => {
        if (pathFilter === 'universal') {
          return s.sources?.some(src => src.isUniversal) || s.sourceType === 'agents-dir';
        }
        return s.sources?.some(src => src.managedPath === pathFilter) || s.path.startsWith(pathFilter);
      })
      .filter(s => {
        if (secondaryFilter === 'all') return true;
        if (secondaryFilter === 'private') {
          return !s.sources?.some(src => src.isUniversal);
        }
        if (secondaryFilter === 'platform') {
          return s.sources?.some(src => !src.isUniversal);
        }
        if (secondaryFilter === 'duplicates') {
          return s.isDuplicate;
        }
        return true;
      })
      .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'health') return (b.health?.score || 0) - (a.health?.score || 0);
        if (sortBy === 'modified') return new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime();
        if (sortBy === 'platforms') return (b.linkedCount || 0) - (a.linkedCount || 0);
        return 0;
      });
  }, [skills, pathFilter, secondaryFilter, searchQuery, sortBy]);

  // GitHub & Archive Import state
  const [marketTab, setMarketTab] = useState('leaderboard');
  const [marketLeaderboardTab, setMarketLeaderboardTab] = useState('total');
  const [githubImportUrl, setGithubImportUrl] = useState('');
  const [githubImporting, setGithubImporting] = useState(false);
  const [githubImportResult, setGithubImportResult] = useState<{ name: string; subSkills: Array<{ name: string }> } | null>(null);
  const [archivePath, setArchivePath] = useState('');
  const [archiveImporting, setArchiveImporting] = useState(false);

  // Collections hook + Markdown editor
  const collectionsApi = useCollections(toast, t);
  const { collections, loading: collectionsLoading } = collectionsApi;
  const [editingSkill, setEditingSkill] = useState<{ path: string; name: string } | null>(null);

  // Managed Paths local state
    const [optimizationPlan, setOptimizationPlan] = useState<any[]>([]);
  const [, setWizardResolutions] = useState<Record<string, Record<string, string>>>({});
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [, setShowMultiSyncModal] = useState(false);
  const [, setMultiSyncTargetSkill] = useState<any>(null);
  const [, setMultiSyncSelectedPlatforms] = useState<Set<string>>(new Set());
  
  const [, setCliExtensions] = useState<any[]>([]);
  
  const [optimizing, setOptimizing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<'scanning' | 'planning' | 'executing' | 'done'>('scanning');
  const [syncProgress, setSyncProgress] = useState('');
  const [syncResults, setSyncResults] = useState<string[]>([]);
const [scanningPaths, setScanningPaths] = useState(false);
  const [newManagedPathName, setNewManagedPathName] = useState('');
  const [importMode, setImportMode] = useState<'copy' | 'link'>('copy');

  // Optimization Plan hook
  const opt = useOptimization(toast, t);
  const {
    healthReport, healthLoading, fetchHealthCheck, fixHealthIssues,
    verifyReport, verifyLoading, fetchVerify,
    registry, registryStats, registryLoading, fetchRegistry, rebuildRegistry,
    categories,
    recycleEntries, recycleStats, fetchRecycleBin, restoreFromRecycle, purgeFromRecycle, purgeAllRecycle,
    toolRegistry, refreshToolRegistry,
    runIncrementalSync,
    incrementalReport,
    ignoreEntries, saveIgnoreEntries,
    // P1-8: wire up existing functions
    metadataValidations, fetchMetadataValidations, fixMetadata,
    activeTrace, traceLoading, fetchTrace,
    addTag: _addTag, removeTag,
    // P0-4: uninstall
    uninstallSkill,
  } = opt;

  // Optimization UI state
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [showRecyclePanel, setShowRecyclePanel] = useState(false);
  const [showIgnoreEditor, setShowIgnoreEditor] = useState(false);
  const [ignoreText, setIgnoreText] = useState('');
  const [showToolRegistry, setShowToolRegistry] = useState(false);

  // P0-2: Market data source switching
  const [marketSource, setMarketSource] = useState<'local' | 'github'>('local');
  const [githubMarketResults, setGithubMarketResults] = useState<any[]>([]);
  const [githubMarketLoading, setGithubMarketLoading] = useState(false);

  // P1-5: Dependency graph
  const [depGraph, setDepGraph] = useState<any>(null);
  const [showDepGraph, setShowDepGraph] = useState(false);

  // P2-8: Recycle bin batch restore
  const [selectedRecycleItems, setSelectedRecycleItems] = useState<string[]>([]);

  // P2-9: MCP config preview
  const [mcpConfigPreview, setMcpConfigPreview] = useState<string | null>(null);
  const [showMcpConfigModal, setShowMcpConfigModal] = useState(false);

  // P2-10: Collection import
  const [showImportCollectionModal, setShowImportCollectionModal] = useState(false);
  const [importCollectionData, setImportCollectionData] = useState('');

  // P2-11: Quality trend
  const [qualityTrend, setQualityTrend] = useState<any[]>([]);
  const [showQualityTrend, setShowQualityTrend] = useState(false);

  // Initialize data
  /* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchPlatforms();
    fetchPackages();
    fetchConfig();
    fetchSkills();
    fetchTranspileFormats();
    fetchSyncGroups();
    fetchMarketStats();
    fetchManagedPaths();
    fetchCustomPaths();
  }, []);
  /* eslint-enable react-hooks/immutability, react-hooks/exhaustive-deps */

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // P2-14: Global loading bar via axios interceptors
  useEffect(() => {
    const request = axios.interceptors.request.use(config => {
      setGlobalLoading(true);
      return config;
    });
    const response = axios.interceptors.response.use(
      resp => { setGlobalLoading(false); return resp; },
      error => { setGlobalLoading(false); return Promise.reject(error); }
    );
    return () => {
      axios.interceptors.request.eject(request);
      axios.interceptors.response.eject(response);
    };
  }, []);


  // Filtered and sorted skills


  const fetchPlatforms = async () => {
    try {
      const { data } = await axios.get('/api/platforms');
      setPlatforms(data);
    } catch (err) { toast('error', t.loadFailed, t.fetchPlatformsFailed); console.error('Failed to fetch platforms', err); }
  };

  const fetchPackages = async () => {
    try {
      const { data } = await axios.get('/api/packages');
      setKnownPackages(data);
    } catch (err) { toast('error', t.loadFailed, t.fetchPackagesFailed); console.error('Failed to fetch packages', err); }
  };


  const fetchConfig = async () => {
    try {
      const response = await axios.get('/api/config');
      setConfig(response.data);
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  };


  const fetchSkills = useCallback(async () => {
    try {
      const response = await axios.get('/api/skills');
      const mapped = response.data.map((s: any) => ({
        ...s,
        sourceType: s.sourceType || (s.type === 'hub' ? 'hub' : 'local'),
        linkedCount: s.linkedCount || 0,
        modifiedTime: s.modifiedTime || '',
        status: s.type === 'hub' ? 'synced' : 'local',
        platforms: (s.platforms || []).map((p: any) => ({
          ...p,
          sourceType: p.sourceType || (p.isLink ? 'junction' : 'local'),
        })),
      }));
      setSkills(mapped);
    } catch (err) {
      console.error('Failed to fetch skills', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // GitHub & Archive Import handlers (after fetchSkills declaration)
  const handleGithubImport = useCallback(async () => {
    const url = githubImportUrl.trim();
    if (!url) return;
    setGithubImporting(true);
    setGithubImportResult(null);
    try {
      const { data } = await axios.post('/api/import/github', { repoUrl: url });
      setGithubImportResult(data);
      setGithubImportUrl('');
      toast('success', t.importSuccess, `${data.name} — ${data.subSkills.length} skills`);
      fetchSkills();
    } catch (err: any) {
      toast('error', t.importFailed, err.response?.data?.error || err.message);
    } finally {
      setGithubImporting(false);
    }
  }, [githubImportUrl, t, fetchSkills, toast]);

  const handleArchiveImport = useCallback(async () => {
    if (!archivePath) return;
    setArchiveImporting(true);
    setGithubImportResult(null);
    try {
      const { data } = await axios.post('/api/import/archive', { archivePath });
      setGithubImportResult(data);
      setArchivePath('');
      toast('success', t.importSuccess, `${data.name} — ${data.subSkills.length} skills`);
      fetchSkills();
    } catch (err: any) {
      toast('error', t.importFailed, err.response?.data?.error || err.message);
    } finally {
      setArchiveImporting(false);
    }
  }, [archivePath, t, fetchSkills, toast]);

  // Apply theme to the document root
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Global keyboard shortcuts (must be after fetchSkills declaration)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape closes any open modal (works even when focused inside a form field)
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setShowHistory(false);
        setShowLinkModal(false);
        setShowCompareModal(false);
        setShowGitBindModal(false);
        setShowSkillActionModal(false);
        setShowHealthDetails(false);
        setShowOptimizationModal(false);
        setShowMultiSyncModal(false);
        setShowMcpConfigModal(false);
        setShowImportCollectionModal(false);
        setShowShortcutsHelp(false);
        setEditingSkill(null);
        return;
      }

      // Ignore the remaining shortcuts while typing in form fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        // Shift-modified shortcuts
        if (e.shiftKey) {
          switch (key) {
            case 's': e.preventDefault(); setShowMultiSyncModal(v => !v); break;                              // Ctrl+Shift+S — toggle sync modal
            case 't': e.preventDefault(); setTheme(prev => prev === 'dark' ? 'light' : 'dark'); break;        // Ctrl+Shift+T — toggle theme
            case '/':
            case '?': e.preventDefault(); setShowShortcutsHelp(v => !v); break;                              // Ctrl+? — shortcuts help
          }
          return;
        }
        switch (key) {
          case 'r': e.preventDefault(); fetchSkills(); break;                                               // Ctrl+R — refresh skills
          case 'n': e.preventDefault(); setShowCreateModal(true); break;                                    // Ctrl+N — new skill
          case '1': e.preventDefault(); setActiveTab('dashboard'); break;                                   // Ctrl+1 — dashboard
          case '2': e.preventDefault(); setActiveTab('market'); break;                                      // Ctrl+2 — market
          case '3': e.preventDefault(); setActiveTab('translate'); break;                                   // Ctrl+3 — translate
          case '4': e.preventDefault(); setActiveTab('sync'); break;                                        // Ctrl+4 — sync
          case '5': e.preventDefault(); setActiveTab('settings'); break;                                    // Ctrl+5 — settings
          case 'k': e.preventDefault(); document.querySelector<HTMLInputElement>('.search-input')?.focus(); break; // Ctrl+K — focus search
          case ',': e.preventDefault(); setActiveTab('settings'); break;                                    // Ctrl+, — go to settings
          case '/': e.preventDefault(); setLang(l => l === 'en' ? 'zh' : 'en'); break;                      // Ctrl+/ — toggle language
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);


  const _handleInstallToTarget = async (pkg: KnownPackage, platformId: string) => {
    setImporting(true);
    try {
      const { data } = await axios.post('/api/install', {
        platformId,
        source: {
          type: 'github',
          url: pkg.githubUrl,
          name: pkg.name,
          installCommand: pkg.installCommands[platformId]
        }
      });
      if (data.success) {
        toast('success', `"${pkg.name}" ${t.installed} ${platformId}`, data.postInstallSteps?.join('\n'));
        fetchSkills();
      } else {
        toast('error', t.installFailed, data.error);
      }
    } catch (err) {
      toast('error', t.installFailed, (err as any).response?.data?.error || (err as any).message);
    } finally {
      setImporting(false);
    }
  };



  const [importUrl, setImportUrl] = useState('');
  const [, setImporting] = useState(false);

  const _handleImport = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
      const { data } = await axios.post('/api/import/github', { url: importUrl });
      setImportUrl('');
      if (data.count > 1) {
        toast('success', `${t.collectionImportSuccess} ${data.count} ${t.skillsCount}: ${data.imported.join(', ')}`);
      } else {
        toast('success', `${t.skillName} "${data.imported[0]}" ${t.importSuccess}`);
      }
      fetchSkills();
      setActiveTab('dashboard');
    } catch (err) {
      toast('error', t.importFailed, (err as any).response?.data?.error || (err as any).message);
    } finally {
      setImporting(false);
    }
  };


  const syncSkill = async (skill: Skill) => {
    try {
      await axios.post('/api/sync/full');
      toast('success', `"${skill.name}" ${t.synced}`);
      fetchSkills();
    } catch (err) {
      toast('error', t.syncFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  /** Batch link selected skills to a target platform */
  const handleBatchLink = async () => {
    if (!linkTargetPlatform || selectedSkillIds.size === 0) return;
    setLinkLoading(true);
    try {
      const skillNames = skills
        .filter(s => selectedSkillIds.has(s.id))
        .map(s => s.name);

      const { data } = await axios.post('/api/sync/link', {
        skillNames,
        platformId: linkTargetPlatform,
        conflictResolution: linkResolutions,
      });

      if (data.conflicts.length > 0) {
        setLinkConflicts(data.conflicts);
        toast('warning', `${data.conflicts.length} ${t.conflictDetected}`, t.selectPlatform);
      } else {
        setLinkConflicts([]);
        toast('success', `${t.link} ${data.linked.length}`, data.skipped.length ? `${data.skipped.length}` : undefined);
        setShowLinkModal(false);
        setSelectedSkillIds(new Set());
        setLinkResolutions({});
        fetchSkills();
      }
    } catch (err) {
      toast('error', t.linkFailed, (err as any).response?.data?.error || (err as any).message);
    } finally {
      setLinkLoading(false);
    }
  };

  /** Compare a conflicted skill between Hub and target platform */

  const handleCompare = async (skillName: string) => {
    try {
      await axios.get('/api/sync/compare?skillName=' + encodeURIComponent(skillName) + '&platformId=' + linkTargetPlatform);
      setCompareSkillName(skillName);
      setShowCompareModal(true);
    } catch (err) {
      toast('error', t.compareFailed, (err as any).message);
    }
  };

  const handleRollback = async (timestamp: string) => {
    if (!selectedSkill) return;
    try {
      await axios.post('/api/skills/' + selectedSkill.name + '/rollback', { timestamp });
      toast('success', t.rollbackComplete);
      setShowHistory(false);
      fetchSkills();
    } catch (err: any) {
      toast('error', t.rollbackFailed, err.response?.data?.error || err.message);
    }
  };


  /** Toggle skill selection */
  const toggleSkillSelect = (id: string) => {
    setSelectedSkillIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** Select/deselect all filtered skills */
  const toggleSelectAll = () => {
    const filtered = skills
      .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (selectedSkillIds.size === filtered.length && filtered.every(s => selectedSkillIds.has(s.id))) {
      setSelectedSkillIds(new Set());
    } else {
      setSelectedSkillIds(new Set(filtered.map(s => s.id)));
    }
  };

  const handleOptimize = async (skill: Skill) => {
    try {
      const { data } = await axios.get(`/api/optimize/preview?path=${encodeURIComponent(skill.path)}`);
      if (confirm(t.confirmOptimize.replace('{name}', skill.name))) {
        await axios.post('/api/optimize/apply', { path: skill.path, content: data.optimized });
        toast('success', `"${skill.name}" ${t.optimize}`);
        fetchSkills();
      }
    } catch (err) {
      toast('error', t.optimizationFailed, (err as any).message);
    }
  };

  const handleCreateSkill = async () => {
    if (!newSkill.name) return;
    try {
      await axios.post('/api/skills/create', newSkill);
      setShowCreateModal(false);
      setNewSkill({ name: '', description: '', template: 'basic' });
      toast('success', `${t.skillName} "${newSkill.name}" ${t.create}`);
      fetchSkills();
    } catch (err) {
      toast('error', t.creationFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const _handleScan = async () => {
    try {
      const { data } = await axios.post('/api/config/scan');
      setConfig((prev: any) => ({ ...prev, clientPaths: data.paths }));
      toast('success', `${t.scan} ${data.paths.length}`);
      fetchSkills();
    } catch (err) {
      toast('error', t.scanFailed, (err as any).message);
    }
  };

  const fetchCustomPaths = async () => {
    try {
      await axios.get('/api/custom-paths');
      // customPaths 已被 managedPaths 取代，此处保留仅为向后兼容
    } catch (err) {
      console.error('Failed to fetch custom paths', err);
    }
  };

  // ==================== Managed Paths ====================

  const fetchManagedPaths = async () => {
    try {
      const { data } = await axios.get('/api/managed-paths');
      setManagedPaths(data.managedPaths || []);
    } catch (err) {
      console.error('Failed to fetch managed paths', err);
    }
  };

  const handleRescanPaths = async () => {
    setScanningPaths(true);
    try {
      const { data } = await axios.post('/api/managed-paths/scan');
      setManagedPaths(data.managedPaths || []);
      toast('success', `${t.scan} ${data.managedPaths.length}`);
      fetchSkills();
    } catch (err) {
      toast('error', t.scanFailed, (err as any).response?.data?.error || (err as any).message);
    } finally {
      setScanningPaths(false);
    }
  };

  const handleAddManagedPath = async () => {
    if (!newCustomPath.trim()) return;
    try {
      const { data } = await axios.post('/api/managed-paths', {
        path: newCustomPath.trim(),
        platformName: newManagedPathName.trim() || undefined,
      });
      setManagedPaths(data.managedPaths || []);
      if (data.added) {
        setNewCustomPath('');
        setNewManagedPathName('');
        toast('success', t.pathAdded);
        fetchSkills();
      } else {
        toast('warning', t.pathAlreadyExists);
      }
    } catch (err) {
      toast('error', t.addFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleEditManagedPath = async (originalPath: string, updated: any) => {
    try {
      const { data } = await axios.put('/api/managed-paths', { originalPath, updated });
      setManagedPaths(data.managedPaths || []);
      toast('success', t.pathUpdated);
    } catch (err) {
      toast('error', t.updateFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleRemoveManagedPath = async (p: string) => {
    try {
      const { data } = await axios.delete('/api/managed-paths', { data: { path: p } });
      setManagedPaths(data.managedPaths || []);
      toast('success', t.pathRemoved);
      fetchSkills();
    } catch (err) {
      toast('error', t.removeFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleImportToUniversal = async (sourcePath: string, skillName: string) => {
    try {
      const { data } = await axios.post('/api/skills/import-universal', {
        sourcePath,
        skillName,
        mode: importMode,
      });
      toast('success', `${t.import} "${skillName}" (${data.mode})`);
      setShowSkillActionModal(false);
      fetchSkills();
    } catch (err) {
      toast('error', t.importFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleBackupToHub = async (sourcePath: string, skillName: string) => {
    try {
      await axios.post('/api/skills/backup-hub', { sourcePath, skillName });
      toast('success', `${t.backupToHub} "${skillName}"`);
      setShowSkillActionModal(false);
    } catch (err) {
      toast('error', t.backupFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  // ==================== v1.0: Format Translator ====================

  const fetchTranspileFormats = async () => {
    try {
      const { data } = await axios.get('/api/transpile/formats');
      setTranspileFormats(data.formats);
    } catch (err) { toast('error', t.loadFailed, t.fetchFormatsFailed); console.error('Failed to fetch formats', err); }
  };

  const handleTranspilePreview = async (skill: Skill) => {
    try {
      const { data } = await axios.post('/api/transpile/preview', {
        skillPath: skill.path,
        format: selectedTranspileFormat,
      });
      setTranspilePreview(data);
    } catch (err) {
      toast('error', t.previewFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };


  const handleBatchTranslate = async () => {
    const selected = skills.filter(s => translateSelected.includes(s.id));
    if (selected.length === 0) return;
    let successCount = 0;
    let failCount = 0;
    for (const skill of selected) {
      try {
        const { data } = await axios.post('/api/transpile/install', {
          skillPath: skill.path,
          format: selectedTranspileFormat,
          targetDir: '',
        });
        if (data.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    toast(successCount > 0 ? 'success' : 'error', `${t.translateBtn}: ${successCount} / ${failCount}`);
    setTranslateSelected([]);
    fetchSkills();
  };

  const [showReverseCollectModal, setShowReverseCollectModal] = useState(false);
  const [reverseCollectDir, setReverseCollectDir] = useState('');

  const handleReverseCollect = async () => {
    if (!reverseCollectDir.trim()) return;
    try {
      const { data } = await axios.post('/api/transpile/reverse-collect', { dirPath: reverseCollectDir.trim() });
      toast('success', `${t.reverseCollect} ${data.collected.length}`);
      setShowReverseCollectModal(false);
      setReverseCollectDir('');
      fetchSkills();
    } catch (err) {
      toast('error', t.reverseCollectFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  // ==================== v2.0: Sync Engine ====================

      const fetchGitStatus = async () => {
    try {
      const { data } = await axios.get('/api/sync/git/status');
      setGitStatus(data);
    } catch (err) { toast('error', t.loadFailed, t.fetchGitStatusFailed); console.error('Failed to fetch git status', err); }
  };

  const handleGitBind = async () => {
    if (!gitBindUrl.trim()) return;
    try {
      const { data } = await axios.post('/api/sync/git/bind', { repoUrl: gitBindUrl.trim() });
      toast('success', data.message || t.bindRemote);
      setShowGitBindModal(false);
      setGitBindUrl('');
      fetchGitStatus();
    } catch (err) {
      toast('error', t.bindFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleGitPush = async () => {
    try {
      const { data } = await axios.post('/api/sync/git/push');
      toast('success', data.message || t.pushComplete);
      fetchGitStatus();
    } catch (err) {
      toast('error', t.pushFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleGitPull = async () => {
    try {
      const { data } = await axios.post('/api/sync/git/pull');
      toast('success', data.message || t.pullComplete);
      fetchSkills(); fetchGitStatus();
    } catch (err) {
      toast('error', t.pullFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const fetchSyncGroups = async () => {
    try {
      const { data } = await axios.get('/api/sync/groups');
      setSyncGroups(data.groups);
    } catch (err) { toast('error', t.loadFailed, t.fetchSyncGroupsFailed); console.error('Failed to fetch groups', err); }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName || !newGroupSkills) return;
    try {
      await axios.post('/api/sync/groups', {
        name: newGroupName,
        skills: newGroupSkills.split(',').map((s: string) => s.trim()).filter(Boolean),
      });
      setNewGroupName(''); setNewGroupSkills('');
      toast('success', `${t.syncGroup} "${newGroupName}" ${t.create}`);
      fetchSyncGroups();
    } catch (err) {
      toast('error', t.createGroupFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const [installGroupModal, setInstallGroupModal] = useState<{ name: string; platformId: string } | null>(null);

  const handleInstallGroup = async () => {
    if (!installGroupModal) return;
    const { name, platformId } = installGroupModal;
    if (!platformId.trim()) return;
    try {
      const { data } = await axios.post('/api/sync/groups/install', { name, platformId: platformId.trim() });
      toast('success', `${t.installed} ${data.installed.length} ${t.skillsCount} ${platformId}`);
      setInstallGroupModal(null);
      fetchSkills();
    } catch (err) {
      toast('error', t.installGroupFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  // ==================== v3.0: Market + MCP ====================

  const fetchMarketStats = async () => {
    try {
      const { data } = await axios.get('/api/market/stats');
      setMarketStats(data);
    } catch (err) { toast('error', t.loadFailed, t.fetchMarketStatsFailed); console.error('Failed to fetch market stats', err); }
  };

  const handleMarketSearch = async () => {
    try {
      const { data } = await axios.get(`/api/market/search?q=${encodeURIComponent(marketQuery)}&category=${marketCategory}`);
      setMarketResults(data.results);
    } catch (err) { toast('error', t.loadFailed, t.marketSearchFailed); console.error('Market search failed', err); }
  };

  const handleMarketInstall = async (skill: any) => {
    try {
      const { data } = await axios.post('/api/market/install', { name: skill.name });
      if (data.success) {
        toast('success', `${t.installed} "${skill.name}"`, data.message || '');
        fetchSkills();
      } else {
        toast('warning', t.installNoSuccess, data.message || '');
      }
    } catch (err) {
      toast('error', t.installFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  
  const fetchCliExtensions = async () => {
    try {
      const { data } = await axios.get('/api/cli/extensions');
      setCliExtensions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMcpServers = async () => {
    try {
      const { data } = await axios.get('/api/mcp');
      setMcpServers(data.servers || []);
    } catch (err) { toast('error', t.loadFailed, t.fetchMcpFailed); console.error('Failed to fetch MCP servers', err); }
  };

  const _handleAddMcp = async () => {
    if (!newMcp.name || !newMcp.command) return;
    try {
      const { data } = await axios.post('/api/mcp', {
        name: newMcp.name,
        command: newMcp.command,
        args: newMcp.args.split(' ').filter(Boolean),
        description: newMcp.description,
      });
      if (data.added) {
        setNewMcp({ name: '', command: '', args: '', description: '' });
        toast('success', `${t.mcpServer} "${newMcp.name}" ${t.added}`);
        fetchMcpServers();
    fetchCliExtensions();
      } else {
        toast('warning', t.mcpExists);
      }
    } catch (err) {
      toast('error', t.addMcpFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const _handleToggleMcp = async (name: string) => {
    try {
      await axios.post('/api/mcp/toggle', { name });
      fetchMcpServers();
    } catch (err) {
      toast('error', t.toggleFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const _handleRemoveMcp = async (name: string) => {
    try {
      await axios.delete('/api/mcp', { data: { name } });
      toast('success', `${t.mcpServer} "${name}" ${t.removed}`);
      fetchMcpServers();
    } catch (err) {
      toast('error', t.removeFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleLlmOptimize = async (skill: Skill) => {
    try {
      const { data } = await axios.get(`/api/llm-optimize/preview?path=${encodeURIComponent(skill.path)}`);
      if (confirm(t.confirmLlmOptimize.replace('{name}', skill.name).replace('{n}', String(data.changes.length)))) {
        await axios.post('/api/llm-optimize/apply', { path: skill.path, content: data.optimized });
        toast('success', `"${skill.name}" ${t.llmOptimized}`);
        fetchSkills();
      }
    } catch (err) {
      toast('error', t.llmOptFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  const handleSecurityAudit = async (skill: Skill) => {
    try {
      const { data } = await axios.post('/api/security/audit', { skillPath: skill.path });
      const riskCount = data.risks.length;
      if (riskCount === 0) {
        toast('success', `${t.securityAudit}: ${data.score}/100`, t.noIssuesFound);
      } else {
        toast(riskCount > 3 ? 'error' : 'warning', `${t.securityAudit}: ${data.score}/100`, `${riskCount} ${t.risksFound}: ${data.risks.slice(0, 3).map((r: any) => `[${r.level}] ${r.message}`).join('; ')}${riskCount > 3 ? '...' : ''}`);
      }
    } catch (err) {
      toast('error', t.auditFailed, (err as any).response?.data?.error || (err as any).message);
    }
  };

  // P0-4: Move skill to recycle bin (uninstall)
  const handleUninstallSkill = async (skillName: string) => {
    if (!confirm(t.confirmRecycle.replace('{name}', skillName))) return;
    const result = await uninstallSkill(skillName);
    if (result && result.success) {
      fetchSkills();
    }
  };

  // P1-8: Fix metadata by skill name (resolves skillPath from skills list)
  const handleFixMetadata = async (skillName: string) => {
    const skill = skills.find(s => s.name === skillName);
    if (!skill) {
      toast('error', t.skillNotFound, t.cannotLocateSkill.replace('{n}', skillName));
      return;
    }
    await fixMetadata(skill.path);
  };

  // P1-8: Run quality trace for the selected skill
  const handleRunTrace = async (skill: Skill) => {
    await fetchTrace(skill.path);
  };


  const handleInlineSync = async (skill: any, targetPlatform: any, actionType: string) => {
    try {
      if (actionType === 'promote') {
        const classResult = await axios.get('/api/link/plan?platformId=' + targetPlatform.id);
        const plan = classResult.data;
        const act = plan.actions.find((a: any) => a.skillName === skill.name);
        
        if (act && act.type === 'conflict') {
          // Show conflict modal
          setCompareSkillName(skill.name);
          setCompareData({
            hubContent: 'Platform modified at: ' + act.conflictDetails.platformMtime + ' \nSize: ' + act.conflictDetails.platformSize + ' bytes', hubModified: act.conflictDetails.platformMtime, targetModified: act.conflictDetails.masterMtime,
            targetContent: 'Master modified at: ' + act.conflictDetails.masterMtime + ' \nSize: ' + act.conflictDetails.masterSize + ' bytes'
          });
          setLinkResolutions({ ...linkResolutions, [skill.name]: 'promote-and-symlink' });
          setShowCompareModal(true);
        } else {
          await axios.post('/api/link/execute', { plan: { platformDir: targetPlatform.path, platformName: targetPlatform.name, actions: [{ skillName: skill.name, resolution: 'promote-and-symlink', targetPath: act?.targetPath || '' }] } });
          toast('success', t.promotedToMaster, skill.name);
          fetchSkills();
        }
      } else if (actionType === 'symlink') {
        const classResult = await axios.get('/api/link/plan?platformId=' + targetPlatform.id);
        const plan = classResult.data;
        const act = plan.actions.find((a: any) => a.skillName === skill.name);
        
        await axios.post('/api/link/execute', { plan: { platformDir: targetPlatform.path, platformName: targetPlatform.name, actions: [{ skillName: skill.name, resolution: 'symlink', targetPath: act?.targetPath || '' }] } });
        toast('success', t.symlinkedTo + targetPlatform.name, skill.name);
        fetchSkills();
      }
    } catch (err: any) {
      toast('error', t.actionFailed, err.message);
    }
  };

  // P0-2: GitHub marketplace handlers
  const fetchGithubCurated = useCallback(async () => {
    setGithubMarketLoading(true);
    try {
      const { data } = await axios.get('/api/marketplace/curated');
      setGithubMarketResults(data.data || data.skills || data.curated || data || []);
    } catch (err) {
      toast('error', t.loadFailed, t.fetchGithubCuratedFailed);
      console.error('Failed to fetch github curated', err);
    } finally {
      setGithubMarketLoading(false);
    }
  }, [toast]);

  const handleGithubMarketSearch = useCallback(async () => {
    if (!marketQuery.trim()) {
      fetchGithubCurated();
      return;
    }
    setGithubMarketLoading(true);
    try {
      const { data } = await axios.get(`/api/marketplace/search?q=${encodeURIComponent(marketQuery)}`);
      setGithubMarketResults(data.data || data.results || data.skills || data || []);
    } catch (err) {
      toast('error', t.loadFailed, t.githubSearchFailed);
      console.error('Github market search failed', err);
    } finally {
      setGithubMarketLoading(false);
    }
  }, [marketQuery, fetchGithubCurated, toast]);

  const handleGithubMarketInstall = useCallback(async (skill: any) => {
    try {
      const { data } = await axios.post('/api/marketplace/install', { name: skill.name, url: skill.url || skill.repo });
      if (data.success) {
        toast('success', `${t.installed} "${skill.name}"`, data.message || '');
        fetchSkills();
      } else {
        toast('warning', t.installNoSuccess, data.message || '');
      }
    } catch (err) {
      toast('error', t.installFailed, (err as any).response?.data?.error || (err as any).message);
    }
  }, [fetchSkills, toast]);

  // P1-5: Fetch dependency graph
  const fetchDepGraph = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/dependencies/graph');
      setDepGraph(data);
      setShowDepGraph(true);
    } catch {
      toast('error', t.loadDepGraphFailed);
    }
  }, [toast]);

  // P1-6: Check for skill updates
  const handleCheckUpdate = useCallback(async (skillName: string) => {
    try {
      const { data } = await axios.post(`/api/skills/${encodeURIComponent(skillName)}/update`);
      if (data.success) {
        toast('success', `"${skillName}" ${t.updatedToLatest}`);
        fetchSkills();
      } else {
        toast('info', data.message || t.alreadyLatest);
      }
    } catch (error) {
      toast('error', `${t.updateFailedMsg}: ${(error as any).response?.data?.error || (error as Error).message}`);
    }
  }, [fetchSkills, toast]);

  // P1-7: Cleanup redundant junctions
  const handleCleanupRedundant = useCallback(async () => {
    try {
      const { data } = await axios.post('/api/link/cleanup-redundant', {});
      toast('success', `${t.cleaned} ${data.totalDeleted} ${t.redundantLinks}`);
      fetchHealthCheck();
      fetchSkills();
    } catch {
      toast('error', t.cleanupFailed);
    }
  }, [fetchHealthCheck, fetchSkills, toast]);

  // P2-8: Batch restore from recycle bin
  const handleBatchRestore = useCallback(async () => {
    if (selectedRecycleItems.length === 0) return;
    try {
      const { data } = await axios.post('/api/recycle-bin/batch-restore', { names: selectedRecycleItems });
      toast('success', `${t.restored} ${data.restored} ${t.skillsCount}`);
      setSelectedRecycleItems([]);
      fetchRecycleBin();
      fetchSkills();
    } catch {
      toast('error', t.batchRestoreFailed);
    }
  }, [selectedRecycleItems, fetchRecycleBin, fetchSkills, toast]);

  // P2-9: Preview MCP config
  const handlePreviewMcpConfig = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/mcp/claude-config');
      setMcpConfigPreview(JSON.stringify(data, null, 2));
      setShowMcpConfigModal(true);
    } catch {
      toast('error', t.fetchConfigFailed);
    }
  }, [toast]);

  // P2-10: Import collection
  const handleImportCollection = useCallback(async () => {
    try {
      const data = JSON.parse(importCollectionData);
      await axios.post('/api/collections/import', data);
      toast('success', t.collectionImportSuccess);
      setShowImportCollectionModal(false);
      setImportCollectionData('');
      collectionsApi.fetchAll();
    } catch {
      toast('error', t.importFormatError);
    }
  }, [importCollectionData, collectionsApi, toast]);

  // P2-11: Fetch quality trend
  const fetchQualityTrend = useCallback(async (skillName: string) => {
    try {
      const { data } = await axios.get(`/api/quality/trend/${encodeURIComponent(skillName)}`);
      setQualityTrend(data.trend || []);
      setShowQualityTrend(true);
    } catch {
      toast('error', t.fetchTrendFailed);
    }
  }, [toast]);

  const renderInlineBadges = (skill: any) => {
    if (pathFilter === 'universal' || pathFilter === '') {
      // Show which platforms have this symlinked
      return (
        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
          {platforms.filter(p => p.installed && p.id !== 'universal').map(plat => {
            const hasLink = skill.sources?.some((s: any) => s.platformName === plat.name && s.isSymlink);
            return (
              <span key={plat.id} className="badge clickable-badge" title={"Symlink to " + plat.name} onClick={() => handleInlineSync(skill, plat, hasLink ? '' : 'symlink')} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: hasLink ? 'var(--success)' : 'var(--text-muted)' }}>
                {plat.icon || '📁'} {hasLink ? '✅' : '❌'}
              </span>
            );
          })}
        </div>
      );
    } else {
      // Show if it exists in master
      const inMaster = skill.sources?.some((s: any) => s.isUniversal);
      const isSymlink = skill.sources?.find((s: any) => s.managedPath === pathFilter)?.isSymlink;
      if (isSymlink) return null; // no inline action if it's already a symlink
      
      const _currentPlatform = platforms.find(p => p.skillsDir === pathFilter);
      return (
        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
          <span className="badge clickable-badge" onClick={() => { setMultiSyncTargetSkill(skill); setMultiSyncSelectedPlatforms(new Set()); setShowMultiSyncModal(true); }} style={{ cursor: 'pointer', background: 'var(--accent-glow)', color: 'var(--accent-primary)', border: '1px solid var(--glass-border)' }}>
    {inMaster ? 'Sync Platforms' : 'Promote & Sync Platforms'}
  </span>
        </div>
      );
    }
  };



  return (

    <div className="app-container">

      {/* P2-14: Global loading bar */}
      {globalLoading && (
        <div className="global-loading-bar" />
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <Package size={28} />
          <span>SkillManager</span>
        </div>
        
        <nav className="nav-links">
          <div 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>{t.dashboard}</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'market' ? 'active' : ''}`}
            onClick={() => setActiveTab('market')}
          >
            <Search size={20} />
            <span>{t.market}</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'translate' ? 'active' : ''}`}
            onClick={() => setActiveTab('translate')}
          >
            <Languages size={20} />
            <span>{t.translate}</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            <ArrowLeftRight size={20} />
            <span>{t.syncNav}</span>
          </div>
          <div
            className={`nav-item ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => setActiveTab('collections')}
          >
            <Layers size={20} />
            <span>{t.collectionsTitle}</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={20} />
            <span>{t.settings}</span>
          </div>
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            className="nav-item"
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? t.lightMode : t.darkMode}
            style={{ padding: '0.75rem', cursor: 'pointer', background: 'var(--bg-tertiary)', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? t.lightMode : t.darkMode}
          </div>
          <div 
            className="nav-item" 
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            style={{ padding: '0.75rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', justifyContent: 'center' }}
          >
            <Globe size={18} style={{ marginRight: '0.5rem' }} />
            {lang === 'en' ? '中文' : 'English'}
          </div>
          <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.storage}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span>{t.hubUsage}</span>
              <span>128 MB</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div className="title-group">
            <h1>{activeTab === 'dashboard' ? t.title : activeTab === 'market' ? t.market : activeTab === 'translate' ? t.formatTranslator : activeTab === 'sync' ? t.syncEngine : activeTab === 'collections' ? t.collectionsTitle : t.settings}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn-outline" onClick={fetchSkills}>
              <RefreshCcw size={18} />
              {t.refresh}
            </button>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              {t.newSkill}
            </button>
            <button className="btn-outline" onClick={async () => {
              try {
                const { data } = await axios.get('/api/ai/templates');
                setAiTemplates(data.templates || []);
                setAiResult(null);
                setShowAiGenerateModal(true);
              } catch { alert(t.generateFailed); }
            }}>
              <Sparkles size={18} />
              {t.aiGenerate}
            </button>
            <button className="btn-outline" onClick={async () => {
              if (!selectedSkill) { alert(t.selectSkill); return; }
              setShowSecurityModal(true);
              setSecurityLoading(true);
              setSecurityReport(null);
              try {
                const { data } = await axios.post('/api/security/gateway/check', { skillName: selectedSkill.name });
                setSecurityReport(data);
              } catch { alert(t.securityCheck + ' failed'); }
              finally { setSecurityLoading(false); }
            }}>
              <ShieldCheck size={18} />
              {t.securityCheck}
            </button>
            <button className="btn-outline" onClick={async () => {
              if (!selectedSkill) { alert(t.selectSkill); return; }
              setShowManifestModal(true);
              setManifestData(null);
              setManifestValidation(null);
              setManifestEditing(false);
              try {
                const { data } = await axios.get(`/api/manifest/${selectedSkill.name}`);
                setManifestData(data.manifest);
              } catch { /* no manifest yet */ }
            }}>
              <FileJson size={18} />
              {t.manifest}
            </button>
            <button className="btn-primary" onClick={async () => {
              setSyncPhase('scanning');
              setOptimizationPlan([]);
              setSyncProgress(t.initializing);
              setSyncResults([]);
              setShowOptimizationModal(true);
              
              // Run the background scanning flow right after opening modal
              try {
                const plans = [];
                const initRes: Record<string, Record<string, string>> = {};
                const installed = platforms.filter(p => p.installed);
                for (let i = 0; i < installed.length; i++) {
                  const platform = installed[i];
                  setSyncProgress(`${t.scanning} ${platform.name}... (${i + 1}/${installed.length})`);
                  const { data: plan } = await axios.get('/api/link/plan?platformId=' + platform.id);
                  if (plan.actions.length > 0) {
                    plans.push(plan);
                    initRes[plan.platformName] = {};
                    plan.actions.forEach((a: any) => {
                      initRes[plan.platformName][a.skillName] = a.resolution || 'skip';
                    });
                  }
                }
                setOptimizationPlan(plans);
                setWizardResolutions(initRes);
                setSyncPhase('planning'); // Move to planning phase to let user review
              } catch (err: any) {
                toast('error', t.analysisFailed, err.response?.data?.error || err.message);
                setShowOptimizationModal(false);
              }
            }}>
              <Zap size={16} />
              {t.syncOptimize}
            </button>
          </div>
        </header>
        {activeTab === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {loading && (
              <div className="skills-grid">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="glass-card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
                        <div>
                          <div className="skeleton" style={{ width: '120px', height: '16px', marginBottom: '6px' }} />
                          <div className="skeleton" style={{ width: '60px', height: '12px' }} />
                        </div>
                      </div>
                      <div className="skeleton" style={{ width: '50px', height: '20px', borderRadius: '10px' }} />
                    </div>
                    <div className="skeleton" style={{ width: '100%', height: '6px', borderRadius: '3px', marginBottom: '1rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <div className="skeleton" style={{ width: '60px', height: '12px' }} />
                      <div className="skeleton" style={{ width: '40px', height: '12px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                      <div className="skeleton" style={{ flex: 1, height: '36px', borderRadius: '8px' }} />
                      <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Stats */}
            <div className="stats-grid">
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.total}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700 }}>{skills.length}</div>
              </div>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.syncedStat}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)' }}>
                  {skills.filter(s => s.type === 'hub').length}
                </div>
              </div>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.local}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--warning)' }}>
                  {skills.filter(s => s.type === 'client').length}
                </div>
              </div>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={14} /> {t.agentsDir}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>
                  {skills.filter(s => s.sourceType === 'agents-dir').length}
                </div>
              </div>
            </div>

            {/* Optimization Plan: Quality Report Toggle */}
            <div style={{ marginBottom: '1rem' }}>
              <button className="btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => { setShowQualityPanel(!showQualityPanel); if (!showQualityPanel) { fetchRegistry(); } }}>
                <BarChart2 size={16} />
                {showQualityPanel ? t.hideQualityReport : t.showQualityReport}
              </button>
            </div>

            {/* Optimization Plan: Quality Report Panel */}
            {showQualityPanel && registry && registryStats && (
              <div className="glass-card" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart2 size={20} color="var(--accent-primary)" />
                  Quality Report
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    {registryStats.totalSkills} skills indexed
                  </span>
                  <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={rebuildRegistry} disabled={registryLoading}>
                    {registryLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                    Rebuild
                  </button>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  {/* Category Distribution */}
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>{t.categoryDistribution}</div>
                    {Object.entries(registryStats.categoryDistribution).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                      const catDef = categories.find(c => c.id === cat);
                      const pct = registryStats.totalSkills > 0 ? Math.round((count / registryStats.totalSkills) * 100) : 0;
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.8rem', width: '120px' }}>{catDef ? `${catDef.icon} ${catDef.name}` : cat}</span>
                          <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: 'var(--accent-primary)', transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '40px', textAlign: 'right' }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Quality Distribution */}
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>{t.qualityGradeDist}</div>
                    {['A', 'B', 'C', 'D', 'F'].map(grade => {
                      const count = registryStats.qualityDistribution[grade] || 0;
                      const pct = registryStats.totalSkills > 0 ? Math.round((count / registryStats.totalSkills) * 100) : 0;
                      const colors: Record<string, string> = { A: '#2ecc71', B: '#3498db', C: '#f39c12', D: '#e67e22', F: '#e74c3c' };
                      return (
                        <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, width: '30px', color: colors[grade] }}>{grade}</span>
                          <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: colors[grade], transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '40px', textAlign: 'right' }}>{count}</span>
                        </div>
                      );
                    })}
                    {registryStats.averageTraceScore > 0 && (
                      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Average TRACE Score: <strong style={{ color: 'var(--accent-primary)' }}>{registryStats.averageTraceScore}/10</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="search-input"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                  borderRadius: '12px', color: 'var(--text-primary)', fontSize: '0.9rem',
                  outline: 'none', transition: 'border-color 0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              />
            </div>

            {/* Toolbar: Path Filters + Secondary Filters + View Mode + Sort + Select All */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* 一级筛选：路径来源（默认 universal） */}
              <button
                className={`btn-outline ${pathFilter === 'universal' ? 'active' : ''}`}
                style={{ background: pathFilter === 'universal' ? 'var(--accent-glow)' : 'transparent', color: pathFilter === 'universal' ? 'var(--accent-primary)' : 'inherit' }}
                onClick={() => setPathFilter('universal')}
              >
                <Globe size={14} /> {t.universalSkills}
              </button>
              {managedPaths.filter(mp => mp.exists && !mp.isUniversal).map(mp => (
                <button
                  key={mp.path}
                  className={`btn-outline ${pathFilter === mp.path ? 'active' : ''}`}
                  style={{ background: pathFilter === mp.path ? 'var(--accent-glow)' : 'transparent', color: pathFilter === mp.path ? 'var(--accent-primary)' : 'inherit' }}
                  onClick={() => setPathFilter(mp.path)}
                  title={mp.path}
                >
                  {mp.platformName}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {/* 二级筛选 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.5rem', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
                {(['all', 'private', 'platform', 'duplicates'] as const).map(key => (
                  <button
                    key={key}
                    className="btn-outline"
                    style={{
                      fontSize: '0.75rem', padding: '0.3rem 0.6rem',
                      background: secondaryFilter === key ? 'var(--accent-glow)' : 'transparent',
                      color: secondaryFilter === key ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                    onClick={() => setSecondaryFilter(key)}
                  >
                    {key === 'all' ? t.all : key === 'private' ? t.privateSkills : key === 'platform' ? t.platformSkills : t.duplicatesOnly}
                  </button>
                ))}
              </div>
              {/* Sort */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <ArrowUpDown size={14} style={{ color: 'var(--text-muted)' }} />
                {(['name', 'health', 'modified', 'platforms'] as const).map(key => (
                  <button
                    key={key}
                    className="btn-outline"
                    style={{
                      fontSize: '0.75rem', padding: '0.3rem 0.6rem',
                      background: sortBy === key ? 'var(--accent-glow)' : 'transparent',
                      color: sortBy === key ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                    onClick={() => setSortBy(key)}
                  >
                    {key === 'name' ? t.sortByName : key === 'health' ? t.sortByHealth : key === 'modified' ? t.sortByModified : t.sortByPlatforms}
                  </button>
                ))}
              </div>
              {/* View Mode */}
              <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '2px' }}>
                <button
                  className="btn-outline"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: viewMode === 'grid' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'grid' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  className="btn-outline"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: viewMode === 'list' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                  onClick={() => setViewMode('list')}
                >
                  <List size={14} />
                </button>
              </div>
              {/* Select All */}
              <button
                className="btn-outline"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', opacity: 0.8 }}
                onClick={toggleSelectAll}
              >
                {selectedSkillIds.size > 0 ? `${t.deselectAll} (${selectedSkillIds.size})` : t.selectAll}
              </button>
            </div>

            {/* Skills Display */}
            {(() => {
              const filtered = filteredSkills;

              if (filtered.length === 0) {
                return (
                  <EmptyState
                    icon={<Inbox size={48} />}
                    title={searchQuery ? t.noMatchingSkills : t.noSkillsFound}
                    description={searchQuery ? t.noMatchDesc.replace('{query}', searchQuery) : t.emptyDesc}
                    action={!searchQuery && (
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                        <button className="btn-primary" onClick={() => setActiveTab('market')}><Download size={16} /> {t.browseMarket}</button>
                        <button className="btn-outline" onClick={() => setShowCreateModal(true)}><Plus size={16} /> {t.createSkill}</button>
                      </div>
                    )}
                  />
                );
              }

              // List view

              const renderListSkill = (skill: any) => (
                      <div
                        key={skill.id}
                        className="glass-card"
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.75rem 1.25rem',
                          borderColor: selectedSkillIds.has(skill.id) ? 'var(--accent-primary)' : undefined,
                          transition: 'border-color 0.15s',
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          onClick={() => toggleSkillSelect(skill.id)}
                          style={{
                            width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                            border: selectedSkillIds.has(skill.id) ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)',
                            background: selectedSkillIds.has(skill.id) ? 'var(--accent-primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          {selectedSkillIds.has(skill.id) && <CheckCheck size={12} color="white" strokeWidth={3} />}
                        </div>
                        {/* Icon */}
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                          background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--accent-primary)',
                        }}>
                          {skill.sourceType === 'agents-dir' ? <Zap size={18} /> : skill.type === 'hub' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        </div>
                        {/* Name + meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.name}</span>
                            {skill.isCollection && (
                              <span className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)', fontSize: '0.55rem', flexShrink: 0 }}>
                                {t.collection}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {skill.isCollection ? `${skill.subSkills?.length || 0} ${t.subSkills}` : skill.modifiedTime ? new Date(skill.modifiedTime).toLocaleDateString() : ''}
                          </div>
                        </div>
                        {/* Health */}
                        <div style={{ width: '80px', flexShrink: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                            <span>{t.healthScore}</span>
                            <span style={{ fontWeight: 700, color: `var(--grade-${skill.health?.grade?.toLowerCase() || 'f'})` }}>
                              {skill.health?.grade || 'F'}
                            </span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${skill.health?.score || 0}%`, background: `var(--grade-${skill.health?.grade?.toLowerCase() || 'f'})`, borderRadius: '2px' }} />
                          </div>
                        </div>
                        {/* Status badge */}
                        {skill.sourceType === 'hub' && skill.linkedCount > 0 ? (
                          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                            <LinkIcon size={11} /> {skill.linkedCount} {t.linked}
                          </span>
                        ) : skill.sourceType === 'hub' ? (
                          <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)', flexShrink: 0 }}>{t.hub}</span>
                        ) : skill.sourceType === 'agents-dir' ? (
                          <span className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                            <Zap size={11} /> {t.agentsDir}
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ flexShrink: 0 }}>{t.localOnly}</span>
                        )}
                        {renderInlineBadges(skill)}
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                          <button
                            className="btn-primary"
                            style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                            onClick={() => syncSkill(skill)}
                            disabled={skill.type === 'hub'}
                          >
                            <LinkIcon size={14} /> {skill.type === 'hub' ? t.synced : t.sync}
                          </button>
                          <div className="action-menu-wrapper" ref={openMenuId === skill.id ? menuRef : undefined}>
                            <button
                              className="btn-outline"
                              style={{ padding: '0.35rem' }}
                              onClick={() => setOpenMenuId(openMenuId === skill.id ? null : skill.id)}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            <AnimatePresence>
                              {openMenuId === skill.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                  transition={{ duration: 0.12 }}
                                  className="action-dropdown"
                                >
                                  <button onClick={() => { handleOptimize(skill); setOpenMenuId(null); }}>
                                    <Wand2 size={14} /> {t.optimize}
                                  </button>
                                  <button onClick={() => { handleLlmOptimize(skill); setOpenMenuId(null); }}>
                                    <Cpu size={14} /> {t.llmOptimize}
                                  </button>
                                  <button onClick={() => { setEditingSkill({ path: skill.path, name: skill.name }); setOpenMenuId(null); }}>
                                    <FileText size={14} /> {t.edit} SKILL.md
                                  </button>
                                  <button onClick={() => { handleSecurityAudit(skill); setOpenMenuId(null); }}>
                                    <Lock size={14} /> {t.securityAudit}
                                  </button>
                                  <button onClick={() => { setSelectedSkill(skill); setShowHealthDetails(true); setOpenMenuId(null); }}>
                                    <Shield size={14} color={skill.health?.issues?.length ? 'var(--error)' : 'inherit'} /> {t.healthDetails}
                                  </button>
                                  <div className="dropdown-divider" />
                                  <button onClick={async () => {
                                    setSelectedSkill(skill);
                                    const res = await axios.get(`/api/skills/history?path=${encodeURIComponent(skill.path)}`);
                                    setHistory(res.data.snapshots);
                                    setShowHistory(true);
                                    setOpenMenuId(null);
                                  }}>
                                    <History size={14} /> {t.versionHistory}
                                  </button>
                                  <button onClick={() => { axios.post('/api/open-folder', { targetPath: skill.path }); setOpenMenuId(null); }}>
                                    <FolderOpen size={14} /> {t.openFolderAction}
                                  </button>
                                  <div className="dropdown-divider" />
                                  <button onClick={() => { handleCheckUpdate(skill.name); setOpenMenuId(null); }}>
                                    <RefreshCw size={14} /> {t.checkUpdate}
                                  </button>
                                  <button onClick={() => { fetchDepGraph(); setOpenMenuId(null); }}>
                                    <GitFork size={14} /> {t.dependencyGraph}
                                  </button>
                                  <button onClick={() => { handleUninstallSkill(skill.name); setOpenMenuId(null); }} style={{ color: 'var(--error)' }}>
                                    <Trash2 size={14} /> {t.moveToRecycleBin}
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    );

              const renderGridSkill = (skill: any) => (
                    <div
                      key={skill.id}
                      className="glass-card"
                      style={{
                        position: 'relative',
                        borderColor: selectedSkillIds.has(skill.id) ? 'var(--accent-primary)' : undefined,
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {/* Selection checkbox */}
                      <div
                        onClick={() => toggleSkillSelect(skill.id)}
                        style={{
                          position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 2,
                          width: '22px', height: '22px', borderRadius: '6px',
                          border: selectedSkillIds.has(skill.id) ? '2px solid var(--accent-primary)' : '2px solid var(--border-color)',
                          background: selectedSkillIds.has(skill.id) ? 'var(--accent-primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {selectedSkillIds.has(skill.id) && <CheckCheck size={14} color="white" strokeWidth={3} />}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', paddingLeft: '1.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: 'var(--accent-glow)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-primary)'
                          }}>
                            {skill.sourceType === 'agents-dir' ? <Zap size={24} /> : skill.type === 'hub' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {skill.name}
                              {skill.isCollection && (
                                <span className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)', fontSize: '0.6rem' }}>
                                  {t.collection}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {skill.isCollection ? `${skill.subSkills?.length || 0} ${t.subSkills}` : skill.modifiedTime ? new Date(skill.modifiedTime).toLocaleDateString() : ''}
                            </div>
                          </div>
                        </div>
                        {skill.description && (
                          <div
                            title={skill.description}
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-secondary)',
                              marginTop: '0.75rem',
                              marginBottom: '0.2rem',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: '1.4'
                            }}
                          >
                            {skill.description}
                          </div>
                        )}
                        {skill.sourceType === 'hub' && skill.linkedCount > 0 ? (
                          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <LinkIcon size={11} /> {skill.linkedCount} {t.linked}
                          </span>
                        ) : skill.sourceType === 'hub' ? (
                          <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)' }}>{t.hub}</span>
                        ) : skill.sourceType === 'agents-dir' ? (
                          <span className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Zap size={11} /> {t.agentsDir}
                          </span>
                        ) : (
                          <span className="badge badge-warning">{t.localOnly}</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                               <Activity size={12} /> {t.healthScore}
                            </span>
                            <span style={{
                              fontWeight: 700,
                              color: `var(--grade-${skill.health?.grade?.toLowerCase() || 'f'})`
                            }}>
                              {skill.health?.grade || 'F'} ({skill.health?.score || 0}%)
                            </span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${skill.health?.score || 0}%`,
                                background: `var(--grade-${skill.health?.grade?.toLowerCase() || 'f'})`,
                                borderRadius: '3px',
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        <span title={t.linesOfCode}><FileText size={12} style={{ verticalAlign: 'middle' }} /> {skill.health?.metrics?.fileSize || 0}L</span>
                        <span title={t.references}><Package size={12} style={{ verticalAlign: 'middle' }} /> {skill.health?.metrics?.refsCount || 0} {t.refs}</span>
                        <span title={t.descQuality}><Activity size={12} style={{ verticalAlign: 'middle' }} /> {skill.health?.metrics?.descLength || 0} {t.chars}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                        {skill.platforms?.map((pInfo: any) => {
                          const plat = platforms.find(p => p.id === pInfo.platformId);
                          const st = pInfo.sourceType || (pInfo.isLink ? 'junction' : 'local');
                          return (
                            <div
                              key={pInfo.platformId}
                              className="badge clickable-badge"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                cursor: 'pointer',
                                background: st === 'junction' ? 'rgba(16,185,129,0.1)' : st === 'agents-dir' ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.05)',
                                color: st === 'junction' ? 'var(--success)' : st === 'agents-dir' ? 'var(--warning)' : 'var(--text-secondary)',
                                border: '1px solid rgba(255,255,255,0.05)'
                              }}
                              onClick={() => axios.post('/api/open-folder', { targetPath: pInfo.path })}
                              title={pInfo.path}
                            >
                              {plat?.icon || '📁'}
                              {plat?.name || 'Generic'}
                              {st === 'junction' ? <LinkIcon size={12} /> : st === 'agents-dir' ? <Zap size={12} /> : <FolderOpen size={12} opacity={0.5} />}
                            </div>
                          );
                        })}
                      </div>

                      {/* ===== P1-8: Tag chips (display + delete) ===== */}
                      {skill.tags && skill.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                          {skill.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="badge"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--accent-glow)', color: 'var(--accent-primary)', fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}
                              title={tag}
                            >
                              <Star size={10} /> {tag}
                              <button
                                onClick={() => { removeTag(skill.name, tag); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', padding: 0, marginLeft: '0.1rem' }}
                                title={t.removeTag}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Sources / Duplicate info */}
                      {skill.isDuplicate && skill.sources && skill.sources.length > 1 && (
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(245,158,11,0.05)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--warning)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={12} /> {t.duplicate} ({skill.sources.length} {t.sources})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {skill.sources?.map((src: any, idx: number) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                <span style={{ padding: '0.1rem 0.3rem', borderRadius: '3px', background: src.isSymlink ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)', color: src.isSymlink ? '#22c55e' : 'var(--accent-primary)', flexShrink: 0 }}>
                                  {src.isSymlink ? <><Link2 size={10} /> {t.isSymlink}</> : <><Copy size={10} /> {t.isRealFile}</>}
                                </span>
                                <span style={{ padding: '0.1rem 0.3rem', borderRadius: '3px', background: src.isUniversal ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: src.isUniversal ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }}>
                                  {src.platformName}
                                </span>
                                <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={src.path}>
                                  {src.path}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Single source info (non-duplicate) */}
                      {!skill.isDuplicate && skill.sources && skill.sources.length === 1 && (
                        <div style={{ marginBottom: '1rem', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {skill.sources[0].isSymlink ? <Link2 size={12} color="#22c55e" /> : <Copy size={12} color="var(--accent-primary)" />}
                          <span style={{ padding: '0.1rem 0.3rem', borderRadius: '3px', background: skill.sources[0].isSymlink ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)', color: skill.sources[0].isSymlink ? '#22c55e' : 'var(--accent-primary)' }}>
                            {skill.sources[0].isSymlink ? t.isSymlink : t.isRealFile}
                          </span>
                          <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={skill.sources[0].path}>
                            {skill.sources[0].platformName}
                          </span>
                        </div>
                      )}

                      <div className="skill-card-actions" style={{ display: 'none' }}></div>
                      </div>
              );

              const renderSkillGroup = (title: string, groupSkills: any[]) => {
                if (groupSkills.length === 0) return null;
                if (title === 'Symlinked Skills') {
                  return (
                    <details style={{ marginBottom: '2rem' }}>
                      <summary style={{ cursor: 'pointer', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                        {title} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({groupSkills.length})</span>
                      </summary>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                        {groupSkills.map((skill: any) => (
                          <span key={skill.id} className="badge" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                            <LinkIcon size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle', color: 'var(--success)' }} />
                            {skill.name}
                          </span>
                        ))}
                      </div>
                    </details>
                  );
                }
                return (
                  <div style={{ marginBottom: '2rem' }}>
                    {title && <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', color: 'var(--text-secondary)' }}>{title} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({groupSkills.length})</span></h3>}
                    {viewMode === 'list' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {groupSkills.map(renderListSkill)}
                      </div>
                    ) : (
                      <div className="skills-grid">
                        {groupSkills.map(renderGridSkill)}
                      </div>
                    )}
                  </div>
                );
              };

              if (pathFilter === 'universal' || pathFilter === '') {
                return renderSkillGroup(t.universalSkills, filtered);
              } else {
                const localSkills = filtered.filter(s => s.sources?.find((src: any) => src.managedPath === pathFilter)?.isRealFile);
                const symlinkedSkills = filtered.filter(s => s.sources?.find((src: any) => src.managedPath === pathFilter)?.isSymlink);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {renderSkillGroup('', localSkills)}
                    {renderSkillGroup('Symlinked Skills', symlinkedSkills)}
                  </div>
                );
              }

            })()}
          </motion.div>
        )}


        {/* ==================== v1.0: Format Translator Tab ==================== */}
        {activeTab === 'translate' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Languages size={20} color="var(--accent-primary)" />
                Format Translator
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Translate SKILL.md to Cursor .mdc, Windsurf .windsurfrules, Copilot copilot-instructions.md, and Cline .clinerules formats.
              </p>

              {/* Format selector */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {transpileFormats.map(fmt => (
                  <button
                    key={fmt}
                    className={`btn-outline ${selectedTranspileFormat === fmt ? 'active' : ''}`}
                    style={{ background: selectedTranspileFormat === fmt ? 'var(--accent-glow)' : 'transparent', color: selectedTranspileFormat === fmt ? 'var(--accent-primary)' : 'inherit' }}
                    onClick={() => setSelectedTranspileFormat(fmt)}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              {/* Actions bar: search + reverse + batch */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder={t.filterSkillsPlaceholder}
                    value={translateSearch}
                    onChange={e => setTranslateSearch(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>
                <button className="btn-outline" onClick={() => setShowReverseCollectModal(true)}>
                  <ArrowLeftRight size={16} />
                  Reverse Collect
                </button>
                {translateSelected.length > 0 && (
                  <button className="btn-primary" onClick={handleBatchTranslate}>
                    <Languages size={16} />
                    Translate {translateSelected.length} Selected
                  </button>
                )}
              </div>

              {/* Skills grid with checkboxes */}
              {skills.filter(s => !translateSearch || s.name.toLowerCase().includes(translateSearch.toLowerCase())).length > 0 ? (
                <div className="skills-grid">
                  {skills.filter(s => !translateSearch || s.name.toLowerCase().includes(translateSearch.toLowerCase())).map(skill => {
                    const isSelected = translateSelected.includes(skill.id);
                    return (
                      <div key={skill.id} className="glass-card" style={{ borderColor: isSelected ? 'var(--accent-primary)' : undefined, position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => setTranslateSelected(prev => isSelected ? prev.filter(id => id !== skill.id) : [...prev, skill.id])}
                            style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </div>
                        <div style={{ fontWeight: 600, marginBottom: '0.5rem', paddingRight: '1.5rem' }}>{skill.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                          {skill.health?.metrics?.fileSize || 0} lines
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn-outline"
                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                            onClick={() => handleTranspilePreview(skill)}
                          >
                            Preview
                          </button>
                          <button
                            className="btn-primary"
                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                            onClick={() => {
                              setTranspileTargetSkill(skill);
                              setTranspileTargetDir('');
                            }}
                          >
                            Translate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<Languages size={36} />}
                  title={translateSearch ? 'No matching skills' : 'No skills available'}
                  description={translateSearch ? `No skills match "${translateSearch}". Try a different search term.` : 'Add skills to the hub first, then translate them to other formats.'}
                />
              )}
            </div>

            {transpilePreview && (
              <div className="glass-card" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>{t.translationPreview.replace('{fmt}', transpilePreview.format)}</h3>
                  <button className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setTranspilePreview(null)}>
                    <X size={14} /> {t.close}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--success)' }}>+{transpilePreview.linesAdded} {t.lines}</span>
                  <span style={{ color: 'var(--error)' }}>-{transpilePreview.linesRemoved} {t.lines}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{t.originalSkillMd}</div>
                    <pre style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', overflow: 'auto', maxHeight: '400px', fontSize: '0.75rem' }}>{transpilePreview.original}</pre>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>{t.translatedFmt.replace('{ext}', transpilePreview.extension)}</div>
                    <pre style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', overflow: 'auto', maxHeight: '400px', fontSize: '0.75rem' }}>{transpilePreview.translated}</pre>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}


        {/* ==================== v2.0: Sync Engine Tab ==================== */}
        {activeTab === 'sync' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="stats-grid" style={{ marginBottom: '2rem' }}>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.gitStatus}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{gitStatus?.initialized ? t.gitInitialized : t.gitNotInit}</div>
                {gitStatus?.remote && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{gitStatus.remote}</div>}
              </div>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.ahead}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{gitStatus?.ahead || 0}</div>
              </div>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.behind}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{gitStatus?.behind || 0}</div>
              </div>
              <div className="glass-card">
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.modified}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{gitStatus?.modified || 0}</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <GitBranch size={20} color="var(--accent-primary)" />
                Git Remote Sync
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-outline" onClick={() => setShowGitBindModal(true)}>
                  <Plus size={16} />
                  Bind Remote
                </button>
                <button className="btn-primary" onClick={handleGitPush} disabled={!gitStatus?.initialized}>
                  <ArrowLeftRight size={16} />
                  Push
                </button>
                <button className="btn-outline" onClick={handleGitPull} disabled={!gitStatus?.initialized}>
                  <Download size={16} />
                  Pull
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Boxes size={20} color="var(--accent-primary)" />
                Sync Groups
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input
                  type="text"
                  placeholder={t.groupNamePlaceholder}
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <input
                  type="text"
                  placeholder="skill1, skill2, skill3"
                  value={newGroupSkills}
                  onChange={e => setNewGroupSkills(e.target.value)}
                  style={{ flex: 2, padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <button className="btn-primary" onClick={handleCreateGroup}>
                  <Plus size={16} />
                  Create
                </button>
              </div>
              {syncGroups.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.noGroupsYet}</div>
              ) : (
                syncGroups.map((g, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{g.skills.length} skills: {g.skills.join(', ')}</div>
                    </div>
                    <button className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setInstallGroupModal({ name: g.name, platformId: '' })}>
                      Install
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* ===== Optimization Plan: Health Check ===== */}
            <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={20} color="var(--accent-primary)" />
                Health Check
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={fetchHealthCheck} disabled={healthLoading}>
                  {healthLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  Scan
                </button>
                {healthReport && ((healthReport.brokenJunctions.length > 0) || (healthReport.redundantJunctions?.length > 0)) && (
                  <button className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={fixHealthIssues}>
                    <Wrench size={14} />
                    Fix ({(healthReport.brokenJunctions?.length || 0) + (healthReport.redundantJunctions?.length || 0)})
                  </button>
                )}
              </h3>
              {healthReport ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{healthReport.validSkills}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.validSkills}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: (healthReport.missingSkillMd?.length || 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>{healthReport.missingSkillMd?.length || 0}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.missingSkillMd}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: (healthReport.brokenJunctions?.length || 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>{healthReport.brokenJunctions?.length || 0}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.brokenLinks}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: (healthReport.redundantJunctions?.length || 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>{healthReport.redundantJunctions?.length || 0}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.redundantLinks}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: (healthReport.duplicates?.length || 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>{healthReport.duplicates?.length || 0}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.duplicates}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{healthReport.ignoredDirectories?.length || 0}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.ignored}</div>
                    </div>
                  </div>
                  {/* Duplicate details */}
                  {(healthReport.duplicates?.length || 0) > 0 && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,193,7,0.05)', border: '1px solid rgba(255,193,7,0.2)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--warning)' }}>{t.duplicateSkillsDetected}</div>
                      {healthReport.duplicates.map((dup, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', marginBottom: '0.4rem', padding: '0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}>
                          <span style={{ fontWeight: 600 }}>{dup.skillName}</span>
                          <span style={{ marginLeft: '0.5rem', color: dup.areIdentical ? 'var(--success)' : 'var(--danger)' }}>
                            {dup.areIdentical ? `(${t.identical})` : `(${t.different})`}
                          </span>
                          {dup.differences.map((d, j) => (
                            <span key={j} style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>· {d}</span>
                          ))}
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                            {dup.locations.map(l => `[${l.platform}] ${l.fileCount}f/${Math.round(l.size / 1024)}KB`).join('  ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Redundant junction details */}
                  {(healthReport.redundantJunctions?.length || 0) > 0 && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span>{t.redundantLabel} {healthReport.redundantJunctions.map(r => r.skillName).join(', ')}</span>
                      <button className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={handleCleanupRedundant}>
                        <Trash2 size={12} /> {t.cleanupRedundantLinks}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>{t.clickScanToCheck}</div>
              )}
            </div>

            {/* ===== Optimization Plan: Content Hash Verify ===== */}
            <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={20} color="var(--accent-primary)" />
                Content Hash Verification
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={fetchVerify} disabled={verifyLoading}>
                  {verifyLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  Verify
                </button>
              </h3>
              {verifyReport ? (
                <div>
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--success)' }}>{t.consistentLabel} {verifyReport.summary.totalConsistent}</span>
                    <span style={{ color: 'var(--danger)' }}>{t.inconsistentLabel} {verifyReport.summary.totalInconsistent}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{t.platformsLabel} {verifyReport.summary.totalPlatforms}</span>
                  </div>
                  {verifyReport.reports.filter(r => r.inconsistent > 0 || r.missingInMaster > 0 || r.missingInPlatform > 0).map((r, i) => (
                    <div key={i} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.platformId}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {r.consistent} consistent, {r.inconsistent} inconsistent, {r.missingInPlatform} missing in platform, {r.missingInMaster} missing in master
                      </div>
                    </div>
                  ))}
                  {verifyReport.summary.totalInconsistent === 0 && (
                    <div style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{t.allConsistent}</div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>{t.clickVerifyToCheck}</div>
              )}
            </div>

            {/* ===== Optimization Plan: Incremental Sync ===== */}
            <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Zap size={20} color="var(--accent-primary)" />
                Incremental Sync
                <button className="btn-primary" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={runIncrementalSync}>
                  <RefreshCw size={14} />
                  Run Incremental
                </button>
              </h3>
              {incrementalReport ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t.changedLabel}</span> <strong style={{ color: 'var(--warning)' }}>{incrementalReport.changedSkills.length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t.newLabel}</span> <strong style={{ color: 'var(--success)' }}>{incrementalReport.newSkills.length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t.removedLabel}</span> <strong style={{ color: 'var(--danger)' }}>{incrementalReport.removedSkills.length}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t.junctionsCreated}</span> <strong>{incrementalReport.totalJunctionsCreated}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t.junctionsRemoved}</span> <strong>{incrementalReport.totalJunctionsRemoved}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>{t.durationLabel}</span> <strong>{incrementalReport.duration}ms</strong></div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>{t.runIncrementalHint}</div>
              )}
            </div>

            {/* ===== Optimization Plan: Recycle Bin ===== */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trash2 size={20} color="var(--accent-primary)" />
                Recycle Bin
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => { fetchRecycleBin(); setShowRecyclePanel(!showRecyclePanel); setSelectedRecycleItems([]); }}>
                  {showRecyclePanel ? t.hide : t.show}
                </button>
                {showRecyclePanel && recycleEntries.length > 0 && (
                  <>
                    <button className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => {
                      if (selectedRecycleItems.length === recycleEntries.length) {
                        setSelectedRecycleItems([]);
                      } else {
                        setSelectedRecycleItems(recycleEntries.map(e => e.name));
                      }
                    }}>
                      <CheckSquare size={12} /> {selectedRecycleItems.length === recycleEntries.length ? t.deselectAll : t.selectAll}
                    </button>
                    {selectedRecycleItems.length > 0 && (
                      <button className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleBatchRestore}>
                        <RotateCcw size={12} /> {t.batchRestore} ({selectedRecycleItems.length})
                      </button>
                    )}
                  </>
                )}
                {recycleStats && recycleStats.totalBackups > 0 && (
                  <button className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={purgeAllRecycle}>
                    Purge All
                  </button>
                )}
              </h3>
              {recycleStats && (
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <span>{t.backupsLabel} <strong>{recycleStats.totalBackups}</strong></span>
                  <span>{t.sizeLabel} <strong>{(recycleStats.totalSize / 1024 / 1024).toFixed(1)}MB</strong></span>
                </div>
              )}
              {showRecyclePanel && recycleEntries.length > 0 && (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {recycleEntries.map((entry, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '8px', background: selectedRecycleItems.includes(entry.name) ? 'var(--accent-glow)' : 'rgba(255,255,255,0.02)', marginBottom: '0.5rem', border: selectedRecycleItems.includes(entry.name) ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedRecycleItems.includes(entry.name)}
                          onChange={() => {
                            setSelectedRecycleItems(prev => prev.includes(entry.name) ? prev.filter(n => n !== entry.name) : [...prev, entry.name]);
                          }}
                          style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{entry.skillName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(entry.timestamp).toLocaleString()} - {(entry.size / 1024).toFixed(0)}KB</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => restoreFromRecycle(entry.name)}>
                          <RotateCcw size={12} />
                          Restore
                        </button>
                        <button className="btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => purgeFromRecycle(entry.name)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showRecyclePanel && recycleEntries.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>{t.recycleBinEmpty}</div>
              )}
            </div>
          </motion.div>
        )}

        {/* Floating batch action bar */}
        <AnimatePresence>
          {selectedSkillIds.size > 0 && activeTab === 'dashboard' && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
                zIndex: 100, display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.75rem 1.5rem', borderRadius: '16px',
                background: 'rgba(15,15,25,0.92)', backdropFilter: 'blur(20px)',
                border: '1px solid var(--border-color)', boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedSkillIds.size} {t.selected}
              </span>
              <button
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                onClick={() => { setShowLinkModal(true); setLinkConflicts([]); setLinkResolutions({}); }}
              >
                <LinkIcon size={15} /> {t.linkToPlatform}
              </button>
              <button
                className="btn-outline"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                onClick={() => {
                  setSelectedSkillIds(new Set());
                }}
              >
                <X size={15} /> {t.clear}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Link to Platform Modal */}
        {showLinkModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '2rem', maxWidth: '560px', width: '90%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border-color)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{t.linkTitle}</h2>
                <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {/* Selected skills summary */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {selectedSkillIds.size} {t.selected}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {skills.filter(s => selectedSkillIds.has(s.id)).map(s => (
                    <span key={s.id} className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>{s.name}</span>
                  ))}
                </div>
              </div>

              {/* Target platform selector */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>{t.targetPlatform}</label>
                <select
                  className="modal-input"
                  value={linkTargetPlatform}
                  onChange={e => setLinkTargetPlatform(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">{t.selectPlatform}</option>
                  {platforms.filter(p => p.installed).map(p => (
                    <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                  ))}
                </select>
              </div>

              {/* Conflicts */}
              {linkConflicts.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--error)', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertTriangle size={16} /> {linkConflicts.length} {t.conflictDetected}
                  </div>
                  {linkConflicts.map(c => (
                    <div key={c.name} style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '1rem', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        {t.hubVersion}: {new Date(c.hubModified).toLocaleString()} | {t.targetVersion}: {new Date(c.targetModified).toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn-outline"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => setLinkResolutions(prev => ({ ...prev, [c.name]: 'overwrite' }))}
                        >
                          {linkResolutions[c.name] === 'overwrite' ? '✓ ' : ''}{t.overwriteTarget}
                        </button>
                        <button
                          className="btn-outline"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => setLinkResolutions(prev => ({ ...prev, [c.name]: 'keep-target' }))}
                        >
                          {linkResolutions[c.name] === 'keep-target' ? '✓ ' : ''}{t.keepTarget}
                        </button>
                        <button
                          className="btn-outline"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => handleCompare(c.name)}
                        >
                          <ArrowLeftRight size={12} /> {t.compare}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn-outline" onClick={() => setShowLinkModal(false)}>{t.cancel}</button>
                <button
                  className="btn-primary"
                  disabled={!linkTargetPlatform || linkLoading}
                  onClick={handleBatchLink}
                >
                  {linkLoading ? <Loader2 size={16} className="spin" /> : <LinkIcon size={16} />}
                  {linkLoading ? t.linking : t.link}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Compare Modal */}
        {showCompareModal && compareData && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '2rem', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border-color)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t.compareTitle}: {compareSkillName}</h2>
                <button onClick={() => setShowCompareModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {t.hubVersion} {compareData.hubModified ? `(${new Date(compareData.hubModified).toLocaleString()})` : ''}
                  </div>
                  <pre style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '1rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '400px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {compareData.hubContent || '(empty)'}
                  </pre>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {t.targetVersion} {compareData.targetModified ? `(${new Date(compareData.targetModified).toLocaleString()})` : ''}
                  </div>
                  <pre style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '1rem', fontSize: '0.75rem', overflow: 'auto', maxHeight: '400px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {compareData.targetContent || '(empty)'}
                  </pre>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setLinkResolutions(prev => ({ ...prev, [compareSkillName]: 'overwrite' }));
                    setShowCompareModal(false);
                  }}
                >
                  {t.useHubVersion}
                </button>
                <button
                  className="btn-outline"
                  onClick={() => {
                    setLinkResolutions(prev => ({ ...prev, [compareSkillName]: 'keep-target' }));
                    setShowCompareModal(false);
                  }}
                >
                  {t.keepTargetVersion}
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {activeTab === 'market' && (
  <div style={{ display: 'flex', gap: '2rem', height: '100%', alignItems: 'flex-start' }}>
    {/* Sidebar */}
    <div className="glass-card" style={{ width: '240px', flexShrink: 0, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'sticky', top: '2rem' }}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t.marketplace}</h3>
      
      <button 
        className={`nav-item ${marketTab === 'leaderboard' ? 'active' : ''}`}
        onClick={() => setMarketTab('leaderboard')}
        style={{ padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'left' }}
      >
        <Trophy size={16} /> {t.leaderboards}
      </button>
      
      <button 
        className={`nav-item ${marketTab === 'mcp' ? 'active' : ''}`}
        onClick={() => setMarketTab('mcp')}
        style={{ padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'left' }}
      >
        <Server size={16} /> {t.mcpServers}
      </button>

      <button 
        className={`nav-item ${marketTab === 'cli' ? 'active' : ''}`}
        onClick={() => setMarketTab('cli')}
        style={{ padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'left' }}
      >
        <Terminal size={16} /> {t.cliExtensions}
      </button>
      
      <button 
        className={`nav-item ${marketTab === 'import' ? 'active' : ''}`}
        onClick={() => setMarketTab('import')}
        style={{ padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'left' }}
      >
        <Download size={16} /> {t.localImport}
      </button>
    </div>

    {/* Content Area */}
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* ----------------- LEADERBOARDS ----------------- */}
      {marketTab === 'leaderboard' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="glass-card" style={{ padding: '2rem' }}>
            {/* P0-2: Data source switcher */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button 
                className={`btn-outline ${marketSource === 'local' ? 'active' : ''}`}
                style={{ background: marketSource === 'local' ? 'var(--accent-glow)' : 'transparent', color: marketSource === 'local' ? 'var(--accent-primary)' : 'inherit' }}
                onClick={() => setMarketSource('local')}
              >
                <Database size={14} /> {t.localMarket}
              </button>
              <button 
                className={`btn-outline ${marketSource === 'github' ? 'active' : ''}`}
                style={{ background: marketSource === 'github' ? 'var(--accent-glow)' : 'transparent', color: marketSource === 'github' ? 'var(--accent-primary)' : 'inherit' }}
                onClick={() => { setMarketSource('github'); if (githubMarketResults.length === 0) fetchGithubCurated(); }}
              >
                <Github size={14} /> {t.githubCommunity}
              </button>
            </div>

            {marketSource === 'local' && (
            <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <BarChart2 size={24} color="var(--accent-primary)" />
                Community Rankings
              </h3>
              
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '0.25rem' }}>
                <button 
                  className={`btn-outline ${marketLeaderboardTab === 'total' ? 'active' : ''}`}
                  onClick={() => { setMarketLeaderboardTab('total'); setMarketCategory('all'); handleMarketSearch(); }}
                  style={{ border: 'none', background: marketLeaderboardTab === 'total' ? 'var(--accent-primary)' : 'transparent', color: marketLeaderboardTab === 'total' ? '#000' : 'var(--text-secondary)' }}
                >
                  Total Rankings
                </button>
                <button 
                  className={`btn-outline ${marketLeaderboardTab === 'category' ? 'active' : ''}`}
                  onClick={() => { setMarketLeaderboardTab('category'); setMarketCategory('methodology'); handleMarketSearch(); }}
                  style={{ border: 'none', background: marketLeaderboardTab === 'category' ? 'var(--accent-primary)' : 'transparent', color: marketLeaderboardTab === 'category' ? '#000' : 'var(--text-secondary)' }}
                >
                  Category Rankings
                </button>
              </div>
            </div>

            {marketLeaderboardTab === 'category' && (
              <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['methodology', 'workflow', 'document-processing', 'development', 'security', 'data'].map(cat => (
                  <button 
                    key={cat}
                    className={`btn-outline ${marketCategory === cat ? 'active' : ''}`}
                    onClick={() => { setMarketCategory(cat); handleMarketSearch(); }}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '20px' }}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder={t.searchGithubPlaceholder}
                  value={marketQuery}
                  onChange={e => { setMarketQuery(e.target.value); if (e.target.value.trim()) handleMarketSearch(); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleMarketSearch(); }}
                  style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                />
              </div>
            </div>

            {marketResults.length > 0 ? (
              <div className="skills-grid">
                {marketResults.map(skill => {
                  const isInstalled = skills.some(local => local.name === skill.name);
                  return (
                    <div key={skill.name} className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <a href={skill.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{skill.name}</a>
                          {isInstalled && (
                            <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: 'black', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{t.installed}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <Star size={12} color="var(--accent-primary)" />
                          {skill.stars || skill.installs}
                        </div>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5, flex: 1 }}>{skill.description || t.noDescAvailable}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.by} {skill.source || skill.author}</div>
                        <button className="btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', opacity: isInstalled ? 0.5 : 1 }} disabled={isInstalled} onClick={() => handleMarketInstall(skill)}>
                          <Download size={12} /> {isInstalled ? t.installed : t.installBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Search size={36} />}
                title={marketQuery ? 'No results found' : 'Loading Community Market'}
                description={marketQuery ? `No skills match "${marketQuery}". Try a different search.` : 'Please wait while we fetch the latest trending tools...'}
              />
            )}
            </>
            )}

            {/* P0-2: GitHub Community Source */}
            {marketSource === 'github' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Github size={24} color="var(--accent-primary)" />
                    GitHub {t.curated}
                  </h3>
                  {githubMarketLoading && <Loader2 size={16} className="spin" />}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder={t.searchGithubCommunity}
                      value={marketQuery}
                      onChange={e => { setMarketQuery(e.target.value); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleGithubMarketSearch(); }}
                      style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                    />
                  </div>
                  <button className="btn-primary" onClick={handleGithubMarketSearch}>
                    <Search size={14} /> {t.searchBtn}
                  </button>
                  <button className="btn-outline" onClick={fetchGithubCurated}>
                    <RefreshCw size={14} /> {t.curatedBtn}
                  </button>
                </div>

                {githubMarketResults.length > 0 ? (
                  <div className="skills-grid">
                    {githubMarketResults.map((skill: any) => {
                      const isInstalled = skills.some(local => local.name === skill.name);
                      return (
                        <div key={skill.name || skill.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <a href={skill.url || skill.repo} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{skill.name}</a>
                              {isInstalled && (
                                <span style={{ fontSize: '0.65rem', background: 'var(--success)', color: 'black', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{t.installed}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              <Star size={12} color="var(--accent-primary)" />
                              {skill.stars || skill.installs || 0}
                            </div>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5, flex: 1 }}>{skill.description || t.noDescAvailable}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.by} {skill.source || skill.author || skill.owner || 'unknown'}</div>
                            <button className="btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', opacity: isInstalled ? 0.5 : 1 }} disabled={isInstalled} onClick={() => handleGithubMarketInstall(skill)}>
                              <Download size={12} /> {isInstalled ? t.installed : t.installBtn}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Github size={36} />}
                    title={githubMarketLoading ? 'Loading...' : marketQuery ? 'No results found' : 'No curated skills'}
                    description={marketQuery ? `No skills match "${marketQuery}". Try a different search.` : 'Click "精选" to load curated skills from the GitHub community.'}
                  />
                )}
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* ----------------- MCP SERVERS ----------------- */}
      {marketTab === 'mcp' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="glass-card" style={{ padding: '2rem' }}>
             <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server size={20} color="var(--accent-primary)" />
                Manage MCP Servers
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handlePreviewMcpConfig}>
                  <Eye size={14} /> {t.previewClaudeConfig}
                </button>
             </h3>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Model Context Protocol (MCP) servers extend your AI models with external tools, APIs, and data sources. Add and manage them here.
             </p>
             
             {mcpServers.length > 0 ? (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                 {mcpServers.map(server => (
                   <div key={server.name} className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem' }}>
                     <div>
                       <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                         {server.name}
                         <span className={`badge ${server.disabled ? 'badge-warning' : 'badge-success'}`}>{server.disabled ? 'Disabled' : 'Active'}</span>
                       </div>
                       <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{server.command} {server.args.join(' ')}</div>
                       {server.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{server.description}</div>}
                     </div>
                     <div style={{ display: 'flex', gap: '0.5rem' }}>
                       <button className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => console.log('Toggle ' + server.name)}>
                         {server.disabled ? 'Enable' : 'Disable'}
                       </button>
                       <button className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderColor: 'var(--error)', color: 'var(--error)' }} onClick={() => console.log('Remove ' + server.name)}>
                         Remove
                       </button>
                     </div>
                   </div>
                 ))}
               </div>
             ) : (
               <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '2rem' }}>
                 <Server size={32} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
                 <div style={{ color: 'var(--text-secondary)' }}>{t.noMcpServers}</div>
               </div>
             )}

             <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)' }}>
               <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>{t.addNewMcpServer}</h4>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                 <input type="text" placeholder={t.serverNamePlaceholder} value={newMcp.name} onChange={e => setNewMcp({...newMcp, name: e.target.value})} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }} />
                <input type="text" placeholder={t.commandPlaceholder} value={newMcp.command} onChange={e => setNewMcp({...newMcp, command: e.target.value})} style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }} />
               </div>
               <div style={{ marginBottom: '1rem' }}>
                 <input type="text" placeholder={t.argsPlaceholder} value={newMcp.args} onChange={e => setNewMcp({...newMcp, args: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }} />
               </div>
               <div style={{ marginBottom: '1rem' }}>
                 <input type="text" placeholder={t.descOptionalPlaceholder} value={newMcp.description} onChange={e => setNewMcp({...newMcp, description: e.target.value})} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }} />
               </div>
               <button className="btn-primary" disabled={!newMcp.name || !newMcp.command} onClick={() => console.log('Add MCP')}>
                 <Plus size={16} /> {t.addServer}
               </button>
             </div>
          </div>
        </motion.div>
      )}

      {/* ----------------- CLI EXTENSIONS ----------------- */}
      {marketTab === 'cli' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="glass-card" style={{ padding: '2rem' }}>
             <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal size={20} color="var(--accent-primary)" />
                CLI Extensions
             </h3>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                CLI extensions provide terminal commands and integrations for various AI agents (like Claude Code, Cursor, Aider).
             </p>
             <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <Terminal size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Coming Soon</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>The CLI extension marketplace is currently under development. Soon you'll be able to discover and install cross-platform CLI tools directly from here.</p>
             </div>
          </div>
        </motion.div>
      )}

      {/* ----------------- LOCAL IMPORT ----------------- */}
      {marketTab === 'import' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={20} color="var(--accent-primary)" />
              Local Import & Archives
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: 1.5 }}>
              Import custom skills from GitHub repositories or local archive files (.zip, .skill).
            </p>

            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Import from GitHub</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Github size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder={t.importUrlPlaceholder}
                    value={githubImportUrl}
                    onChange={e => setGithubImportUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && githubImportUrl.trim()) handleGithubImport(); }}
                    style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                  />
                </div>
                <button
                  className="btn-primary"
                  disabled={!githubImportUrl.trim() || githubImporting}
                  onClick={handleGithubImport}
                >
                  {githubImporting ? <><Loader2 size={14} className="spin" /> {t.importing}</> : <><Download size={14} /> {t.import}</>}
                </button>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Import from Local Archive</h4>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)' }}>
                <FileArchive size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder={t.archiveHint}
                  value={archivePath}
                  onChange={e => setArchivePath(e.target.value)}
                  style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.8rem' }}
                />
                <button
                  className="btn-primary"
                  disabled={!archivePath || archiveImporting}
                  onClick={handleArchiveImport}
                >
                  {archiveImporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} {t.import}
                </button>
              </div>
            </div>

            {githubImportResult && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', background: 'rgba(46, 204, 113, 0.08)', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} color="var(--success)" /> {t.importSuccess}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {githubImportResult.name} — {githubImportResult.subSkills.length} skills scanned and installed.
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

    </div>
  </div>
)}

        {activeTab === 'collections' && (
          <CollectionsView
            collections={collections}
            loading={collectionsLoading}
            skills={skills}
            t={t}
            onCreate={async (name, desc, color, icon) => { await collectionsApi.create(name, desc, color, icon); }}
            onDelete={(id) => collectionsApi.remove(id)}
            onAddSkill={(id, skillName, skillPath) => collectionsApi.addSkill(id, skillName, skillPath)}
            onRemoveSkill={(id, skillName, skillPath) => collectionsApi.removeSkill(id, skillName, skillPath)}
            onExport={async (id) => {
              try {
                const manifest = await collectionsApi.exportManifest(id);
                const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${manifest.name.replace(/\s+/g, '-').toLowerCase()}.json`;
                a.click(); URL.revokeObjectURL(url);
                toast('success', t.exported, a.download);
              } catch (e: any) { toast('error', t.exportFailed, e.message); }
            }}
            onImportCollection={() => setShowImportCollectionModal(true)}
          />
        )}

{activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Cache Management */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={20} color="var(--accent-primary)" />
                  {t.cacheManagement}
                </h3>
                <button
                  className="btn-outline"
                  style={{ padding: '0.5rem 1rem' }}
                  onClick={async () => {
                    try {
                      const { data } = await axios.get('/api/cache/stats');
                      setCacheStats(data);
                      setShowCachePanel(true);
                    } catch { alert('Failed to load cache stats'); }
                  }}
                >
                  <BarChart2 size={14} />
                  {t.cacheStats}
                </button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t.cacheManagement}
              </p>
            </div>

            {/* Managed Paths */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FolderOpen size={20} color="var(--accent-primary)" />
                  {t.managedPaths}
                </h3>
                <button
                  className="btn-outline"
                  style={{ padding: '0.5rem 1rem' }}
                  onClick={handleRescanPaths}
                  disabled={scanningPaths}
                >
                  <RefreshCw size={14} className={scanningPaths ? 'spin' : ''} />
                  {scanningPaths ? t.scanning : t.rescanPaths}
                </button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                {t.managedPathsDesc}
              </p>

              {managedPaths.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {t.noManagedPaths}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  {managedPaths.map((mp, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        padding: '1.25rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {mp.platformName}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {mp.isUniversal && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', background: 'rgba(99,102,241,0.2)', color: 'var(--accent-primary)', borderRadius: '4px' }}>
                            {t.isUniversal}
                          </span>
                        )}
                        {mp.isCustom && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '4px' }}>
                            {t.isCustom}
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', background: mp.exists ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: mp.exists ? '#22c55e' : '#ef4444', borderRadius: '4px' }}>
                          {mp.exists ? t.pathExists : t.pathNotExist}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '4px' }}>
                        {mp.path}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button className="btn-outline" style={{ flex: 1, padding: '0.4rem' }} onClick={() => axios.post('/api/open-folder', { targetPath: mp.path })} title={t.open}>
                          <FolderOpen size={14} /> {t.open}
                        </button>
                        {mp.isCustom && (
                          <>
                            <button
                              className="btn-outline"
                              style={{ padding: '0.4rem' }}
                              onClick={() => {
                                const newName = window.prompt(t.platformName, mp.platformName);
                                if (newName && newName !== mp.platformName) {
                                  handleEditManagedPath(mp.path, { platformName: newName });
                                }
                              }}
                              title={t.editPath}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn-outline"
                              style={{ padding: '0.4rem', color: 'var(--error)' }}
                              onClick={() => handleRemoveManagedPath(mp.path)}
                              title={t.deletePath}
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new path */}
              <div style={{ display: 'flex', gap: '0.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <input
                  type="text"
                  placeholder="C:\Users\you\.my-tool\skills"
                  value={newCustomPath}
                  onChange={e => setNewCustomPath(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddManagedPath(); }}
                  className="modal-input"
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  placeholder={t.platformName}
                  value={newManagedPathName}
                  onChange={e => setNewManagedPathName(e.target.value)}
                  className="modal-input"
                  style={{ width: '180px' }}
                />
                <button className="btn-primary" style={{ padding: '0.65rem 1.25rem' }} onClick={handleAddManagedPath}>
                  <Plus size={16} />
                  {t.addPath}
                </button>
              </div>
            </div>

            {/* Storage Hub */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} color="var(--accent-primary)" />
                Storage Hub
              </h3>
              <div style={{
                padding: '1rem',
                background: 'var(--accent-glow)',
                borderRadius: '12px',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>~/.agents/skills</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Central repository for all synchronized skills.</div>
                </div>
                <button className="btn-outline" style={{ padding: '0.5rem 1rem' }} onClick={() => axios.post('/api/open-folder', { targetPath: config.masterSkillsDir || '' })}>
                  <FolderOpen size={14} /> {t.open}
                </button>
              </div>
            </div>

            {/* ===== Optimization Plan: Tool Registry ===== */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Boxes size={20} color="var(--accent-primary)" />
                Tool Registry
                {opt.toolRegistryStats && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    {opt.toolRegistryStats.installedCount}/{opt.toolRegistryStats.totalTools} installed
                  </span>
                )}
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => { opt.fetchToolRegistry(); setShowToolRegistry(!showToolRegistry); }}>
                  {showToolRegistry ? t.hide : t.show}
                </button>
                <button className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={refreshToolRegistry}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </h3>
              {showToolRegistry && toolRegistry.length > 0 && (
                <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {toolRegistry.map((tool, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '8px', background: tool.installed ? 'rgba(46,204,113,0.05)' : 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                      {tool.installed ? <CheckCircle2 size={14} color="var(--success)" /> : <XCircle size={14} color="var(--text-muted)" />}
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tool.displayName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{tool.relativeSkillsDir}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showToolRegistry && toolRegistry.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Click "Refresh" to fetch from Skills Hub.</div>
              )}
            </div>

            {/* ===== Optimization Plan: .skillignore Editor ===== */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={20} color="var(--accent-primary)" />
                {t.skillignoreEditor}
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => { setIgnoreText(ignoreEntries.join('\n')); setShowIgnoreEditor(!showIgnoreEditor); }}>
                  {showIgnoreEditor ? t.hide : t.edit}
                </button>
              </h3>
              {showIgnoreEditor ? (
                <div>
                  <textarea
                    value={ignoreText}
                    onChange={e => setIgnoreText(e.target.value)}
                    rows={8}
                    placeholder={'# Each line is a directory name to ignore\n# These directories will not be scanned, synced, or displayed\n\nscripts\ntest-demo'}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn-primary" onClick={() => saveIgnoreEntries(ignoreText.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')))}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {ignoreEntries.length > 0 ? `${ignoreEntries.length} directories ignored: ${ignoreEntries.join(', ')}` : 'No directories ignored. Click "Edit" to add.'}
                </div>
              )}
            </div>

            {/* ===== P1-8: Metadata Validation ===== */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} color="var(--accent-primary)" />
                {t.metadataValidation}
                <button className="btn-outline" style={{ marginLeft: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={fetchMetadataValidations}>
                  {t.validateAllMetadata}
                </button>
              </h3>
              {metadataValidations && metadataValidations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                  {metadataValidations.map((v, i) => {
                    const issues = [...(v.missingFields || []), ...(v.invalidFields || [])];
                    const valid = issues.length === 0;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{v.skillName}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: '0.8rem', color: valid ? 'var(--success)' : 'var(--error)' }}>
                            {valid ? t.valid : issues.join(', ')}
                          </span>
                          {!valid && (
                            <button className="btn-outline" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleFixMetadata(v.skillName)}>
                              {t.fix}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.clickValidateMetadata}</div>
              )}
            </div>

            {/* Keyboard Shortcuts */}
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Zap size={20} color="var(--accent-primary)" />
                {t.keyboardShortcuts}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[
                  ['Ctrl+R', t.refreshSkills],
                  ['Ctrl+N', t.newSkillShortcut],
                  ['Ctrl+1', t.dashboardShortcut],
                  ['Ctrl+2', t.marketShortcut],
                  ['Ctrl+3', t.translateShortcut],
                  ['Ctrl+4', t.syncShortcut],
                  ['Ctrl+6', t.settingsShortcut],
                  ['Ctrl+K', t.searchSkillsShortcut],
                  ['Ctrl+/', t.toggleLanguage],
                  ['Ctrl+Shift+S', t.toggleSyncModal],
                  ['Ctrl+,', t.goToSettings],
                  ['Ctrl+Shift+T', t.toggleTheme],
                  ['Ctrl+?', t.shortcutsHelp],
                  ['Esc', t.closeModal],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{desc}</span>
                    <kbd style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>



      {/* Skill Action Modal */}
      <InlineModal
        open={showSkillActionModal}
        onClose={() => setShowSkillActionModal(false)}
        title={t.skillActions}
        icon={<ArrowLeftRight size={20} color="var(--accent-primary)" />}
      >
        {skillActionTarget && (
          <div>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{skillActionTarget.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{skillActionTarget.path}</div>
            </div>

            {/* Import mode selector */}
            <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              {t.importToUniversal} - {t.importModeCopy} / {t.importModeLink}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button
                  className={`btn-outline ${importMode === 'copy' ? 'active' : ''}`}
                  style={{ flex: 1, background: importMode === 'copy' ? 'var(--accent-glow)' : 'transparent', color: importMode === 'copy' ? 'var(--accent-primary)' : 'inherit' }}
                  onClick={() => setImportMode('copy')}
                >
                  <Copy size={14} /> {t.importModeCopy}
                </button>
                <button
                  className={`btn-outline ${importMode === 'link' ? 'active' : ''}`}
                  style={{ flex: 1, background: importMode === 'link' ? 'var(--accent-glow)' : 'transparent', color: importMode === 'link' ? 'var(--accent-primary)' : 'inherit' }}
                  onClick={() => setImportMode('link')}
                >
                  <Link2 size={14} /> {t.importModeLink}
                </button>
              </div>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="btn-primary"
                onClick={() => handleImportToUniversal(skillActionTarget.path, skillActionTarget.name)}
              >
                <Globe size={16} /> {t.importToUniversal}
              </button>
              <button
                className="btn-outline"
                onClick={() => handleBackupToHub(skillActionTarget.path, skillActionTarget.name)}
              >
                <Database size={16} /> {t.backupToHub}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn-outline" onClick={() => setShowSkillActionModal(false)}>{t.cancel}</button>
            </div>
          </div>
        )}
      </InlineModal>

      {/* Create Modal */}
      <InlineModal open={showCreateModal} onClose={() => setShowCreateModal(false)} title={t.createSkill} icon={<Plus size={20} color="var(--accent-primary)" />}>
        <label>{t.name} <input className="modal-input" value={newSkill.name} onChange={e => setNewSkill(s => ({...s, name: e.target.value}))} /></label>
        <label>{t.skillDescription} <textarea className="modal-input" rows={3} value={newSkill.description} onChange={e => setNewSkill(s => ({...s, description: e.target.value}))} /></label>
        <label>{t.template}
          <select className="modal-input" value={newSkill.template} onChange={e => setNewSkill(s => ({...s, template: e.target.value}))}>
            <option value="basic">{t.basic}</option>
            <option value="advanced">{t.advanced}</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn-outline" onClick={() => setShowCreateModal(false)}>{t.cancel}</button>
          <button className="btn-primary" onClick={handleCreateSkill}>{t.create}</button>
        </div>
      </InlineModal>

      {/* Health Details Modal */}
      <InlineModal open={showHealthDetails} onClose={() => setShowHealthDetails(false)} title={t.healthDetails} icon={<Shield size={20} color="var(--accent-primary)" />}>
        {selectedSkill?.health && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: selectedSkill.health.grade === 'A' ? 'var(--success)' : selectedSkill.health.grade === 'F' ? 'var(--error)' : 'var(--warning)' }}>{selectedSkill.health.grade}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{t.scoreLabel} {selectedSkill.health.score}/100</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{selectedSkill.health.issues.length} {t.issuesFound}</div>
              </div>
            </div>
            {selectedSkill.health.issues.map((issue, i) => (
              <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {issue.level === 'error' ? <AlertCircle size={14} color="var(--error)" /> : issue.level === 'warning' ? <AlertCircle size={14} color="var(--warning)" /> : <CheckCircle2 size={14} color="var(--success)" />}
                  <span style={{ fontWeight: 600 }}>{issue.message}</span>
                </div>
                {issue.suggestion && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{issue.suggestion}</div>}
              </div>
            ))}

            {/* ===== P1-8: TRACE Quality Tracking ===== */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <BarChart2 size={16} color="var(--accent-primary)" /> {t.traceQualityTracking}
                </h4>
                <button
                  className="btn-outline"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => handleRunTrace(selectedSkill)}
                  disabled={traceLoading}
                >
                  {traceLoading ? <Loader2 size={14} className="spin" /> : <Activity size={14} />}
                  {traceLoading ? t.tracing : t.runTrace}
                </button>
              </div>
              {activeTrace && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ padding: '0.6rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.completeness}</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{activeTrace.completeness}/100</div>
                  </div>
                  <div style={{ padding: '0.6rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.triggerAccuracy}</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{activeTrace.triggerAccuracy}/100</div>
                  </div>
                  <div style={{ padding: '0.6rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.resourceRationality}</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{activeTrace.resourceRationality}/100</div>
                  </div>
                  <div style={{ padding: '0.6rem 0.85rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.overallScore}</div>
                    <div style={{ fontWeight: 700, color: activeTrace.overallScore >= 80 ? 'var(--success)' : activeTrace.overallScore >= 50 ? 'var(--warning)' : 'var(--error)' }}>{activeTrace.overallScore}/100</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem' }}>
                    <span className="badge" style={{ background: activeTrace.details.hasInstructions ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: activeTrace.details.hasInstructions ? 'var(--success)' : 'var(--error)' }}>{t.instructions}</span>
                    <span className="badge" style={{ background: activeTrace.details.hasExamples ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: activeTrace.details.hasExamples ? 'var(--success)' : 'var(--error)' }}>{t.examples}</span>
                    <span className="badge" style={{ background: activeTrace.details.hasLimitations ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: activeTrace.details.hasLimitations ? 'var(--success)' : 'var(--error)' }}>{t.limitations}</span>
                    <span className="badge" style={{ background: activeTrace.details.descHasTrigger ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: activeTrace.details.descHasTrigger ? 'var(--success)' : 'var(--error)' }}>{t.descTrigger}</span>
                    <span className="badge" style={{ background: activeTrace.details.hasReferences ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: activeTrace.details.hasReferences ? 'var(--success)' : 'var(--error)' }}>{t.references}</span>
                  </div>
                </div>
              )}
              {!activeTrace && !traceLoading && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.clickRunTrace}</div>
              )}
            </div>

            {/* P2-11: Quality Trend */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <TrendingUp size={16} color="var(--accent-primary)" /> {t.qualityTrend}
                </h4>
                <button
                  className="btn-outline"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => fetchQualityTrend(selectedSkill.name)}
                >
                  <TrendingUp size={14} /> {t.viewTrend}
                </button>
              </div>
              {showQualityTrend && qualityTrend.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {qualityTrend.map((point, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: '140px' }}>
                        {point.timestamp ? new Date(point.timestamp).toLocaleString() : `#${i + 1}`}
                      </span>
                      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${point.score || 0}%`, background: `var(--grade-${(point.grade || 'f').toLowerCase()})`, borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: `var(--grade-${(point.grade || 'f').toLowerCase()})`, minWidth: '50px', textAlign: 'right' }}>
                        {point.grade || '?'} ({point.score || 0})
                      </span>
                    </div>
                  ))}
                </div>
              ) : showQualityTrend && qualityTrend.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.noTrendData}</div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.clickViewTrend}</div>
              )}
            </div>
          </div>
        )}
      </InlineModal>

      {/* History Modal */}
      <InlineModal open={showHistory} onClose={() => setShowHistory(false)} title={t.versionHistory} icon={<History size={20} color="var(--accent-primary)" />}>
        {history.length > 0 ? (
          <div>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{h}</span>
                <button className="btn-outline" onClick={() => handleRollback(h)}>{t.rollback}</button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<History size={40} />} title={t.noHistory} description={t.noSnapshots} />
        )}
      </InlineModal>

      {/* Git Bind Modal */}
      <InlineModal open={showGitBindModal} onClose={() => setShowGitBindModal(false)} title={t.bindGitRemote} icon={<GitBranch size={20} color="var(--accent-primary)" />}>
        <label>{t.remoteUrl} <input className="modal-input" value={gitBindUrl} onChange={e => setGitBindUrl(e.target.value)} placeholder="https://github.com/user/repo.git" /></label>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn-outline" onClick={() => setShowGitBindModal(false)}>{t.cancel}</button>
          <button className="btn-primary" onClick={handleGitBind}>{t.bind}</button>
        </div>
      </InlineModal>

      {/* Reverse Collect Modal */}
      <InlineModal open={showReverseCollectModal} onClose={() => setShowReverseCollectModal(false)} title={t.reverseCollect} icon={<FolderOpen size={20} color="var(--accent-primary)" />}>
        <label>{t.directory} <input className="modal-input" value={reverseCollectDir} onChange={e => setReverseCollectDir(e.target.value)} placeholder="/path/to/rules" /></label>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn-outline" onClick={() => setShowReverseCollectModal(false)}>{t.cancel}</button>
          <button className="btn-primary" onClick={handleReverseCollect}>{t.collect}</button>
        </div>
      </InlineModal>

      {/* Install Group Modal */}
      {installGroupModal && (
        <InlineModal open={!!installGroupModal} onClose={() => setInstallGroupModal(null)} title={t.installGroupTitle} icon={<Boxes size={20} color="var(--accent-primary)" />}>
          <p>{t.installGroupTo.replace('{name}', installGroupModal.name)}</p>
          <select className="modal-input" onChange={e => setInstallGroupModal({ ...installGroupModal, platformId: e.target.value })}>
            <option value="">{t.selectPlatform}</option>
            {platforms.filter(p => p.installed).map(p => (
              <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button className="btn-outline" onClick={() => setInstallGroupModal(null)}>{t.cancel}</button>
            <button className="btn-primary" onClick={handleInstallGroup}>{t.installBtn}</button>
          </div>
        </InlineModal>
      )}

      {/* P1-5: Dependency Graph Modal */}
      <InlineModal open={showDepGraph} onClose={() => setShowDepGraph(false)} title={t.dependencyGraph} icon={<GitFork size={20} color="var(--accent-primary)" />} width="640px">
        {depGraph ? (
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {depGraph.nodes && depGraph.nodes.length > 0 ? (
              depGraph.nodes.map((node: any, i: number) => {
                const deps = depGraph.edges?.filter((e: any) => e.from === node.name || e.source === node.name) || [];
                const dependents = depGraph.edges?.filter((e: any) => e.to === node.name || e.target === node.name) || [];
                return (
                  <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <GitFork size={14} color="var(--accent-primary)" />
                      {node.name || node.skillName}
                    </div>
                    {deps.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem', paddingLeft: '1.2rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t.dependsOn} </span>
                        {deps.map((d: any) => d.to || d.target).join(', ')}
                      </div>
                    )}
                    {dependents.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', paddingLeft: '1.2rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t.dependedBy} </span>
                        {dependents.map((d: any) => d.from || d.source).join(', ')}
                      </div>
                    )}
                    {deps.length === 0 && dependents.length === 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', paddingLeft: '1.2rem', fontStyle: 'italic' }}>
                        {t.noDependencies}
                      </div>
                    )}
                  </div>
                );
              })
            ) : Array.isArray(depGraph) && depGraph.length > 0 ? (
              depGraph.map((item: any, i: number) => (
                <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <GitFork size={14} color="var(--accent-primary)" />
                    {item.skillName || item.name}
                  </div>
                  {item.dependencies && item.dependencies.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem', paddingLeft: '1.2rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t.dependsOn} </span>
                      {item.dependencies.join(', ')}
                    </div>
                  )}
                  {item.dependents && item.dependents.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', paddingLeft: '1.2rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t.dependedBy} </span>
                      {item.dependents.join(', ')}
                    </div>
                  )}
                  {(!item.dependencies || item.dependencies.length === 0) && (!item.dependents || item.dependents.length === 0) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', paddingLeft: '1.2rem', fontStyle: 'italic' }}>
                      {t.noDependencies}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                {t.noDepGraphData}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader2 size={24} className="spin" />
          </div>
        )}
      </InlineModal>

      {/* P2-9: MCP Config Preview Modal */}
      <InlineModal open={showMcpConfigModal} onClose={() => setShowMcpConfigModal(false)} title={t.previewClaudeConfig} icon={<Eye size={20} color="var(--accent-primary)" />} width="640px">
        {mcpConfigPreview ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
              <button
                className="btn-outline"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => { navigator.clipboard.writeText(mcpConfigPreview); toast('success', t.copiedToClipboard); }}
              >
                <Copy size={14} /> {t.copyToClipboard}
              </button>
            </div>
            <pre style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', overflow: 'auto', maxHeight: '400px', fontSize: '0.75rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {mcpConfigPreview}
            </pre>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader2 size={24} className="spin" />
          </div>
        )}
      </InlineModal>

      {/* P2-10: Collection Import Modal */}
      <InlineModal open={showImportCollectionModal} onClose={() => setShowImportCollectionModal(false)} title={t.importCollection} icon={<Download size={20} color="var(--accent-primary)" />} width="560px">
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {t.importCollectionDesc}
        </p>
        <textarea
          value={importCollectionData}
          onChange={e => setImportCollectionData(e.target.value)}
          rows={10}
          placeholder='{\n  "name": "My Collection",\n  "skills": [...]\n}'
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <label className="btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <FileText size={14} /> {t.loadFromFile}
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    setImportCollectionData(ev.target?.result as string);
                  };
                  reader.readAsText(file);
                }
              }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn-outline" onClick={() => setShowImportCollectionModal(false)}>{t.cancel}</button>
          <button className="btn-primary" disabled={!importCollectionData.trim()} onClick={handleImportCollection}>
            <Download size={16} /> {t.importBtn}
          </button>
        </div>
      </InlineModal>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {editingSkill && (
        <SkillMarkdownEditor
          skillPath={editingSkill.path}
          skillName={editingSkill.name}
          onClose={() => setEditingSkill(null)}
          t={t}
          onSaved={() => { fetchSkills(); }}
        />
      )}
      {/* Optimization Modal */}
      {showOptimizationModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && syncPhase !== 'executing') setShowOptimizationModal(false); }}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="modal-content" style={{ width: '800px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2>{t.syncEngine}</h2>
              <button className="btn-icon" onClick={() => setShowOptimizationModal(false)} disabled={syncPhase === 'executing'}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              
              {syncPhase === 'scanning' && (
                <div style={{ padding: '3rem', textAlign: 'center' }}>
                  <RefreshCw size={48} className="spin" color="var(--accent-primary)" style={{ marginBottom: '1rem', display: 'inline-block' }} />
                  <h3>{t.analyzingPlatforms}</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>{syncProgress || t.initializing}</p>
                </div>
              )}

              {syncPhase === 'executing' && (
                <div style={{ padding: '3rem', textAlign: 'center' }}>
                  <Zap size={48} className="spin" color="var(--accent-primary)" style={{ marginBottom: '1rem', display: 'inline-block' }} />
                  <h3>{t.applyingResolutions}</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>{syncProgress || t.executing}</p>
                </div>
              )}

              {syncPhase === 'done' && (
                <div style={{ padding: '3rem', textAlign: 'center' }}>
                  <CheckCheck size={48} color="var(--success)" style={{ marginBottom: '1rem', display: 'inline-block' }} />
                  <h3>{t.optimizationComplete}</h3>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '1rem', textAlign: 'left', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px' }}>
                    {syncResults.map((r, i) => <div key={i}>• {r}</div>)}
                  </div>
                </div>
              )}

              {syncPhase === 'planning' && (
                optimizationPlan.length === 0 ? (
                  <div className="empty-state">
                    <CheckCheck size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
                    <h3>{t.allGood}</h3>
                    <p>{t.noOptimizationsNeeded}</p>
                  </div>
                ) : (
                  <>
                    {/* Universal-reading platforms notice */}
                    {optimizationPlan.filter(p => p.readsFromUniversal).length > 0 && (
                      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>⚡ {t.nativeUniversalReaders}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          {optimizationPlan.filter(p => p.readsFromUniversal).map(p => p.platformName).join(', ')} — {t.nativeReadersDesc}
                        </span>
                      </div>
                    )}
                    {/* Stats Overview + Action Bar */}
                    {(() => {
                      const allActions: LinkAction[] = optimizationPlan.flatMap((p: { actions?: LinkAction[] }) => p.actions || []);
                      const byType = {
                        conflict: allActions.filter(a => a.type === 'conflict'),
                        missing: allActions.filter(a => a.type === 'missing-in-platform'),
                        candidate: allActions.filter(a => a.type === 'platform-new-candidate'),
                        broken: allActions.filter(a => a.type === 'broken-link'),
                        garbage: allActions.filter(a => a.type === 'garbage'),
                        valid: allActions.filter(a => a.type === 'valid-link'),
                      };
                      const typeConfig = [
                        { key: 'conflict', label: t.conflicts, items: byType.conflict, color: '#f59e0b', icon: '⚠', desc: '' },
                        { key: 'missing', label: t.missingInPlatform, items: byType.missing, color: '#f97316', icon: '⊘', desc: '' },
                        { key: 'candidate', label: t.newCandidates, items: byType.candidate, color: '#c5a059', icon: '★', desc: '' },
                        { key: 'broken', label: t.brokenLinks, items: byType.broken, color: '#ef4444', icon: '✕', desc: '' },
                        { key: 'valid', label: t.redundantLinks, items: byType.valid, color: '#22c55e', icon: '⚡', desc: '' },
                        { key: 'garbage', label: t.garbage, items: byType.garbage, color: '#ef4444', icon: '🗑', desc: '' },
                      ].filter(t => t.items.length > 0);

                      return (
                        <>
                          {/* Compact Summary */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {allActions.length} {t.actions} ({byType.valid.filter((a: LinkAction) => !optimizationPlan.find(p => p.actions.includes(a))?.readsFromUniversal).length} {t.validLabel} · {byType.valid.filter((a: LinkAction) => optimizationPlan.find(p => p.actions.includes(a))?.readsFromUniversal).length} {t.redundantLabel} · {allActions.length - byType.valid.length} {t.needAttention})
                            </span>
                            <div style={{ flex: 1 }} />
                            <button className="btn-outline" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => {
                              const newPlans = optimizationPlan.map((p: any) => ({ ...p, actions: p.actions.map((a: LinkAction) => a.type === 'valid-link' ? a : { ...a, resolution: 'skip' }) }));
                              setOptimizationPlan(newPlans);
                            }}>{t.skipAll}</button>
                            <button className="btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => {
                              const newPlans = optimizationPlan.map((p: any) => ({ ...p, actions: p.actions.map((a: LinkAction) => {
                                if (a.type === 'valid-link') return { ...a, resolution: p.readsFromUniversal ? 'remove' : 'skip' };
                                if (a.type === 'conflict') return { ...a, resolution: 'overwrite-with-master' };
                                if (a.type === 'missing-in-platform') return { ...a, resolution: 'symlink' };
                                if (a.type === 'platform-new-candidate') return { ...a, resolution: p.readsFromUniversal ? 'promote-only' : 'promote-and-symlink' };
                                if (a.type === 'broken-link' || a.type === 'garbage') return { ...a, resolution: 'remove' };
                                return a;
                              }) }));
                              setOptimizationPlan(newPlans);
                            }}>{t.autoResolveAll}</button>
                          </div>

                          {/* Type Group Cards */}
                          {typeConfig.map(tc => {
                            // Group items by skillName within each type
                            const bySkill = new Map<string, any[]>();
                            for (const a of tc.items) {
                              const arr = bySkill.get(a.skillName) || [];
                              arr.push(a);
                              bySkill.set(a.skillName, []);
                              bySkill.set(a.skillName, [...arr, a]);
                            }

                            return (
                              <div key={tc.key} style={{ marginBottom: '1.25rem' }}>
                                {/* Type Header */}
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                                  padding: '0.5rem 0.75rem', borderRadius: '8px',
                                  background: `${tc.color}12`, border: `1px solid ${tc.color}30`,
                                  marginBottom: '0.5rem', cursor: 'pointer',
                                }} onClick={() => {
                                  const el = document.getElementById(`type-group-${tc.key}`);
                                  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                                }}>
                                  <ChevronDown size={14} color={tc.color} />
                                  <span style={{ color: tc.color, fontWeight: 600, fontSize: '0.85rem' }}>{tc.icon} {tc.label}</span>
                                  <span style={{ background: `${tc.color}25`, color: tc.color, padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600 }}>{tc.items.length}</span>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{tc.desc}</span>
                                </div>
                                {/* Items */}
                                <div id={`type-group-${tc.key}`}>
                                  {tc.items.map((act: any, idx: number) => {
                                    // Find original indices
                                    let pIdx = -1, aIdx = -1;
                                    for (let pi = 0; pi < optimizationPlan.length; pi++) {
                                      const ai = optimizationPlan[pi].actions.indexOf(act);
                                      if (ai >= 0) { pIdx = pi; aIdx = ai; break; }
                                    }
                                    if (pIdx < 0) return null;
                                    const platformName = optimizationPlan[pIdx].platformName;
                                    const isResolved = act.resolution !== 'skip';
                                    return (
                                      <div key={idx} className="glass-card" style={{
                                        padding: '0.6rem 0.75rem', marginBottom: '0.4rem',
                                        borderLeft: `3px solid ${tc.color}`,
                                        opacity: isResolved ? 1 : 0.85,
                                        transition: 'opacity 0.15s',
                                      }}>
                                        {/* Row 1: skill name + platform + resolution badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          <strong style={{ fontSize: '0.9rem', flex: '0 0 auto' }}>{act.skillName}</strong>
                                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{platformName}</span>
                                          <div style={{ flex: 1 }} />
                                          {/* Resolution toggle buttons */}
                                          {(() => {
                                            const opts: Array<{ v: string; label: string; danger?: boolean }> = [
                                              { v: 'skip', label: t.skip },
                                            ];
                                            if (act.type === 'missing-in-platform') opts.push({ v: 'symlink', label: t.link });
                                            if (act.type === 'platform-new-candidate') {
                                              // readsFromUniversal platforms use promote-only (no junction)
                                              if (optimizationPlan[pIdx].readsFromUniversal) {
                                                opts.push({ v: 'promote-only', label: t.promote });
                                              } else {
                                                opts.push({ v: 'promote-and-symlink', label: t.promote });
                                              }
                                            }
                                            if (act.type === 'conflict') {
                                              opts.push({ v: 'overwrite-with-master', label: '← ' + t.master });
                                              opts.push({ v: 'overwrite-with-platform', label: '← ' + t.platform, danger: true });
                                            }
                                            if (act.type === 'broken-link' || act.type === 'garbage' || act.type === 'valid-link') opts.push({ v: 'remove', label: t.delete, danger: true });
                                            return opts.map(opt => {
                                              const active = act.resolution === opt.v;
                                              return (
                                                <button key={opt.v} onClick={() => {
                                                  const newPlans = [...optimizationPlan];
                                                  newPlans[pIdx].actions[aIdx].resolution = opt.v;
                                                  setOptimizationPlan(newPlans);
                                                }} style={{
                                                  padding: '0.2rem 0.6rem', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 500,
                                                  cursor: 'pointer', border: '1px solid',
                                                  borderColor: active ? (opt.danger ? '#ef4444' : 'var(--accent-primary)') : 'var(--border-color)',
                                                  background: active ? (opt.danger ? 'rgba(239,68,68,0.15)' : 'rgba(197,160,89,0.15)') : 'transparent',
                                                  color: active ? (opt.danger ? '#ef4444' : 'var(--accent-primary)') : 'var(--text-secondary)',
                                                  transition: 'all 0.15s',
                                                }}>{opt.label}</button>
                                              );
                                            });
                                          })()}
                                        </div>
                                        {/* Row 2: conflict details (if applicable) */}
                                        {act.type === 'conflict' && act.conflictDetails && (
                                          <div style={{ fontSize: '0.72rem', marginTop: '0.4rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--accent-primary)' }}>{t.masterLabel} {(act.conflictDetails.masterSize / 1024).toFixed(1)}KB</span>
                                            <span style={{ color: 'var(--warning)' }}>{t.platformLabelColon} {(act.conflictDetails.platformSize / 1024).toFixed(1)}KB</span>
                                            <span style={{ color: 'var(--text-muted)' }}>M: {new Date(act.conflictDetails.masterMtime).toLocaleDateString()} · P: {new Date(act.conflictDetails.platformMtime).toLocaleDateString()}</span>
                                            {act.conflictDetails.masterHash && act.conflictDetails.platformHash && (
                                              <span style={{
                                                color: act.conflictDetails.masterHash === act.conflictDetails.platformHash ? 'var(--success)' : 'var(--warning)',
                                                fontWeight: 600,
                                              }}>
                                                {act.conflictDetails.masterHash === act.conflictDetails.platformHash ? t.identicalBadge : t.differsBadge}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {/* Row 3: reason (compact) */}
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>{act.reason}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Execution Preview Bar */}
                          {(() => {
                            const allActions2 = optimizationPlan.flatMap(p => p.actions || []);
                            const willExecute = allActions2.filter(a => a.resolution !== 'skip' && a.type !== 'valid-link');
                            const dangerCount = willExecute.filter(a => a.resolution === 'remove' || a.resolution === 'overwrite-with-platform').length;
                            return (
                              <div style={{
                                position: 'sticky', bottom: 0, left: 0, right: 0,
                                background: 'rgba(20,20,30,0.95)', backdropFilter: 'blur(10px)',
                                borderTop: '1px solid var(--border-color)',
                                padding: '0.75rem', borderRadius: '0 0 8px 8px',
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                marginTop: '1rem',
                              }}>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {willExecute.length > 0 ? (
                                      <>{willExecute.length} {t.actionsQueued}{dangerCount > 0 && <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>⚠ {dangerCount} {t.destructive}</span>}</>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>{t.noActionsSelected}</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </>
                )
              )}
            </div>
            {syncPhase !== 'scanning' && (
              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div>
                  {syncPhase === 'planning' && optimizationPlan.length > 0 && (() => {
                    const allActions = optimizationPlan.flatMap(p => p.actions || []);
                    const willExecute = allActions.filter(a => a.resolution !== 'skip' && a.type !== 'valid-link');
                    const dangerCount = willExecute.filter(a => a.resolution === 'remove' || a.resolution === 'overwrite-with-platform').length;
                    if (willExecute.length === 0) return <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.noActionsSelected}</span>;
                    return (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--accent-primary)' }}>{willExecute.length}</strong> {t.actionsQueued}
                        {dangerCount > 0 && <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>⚠ {dangerCount} {t.destructive}</span>}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn-outline" onClick={() => setShowOptimizationModal(false)} disabled={syncPhase === 'executing'}>
                    {syncPhase === 'done' ? t.close : t.cancel}
                  </button>
                  {syncPhase === 'planning' && optimizationPlan.length > 0 && (
                    <button 
                      className="btn-primary" 
                      disabled={optimizing}
                      onClick={async () => {
                        const allActions = optimizationPlan.flatMap(p => p.actions || []);
                        const willExecute = allActions.filter(a => a.resolution !== 'skip' && a.type !== 'valid-link');
                        if (willExecute.length === 0) { toast('info', t.noActions, t.selectOneResolution); return; }
                        setOptimizing(true);
                        setSyncPhase('executing');
                        const results = [];
                        try {
                          for (let pIdx = 0; pIdx < optimizationPlan.length; pIdx++) {
                            const plan = optimizationPlan[pIdx];
                            setSyncProgress(`${t.executing} ${plan.platformName}...`);
                            const { data } = await axios.post('/api/link/execute', { plan });
                            results.push(`${plan.platformName}: ${data.message || t.updated}`);
                          }
                          setSyncResults(results);
                          setSyncPhase('done');
                          fetchSkills();
                        } catch (err: any) {
                          toast('error', t.optimizationFailed, err.response?.data?.error || err.message);
                          setSyncPhase('planning');
                        } finally {
                          setOptimizing(false);
                        }
                      }}
                    >
                      {optimizing ? <Loader2 size={16} className="spin" /> : <CheckCheck size={16} />}
                      {t.execute}{syncPhase === 'planning' && optimizationPlan.length > 0 && (() => {
                        const c = optimizationPlan.flatMap(p => p.actions || []).filter(a => a.resolution !== 'skip' && a.type !== 'valid-link').length;
                        return c > 0 ? ` (${c})` : '';
                      })()}
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* ==================== AI Generate Modal ==================== */}
      {showAiGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowAiGenerateModal(false)}>
          <div className="modal-content ai-generate-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={20} color="var(--accent-primary)" />
                {t.aiGenerate}
              </h2>
              <button className="btn-icon" onClick={() => setShowAiGenerateModal(false)}><X size={18} /></button>
            </div>

            {!aiResult && (
              <>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t.aiGenerateDesc}</p>
                {aiTemplates.length > 0 && (
                  <>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.selectTemplate}</label>
                    <div className="ai-template-grid">
                      {aiTemplates.map(tpl => (
                        <div
                          key={tpl.id}
                          className={`ai-template-card ${(aiGenerateForm as any).templateId === tpl.id ? 'selected' : ''}`}
                          onClick={() => {
                            setAiGenerateForm({
                              ...(aiGenerateForm as any),
                              templateId: tpl.id,
                              skillName: (aiGenerateForm as any).skillName || tpl.name,
                              description: (aiGenerateForm as any).description || tpl.description,
                              category: tpl.category,
                              triggerKeywords: tpl.triggerKeywords.join(', '),
                            });
                          }}
                        >
                          <h4>{tpl.name}</h4>
                          <p>{tpl.description}</p>
                          <div className="ai-keywords">
                            {tpl.triggerKeywords.slice(0, 4).map(kw => (
                              <span key={kw} className="ai-keyword-tag">{kw}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="manifest-field">
                    <label>{t.skillName}</label>
                    <input
                      value={(aiGenerateForm as any).skillName || ''}
                      onChange={e => setAiGenerateForm({ ...(aiGenerateForm as any), skillName: e.target.value })}
                      placeholder="my-skill"
                    />
                  </div>
                  <div className="manifest-field">
                    <label>{t.skillDescription}</label>
                    <textarea
                      rows={2}
                      value={(aiGenerateForm as any).description || ''}
                      onChange={e => setAiGenerateForm({ ...(aiGenerateForm as any), description: e.target.value })}
                      placeholder="A skill that..."
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="manifest-field">
                      <label>{t.triggerKeywords}</label>
                      <input
                        value={(aiGenerateForm as any).triggerKeywords || ''}
                        onChange={e => setAiGenerateForm({ ...(aiGenerateForm as any), triggerKeywords: e.target.value })}
                        placeholder="keyword1, keyword2"
                      />
                    </div>
                    <div className="manifest-field">
                      <label>{t.complexity}</label>
                      <select
                        value={(aiGenerateForm as any).complexity || 'moderate'}
                        onChange={e => setAiGenerateForm({ ...(aiGenerateForm as any), complexity: e.target.value })}
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', padding: '0.4rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      >
                        <option value="simple">{t.simple}</option>
                        <option value="moderate">{t.moderate}</option>
                        <option value="advanced">{t.advanced}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button
                    className="btn-primary"
                    disabled={aiGenerating || !(aiGenerateForm as any).skillName || !(aiGenerateForm as any).description}
                    onClick={async () => {
                      setAiGenerating(true);
                      try {
                        const reqBody = {
                          skillName: (aiGenerateForm as any).skillName,
                          description: (aiGenerateForm as any).description,
                          category: (aiGenerateForm as any).category,
                          triggerKeywords: (aiGenerateForm as any).triggerKeywords
                            ? (aiGenerateForm as any).triggerKeywords.split(',').map((s: string) => s.trim()).filter(Boolean)
                            : [],
                          complexity: (aiGenerateForm as any).complexity || 'moderate',
                        };
                        const { data } = await axios.post('/api/ai/generate', reqBody);
                        setAiResult(data);
                      } catch { alert(t.generateFailed); }
                      finally { setAiGenerating(false); }
                    }}
                  >
                    {aiGenerating ? <><Loader2 size={16} className="spin" /> {t.generating}</> : <><Sparkles size={16} /> {t.generateSkill}</>}
                  </button>
                </div>
              </>
            )}

            {aiResult && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', fontWeight: 700,
                    background: aiResult.qualityScore >= 80 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: aiResult.qualityScore >= 80 ? 'var(--success)' : 'var(--warning)',
                    border: `3px solid ${aiResult.qualityScore >= 80 ? 'var(--success)' : 'var(--warning)'}`,
                  }}>
                    {aiResult.qualityScore}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{aiResult.skillName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t.qualityScore}: {aiResult.qualityScore}/100</div>
                  </div>
                </div>
                <div className="ai-result-preview">{aiResult.content}</div>
                {aiResult.suggestions.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{t.suggestions}</strong>
                    {aiResult.suggestions.map((s, i) => (
                      <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.25rem 0', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--accent-primary)' }}>•</span> {s}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                  <button className="btn-outline" onClick={() => setAiResult(null)}>{t.selectTemplate}</button>
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      try {
                        const { data } = await axios.post('/api/skills/create', {
                          name: aiResult.skillName,
                          content: aiResult.content,
                        });
                        if (data.success !== false) {
                          alert(t.generatedSuccessfully);
                          setShowAiGenerateModal(false);
                          setAiResult(null);
                          fetchSkills();
                        } else {
                          alert(t.generateFailed);
                        }
                      } catch { alert(t.generateFailed); }
                    }}
                  >
                    <CheckCircle2 size={16} /> {t.generateSkill}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== Security Gateway Modal ==================== */}
      {showSecurityModal && selectedSkill && (
        <div className="modal-overlay" onClick={() => setShowSecurityModal(false)}>
          <div className="modal-content" style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color="var(--accent-primary)" />
                {t.securityGateway} — {selectedSkill.name}
              </h2>
              <button className="btn-icon" onClick={() => setShowSecurityModal(false)}><X size={18} /></button>
            </div>

            {securityLoading && (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <Loader2 size={32} className="spin" color="var(--accent-primary)" />
                <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{t.securityCheck}...</p>
              </div>
            )}

            {securityReport && !securityLoading && (
              <>
                <div className="security-report-card">
                  <div className="security-score-ring">
                    <div className={`security-score-circle ${securityReport.passed ? 'pass' : 'fail'}`}>
                      {securityReport.score}
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                        {securityReport.passed ? '✓ ' + t.passed : '✗ ' + t.failed}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.securityScore}: {securityReport.score}/100</div>
                    </div>
                  </div>
                  {securityReport.risks.length > 0 ? (
                    <>
                      <strong style={{ fontSize: '0.85rem' }}>{t.risks} ({securityReport.risks.length})</strong>
                      {securityReport.risks.map((risk, i) => (
                        <div key={i} className={`security-risk-item ${risk.level}`}>
                          <span className={`security-risk-level ${risk.level}`}>{risk.level}</span>
                          <span>{risk.message}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--success)' }}>✓ {t.noRisks}</p>
                  )}
                  {securityReport.policyViolations.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--error)' }}>{t.policyViolations}</strong>
                      {securityReport.policyViolations.map((v, i) => (
                        <div key={i} style={{ fontSize: '0.78rem', color: 'var(--error)', padding: '0.2rem 0' }}>• {v}</div>
                      ))}
                    </div>
                  )}
                  {securityReport.recommendations.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{t.recommendations}</strong>
                      {securityReport.recommendations.map((r, i) => (
                        <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.2rem 0' }}>• {r}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button className="btn-outline" onClick={async () => {
                    try {
                      const { data } = await axios.get(`/api/security/gateway/backdoors/${selectedSkill.name}`);
                      setBackdoorResults(data.backdoors || []);
                      setBackdoorScanned(true);
                    } catch { alert(t.backdoorScan + ' failed'); }
                  }}>
                    <Shield size={16} /> {t.scanBackdoors}
                  </button>
                  <button className="btn-outline" onClick={async () => {
                    try {
                      const { data } = await axios.post(`/api/security/gateway/sandbox/${selectedSkill.name}`, { permissions: securityReport.risks.map(r => r.type) });
                      setSandboxConfig(data.config);
                    } catch { alert(t.generateSandbox + ' failed'); }
                  }}>
                    <Lock size={16} /> {t.generateSandbox}
                  </button>
                  {securityReport.score < 50 && (
                    <button className="btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={async () => {
                      if (!confirm(`${t.quarantine} ${selectedSkill.name}?`)) return;
                      try {
                        await axios.post(`/api/security/gateway/quarantine/${selectedSkill.name}`);
                        alert(t.quarantined);
                        setShowSecurityModal(false);
                        fetchSkills();
                      } catch { alert(t.quarantineFailed); }
                    }}>
                      <AlertTriangle size={16} /> {t.quarantine}
                    </button>
                  )}
                </div>

                {backdoorResults.length > 0 && (
                  <div className="security-report-card" style={{ marginTop: '0.5rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{t.backdoorScan}</strong>
                    {backdoorResults.map((bd, i) => (
                      <div key={i} className={`security-risk-item ${bd.severity}`}>
                        <span className={`security-risk-level ${bd.severity}`}>{bd.severity}</span>
                        <span>{bd.file}: {bd.pattern}</span>
                      </div>
                    ))}
                  </div>
                )}
                {backdoorResults.length === 0 && backdoorScanned && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.5rem' }}>✓ {t.noBackdoors}</p>
                )}

                {sandboxConfig && (
                  <div className="security-report-card" style={{ marginTop: '0.5rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{t.sandboxConfig}</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.8rem' }}>Read-only: <strong>{sandboxConfig.readOnly ? 'Yes' : 'No'}</strong></div>
                      <div style={{ fontSize: '0.8rem' }}>Network access: <strong>{sandboxConfig.networkAccess ? 'Yes' : 'No'}</strong></div>
                      <div style={{ fontSize: '0.8rem' }}>Process spawn: <strong>{sandboxConfig.processSpawn ? 'Yes' : 'No'}</strong></div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== Manifest Modal ==================== */}
      {showManifestModal && selectedSkill && (
        <div className="modal-overlay" onClick={() => setShowManifestModal(false)}>
          <div className="modal-content manifest-editor" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileJson size={20} color="var(--accent-primary)" />
                {t.manifestEditor} — {selectedSkill.name}
              </h2>
              <button className="btn-icon" onClick={() => setShowManifestModal(false)}><X size={18} /></button>
            </div>

            {!manifestData && (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>{t.noManifest}</p>
                <button className="btn-primary" onClick={async () => {
                  try {
                    const { data } = await axios.post(`/api/manifest/${selectedSkill.name}`, {
                      name: selectedSkill.name,
                      version: '1.0.0',
                      description: '',
                    });
                    setManifestData(data.manifest);
                    setManifestEditing(true);
                  } catch { alert(t.manifestSaveFailed); }
                }}>
                  <Plus size={16} /> {t.createManifest}
                </button>
              </div>
            )}

            {manifestData && (
              <>
                {manifestValidation && (
                  <div className={`manifest-validation ${manifestValidation.valid ? 'valid' : 'invalid'}`}>
                    {manifestValidation.valid ? `✓ ${t.manifestValid}` : `✗ ${t.manifestInvalid}`}
                    {manifestValidation.errors.map((e, i) => (
                      <div key={i} style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>• {e}</div>
                    ))}
                    {manifestValidation.warnings.map((w, i) => (
                      <div key={i} style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>⚠ {w}</div>
                    ))}
                  </div>
                )}
                <div className="manifest-field">
                  <label>Name</label>
                  <input value={manifestData.name || ''} disabled={!manifestEditing}
                    onChange={e => setManifestData({ ...manifestData, name: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="manifest-field">
                    <label>Version</label>
                    <input value={manifestData.version || ''} disabled={!manifestEditing}
                      onChange={e => setManifestData({ ...manifestData, version: e.target.value })} />
                  </div>
                  <div className="manifest-field">
                    <label>License</label>
                    <input value={manifestData.license || ''} disabled={!manifestEditing}
                      onChange={e => setManifestData({ ...manifestData, license: e.target.value })} />
                  </div>
                </div>
                <div className="manifest-field">
                  <label>{t.skillDescription}</label>
                  <textarea rows={2} value={manifestData.description || ''} disabled={!manifestEditing}
                    onChange={e => setManifestData({ ...manifestData, description: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="manifest-field">
                    <label>Author</label>
                    <input value={manifestData.author || ''} disabled={!manifestEditing}
                      onChange={e => setManifestData({ ...manifestData, author: e.target.value })} />
                  </div>
                  <div className="manifest-field">
                    <label>Category</label>
                    <input value={manifestData.category || ''} disabled={!manifestEditing}
                      onChange={e => setManifestData({ ...manifestData, category: e.target.value })} />
                  </div>
                </div>
                <div className="manifest-field">
                  <label>Keywords (comma-separated)</label>
                  <input
                    value={(manifestData.keywords || []).join(', ')}
                    disabled={!manifestEditing}
                    onChange={e => setManifestData({ ...manifestData, keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  />
                </div>
                <div className="manifest-field">
                  <label>Permissions (comma-separated)</label>
                  <input
                    value={(manifestData.permissions || []).join(', ')}
                    disabled={!manifestEditing}
                    onChange={e => setManifestData({ ...manifestData, permissions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  />
                </div>
                {manifestData.dependencies && manifestData.dependencies.length > 0 && (
                  <div className="manifest-field">
                    <label>{t.dependencies} ({manifestData.dependencies.length})</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {manifestData.dependencies.map((dep, i) => (
                        <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          • <strong>{dep.name}</strong> v{dep.version} <span style={{ color: 'var(--text-muted)' }}>({dep.source})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-outline" onClick={async () => {
                      try {
                        const { data } = await axios.get(`/api/manifest/${selectedSkill.name}/validate`);
                        setManifestValidation(data);
                      } catch { alert(t.manifestInvalid); }
                    }}>
                      <ShieldCheck size={16} /> {t.validateManifest}
                    </button>
                    {!manifestEditing ? (
                      <button className="btn-outline" onClick={() => setManifestEditing(true)}>
                        <Edit2 size={16} /> {t.editManifest}
                      </button>
                    ) : null}
                  </div>
                  {manifestEditing && (
                    <button className="btn-primary" onClick={async () => {
                      try {
                        await axios.put(`/api/manifest/${selectedSkill.name}`, manifestData);
                        setManifestEditing(false);
                        alert(t.manifestSaved);
                      } catch { alert(t.manifestSaveFailed); }
                    }}>
                      <Save size={16} /> {t.saveManifest}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== Cache Management Panel ==================== */}
      {showCachePanel && (
        <div className="modal-overlay" onClick={() => setShowCachePanel(false)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} color="var(--accent-primary)" />
                {t.cacheManagement}
              </h2>
              <button className="btn-icon" onClick={() => setShowCachePanel(false)}><X size={18} /></button>
            </div>
            {cacheStats && (
              <div className="cache-panel">
                <div className="cache-stat-row">
                  <span className="cache-stat-label">{t.cacheEntries}</span>
                  <span className="cache-stat-value">{cacheStats.entries}</span>
                </div>
                <div className="cache-stat-row">
                  <span className="cache-stat-label">{t.cacheHits}</span>
                  <span className="cache-stat-value" style={{ color: 'var(--success)' }}>{cacheStats.hits}</span>
                </div>
                <div className="cache-stat-row">
                  <span className="cache-stat-label">{t.cacheMisses}</span>
                  <span className="cache-stat-value" style={{ color: 'var(--warning)' }}>{cacheStats.misses}</span>
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span className="cache-stat-label">{t.cacheHitRate}</span>
                    <span className="cache-stat-value">{(cacheStats.hitRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="cache-hit-rate-bar">
                    <div className="cache-hit-rate-fill" style={{ width: `${cacheStats.hitRate * 100}%` }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button className="btn-outline" style={{ flex: 1 }} onClick={async () => {
                    try {
                      await axios.post('/api/cache/invalidate', { pattern: '.*' });
                      const { data } = await axios.get('/api/cache/stats');
                      setCacheStats(data);
                      alert(t.cacheInvalidated);
                    } catch { /* ignore */ }
                  }}>
                    {t.invalidateCache}
                  </button>
                  <button className="btn-outline" style={{ flex: 1, color: 'var(--error)' }} onClick={async () => {
                    try {
                      await axios.post('/api/cache/clear');
                      const { data } = await axios.get('/api/cache/stats');
                      setCacheStats(data);
                      alert(t.cacheCleared);
                    } catch { /* ignore */ }
                  }}>
                    {t.clearCache}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortcuts help tooltip (Ctrl+?) */}
      {showShortcutsHelp && (
        <div className="shortcuts-help-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={16} color="var(--accent-primary)" />
              {t.keyboardShortcuts}
            </strong>
            <button className="btn-icon" onClick={() => setShowShortcutsHelp(false)}><X size={16} /></button>
          </div>
          <div className="shortcuts-help-list">
            {[
              ['Ctrl+K', t.searchSkillsShortcut],
              ['Ctrl+R', t.refreshSkills],
              ['Ctrl+N', t.newSkillShortcut],
              ['Ctrl+Shift+S', t.toggleSyncModal],
              ['Ctrl+,', t.goToSettings],
              ['Ctrl+1', t.dashboardShortcut],
              ['Ctrl+2', t.marketShortcut],
              ['Ctrl+/', t.toggleLanguage],
              ['Ctrl+Shift+T', t.toggleTheme],
              ['Ctrl+?', t.shortcutsHelp],
              ['Esc', t.closeModal],
            ].map(([key, desc]) => (
              <div key={key} className="shortcut-row">
                <span>{desc}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
</div>
  );
};

export default App;