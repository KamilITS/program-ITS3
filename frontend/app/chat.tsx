import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../src/context/AuthContext';
import { useNotifications } from '../src/context/NotificationContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { pl } from 'date-fns/locale';

const WARSAW_TZ = 'Europe/Warsaw';

// Helper to format date in Warsaw timezone
const formatInWarsaw = (dateStr: string, formatStr: string) => {
  const date = new Date(dateStr);
  const warsawDate = toZonedTime(date, WARSAW_TZ);
  return format(warsawDate, formatStr, { locale: pl });
};

interface Message {
  message_id: string;
  sender_id: string;
  sender_name: string;
  content?: string;
  attachment?: string;
  attachment_type?: string;
  created_at: string;
}

export default function Chat() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { markChatAsRead } = useNotifications();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  const loadMessages = async () => {
    try {
      const data = await apiFetch('/api/messages?limit=100');
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadMessages();
      // Mark chat as read when entering chat screen
      markChatAsRead();
      // Poll for new messages every 5 seconds
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    
    setSending(true);
    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        body: { content: newMessage.trim() },
      });
      setNewMessage('');
      await loadMessages();
      flatListRef.current?.scrollToEnd();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setSending(true);
      try {
        await apiFetch('/api/messages', {
          method: 'POST',
          body: {
            attachment: `data:image/jpeg;base64,${result.assets[0].base64}`,
            attachment_type: 'image',
          },
        });
        await loadMessages();
        flatListRef.current?.scrollToEnd();
      } catch (error) {
        console.error('Error sending image:', error);
      } finally {
        setSending(false);
      }
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.sender_id === user?.user_id;
    const messageDate = new Date(item.created_at);
    
    return (
      <View style={[
        styles.messageContainer,
        isOwnMessage ? styles.ownMessage : styles.otherMessage,
      ]}>
        {!isOwnMessage && (
          <Text style={styles.senderName}>{item.sender_name}</Text>
        )}
        
        {item.attachment && item.attachment_type === 'image' && (
          <Image
            source={{ uri: item.attachment }}
            style={styles.messageImage}
            resizeMode="cover"
          />
        )}
        
        {item.content && (
          <Text style={[
            styles.messageText,
            isOwnMessage && styles.ownMessageText,
          ]}>
            {item.content}
          </Text>
        )}
        
        <Text style={[
          styles.messageTime,
          isOwnMessage && styles.ownMessageTime,
        ]}>
          {formatInWarsaw(item.created_at, 'HH:mm')}
        </Text>
      </View>
    );
  };

  const renderDateSeparator = (date: Date) => (
    <View style={styles.dateSeparator}>
      <Text style={styles.dateSeparatorText}>
        {format(toZonedTime(date, WARSAW_TZ), 'd MMMM yyyy', { locale: pl })}
      </Text>
    </View>
  );

  // Group messages by date
  const groupedMessages = messages.reduce((acc: any[], message, index) => {
    const messageDate = new Date(message.created_at);
    const prevMessage = messages[index - 1];
    
    if (!prevMessage || 
        format(new Date(prevMessage.created_at), 'yyyy-MM-dd') !== format(messageDate, 'yyyy-MM-dd')) {
      acc.push({ type: 'date', date: messageDate, id: `date-${message.message_id}` });
    }
    
    acc.push({ type: 'message', ...message });
    return acc;
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Czat zespołu</Text>
        <TouchableOpacity onPress={loadMessages} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={groupedMessages}
          renderItem={({ item }) => 
            item.type === 'date' 
              ? renderDateSeparator(item.date)
              : renderMessage({ item })
          }
          keyExtractor={(item) => item.id || item.message_id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#333" />
              <Text style={styles.emptyText}>Brak wiadomości</Text>
              <Text style={styles.emptySubtext}>Napisz pierwszą wiadomość!</Text>
            </View>
          }
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton} onPress={handleImagePick}>
            <Ionicons name="image-outline" size={24} color="#3b82f6" />
          </TouchableOpacity>
          
          <TextInput
            style={styles.input}
            placeholder="Napisz wiadomość..."
            placeholderTextColor="#888"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={1000}
          />
          
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  refreshButton: {
    padding: 8,
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  messageTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  ownMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorText: {
    color: '#888',
    fontSize: 12,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  attachButton: {
    padding: 10,
    marginRight: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
});
