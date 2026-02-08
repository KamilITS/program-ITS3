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
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface User {
  user_id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_login_at?: string;
  last_login_ip?: string;
  last_login_device?: string;
}

interface ActivityLog {
  log_id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action_type: string;
  action_description: string;
  device_serial?: string;
  device_name?: string;
  device_id?: string;
  task_id?: string;
  target_user_id?: string;
  target_user_name?: string;
  details?: any;
  ip_address?: string;
}

export default function Users() {
  const { user, isAuthenticated, isLoading, changePassword } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal states
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [myPasswordModalVisible, setMyPasswordModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Activity logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  
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

  const loadUserActivityLogs = async (userId: string) => {
    setActivityLoading(true);
    try {
      const data = await apiFetch(`/api/activity-logs/user/${userId}?limit=100`);
      setActivityLogs(data);
    } catch (error) {
      console.error('Error loading activity logs:', error);
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const openActivityModal = (selectedUser: User) => {
    setSelectedUser(selectedUser);
    setActivityModalVisible(true);
    loadUserActivityLogs(selectedUser.user_id);
  };

  const getActionTypeIcon = (actionType: string) => {
    switch (actionType) {
      case 'login': return 'log-in-outline';
      case 'logout': return 'log-out-outline';
      case 'device_install': return 'hardware-chip-outline';
      case 'device_assign': return 'arrow-forward-circle-outline';
      case 'device_add': return 'add-circle-outline';
      case 'device_import': return 'cloud-download-outline';
      case 'device_scan': return 'scan-outline';
      case 'device_return': return 'return-down-back-outline';
      case 'device_damage': return 'warning-outline';
      case 'device_restore': return 'refresh-outline';
      case 'device_transfer': return 'swap-horizontal-outline';
      case 'task_create': return 'create-outline';
      case 'task_complete': return 'checkmark-circle-outline';
      default: return 'ellipse-outline';
    }
  };

  const getActionTypeColor = (actionType: string) => {
    switch (actionType) {
      case 'login': return '#10b981';
      case 'logout': return '#888';
      case 'device_install': return '#3b82f6';
      case 'device_assign': return '#f59e0b';
      case 'device_add': return '#10b981';
      case 'device_import': return '#10b981';
      case 'device_scan': return '#8b5cf6';
      case 'device_return': return '#ef4444';
      case 'device_damage': return '#ef4444';
      case 'device_restore': return '#3b82f6';
      case 'device_transfer': return '#8b5cf6';
      case 'task_create': return '#ec4899';
      case 'task_complete': return '#10b981';
      default: return '#888';
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

  const parseDeviceName = (userAgent: string): string => {
    if (!userAgent || userAgent === 'nieznany') return 'Nieznane urządzenie';
    
    // Check for mobile devices
    if (/iPhone/i.test(userAgent)) return 'iPhone';
    if (/iPad/i.test(userAgent)) return 'iPad';
    if (/Android/i.test(userAgent)) {
      if (/Mobile/i.test(userAgent)) return 'Android (telefon)';
      return 'Android (tablet)';
    }
    
    // Check for browsers on desktop
    if (/Windows/i.test(userAgent)) {
      if (/Edge/i.test(userAgent)) return 'Windows (Edge)';
      if (/Chrome/i.test(userAgent)) return 'Windows (Chrome)';
      if (/Firefox/i.test(userAgent)) return 'Windows (Firefox)';
      return 'Windows';
    }
    if (/Macintosh/i.test(userAgent)) {
      if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return 'Mac (Safari)';
      if (/Chrome/i.test(userAgent)) return 'Mac (Chrome)';
      return 'Mac';
    }
    if (/Linux/i.test(userAgent)) return 'Linux';
    
    return 'Przeglądarka';
  };

  const renderUser = ({ item }: { item: User }) => {
    const isCurrentUser = item.user_id === user?.user_id;
    const lastLoginDate = item.last_login_at ? new Date(item.last_login_at) : null;
    const deviceName = parseDeviceName(item.last_login_device || '');
    
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
        
        {/* Last Login Info */}
        <View style={styles.loginInfoSection}>
          <Text style={styles.loginInfoTitle}>Ostatnie logowanie</Text>
          {lastLoginDate ? (
            <View style={styles.loginInfoGrid}>
              <View style={styles.loginInfoItem}>
                <Ionicons name="time-outline" size={16} color="#3b82f6" />
                <Text style={styles.loginInfoText}>
                  {format(lastLoginDate, 'd MMM yyyy, HH:mm', { locale: pl })}
                </Text>
              </View>
              {item.last_login_ip && (
                <View style={styles.loginInfoItem}>
                  <Ionicons name="globe-outline" size={16} color="#10b981" />
                  <Text style={styles.loginInfoText}>{item.last_login_ip}</Text>
                </View>
              )}
              <View style={styles.loginInfoItem}>
                <Ionicons name="phone-portrait-outline" size={16} color="#f59e0b" />
                <Text style={styles.loginInfoText}>{deviceName}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noLoginText}>Jeszcze się nie logował</Text>
          )}
        </View>
        
        {!isCurrentUser && (
          <View style={styles.userActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openActivityModal(item)}
            >
              <Ionicons name="time-outline" size={18} color="#8b5cf6" />
              <Text style={[styles.actionButtonText, { color: '#8b5cf6' }]}>Historia</Text>
            </TouchableOpacity>
            
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

      {/* Activity History Modal */}
      <Modal
        visible={activityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActivityModalVisible(false);
          setActivityLogs([]);
          setSelectedUser(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%', flex: 0 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historia aktywności</Text>
              <TouchableOpacity onPress={() => {
                setActivityModalVisible(false);
                setActivityLogs([]);
                setSelectedUser(null);
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {selectedUser && (
              <View style={styles.activityUserInfo}>
                <Ionicons name="person-circle" size={32} color="#8b5cf6" />
                <Text style={styles.activityUserName}>{selectedUser.name}</Text>
              </View>
            )}
            
            {activityLoading ? (
              <View style={styles.activityLoading}>
                <Text style={styles.loadingText}>Ładowanie historii...</Text>
              </View>
            ) : activityLogs.length === 0 ? (
              <View style={styles.activityEmpty}>
                <Ionicons name="document-text-outline" size={48} color="#666" />
                <Text style={styles.emptyText}>Brak zarejestrowanych aktywności</Text>
              </View>
            ) : (
              <View style={{ flex: 1, minHeight: 300 }}>
                <View style={styles.historyTimelineHeader}>
                  <Text style={styles.historyTimelineTitle}>Oś czasu ({activityLogs.length} zdarzeń)</Text>
                </View>
                <ScrollView 
                  style={{ flex: 1 }} 
                  contentContainerStyle={{ paddingBottom: 20 }}
                  showsVerticalScrollIndicator={true}
                >
                  {activityLogs.map((item, index) => (
                    <View key={item.log_id} style={styles.activityItem}>
                      <View style={styles.timelineLine}>
                        <View style={[styles.timelineDot, { backgroundColor: getActionTypeColor(item.action_type) }]} />
                        {index < activityLogs.length - 1 && <View style={styles.timelineConnector} />}
                      </View>
                      <View style={styles.activityContent}>
                        <Text style={styles.activityDescription}>{item.action_description}</Text>
                        <View style={styles.activityMeta}>
                          <Ionicons name="time-outline" size={12} color="#888" />
                          <Text style={styles.activityTime}>
                            {format(new Date(item.timestamp), 'd MMM yyyy, HH:mm', { locale: pl })}
                          </Text>
                        </View>
                        {item.device_serial && (
                          <View style={styles.activityMeta}>
                            <Ionicons name="barcode-outline" size={12} color="#3b82f6" />
                            <Text style={styles.activitySerial}>{item.device_serial}</Text>
                          </View>
                        )}
                        {item.details?.adres_klienta && (
                          <View style={styles.activityMeta}>
                            <Ionicons name="location-outline" size={12} color="#10b981" />
                            <Text style={styles.activityAddress} numberOfLines={2}>{item.details.adres_klienta}</Text>
                          </View>
                        )}
                        {item.target_user_name && (
                          <View style={styles.activityMeta}>
                            <Ionicons name="person-outline" size={12} color="#f59e0b" />
                            <Text style={styles.activityTarget}>Przypisano do: {item.target_user_name}</Text>
                          </View>
                        )}
                        {item.ip_address && item.action_type === 'login' && (
                          <View style={styles.activityMeta}>
                            <Ionicons name="globe-outline" size={12} color="#888" />
                            <Text style={styles.activityIp}>{item.ip_address}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
              />
            )}
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
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
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
  loginInfoSection: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  loginInfoTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  loginInfoGrid: {
    gap: 8,
  },
  loginInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginInfoText: {
    color: '#fff',
    fontSize: 13,
  },
  noLoginText: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
  },
  // Activity History Styles
  activityUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    gap: 12,
  },
  activityUserName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  activityLoading: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  activityEmpty: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  activityList: {
    flex: 1,
  },
  activityItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityDescription: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  activityTime: {
    color: '#888',
    fontSize: 12,
  },
  activitySerial: {
    color: '#3b82f6',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  activityIp: {
    color: '#888',
    fontSize: 11,
  },
  activityAddress: {
    color: '#10b981',
    fontSize: 12,
    flex: 1,
  },
  activityTarget: {
    color: '#f59e0b',
    fontSize: 12,
  },
});
