import React from 'react';
import { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => {
        let icon = <Info size={20} style={{ color: 'var(--accent-secondary)' }} />;
        let borderColor = 'var(--accent-secondary)';

        if (t.type === 'success') {
          icon = <CheckCircle2 size={20} style={{ color: 'var(--status-open)' }} />;
          borderColor = 'var(--status-open)';
        } else if (t.type === 'error') {
          icon = <AlertCircle size={20} style={{ color: 'var(--status-closed)' }} />;
          borderColor = 'var(--status-closed)';
        } else if (t.type === 'warning') {
          icon = <AlertCircle size={20} style={{ color: 'var(--status-busy)' }} />;
          borderColor = 'var(--status-busy)';
        }

        return (
          <div key={t.id} className="toast" style={{ borderLeft: `4px solid ${borderColor}` }}>
            <div style={{ marginTop: '0.125rem' }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                {t.message}
              </div>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '0.125rem' }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
