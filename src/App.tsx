import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import { LoginPage } from './pages/LoginPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { ToastNotification } from './components/ToastNotification';

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

const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const ProtectedStudentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
        Authenticating Administrator...
        Authenticating Student User...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'ADMIN') {
  if (user?.role !== 'STUDENT') {
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
          Only System Administrators can access this area.
          This section is restricted to student accounts only.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { toasts, removeToast } = useSocket();

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/staff"
          element={
            <ProtectedStaffRoute>
              <StaffDashboardPage />
            </SocketProvider>
          </ProtectedStaffRoute>
        }
      />
      <Route
        path="/admin/*"
        element={
          <ProtectedAdminRoute>
            <SocketProvider>
              <AdminDashboardPage />
            </SocketProvider>
          </ProtectedAdminRoute>
        path="/student"
        element={
          <ProtectedStudentRoute>
            <StudentDashboardPage />
          </ProtectedStudentRoute>
        }
      />
      <Route
        path="*"
        element={
          isAuthenticated
            ? user?.role === 'ADMIN'
              ? <Navigate to="/admin" replace />
            ? user?.role === 'STUDENT'
              ? <Navigate to="/student" replace />
              : <Navigate to="/staff" replace />
            : <Navigate to="/login" replace />
        }
      />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <AppContent />
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;

