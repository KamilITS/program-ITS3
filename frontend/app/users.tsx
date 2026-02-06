import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  role: string;
  created_at: string;
}

export default function Users() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
    if (!isLoading && user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user]);

  const loadUsers = async () => {
    try {
      const data = await apiFetch('/api/users');
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      loadUsers();
    }
  }, [isAuthenticated, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const handleRoleChange = async (userId: string, currentRole: string) => {
    if (userId === user?.user_id) {
      Alert.alert('Błąd', 'Nie możesz zmienić własnej roli');
      return;
    }

    const newRole = currentRole === 'admin' ? 'pracownik' : 'admin';
    
    Alert.alert(
      'Zmień rolę',
      `Czy na pewno chcesz zmienić rolę tego użytkownika na "${newRole}"?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zmień',
          onPress: async () => {
            try {
              await apiFetch(`/api/users/${userId}/role`, {
                method: 'PUT',
                body: { role: newRole },
              });
              await loadUsers();
              Alert.alert('Sukces', 'Rola została zmieniona');
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  const renderUser = ({ item }: { item: User }) => {
    const isCurrentUser = item.user_id === user?.user_id;
    
    return (
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Ionicons
            name={item.role === 'admin' ? 'shield' : 'person'}
            size={24}
            color="#fff"
          />
        </View>
        
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName}>{item.name}</Text>
            {isCurrentUser && (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>Ty</Text>
              </View>
            )}
          </View>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        
        <TouchableOpacity
          style={[
            styles.roleBadge,
            item.role === 'admin' && styles.adminBadge,
          ]}
          onPress={() => handleRoleChange(item.user_id, item.role)}
          disabled={isCurrentUser}
        >
          <Text style={styles.roleText}>
            {item.role === 'admin' ? 'Admin' : 'Pracownik'}
          </Text>
          {!isCurrentUser && (
            <Ionicons name="chevron-down" size={14} color="#fff" style={{ marginLeft: 4 }} />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Zarządzaj użytkownikami</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {users.filter((u) => u.role === 'admin').length}
          </Text>
          <Text style={styles.statLabel}>Administratorzy</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {users.filter((u) => u.role === 'pracownik').length}
          </Text>
          <Text style={styles.statLabel}>Pracownicy</Text>
        </View>
      </View>

      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>Brak użytkowników</Text>
          </View>
        }
      />
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
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    color: '#3b82f6',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  youBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  userEmail: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  adminBadge: {
    backgroundColor: '#3b82f6',
  },
  roleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
});
