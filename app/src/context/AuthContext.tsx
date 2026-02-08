/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';

interface AuthContextType {
  accessKey: string | null;
  isAuthenticated: boolean;
  isVerifying: boolean;
  error: string | null;
  setAccessKey: (key: string | null) => void;
  verifyKey: (key: string) => Promise<boolean>;
  logout: () => void;
}

const ACCESS_KEY_STORAGE = 'afrobeats_access_key';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessKey, setAccessKeyState] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyKey = useCallback(async (key: string): Promise<boolean> => {
    setIsVerifying(true);
    setError(null);
    
    try {
      const response = await fetch(`${api.getApiBaseUrl?.() || 'http://localhost:3001/api'}/verify-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        setAccessKeyState(key);
        setIsAuthenticated(true);
        localStorage.setItem(ACCESS_KEY_STORAGE, key);
        return true;
      } else {
        setError(data.error || 'Invalid access key');
        return false;
      }
    } catch {
      setError('Failed to verify key');
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAccessKeyState(null);
    setIsAuthenticated(false);
    localStorage.removeItem(ACCESS_KEY_STORAGE);
    setError(null);
  }, []);

  const setAccessKey = useCallback((key: string | null) => {
    if (key) {
      verifyKey(key);
    } else {
      logout();
    }
  }, [verifyKey, logout]);

  // Initialize from URL param or localStorage on mount
  useEffect(() => {
    const initAuth = async () => {
      // Check URL query param first
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('key');

      if (urlKey) {
        // Verify and store the key from URL
        const isValid = await verifyKey(urlKey);
        if (isValid) {
          // Clean up URL but keep the key in storage
          const newUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', newUrl);
        }
        return;
      }

      // Check localStorage
      const storedKey = localStorage.getItem(ACCESS_KEY_STORAGE);
      if (storedKey) {
        const isValid = await verifyKey(storedKey);
        if (!isValid) {
          // Invalid stored key, clear it
          localStorage.removeItem(ACCESS_KEY_STORAGE);
        }
      }
    };

    initAuth();
  }, [verifyKey]);

  return (
    <AuthContext.Provider
      value={{
        accessKey,
        isAuthenticated,
        isVerifying,
        error,
        setAccessKey,
        verifyKey,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
