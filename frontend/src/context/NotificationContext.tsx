import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './AuthContext';
import { apiFetch } from '../utils/api';

interface ChatMessage {
  message_id: string;
  sender_id: string;
  sender_name: string;
  content?: string;
  created_at: string;
}

interface NotificationContextType {
  unreadChatCount: number;
  dismissChatNotification: () => void;
  markChatAsRead: () => void;
  refreshNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [notification, setNotification] = useState<{ sender: string; preview: string; messageId: string } | null>(null);
  const [shownMessageIds, setShownMessageIds] = useState<Set<string>>(new Set());
  
  // Animation for notification
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const [showBanner, setShowBanner] = useState(false);

  const isOnChatScreen = pathname === '/chat';

  const showNotification = useCallback((sender: string, preview: string, messageId: string) => {
    // Don't show if already shown this message
    if (shownMessageIds.has(messageId)) return;
    
    setShownMessageIds(prev => new Set(prev).add(messageId));
    setNotification({ sender, preview, messageId });
    setShowBanner(true);
    
    // Reset animation value first
    slideAnim.setValue(-150);
    
    // Animate in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    // Auto-hide after 6 seconds
    setTimeout(() => {
      hideBanner();
    }, 6000);
  }, [shownMessageIds, slideAnim]);

  const hideBanner = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowBanner(false);
      setNotification(null);
    });
  }, [slideAnim]);

  const dismissChatNotification = useCallback(() => {
    hideBanner();
  }, [hideBanner]);

  const markChatAsRead = useCallback(async () => {
    if (!user) return;
    const lastCheckKey = `lastChatCheck_${user.user_id}`;
    await AsyncStorage.setItem(lastCheckKey, new Date().toISOString());
    setUnreadChatCount(0);
    hideBanner();
  }, [user, hideBanner]);

  const checkForNewMessages = useCallback(async () => {
    if (!isAuthenticated || !user) {
      console.log('[Notifications] Not authenticated or no user');
      return;
    }

    console.log('[Notifications] Checking for new messages...');

    try {
      const messages: ChatMessage[] = await apiFetch('/api/messages?limit=50');
      
      console.log('[Notifications] Got messages:', messages.length);
      
      if (messages.length === 0) return;

      // Get last check timestamp
      const lastCheckKey = `lastChatCheck_${user.user_id}`;
      const lastCheckTimestamp = await AsyncStorage.getItem(lastCheckKey);
      
      console.log('[Notifications] Last check:', lastCheckTimestamp);
      
      // Filter messages from others (not from current user)
      const messagesFromOthers = messages.filter(m => m.sender_id !== user.user_id);
      
      console.log('[Notifications] Messages from others:', messagesFromOthers.length);
      
      if (messagesFromOthers.length === 0) return;

      // Calculate unread count
      let unreadCount = 0;
      let newMessages: ChatMessage[] = [];
      
      if (lastCheckTimestamp) {
        const lastCheck = new Date(lastCheckTimestamp);
        newMessages = messagesFromOthers.filter(m => new Date(m.created_at) > lastCheck);
        unreadCount = newMessages.length;
      } else {
        // First time - count messages from last 1 hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        newMessages = messagesFromOthers.filter(m => new Date(m.created_at) > oneHourAgo);
        unreadCount = newMessages.length;
      }

      console.log('[Notifications] Unread count:', unreadCount, 'New messages:', newMessages.length);

      setUnreadChatCount(unreadCount);

      // Show notification for the newest unread message if:
      // 1. Not on chat screen
      // 2. Has new messages
      // 3. Haven't shown notification for this message yet
      if (!isOnChatScreen && newMessages.length > 0) {
        const newestMessage = newMessages[0];
        console.log('[Notifications] Should show notification for:', newestMessage.message_id, 'Already shown:', shownMessageIds.has(newestMessage.message_id));
        if (!shownMessageIds.has(newestMessage.message_id)) {
          showNotification(
            newestMessage.sender_name,
            newestMessage.content?.substring(0, 60) || '[załącznik]',
            newestMessage.message_id
          );
        }
      }
    } catch (error) {
      console.error('[Notifications] Error checking messages:', error);
    }
  }, [isAuthenticated, user, isOnChatScreen, shownMessageIds, showNotification]);

  const refreshNotifications = useCallback(() => {
    checkForNewMessages();
  }, [checkForNewMessages]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial check
    const timeout = setTimeout(() => {
      checkForNewMessages();
    }, 1000);

    // Set up polling
    const interval = setInterval(checkForNewMessages, 5000);
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isAuthenticated, checkForNewMessages]);

  // Hide notification and mark as read when entering chat screen
  useEffect(() => {
    if (isOnChatScreen) {
      hideBanner();
      markChatAsRead();
    }
  }, [isOnChatScreen]);

  const handleNotificationPress = () => {
    hideBanner();
    router.push('/chat');
  };

  return (
    <NotificationContext.Provider
      value={{
        unreadChatCount,
        dismissChatNotification,
        markChatAsRead,
        refreshNotifications,
      }}
    >
      {children}
      
      {/* Global Chat Notification Banner */}
      {showBanner && notification && (
        <Animated.View 
          style={[
            styles.notificationBanner,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          <TouchableOpacity 
            style={styles.notificationContent}
            onPress={handleNotificationPress}
            activeOpacity={0.9}
          >
            <View style={styles.notificationIcon}>
              <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
            </View>
            <View style={styles.notificationText}>
              <Text style={styles.notificationTitle}>
                💬 Nowa wiadomość
              </Text>
              <Text style={styles.notificationPreview} numberOfLines={1}>
                <Text style={styles.senderName}>{notification.sender}:</Text> {notification.preview}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.notificationClose}
              onPress={dismissChatNotification}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
}

const styles = StyleSheet.create({
  notificationBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 25,
    left: 12,
    right: 12,
    zIndex: 99999,
    elevation: 999,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationText: {
    flex: 1,
    marginLeft: 14,
  },
  notificationTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  notificationPreview: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginTop: 3,
  },
  senderName: {
    fontWeight: '700',
  },
  notificationClose: {
    padding: 4,
  },
});
