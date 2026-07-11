import { useState } from 'react';
import { Layers, Plus, Trash2, Download, Loader2, FolderPlus, X, FileText, Upload } from 'lucide-react';
import type { Collection, CollectionEntry } from '../hooks/useCollections';
import type { Skill } from '../types';
import { TRANSLATIONS } from '../translations';

type Translation = typeof TRANSLATIONS['en'];

interface Props {
  collections: Collection[];
  loading: boolean;
  skills: Skill[];
  t: Translation;
  onCreate: (name: string, desc?: string, color?: string, icon?: string) => Promise<void>;
  onDelete: (id: string) => void;
  onAddSkill: (id: string, skillName: string, skillPath?: string) => Promise<void>;
  onRemoveSkill: (id: string, skillName: string, skillPath?: string) => Promise<void>;
  onExport: (id: string) => Promise<void>;
  onImportCollection?: () => void;
}

const COLOR_OPTIONS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
const ICON_OPTIONS = ['📁', '✍️', '🔬', '🎨', '🛡️', '📊', '🚀', '⚙️'];

export function CollectionsView({
  collections, loading, skills, t,
  onCreate, onDelete, onAddSkill, onRemoveSkill, onExport, onImportCollection,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);
  const [newIcon, setNewIcon] = useState(ICON_OPTIONS[0]);
  const [addSkillFor, setAddSkillFor] = useState<Collection | null>(null);
  const [selectedSkill, setSelectedSkill] = useState('');

  const submit = async () => {
    if (!newName.trim()) return;
    await onCreate(newName.trim(), newDesc.trim() || undefined, newColor, newIcon);
    setNewName(''); setNewDesc('');
    setShowCreate(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Layers size={24} color="var(--accent-primary)" />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{t.collectionsTitle}</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t.collectionsSubtitle}
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            {onImportCollection && (
              <button className="btn-outline" onClick={onImportCollection}>
                <Upload size={14} /> {t.importCollection}
              </button>
            )}
            <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
              <Plus size={14} /> {t.newCollection}
            </button>
          </div>
        </div>

        {showCreate && (
          <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <input
                placeholder={t.collectionName}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
              />
              <input
                placeholder={t.collectionDesc}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                style={{ padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: c,
                    border: newColor === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {ICON_OPTIONS.map(i => (
                <button
                  key={i}
                  onClick={() => setNewIcon(i)}
                  style={{
                    width: 32, height: 32, borderRadius: '6px',
                    background: newIcon === i ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    fontSize: '1rem', cursor: 'pointer',
                  }}
                >{i}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-primary" disabled={!newName.trim()} onClick={submit}>
                {t.save}
              </button>
              <button className="btn-outline" onClick={() => setShowCreate(false)}>{t.cancel}</button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={32} className="spin" />
        </div>
      ) : collections.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <div>{t.noCollections}</div>
        </div>
      ) : (
        <div className="skills-grid">
          {collections.map(col => (
            <div key={col.id} className="glass-card" style={{ padding: '1.5rem', borderTop: `3px solid #${col.color || '6366f1'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem' }}>{col.icon || '📁'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{col.name}</div>
                  {col.description && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{col.description}</div>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {col.skills.length} {t.skillsCount}
                </div>
              </div>

              {col.skills.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem 0', fontStyle: 'italic' }}>
                  {t.emptyCollection}
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0', fontSize: '0.85rem' }}>
                  {col.skills.map((s: CollectionEntry, i: number) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0' }}>
                      <FileText size={12} color="var(--text-muted)" />
                      <span style={{ flex: 1 }}>{s.skillName}</span>
                      {s.note && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>— {s.note}</span>}
                      <button
                        className="btn-icon"
                        style={{ padding: '2px' }}
                        onClick={() => onRemoveSkill(col.id, s.skillName, s.skillPath)}
                        title={t.removeSkill}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
                <button
                  className="btn-outline"
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                  onClick={() => setAddSkillFor(addSkillFor?.id === col.id ? null : col)}
                >
                  <FolderPlus size={12} /> {t.addSkill}
                </button>
                <button
                  className="btn-outline"
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                  onClick={() => onExport(col.id)}
                >
                  <Download size={12} /> {t.exportCollection}
                </button>
                <button
                  className="btn-icon"
                  style={{ marginLeft: 'auto', color: 'rgb(231, 76, 60)' }}
                  onClick={() => { if (confirm(t.confirmDeleteCollection.replace('{name}', col.name))) onDelete(col.id); }}
                  title={t.delete}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {addSkillFor?.id === col.id && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem' }}>
                  <select
                    value={selectedSkill}
                    onChange={e => setSelectedSkill(e.target.value)}
                    style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'white' }}
                  >
                    <option value="">— {t.addSkill} —</option>
                    {skills.map(s => (
                      <option key={s.name + (s.path || '')} value={s.path || s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-primary"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                    disabled={!selectedSkill}
                    onClick={async () => {
                      const sk = skills.find(s => (s.path || s.name) === selectedSkill);
                      if (sk) {
                        await onAddSkill(col.id, sk.name, sk.path);
                        setSelectedSkill('');
                        setAddSkillFor(null);
                      }
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
