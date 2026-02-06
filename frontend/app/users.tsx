import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
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
  role: string;
  created_at: string;
}

export default function Users() {
  const { user, isAuthenticated, isLoading, changePassword } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal states
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [myPasswordModalVisible, setMyPasswordModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Form states
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('pracownik');
  
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      Alert.alert('Błąd', 'Wypełnij wszystkie pola');
      return;
    }
    
    if (newUserPassword.length < 6) {
      Alert.alert('Błąd', 'Hasło musi mieć minimum 6 znaków');
      return;
    }
    
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: {
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
        },
      });
      
      Alert.alert('Sukces', 'Użytkownik został utworzony');
      setCreateModalVisible(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('pracownik');
      loadUsers();
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    if (!newPassword.trim() || newPassword.length < 6) {
      Alert.alert('Błąd', 'Hasło musi mieć minimum 6 znaków');
      return;
    }
    
    try {
      await apiFetch(`/api/users/${selectedUser.user_id}/password`, {
        method: 'PUT',
        body: { new_password: newPassword },
      });
      
      Alert.alert('Sukces', `Hasło użytkownika ${selectedUser.name} zostało zresetowane`);
      setPasswordModalVisible(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const handleChangeMyPassword = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Błąd', 'Podaj aktualne hasło');
      return;
    }
    
    if (!newPassword.trim() || newPassword.length < 6) {
      Alert.alert('Błąd', 'Nowe hasło musi mieć minimum 6 znaków');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      Alert.alert('Błąd', 'Hasła nie są identyczne');
      return;
    }
    
    const result = await changePassword(currentPassword, newPassword);
    
    if (result.success) {
      Alert.alert('Sukces', 'Twoje hasło zostało zmienione');
      setMyPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      Alert.alert('Błąd', result.error || 'Nie udało się zmienić hasła');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    Alert.alert(
      'Usuń użytkownika',
      `Czy na pewno chcesz usunąć użytkownika "${userName}"?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
              Alert.alert('Sukces', 'Użytkownik został usunięty');
              loadUsers();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  const handleRoleChange = async (userId: string, currentRole: string) => {
    if (userId === user?.user_id) {
      Alert.alert('Błąd', 'Nie możesz zmienić własnej roli');
      return;
    }

    const newRole = currentRole === 'admin' ? 'pracownik' : 'admin';
    
    Alert.alert(
      'Zmień rolę',
      `Czy na pewno chcesz zmienić rolę na "${newRole}"?`,
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
              loadUsers();
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
        <View style={styles.userHeader}>
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
        
        {!isCurrentUser && (
          <View style={styles.userActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                setSelectedUser(item);
                setPasswordModalVisible(true);
              }}
            >
              <Ionicons name="key-outline" size={18} color="#3b82f6" />
              <Text style={styles.actionButtonText}>Zmień hasło</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDeleteUser(item.user_id, item.name)}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Usuń</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Zarządzanie użytkownikami</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addButton}>
          <Ionicons name="person-add" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => setMyPasswordModalVisible(true)}
        >
          <Ionicons name="lock-closed-outline" size={20} color="#3b82f6" />
          <Text style={styles.quickActionText}>Zmień moje hasło</Text>
        </TouchableOpacity>
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

      {/* Create User Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nowy użytkownik</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Imię i nazwisko</Text>
              <TextInput
                style={styles.input}
                placeholder="np. Jan Kowalski"
                placeholderTextColor="#888"
                value={newUserName}
                onChangeText={setNewUserName}
              />
              
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="np. jan@firma.pl"
                placeholderTextColor="#888"
                value={newUserEmail}
                onChangeText={setNewUserEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              
              <Text style={styles.inputLabel}>Hasło</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimum 6 znaków"
                placeholderTextColor="#888"
                value={newUserPassword}
                onChangeText={setNewUserPassword}
                secureTextEntry
              />
              
              <Text style={styles.inputLabel}>Rola</Text>
              <View style={styles.roleSelect}>
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    newUserRole === 'pracownik' && styles.roleOptionActive,
                  ]}
                  onPress={() => setNewUserRole('pracownik')}
                >
                  <Ionicons name="person" size={20} color={newUserRole === 'pracownik' ? '#fff' : '#888'} />
                  <Text style={[
                    styles.roleOptionText,
                    newUserRole === 'pracownik' && styles.roleOptionTextActive,
                  ]}>Pracownik</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    newUserRole === 'admin' && styles.roleOptionActive,
                  ]}
                  onPress={() => setNewUserRole('admin')}
                >
                  <Ionicons name="shield" size={20} color={newUserRole === 'admin' ? '#fff' : '#888'} />
                  <Text style={[
                    styles.roleOptionText,
                    newUserRole === 'admin' && styles.roleOptionTextActive,
                  ]}>Administrator</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            
            <TouchableOpacity style={styles.submitButton} onPress={handleCreateUser}>
              <Ionicons name="person-add" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Utwórz użytkownika</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setPasswordModalVisible(false);
          setSelectedUser(null);
          setNewPassword('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resetuj hasło</Text>
              <TouchableOpacity onPress={() => {
                setPasswordModalVisible(false);
                setSelectedUser(null);
                setNewPassword('');
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {selectedUser && (
              <View style={styles.selectedUserInfo}>
                <Ionicons name="person-circle" size={40} color="#3b82f6" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.selectedUserName}>{selectedUser.name}</Text>
                  <Text style={styles.selectedUserEmail}>{selectedUser.email}</Text>
                </View>
              </View>
            )}
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nowe hasło</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimum 6 znaków"
                placeholderTextColor="#888"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
            </View>
            
            <TouchableOpacity style={styles.submitButton} onPress={handleResetPassword}>
              <Ionicons name="key" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Ustaw nowe hasło</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change My Password Modal */}
      <Modal
        visible={myPasswordModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setMyPasswordModalVisible(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Zmień swoje hasło</Text>
              <TouchableOpacity onPress={() => {
                setMyPasswordModalVisible(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Aktualne hasło</Text>
              <TextInput
                style={styles.input}
                placeholder="Podaj aktualne hasło"
                placeholderTextColor="#888"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
              
              <Text style={styles.inputLabel}>Nowe hasło</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimum 6 znaków"
                placeholderTextColor="#888"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              
              <Text style={styles.inputLabel}>Potwierdź nowe hasło</Text>
              <TextInput
                style={styles.input}
                placeholder="Powtórz nowe hasło"
                placeholderTextColor="#888"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </ScrollView>
            
            <TouchableOpacity style={styles.submitButton} onPress={handleChangeMyPassword}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Zmień hasło</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  addButton: {
    padding: 8,
  },
  quickActions: {
    padding: 16,
    paddingBottom: 0,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  quickActionText: {
    color: '#3b82f6',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
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
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
  userActions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#3b82f6',
    fontSize: 13,
    marginLeft: 6,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteButtonText: {
    color: '#ef4444',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  selectedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0a0a0a',
  },
  selectedUserName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedUserEmail: {
    color: '#888',
    fontSize: 13,
  },
  inputLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  roleSelect: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  roleOptionActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  roleOptionText: {
    color: '#888',
    fontSize: 14,
    marginLeft: 8,
  },
  roleOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    margin: 20,
    borderRadius: 12,
    paddingVertical: 16,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
