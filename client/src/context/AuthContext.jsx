import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.js';

const AuthContext = createContext();

const DEMO_CREDENTIALS = {
  admin: { username: 'admin', password: 'admin123' },
  purchasing: { username: 'buyer', password: 'purchasing123' },
  warehouse: { username: 'clerk', password: 'warehouse123' },
  production: { username: 'operator', password: 'production123' },
  qc: { username: 'inspector', password: 'qc123' },
  sales: { username: 'salesrep', password: 'sales123' },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('metalworks_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('metalworks_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await api.get('/auth/me');
        setUser(userData);
        localStorage.setItem('metalworks_user', JSON.stringify(userData));
      } catch (err) {
        setUser(null);
        localStorage.removeItem('metalworks_token');
        localStorage.removeItem('metalworks_user');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const handleUnauthorized = () => {
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    localStorage.setItem('metalworks_token', data.token);
    localStorage.setItem('metalworks_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore logout network error
    } finally {
      localStorage.removeItem('metalworks_token');
      localStorage.removeItem('metalworks_user');
      setUser(null);
    }
  };

  const switchRole = async (role) => {
    const creds = DEMO_CREDENTIALS[role];
    if (creds) {
      return await login(creds.username, creds.password);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
