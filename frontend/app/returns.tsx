import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface DeviceReturn {
  return_id: string;
  device_serial: string;
  device_type: string;
  device_status: string;
  scanned_at: string;
  scanned_by: string;
  scanned_by_name: string;
  returned_to_warehouse?: boolean;
}

const DEVICE_TYPES = ['ONT', 'CPE', 'STB'];
const DEVICE_STATUSES = ['z awarii', 'nowy/uszkodzony'];
const SORT_OPTIONS = [
  { key: 'date_desc', label: 'Data (najnowsze)' },
  { key: 'date_asc', label: 'Data (najstarsze)' },
  { key: 'type', label: 'Rodzaj urządzenia' },
];

export default function Returns() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [returns, setReturns] = useState<DeviceReturn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'returned'>('pending');
  
  // Sorting
  const [sortBy, setSortBy] = useState('date_desc');
  
  // Form state
  const [deviceSerial, setDeviceSerial] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [deviceStatus, setDeviceStatus] = useState('');
  
  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingReturn, setEditingReturn] = useState<DeviceReturn | null>(null);
  
  // Stats
  const [stats, setStats] = useState({ total: 0, pending: 0, returned: 0, byType: {} as Record<string, number>, byStatus: {} as Record<string, number> });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
    if (!isLoading && user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user]);

  // Load last selections from storage
  useEffect(() => {
    const loadLastSelections = async () => {
      try {
        const lastType = await AsyncStorage.getItem('returns_last_type');
        const lastStatus = await AsyncStorage.getItem('returns_last_status');
        if (lastType) setDeviceType(lastType);
        if (lastStatus) setDeviceStatus(lastStatus);
      } catch (error) {
        console.error('Error loading last selections:', error);
      }
    };
    loadLastSelections();
  }, []);

  const loadReturns = async () => {
    try {
      const data = await apiFetch('/api/returns');
      setReturns(data);
      
      // Calculate stats
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      let pending = 0;
      let returned = 0;
      
      data.forEach((r: DeviceReturn) => {
        byType[r.device_type] = (byType[r.device_type] || 0) + 1;
        byStatus[r.device_status] = (byStatus[r.device_status] || 0) + 1;
        if (r.returned_to_warehouse) {
          returned++;
        } else {
          pending++;
        }
      });
      setStats({ total: data.length, pending, returned, byType, byStatus });
    } catch (error) {
      console.error('Error loading returns:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      loadReturns();
    }
  }, [isAuthenticated, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReturns();
    setRefreshing(false);
  };

  const saveLastSelections = async (type: string, status: string) => {
    try {
      if (type) await AsyncStorage.setItem('returns_last_type', type);
      if (status) await AsyncStorage.setItem('returns_last_status', status);
    } catch (error) {
      console.error('Error saving last selections:', error);
    }
  };

  const handleAddReturn = async () => {
    if (!deviceSerial.trim()) {
      Alert.alert('Błąd', 'Wprowadź numer seryjny urządzenia');
      return;
    }
    if (!deviceType) {
      Alert.alert('Błąd', 'Wybierz rodzaj urządzenia');
      return;
    }
    if (!deviceStatus) {
      Alert.alert('Błąd', 'Wybierz stan urządzenia');
      return;
    }

    try {
      await apiFetch('/api/returns', {
        method: 'POST',
        body: {
          device_serial: deviceSerial.trim(),
          device_type: deviceType,
          device_status: deviceStatus,
        },
      });
      
      // Save last selections
      await saveLastSelections(deviceType, deviceStatus);
      
      setDeviceSerial('');
      setAddModalVisible(false);
      loadReturns();
      
      if (Platform.OS === 'web') {
        window.alert('Urządzenie dodane do zwrotów');
      } else {
        Alert.alert('Sukces', 'Urządzenie dodane do zwrotów');
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const handleDeleteReturn = async (returnId: string) => {
    const doDelete = async () => {
      try {
        await apiFetch(`/api/returns/${returnId}`, { method: 'DELETE' });
        loadReturns();
      } catch (error: any) {
        Alert.alert('Błąd', error.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Czy na pewno chcesz usunąć ten wpis?')) {
        doDelete();
      }
    } else {
      Alert.alert('Usuń wpis', 'Czy na pewno chcesz usunąć ten wpis?', [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleUpdateReturn = async () => {
    if (!editingReturn) return;
    
    try {
      await apiFetch(`/api/returns/${editingReturn.return_id}`, {
        method: 'PUT',
        body: {
          device_type: deviceType,
          device_status: deviceStatus,
        },
      });
      
      setEditModalVisible(false);
      setEditingReturn(null);
      loadReturns();
      
      Alert.alert('Sukces', 'Wpis zaktualizowany');
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/returns/export', {
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('session_token')}`,
        },
      });
      
      if (!response.ok) throw new Error('Błąd eksportu');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zwroty_urzadzen_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Move exported items to "returned to warehouse"
      await apiFetch('/api/returns/mark-returned', {
        method: 'POST',
        body: {},
      });
      
      loadReturns();
      setActiveTab('returned');
      
      Alert.alert('Sukces', 'Plik został pobrany. Urządzenia przeniesione do zakładki "Zwrócone do magazynu"');
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  // Sort and filter returns
  const filteredReturns = returns
    .filter((r) => activeTab === 'pending' ? !r.returned_to_warehouse : r.returned_to_warehouse)
    .sort((a, b) => {
      if (sortBy === 'date_desc') {
        return new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime();
      } else if (sortBy === 'date_asc') {
        return new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime();
      } else if (sortBy === 'type') {
        return (a.device_type || '').localeCompare(b.device_type || '');
      }
      return 0;
    });

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setDeviceSerial(data);
    setScannerActive(false);
  };

  const openEditModal = (item: DeviceReturn) => {
    setEditingReturn(item);
    setDeviceType(item.device_type);
    setDeviceStatus(item.device_status);
    setEditModalVisible(true);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd-MM-yyyy', { locale: pl });
    } catch {
      return dateStr;
    }
  };

  const renderReturnItem = ({ item }: { item: DeviceReturn }) => (
    <View style={styles.returnCard}>
      <View style={styles.returnHeader}>
        <View style={styles.serialContainer}>
          <Ionicons name="barcode-outline" size={20} color="#3b82f6" />
          <Text style={styles.serialText}>{item.device_serial}</Text>
        </View>
        {!item.returned_to_warehouse && (
          <View style={styles.returnActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => openEditModal(item)}
            >
              <Ionicons name="pencil" size={18} color="#f59e0b" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteReturn(item.return_id)}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      <View style={styles.returnDetails}>
        <View style={styles.detailRow}>
          <View style={[styles.typeBadge, !item.device_type && styles.typeBadgeEmpty]}>
            <Text style={styles.typeBadgeText}>
              {item.device_type || 'Brak rodzaju'}
            </Text>
          </View>
          <View style={[
            styles.statusBadge,
            item.device_status === 'z awarii' && styles.statusBadgeWarning,
            item.device_status === 'nowy/uszkodzony' && styles.statusBadgeDanger,
          ]}>
            <Text style={styles.statusBadgeText}>{item.device_status}</Text>
          </View>
        </View>
        
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color="#888" />
          <Text style={styles.metaText}>{formatDate(item.scanned_at)}</Text>
          <Ionicons name="person-outline" size={14} color="#888" style={{ marginLeft: 12 }} />
          <Text style={styles.metaText}>{item.scanned_by_name}</Text>
        </View>
      </View>
    </View>
  );

  // Scanner view
  if (scannerActive) {
    if (!permission?.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>Potrzebny dostęp do kamery</Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Udziel dostępu</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.permissionButton, { backgroundColor: '#333' }]} 
              onPress={() => setScannerActive(false)}
            >
              <Text style={styles.permissionButtonText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.scannerHeader}>
          <TouchableOpacity onPress={() => setScannerActive(false)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.scannerTitle}>Skanuj kod</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93'],
            }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
          </View>
        </View>
        
        <Text style={styles.scannerHint}>Skieruj kamerę na kod kreskowy lub QR</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Zwrot urządzeń</Text>
        <TouchableOpacity onPress={() => setAddModalVisible(true)} style={styles.addButton}>
          <Ionicons name="add" size={28} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Do zwrotu ({stats.pending})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'returned' && styles.tabActive]}
          onPress={() => setActiveTab('returned')}
        >
          <Text style={[styles.tabText, activeTab === 'returned' && styles.tabTextActive]}>
            Zwrócone do magazynu ({stats.returned})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sorting */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sortuj:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.sortButton, sortBy === option.key && styles.sortButtonActive]}
              onPress={() => setSortBy(option.key)}
            >
              <Text style={[styles.sortButtonText, sortBy === option.key && styles.sortButtonTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Export Button - only for pending items */}
      {Platform.OS === 'web' && activeTab === 'pending' && filteredReturns.length > 0 && (
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Ionicons name="download-outline" size={20} color="#fff" />
          <Text style={styles.exportButtonText}>Eksportuj do Excel i przenieś do zwróconych</Text>
        </TouchableOpacity>
      )}

      {/* Returns List */}
      <FlatList
        data={filteredReturns}
        renderItem={renderReturnItem}
        keyExtractor={(item) => item.return_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>
              {activeTab === 'pending' ? 'Brak zwrotów do przetworzenia' : 'Brak zwróconych urządzeń'}
            </Text>
            {activeTab === 'pending' && (
              <Text style={styles.emptySubtext}>Dodaj pierwsze urządzenie</Text>
            )}
          </View>
        }
      />

      {/* Add Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dodaj zwrot</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Numer seryjny / Kod</Text>
              <View style={styles.serialInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Wprowadź lub zeskanuj..."
                  placeholderTextColor="#888"
                  value={deviceSerial}
                  onChangeText={setDeviceSerial}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => {
                    setAddModalVisible(false);
                    setScannerActive(true);
                  }}
                >
                  <Ionicons name="scan" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Rodzaj urządzenia</Text>
              <View style={styles.optionsRow}>
                {DEVICE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.optionButton,
                      deviceType === type && styles.optionButtonActive,
                    ]}
                    onPress={() => setDeviceType(type)}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      deviceType === type && styles.optionButtonTextActive,
                    ]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Stan</Text>
              <View style={styles.optionsRow}>
                {DEVICE_STATUSES.map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.optionButton,
                      deviceStatus === status && styles.optionButtonActive,
                      status === 'z awarii' && deviceStatus === status && styles.optionButtonWarning,
                      status === 'nowy/uszkodzony' && deviceStatus === status && styles.optionButtonDanger,
                    ]}
                    onPress={() => setDeviceStatus(status)}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      deviceStatus === status && styles.optionButtonTextActive,
                    ]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.autoDateRow}>
                <Ionicons name="calendar" size={18} color="#10b981" />
                <Text style={styles.autoDateText}>
                  Data: {format(new Date(), 'd MMM yyyy, HH:mm', { locale: pl })}
                </Text>
                <Text style={styles.autoDateHint}>(automatycznie)</Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.submitButton} onPress={handleAddReturn}>
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Dodaj do zwrotów</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edytuj wpis</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {editingReturn && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.editSerialInfo}>
                  <Ionicons name="barcode-outline" size={24} color="#3b82f6" />
                  <Text style={styles.editSerialText}>{editingReturn.device_serial}</Text>
                </View>

                <Text style={styles.inputLabel}>Rodzaj urządzenia</Text>
                <View style={styles.optionsRow}>
                  {DEVICE_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.optionButton,
                        deviceType === type && styles.optionButtonActive,
                      ]}
                      onPress={() => setDeviceType(type)}
                    >
                      <Text style={[
                        styles.optionButtonText,
                        deviceType === type && styles.optionButtonTextActive,
                      ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Stan</Text>
                <View style={styles.optionsRow}>
                  {DEVICE_STATUSES.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.optionButton,
                        deviceStatus === status && styles.optionButtonActive,
                        status === 'z awarii' && deviceStatus === status && styles.optionButtonWarning,
                        status === 'nowy/uszkodzony' && deviceStatus === status && styles.optionButtonDanger,
                      ]}
                      onPress={() => setDeviceStatus(status)}
                    >
                      <Text style={[
                        styles.optionButtonText,
                        deviceStatus === status && styles.optionButtonTextActive,
                      ]}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity style={styles.submitButton} onPress={handleUpdateReturn}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Zapisz zmiany</Text>
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
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statNumber: {
    color: '#3b82f6',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  returnCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  returnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serialContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  serialText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  returnActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
  },
  deleteButton: {
    padding: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
  },
  returnDetails: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  typeBadgeEmpty: {
    backgroundColor: '#333',
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: '#6b7280',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeWarning: {
    backgroundColor: '#f59e0b',
  },
  statusBadgeDanger: {
    backgroundColor: '#ef4444',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#888',
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
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
  inputLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
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
  serialInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scanButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  optionButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  optionButtonWarning: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  optionButtonDanger: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  optionButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  optionButtonTextActive: {
    color: '#fff',
  },
  autoDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
    gap: 8,
  },
  autoDateText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '500',
  },
  autoDateHint: {
    color: '#888',
    fontSize: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    margin: 20,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  editSerialInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  editSerialText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // Scanner styles
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  sortLabel: {
    color: '#888',
    fontSize: 13,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: '#3b82f6',
  },
  sortButtonText: {
    color: '#888',
    fontSize: 12,
  },
  sortButtonTextActive: {
    color: '#fff',
  },
});
