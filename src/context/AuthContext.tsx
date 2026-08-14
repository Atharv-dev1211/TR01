import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Counter, AuthState } from '../types';

interface AuthContextType extends AuthState {
  counter: Counter | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCounterStatus: (newStatus: Counter['status']) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [counter, setCounter] = useState<Counter | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('qc_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function checkAuth() {
      const storedToken = localStorage.getItem('qc_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setCounter(data.counter);
          setToken(storedToken);
        } else {
          localStorage.removeItem('qc_token');
          setToken(null);
          setUser(null);
          setCounter(null);
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('qc_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setCounter(data.counter);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('qc_token');
    setToken(null);
    setUser(null);
    setCounter(null);
  };

  const updateCounterStatus = (newStatus: Counter['status']) => {
    if (counter) {
      setCounter({ ...counter, status: newStatus });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        counter,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        updateCounterStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
