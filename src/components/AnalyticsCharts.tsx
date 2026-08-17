import React from 'react';

interface ChartDataItem {
    id: string;
    label: string;
    code?: string;
    value: number;
}

interface AnalyticsChartsProps {
    summary: {
        total_created: number;
        completed_count: number;
        skipped_count: number;
        cancelled_count: number;
        held_count: number;
        waiting_count: number;
    };
    serviceDistribution: ChartDataItem[];
    counterActivity: ChartDataItem[];
    hourlyDistribution: Array<{ hour: string; count: number }>;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
    summary,
    serviceDistribution = [],
    counterActivity = [],
    hourlyDistribution = []
}) => {
    // 1. Ratio Calculations
    const nonServed = summary.skipped_count + summary.cancelled_count;
    const totalProcessed = summary.completed_count + nonServed;
    const completedPercent = totalProcessed > 0 ? Math.round((summary.completed_count / totalProcessed) * 100) : 0;
    const skippedPercent = totalProcessed > 0 ? Math.round((summary.skipped_count / totalProcessed) * 100) : 0;
    const cancelledPercent = totalProcessed > 0 ? Math.round((summary.cancelled_count / totalProcessed) * 100) : 0;

    // 2. Service maximum for scaling vertical bars
    const maxServiceVal = serviceDistribution.length > 0
        ? Math.max(...serviceDistribution.map(s => s.value), 1)
        : 1;

    // 3. Counter maximum for scaling horizontal bars
    const maxCounterVal = counterActivity.length > 0
        ? Math.max(...counterActivity.map(c => c.value), 1)
        : 1;

    // 4. Hourly maximum
    const maxHourCount = hourlyDistribution.length > 0
        ? Math.max(...hourlyDistribution.map(h => h.count), 1)
        : 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Top Row: Ratios & Service Distribution */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.5rem'
            }}>
                {/* Token Outcomes Ratio Card */}
                <div className="qc-card" style={{ padding: '1.25rem' }}>
                    <div className="qc-card-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                            Token Processing Efficiency Ratio
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
                        {/* Horizontal Stacked Bar */}
                        <div style={{
                            height: '24px',
                            backgroundColor: '#1e293b',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            overflow: 'hidden',
                            width: '100%'
                        }}>
                            {completedPercent > 0 && (
                                <div
                                    style={{ width: `${completedPercent}%`, backgroundColor: 'var(--status-open)', transition: 'width 0.5s ease' }}
                                    title={`Completed: ${summary.completed_count} (${completedPercent}%)`}
                                />
                            )}
                            {skippedPercent > 0 && (
                                <div
                                    style={{ width: `${skippedPercent}%`, backgroundColor: 'var(--status-busy)', transition: 'width 0.5s ease' }}
                                    title={`Skipped: ${summary.skipped_count} (${skippedPercent}%)`}
                                />
                            )}
                            {cancelledPercent > 0 && (
                                <div
                                    style={{ width: `${cancelledPercent}%`, backgroundColor: 'var(--status-closed)', transition: 'width 0.5s ease' }}
                                    title={`Cancelled: ${summary.cancelled_count} (${cancelledPercent}%)`}
                                />
                            )}
                            {totalProcessed === 0 && (
                                <div style={{ width: '100%', backgroundColor: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#ffffff' }}>
                                    No tokens processed yet
                                </div>
                            )}
                        </div>

                        {/* Labels and legends */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'var(--status-open)' }} />
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>COMPLETED</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.completed_count} ({completedPercent}%)</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'var(--status-busy)' }} />
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SKIPPED</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.skipped_count} ({skippedPercent}%)</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: 'var(--status-closed)' }} />
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CANCELLED</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.cancelled_count} ({cancelledPercent}%)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Services Load Chart */}
                <div className="qc-card" style={{ padding: '1.25rem' }}>
                    <div className="qc-card-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                            Service Queue Volumes
                        </span>
                    </div>

                    {serviceDistribution.length > 0 ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-around',
                            height: '140px',
                            paddingTop: '1rem'
                        }}>
                            {serviceDistribution.map((item) => {
                                const heightPercent = Math.max(Math.round((item.value / maxServiceVal) * 100), 5);
                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            width: '60px',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {item.value}
                                        </div>
                                        {/* Bar */}
                                        <div
                                            style={{
                                                height: `${heightPercent}px`,
                                                width: '28px',
                                                background: 'linear-gradient(to top, var(--accent-primary), #818cf8)',
                                                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                                                transition: 'height 0.4s ease'
                                            }}
                                        />
                                        <div
                                            style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}
                                            title={item.label}
                                        >
                                            {item.code || item.label.slice(0, 3).toUpperCase()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0', fontSize: '0.85rem' }}>
                            No service records found.
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Row: Counter Activity & Hourly Distributions */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.5rem'
            }}>
                {/* Counter Activity Load */}
                <div className="qc-card" style={{ padding: '1.25rem' }}>
                    <div className="qc-card-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                            Counter Workloads (Completed Tokens)
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {counterActivity.length > 0 ? (
                            counterActivity.map((cntr) => {
                                const widthPercent = Math.max(Math.round((cntr.value / maxCounterVal) * 100), 2);
                                return (
                                    <div key={cntr.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{cntr.label}</span>
                                            <span style={{ color: 'var(--accent-secondary)', fontWeight: 800 }}>{cntr.value} served</span>
                                        </div>
                                        <div style={{ height: '8px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${widthPercent}%`,
                                                    backgroundColor: 'var(--accent-secondary)',
                                                    borderRadius: '4px',
                                                    transition: 'width 0.4s ease'
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0', fontSize: '0.85rem' }}>
                                No active counters have completed tokens today.
                            </div>
                        )}
                    </div>
                </div>

                {/* Enqueue traffic distribution by hour */}
                <div className="qc-card" style={{ padding: '1.25rem' }}>
                    <div className="qc-card-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                            Hourly Traffic Volume (Tokens Created)
                        </span>
                    </div>

                    {hourlyDistribution.length > 0 ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            height: '140px',
                            paddingTop: '1rem'
                        }}>
                            {hourlyDistribution.map((h, idx) => {
                                const heightPercent = Math.max(Math.round((h.count / maxHourCount) * 100), 5);
                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            flex: 1,
                                            gap: '0.25rem'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }} title={`${h.count} tokens`}>
                                            {h.count}
                                        </span>
                                        <div
                                            style={{
                                                height: `${heightPercent}px`,
                                                width: '80%',
                                                maxWidth: '12px',
                                                backgroundColor: '#a78bfa',
                                                borderRadius: '2px 2px 0 0',
                                                transition: 'height 0.4s ease'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', transform: 'rotate(-45deg)', marginTop: '0.25rem', display: 'inline-block' }}>
                                            {h.hour}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2.5rem 0', fontSize: '0.85rem' }}>
                            No hourly timeline distribution data available.
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};
