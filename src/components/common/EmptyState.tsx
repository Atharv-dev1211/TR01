import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      backgroundColor: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed var(--border-color)',
      textAlign: 'center',
      minHeight: '300px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-dark)',
        padding: '1rem',
        borderRadius: 'var(--radius-full)',
        marginBottom: '1.5rem',
        color: 'var(--text-muted)'
      }}>
        <Icon size={32} />
      </div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
        {title}
      </h3>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: action ? '1.5rem' : 0, lineHeight: 1.5 }}>
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};
