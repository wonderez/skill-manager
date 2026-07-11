import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, Save, Eye, Edit3, Loader2, FileText } from 'lucide-react';
import { TRANSLATIONS } from '../translations';

type Translation = typeof TRANSLATIONS['en'];

interface Props {
  skillPath: string | null;
  skillName: string;
  onClose: () => void;
  t: Translation;
  onSaved?: () => void;
}

export function SkillMarkdownEditor({ skillPath, skillName, onClose, t, onSaved }: Props) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!skillPath) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get<{ content: string }>('/api/skills/content', {
        params: { skillPath },
      });
      setContent(data.content);
      setOriginal(data.content);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [skillPath]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useCallback(async () => {
    if (!skillPath) return;
    if (content === original) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await axios.put('/api/skills/content', { skillPath, content });
      setOriginal(content);
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }, [skillPath, content, original, onClose, onSaved]);

  // Minimal Markdown preview (no deps). Handles headings, bold, italic, code, links, lists.
  const renderMarkdown = (md: string): string => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split(/\r?\n/);
    const html: string[] = [];
    let inCode = false;
    let inList = false;

    for (const raw of lines) {
      const line = raw;
      if (line.startsWith('```')) {
        if (inCode) { html.push('</code></pre>'); inCode = false; }
        else { html.push('<pre><code>'); inCode = true; }
        continue;
      }
      if (inCode) { html.push(esc(line)); continue; }

      // Headings
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        if (inList) { html.push('</ul>'); inList = false; }
        const level = h[1].length;
        html.push(`<h${level}>${esc(h[2])}</h${level}>`);
        continue;
      }

      // Bullet list
      const b = line.match(/^\s*[-*+]\s+(.+)$/);
      if (b) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push(`<li>${inlineFmt(b[1])}</li>`);
        continue;
      }

      // Numbered list
      const n = line.match(/^\s*\d+\.\s+(.+)$/);
      if (n) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<p>${inlineFmt(n[1])}</p>`);
        continue;
      }

      if (inList) { html.push('</ul>'); inList = false; }
      if (line.trim() === '') { html.push(''); continue; }
      html.push(`<p>${inlineFmt(line)}</p>`);
    }
    if (inList) html.push('</ul>');
    if (inCode) html.push('</code></pre>');
    return html.join('\n');

    function inlineFmt(s: string): string {
      let r = esc(s);
      r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
      r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return r;
    }
  };

  if (!skillPath) return null;

  const dirty = content !== original;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <div className="glass-card" style={{ width: 'min(900px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <FileText size={20} color="var(--accent-primary)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{skillName} — SKILL.md</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{skillPath}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              className={mode === 'edit' ? 'btn-primary' : 'btn-outline'}
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
              onClick={() => setMode('edit')}
            >
              <Edit3 size={12} /> {t.edit}
            </button>
            <button
              className={mode === 'preview' ? 'btn-primary' : 'btn-outline'}
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
              onClick={() => setMode('preview')}
            >
              <Eye size={12} /> {t.preview}
            </button>
          </div>
          <button className="btn-icon" onClick={onClose} title={t.cancel}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <Loader2 size={32} className="spin" />
            </div>
          ) : error ? (
            <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(231, 76, 60, 0.1)', color: 'rgb(231, 76, 60)' }}>
              {error}
            </div>
          ) : mode === 'edit' ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: '500px',
                padding: '1rem',
                borderRadius: '8px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'white',
                fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
                fontSize: '0.85rem',
                lineHeight: 1.6,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          ) : (
            <div
              className="markdown-preview"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              style={{ lineHeight: 1.7, color: 'var(--text-primary)' }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {content.length} {t.chars} {dirty && <span style={{ color: 'var(--accent-warning, #f59e0b)' }}>• {t.unsaved}</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-outline" onClick={onClose}>{t.cancel}</button>
            <button
              className="btn-primary"
              disabled={saving || !dirty}
              onClick={save}
            >
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
