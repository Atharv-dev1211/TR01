import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase';
import { User, Counter, AuthState, UserRole } from '../types';

interface AuthContextType extends AuthState {
  counter: Counter | null;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name?: string, role?: UserRole) => Promise<User>;
  logout: () => Promise<void>;
  updateCounterStatus: (newStatus: Counter['status']) => void;
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function resolveRole(email?: string | null, customRole?: UserRole | null): UserRole {
  if (customRole) return customRole;
  if (!email) return 'STUDENT';
  const lower = email.toLowerCase();
  if (lower.startsWith('admin') || lower.includes('admin@')) return 'ADMIN';
  if (lower.startsWith('rudresh') || lower.includes('staff') || lower.includes('@staff.')) return 'STAFF';
  return 'STUDENT';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [counter, setCounter] = useState<Counter | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('qc_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to map Firebase user to QueueCraft User object
  const mapFirebaseUser = (fbUser: FirebaseUser, explicitRole?: UserRole, explicitName?: string): User => {
    const savedRole = (localStorage.getItem(`qc_role_${fbUser.uid}`) as UserRole) || explicitRole;
    const finalRole = resolveRole(fbUser.email, savedRole);
    const savedName = localStorage.getItem(`qc_name_${fbUser.uid}`) || explicitName;
    const finalName = fbUser.displayName || savedName || fbUser.email?.split('@')[0] || 'User';

    return {
      id: fbUser.uid,
      name: finalName,
      email: fbUser.email || '',
      role: finalRole,
      created_at: fbUser.metadata.creationTime || new Date().toISOString(),
    };
  };

  useEffect(() => {
    // Listen to Firebase Auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          const mappedUser = mapFirebaseUser(firebaseUser);
          
          setUser(mappedUser);
          setToken(idToken);
          localStorage.setItem('qc_token', idToken);

          // Configure counter for staff operators
          if (mappedUser.role === 'STAFF') {
            setCounter({
              id: 'c1',
              service_id: 's1',
              service_name: 'Library Printer',
              name: 'Counter 1',
              status: 'OPEN',
              created_at: new Date().toISOString(),
            });
          } else {
            setCounter(null);
          }
        } else {
          setUser(null);
          setToken(null);
          setCounter(null);
          localStorage.removeItem('qc_token');
        }
      } catch (err) {
        console.error('Error in onAuthStateChanged:', err);
        setUser(null);
        setToken(null);
        setCounter(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const mappedUser = mapFirebaseUser(userCredential.user);
      const idToken = await userCredential.user.getIdToken();

      setUser(mappedUser);
      setToken(idToken);
      localStorage.setItem('qc_token', idToken);

      if (mappedUser.role === 'STAFF') {
        setCounter({
          id: 'c1',
          service_id: 's1',
          service_name: 'Library Printer',
          name: 'Counter 1',
          status: 'OPEN',
          created_at: new Date().toISOString(),
        });
      }
      return mappedUser;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    name?: string,
    role: UserRole = 'STUDENT'
  ): Promise<User> => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      if (name) {
        await updateProfile(fbUser, { displayName: name });
        localStorage.setItem(`qc_name_${fbUser.uid}`, name);
      }
      localStorage.setItem(`qc_role_${fbUser.uid}`, role);

      const mappedUser = mapFirebaseUser(fbUser, role, name);
      const idToken = await fbUser.getIdToken();

      setUser(mappedUser);
      setToken(idToken);
      localStorage.setItem('qc_token', idToken);

      if (role === 'STAFF') {
        setCounter({
          id: 'c1',
          service_id: 's1',
          service_name: 'Library Printer',
          name: 'Counter 1',
          status: 'OPEN',
          created_at: new Date().toISOString(),
        });
      }
      return mappedUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOut(auth);
      localStorage.removeItem('qc_token');
      setUser(null);
      setToken(null);
      setCounter(null);
    } finally {
      setIsLoading(false);
    }
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
        signup,
        logout,
        updateCounterStatus,
        isFirebaseConfigured,
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
