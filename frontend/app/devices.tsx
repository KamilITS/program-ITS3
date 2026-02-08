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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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

export default function Devices() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [workerFilter, setWorkerFilter] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState<string | null>(null);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  
  // View mode: 'devices' or 'inventory'
  const [viewMode, setViewMode] = useState<'devices' | 'inventory'>(
    view === 'inventory' ? 'inventory' : 'devices'
  );
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  
  // Single device assign modal
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  
  // Transfer device modal
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [deviceToTransfer, setDeviceToTransfer] = useState<Device | null>(null);
  
  // Multi-select mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [bulkAssignModalVisible, setBulkAssignModalVisible] = useState(false);
  
  // Categories expanded state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Expanded inventory users
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Device history modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState<ActivityLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDevice, setHistoryDevice] = useState<Device | null>(null);
  const [deviceFullInfo, setDeviceFullInfo] = useState<any>(null); // Device info from API with import date

  const isAdmin = user?.role === 'admin';

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

  const loadInventory = async () => {
    if (!isAdmin) return;
    setInventoryLoading(true);
    try {
      const data = await apiFetch('/api/devices/inventory/summary');
      setInventoryData(data);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setInventoryLoading(false);
    }
  };

  // Load device history
  const loadDeviceHistory = async (deviceSerial: string) => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch(`/api/activity-logs/device/${encodeURIComponent(deviceSerial)}?limit=100`);
      // API returns { device, installation, logs, total_events }
      setDeviceFullInfo(data.device || null);
      setDeviceHistory(data.logs || []);
    } catch (error) {
      console.error('Error loading device history:', error);
      setDeviceHistory([]);
      setDeviceFullInfo(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openDeviceHistory = (device: Device) => {
    setHistoryDevice(device);
    setDeviceFullInfo(null);
    setHistoryModalVisible(true);
    loadDeviceHistory(device.numer_seryjny);
  };

  const getActionTypeIcon = (actionType: string): string => {
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
      default: return 'ellipse-outline';
    }
  };

  const getActionTypeColor = (actionType: string): string => {
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
      default: return '#888';
    }
  };

  const formatHistoryDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  // Load inventory when switching to inventory view
  useEffect(() => {
    if (viewMode === 'inventory' && isAdmin && inventoryData.length === 0) {
      loadInventory();
    }
  }, [viewMode, isAdmin]);

  // Set default filter to 'przypisany' for employees
  useEffect(() => {
    if (user && user.role !== 'admin' && statusFilter === null) {
      setStatusFilter('przypisany');
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Get unique device names for filter
  const deviceNames = useMemo(() => {
    const names = new Set(devices.map(d => d.nazwa));
    return Array.from(names).sort();
  }, [devices]);

  // Group devices by name (category)
  const categorizedDevices = useMemo(() => {
    const filtered = devices.filter((device) => {
      const matchesSearch =
        device.nazwa.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.numer_seryjny.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = !statusFilter || device.status === statusFilter;
      // For installed devices, check installer_id instead of przypisany_do
      const matchesWorker = !workerFilter || 
        device.przypisany_do === workerFilter || 
        (device.status === 'zainstalowany' && device.instalacja?.instalator_id === workerFilter);
      const matchesName = !nameFilter || device.nazwa === nameFilter;
      return matchesSearch && matchesStatus && matchesWorker && matchesName;
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
  }, [devices, searchQuery, statusFilter, workerFilter, nameFilter]);

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

  const clearFilters = () => {
    setWorkerFilter(null);
    setNameFilter(null);
    setShowFiltersModal(false);
  };

  const handleMoveToReturns = async () => {
    if (selectedDevices.size === 0) return;

    const performMove = async () => {
      try {
        // Get serials of selected devices
        const serials = devices
          .filter((d) => selectedDevices.has(d.device_id))
          .map((d) => d.numer_seryjny);

        await apiFetch('/api/returns/bulk', {
          method: 'POST',
          body: {
            device_serials: serials,
            device_status: 'nowy/uszkodzony',
          },
        });

        if (Platform.OS === 'web') {
          window.alert(`Przeniesiono ${serials.length} urządzeń do zwrotów`);
        } else {
          Alert.alert('Sukces', `Przeniesiono ${serials.length} urządzeń do zwrotów`);
        }
        
        cancelSelection();
        loadData();
      } catch (error: any) {
        if (Platform.OS === 'web') {
          window.alert('Błąd: ' + error.message);
        } else {
          Alert.alert('Błąd', error.message);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Czy na pewno chcesz przenieść ${selectedDevices.size} urządzeń do zwrotów?`)) {
        await performMove();
      }
    } else {
      Alert.alert(
        'Przenieś do zwrotów',
        `Czy na pewno chcesz przenieść ${selectedDevices.size} urządzeń do zwrotów?`,
        [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Przenieś', onPress: performMove },
        ]
      );
    }
  };

  const handleRestoreDevice = async (device: Device) => {
    const confirmRestore = () => {
      if (Platform.OS === 'web') {
        return window.confirm(`Czy na pewno chcesz przywrócić urządzenie "${device.numer_seryjny}" do użytkownika który je zainstalował?`);
      }
      return true; // For mobile, we handle via Alert
    };

    const performRestore = async () => {
      try {
        const result = await apiFetch(`/api/devices/${device.device_id}/restore`, {
          method: 'POST',
        });
        if (Platform.OS === 'web') {
          window.alert(result.message || 'Urządzenie zostało przywrócone');
        } else {
          Alert.alert('Sukces', result.message || 'Urządzenie zostało przywrócone');
        }
        loadData();
      } catch (error: any) {
        if (Platform.OS === 'web') {
          window.alert('Błąd: ' + error.message);
        } else {
          Alert.alert('Błąd', error.message);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirmRestore()) {
        await performRestore();
      }
    } else {
      Alert.alert(
        'Przywróć urządzenie',
        `Czy na pewno chcesz przywrócić urządzenie "${device.numer_seryjny}" do użytkownika który je zainstalował?`,
        [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Przywróć', onPress: performRestore }
        ]
      );
    }
  };

  const openTransferModal = (device: Device) => {
    setDeviceToTransfer(device);
    setTransferModalVisible(true);
  };

  const handleTransferDevice = async (newWorkerId: string) => {
    if (!deviceToTransfer) return;
    
    try {
      const result = await apiFetch(`/api/devices/${deviceToTransfer.device_id}/transfer`, {
        method: 'POST',
        body: { worker_id: newWorkerId },
      });
      
      if (Platform.OS === 'web') {
        window.alert(result.message || 'Urządzenie zostało przeniesione');
      } else {
        Alert.alert('Sukces', result.message || 'Urządzenie zostało przeniesione');
      }
      
      setTransferModalVisible(false);
      setDeviceToTransfer(null);
      loadData();
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert('Błąd: ' + error.message);
      } else {
        Alert.alert('Błąd', error.message);
      }
    }
  };

  const activeFiltersCount = (workerFilter ? 1 : 0) + (nameFilter ? 1 : 0);

  const statusFilters = [
    { key: null, label: 'Wszystkie' },
    { key: 'dostepny', label: 'Dostępne' },
    { key: 'przypisany', label: 'Przypisane' },
    { key: 'zainstalowany', label: 'Zainstalowane' },
    { key: 'uszkodzony', label: 'Uszkodzone' },
  ];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderDeviceItem = (device: Device) => {
    const assignedWorker = workers.find((w) => w.user_id === device.przypisany_do);
    const instalatorWorker = device.instalacja?.instalator_id 
      ? workers.find((w) => w.user_id === device.instalacja?.instalator_id)
      : null;
    const isSelected = selectedDevices.has(device.device_id);
    const isAvailable = device.status === 'dostepny';
    const isInstalled = device.status === 'zainstalowany';
    const isDamaged = device.status === 'uszkodzony';
    const canSelect = isAvailable || (isDamaged && statusFilter === 'uszkodzony');

    return (
      <TouchableOpacity
        key={device.device_id}
        style={[
          styles.deviceItem,
          isSelected && styles.deviceItemSelected,
          isInstalled && styles.deviceItemInstalled,
          isDamaged && styles.deviceItemDamaged,
        ]}
        onPress={() => {
          if (selectionMode && canSelect) {
            toggleDeviceSelection(device.device_id);
          } else if (isAdmin && isAvailable && !selectionMode) {
            setSelectedDevice(device);
            setAssignModalVisible(true);
          }
        }}
        onLongPress={() => {
          if (isAdmin && canSelect && !selectionMode) {
            setSelectionMode(true);
            toggleDeviceSelection(device.device_id);
          }
        }}
      >
        {selectionMode && (
          <View style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
            !canSelect && styles.checkboxDisabled,
          ]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
        )}
        
        <View style={styles.deviceItemInfo}>
          <Text style={styles.deviceSerial}>{device.numer_seryjny}</Text>
          {device.kod_kreskowy && (
            <Text style={styles.deviceCode}>Kod: {device.kod_kreskowy}</Text>
          )}
          {assignedWorker && !isInstalled && (
            <View style={styles.assignedInfo}>
              <View style={styles.assignedBadge}>
                <Ionicons name="person" size={12} color="#3b82f6" />
                <Text style={styles.assignedName}>{assignedWorker.name}</Text>
              </View>
              {/* Transfer button for admin on assigned devices */}
              {isAdmin && device.status === 'przypisany' && (
                <TouchableOpacity
                  style={styles.transferButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    openTransferModal(device);
                  }}
                >
                  <Ionicons name="swap-horizontal" size={14} color="#8b5cf6" />
                  <Text style={styles.transferButtonText}>Przenieś</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {/* Installation info for installed devices */}
          {isInstalled && device.instalacja && (
            <View style={styles.installationInfo}>
              {device.instalacja.adres && (
                <View style={styles.installationRow}>
                  <Ionicons name="location" size={14} color="#f59e0b" />
                  <Text style={styles.installationAddress} numberOfLines={2}>
                    {device.instalacja.adres}
                  </Text>
                </View>
              )}
              {device.instalacja.data_instalacji && (
                <View style={styles.installationRow}>
                  <Ionicons name="calendar" size={14} color="#888" />
                  <Text style={styles.installationDate}>
                    {formatDate(device.instalacja.data_instalacji)}
                  </Text>
                </View>
              )}
              {instalatorWorker && (
                <View style={styles.installationRow}>
                  <Ionicons name="person" size={14} color="#10b981" />
                  <Text style={styles.installationWorker}>
                    Instalator: {instalatorWorker.name}
                  </Text>
                </View>
              )}
              {device.instalacja.rodzaj_zlecenia && (
                <View style={styles.installationTypeBadge}>
                  <Text style={styles.installationTypeText}>
                    {device.instalacja.rodzaj_zlecenia}
                  </Text>
                </View>
              )}
              
              {/* Restore button for admin */}
              {isAdmin && (
                <View style={styles.deviceActionRow}>
                  <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRestoreDevice(device);
                    }}
                  >
                    <Ionicons name="refresh" size={16} color="#3b82f6" />
                    <Text style={styles.restoreButtonText}>Przywróć</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.historyButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      openDeviceHistory(device);
                    }}
                  >
                    <Ionicons name="time-outline" size={16} color="#8b5cf6" />
                    <Text style={styles.historyButtonText}>Historia</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          
          {/* History button for other device states (for admin) */}
          {isAdmin && !isInstalled && (
            <TouchableOpacity
              style={styles.deviceHistoryBtn}
              onPress={(e) => {
                e.stopPropagation();
                openDeviceHistory(device);
              }}
            >
              <Ionicons name="time-outline" size={16} color="#8b5cf6" />
            </TouchableOpacity>
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
        <Text style={styles.title}>
          {viewMode === 'inventory' ? 'Stany magazynowe' : 'Urządzenia'}
        </Text>
        <View style={styles.headerRight}>
          {isAdmin && !selectionMode && viewMode === 'devices' && (
            <>
              <TouchableOpacity 
                onPress={() => router.push('/assign')} 
                style={styles.scanHeaderButton}
              >
                <Ionicons name="scan" size={22} color="#10b981" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setSelectionMode(true)} 
                style={styles.selectButton}
              >
                <Ionicons name="checkbox-outline" size={24} color="#3b82f6" />
              </TouchableOpacity>
            </>
          )}
          {selectionMode && (
            <TouchableOpacity onPress={cancelSelection} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Anuluj</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Selection mode header */}
      {selectionMode && (
        <View style={styles.selectionHeader}>
          <View style={styles.selectionInfo}>
            <Text style={styles.selectionText}>
              Wybrano: {selectedDevices.size} urządzeń
            </Text>
            <View style={styles.selectAllButtons}>
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={() => {
                  // Select all devices that can be selected (available or damaged when filter is 'uszkodzony')
                  const selectableDevices = devices.filter(d => 
                    d.status === 'dostepny' || (d.status === 'uszkodzony' && statusFilter === 'uszkodzony')
                  );
                  const newSelection = new Set(selectableDevices.map(d => d.device_id));
                  setSelectedDevices(newSelection);
                }}
              >
                <Text style={styles.selectAllButtonText}>Zaznacz wszystkie</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={() => setSelectedDevices(new Set())}
              >
                <Text style={styles.selectAllButtonText}>Odznacz</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.selectionActions}>
            {statusFilter === 'uszkodzony' && selectedDevices.size > 0 && (
              <TouchableOpacity
                style={styles.moveToReturnsButton}
                onPress={handleMoveToReturns}
              >
                <Ionicons name="arrow-undo" size={18} color="#fff" />
                <Text style={styles.moveToReturnsText}>Do zwrotów</Text>
              </TouchableOpacity>
            )}
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
        </View>
      )}

      {/* View Mode Toggle - Admin Only */}
      {isAdmin && !selectionMode && (
        <View style={styles.viewModeToggle}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'devices' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('devices')}
          >
            <Ionicons name="list" size={18} color={viewMode === 'devices' ? '#fff' : '#888'} />
            <Text style={[styles.viewModeText, viewMode === 'devices' && styles.viewModeTextActive]}>
              Urządzenia
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'inventory' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('inventory')}
          >
            <Ionicons name="people" size={18} color={viewMode === 'inventory' ? '#fff' : '#888'} />
            <Text style={[styles.viewModeText, viewMode === 'inventory' && styles.viewModeTextActive]}>
              Stany pracowników
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* INVENTORY VIEW */}
      {viewMode === 'inventory' && isAdmin ? (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={inventoryLoading} onRefresh={loadInventory} tintColor="#3b82f6" />
          }
        >
          {inventoryData.filter(u => u.role !== 'admin').map((userData) => (
            <TouchableOpacity
              key={userData.user_id}
              style={[
                styles.inventoryUserCard,
                userData.has_low_stock && styles.inventoryUserCardAlert,
              ]}
              onPress={() => {
                const newExpanded = new Set(expandedUsers);
                if (newExpanded.has(userData.user_id)) {
                  newExpanded.delete(userData.user_id);
                } else {
                  newExpanded.add(userData.user_id);
                }
                setExpandedUsers(newExpanded);
              }}
            >
              <View style={styles.inventoryUserHeader}>
                <View style={styles.inventoryUserInfo}>
                  <Ionicons 
                    name="person-circle" 
                    size={40} 
                    color={userData.has_low_stock ? '#ef4444' : '#3b82f6'} 
                  />
                  <View>
                    <Text style={styles.inventoryUserName}>{userData.user_name}</Text>
                    <Text style={styles.inventoryUserEmail}>{userData.user_email}</Text>
                  </View>
                </View>
                <Ionicons 
                  name={expandedUsers.has(userData.user_id) ? 'chevron-up' : 'chevron-down'} 
                  size={24} 
                  color="#888" 
                />
              </View>
              
              <View style={styles.inventoryStatsRow}>
                <View style={styles.inventoryStatBox}>
                  <Text style={styles.inventoryStatNumber}>{userData.total_devices}</Text>
                  <Text style={styles.inventoryStatLabel}>Przypisanych</Text>
                </View>
                <View style={styles.inventoryStatBox}>
                  <Text style={[styles.inventoryStatNumber, { color: '#8b5cf6' }]}>
                    {userData.total_installed || 0}
                  </Text>
                  <Text style={styles.inventoryStatLabel}>Zainstalowanych</Text>
                </View>
                <View style={styles.inventoryStatBox}>
                  <Text style={[styles.inventoryStatNumber, { color: '#f59e0b' }]}>
                    {userData.total_damaged || 0}
                  </Text>
                  <Text style={styles.inventoryStatLabel}>Uszkodzonych</Text>
                </View>
                {userData.has_low_stock && (
                  <View style={[styles.inventoryStatBox, styles.inventoryStatBoxAlert]}>
                    <Text style={[styles.inventoryStatNumber, { color: '#ef4444' }]}>
                      {userData.low_stock.length}
                    </Text>
                    <Text style={[styles.inventoryStatLabel, { color: '#ef4444' }]}>Niski stan</Text>
                  </View>
                )}
              </View>
              
              {/* Expanded details */}
              {expandedUsers.has(userData.user_id) && userData.by_barcode.length > 0 && (
                <View style={styles.inventoryDetails}>
                  <Text style={styles.inventoryDetailsTitle}>Urządzenia wg typu:</Text>
                  {userData.by_barcode.map((item: any, idx: number) => (
                    <View 
                      key={idx} 
                      style={[
                        styles.inventoryDetailRow,
                        item.count < 4 && styles.inventoryDetailRowAlert,
                      ]}
                    >
                      <Text style={[
                        styles.inventoryDetailName,
                        item.count < 4 && styles.inventoryDetailNameAlert,
                      ]}>
                        {item.nazwa || item.kod_kreskowy}
                      </Text>
                      <Text style={[
                        styles.inventoryDetailCount,
                        item.count < 4 && styles.inventoryDetailCountAlert,
                      ]}>
                        {item.count} szt.
                        {item.count < 4 && ' ⚠️'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))}
          
          {inventoryData.filter(u => u.role !== 'admin').length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#333" />
              <Text style={styles.emptyText}>Brak pracowników</Text>
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        <>
          {/* DEVICES VIEW */}
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
          <View style={styles.filtersRow}>
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
          </View>
          
          {/* Advanced Filters Button - Admin Only - in separate row */}
          {isAdmin && (
            <View style={styles.advancedFiltersContainer}>
              <TouchableOpacity
                style={[
                  styles.advancedFilterButton,
                  activeFiltersCount > 0 && styles.advancedFilterButtonActive
                ]}
                onPress={() => setShowFiltersModal(true)}
              >
                <Ionicons name="options" size={18} color={activeFiltersCount > 0 ? '#fff' : '#3b82f6'} />
                <Text style={[
                  styles.advancedFilterText,
                  activeFiltersCount > 0 && styles.advancedFilterTextActive
                ]}>
                  Filtry {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
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
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#3b82f6' }]}>
            {devices.filter(d => d.status === 'przypisany').length}
          </Text>
          <Text style={styles.statLabel}>Przypisanych</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#8b5cf6' }]}>
            {devices.filter(d => d.status === 'zainstalowany').length}
          </Text>
          <Text style={styles.statLabel}>Zainstalowanych</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#f59e0b' }]}>
            {devices.filter(d => d.status === 'uszkodzony').length}
          </Text>
          <Text style={styles.statLabel}>Uszkodzonych</Text>
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
        </>
      )}

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

      {/* Transfer Device Modal */}
      <Modal
        visible={transferModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTransferModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Przenieś urządzenie</Text>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {deviceToTransfer && (
              <View style={styles.modalDeviceInfo}>
                <Text style={styles.modalDeviceName}>{deviceToTransfer.nazwa}</Text>
                <Text style={styles.modalDeviceSerial}>{deviceToTransfer.numer_seryjny}</Text>
                {deviceToTransfer.przypisany_do && (
                  <View style={styles.currentOwnerBadge}>
                    <Ionicons name="person" size={14} color="#f59e0b" />
                    <Text style={styles.currentOwnerText}>
                      Obecnie: {workers.find(w => w.user_id === deviceToTransfer.przypisany_do)?.name || 'Nieznany'}
                    </Text>
                  </View>
                )}
              </View>
            )}
            
            <Text style={styles.selectNewWorkerLabel}>Wybierz nowego właściciela:</Text>
            
            <FlatList
              data={workers.filter(w => deviceToTransfer ? w.user_id !== deviceToTransfer.przypisany_do : true)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.workerItem}
                  onPress={() => handleTransferDevice(item.user_id)}
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
                <Text style={styles.noWorkersText}>Brak innych pracowników</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Advanced Filters Modal */}
      <Modal
        visible={showFiltersModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFiltersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtry zaawansowane</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.filtersModalContent}>
              {/* Filter by Device Name */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Filtruj po nazwie urządzenia</Text>
                <TouchableOpacity
                  style={[styles.filterOption, !nameFilter && styles.filterOptionActive]}
                  onPress={() => setNameFilter(null)}
                >
                  <Ionicons 
                    name={!nameFilter ? 'radio-button-on' : 'radio-button-off'} 
                    size={20} 
                    color={!nameFilter ? '#3b82f6' : '#888'} 
                  />
                  <Text style={[styles.filterOptionText, !nameFilter && styles.filterOptionTextActive]}>
                    Wszystkie nazwy
                  </Text>
                </TouchableOpacity>
                {deviceNames.map(name => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.filterOption, nameFilter === name && styles.filterOptionActive]}
                    onPress={() => setNameFilter(name)}
                  >
                    <Ionicons 
                      name={nameFilter === name ? 'radio-button-on' : 'radio-button-off'} 
                      size={20} 
                      color={nameFilter === name ? '#3b82f6' : '#888'} 
                    />
                    <Text style={[styles.filterOptionText, nameFilter === name && styles.filterOptionTextActive]}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Filter by Worker */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Filtruj po pracowniku</Text>
                <TouchableOpacity
                  style={[styles.filterOption, !workerFilter && styles.filterOptionActive]}
                  onPress={() => setWorkerFilter(null)}
                >
                  <Ionicons 
                    name={!workerFilter ? 'radio-button-on' : 'radio-button-off'} 
                    size={20} 
                    color={!workerFilter ? '#3b82f6' : '#888'} 
                  />
                  <Text style={[styles.filterOptionText, !workerFilter && styles.filterOptionTextActive]}>
                    Wszyscy pracownicy
                  </Text>
                </TouchableOpacity>
                {workers.map(worker => (
                  <TouchableOpacity
                    key={worker.user_id}
                    style={[styles.filterOption, workerFilter === worker.user_id && styles.filterOptionActive]}
                    onPress={() => setWorkerFilter(worker.user_id)}
                  >
                    <Ionicons 
                      name={workerFilter === worker.user_id ? 'radio-button-on' : 'radio-button-off'} 
                      size={20} 
                      color={workerFilter === worker.user_id ? '#3b82f6' : '#888'} 
                    />
                    <Text style={[styles.filterOptionText, workerFilter === worker.user_id && styles.filterOptionTextActive]}>
                      {worker.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.filtersModalFooter}>
              <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Wyczyść filtry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyFiltersButton} onPress={() => setShowFiltersModal(false)}>
                <Text style={styles.applyFiltersText}>Zastosuj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Device History Modal */}
      <Modal
        visible={historyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setHistoryModalVisible(false);
          setDeviceHistory([]);
          setHistoryDevice(null);
          setDeviceFullInfo(null);
        }}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'flex-start', paddingTop: 50 }]}>
          <View style={[styles.modalContent, { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historia urządzenia</Text>
              <TouchableOpacity onPress={() => {
                setHistoryModalVisible(false);
                setDeviceHistory([]);
                setHistoryDevice(null);
                setDeviceFullInfo(null);
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {historyDevice && (
              <View style={styles.historyDeviceInfo}>
                <Ionicons name="hardware-chip" size={24} color="#3b82f6" />
                <View style={styles.historyDeviceDetails}>
                  <Text style={styles.historyDeviceName}>{historyDevice.nazwa}</Text>
                  <Text style={styles.historyDeviceSerial}>{historyDevice.numer_seryjny}</Text>
                </View>
                <View style={[
                  styles.historyStatusBadge,
                  historyDevice.status === 'dostepny' && { backgroundColor: '#10b981' },
                  historyDevice.status === 'przypisany' && { backgroundColor: '#3b82f6' },
                  historyDevice.status === 'zainstalowany' && { backgroundColor: '#f59e0b' },
                  historyDevice.status === 'uszkodzony' && { backgroundColor: '#ef4444' },
                ]}>
                  <Text style={styles.historyStatusText}>{historyDevice.status}</Text>
                </View>
              </View>
            )}
            
            {/* Import Date Section */}
            {deviceFullInfo && (deviceFullInfo.created_at || deviceFullInfo.imported_at) && (
              <View style={styles.importDateSection}>
                <Ionicons name="calendar-outline" size={18} color="#10b981" />
                <View style={styles.importDateContent}>
                  <Text style={styles.importDateLabel}>Data importu do magazynu</Text>
                  <Text style={styles.importDateValue}>
                    {formatHistoryDate(deviceFullInfo.created_at || deviceFullInfo.imported_at)}
                  </Text>
                </View>
              </View>
            )}
            
            {historyLoading ? (
              <View style={styles.historyLoading}>
                <Text style={styles.loadingText}>Ładowanie historii...</Text>
              </View>
            ) : deviceHistory.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Ionicons name="document-text-outline" size={48} color="#666" />
                <Text style={styles.emptyText}>Brak zarejestrowanej historii</Text>
                <Text style={styles.emptySubtext}>Historia będzie rejestrowana od teraz</Text>
              </View>
            ) : (
              <>
                <View style={styles.historyTimelineHeader}>
                  <Text style={styles.historyTimelineTitle}>Oś czasu ({deviceHistory.length} zdarzeń)</Text>
                </View>
                <FlatList
                  data={deviceHistory}
                  keyExtractor={(item) => item.log_id}
                  style={styles.historyList}
                  renderItem={({ item, index }) => (
                    <View style={styles.historyItem}>
                      {/* Timeline line */}
                      <View style={styles.timelineLine}>
                        <View style={[
                          styles.timelineDot, 
                          { backgroundColor: getActionTypeColor(item.action_type) }
                        ]} />
                        {index < deviceHistory.length - 1 && (
                          <View style={styles.timelineConnector} />
                        )}
                      </View>
                      <View style={styles.historyContent}>
                        <Text style={styles.historyDescription}>{item.action_description}</Text>
                        <View style={styles.historyMeta}>
                          <Ionicons name="time-outline" size={12} color="#888" />
                          <Text style={styles.historyTime}>{formatHistoryDate(item.timestamp)}</Text>
                        </View>
                        <View style={styles.historyMeta}>
                          <Ionicons name="person-outline" size={12} color="#888" />
                          <Text style={styles.historyUser}>{item.user_name}</Text>
                        </View>
                        {item.details?.adres_klienta && (
                          <View style={styles.historyMeta}>
                            <Ionicons name="location-outline" size={12} color="#10b981" />
                            <Text style={styles.historyAddress} numberOfLines={2}>{item.details.adres_klienta}</Text>
                          </View>
                        )}
                        {item.target_user_name && (
                          <View style={styles.historyMeta}>
                            <Ionicons name="arrow-forward" size={12} color="#f59e0b" />
                            <Text style={styles.historyTarget}>Do: {item.target_user_name}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                />
              </>
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
    flexWrap: 'wrap',
    gap: 10,
  },
  selectionInfo: {
    flexDirection: 'column',
    gap: 6,
  },
  selectionText: {
    color: '#fff',
    fontSize: 14,
  },
  selectAllButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  selectAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  selectAllButtonText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '500',
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
  content: {
    flex: 1,
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
  deviceItemInstalled: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  installationInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  installationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 6,
  },
  installationAddress: {
    color: '#f59e0b',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  installationDate: {
    color: '#888',
    fontSize: 12,
  },
  installationWorker: {
    color: '#10b981',
    fontSize: 12,
  },
  installationTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
  },
  installationTypeText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '500',
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
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  advancedFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  advancedFilterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  advancedFiltersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  advancedFilterText: {
    color: '#3b82f6',
    fontSize: 14,
    marginLeft: 6,
  },
  advancedFilterTextActive: {
    color: '#fff',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  filtersModalContent: {
    maxHeight: 400,
    padding: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    gap: 10,
  },
  filterOptionActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  filterOptionText: {
    color: '#888',
    fontSize: 15,
  },
  filterOptionTextActive: {
    color: '#fff',
  },
  filtersModalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    gap: 12,
  },
  clearFiltersButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  clearFiltersText: {
    color: '#888',
    fontSize: 16,
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  applyFiltersText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  restoreButtonText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '500',
  },
  assignedInfo: {
    marginTop: 4,
  },
  transferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
    gap: 4,
  },
  transferButtonText: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '500',
  },
  currentOwnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  currentOwnerText: {
    color: '#f59e0b',
    fontSize: 13,
  },
  selectNewWorkerLabel: {
    color: '#888',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanHeaderButton: {
    padding: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  moveToReturnsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  moveToReturnsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceItemDamaged: {
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  // View mode toggle styles
  viewModeToggle: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  viewModeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  viewModeText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  viewModeTextActive: {
    color: '#fff',
  },
  // Inventory view styles
  inventoryUserCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
  },
  inventoryUserCardAlert: {
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  inventoryUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inventoryUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inventoryUserName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inventoryUserEmail: {
    color: '#888',
    fontSize: 13,
  },
  inventoryStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inventoryStatBox: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  inventoryStatBoxAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  inventoryStatNumber: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  inventoryStatLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
  },
  inventoryDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  inventoryDetailsTitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inventoryDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  inventoryDetailRowAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  inventoryDetailName: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  inventoryDetailNameAlert: {
    color: '#ef4444',
  },
  inventoryDetailCount: {
    color: '#888',
    fontSize: 14,
  },
  inventoryDetailCountAlert: {
    color: '#ef4444',
    fontWeight: '600',
  },
  // Device action row styles
  deviceActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  historyButtonText: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '500',
  },
  deviceHistoryBtn: {
    position: 'absolute',
    right: 24,
    top: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  // History modal styles
  historyDeviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    gap: 12,
  },
  historyDeviceDetails: {
    flex: 1,
  },
  historyDeviceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  historyDeviceSerial: {
    color: '#3b82f6',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  historyStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  historyLoading: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  historyEmpty: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptySubtext: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
  },
  historyList: {
    flex: 1,
  },
  historyItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyDescription: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  historyTime: {
    color: '#888',
    fontSize: 12,
  },
  historyUser: {
    color: '#3b82f6',
    fontSize: 12,
  },
  historyAddress: {
    color: '#10b981',
    fontSize: 11,
    flex: 1,
  },
  historyTarget: {
    color: '#f59e0b',
    fontSize: 12,
  },
  // Import date section styles
  importDateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    gap: 12,
  },
  importDateContent: {
    flex: 1,
  },
  importDateLabel: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  importDateValue: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  // Timeline styles
  historyTimelineHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  historyTimelineTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  timelineLine: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    marginTop: 4,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: '#333',
    marginTop: 4,
    minHeight: 40,
  },
});
