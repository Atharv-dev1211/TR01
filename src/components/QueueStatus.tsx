import React from 'react';
import { useSocket } from '../context/SocketContext';
import { Clock, Layers, Sparkles, XCircle, CheckCircle2, AlertTriangle, Monitor } from 'lucide-react';

export const QueueStatus: React.FC = () => {
    const {
        activeToken,
        activeTokenLoading,
        waitTime,
        cancelToken,
        dismissActiveToken,
        isConnected
    } = useSocket();

    if (activeTokenLoading && !activeToken) {
        return (
            <div className="qc-card" style={{
                padding: '3rem 1.5rem',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
            }}>
                <div className="spin" style={{
                    width: '24px',
                    height: '24px',
                    border: '2px solid var(--accent-secondary)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%'
                }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading Ticket Status...</p>
            </div>
        );
    }

    if (!activeToken) {
        return null;
    }

    const getStatusBadge = () => {
        switch (activeToken.status) {
            case 'SERVING':
                return (
                    <span className="badge badge-open" style={{
                        animation: 'pulse-border 2s infinite',
                        backgroundColor: 'var(--status-open-bg)',
                        color: 'var(--status-open)',
                    }}>
                        YOUR TURN
                    </span>
                );
            case 'HELD':
                return (
                    <span className="badge badge-busy" style={{
                        backgroundColor: 'var(--status-busy-bg)',
                        color: 'var(--status-busy)',
                    }}>
                        ON HOLD
                    </span>
                );
            case 'COMPLETED':
                return (
                    <span className="badge badge-open" style={{
                        backgroundColor: 'var(--status-open-bg)',
                        color: 'var(--status-open)',
                    }}>
                        COMPLETED
                    </span>
                );
            case 'CANCELLED':
                return (
                    <span className="badge badge-closed" style={{
                        backgroundColor: 'var(--status-closed-bg)',
                        color: 'var(--status-closed)',
                    }}>
                        CANCELLED
                    </span>
                );
            case 'SKIPPED':
                return (
                    <span className="badge badge-closed" style={{
                        backgroundColor: 'var(--status-closed-bg)',
                        color: 'var(--status-closed)',
                    }}>
                        SKIPPED
                    </span>
                );
            default:
                return (
                    <span className="badge badge-maint" style={{
                        backgroundColor: 'var(--status-maint-bg)',
                        color: 'var(--status-maint)',
                    }}>
                        WAITING IN LINE
                    </span>
                );
        }
    };

    const getLiveIndicator = () => {
        if (isConnected) {
            return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 8px #10b981',
                        display: 'inline-block'
                    }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--status-open)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Live Updates Active
                    </span>
                </div>
            );
        } else {
            return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#f59e0b',
                        boxShadow: '0 0 8px #f59e0b',
                        display: 'inline-block'
                    }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--status-busy)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Sync Paused (Offline)
                    </span>
                </div>
            );
        }
    };

    const isCompletedOrCancelled = activeToken.status === 'COMPLETED' || activeToken.status === 'CANCELLED' || activeToken.status === 'SKIPPED';
    const isServing = activeToken.status === 'SERVING';

    return (
        <div className="qc-card" style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
            border: isServing
                ? '1px solid var(--status-open)'
                : '1px solid rgba(99, 102, 241, 0.4)',
            boxShadow: isServing
                ? '0 0 25px rgba(16, 185, 129, 0.15)'
                : 'var(--shadow-md)',
            marginBottom: '2rem',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Background glow orb */}
            <div style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: isServing
                    ? 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(0,0,0,0) 70%)'
                    : 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(20px)',
                pointerEvents: 'none'
            }} />

            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '0.875rem',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '0.5rem'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                    <h3 style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '1rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase'
                    }}>
                        <Sparkles size={16} style={{ color: isServing ? 'var(--status-open)' : 'var(--accent-secondary)' }} />
                        <span>Active Queue Ticket</span>
                    </h3>
                    {getLiveIndicator()}
                </div>
                {getStatusBadge()}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem',
                alignItems: 'center'
            }}>
                {/* Token and Service Info */}
                <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                        Service Department
                    </span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {activeToken.service_name}
                    </span>

                    {activeToken.counter_name && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                                Assigned Counter Desk
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>
                                {activeToken.counter_name}
                            </span>
                        </div>
                    )}

                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '1rem', textTransform: 'uppercase' }}>
                        Ticket Number / Priority
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginTop: '0.25rem' }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '2rem',
                            fontWeight: 900,
                            color: isServing ? 'var(--status-open)' : 'var(--accent-secondary)',
                            letterSpacing: '-0.02em'
                        }}>
                            {activeToken.token_number}
                        </span>
                        <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '0.125rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: activeToken.priority === 'HIGH' ? 'var(--status-closed-bg)' : 'rgba(255, 255, 255, 0.05)',
                            color: activeToken.priority === 'HIGH' ? 'var(--status-closed)' : 'var(--text-secondary)',
                            border: activeToken.priority === 'HIGH' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.05)'
                        }}>
                            {activeToken.priority} PRIORITY
                        </span>
                    </div>
                </div>

                {/* Dynamic Position Dashboard */}
                {!isCompletedOrCancelled ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1rem',
                        padding: '1rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(255, 255, 255, 0.03)'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', textTransform: 'uppercase', fontWeight: 700 }}>
                                <Layers size={12} />
                                <span>Queue Position</span>
                            </span>
                            <span style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                                {isServing ? '0' : activeToken.queue_position ?? 0}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                {isServing
                                    ? 'At Counter'
                                    : (activeToken.queue_position ?? 0) === 1
                                        ? 'You are next in line!'
                                        : `${(activeToken.queue_position ?? 1) - 1} ahead of you`}
                            </span>
                        </div>

                        <div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', textTransform: 'uppercase', fontWeight: 700 }}>
                                <Clock size={12} />
                                <span>Estimated Wait</span>
                            </span>
                            <span style={{ display: 'block', fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--status-busy)' }}>
                                {isServing ? '0' : waitTime !== null ? `${Math.round(waitTime)}` : '--'} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>mins</span>
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                {isServing ? 'Desk Ready' : 'Estimated time'}
                            </span>
                        </div>
                    </div>
                ) : (
                    /* Finished State Banner */
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem',
                        backgroundColor: activeToken.status === 'COMPLETED' ? 'var(--status-open-bg)' : 'var(--status-closed-bg)',
                        color: activeToken.status === 'COMPLETED' ? 'var(--status-open)' : 'var(--status-closed)',
                        borderRadius: 'var(--radius-md)',
                        border: activeToken.status === 'COMPLETED' ? '1px dashed var(--status-open)' : '1px dashed var(--status-closed)'
                    }}>
                        {activeToken.status === 'COMPLETED' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                                {activeToken.status === 'COMPLETED' ? 'Service Completed Successfully!' : 'Token Cancelled'}
                            </div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                {activeToken.status === 'COMPLETED' ? 'Thank you. You can now dismiss this ticket.' : 'This ticket has been cancelled and is inactive.'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Widgets */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
                    {isServing && activeToken.counter_name && (
                        <div style={{
                            backgroundColor: 'var(--status-open-bg)',
                            border: '1px dashed var(--status-open)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.75rem',
                            textAlign: 'center',
                            color: 'var(--status-open)',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.375rem'
                        }}>
                            <Monitor size={14} />
                            <span>Proceed to {activeToken.counter_name}!</span>
                        </div>
                    )}

                    {!isCompletedOrCancelled ? (
                        <button
                            onClick={() => cancelToken(activeToken.id)}
                            disabled={activeTokenLoading}
                            className="btn btn-danger"
                            style={{ padding: '0.625rem', width: '100%' }}
                        >
                            <XCircle size={14} />
                            <span>Cancel Ticket</span>
                        </button>
                    ) : (
                        <button
                            onClick={dismissActiveToken}
                            className="btn btn-secondary"
                            style={{ padding: '0.625rem', width: '100%' }}
                        >
                            <span>Dismiss Ticket</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
