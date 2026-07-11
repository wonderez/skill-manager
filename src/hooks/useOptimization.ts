import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { TRANSLATIONS } from '../translations';
import type {
  HealthReport,
  VerifyAllReport,
  RegistryFile,
  RegistryStats,
  CategoryDef,
  RecycleEntry,
  ToolRegistryEntry,
  MetadataValidation,
  TraceReport,
  IncrementalSyncReport,
  InstallResult,
  UninstallResult,
} from '../types';

type Translation = typeof TRANSLATIONS['en'];

interface ToastFn {
  (type: 'success' | 'error' | 'info', title: string, message?: string): void;
}

export function useOptimization(toast: ToastFn, t: Translation) {
  // Health Check
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Verify
  const [verifyReport, setVerifyReport] = useState<VerifyAllReport | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Registry
  const [registry, setRegistry] = useState<RegistryFile | null>(null);
  const [registryStats, setRegistryStats] = useState<RegistryStats | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);

  // Categories
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Recycle Bin
  const [recycleEntries, setRecycleEntries] = useState<RecycleEntry[]>([]);
  const [recycleStats, setRecycleStats] = useState<{ totalBackups: number; totalSize: number; oldestBackup: string | null } | null>(null);

  // Tool Registry
  const [toolRegistry, setToolRegistry] = useState<ToolRegistryEntry[]>([]);
  const [toolRegistryStats, setToolRegistryStats] = useState<{ totalTools: number; installedCount: number; fetchedAt: string | null } | null>(null);

  // Metadata
  const [metadataValidations, setMetadataValidations] = useState<MetadataValidation[]>([]);

  // Incremental Sync
  const [incrementalReport, setIncrementalReport] = useState<IncrementalSyncReport | null>(null);

  // Ignore list
  const [ignoreEntries, setIgnoreEntries] = useState<string[]>([]);

  // Active trace
  const [activeTrace, setActiveTrace] = useState<TraceReport | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  // ===== Fetch Functions =====

  const fetchHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    try {
      const { data } = await axios.get('/api/health-check');
      setHealthReport(data);
    } catch (err) {
      console.error('Failed to fetch health check', err);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const fixHealthIssues = useCallback(async () => {
    try {
      const { data } = await axios.post('/api/health-check/fix');
      toast('success', t.fixedToast, t.brokenJunctionsRemoved.replace('{n}', String(data.fixed)));
      fetchHealthCheck();
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t, fetchHealthCheck]);

  const fetchVerify = useCallback(async () => {
    setVerifyLoading(true);
    try {
      const { data } = await axios.get('/api/sync/verify');
      setVerifyReport(data);
    } catch (err) {
      console.error('Failed to fetch verify report', err);
    } finally {
      setVerifyLoading(false);
    }
  }, []);

  const fetchRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const { data } = await axios.get('/api/registry');
      setRegistry(data);
      setRegistryStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch registry', err);
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const rebuildRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const { data } = await axios.post('/api/registry/rebuild');
      setRegistry(data);
      setRegistryStats(data.stats);
      toast('success', t.registryRebuilt, t.skillsIndexed.replace('{n}', String(data.entries.length)));
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    } finally {
      setRegistryLoading(false);
    }
  }, [toast, t]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/categories');
      setCategories(data);
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  }, []);

  const fetchRecycleBin = useCallback(async () => {
    try {
      const [listRes, statsRes] = await Promise.all([
        axios.get('/api/recycle-bin'),
        axios.get('/api/recycle-bin/stats'),
      ]);
      setRecycleEntries(listRes.data);
      setRecycleStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch recycle bin', err);
    }
  }, []);

  const restoreFromRecycle = useCallback(async (name: string) => {
    try {
      await axios.post(`/api/recycle-bin/${name}/restore`);
      toast('success', t.restoredToast, t.restoredToMaster.replace('{name}', name));
      fetchRecycleBin();
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t, fetchRecycleBin]);

  const purgeFromRecycle = useCallback(async (name: string) => {
    try {
      await axios.delete(`/api/recycle-bin/${name}`);
      toast('success', t.deletedToast, t.permanentlyRemoved.replace('{name}', name));
      fetchRecycleBin();
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t, fetchRecycleBin]);

  const purgeAllRecycle = useCallback(async () => {
    try {
      const { data } = await axios.delete('/api/recycle-bin');
      toast('success', t.clearedToast, t.backupsRemoved.replace('{n}', String(data.purged)));
      fetchRecycleBin();
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t, fetchRecycleBin]);

  const fetchToolRegistry = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/tool-registry');
      setToolRegistry(data.tools);
    } catch (err) {
      console.error('Failed to fetch tool registry', err);
    }
  }, []);

  const refreshToolRegistry = useCallback(async () => {
    try {
      const { data } = await axios.post('/api/tool-registry/refresh');
      setToolRegistry(data.tools);
      toast('success', t.refreshedToast, t.toolsFetched.replace('{n}', String(data.tools.length)));
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const fetchToolRegistryStats = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/tool-registry/stats');
      setToolRegistryStats(data);
    } catch (err) {
      console.error('Failed to fetch tool registry stats', err);
    }
  }, []);

  const fetchMetadataValidations = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/metadata/validate-all');
      setMetadataValidations(data);
    } catch (err) {
      console.error('Failed to fetch metadata validations', err);
    }
  }, []);

  const fixMetadata = useCallback(async (skillPath: string) => {
    try {
      await axios.post('/api/metadata/fix', { skillPath });
      toast('success', t.fixedToast, t.metadataUpdated);
      fetchMetadataValidations();
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t, fetchMetadataValidations]);

  const fetchTrace = useCallback(async (skillPath: string) => {
    setTraceLoading(true);
    try {
      const { data } = await axios.get('/api/quality/trace', { params: { path: skillPath } });
      setActiveTrace(data);
    } catch (err) {
      console.error('Failed to fetch trace', err);
    } finally {
      setTraceLoading(false);
    }
  }, []);

  const runIncrementalSync = useCallback(async () => {
    try {
      const { data } = await axios.post('/api/sync/incremental');
      setIncrementalReport(data);
      toast('success', t.syncComplete,
        t.syncCompleteMsg.replace('{a}', String(data.changedSkills.length + data.newSkills.length)).replace('{b}', String(data.totalJunctionsCreated)));
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const addTag = useCallback(async (skillName: string, tag: string) => {
    try {
      await axios.post(`/api/skills/${skillName}/tags`, { tag });
      toast('success', t.tagAdded, `${tag} → ${skillName}`);
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const removeTag = useCallback(async (skillName: string, tag: string) => {
    try {
      await axios.delete(`/api/skills/${skillName}/tags/${tag}`);
      toast('success', t.tagRemoved, t.tagRemovedFromSkill.replace('{tag}', tag).replace('{skillName}', skillName));
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const uninstallSkill = useCallback(async (skillName: string) => {
    try {
      const { data } = await axios.delete(`/api/skills/${skillName}`);
      if (data.success) {
        toast('success', t.uninstalledToast, t.movedToRecycleBin.replace('{name}', skillName));
      } else {
        toast('error', t.actionFailed, data.error || t.unknownError);
      }
      return data as UninstallResult;
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
      return null;
    }
  }, [toast, t]);

  const installSkill = useCallback(async (source: 'github' | 'local', url?: string, localPath?: string, name?: string) => {
    try {
      const { data } = await axios.post('/api/skills/install', { source, url, localPath, name });
      if (data.success) {
        toast('success', t.installed, t.linkedPlatformsMsg.replace('{name}', data.name).replace('{n}', String(data.linkedPlatforms.length)));
      } else {
        toast('error', t.actionFailed, data.error || t.unknownError);
      }
      return data as InstallResult;
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
      return null;
    }
  }, [toast, t]);

  const fetchIgnoreEntries = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/health-check/ignore');
      setIgnoreEntries(data.entries);
    } catch (err) {
      console.error('Failed to fetch ignore entries', err);
    }
  }, []);

  const saveIgnoreEntries = useCallback(async (entries: string[]) => {
    try {
      await axios.post('/api/health-check/ignore', { entries });
      setIgnoreEntries(entries);
      toast('success', t.savedToast, t.skillignoreUpdated);
    } catch (err: any) {
      toast('error', t.actionFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  // ===== Initial Load =====
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([fetchCategories(), fetchToolRegistryStats(), fetchIgnoreEntries()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Health Check
    healthReport, healthLoading, fetchHealthCheck, fixHealthIssues,
    // Verify
    verifyReport, verifyLoading, fetchVerify,
    // Registry
    registry, registryStats, registryLoading, fetchRegistry, rebuildRegistry,
    // Categories
    categories, selectedCategory, setSelectedCategory,
    // Recycle Bin
    recycleEntries, recycleStats, fetchRecycleBin, restoreFromRecycle, purgeFromRecycle, purgeAllRecycle,
    // Tool Registry
    toolRegistry, toolRegistryStats, fetchToolRegistry, refreshToolRegistry, fetchToolRegistryStats,
    // Metadata
    metadataValidations, fetchMetadataValidations, fixMetadata,
    // TRACE
    activeTrace, traceLoading, fetchTrace,
    // Incremental Sync
    incrementalReport, runIncrementalSync,
    // Tags
    addTag, removeTag,
    // Install/Uninstall
    installSkill, uninstallSkill,
    // Ignore
    ignoreEntries, saveIgnoreEntries,
  };
}
