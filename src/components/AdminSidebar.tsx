import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard,
    Tv,
    Layers,
    MonitorPlay,
    Users,
    BarChart3,
    LogOut,
    Menu,
    X,
    ShieldAlert
} from 'lucide-react';

interface AdminSidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeTab, setActiveTab }) => {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const navigationItems = [
        { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
        { id: 'live-monitor', label: 'Live Monitor', icon: <Tv size={18} /> },
        { id: 'services', label: 'Services', icon: <Layers size={18} /> },
        { id: 'counters', label: 'Counters', icon: <MonitorPlay size={18} /> },
        { id: 'staff', label: 'Staff Operators', icon: <Users size={18} /> },
        { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
    ];

    const handleTabClick = (tabId: string) => {
        setActiveTab(tabId);
        setIsOpen(false);
    };

    return (
        <>
            {/* Mobile Toggle Bar */}
            <div className="mobile-only" style={{
                display: 'none', // Overridden in responsive styles or index.css
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1.25rem',
                backgroundColor: 'var(--bg-card)',
                borderBottom: '1px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                zIndex: 99,
                width: '100%'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>QueueCraft</span>
                    <span className="badge badge-priority" style={{ fontSize: '0.65rem' }}>Admin</span>
                </div>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="btn btn-secondary"
                    style={{ padding: '0.375rem 0.5rem' }}
                >
                    {isOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Sidebar Container */}
            <aside
                className={`qc-sidebar ${isOpen ? 'open' : ''}`}
                style={{
                    width: '260px',
                    backgroundColor: 'var(--bg-card)',
                    borderRight: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100vh',
                    position: 'sticky',
                    top: 0,
                    left: 0,
                    zIndex: 10,
                    transition: 'transform 0.3s ease'
                }}
            >
                <div style={{ padding: '1.5rem 1rem' }}>
                    {/* Logo Branding */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0 0.5rem 1.5rem 0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, var(--accent-primary), #818cf8)',
                            padding: '0.5rem',
                            borderRadius: 'var(--radius-md)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Layers size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                QueueCraft
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--status-open)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <ShieldAlert size={10} />
                                <span>ADMIN PANEL</span>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {navigationItems.map((item) => {
                            const isActive = activeTab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleTabClick(item.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.875rem',
                                        width: '100%',
                                        padding: '0.75rem 1rem',
                                        border: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        backgroundColor: isActive ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        fontWeight: isActive ? 700 : 500,
                                        fontSize: '0.875rem',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    className={isActive ? 'sidebar-item-active' : ''}
                                >
                                    <span style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                                        {item.icon}
                                    </span>
                                    <span>{item.label}</span>
                                    {isActive && (
                                        <div style={{
                                            marginLeft: 'auto',
                                            width: '4px',
                                            height: '16px',
                                            borderRadius: 'var(--radius-full)',
                                            backgroundColor: 'var(--accent-primary)'
                                        }} />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* User Info & Logout footer */}
                <div style={{
                    padding: '1.25rem 1rem',
                    borderTop: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-dark)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: 'var(--accent-secondary)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.9rem'
                        }}>
                            {user?.name ? user.name[0] : 'A'}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {user?.name || 'Administrator'}
                            </div>
                            <div style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-secondary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {user?.email || 'admin@queuecraft.edu'}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={logout}
                        className="btn btn-secondary"
                        style={{
                            width: '100%',
                            fontSize: '0.8rem',
                            padding: '0.5rem',
                            justifyContent: 'center'
                        }}
                    >
                        <LogOut size={14} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
};
