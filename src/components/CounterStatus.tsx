import React from 'react';
import { useSocket } from '../context/SocketContext';
import { Monitor, Clock, AlertCircle } from 'lucide-react';

export const CounterStatus: React.FC = () => {
    const { counters, countersLoading, activeToken, isConnected } = useSocket();

    const getStatusIndicator = (status: string, currentToken: string | null | undefined) => {
        if (status === 'CLOSED') {
            return {
                color: 'var(--status-closed)',
                bgColor: 'var(--status-closed-bg)',
                dotColor: '#ef4444',
                label: 'Closed'
            };
        }
        if (status === 'MAINTENANCE') {
            return {
                color: 'var(--status-maint)',
                bgColor: 'var(--status-maint-bg)',
                dotColor: '#f59e0b',
                label: 'Maintenance'
            };
        }
        if (currentToken) {
            return {
                color: '#6366f1', // Indigo
                bgColor: 'rgba(99, 102, 241, 0.1)',
                dotColor: '#6366f1',
                label: `Serving ${currentToken}`
            };
        }
        if (status === 'BUSY') {
            return {
                color: 'var(--status-busy)',
                bgColor: 'var(--status-busy-bg)',
                dotColor: '#f59e0b',
                label: 'Busy'
            };
        }
        return {
            color: 'var(--status-open)',
            bgColor: 'var(--status-open-bg)',
            dotColor: '#10b981',
            label: 'Available'
        };
    };

    if (countersLoading && counters.length === 0) {
        return (
            <div className="qc-card" style={{ padding: '2rem', textAlign: 'center' }}>
                <div className="spin" style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid var(--accent-secondary)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    margin: '0 auto 0.75rem'
                }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading counters...</p>
            </div>
        );
    }

    if (counters.length === 0) {
        return (
            <div className="qc-card" style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--border-color)' }}>
                <AlertCircle size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>No Counters Available</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>There are no service counters registered in the system.</p>
            </div>
        );
    }

    return (
        <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
            }}>
                <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <Monitor size={16} style={{ color: 'var(--accent-secondary)' }} />
                    <span>Counter Status Dashboard</span>
                </h3>

                {isConnected ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--status-open)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Sync</span>
                    </div>
                ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--status-busy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Offline</span>
                    </div>
                )}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1rem',
            }}>
                {counters.map((c) => {
                    const isMyCounter = activeToken && activeToken.status === 'SERVING' && activeToken.counter_id === c.id;
                    const visual = getStatusIndicator(c.status, c.current_token_number);

                    return (
                        <div
                            key={c.id}
                            className="qc-card"
                            style={{
                                border: isMyCounter
                                    ? '1.5px solid var(--status-open)'
                                    : '1px solid var(--border-color)',
                                boxShadow: isMyCounter
                                    ? '0 0 15px rgba(16, 185, 129, 0.12)'
                                    : 'none',
                                animation: isMyCounter ? 'pulse-border 2s infinite' : 'none',
                                background: isMyCounter
                                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, var(--bg-card) 100%)'
                                    : 'var(--bg-card)',
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '0.75rem',
                                transition: 'all 0.2s ease-in-out',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {isMyCounter && (
                                <div style={{
                                    position: 'absolute',
                                    top: '0',
                                    right: '0',
                                    backgroundColor: 'var(--status-open)',
                                    color: '#ffffff',
                                    fontSize: '0.6rem',
                                    fontWeight: 900,
                                    padding: '0.125rem 0.5rem',
                                    borderBottomLeftRadius: 'var(--radius-sm)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    Your Counter
                                </div>
                            )}

                            <div>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.02em',
                                    display: 'block'
                                }}>
                                    {c.service_name || 'Service'} ({c.service_code || 'SRV'})
                                </span>
                                <h4 style={{
                                    fontSize: '1rem',
                                    fontWeight: 800,
                                    color: 'var(--text-primary)',
                                    marginTop: '0.125rem',
                                    marginBottom: '0.5rem'
                                }}>
                                    {c.name}
                                </h4>

                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.375rem',
                                    padding: '0.25rem 0.625rem',
                                    borderRadius: 'var(--radius-sm)',
                                    backgroundColor: visual.bgColor,
                                    color: visual.color,
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.02em'
                                }}>
                                    <span style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        backgroundColor: visual.dotColor,
                                        display: 'inline-block'
                                    }} />
                                    <span>{visual.label}</span>
                                </div>
                            </div>

                            {/* Operational Stats: Wait Time */}
                            {c.status !== 'CLOSED' && c.status !== 'MAINTENANCE' && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingTop: '0.75rem',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.75rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                                        <span>Est. Wait Line</span>
                                    </div>
                                    <span style={{
                                        fontWeight: 800,
                                        color: c.estimated_wait_time && c.estimated_wait_time > 0 ? 'var(--status-busy)' : 'var(--text-muted)'
                                    }}>
                                        {c.estimated_wait_time && c.estimated_wait_time > 0
                                            ? `${Math.round(c.estimated_wait_time)} mins`
                                            : '-- mins'
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
