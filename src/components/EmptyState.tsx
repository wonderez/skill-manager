import React from 'react';

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }> = ({ icon, title, description, action }) => (
  <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
    <div style={{ opacity: 0.4, marginBottom: '1.5rem' }}>{icon}</div>
    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{title}</div>
    <div style={{ fontSize: '0.85rem', maxWidth: '360px', margin: '0 auto', lineHeight: 1.6 }}>{description}</div>
    {action && <div style={{ marginTop: '1.5rem' }}>{action}</div>}
  </div>
);
