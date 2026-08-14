import React, { useEffect, useState } from 'react';
import { Token } from '../types';
import { X, Clock, User, Layers, Tag, FileText, CheckCircle2, PauseCircle, SkipForward, AlertCircle } from 'lucide-react';

interface TokenDetailsModalProps {
  tokenId: string | null;
  onClose: () => void;
}

export const TokenDetailsModal: React.FC<TokenDetailsModalProps> = ({ tokenId, onClose }) => {
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId) return;

    async function fetchTokenDetails() {
      setLoading(true);
      setError(null);
      try {
        const storedToken = localStorage.getItem('qc_token');
        const res = await fetch(`/api/staff/tokens/${tokenId}`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to load token details');
        }
        const data = await res.json();
        setToken(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchTokenDetails();
  }, [tokenId]);

  if (!tokenId) return null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SERVING': return <span className="badge badge-open">SERVING</span>;
      case 'WAITING': return <span className="badge badge-busy">WAITING</span>;
      case 'HELD': return <span className="badge badge-busy">HELD</span>;
      case 'COMPLETED': return <span className="badge badge-open">COMPLETED</span>;
      case 'SKIPPED': return <span className="badge badge-closed">SKIPPED</span>;
      case 'CANCELLED': return <span className="badge badge-closed">CANCELLED</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
            }}>
              {token?.token_number || 'Token Details'}
            </div>
            {token && getStatusBadge(token.status)}
            {token?.priority !== 'NORMAL' && (
              <span className="badge badge-priority">{token?.priority} PRIORITY</span>
            )}
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
            Loading token information...
          </div>
        ) : error ? (
          <div style={{ color: 'var(--status-closed)', padding: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        ) : token ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Student & Service Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              backgroundColor: 'var(--bg-dark)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <User size={14} /> Student Customer
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem' }}>
                  {token.student_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {token.student_email || 'No email registered'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Layers size={14} /> Service & Counter
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem' }}>
                  {token.service_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {token.counter_name || 'Unassigned'}
                </div>
              </div>
            </div>

            {/* Request Notes */}
            {token.notes && (
              <div style={{
                backgroundColor: 'var(--bg-dark)',
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                  <FileText size={14} /> Student Request Notes
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  "{token.notes}"
                </div>
              </div>
            )}

            {/* Audit Timeline */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                Token Lifecycle Timeline
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Token Created</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatDate(token.created_at)}</span>
                </div>
                {token.started_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Started Serving</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-open)' }}>{formatDate(token.started_at)}</span>
                  </div>
                )}
                {token.held_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Placed on Hold</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-busy)' }}>{formatDate(token.held_at)}</span>
                  </div>
                )}
                {token.completed_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Completed</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-open)' }}>{formatDate(token.completed_at)}</span>
                  </div>
                )}
                {token.skipped_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Skipped</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-closed)' }}>{formatDate(token.skipped_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Modal Footer */}
        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
