import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useNotifications } from '../src/context/NotificationContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Stats {
  total: number;
  by_type: Record<string, number>;
  by_user: Record<string, number>;
  daily: Array<{ _id: string; count: number }>;
}

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { unreadChatCount } = useNotifications();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [devicesCount, setDevicesCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [newTasksAlert, setNewTasksAlert] = useState<{count: number, titles: string[]} | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  const checkForNewTasks = async (tasks: any[]) => {
    // Only check for workers (not admins)
    if (user?.role === 'admin') return;
    
    const lastCheckTimestamp = await AsyncStorage.getItem(`lastTaskCheck_${user?.user_id}`);
    const myPendingTasks = tasks.filter((t: any) => 
      t.status !== 'zakonczone' && t.assigned_to === user?.user_id
    );
    
    // If no pending tasks, nothing to show
    if (myPendingTasks.length === 0) return;
    
    if (lastCheckTimestamp) {
      const lastCheck = new Date(lastCheckTimestamp);
      // Show tasks created after last check
      const newTasks = myPendingTasks.filter((t: any) => {
        const taskCreated = new Date(t.created_at);
        return taskCreated > lastCheck;
      });
      
      if (newTasks.length > 0) {
        setNewTasksAlert({
          count: newTasks.length,
          titles: newTasks.slice(0, 3).map((t: any) => t.title)
        });
      }
    } else {
      // First time login - show all pending tasks as "new"
      setNewTasksAlert({
        count: myPendingTasks.length,
        titles: myPendingTasks.slice(0, 3).map((t: any) => t.title)
      });
    }
  };

  const dismissNewTasksAlert = async () => {
    await AsyncStorage.setItem(`lastTaskCheck_${user?.user_id}`, new Date().toISOString());
    setNewTasksAlert(null);
  };

  const loadData = async () => {
    try {
      const [statsData, devices, tasks] = await Promise.all([
        apiFetch('/api/installations/stats'),
        apiFetch('/api/devices'),
        apiFetch('/api/tasks'),
      ]);
      setStats(statsData);
      setDevicesCount(devices.length);
      
      // Count pending tasks (not completed)
      const pending = tasks.filter((t: any) => t.status !== 'zakonczone').length;
      setTasksCount(pending);
      setPendingTasks(pending);
      
      // Check for new tasks (only for workers)
      await checkForNewTasks(tasks);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        loadData();
      }
    }, [isAuthenticated])
  );

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      
      // Poll for updates every 10 seconds (for chat notifications)
      const interval = setInterval(loadData, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (isLoading || !user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Ładowanie...</Text>
      </View>
    );
  }

  const isAdmin = user.role === 'admin';

  const renderBadge = (count: number) => {
    if (count <= 0) return null;
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Witaj,</Text>
          <Text style={styles.userName}>{user.name}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{isAdmin ? 'Admin' : 'Pracownik'}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      >
        {/* Quick Stats - only for admin */}
        {isAdmin && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="cube-outline" size={32} color="#3b82f6" />
              <Text style={styles.statNumber}>{devicesCount}</Text>
              <Text style={styles.statLabel}>Urządzenia</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="checkmark-circle-outline" size={32} color="#10b981" />
              <Text style={styles.statNumber}>{stats?.total || 0}</Text>
              <Text style={styles.statLabel}>Instalacje</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="clipboard-outline" size={32} color="#f59e0b" />
              <Text style={styles.statNumber}>{tasksCount}</Text>
              <Text style={styles.statLabel}>Zadania</Text>
            </View>
          </View>
        )}

        {/* New Tasks Alert - for workers */}
        {newTasksAlert && (
          <TouchableOpacity 
            style={styles.newTasksAlert}
            onPress={() => {
              dismissNewTasksAlert();
              router.push('/tasks');
            }}
          >
            <View style={styles.newTasksAlertIcon}>
              <Ionicons name="notifications" size={24} color="#fff" />
            </View>
            <View style={styles.newTasksAlertContent}>
              <Text style={styles.newTasksAlertTitle}>
                🔔 Masz {newTasksAlert.count} {newTasksAlert.count === 1 ? 'nowe zadanie' : 'nowe zadania'}!
              </Text>
              <Text style={styles.newTasksAlertSubtitle}>
                {newTasksAlert.titles.join(', ')}{newTasksAlert.count > 3 ? '...' : ''}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.newTasksAlertClose}
              onPress={dismissNewTasksAlert}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* Installation Types - only for admin */}
        {isAdmin && stats && Object.keys(stats.by_type).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Typy zleceń</Text>
            <View style={styles.typesList}>
              {Object.entries(stats.by_type).map(([type, count]) => (
                <View key={type} style={styles.typeItem}>
                  <View style={[
                    styles.typeIcon,
                    type === 'instalacja' && { backgroundColor: '#10b981' },
                    type === 'wymiana' && { backgroundColor: '#3b82f6' },
                    type === 'awaria' && { backgroundColor: '#ef4444' },
                    type === 'uszkodzony' && { backgroundColor: '#f59e0b' },
                  ]}>
                    <Ionicons
                      name={
                        type === 'instalacja' ? 'add-circle' :
                        type === 'wymiana' ? 'swap-horizontal' :
                        type === 'awaria' ? 'warning' : 'alert-circle'
                      }
                      size={20}
                      color="#fff"
                    />
                  </View>
                  <Text style={styles.typeName}>{type}</Text>
                  <Text style={styles.typeCount}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Szybkie akcje</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/scanner')}
            >
              <Ionicons name="scan-outline" size={32} color="#3b82f6" />
              <Text style={styles.actionText}>Skanuj</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/devices')}
            >
              <Ionicons name="hardware-chip-outline" size={32} color="#10b981" />
              <Text style={styles.actionText}>Urządzenia</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={async () => {
                // Mark messages as read when entering chat
                await AsyncStorage.setItem('lastReadMessageTimestamp', new Date().toISOString());
                router.push('/chat');
              }}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons name="chatbubbles-outline" size={32} color="#8b5cf6" />
                {renderBadge(unreadChatCount)}
              </View>
              <Text style={styles.actionText}>Czat</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/tasks')}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons name="calendar-outline" size={32} color="#f59e0b" />
                {renderBadge(pendingTasks)}
              </View>
              <Text style={styles.actionText}>Zadania</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Admin Actions */}
        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Panel administratora</Text>
            <View style={styles.adminActions}>
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => router.push('/users')}
              >
                <Ionicons name="people-outline" size={24} color="#fff" />
                <Text style={styles.adminButtonText}>Zarządzaj pracownikami</Text>
                <Ionicons name="chevron-forward" size={20} color="#888" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.adminButton, { borderColor: '#10b981', borderWidth: 1 }]}
                onPress={() => router.push('/assign')}
              >
                <Ionicons name="scan" size={24} color="#10b981" />
                <Text style={[styles.adminButtonText, { color: '#10b981' }]}>Przypisz urządzenie (skaner)</Text>
                <Ionicons name="chevron-forward" size={20} color="#10b981" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => router.push('/devices?view=inventory')}
              >
                <Ionicons name="layers-outline" size={24} color="#fff" />
                <Text style={styles.adminButtonText}>Stany magazynowe pracowników</Text>
                <Ionicons name="chevron-forward" size={20} color="#888" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => router.push('/import')}
              >
                <Ionicons name="add-circle-outline" size={24} color="#fff" />
                <Text style={styles.adminButtonText}>Dodaj urządzenia do magazynu</Text>
                <Ionicons name="chevron-forward" size={20} color="#888" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => router.push('/backup')}
              >
                <Ionicons name="cloud-download-outline" size={24} color="#fff" />
                <Text style={styles.adminButtonText}>Kopie zapasowe</Text>
                <Ionicons name="chevron-forward" size={20} color="#888" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.adminButton, { borderColor: '#f59e0b', borderWidth: 1 }]}
                onPress={() => router.push('/returns')}
              >
                <Ionicons name="arrow-undo-outline" size={24} color="#f59e0b" />
                <Text style={[styles.adminButtonText, { color: '#f59e0b' }]}>Zwrot urządzeń</Text>
                <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => router.push('/stats')}
              >
                <Ionicons name="stats-chart-outline" size={24} color="#fff" />
                <Text style={styles.adminButtonText}>Statystyki</Text>
                <Ionicons name="chevron-forward" size={20} color="#888" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Version Footer */}
        <View style={styles.versionFooter}>
          <Ionicons name="git-branch-outline" size={14} color="#444" />
          <Text style={styles.versionText}>
            Wersja: 2.1.0 | Zapisano: 08.02.2026, 23:16
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  welcomeText: {
    color: '#888',
    fontSize: 14,
  },
  userName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  typesList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeName: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
    textTransform: 'capitalize',
  },
  typeCount: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  actionIconContainer: {
    position: 'relative',
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  adminActions: {
    gap: 8,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  adminButtonText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  // New Tasks Alert Styles
  newTasksAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  newTasksAlertIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newTasksAlertContent: {
    flex: 1,
    marginLeft: 12,
  },
  newTasksAlertTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  newTasksAlertSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  newTasksAlertClose: {
    padding: 8,
  },
  versionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 6,
    marginTop: 10,
  },
  versionText: {
    color: '#444',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
