import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { Layers, Lock, Mail, ArrowRight, ShieldCheck, User, UserPlus, LogIn } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('STUDENT');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleRedirect = (role?: UserRole) => {
    if (role === 'STUDENT') {
      navigate('/student');
    } else if (role === 'ADMIN') {
      navigate('/admin');
    } else {
      navigate('/staff');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const user = await signup(email, password, name, selectedRole);
        handleRedirect(user.role);
      } else {
        const user = await login(email, password);
        handleRedirect(user.role);
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoRudresh = async () => {
    setIsSignUp(false);
    setEmail('rudresh@queuecraft.edu');
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      const user = await login('rudresh@queuecraft.edu', 'password123');
      handleRedirect(user.role);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoStudent = async () => {
    setIsSignUp(false);
    setEmail('student@queuecraft.edu');
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      const user = await login('student@queuecraft.edu', 'password123');
      handleRedirect(user.role);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoAdmin = async () => {
    setIsSignUp(false);
    setEmail('admin@queuecraft.edu');
    setPassword('password123');
    setError(null);
    setLoading(true);
    try {
      const user = await login('admin@queuecraft.edu', 'password123');
      handleRedirect(user.role);
    } catch (err: any) {
      setError(err.message || String(err));
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
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
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

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-dark)',
          padding: '0.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError(null); }}
            style={{
              flex: 1,
              padding: '0.625rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: !isSignUp ? 'var(--accent-primary)' : 'transparent',
              color: !isSignUp ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
              transition: 'all 0.15s ease',
            }}
          >
            <LogIn size={15} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError(null); }}
            style={{
              flex: 1,
              padding: '0.625rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: isSignUp ? 'var(--accent-primary)' : 'transparent',
              color: isSignUp ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
              transition: 'all 0.15s ease',
            }}
          >
            <UserPlus size={15} />
            <span>Sign Up</span>
          </button>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          {isSignUp && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Full Name
              </label>
              <div style={{ position: 'relative', marginTop: '0.375rem' }}>
                <User size={18} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
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
          )}

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
                minLength={6}
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

          {isSignUp && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Account Role
              </label>
              <div style={{ position: 'relative', marginTop: '0.375rem' }}>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.875rem',
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="STUDENT">Student (Book & Track Tokens)</option>
                  <option value="STAFF">Staff Operator (Serve Queues)</option>
                  <option value="ADMIN">System Administrator (Global Config)</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            <span>{loading ? (isSignUp ? 'Creating Account...' : 'Authenticating...') : (isSignUp ? 'Create Account & Sign In' : 'Sign In to Dashboard')}</span>
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
            <ShieldCheck size={14} /> Quick Demo Logins:
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
            style={{ width: '100%', fontSize: '0.825rem', justifyContent: 'center' }}
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
