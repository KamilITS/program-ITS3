import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        await AsyncStorage.removeItem('session_token');
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const processSessionId = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/auth/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (response.ok) {
        const data = await response.json();
        await AsyncStorage.setItem('session_token', data.session_token);
        setUser({
          user_id: data.user_id,
          email: data.email,
          name: data.name,
          picture: data.picture,
          role: data.role,
        });
      }
    } catch (error) {
      console.error('Session exchange failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrl = async (url: string) => {
    const sessionIdMatch = url.match(/[#?]session_id=([^&]+)/);
    if (sessionIdMatch) {
      await processSessionId(sessionIdMatch[1]);
    }
  };

  useEffect(() => {
    // Check initial URL on mount (cold start)
    const checkInitialUrl = async () => {
      try {
        // For web, check window.location.hash
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hash = window.location.hash;
          const search = window.location.search;
          
          // Check both hash and query params for session_id
          let sessionId = null;
          if (hash && hash.includes('session_id=')) {
            sessionId = hash.match(/session_id=([^&]+)/)?.[1];
          } else if (search && search.includes('session_id=')) {
            sessionId = search.match(/session_id=([^&]+)/)?.[1];
          }
          
          if (sessionId) {
            await processSessionId(sessionId);
            // Clean URL
            window.history.replaceState(null, '', window.location.pathname);
            return;
          }
          
          // No session_id, check existing auth
          await checkAuth();
          return;
        }

        // For mobile, check Linking
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          await handleUrl(initialUrl);
        } else {
          await checkAuth();
        }
      } catch (error) {
        console.error('Error checking initial URL:', error);
        setIsLoading(false);
      }
    };

    checkInitialUrl();

    // Listen for URL changes (mobile only)
    if (Platform.OS !== 'web') {
      const subscription = Linking.addEventListener('url', (event) => {
        handleUrl(event.url);
      });

      return () => {
        subscription.remove();
      };
    }
  }, []);

  const login = async () => {
    const redirectUrl = Platform.OS === 'web'
      ? `${API_URL}/`
      : Linking.createURL('/');

    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === 'web') {
      window.location.href = authUrl;
    } else {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === 'success' && result.url) {
        await handleUrl(result.url);
      }
    }
  };

  const logout = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      await AsyncStorage.removeItem('session_token');
      setUser(null);
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
    }}>
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
