import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StudentHeader } from '../components/student/StudentHeader';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { Service, Counter } from '../types';

export const BookingPage: React.FC = () => {
  const { serviceId, counterId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [service, setService] = useState<Service | null>(null);
  const [counter, setCounter] = useState<Counter | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    fetchDetails();
  }, [serviceId, counterId]);

  const fetchDetails = async () => {
    try {
      const token = localStorage.getItem('qc_token');
      const res = await fetch('/api/student/services', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch details');
      const data = await res.json();
      
      const foundService = data.services.find((s: any) => s.id === serviceId);
      if (foundService) {
        setService(foundService);
        const foundCounter = foundService.counters.find((c: any) => c.id === counterId);
        if (foundCounter) {
          setCounter(foundCounter);
        } else {
          setError('Counter not found');
        }
      } else {
        setError('Service not found');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInitLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('qc_token');
      const res = await fetch('/api/student/tokens/book', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ service_id: serviceId, counter_id: counterId })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to book token');
      
      // Navigate to active token page
      navigate(`/student/token/${data.token.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (initLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
        <StudentHeader />
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading details...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
      <StudentHeader />
      
      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <button 
          onClick={() => navigate('/student')}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--text-secondary)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            cursor: 'pointer',
            padding: 0,
            marginBottom: '2rem',
            fontSize: '0.875rem',
            fontWeight: 600
          }}
        >
          <ArrowLeft size={16} /> Back to Services
        </button>

        <div style={{ 
          backgroundColor: 'var(--bg-card)', 
          borderRadius: 'var(--radius-lg)', 
          border: '1px solid var(--border-color)',
          padding: '2rem',
          boxShadow: 'var(--shadow-md)'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem', textAlign: 'center' }}>
            Confirm Booking
          </h2>

          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: 'var(--radius-md)', color: '#ef4444', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Booking Failed</strong>
                <span style={{ fontSize: '0.875rem' }}>{error}</span>
              </div>
            </div>
          )}

          <div style={{ backgroundColor: 'var(--bg-dark)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Service</span>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{service?.name}</div>
              </div>
              <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }}></div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Counter</span>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{counter?.name}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
             <button 
              onClick={() => navigate('/student')}
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={loading}
             >
               Cancel
             </button>
             <button 
              onClick={handleConfirm}
              className="btn btn-primary"
              style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
              disabled={loading || !service || !counter}
             >
               {loading ? 'Booking...' : (
                 <>
                   <CheckCircle2 size={18} /> Confirm Booking
                 </>
               )}
             </button>
          </div>
        </div>
      </main>
    </div>
  );
};
