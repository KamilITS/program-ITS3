import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Vehicle {
  vehicle_id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
}

interface Equipment {
  equipment_id: string;
  name: string;
  type: string;
  serial_number: string;
  description: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
}

interface EquipmentType {
  type_id: string;
  name: string;
}

interface Worker {
  user_id: string;
  name: string;
}

interface HistoryLog {
  log_id: string;
  user_name: string;
  action_type: string;
  action_description: string;
  timestamp: string;
  target_user_name?: string;
}

interface VehicleService {
  service_id: string;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_info: string;
  service_type: string;
  service_date: string;
  notes: string;
  created_by_name: string;
}

export default function Vehicles() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [services, setServices] = useState<VehicleService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'equipment' | 'service'>('vehicles');
  
  // Modals
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [equipmentModalVisible, setEquipmentModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  
  // History
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Forms
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  
  // Vehicle form
  const [vehicleForm, setVehicleForm] = useState({
    plate_number: '',
    brand: '',
    model: '',
    year: '',
  });
  
  // Equipment form
  const [equipmentForm, setEquipmentForm] = useState({
    name: '',
    type: '',
    serial_number: '',
    description: '',
  });
  
  // Service form
  const [serviceForm, setServiceForm] = useState({
    vehicle_id: '',
    service_type: '',
    service_date: '',
    notes: '',
  });
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  
  // Assign
  const [assignTarget, setAssignTarget] = useState<{ type: 'vehicle' | 'equipment', id: string, name: string } | null>(null);
  
  // Worker assets (for employee view)
  const [myVehicles, setMyVehicles] = useState<Vehicle[]>([]);
  const [myEquipment, setMyEquipment] = useState<Equipment[]>([]);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData();
    }
  }, [isAuthenticated, user]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      if (isAdmin) {
        const [vehiclesData, equipmentData, typesData, workersData, servicesData] = await Promise.all([
          apiFetch('/api/vehicles'),
          apiFetch('/api/equipment'),
          apiFetch('/api/equipment/types'),
          apiFetch('/api/workers'),
          apiFetch('/api/services'),
        ]);
        setVehicles(vehiclesData);
        setEquipment(equipmentData);
        setEquipmentTypes(typesData);
        setWorkers(workersData);
        setServices(servicesData);
      } else {
        // Employee - load only their assets
        const assets = await apiFetch(`/api/workers/${user?.user_id}/assets`);
        setMyVehicles(assets.vehicles || []);
        setMyEquipment(assets.equipment || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Format date to Warsaw timezone
  const formatInWarsaw = (dateStr: string, formatStr: string) => {
    try {
      const date = new Date(dateStr);
      const warsawDate = toZonedTime(date, 'Europe/Warsaw');
      return format(warsawDate, formatStr, { locale: pl });
    } catch {
      return dateStr;
    }
  };

  // Load history
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const logs = await apiFetch('/api/vehicles-equipment/history');
      setHistoryLogs(logs);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryModal = () => {
    loadHistory();
    setHistoryModalVisible(true);
  };

  // Get icon and color for action type
  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'vehicle_create':
        return { icon: 'car', color: '#10b981' };
      case 'vehicle_delete':
        return { icon: 'car', color: '#ef4444' };
      case 'vehicle_assign':
        return { icon: 'person-add', color: '#3b82f6' };
      case 'vehicle_unassign':
        return { icon: 'person-remove', color: '#f59e0b' };
      case 'equipment_create':
        return { icon: 'construct', color: '#10b981' };
      case 'equipment_delete':
        return { icon: 'construct', color: '#ef4444' };
      case 'equipment_assign':
        return { icon: 'person-add', color: '#3b82f6' };
      case 'equipment_unassign':
        return { icon: 'person-remove', color: '#f59e0b' };
      case 'service_create':
        return { icon: 'build', color: '#8b5cf6' };
      case 'service_delete':
        return { icon: 'build', color: '#ef4444' };
      default:
        return { icon: 'ellipse', color: '#888' };
    }
  };

  // Service CRUD
  const openServiceModal = () => {
    setServiceForm({ vehicle_id: '', service_type: '', service_date: '', notes: '' });
    setServiceModalVisible(true);
  };

  const saveService = async () => {
    if (!serviceForm.vehicle_id) {
      Alert.alert('Błąd', 'Wybierz pojazd');
      return;
    }
    if (!serviceForm.service_type.trim()) {
      Alert.alert('Błąd', 'Wpisz rodzaj serwisu');
      return;
    }
    if (!serviceForm.service_date) {
      Alert.alert('Błąd', 'Wpisz datę serwisu');
      return;
    }

    try {
      await apiFetch('/api/services', {
        method: 'POST',
        body: serviceForm,
      });
      Alert.alert('Sukces', 'Wpis serwisowy dodany');
      setServiceModalVisible(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się dodać wpisu');
    }
  };

  const deleteService = (service: VehicleService) => {
    Alert.alert(
      'Usuń wpis serwisowy',
      `Czy na pewno chcesz usunąć wpis "${service.service_type}" dla ${service.vehicle_plate}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/services/${service.service_id}`, { method: 'DELETE' });
              loadData();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  const formatServiceDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}.${month}.${year}`;
    } catch {
      return dateStr;
    }
  };

  // Vehicle CRUD
  const openVehicleModal = (vehicle?: Vehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setVehicleForm({
        plate_number: vehicle.plate_number,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
      });
    } else {
      setEditingVehicle(null);
      setVehicleForm({ plate_number: '', brand: '', model: '', year: '' });
    }
    setVehicleModalVisible(true);
  };

  const saveVehicle = async () => {
    if (!vehicleForm.plate_number.trim()) {
      Alert.alert('Błąd', 'Numer rejestracyjny jest wymagany');
      return;
    }

    try {
      if (editingVehicle) {
        await apiFetch(`/api/vehicles/${editingVehicle.vehicle_id}`, {
          method: 'PUT',
          body: vehicleForm,
        });
        Alert.alert('Sukces', 'Pojazd zaktualizowany');
      } else {
        await apiFetch('/api/vehicles', {
          method: 'POST',
          body: vehicleForm,
        });
        Alert.alert('Sukces', 'Pojazd dodany');
      }
      setVehicleModalVisible(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zapisać pojazdu');
    }
  };

  const deleteVehicle = (vehicle: Vehicle) => {
    Alert.alert(
      'Usuń pojazd',
      `Czy na pewno chcesz usunąć pojazd ${vehicle.plate_number}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/vehicles/${vehicle.vehicle_id}`, { method: 'DELETE' });
              loadData();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  // Equipment CRUD
  const openEquipmentModal = (eq?: Equipment) => {
    if (eq) {
      setEditingEquipment(eq);
      setEquipmentForm({
        name: eq.name,
        type: eq.type,
        serial_number: eq.serial_number,
        description: eq.description,
      });
    } else {
      setEditingEquipment(null);
      setEquipmentForm({ name: '', type: '', serial_number: '', description: '' });
    }
    setEquipmentModalVisible(true);
  };

  const saveEquipment = async () => {
    if (!equipmentForm.name.trim()) {
      Alert.alert('Błąd', 'Nazwa wyposażenia jest wymagana');
      return;
    }

    try {
      if (editingEquipment) {
        await apiFetch(`/api/equipment/${editingEquipment.equipment_id}`, {
          method: 'PUT',
          body: equipmentForm,
        });
        Alert.alert('Sukces', 'Wyposażenie zaktualizowane');
      } else {
        await apiFetch('/api/equipment', {
          method: 'POST',
          body: equipmentForm,
        });
        Alert.alert('Sukces', 'Wyposażenie dodane');
      }
      setEquipmentModalVisible(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zapisać wyposażenia');
    }
  };

  const deleteEquipment = (eq: Equipment) => {
    Alert.alert(
      'Usuń wyposażenie',
      `Czy na pewno chcesz usunąć "${eq.name}"?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/equipment/${eq.equipment_id}`, { method: 'DELETE' });
              loadData();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  // Equipment Types
  const addEquipmentType = async () => {
    if (!newTypeName.trim()) return;

    try {
      await apiFetch('/api/equipment/types', {
        method: 'POST',
        body: { name: newTypeName.trim() },
      });
      setNewTypeName('');
      const types = await apiFetch('/api/equipment/types');
      setEquipmentTypes(types);
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const deleteEquipmentType = async (typeId: string) => {
    try {
      await apiFetch(`/api/equipment/types/${typeId}`, { method: 'DELETE' });
      const types = await apiFetch('/api/equipment/types');
      setEquipmentTypes(types);
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  // Assign
  const openAssignModal = (type: 'vehicle' | 'equipment', id: string, name: string) => {
    setAssignTarget({ type, id, name });
    setAssignModalVisible(true);
  };

  const assignToWorker = async (workerId: string | null) => {
    if (!assignTarget) return;

    try {
      const endpoint = assignTarget.type === 'vehicle' 
        ? `/api/vehicles/${assignTarget.id}/assign`
        : `/api/equipment/${assignTarget.id}/assign`;
      
      await apiFetch(endpoint, {
        method: 'POST',
        body: { worker_id: workerId },
      });
      
      setAssignModalVisible(false);
      loadData();
      Alert.alert('Sukces', workerId ? 'Przypisano do pracownika' : 'Odpisano od pracownika');
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  if (isLoading || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Ładowanie...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Employee View - Read Only
  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Samochód i wyposażenie</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* My Vehicles */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="car" size={24} color="#3b82f6" />
              <Text style={styles.sectionTitle}>Przypisany pojazd</Text>
            </View>
            
            {myVehicles.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="car-outline" size={40} color="#444" />
                <Text style={styles.emptyText}>Brak przypisanego pojazdu</Text>
              </View>
            ) : (
              myVehicles.map(vehicle => (
                <View key={vehicle.vehicle_id} style={styles.assetCard}>
                  <View style={styles.assetIcon}>
                    <Ionicons name="car" size={32} color="#3b82f6" />
                  </View>
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetTitle}>{vehicle.plate_number}</Text>
                    <Text style={styles.assetSubtitle}>
                      {vehicle.brand} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* My Equipment */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="construct" size={24} color="#f59e0b" />
              <Text style={styles.sectionTitle}>Przypisane wyposażenie</Text>
            </View>
            
            {myEquipment.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="construct-outline" size={40} color="#444" />
                <Text style={styles.emptyText}>Brak przypisanego wyposażenia</Text>
              </View>
            ) : (
              myEquipment.map(eq => (
                <View key={eq.equipment_id} style={styles.equipmentCard}>
                  <View style={styles.equipmentHeader}>
                    <Ionicons name="build" size={20} color="#f59e0b" />
                    <Text style={styles.equipmentName}>{eq.name}</Text>
                  </View>
                  {eq.type && <Text style={styles.equipmentType}>Typ: {eq.type}</Text>}
                  {eq.serial_number && <Text style={styles.equipmentSerial}>S/N: {eq.serial_number}</Text>}
                  {eq.description && <Text style={styles.equipmentDesc}>{eq.description}</Text>}
                </View>
              ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Admin View
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pojazdy i wyposażenie</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openHistoryModal} style={styles.headerActionButton}>
            <Ionicons name="time-outline" size={24} color="#f59e0b" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => activeTab === 'vehicles' ? openVehicleModal() : openEquipmentModal()} 
            style={styles.headerActionButton}
          >
            <Ionicons name="add-circle" size={28} color="#10b981" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'vehicles' && styles.activeTab]}
          onPress={() => setActiveTab('vehicles')}
        >
          <Ionicons name="car" size={18} color={activeTab === 'vehicles' ? '#3b82f6' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'vehicles' && styles.activeTabText]}>
            Pojazdy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'equipment' && styles.activeTab]}
          onPress={() => setActiveTab('equipment')}
        >
          <Ionicons name="construct" size={18} color={activeTab === 'equipment' ? '#f59e0b' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'equipment' && styles.activeTabText]}>
            Wyposażenie
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'service' && styles.activeTab]}
          onPress={() => setActiveTab('service')}
        >
          <Ionicons name="build" size={18} color={activeTab === 'service' ? '#8b5cf6' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'service' && styles.activeTabText]}>
            Serwis
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'vehicles' ? (
          <>
            {vehicles.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="car-outline" size={64} color="#333" />
                <Text style={styles.emptyStateText}>Brak pojazdów</Text>
                <Text style={styles.emptyStateHint}>Dodaj pojazd klikając "+" w nagłówku</Text>
              </View>
            ) : (
              vehicles.map(vehicle => (
                <View key={vehicle.vehicle_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconContainer}>
                      <Ionicons name="car" size={28} color="#3b82f6" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>{vehicle.plate_number}</Text>
                      <Text style={styles.cardSubtitle}>
                        {vehicle.brand} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.assignedRow}>
                    <Text style={styles.assignedLabel}>Przypisany do:</Text>
                    <Text style={[styles.assignedValue, !vehicle.assigned_to_name && styles.unassigned]}>
                      {vehicle.assigned_to_name || 'Nieprzypisany'}
                    </Text>
                  </View>
                  
                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.cardAction}
                      onPress={() => openAssignModal('vehicle', vehicle.vehicle_id, vehicle.plate_number)}
                    >
                      <Ionicons name="person-add" size={18} color="#10b981" />
                      <Text style={[styles.cardActionText, { color: '#10b981' }]}>Przypisz</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.cardAction}
                      onPress={() => openVehicleModal(vehicle)}
                    >
                      <Ionicons name="create" size={18} color="#3b82f6" />
                      <Text style={[styles.cardActionText, { color: '#3b82f6' }]}>Edytuj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.cardAction}
                      onPress={() => deleteVehicle(vehicle)}
                    >
                      <Ionicons name="trash" size={18} color="#ef4444" />
                      <Text style={[styles.cardActionText, { color: '#ef4444' }]}>Usuń</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        ) : activeTab === 'equipment' ? (
          <>
            {/* Equipment Types Management */}
            <TouchableOpacity 
              style={styles.typesButton}
              onPress={() => setTypeModalVisible(true)}
            >
              <Ionicons name="settings" size={20} color="#888" />
              <Text style={styles.typesButtonText}>Zarządzaj typami wyposażenia</Text>
              <Ionicons name="chevron-forward" size={20} color="#888" />
            </TouchableOpacity>

            {equipment.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="construct-outline" size={64} color="#333" />
                <Text style={styles.emptyStateText}>Brak wyposażenia</Text>
                <Text style={styles.emptyStateHint}>Dodaj wyposażenie klikając "+" w nagłówku</Text>
              </View>
            ) : (
              equipment.map(eq => (
                <View key={eq.equipment_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Ionicons name="build" size={24} color="#f59e0b" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>{eq.name}</Text>
                      {eq.type && <Text style={styles.cardSubtitle}>Typ: {eq.type}</Text>}
                      {eq.serial_number && <Text style={styles.cardSerial}>S/N: {eq.serial_number}</Text>}
                    </View>
                  </View>
                  
                  {eq.description && (
                    <Text style={styles.cardDescription}>{eq.description}</Text>
                  )}
                  
                  <View style={styles.assignedRow}>
                    <Text style={styles.assignedLabel}>Przypisany do:</Text>
                    <Text style={[styles.assignedValue, !eq.assigned_to_name && styles.unassigned]}>
                      {eq.assigned_to_name || 'Nieprzypisany'}
                    </Text>
                  </View>
                  
                  <View style={styles.cardActions}>
                    <TouchableOpacity 
                      style={styles.cardAction}
                      onPress={() => openAssignModal('equipment', eq.equipment_id, eq.name)}
                    >
                      <Ionicons name="person-add" size={18} color="#10b981" />
                      <Text style={[styles.cardActionText, { color: '#10b981' }]}>Przypisz</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.cardAction}
                      onPress={() => openEquipmentModal(eq)}
                    >
                      <Ionicons name="create" size={18} color="#3b82f6" />
                      <Text style={[styles.cardActionText, { color: '#3b82f6' }]}>Edytuj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.cardAction}
                      onPress={() => deleteEquipment(eq)}
                    >
                      <Ionicons name="trash" size={18} color="#ef4444" />
                      <Text style={[styles.cardActionText, { color: '#ef4444' }]}>Usuń</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {/* Service Tab - Add Service Button */}
            <TouchableOpacity 
              style={styles.addServiceButton}
              onPress={openServiceModal}
            >
              <Ionicons name="add-circle" size={24} color="#8b5cf6" />
              <Text style={styles.addServiceButtonText}>Dodaj wpis serwisowy</Text>
            </TouchableOpacity>

            {services.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="build-outline" size={64} color="#333" />
                <Text style={styles.emptyStateText}>Brak wpisów serwisowych</Text>
                <Text style={styles.emptyStateHint}>Dodaj wpis klikając przycisk powyżej</Text>
              </View>
            ) : (
              services.map(service => (
                <View key={service.service_id} style={styles.serviceCard}>
                  <View style={styles.serviceHeader}>
                    <View style={[styles.cardIconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                      <Ionicons name="build" size={24} color="#8b5cf6" />
                    </View>
                    <View style={styles.serviceInfo}>
                      <Text style={styles.serviceType}>{service.service_type}</Text>
                      <Text style={styles.serviceVehicle}>
                        <Ionicons name="car" size={14} color="#888" /> {service.vehicle_plate} {service.vehicle_info && `(${service.vehicle_info})`}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.serviceDateRow}>
                    <Ionicons name="calendar" size={16} color="#8b5cf6" />
                    <Text style={styles.serviceDate}>{formatServiceDate(service.service_date)}</Text>
                  </View>
                  
                  {service.notes && (
                    <View style={styles.serviceNotesRow}>
                      <Text style={styles.serviceNotesLabel}>Uwagi:</Text>
                      <Text style={styles.serviceNotes}>{service.notes}</Text>
                    </View>
                  )}
                  
                  <View style={styles.serviceFooter}>
                    <Text style={styles.serviceCreatedBy}>
                      Dodał: {service.created_by_name}
                    </Text>
                    <TouchableOpacity onPress={() => deleteService(service)}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Vehicle Modal */}
      <Modal visible={vehicleModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingVehicle ? 'Edytuj pojazd' : 'Dodaj pojazd'}
                </Text>
                <TouchableOpacity onPress={() => setVehicleModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modalBody}>
                <Text style={styles.inputLabel}>Numer rejestracyjny *</Text>
                <TextInput
                  style={styles.input}
                  value={vehicleForm.plate_number}
                  onChangeText={(text) => setVehicleForm(prev => ({ ...prev, plate_number: text }))}
                  placeholder="np. KI 12345"
                  placeholderTextColor="#666"
                  autoCapitalize="characters"
                />
                
                <Text style={styles.inputLabel}>Marka</Text>
                <TextInput
                  style={styles.input}
                  value={vehicleForm.brand}
                  onChangeText={(text) => setVehicleForm(prev => ({ ...prev, brand: text }))}
                  placeholder="np. Volkswagen"
                  placeholderTextColor="#666"
                />
                
                <Text style={styles.inputLabel}>Model</Text>
                <TextInput
                  style={styles.input}
                  value={vehicleForm.model}
                  onChangeText={(text) => setVehicleForm(prev => ({ ...prev, model: text }))}
                  placeholder="np. Caddy"
                  placeholderTextColor="#666"
                />
                
                <Text style={styles.inputLabel}>Rok produkcji</Text>
                <TextInput
                  style={styles.input}
                  value={vehicleForm.year}
                  onChangeText={(text) => setVehicleForm(prev => ({ ...prev, year: text }))}
                  placeholder="np. 2023"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
                
                <TouchableOpacity style={styles.saveButton} onPress={saveVehicle}>
                  <Text style={styles.saveButtonText}>Zapisz</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Equipment Modal */}
      <Modal visible={equipmentModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingEquipment ? 'Edytuj wyposażenie' : 'Dodaj wyposażenie'}
                </Text>
                <TouchableOpacity onPress={() => setEquipmentModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modalBody}>
                <Text style={styles.inputLabel}>Nazwa *</Text>
                <TextInput
                  style={styles.input}
                  value={equipmentForm.name}
                  onChangeText={(text) => setEquipmentForm(prev => ({ ...prev, name: text }))}
                  placeholder="np. Spawarka światłowodowa"
                  placeholderTextColor="#666"
                />
                
                <Text style={styles.inputLabel}>Typ</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelector}>
                  {equipmentTypes.map(type => (
                    <TouchableOpacity
                      key={type.type_id}
                      style={[
                        styles.typeOption,
                        equipmentForm.type === type.name && styles.typeOptionSelected
                      ]}
                      onPress={() => setEquipmentForm(prev => ({ ...prev, type: type.name }))}
                    >
                      <Text style={[
                        styles.typeOptionText,
                        equipmentForm.type === type.name && styles.typeOptionTextSelected
                      ]}>
                        {type.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                <Text style={styles.inputLabel}>Numer seryjny</Text>
                <TextInput
                  style={styles.input}
                  value={equipmentForm.serial_number}
                  onChangeText={(text) => setEquipmentForm(prev => ({ ...prev, serial_number: text }))}
                  placeholder="np. SN123456"
                  placeholderTextColor="#666"
                />
                
                <Text style={styles.inputLabel}>Opis</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={equipmentForm.description}
                  onChangeText={(text) => setEquipmentForm(prev => ({ ...prev, description: text }))}
                  placeholder="Dodatkowe informacje..."
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                />
                
                <TouchableOpacity style={styles.saveButton} onPress={saveEquipment}>
                  <Text style={styles.saveButtonText}>Zapisz</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Equipment Types Modal */}
      <Modal visible={typeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Typy wyposażenia</Text>
              <TouchableOpacity onPress={() => setTypeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <View style={styles.addTypeRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={newTypeName}
                  onChangeText={setNewTypeName}
                  placeholder="Nazwa nowego typu..."
                  placeholderTextColor="#666"
                />
                <TouchableOpacity style={styles.addTypeButton} onPress={addEquipmentType}>
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={{ maxHeight: 300, marginTop: 16 }}>
                {equipmentTypes.map(type => (
                  <View key={type.type_id} style={styles.typeRow}>
                    <Text style={styles.typeName}>{type.name}</Text>
                    <TouchableOpacity onPress={() => deleteEquipmentType(type.type_id)}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {equipmentTypes.length === 0 && (
                  <Text style={styles.noTypes}>Brak typów wyposażenia</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Modal */}
      <Modal visible={assignModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Przypisz: {assignTarget?.name}
              </Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <TouchableOpacity 
                style={styles.workerOption}
                onPress={() => assignToWorker(null)}
              >
                <Ionicons name="close-circle" size={24} color="#888" />
                <Text style={styles.workerOptionText}>Odpisz (brak przypisania)</Text>
              </TouchableOpacity>
              
              {workers.map(worker => (
                <TouchableOpacity 
                  key={worker.user_id}
                  style={styles.workerOption}
                  onPress={() => assignToWorker(worker.user_id)}
                >
                  <Ionicons name="person-circle" size={24} color="#3b82f6" />
                  <Text style={styles.workerOptionText}>{worker.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Service Modal */}
      <Modal visible={serviceModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="build" size={24} color="#8b5cf6" />
                  <Text style={styles.modalTitle}>Dodaj wpis serwisowy</Text>
                </View>
                <TouchableOpacity onPress={() => setServiceModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                style={styles.modalBody}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                <Text style={styles.inputLabel}>Pojazd *</Text>
                <TouchableOpacity 
                  style={styles.selectInput}
                  onPress={() => setShowVehiclePicker(!showVehiclePicker)}
                >
                  <Text style={serviceForm.vehicle_id ? styles.selectInputText : styles.selectInputPlaceholder}>
                    {serviceForm.vehicle_id 
                      ? vehicles.find(v => v.vehicle_id === serviceForm.vehicle_id)?.plate_number || 'Wybierz pojazd'
                      : 'Wybierz pojazd z listy'}
                  </Text>
                  <Ionicons name={showVehiclePicker ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
                </TouchableOpacity>
                
                {showVehiclePicker && (
                  <View style={styles.vehiclePickerList}>
                    {vehicles.length === 0 ? (
                      <Text style={styles.noVehiclesText}>Brak pojazdów - dodaj pojazd w zakładce "Pojazdy"</Text>
                    ) : (
                      vehicles.map(vehicle => (
                        <TouchableOpacity
                          key={vehicle.vehicle_id}
                          style={[
                            styles.vehiclePickerItem,
                            serviceForm.vehicle_id === vehicle.vehicle_id && styles.vehiclePickerItemSelected
                          ]}
                          onPress={() => {
                            setServiceForm(prev => ({ ...prev, vehicle_id: vehicle.vehicle_id }));
                            setShowVehiclePicker(false);
                          }}
                        >
                          <Ionicons name="car" size={18} color={serviceForm.vehicle_id === vehicle.vehicle_id ? '#8b5cf6' : '#888'} />
                          <Text style={[
                            styles.vehiclePickerItemText,
                            serviceForm.vehicle_id === vehicle.vehicle_id && styles.vehiclePickerItemTextSelected
                          ]}>
                            {vehicle.plate_number} {vehicle.brand && vehicle.model && `- ${vehicle.brand} ${vehicle.model}`}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
                
                <Text style={styles.inputLabel}>Serwis *</Text>
                <TextInput
                  style={styles.input}
                  value={serviceForm.service_type}
                  onChangeText={(text) => setServiceForm(prev => ({ ...prev, service_type: text }))}
                  placeholder="np. Wymiana oleju"
                  placeholderTextColor="#666"
                />
                
                <Text style={styles.inputLabel}>Data *</Text>
                <TextInput
                  style={styles.input}
                  value={serviceForm.service_date}
                  onChangeText={(text) => setServiceForm(prev => ({ ...prev, service_date: text }))}
                  placeholder="RRRR-MM-DD (np. 2026-02-15)"
                  placeholderTextColor="#666"
                />
                
                <Text style={styles.inputLabel}>Dodatkowe uwagi</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={serviceForm.notes}
                  onChangeText={(text) => setServiceForm(prev => ({ ...prev, notes: text }))}
                  placeholder="np. 160 tys. km"
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                />
                
                <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#8b5cf6' }]} onPress={saveService}>
                  <Text style={styles.saveButtonText}>Zapisz wpis serwisowy</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* History Modal */}
      <Modal visible={historyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.historyTitleRow}>
                <Ionicons name="time" size={24} color="#f59e0b" />
                <Text style={styles.modalTitle}>Historia zmian</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            
            {historyLoading ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Ładowanie historii...</Text>
              </View>
            ) : (
              <ScrollView style={styles.historyList}>
                {historyLogs.length === 0 ? (
                  <View style={styles.historyEmpty}>
                    <Ionicons name="document-text-outline" size={48} color="#444" />
                    <Text style={styles.historyEmptyText}>Brak historii zmian</Text>
                  </View>
                ) : (
                  historyLogs.map((log, index) => {
                    const { icon, color } = getActionIcon(log.action_type);
                    return (
                      <View key={log.log_id || index} style={styles.historyItem}>
                        <View style={styles.timelineLine}>
                          <View style={[styles.timelineDot, { backgroundColor: color }]}>
                            <Ionicons name={icon as any} size={14} color="#fff" />
                          </View>
                          {index < historyLogs.length - 1 && <View style={styles.timelineConnector} />}
                        </View>
                        <View style={styles.historyContent}>
                          <Text style={styles.historyDescription}>{log.action_description}</Text>
                          <View style={styles.historyMeta}>
                            <Text style={styles.historyUser}>
                              <Ionicons name="person-outline" size={12} color="#888" /> {log.user_name}
                            </Text>
                            <Text style={styles.historyDate}>
                              {formatInWarsaw(log.timestamp, 'd MMM yyyy, HH:mm')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionButton: {
    padding: 4,
  },
  addButton: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  emptyStateHint: {
    color: '#444',
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  cardSerial: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  cardDescription: {
    color: '#888',
    fontSize: 13,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  assignedLabel: {
    color: '#888',
    fontSize: 13,
  },
  assignedValue: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  unassigned: {
    color: '#666',
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 16,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  typesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  typesButtonText: {
    flex: 1,
    color: '#888',
    fontSize: 14,
  },
  // Employee View
  section: {
    margin: 16,
    padding: 16,
    backgroundColor: '#111',
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  assetIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetInfo: {
    flex: 1,
  },
  assetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  assetSubtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  equipmentCard: {
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  equipmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  equipmentName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  equipmentType: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  equipmentSerial: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  equipmentDesc: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  // Modal styles
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
    borderBottomColor: '#333',
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
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 4,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    marginVertical: 8,
  },
  typeOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 8,
  },
  typeOptionSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  typeOptionText: {
    color: '#888',
    fontSize: 13,
  },
  typeOptionTextSelected: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addTypeButton: {
    backgroundColor: '#10b981',
    padding: 12,
    borderRadius: 10,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  typeName: {
    color: '#fff',
    fontSize: 14,
  },
  noTypes: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  workerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 12,
  },
  workerOptionText: {
    color: '#fff',
    fontSize: 15,
  },
  // History styles
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyLoading: {
    padding: 40,
    alignItems: 'center',
  },
  historyList: {
    padding: 16,
    maxHeight: 500,
  },
  historyEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  historyEmptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 12,
  },
  historyItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timelineLine: {
    width: 40,
    alignItems: 'center',
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: '#333',
    marginTop: -2,
    marginBottom: -2,
  },
  historyContent: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginLeft: 8,
    marginBottom: 12,
  },
  historyDescription: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  historyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  historyUser: {
    color: '#888',
    fontSize: 12,
  },
  historyDate: {
    color: '#666',
    fontSize: 11,
  },
  // Service styles
  addServiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderStyle: 'dashed',
    gap: 10,
  },
  addServiceButtonText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '600',
  },
  serviceCard: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  serviceVehicle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  serviceDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 8,
  },
  serviceDate: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: '600',
  },
  serviceNotesRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  serviceNotesLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  serviceNotes: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  serviceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  serviceCreatedBy: {
    color: '#666',
    fontSize: 12,
  },
  // Vehicle picker styles
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0a0a0a',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectInputText: {
    color: '#fff',
    fontSize: 15,
  },
  selectInputPlaceholder: {
    color: '#666',
    fontSize: 15,
  },
  vehiclePickerList: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 8,
    maxHeight: 200,
  },
  vehiclePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 10,
  },
  vehiclePickerItemSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  vehiclePickerItemText: {
    color: '#ccc',
    fontSize: 14,
  },
  vehiclePickerItemTextSelected: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  noVehiclesText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
});
