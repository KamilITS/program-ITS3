import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

interface Device {
  device_id: string;
  nazwa: string;
  numer_seryjny: string;
  kod_kreskowy?: string;
  kod_qr?: string;
  przypisany_do?: string;
  status: string;
  instalacja?: {
    adres?: string;
    data_instalacji?: string;
    rodzaj_zlecenia?: string;
    instalator_id?: string;
  };
}

interface Worker {
  user_id: string;
  name: string;
  email: string;
}

interface DeviceCategory {
  name: string;
  devices: Device[];
  expanded: boolean;
}

export default function Devices() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  // Single device assign modal
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  
  // Multi-select mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [bulkAssignModalVisible, setBulkAssignModalVisible] = useState(false);
  
  // Categories expanded state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  const loadData = async () => {
    try {
      const [devicesData, workersData] = await Promise.all([
        apiFetch('/api/devices'),
        apiFetch('/api/workers'),
      ]);
      setDevices(devicesData);
      setWorkers(workersData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Group devices by name (category)
  const categorizedDevices = useMemo(() => {
    const filtered = devices.filter((device) => {
      const matchesSearch =
        device.nazwa.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.numer_seryjny.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = !statusFilter || device.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const categoryMap = new Map<string, Device[]>();
    
    filtered.forEach((device) => {
      const categoryName = device.nazwa || 'Bez nazwy';
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, []);
      }
      categoryMap.get(categoryName)!.push(device);
    });

    // Sort categories alphabetically
    const sortedCategories = Array.from(categoryMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, devs]) => ({
        name,
        devices: devs.sort((a, b) => a.numer_seryjny.localeCompare(b.numer_seryjny)),
        count: devs.length,
        availableCount: devs.filter(d => d.status === 'dostepny').length,
      }));

    return sortedCategories;
  }, [devices, searchQuery, statusFilter]);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(deviceId)) {
        newSet.delete(deviceId);
      } else {
        newSet.add(deviceId);
      }
      return newSet;
    });
  };

  const selectAllInCategory = (category: { name: string; devices: Device[] }) => {
    const availableDevices = category.devices.filter(d => d.status === 'dostepny');
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      availableDevices.forEach(d => newSet.add(d.device_id));
      return newSet;
    });
  };

  const deselectAllInCategory = (category: { name: string; devices: Device[] }) => {
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      category.devices.forEach(d => newSet.delete(d.device_id));
      return newSet;
    });
  };

  const handleSingleAssign = async (workerId: string) => {
    if (!selectedDevice) return;
    
    try {
      await apiFetch(`/api/devices/${selectedDevice.device_id}/assign`, {
        method: 'POST',
        body: { worker_id: workerId },
      });
      
      Alert.alert('Sukces', 'Urządzenie zostało przypisane');
      setAssignModalVisible(false);
      setSelectedDevice(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const handleBulkAssign = async (workerId: string) => {
    if (selectedDevices.size === 0) return;
    
    try {
      await apiFetch('/api/devices/assign-multiple', {
        method: 'POST',
        body: { 
          device_ids: Array.from(selectedDevices),
          worker_id: workerId 
        },
      });
      
      Alert.alert('Sukces', `Przypisano ${selectedDevices.size} urządzeń`);
      setBulkAssignModalVisible(false);
      setSelectedDevices(new Set());
      setSelectionMode(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedDevices(new Set());
  };

  const statusFilters = [
    { key: null, label: 'Wszystkie' },
    { key: 'dostepny', label: 'Dostępne' },
    { key: 'przypisany', label: 'Przypisane' },
    { key: 'zainstalowany', label: 'Zainstalowane' },
  ];

  const isAdmin = user?.role === 'admin';

  const renderDeviceItem = (device: Device) => {
    const assignedWorker = workers.find((w) => w.user_id === device.przypisany_do);
    const isSelected = selectedDevices.has(device.device_id);
    const isAvailable = device.status === 'dostepny';

    return (
      <TouchableOpacity
        key={device.device_id}
        style={[
          styles.deviceItem,
          isSelected && styles.deviceItemSelected,
        ]}
        onPress={() => {
          if (selectionMode && isAvailable) {
            toggleDeviceSelection(device.device_id);
          } else if (isAdmin && isAvailable && !selectionMode) {
            setSelectedDevice(device);
            setAssignModalVisible(true);
          }
        }}
        onLongPress={() => {
          if (isAdmin && isAvailable && !selectionMode) {
            setSelectionMode(true);
            toggleDeviceSelection(device.device_id);
          }
        }}
      >
        {selectionMode && (
          <View style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
            !isAvailable && styles.checkboxDisabled,
          ]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
        )}
        
        <View style={styles.deviceItemInfo}>
          <Text style={styles.deviceSerial}>{device.numer_seryjny}</Text>
          {device.kod_kreskowy && (
            <Text style={styles.deviceCode}>Kod: {device.kod_kreskowy}</Text>
          )}
          {assignedWorker && (
            <View style={styles.assignedBadge}>
              <Ionicons name="person" size={12} color="#3b82f6" />
              <Text style={styles.assignedName}>{assignedWorker.name}</Text>
            </View>
          )}
        </View>
        
        <View
          style={[
            styles.statusDot,
            device.status === 'dostepny' && { backgroundColor: '#10b981' },
            device.status === 'przypisany' && { backgroundColor: '#3b82f6' },
            device.status === 'zainstalowany' && { backgroundColor: '#f59e0b' },
          ]}
        />
      </TouchableOpacity>
    );
  };

  const renderCategory = ({ item: category }: { item: { name: string; devices: Device[]; count: number; availableCount: number } }) => {
    const isExpanded = expandedCategories.has(category.name);
    const selectedInCategory = category.devices.filter(d => selectedDevices.has(d.device_id)).length;

    return (
      <View style={styles.categoryContainer}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => toggleCategory(category.name)}
        >
          <View style={styles.categoryIcon}>
            <Ionicons name="folder" size={24} color="#3b82f6" />
          </View>
          
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName} numberOfLines={1}>{category.name}</Text>
            <Text style={styles.categoryCount}>
              {category.count} szt. ({category.availableCount} dostępnych)
            </Text>
          </View>
          
          {selectionMode && selectedInCategory > 0 && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>{selectedInCategory}</Text>
            </View>
          )}
          
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#888"
          />
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.categoryContent}>
            {/* Quick select buttons for admin in selection mode */}
            {isAdmin && selectionMode && category.availableCount > 0 && (
              <View style={styles.quickSelectRow}>
                <TouchableOpacity
                  style={styles.quickSelectButton}
                  onPress={() => selectAllInCategory(category)}
                >
                  <Ionicons name="checkbox" size={16} color="#10b981" />
                  <Text style={styles.quickSelectText}>Zaznacz wszystkie ({category.availableCount})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickSelectButton}
                  onPress={() => deselectAllInCategory(category)}
                >
                  <Ionicons name="square-outline" size={16} color="#888" />
                  <Text style={styles.quickSelectText}>Odznacz</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {category.devices.map(renderDeviceItem)}
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
        <Text style={styles.title}>Urządzenia</Text>
        {isAdmin && !selectionMode && (
          <TouchableOpacity 
            onPress={() => setSelectionMode(true)} 
            style={styles.selectButton}
          >
            <Ionicons name="checkbox-outline" size={24} color="#3b82f6" />
          </TouchableOpacity>
        )}
        {selectionMode && (
          <TouchableOpacity onPress={cancelSelection} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Anuluj</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selection mode header */}
      {selectionMode && (
        <View style={styles.selectionHeader}>
          <Text style={styles.selectionText}>
            Wybrano: {selectedDevices.size} urządzeń
          </Text>
          <TouchableOpacity
            style={[
              styles.assignSelectedButton,
              selectedDevices.size === 0 && styles.assignSelectedButtonDisabled,
            ]}
            onPress={() => {
              if (selectedDevices.size > 0) {
                setBulkAssignModalVisible(true);
              }
            }}
            disabled={selectedDevices.size === 0}
          >
            <Ionicons name="person-add" size={20} color="#fff" />
            <Text style={styles.assignSelectedButtonText}>Przypisz wybrane</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj urządzenia..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContainer}
      >
        {statusFilters.map((filter) => (
          <TouchableOpacity
            key={filter.key || 'all'}
            style={[
              styles.filterButton,
              statusFilter === filter.key && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter(filter.key)}
          >
            <Text
              style={[
                styles.filterText,
                statusFilter === filter.key && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{categorizedDevices.length}</Text>
          <Text style={styles.statLabel}>Kategorii</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{devices.length}</Text>
          <Text style={styles.statLabel}>Urządzeń</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>
            {devices.filter(d => d.status === 'dostepny').length}
          </Text>
          <Text style={styles.statLabel}>Dostępnych</Text>
        </View>
      </View>

      {/* Categories List */}
      <FlatList
        data={categorizedDevices}
        renderItem={renderCategory}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>Brak urządzeń</Text>
          </View>
        }
      />

      {/* Single Assign Modal */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Przypisz do pracownika</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {selectedDevice && (
              <View style={styles.modalDeviceInfo}>
                <Text style={styles.modalDeviceName}>{selectedDevice.nazwa}</Text>
                <Text style={styles.modalDeviceSerial}>{selectedDevice.numer_seryjny}</Text>
              </View>
            )}
            
            <FlatList
              data={workers}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.workerItem}
                  onPress={() => handleSingleAssign(item.user_id)}
                >
                  <View style={styles.workerAvatar}>
                    <Ionicons name="person" size={24} color="#fff" />
                  </View>
                  <View style={styles.workerInfo}>
                    <Text style={styles.workerName}>{item.name}</Text>
                    <Text style={styles.workerEmail}>{item.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#888" />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.user_id}
              ListEmptyComponent={
                <Text style={styles.noWorkersText}>Brak pracowników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Bulk Assign Modal */}
      <Modal
        visible={bulkAssignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBulkAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Przypisz {selectedDevices.size} urządzeń</Text>
              <TouchableOpacity onPress={() => setBulkAssignModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.bulkSummary}>
              <Ionicons name="cube" size={32} color="#3b82f6" />
              <Text style={styles.bulkSummaryText}>
                Wybrano {selectedDevices.size} urządzeń do przypisania
              </Text>
            </View>
            
            <Text style={styles.selectWorkerLabel}>Wybierz pracownika:</Text>
            
            <FlatList
              data={workers}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.workerItem}
                  onPress={() => handleBulkAssign(item.user_id)}
                >
                  <View style={styles.workerAvatar}>
                    <Ionicons name="person" size={24} color="#fff" />
                  </View>
                  <View style={styles.workerInfo}>
                    <Text style={styles.workerName}>{item.name}</Text>
                    <Text style={styles.workerEmail}>{item.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#888" />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.user_id}
              ListEmptyComponent={
                <Text style={styles.noWorkersText}>Brak pracowników</Text>
              }
            />
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
  selectButton: {
    padding: 8,
  },
  cancelButton: {
    padding: 8,
  },
  cancelButtonText: {
    color: '#ef4444',
    fontSize: 16,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectionText: {
    color: '#fff',
    fontSize: 14,
  },
  assignSelectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  assignSelectedButtonDisabled: {
    backgroundColor: '#333',
  },
  assignSelectedButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 14,
  },
  filtersScroll: {
    maxHeight: 50,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    color: '#888',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  categoryContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  categoryName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryCount: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  selectedBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  selectedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryContent: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingTop: 8,
    paddingBottom: 8,
  },
  quickSelectRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  quickSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickSelectText: {
    color: '#888',
    fontSize: 12,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  deviceItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3b82f6',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3b82f6',
  },
  checkboxDisabled: {
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  deviceItemInfo: {
    flex: 1,
  },
  deviceSerial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  deviceCode: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  assignedName: {
    color: '#3b82f6',
    fontSize: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  modalDeviceInfo: {
    padding: 20,
    backgroundColor: '#0a0a0a',
  },
  modalDeviceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalDeviceSerial: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  bulkSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0a0a0a',
    gap: 16,
  },
  bulkSummaryText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  selectWorkerLabel: {
    color: '#888',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  workerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  workerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  workerName: {
    color: '#fff',
    fontSize: 16,
  },
  workerEmail: {
    color: '#888',
    fontSize: 13,
  },
  noWorkersText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
});
