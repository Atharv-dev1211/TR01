import React from 'react';
import { Token } from '../types';
import { Users, PhoneCall, Play, Clock, Info, ShieldAlert, ArrowRight } from 'lucide-react';

interface WaitingQueueListProps {
  queue: Token[];
  currentServingToken: Token | null;
  counterStatus: string;
  onCallNext: () => void;
  onResume: (tokenId: string) => void;
  onViewDetails: (tokenId: string) => void;
  isLoading: boolean;
}

export const WaitingQueueList: React.FC<WaitingQueueListProps> = ({
  queue,
  currentServingToken,
  counterStatus,
  onCallNext,
  onResume,
  onViewDetails,
  isLoading,
}) => {
  const isCounterOpen = counterStatus === 'OPEN';
  const hasActiveServing = !!currentServingToken;

  const calculateWaitMins = (createdAt: string) => {
    const start = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const diffMins = Math.floor((now - start) / (1000 * 60));
    return diffMins > 0 ? `${diffMins} mins` : 'Just now';
  };

  return (
    <div className="qc-card">
      {/* Header & Call Next CTA */}
      <div className="qc-card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="qc-card-title">
          <Users size={20} style={{ color: 'var(--accent-primary)' }} />
          <span>WAITING QUEUE ({queue.length})</span>
        </div>

        {/* CALL NEXT CTA */}
        <button
          onClick={onCallNext}
          disabled={isLoading || !isCounterOpen || queue.length === 0 || hasActiveServing}
          className="btn btn-primary btn-lg"
          title={
            !isCounterOpen
              ? 'Counter must be OPEN to call next'
              : hasActiveServing
              ? 'Complete or hold current serving token before calling next'
              : queue.length === 0
              ? 'Waiting queue is empty'
              : 'Call next eligible token'
          }
        >
          <PhoneCall size={18} />
          <span>CALL NEXT</span>
        </button>
      </div>

      {/* Warning banner if current serving active */}
      {hasActiveServing && isCounterOpen && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#fbbf24',
          padding: '0.625rem 1rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}>
          <ShieldAlert size={16} />
          <span>Finish or HOLD token <strong>{currentServingToken.token_number}</strong> before calling next.</span>
        </div>
      )}

      {/* Queue Token List */}
      {queue.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {queue.map((tkn, idx) => {
            const isPriority = tkn.priority !== 'NORMAL';
            return (
              <div
                key={tkn.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.875rem 1.125rem',
                  backgroundColor: isPriority ? 'rgba(244, 63, 94, 0.08)' : 'var(--bg-dark)',
                  border: isPriority ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Position + Token Number + Student Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: isPriority ? 'var(--priority-high)' : '#334155',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}>
                    {idx + 1}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.125rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                      }}>
                        {tkn.token_number}
                      </span>
                      {isPriority && (
                        <span className="badge badge-priority">
                          ★ {tkn.priority} PRIORITY
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      {tkn.student_name}
                    </div>
                  </div>
                </div>

                {/* Waiting Duration & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}>
                      <Clock size={12} />
                      <span>Wait Time</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {calculateWaitMins(tkn.created_at)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button
                      onClick={() => onViewDetails(tkn.id)}
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                      title="View Details"
                    >
                      <Info size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty Queue State */
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1rem',
          backgroundColor: 'var(--bg-dark)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-color)',
        }}>
          <Users size={36} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            No Students Waiting in Queue
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            New student tokens will automatically appear here in real time.
          </p>
        </div>
      )}
    </div>
  );
};
