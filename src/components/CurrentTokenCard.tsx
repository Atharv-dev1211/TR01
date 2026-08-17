import React, { useState, useEffect } from 'react';
import { Token } from '../types';
import { CheckCircle2, PauseCircle, SkipForward, Clock, User, FileText, AlertCircle, Sparkles } from 'lucide-react';

interface CurrentTokenCardProps {
  token: Token | null;
  counterStatus: string;
  onComplete: (tokenId: string) => void;
  onHold: (tokenId: string) => void;
  onSkip: (tokenId: string) => void;
  onViewDetails: (tokenId: string) => void;
  isLoading: boolean;
}

export const CurrentTokenCard: React.FC<CurrentTokenCardProps> = ({
  token,
  counterStatus,
  onComplete,
  onHold,
  onSkip,
  onViewDetails,
  isLoading,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [showSkipConfirm, setShowSkipConfirm] = useState<boolean>(false);

  // Live timer tick for currently serving token
  useEffect(() => {
    if (!token?.started_at) {
      setElapsedSeconds(0);
      return;
    }

    const calculateElapsed = () => {
      const start = new Date(token.started_at!).getTime();
      const now = new Date().getTime();
      const diff = Math.floor((now - start) / 1000);
      setElapsedSeconds(diff > 0 ? diff : 0);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    return () => clearInterval(interval);
  }, [token?.started_at]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isCounterOpen = counterStatus === 'OPEN';

  return (
    <div className="qc-card" style={{
      background: token
        ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)'
        : 'var(--bg-card)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div className="qc-card-header">
        <div className="qc-card-title">
          <Sparkles size={20} style={{ color: 'var(--accent-secondary)' }} />
          <span>CURRENTLY SERVING</span>
        </div>
        {token && (
          <span className="badge badge-open" style={{ fontSize: '0.7rem' }}>
            SERVING AT COUNTER
          </span>
        )}
      </div>

      {token ? (
        <div>
          {/* Main Token Banner */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            padding: '1.25rem',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Token Number
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '2.5rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}>
                {token.token_number}
              </div>
              {token.priority !== 'NORMAL' && (
                <span className="badge badge-priority" style={{ marginTop: '0.5rem' }}>
                  ★ {token.priority} PRIORITY
                </span>
              )}
            </div>

            {/* Serving Duration Timer */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Serving Duration
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--status-open)',
                marginTop: '0.25rem',
              }}>
                <Clock size={20} />
                <span>{formatTimer(elapsedSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Student & Service Info Details */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-dark)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <User size={14} />
                <span>Student Customer</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {token.student_name}
              </div>
              {token.student_email && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {token.student_email}
                </div>
              )}
            </div>

            {token.notes && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <FileText size={14} />
                  <span>Request Notes</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                  "{token.notes}"
                </div>
              </div>
            )}
          </div>

          {/* Skip Confirmation Dialog Box */}
          {showSkipConfirm && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5', fontWeight: 700, marginBottom: '0.5rem' }}>
                <AlertCircle size={18} />
                <span>Confirm Skip Token?</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Are you sure you want to skip <strong>{token.token_number}</strong>? The token will be recorded as SKIPPED and preserved in history.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    setShowSkipConfirm(false);
                    onSkip(token.id);
                  }}
                  disabled={isLoading}
                  className="btn btn-danger"
                >
                  Confirm Skip
                </button>
                <button
                  onClick={() => setShowSkipConfirm(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Serving Actions Toolbar */}
          {!showSkipConfirm && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.75rem',
            }}>
              {/* Complete Action */}
              <button
                onClick={() => onComplete(token.id)}
                disabled={isLoading || !isCounterOpen}
                className="btn btn-success btn-lg"
                title="Mark serving token completed"
              >
                <CheckCircle2 size={18} />
                <span>COMPLETE</span>
              </button>

              {/* Hold Action */}
              <button
                onClick={() => onHold(token.id)}
                disabled={isLoading || !isCounterOpen}
                className="btn btn-warning btn-lg"
                title="Place serving token on hold"
              >
                <PauseCircle size={18} />
                <span>HOLD</span>
              </button>

              {/* Skip Action */}
              <button
                onClick={() => setShowSkipConfirm(true)}
                disabled={isLoading || !isCounterOpen}
                className="btn btn-danger btn-lg"
                title="Skip token"
              >
                <SkipForward size={18} />
                <span>SKIP</span>
              </button>

              {/* View Details Action */}
              <button
                onClick={() => onViewDetails(token.id)}
                className="btn btn-secondary"
                title="View full token details & timeline"
                style={{ padding: '0.875rem' }}
              >
                Details
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Empty Serving State */
        <div style={{
          textAlign: 'center',
          padding: '3rem 1.5rem',
          backgroundColor: 'var(--bg-dark)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-color)',
        }}>
          <Clock size={40} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            No Active Serving Token
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
            {isCounterOpen
              ? 'Click "CALL NEXT" in the waiting queue section to call the next student token.'
              : 'Counter is currently closed or under maintenance. Open the counter to process tokens.'}
          </p>
        </div>
      )}
    </div>
  );
};
