import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const InlineModal: React.FC<{
  open: boolean; onClose: () => void; title: string; icon?: React.ReactNode;
  children: React.ReactNode; width?: string
}> = ({ open, onClose, title, icon, children, width = '480px' }) => (
  <AnimatePresence>
    {open && (
      <div className="modal-overlay" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="modal-content"
          style={{ maxWidth: width }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>{icon}{title}</h2>
            <button className="btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
