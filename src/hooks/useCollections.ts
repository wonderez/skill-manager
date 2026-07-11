import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import type { Toast } from '../types';
import { TRANSLATIONS } from '../translations';

type Translation = typeof TRANSLATIONS['en'];

type ToastFn = (type: Toast['type'], title: string, message?: string) => void;

export interface CollectionEntry {
  skillName: string;
  skillPath?: string;
  addedAt: string;
  note?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  skills: CollectionEntry[];
  createdAt: string;
  updatedAt: string;
}

export function useCollections(toast: ToastFn, t: Translation) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<{ collections: Collection[] }>('/api/collections');
      setCollections(data.collections);
    } catch (err: any) {
      toast('error', t.loadFailed, err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchAll(); }, [fetchAll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const create = useCallback(async (name: string, description?: string, color?: string, icon?: string) => {
    try {
      const { data } = await axios.post<Collection>('/api/collections', { name, description, color, icon });
      setCollections(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      toast('success', t.collectionCreated, name);
      return data;
    } catch (err: any) {
      toast('error', t.creationFailed, err.response?.data?.error || err.message);
      throw err;
    }
  }, [toast, t]);

  const update = useCallback(async (id: string, patch: Partial<Pick<Collection, 'name' | 'description' | 'color' | 'icon'>>) => {
    try {
      const { data } = await axios.put<Collection>(`/api/collections/${id}`, patch);
      setCollections(prev => prev.map(c => c.id === id ? data : c).sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (err: any) {
      toast('error', t.updateFailed, err.response?.data?.error || err.message);
      throw err;
    }
  }, [toast, t]);

  const remove = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/collections/${id}`);
      setCollections(prev => prev.filter(c => c.id !== id));
      toast('success', t.collectionDeleted);
    } catch (err: any) {
      toast('error', t.removeFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const addSkill = useCallback(async (id: string, skillName: string, skillPath?: string, note?: string) => {
    try {
      const { data } = await axios.post<Collection>(`/api/collections/${id}/skills`, { skillName, skillPath, note });
      setCollections(prev => prev.map(c => c.id === id ? data : c));
      toast('success', t.addedToCollection, `${skillName} → ${data.name}`);
    } catch (err: any) {
      toast('error', t.addFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const removeSkill = useCallback(async (id: string, skillName: string, skillPath?: string) => {
    try {
      const { data } = await axios.delete<Collection>(`/api/collections/${id}/skills`, { data: { skillName, skillPath } });
      setCollections(prev => prev.map(c => c.id === id ? data : c));
    } catch (err: any) {
      toast('error', t.removeFailed, err.response?.data?.error || err.message);
    }
  }, [toast, t]);

  const exportManifest = useCallback(async (id: string) => {
    try {
      const { data } = await axios.get(`/api/collections/${id}/export`);
      return data;
    } catch (err: any) {
      toast('error', t.exportFailed, err.response?.data?.error || err.message);
      throw err;
    }
  }, [toast, t]);

  return { collections, loading, fetchAll, create, update, remove, addSkill, removeSkill, exportManifest };
}
