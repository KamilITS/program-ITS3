import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Session timeout for workers (30 minutes in milliseconds)
const WORKER_SESSION_TIMEOUT = 30 * 60 * 1000;

interface User {
  user_id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loginTimeRef = useRef<number | null>(null);

  // Clear any existing session timeout
  const clearSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  };

  // Setup session timeout for workers
  const setupSessionTimeout = async (userData: User) => {
    clearSessionTimeout();
    
    // Only apply timeout for workers (pracownik), not admins
    if (userData.role !== 'admin') {
      const storedLoginTime = await AsyncStorage.getItem('login_time');
      const loginTime = storedLoginTime ? parseInt(storedLoginTime, 10) : Date.now();
      loginTimeRef.current = loginTime;
      
      const elapsed = Date.now() - loginTime;
      const remaining = WORKER_SESSION_TIMEOUT - elapsed;
      
      if (remaining <= 0) {
        // Session already expired
        Alert.alert(
          'Sesja wygasła',
          'Twoja sesja wygasła. Zaloguj się ponownie.',
          [{ text: 'OK' }]
        );
        await performLogout();
      } else {
        // Set timeout for remaining time
        sessionTimeoutRef.current = setTimeout(async () => {
          Alert.alert(
            'Sesja wygasła',
            'Twoja sesja wygasła po 30 minutach nieaktywności. Zaloguj się ponownie.',
            [{ text: 'OK' }]
          );
          await performLogout();
        }, remaining);
        
        console.log(`Session will expire in ${Math.round(remaining / 60000)} minutes`);
      }
    }
  };

  // Perform logout without API call (for session expiry)
  const performLogout = async () => {
    clearSessionTimeout();
    await AsyncStorage.removeItem('session_token');
    await AsyncStorage.removeItem('login_time');
    loginTimeRef.current = null;
    setUser(null);
  };

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
        await setupSessionTimeout(userData);
      } else {
        await AsyncStorage.removeItem('session_token');
        await AsyncStorage.removeItem('login_time');
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && user && user.role !== 'admin') {
        // Check if session has expired while app was in background
        const storedLoginTime = await AsyncStorage.getItem('login_time');
        if (storedLoginTime) {
          const loginTime = parseInt(storedLoginTime, 10);
          const elapsed = Date.now() - loginTime;
          
          if (elapsed >= WORKER_SESSION_TIMEOUT) {
            Alert.alert(
              'Sesja wygasła',
              'Twoja sesja wygasła. Zaloguj się ponownie.',
              [{ text: 'OK' }]
            );
            await performLogout();
          } else {
            // Reset timeout for remaining time
            await setupSessionTimeout(user);
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  useEffect(() => {
    checkAuth();
    
    return () => {
      clearSessionTimeout();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        const loginTime = Date.now();
        await AsyncStorage.setItem('session_token', data.session_token);
        await AsyncStorage.setItem('login_time', loginTime.toString());
        
        const userData = {
          user_id: data.user_id,
          email: data.email,
          name: data.name,
          role: data.role,
        };
        
        setUser(userData);
        await setupSessionTimeout(userData);
        
        return { success: true };
      } else {
        return { success: false, error: data.detail || 'Błąd logowania' };
      }
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: 'Błąd połączenia z serwerem' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
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

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.detail || 'Błąd zmiany hasła' };
      }
    } catch (error) {
      console.error('Change password failed:', error);
      return { success: false, error: 'Błąd połączenia z serwerem' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
      changePassword,
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
