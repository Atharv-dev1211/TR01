import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudentHeader } from '../components/student/StudentHeader';
import { EmptyState } from '../components/common/EmptyState';
import { Search, MapPin, Users, Clock, AlertCircle } from 'lucide-react';
import { Service, Counter } from '../types';

interface ServiceWithCounters extends Service {
  counters: (Counter & { queue_size: number; estimated_wait_time: number })[];
}

export const StudentDashboardPage: React.FC = () => {
  const [services, setServices] = useState<ServiceWithCounters[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const token = localStorage.getItem('qc_token');
      const res = await fetch('/api/student/services', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch services');
      const data = await res.json();
      setServices(data.services);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredServices = services.map(service => ({
    ...service,
    counters: service.counters.filter(counter => 
      counter.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      service.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(service => service.counters.length > 0 || service.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleBook = (serviceId: string, counterId: string) => {
    navigate(`/student/book/${serviceId}/${counterId}`);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
      <StudentHeader />
      
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Available Services
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Select a service counter to join the queue
          </p>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '2rem', position: 'relative', maxWidth: '500px' }}>
          <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search services or counters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 3rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading services...</div>
        ) : error ? (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: 'var(--radius-md)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={20} />
            {error}
          </div>
        ) : filteredServices.length === 0 ? (
          <EmptyState 
            icon={MapPin} 
            title="No Services Found" 
            description={searchQuery ? "No services match your search." : "There are currently no active services available."}
          />
        ) : (
          <div style={{ display: 'grid', gap: '2rem' }}>
            {filteredServices.map(service => (
              <div key={service.id} style={{ 
                backgroundColor: 'var(--bg-card)', 
                borderRadius: 'var(--radius-lg)', 
                border: '1px solid var(--border-color)',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  padding: '1.5rem', 
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'rgba(255,255,255,0.02)' 
                }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {service.name} <span style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>{service.code}</span>
                  </h3>
                  {service.description && (
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>{service.description}</p>
                  )}
                </div>
                
                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {service.counters.length === 0 ? (
                     <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No counters available for this service.</p>
                  ) : service.counters.map(counter => {
                    const isOpen = counter.status === 'OPEN';
                    return (
                      <div key={counter.id} style={{
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-dark)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h4 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{counter.name}</h4>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 700, 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: isOpen ? 'var(--status-open-bg)' : 'var(--status-closed-bg)',
                            color: isOpen ? 'var(--status-open)' : 'var(--status-closed)',
                            border: `1px solid ${isOpen ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                          }}>
                            {counter.status}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Users size={16} />
                            <span>{counter.queue_size} waiting</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Clock size={16} />
                            <span>~{counter.estimated_wait_time} min</span>
                          </div>
                        </div>

                        <button 
                          onClick={() => handleBook(service.id, counter.id)}
                          disabled={!isOpen}
                          className="btn btn-primary"
                          style={{ 
                            marginTop: 'auto', 
                            width: '100%', 
                            opacity: isOpen ? 1 : 0.5,
                            cursor: isOpen ? 'pointer' : 'not-allowed'
                          }}
                        >
                          Join Queue
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
