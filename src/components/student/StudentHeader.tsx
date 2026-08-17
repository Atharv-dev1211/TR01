import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Layers, LogOut, User, Wifi, WifiOff } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export const StudentHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header style={{
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-color)',
      padding: '1rem 1.5rem',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        {/* Branding & Logo */}
        <Link to="/student" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent-primary), #818cf8)',
            padding: '0.625rem',
            borderRadius: 'var(--radius-md)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Layers size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              QueueCraft
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>
              Student Portal
            </p>
          </div>
        </Link>

        {/* Navigation Links */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
           <Link to="/student" style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}>Dashboard</Link>
           <Link to="/student/history" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}>History</Link>
        </div>

        {/* User Info & Connection Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Socket Connection Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: isConnected ? 'var(--status-open)' : 'var(--status-closed)',
            backgroundColor: isConnected ? 'var(--status-open-bg)' : 'var(--status-closed-bg)',
            padding: '0.375rem 0.75rem',
            borderRadius: 'var(--radius-full)',
            border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}>
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Student User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              fontWeight: 700,
            }}>
              <User size={18} />
            </div>
            <div className="hidden-mobile">
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {user?.name || 'Student'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {user?.role}
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            title="Logout"
            style={{ padding: '0.5rem 0.75rem' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
