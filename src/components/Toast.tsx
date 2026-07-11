import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import type { Toast } from '../types';

const icons = { success: CheckCheck, error: AlertTriangle, warning: AlertCircle, info: Info };
const colors = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '#10b981' },
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', icon: '#ef4444' },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '#f59e0b' },
  info: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', icon: '#6366f1' },
};

export const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => (
  <div style={{
    position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
    display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '420px', width: '100%',
    pointerEvents: 'none'
  }}>
    <AnimatePresence>
      {toasts.map(toast => {
        const Icon = icons[toast.type];
        const c = colors[toast.type];
        return (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            style={{
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: '14px',
              padding: '1rem 1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              pointerEvents: 'auto'
            }}
          >
            <Icon size={18} style={{ color: c.icon, flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{toast.title}</div>
              {toast.message && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{toast.message}</div>}
            </div>
            <button onClick={() => onDismiss(toast.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </motion.div>
        );
      })}
    </AnimatePresence>
  </div>
);
