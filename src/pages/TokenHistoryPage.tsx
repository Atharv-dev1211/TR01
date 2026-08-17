import React, { useState, useEffect } from 'react';
import { StudentHeader } from '../components/student/StudentHeader';
import { TokenStatusBadge } from '../components/student/TokenStatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { Clock, History, AlertCircle } from 'lucide-react';

export const TokenHistoryPage: React.FC = () => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const authToken = localStorage.getItem('qc_token');
      const res = await fetch('/api/student/tokens/history', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(d);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
      <StudentHeader />
      
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Token History
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            View your past service tokens
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading history...</div>
        ) : error ? (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: 'var(--radius-md)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={20} />
            {error}
          </div>
        ) : tokens.length === 0 ? (
          <EmptyState 
            icon={History} 
            title="No Token History" 
            description="You haven't generated any tokens yet. When you complete or cancel a token, it will appear here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {tokens.map(token => (
              <div key={token.id} style={{ 
                backgroundColor: 'var(--bg-card)', 
                borderRadius: 'var(--radius-lg)', 
                border: '1px solid var(--border-color)',
                padding: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                   <div style={{ 
                     backgroundColor: 'var(--bg-dark)', 
                     padding: '0.75rem 1rem', 
                     borderRadius: 'var(--radius-md)',
                     border: '1px solid var(--border-color)'
                   }}>
                     <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                       {token.token_number}
                     </div>
                   </div>
                   
                   <div>
                     <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                       {token.service_name}
                     </h4>
                     <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                       <span>{token.counter_name}</span>
                       <span style={{ color: 'var(--text-muted)' }}>•</span>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                         <Clock size={14} />
                         <span>{formatDate(token.created_at)}</span>
                       </div>
                     </div>
                   </div>
                </div>
                
                <div>
                  <TokenStatusBadge status={token.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
