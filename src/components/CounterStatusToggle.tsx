import React from 'react';
import { CounterStatus } from '../types';
import { Power, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';

interface CounterStatusToggleProps {
  currentStatus: CounterStatus;
  onStatusChange: (status: CounterStatus) => void;
  disabled?: boolean;
}

export const CounterStatusToggle: React.FC<CounterStatusToggleProps> = ({
  currentStatus,
  onStatusChange,
  disabled = false,
}) => {
  const statuses: Array<{
    id: CounterStatus;
    label: string;
    icon: React.ReactNode;
    activeClass: string;
  }> = [
    { id: 'OPEN', label: 'OPEN', icon: <Power size={14} />, activeClass: 'badge-open' },
    { id: 'CLOSED', label: 'CLOSED', icon: <ShieldAlert size={14} />, activeClass: 'badge-closed' },
    { id: 'BUSY', label: 'BUSY', icon: <Clock size={14} />, activeClass: 'badge-busy' },
    { id: 'MAINTENANCE', label: 'MAINTENANCE', icon: <AlertTriangle size={14} />, activeClass: 'badge-maint' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      backgroundColor: 'var(--bg-dark)',
      padding: '0.375rem',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--text-muted)',
        padding: '0 0.5rem',
        textTransform: 'uppercase',
      }}>
        Counter Lifecycle:
      </span>
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
        {statuses.map((st) => {
          const isSelected = currentStatus === st.id;
          return (
            <button
              key={st.id}
              onClick={() => onStatusChange(st.id)}
              disabled={disabled}
              className={`badge ${isSelected ? st.activeClass : ''}`}
              style={{
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: isSelected ? 1 : 0.4,
                backgroundColor: isSelected ? undefined : 'transparent',
                border: isSelected ? undefined : '1px solid transparent',
                color: isSelected ? undefined : 'var(--text-secondary)',
                padding: '0.375rem 0.75rem',
                fontSize: '0.75rem',
                transition: 'all 0.15s ease',
              }}
            >
              {st.icon}
              <span>{st.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
