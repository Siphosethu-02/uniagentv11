import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Student } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  student: Student | null;
  isLoading: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    full_name: string;
    student_number?: string;
    university?: string;
    degree?: string;
    major?: string;
    year_of_study?: number;
    target_gpa?: number;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Start logged out. A previous version of this app hardcoded a demo user
  // here so the UI always *looked* signed in, even to someone with no
  // valid session - the only thing keeping them out of admin views was
  // client-side role gating. Now the real signed-in state only exists once
  // the stored token is actually verified against the server below.
  const [user, setUser] = useState<User | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Verify any stored token against the server on load; treat a failure
    // (missing/expired/invalid token) as logged out rather than silently
    // keeping stale or fabricated user data on screen.
    const loadProfile = async () => {
      try {
        const data = await api.getMe();
        if (data.id) {
          setUser({
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role as any,
            is_active: true,
          });
          setStudent(data.student || null);
        }
      } catch (e) {
        api.clearToken();
        setUser(null);
        setStudent(null);
      } finally {
        setIsInitializing(false);
      }
    };
    loadProfile();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      setUser(res.user);
      const meData = await api.getMe().catch(() => null);
      setStudent(meData?.student || null);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    full_name: string;
    student_number?: string;
    university?: string;
    degree?: string;
    major?: string;
    year_of_study?: number;
    target_gpa?: number;
  }) => {
    setIsLoading(true);
    try {
      const res = await api.register(data);
      setUser(res.user);
      const meData = await api.getMe().catch(() => null);
      setStudent(meData?.student || null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
    setStudent(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        student,
        isLoading,
        isInitializing,
        login,
        register,
        logout,
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
