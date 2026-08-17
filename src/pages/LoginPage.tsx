import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layers, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState<string>('rudresh@queuecraft.edu');
  const [password, setPassword] = useState<string>('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      const token = localStorage.getItem('qc_token');
      const payload = token ? JSON.parse(atob(token.split('.')[1])) : null;
      if (payload?.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/staff');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoRudresh = async () => {
    setEmail('rudresh@queuecraft.edu');
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      const user = await login('rudresh@queuecraft.edu', 'password123');
      if (user?.role === 'STUDENT') {
        navigate('/student');
      } else {
        navigate('/staff');
      }
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoStudent = async () => {
    setEmail('student@queuecraft.edu');
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      const user = await login('student@queuecraft.edu', 'password123');
      if (user?.role === 'STUDENT') {
        navigate('/student');
      } else {
        navigate('/staff');
      }
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoAdmin = async () => {
    setEmail('admin@queuecraft.edu');
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      await login('admin@queuecraft.edu', 'password123');
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-dark)',
      padding: '1.5rem',
    }}>
      <div className="qc-card" style={{ maxWidth: '440px', width: '100%', padding: '2rem' }}>
        {/* Logo Branding */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            display: 'inline-flex',
            background: 'linear-gradient(135deg, var(--accent-primary), #818cf8)',
            padding: '0.875rem',
            borderRadius: 'var(--radius-md)',
            color: '#ffffff',
            marginBottom: '0.75rem',
          }}>
            <Layers size={32} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            QueueCraft
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Campus Queue & Token Management Platform
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: '1.25rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Email Address
            </label>
            <div style={{ position: 'relative', marginTop: '0.375rem' }}>
              <Mail size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@queuecraft.edu"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.875rem 0.75rem 2.6rem',
                  backgroundColor: 'var(--bg-dark)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Password
            </label>
            <div style={{ position: 'relative', marginTop: '0.375rem' }}>
              <Lock size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.875rem 0.75rem 2.6rem',
                  backgroundColor: 'var(--bg-dark)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Dashboard'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Quick Demo Pre-fill Box */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
            <ShieldCheck size={14} /> Quick Demo Credentials:
          </p>
          <button
            onClick={handleQuickDemoStudent}
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '0.825rem', justifyContent: 'center' }}
          >
            Log In as Demo Student
          </button>
          <button
            onClick={handleQuickDemoRudresh}
            disabled={loading}
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.825rem', justifyContent: 'center', marginBottom: '0.5rem' }}
          >
            Log In as Staff Rudresh (Library Printer)
          </button>
          <button
            onClick={handleQuickDemoAdmin}
            disabled={loading}
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.825rem', justifyContent: 'center' }}
          >
            Log In as Administrator (Global settings)
          </button>
        </div>
      </div>
    </div>
  );
};

