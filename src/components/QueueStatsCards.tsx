import React from 'react';
import { OperationalStats, Token } from '../types';
import { Users, Clock, CheckCircle, PauseCircle, Activity, Play } from 'lucide-react';

interface QueueStatsCardsProps {
  stats: OperationalStats;
  heldTokens?: Token[];
  onResumeToken?: (tokenId: string) => void;
  hasActiveServing?: boolean;
  isCounterOpen?: boolean;
  isLoading?: boolean;
}

export const QueueStatsCards: React.FC<QueueStatsCardsProps> = ({
  stats,
  heldTokens = [],
  onResumeToken,
  hasActiveServing = false,
  isCounterOpen = true,
  isLoading = false,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Grid of Stat Widgets */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1rem',
      }}>
        {/* Waiting Count Card */}
        <div className="qc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Waiting Queue</span>
            <Users size={16} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {stats.waiting_count}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>tokens in line</div>
        </div>

        {/* Currently Serving Card */}
        <div className="qc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Now Serving</span>
            <Activity size={16} style={{ color: 'var(--status-open)' }} />
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.75rem',
            fontWeight: 800,
            color: stats.currently_serving_number ? 'var(--status-open)' : 'var(--text-muted)',
            marginTop: '0.25rem',
          }}>
            {stats.currently_serving_number || 'None'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>active on counter</div>
        </div>

        {/* Held Tokens Card */}
        <div className="qc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>On Hold</span>
            <PauseCircle size={16} style={{ color: 'var(--status-busy)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--status-busy)', marginTop: '0.25rem' }}>
            {stats.held_count}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>paused tokens</div>
        </div>

        {/* Served Today Card */}
        <div className="qc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Served Today</span>
            <CheckCircle size={16} style={{ color: 'var(--accent-secondary)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {stats.completed_today_count}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>completed tokens</div>
        </div>

        {/* Avg Service Time Card */}
        <div className="qc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Avg Service Time</span>
            <Clock size={16} style={{ color: '#a78bfa' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {stats.avg_service_time_minutes}m
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>per customer token</div>
        </div>
      </div>

      {/* Held Tokens Management Section */}
      {heldTokens.length > 0 && (
        <div className="qc-card" style={{ border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div className="qc-card-header">
            <div className="qc-card-title" style={{ color: 'var(--status-busy)' }}>
              <PauseCircle size={18} />
              <span>HELD TOKENS ({heldTokens.length})</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {heldTokens.map((tkn) => (
              <div
                key={tkn.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-dark)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: 'var(--status-busy)' }}>
                      {tkn.token_number}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tkn.student_name}
                    </span>
                  </div>
                  {tkn.notes && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      Reason: {tkn.notes}
                    </div>
                  )}
                </div>

                {onResumeToken && (
                  <button
                    onClick={() => onResumeToken(tkn.id)}
                    disabled={isLoading || !isCounterOpen || hasActiveServing}
                    className="btn btn-warning"
                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                    title={hasActiveServing ? 'Complete current token first' : 'Resume token to SERVING'}
                  >
                    <Play size={14} />
                    <span>RESUME</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
