import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { LoginPage } from './pages/LoginPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage';

const ProtectedStaffRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-dark)',
        color: 'var(--text-secondary)',
      }}>
        Authenticating Staff User...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'STAFF' && user?.role !== 'ADMIN') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem',
        backgroundColor: 'var(--bg-dark)',
        color: 'var(--text-primary)',
      }}>
        <h2>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Student accounts cannot access the Staff Queue Operations Module.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/staff"
        element={
          <ProtectedStaffRoute>
            <SocketProvider>
              <StaffDashboardPage />
            </SocketProvider>
          </ProtectedStaffRoute>
        }
      />
      <Route path="*" element={<Navigate to="/staff" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;
