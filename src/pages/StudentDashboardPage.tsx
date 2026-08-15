import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { QueueStatus } from '../components/QueueStatus';
import { CounterStatus as CounterStatusComponent } from '../components/CounterStatus';
import { Service, Counter, CounterStatus } from '../types';
import { Header } from '../components/Header';
import { SOCKET_EVENTS } from '../constants/events';
import {
  Search,
  Layers,
  Monitor,
  HelpCircle,
  RefreshCw,
  AlertCircle,
  BookOpen,
  Clock,
  CheckCircle,
  Sparkles,
  Calendar,
  ArrowRight,
  XCircle
} from 'lucide-react';

export const StudentDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const {
    socket,
    activeToken,
    activeTokenLoading,
    bookToken,
    cancelToken
  } = useSocket();

  const [services, setServices] = useState<Service[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storedToken = localStorage.getItem('qc_token');
      if (!storedToken) {
        throw new Error('No authentication token found.');
      }

      const headers = { Authorization: `Bearer ${storedToken}` };

      // Fetch Services
      const servicesRes = await fetch('/api/student/services', { headers });
      if (!servicesRes.ok) {
        const errData = await servicesRes.json();
        throw new Error(errData.error || 'Failed to fetch services.');
      }
      const servicesData = await servicesRes.json();

      // Fetch Counters
      const countersRes = await fetch('/api/student/counters', { headers });
      if (!countersRes.ok) {
        const errData = await countersRes.json();
        throw new Error(errData.error || 'Failed to fetch counters.');
      }
      const countersData = await countersRes.json();

      setServices(servicesData);
      setCounters(countersData);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle live lists refresh when queue updates dynamically
  useEffect(() => {
    if (!socket) return;

    const handleQueueUpdate = () => {
      fetchData();
    };

    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdate);
    return () => {
      socket.off(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdate);
    };
  }, [socket, fetchData]);

  // Client-side Search and Filter logic
  const getStatusBadge = (status: CounterStatus) => {
    switch (status) {
      case 'OPEN':
        return <span className="badge badge-open">OPEN</span>;
      case 'CLOSED':
        return <span className="badge badge-closed">CLOSED</span>;
      case 'BUSY':
        return <span className="badge badge-busy">BUSY</span>;
      case 'MAINTENANCE':
        return <span className="badge badge-maint">MAINTENANCE</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getStatusColor = (status: CounterStatus) => {
    switch (status) {
      case 'OPEN': return 'var(--status-open)';
      case 'CLOSED': return 'var(--status-closed)';
      case 'BUSY': return 'var(--status-busy)';
      case 'MAINTENANCE': return 'var(--status-maint)';
      default: return 'var(--text-secondary)';
    }
  };

  // Filter services and counters
  const matchedServices = services.filter(service => {
    const sQuery = searchQuery.toLowerCase().trim();

    // Check if service attributes match query
    const matchesService =
      service.name.toLowerCase().includes(sQuery) ||
      service.code.toLowerCase().includes(sQuery) ||
      (service.description || '').toLowerCase().includes(sQuery);

    // Get counters associated with this service
    const serviceCounters = counters.filter(c => c.service_id === service.id);

    // Check if any associated counter name matches query
    const matchesCounterName = serviceCounters.some(c =>
      c.name.toLowerCase().includes(sQuery)
    );

    // Apply status filter
    // If selectedStatus is not 'ALL', only display the service if it has counters matching that status
    const hasMatchingStatusCounter = selectedStatus === 'ALL' ||
      serviceCounters.some(c => c.status === selectedStatus);

    return (matchesService || matchesCounterName) && hasMatchingStatusCounter;
  });

  return (
    <div className="app-container">
      {/* Top Shared Header */}
      <Header />

      <main className="main-content">
        {/* Welcome Section */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem 2rem',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-secondary)', marginBottom: '0.5rem' }}>
              <Sparkles size={18} />
              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Student Experience Portal
              </span>
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Welcome back, {user?.name || 'Student'}!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Discover active services, check counter availability, and track queue updates.
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '0.625rem 1rem' }}
            title="Refresh dashboard data"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh Discovery</span>
          </button>
        </div>

        <QueueStatus />

        <CounterStatusComponent />

        {/* Search and Filters Strip */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)'
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1', minWidth: '280px' }}>
            <Search size={18} style={{
              position: 'absolute',
              left: '0.875rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services by name, code or counter..."
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem 0.625rem 2.5rem',
                backgroundColor: 'var(--bg-dark)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
            />
          </div>

          {/* Status Filters */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Counter Status:
            </span>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {['ALL', 'OPEN', 'CLOSED', 'BUSY', 'MAINTENANCE'].map((status) => {
                const isSelected = selectedStatus === status;
                let activeClass = 'btn-primary';
                if (status === 'OPEN') activeClass = 'badge-open';
                else if (status === 'CLOSED') activeClass = 'badge-closed';
                else if (status === 'BUSY') activeClass = 'badge-busy';
                else if (status === 'MAINTENANCE') activeClass = 'badge-maint';

                return (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className="btn"
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: isSelected ? undefined : 'var(--bg-dark)',
                      border: isSelected ? '1px solid transparent' : '1px solid var(--border-color)',
                      color: isSelected ? '#fff' : 'var(--text-secondary)',
                      opacity: isSelected ? 1 : 0.7
                    }}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && services.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-secondary)' }}>
            <RefreshCw size={36} className="spin" style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }} />
            <p>Fetching active services & counters state...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <AlertCircle size={24} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Failed to Load Discovery Data</strong>
              <span style={{ fontSize: '0.85rem' }}>{error}</span>
            </div>
          </div>
        )}

        {/* Discovery Layout */}
        {!loading && !error && (
          <div>
            {matchedServices.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '1.5rem',
              }}>
                {matchedServices.map((service) => {
                  const serviceCounters = counters.filter(c => c.service_id === service.id);
                  const openCountersCount = serviceCounters.filter(c => c.status === 'OPEN').length;

                  // Filter counters of this service by search & status
                  const displayCounters = serviceCounters.filter(c => {
                    const matchesStatus = selectedStatus === 'ALL' || c.status === selectedStatus;
                    const matchesSearch = searchQuery === '' ||
                      c.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                      service.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                      service.code.toLowerCase().includes(searchQuery.toLowerCase().trim());
                    return matchesStatus && matchesSearch;
                  });

                  return (
                    <div key={service.id} className="qc-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {/* Service Header Row */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: '1rem'
                      }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <div style={{
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%)',
                            color: 'var(--accent-primary)',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            fontSize: '1.25rem',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                            minWidth: '50px',
                            textAlign: 'center'
                          }}>
                            {service.code}
                          </div>
                          <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {service.name}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem', maxWidth: '800px' }}>
                              {service.description || 'No description available for this service department.'}
                            </p>
                          </div>
                        </div>

                        {/* Counters Count Stats */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          backgroundColor: 'var(--bg-dark)',
                          padding: '0.5rem 0.875rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          fontSize: '0.8rem',
                          fontWeight: 600
                        }}>
                          <Monitor size={14} style={{ color: 'var(--accent-secondary)' }} />
                          <span style={{ color: 'var(--text-secondary)' }}>Counters Assigned:</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                            {openCountersCount} / {serviceCounters.length} Open
                          </span>
                        </div>
                      </div>

                      {/* Associated Counters Listing */}
                      <div>
                        <h4 style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.75rem'
                        }}>
                          Associated Counter Desks ({displayCounters.length})
                        </h4>

                        {displayCounters.length > 0 ? (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '0.75rem'
                          }}>
                            {displayCounters.map((counter) => (
                              <div
                                key={counter.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.75rem 1rem',
                                  backgroundColor: 'var(--bg-dark)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 'var(--radius-md)',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: 'var(--radius-full)',
                                    backgroundColor: getStatusColor(counter.status)
                                  }} />
                                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {counter.name}
                                  </span>
                                </div>
                                {getStatusBadge(counter.status)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{
                            padding: '1rem',
                            textAlign: 'center',
                            backgroundColor: 'var(--bg-dark)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px dashed var(--border-color)',
                            color: 'var(--text-muted)',
                            fontSize: '0.8rem'
                          }}>
                            No counters match the active filter for this service.
                          </div>
                        )}
                      </div>

                      {/* Booking CTA */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '0.5rem',
                        paddingTop: '0.875rem',
                        borderTop: '1px dashed var(--border-color)',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          <Clock size={12} />
                          <span>Average wait times vary by priority.</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {activeToken && (
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 750,
                              color: 'var(--status-busy)',
                              backgroundColor: 'var(--status-busy-bg)',
                              padding: '0.375rem 0.75rem',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                            }}>
                              Ticket Active
                            </span>
                          )}
                          <button
                            onClick={() => bookToken(service.id)}
                            disabled={activeTokenLoading || activeToken !== null}
                            className="btn btn-primary"
                            style={{ padding: '0.5rem 1rem' }}
                          >
                            <span>
                              {activeToken !== null
                                ? 'Already Queued'
                                : activeTokenLoading
                                  ? 'Booking...'
                                  : 'Book Token'}
                            </span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Empty Discovery State */
              <div style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px dashed var(--border-color)',
                color: 'var(--text-secondary)',
                maxWidth: '600px',
                margin: '2rem auto'
              }}>
                <Layers size={48} style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  No Services or Counters Found
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  We couldn't find any services or counters matching your search keyword <strong>"{searchQuery}"</strong> and selected status filter.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedStatus('ALL');
                  }}
                  className="btn btn-secondary"
                  style={{ marginTop: '1.5rem' }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
