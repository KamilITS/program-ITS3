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
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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

interface Refueling {
  refueling_id: string;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_info: string;
  user_id: string;
  user_name: string;
  liters: number;
  amount: number;
  odometer: number;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  timestamp: string;
}

export default function Vehicles() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [services, setServices] = useState<VehicleService[]>([]);
  const [refuelingRecords, setRefuelingRecords] = useState<Refueling[]>([]);
  const [refuelingStats, setRefuelingStats] = useState<any[]>([]);
  const [showRefuelingStats, setShowRefuelingStats] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'equipment' | 'service' | 'refueling'>('vehicles');
  
  // Modals
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [equipmentModalVisible, setEquipmentModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [refuelingModalVisible, setRefuelingModalVisible] = useState(false);
  
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Service filter
  const [serviceFilterVehicle, setServiceFilterVehicle] = useState<string>('all');
  const [showServiceFilterPicker, setShowServiceFilterPicker] = useState(false);
  
  // Refueling form
  const [refuelingForm, setRefuelingForm] = useState({
    liters: '',
    amount: '',
    odometer: '',
    vehicle_id: '',  // For admin to select vehicle
  });
  const [isSubmittingRefueling, setIsSubmittingRefueling] = useState(false);
  const [showRefuelingVehiclePicker, setShowRefuelingVehiclePicker] = useState(false);
  
  // Refueling filters (admin)
  const [refuelingFilterVehicle, setRefuelingFilterVehicle] = useState<string>('all');
  const [refuelingFilterWorker, setRefuelingFilterWorker] = useState<string>('all');
  const [showRefuelingVehicleFilter, setShowRefuelingVehicleFilter] = useState(false);
  const [showRefuelingWorkerFilter, setShowRefuelingWorkerFilter] = useState(false);
  
  // Assign
  const [assignTarget, setAssignTarget] = useState<{ type: 'vehicle' | 'equipment', id: string, name: string } | null>(null);
  const [lastAssignment, setLastAssignment] = useState<{
    workerName: string;
    items: Array<{ name: string; serialNumber: string; type: string }>;
    date: Date;
  } | null>(null);
  const [showAssignmentReportModal, setShowAssignmentReportModal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  
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
        const [vehiclesData, equipmentData, typesData, workersData, servicesData, refuelingData, refuelingStatsData] = await Promise.all([
          apiFetch('/api/vehicles'),
          apiFetch('/api/equipment'),
          apiFetch('/api/equipment/types'),
          apiFetch('/api/workers'),
          apiFetch('/api/services'),
          apiFetch('/api/refueling'),
          apiFetch('/api/refueling/stats'),
        ]);
        setVehicles(vehiclesData);
        setEquipment(equipmentData);
        setEquipmentTypes(typesData);
        setWorkers(workersData);
        setServices(servicesData);
        setRefuelingRecords(refuelingData);
        setRefuelingStats(refuelingStatsData);
      } else {
        // Employee - load only their assets and their refueling records
        const [assets, refuelingData] = await Promise.all([
          apiFetch(`/api/workers/${user?.user_id}/assets`),
          apiFetch('/api/refueling'),
        ]);
        setMyVehicles(assets.vehicles || []);
        setMyEquipment(assets.equipment || []);
        setRefuelingRecords(refuelingData);
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
      Alert.alert('Błąd', 'Wybierz datę serwisu');
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

  const onDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
      const formattedDate = format(date, 'yyyy-MM-dd');
      setServiceForm(prev => ({ ...prev, service_date: formattedDate }));
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

  // Get filtered and sorted services
  const getFilteredServices = () => {
    let filtered = [...services];
    
    // Filter by vehicle
    if (serviceFilterVehicle !== 'all') {
      filtered = filtered.filter(s => s.vehicle_id === serviceFilterVehicle);
    }
    
    // Sort by date descending (newest first)
    filtered.sort((a, b) => {
      return new Date(b.service_date).getTime() - new Date(a.service_date).getTime();
    });
    
    return filtered;
  };

  const formatServiceDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}.${month}.${year}`;
    } catch {
      return dateStr;
    }
  };

  // Refueling functions
  const openRefuelingModal = async () => {
    // Check if employee has an assigned vehicle
    if (!isAdmin && myVehicles.length === 0) {
      Alert.alert('Błąd', 'Nie masz przypisanego pojazdu');
      return;
    }
    
    // Request location permissions (skip on web)
    if (Platform.OS !== 'web') {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Brak uprawnień GPS',
            'Aby dodać tankowanie, musisz zezwolić na dostęp do lokalizacji.'
          );
          return;
        }
      } catch (error) {
        console.error('Location permission error:', error);
      }
    }
    
    setRefuelingForm({ liters: '', amount: '', odometer: '', vehicle_id: '' });
    setShowRefuelingVehiclePicker(false);
    setRefuelingModalVisible(true);
  };

  const addRefueling = async () => {
    if (!refuelingForm.liters || parseFloat(refuelingForm.liters) <= 0) {
      Alert.alert('Błąd', 'Podaj ilość litrów');
      return;
    }
    if (!refuelingForm.amount || parseFloat(refuelingForm.amount) <= 0) {
      Alert.alert('Błąd', 'Podaj kwotę tankowania');
      return;
    }
    if (!refuelingForm.odometer || parseInt(refuelingForm.odometer) <= 0) {
      Alert.alert('Błąd', 'Podaj przebieg pojazdu');
      return;
    }
    
    // Admin must select a vehicle
    if (isAdmin && !refuelingForm.vehicle_id) {
      Alert.alert('Błąd', 'Wybierz pojazd z listy');
      return;
    }
    
    // Employee must have assigned vehicle
    if (!isAdmin && myVehicles.length === 0) {
      Alert.alert('Błąd', 'Nie masz przypisanego pojazdu');
      return;
    }
    
    setIsSubmittingRefueling(true);
    
    try {
      // Get current location and address
      let location = null;
      let locationName = '';
      
      if (Platform.OS !== 'web') {
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          
          // Reverse geocode to get address
          if (location) {
            try {
              const [address] = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              });
              if (address) {
                const parts = [];
                if (address.street) parts.push(address.street);
                if (address.streetNumber) parts[parts.length - 1] += ` ${address.streetNumber}`;
                if (address.city) parts.push(address.city);
                if (address.region && address.region !== address.city) parts.push(address.region);
                locationName = parts.join(', ') || '';
              }
            } catch (geocodeError) {
              console.warn('Reverse geocode failed:', geocodeError);
            }
          }
        } catch (locError) {
          console.warn('Could not get location:', locError);
        }
      }
      
      const body: any = {
        liters: parseFloat(refuelingForm.liters),
        amount: parseFloat(refuelingForm.amount),
        odometer: parseInt(refuelingForm.odometer),
      };
      
      // Admin sends selected vehicle_id
      if (isAdmin && refuelingForm.vehicle_id) {
        body.vehicle_id = refuelingForm.vehicle_id;
      }
      
      if (location) {
        body.latitude = location.coords.latitude;
        body.longitude = location.coords.longitude;
        body.location_name = locationName;
      }
      
      await apiFetch('/api/refueling', {
        method: 'POST',
        body,
      });
      
      Alert.alert('Sukces', 'Tankowanie zostało zapisane');
      setRefuelingModalVisible(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zapisać tankowania');
    } finally {
      setIsSubmittingRefueling(false);
    }
  };

  const deleteRefueling = (record: Refueling) => {
    Alert.alert(
      'Usuń wpis tankowania',
      `Czy na pewno chcesz usunąć tankowanie ${record.liters}L dla ${record.vehicle_plate}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/refueling/${record.refueling_id}`, { method: 'DELETE' });
              loadData();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  // Get filtered refueling records (for admin)
  const getFilteredRefuelings = () => {
    let filtered = [...refuelingRecords];
    
    if (refuelingFilterVehicle !== 'all') {
      filtered = filtered.filter(r => r.vehicle_id === refuelingFilterVehicle);
    }
    
    if (refuelingFilterWorker !== 'all') {
      filtered = filtered.filter(r => r.user_id === refuelingFilterWorker);
    }
    
    return filtered;
  };

  const formatRefuelingDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const warsawDate = toZonedTime(date, 'Europe/Warsaw');
      return format(warsawDate, 'd MMM yyyy, HH:mm', { locale: pl });
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
      
      // If assigning (not unassigning), show PDF report option
      if (workerId) {
        const worker = workers.find(w => w.user_id === workerId);
        let itemInfo: { name: string; serialNumber: string; type: string };
        
        if (assignTarget.type === 'vehicle') {
          const vehicle = vehicles.find(v => v.vehicle_id === assignTarget.id);
          itemInfo = {
            name: `${vehicle?.brand || ''} ${vehicle?.model || ''}`.trim() || assignTarget.name,
            serialNumber: vehicle?.plate_number || assignTarget.name,
            type: 'Pojazd'
          };
        } else {
          const eq = equipment.find(e => e.equipment_id === assignTarget.id);
          itemInfo = {
            name: eq?.name || assignTarget.name,
            serialNumber: eq?.serial_number || '-',
            type: 'Wyposażenie'
          };
        }
        
        setLastAssignment({
          workerName: worker?.name || 'Nieznany pracownik',
          items: [itemInfo],
          date: new Date()
        });
        setShowAssignmentReportModal(true);
      } else {
        Alert.alert('Sukces', 'Odpisano od pracownika');
      }
      
      loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  // Unassign equipment from worker (take back)
  const unassignEquipment = (eq: Equipment) => {
    Alert.alert(
      'Zabierz wyposażenie',
      `Czy na pewno chcesz zabrać "${eq.name}" od ${eq.assigned_to_name || 'pracownika'}?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zabierz',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/equipment/${eq.equipment_id}/assign`, {
                method: 'POST',
                body: { worker_id: null },
              });
              Alert.alert('Sukces', 'Wyposażenie zostało odebrane');
              loadData();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  // Generate PDF report for assignment
  const generateAssignmentPdf = async () => {
    if (!lastAssignment) return;
    
    setGeneratingPdf(true);
    
    try {
      const formattedDate = format(lastAssignment.date, "d MMMM yyyy, HH:mm", { locale: pl });
      
      const itemsRows = lastAssignment.items.map((item, index) => `
        <tr>
          <td style="border: 1px solid #333; padding: 10px; text-align: center;">${index + 1}</td>
          <td style="border: 1px solid #333; padding: 10px;">${item.type}</td>
          <td style="border: 1px solid #333; padding: 10px;">${item.name}</td>
          <td style="border: 1px solid #333; padding: 10px; text-align: center; font-family: monospace;">${item.serialNumber}</td>
        </tr>
      `).join('');
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Protokół przekazania urządzeń</title>
          <style>
            body {
              font-family: 'Helvetica Neue', Arial, sans-serif;
              padding: 40px;
              color: #333;
              line-height: 1.6;
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .header h1 {
              font-size: 24px;
              margin: 0 0 10px 0;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            .header p {
              font-size: 14px;
              color: #666;
              margin: 0;
            }
            .info-section {
              margin-bottom: 30px;
              background: #f9f9f9;
              padding: 20px;
              border-radius: 8px;
            }
            .info-row {
              display: flex;
              margin-bottom: 10px;
            }
            .info-label {
              font-weight: bold;
              width: 200px;
              color: #555;
            }
            .info-value {
              flex: 1;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th {
              background: #333;
              color: white;
              padding: 12px;
              text-align: left;
              font-weight: 600;
            }
            td {
              border: 1px solid #ddd;
              padding: 10px;
            }
            tr:nth-child(even) {
              background: #f9f9f9;
            }
            .summary {
              margin-top: 30px;
              padding: 15px;
              background: #e8f5e9;
              border-radius: 8px;
              border-left: 4px solid #4caf50;
            }
            .summary strong {
              font-size: 18px;
            }
            .signature-section {
              margin-top: 60px;
              padding-top: 30px;
              border-top: 1px solid #ddd;
            }
            .signature-note {
              font-style: italic;
              color: #666;
              margin-bottom: 40px;
              font-size: 14px;
            }
            .signature-box {
              display: flex;
              justify-content: space-between;
              margin-top: 20px;
            }
            .signature-field {
              width: 45%;
              text-align: center;
            }
            .signature-line {
              border-top: 1px solid #333;
              margin-top: 60px;
              padding-top: 10px;
              font-size: 12px;
              color: #666;
            }
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 11px;
              color: #999;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Protokół przekazania urządzeń</h1>
            <p>ITS Kielce - Magazyn</p>
          </div>
          
          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Data przypisania:</span>
              <span class="info-value">${formattedDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Pracownik:</span>
              <span class="info-value"><strong>${lastAssignment.workerName}</strong></span>
            </div>
          </div>
          
          <h3>Przekazane urządzenia:</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">Lp.</th>
                <th style="width: 120px;">Typ</th>
                <th>Nazwa urządzenia</th>
                <th style="width: 180px;">Numer seryjny / Rejestracja</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          
          <div class="summary">
            <strong>Podsumowanie:</strong> Łączna liczba przekazanych urządzeń: <strong>${lastAssignment.items.length}</strong>
          </div>
          
          <div class="signature-section">
            <p class="signature-note">„Potwierdzam odbiór wyżej wymienionych urządzeń"</p>
            
            <div class="signature-box">
              <div class="signature-field">
                <div class="signature-line">Data i podpis przekazującego</div>
              </div>
              <div class="signature-field">
                <div class="signature-line">Data i podpis odbierającego (${lastAssignment.workerName})</div>
              </div>
            </div>
          </div>
          
          <div class="footer">
            Dokument wygenerowany automatycznie przez system Magazyn ITS Kielce<br>
            ${formattedDate}
          </div>
        </body>
        </html>
      `;
      
      if (Platform.OS === 'web') {
        // On web, open print dialog
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        // On mobile, generate PDF and share
        const { uri } = await Print.printToFileAsync({ html });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Protokół przekazania urządzeń',
            UTI: 'com.adobe.pdf'
          });
        } else {
          // Fallback to print preview
          await Print.printAsync({ uri });
        }
      }
      
      setShowAssignmentReportModal(false);
    } catch (error: any) {
      console.error('PDF generation error:', error);
      Alert.alert('Błąd', 'Nie udało się wygenerować raportu PDF');
    } finally {
      setGeneratingPdf(false);
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

          {/* Refueling Section for Employee */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="water" size={24} color="#10b981" />
              <Text style={styles.sectionTitle}>Tankowanie</Text>
            </View>
            
            {myVehicles.length > 0 && (
              <TouchableOpacity 
                style={styles.addRefuelingButtonEmployee}
                onPress={openRefuelingModal}
              >
                <Ionicons name="add-circle" size={24} color="#10b981" />
                <Text style={styles.addRefuelingButtonTextEmployee}>Dodaj tankowanie</Text>
              </TouchableOpacity>
            )}
            
            {myVehicles.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="water-outline" size={40} color="#444" />
                <Text style={styles.emptyText}>Przypisz pojazd, aby dodawać tankowania</Text>
              </View>
            ) : refuelingRecords.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="water-outline" size={40} color="#444" />
                <Text style={styles.emptyText}>Brak wpisów tankowania</Text>
              </View>
            ) : (
              refuelingRecords.map(record => (
                <View key={record.refueling_id} style={styles.refuelingCardEmployee}>
                  <View style={styles.refuelingRowTop}>
                    <View style={styles.refuelingMainInfo}>
                      <Text style={styles.refuelingLitersEmployee}>{record.liters} L</Text>
                      <Text style={styles.refuelingAmountEmployee}>{record.amount.toFixed(2)} PLN</Text>
                    </View>
                    <Text style={styles.refuelingOdometerEmployee}>{record.odometer.toLocaleString()} km</Text>
                  </View>
                  <View style={styles.refuelingRowBottom}>
                    <Text style={styles.refuelingDateEmployee}>{formatRefuelingDate(record.timestamp)}</Text>
                    {(record.location_name || (record.latitude && record.longitude)) && (
                      <View style={styles.refuelingGpsEmployee}>
                        <Ionicons name="location" size={12} color="#10b981" />
                        <Text style={styles.refuelingGpsTextEmployee}>
                          {record.location_name || `${record.latitude?.toFixed(4)}, ${record.longitude?.toFixed(4)}`}
                        </Text>
                      </View>
                    )}
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

        {/* Refueling Modal for Employee */}
        <Modal visible={refuelingModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="water" size={24} color="#10b981" />
                    <Text style={styles.modalTitle}>Dodaj tankowanie</Text>
                  </View>
                  <TouchableOpacity onPress={() => setRefuelingModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#888" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView 
                  style={styles.modalBody}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 40 }}
                >
                  {myVehicles.length > 0 && (
                    <View style={styles.refuelingVehicleInfo}>
                      <Ionicons name="car" size={20} color="#10b981" />
                      <Text style={styles.refuelingVehicleInfoText}>
                        Pojazd: {myVehicles[0].plate_number} ({myVehicles[0].brand} {myVehicles[0].model})
                      </Text>
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Ilość litrów *</Text>
                  <TextInput
                    style={styles.input}
                    value={refuelingForm.liters}
                    onChangeText={(text) => setRefuelingForm(prev => ({ ...prev, liters: text }))}
                    placeholder="np. 45.5"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                  
                  <Text style={styles.inputLabel}>Kwota (PLN) *</Text>
                  <TextInput
                    style={styles.input}
                    value={refuelingForm.amount}
                    onChangeText={(text) => setRefuelingForm(prev => ({ ...prev, amount: text }))}
                    placeholder="np. 285.00"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                  
                  <Text style={styles.inputLabel}>Przebieg (km) *</Text>
                  <TextInput
                    style={styles.input}
                    value={refuelingForm.odometer}
                    onChangeText={(text) => setRefuelingForm(prev => ({ ...prev, odometer: text }))}
                    placeholder="np. 125000"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                  
                  <View style={styles.refuelingNote}>
                    <Ionicons name="information-circle" size={18} color="#888" />
                    <Text style={styles.refuelingNoteText}>
                      Data, godzina i lokalizacja GPS zostaną zapisane automatycznie.
                    </Text>
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.saveButton, { backgroundColor: '#10b981' }, isSubmittingRefueling && styles.disabledButton]} 
                    onPress={addRefueling}
                    disabled={isSubmittingRefueling}
                  >
                    {isSubmittingRefueling ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Zapisz tankowanie</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'refueling' && styles.activeTab]}
          onPress={() => setActiveTab('refueling')}
        >
          <Ionicons name="water" size={18} color={activeTab === 'refueling' ? '#10b981' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'refueling' && styles.activeTabText]}>
            Tankowanie
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
                    {eq.assigned_to && (
                      <TouchableOpacity 
                        style={styles.cardAction}
                        onPress={() => unassignEquipment(eq)}
                      >
                        <Ionicons name="person-remove" size={18} color="#f59e0b" />
                        <Text style={[styles.cardActionText, { color: '#f59e0b' }]}>Zabierz</Text>
                      </TouchableOpacity>
                    )}
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
        ) : activeTab === 'service' ? (
          <>
            {/* Service Tab - Add Service Button */}
            <TouchableOpacity 
              style={styles.addServiceButton}
              onPress={openServiceModal}
            >
              <Ionicons name="add-circle" size={24} color="#8b5cf6" />
              <Text style={styles.addServiceButtonText}>Dodaj wpis serwisowy</Text>
            </TouchableOpacity>

            {/* Vehicle Filter */}
            <View style={styles.filterContainer}>
              <Text style={styles.filterLabel}>Filtruj po pojeździe:</Text>
              <TouchableOpacity 
                style={styles.filterSelect}
                onPress={() => setShowServiceFilterPicker(!showServiceFilterPicker)}
              >
                <Text style={styles.filterSelectText}>
                  {serviceFilterVehicle === 'all' 
                    ? 'Wszystkie pojazdy' 
                    : vehicles.find(v => v.vehicle_id === serviceFilterVehicle)?.plate_number || 'Wybierz'}
                </Text>
                <Ionicons name={showServiceFilterPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
              </TouchableOpacity>
              
              {showServiceFilterPicker && (
                <View style={styles.filterPickerList}>
                  <TouchableOpacity
                    style={[styles.filterPickerItem, serviceFilterVehicle === 'all' && styles.filterPickerItemSelected]}
                    onPress={() => {
                      setServiceFilterVehicle('all');
                      setShowServiceFilterPicker(false);
                    }}
                  >
                    <Text style={[styles.filterPickerItemText, serviceFilterVehicle === 'all' && styles.filterPickerItemTextSelected]}>
                      Wszystkie pojazdy
                    </Text>
                  </TouchableOpacity>
                  {vehicles.map(vehicle => (
                    <TouchableOpacity
                      key={vehicle.vehicle_id}
                      style={[styles.filterPickerItem, serviceFilterVehicle === vehicle.vehicle_id && styles.filterPickerItemSelected]}
                      onPress={() => {
                        setServiceFilterVehicle(vehicle.vehicle_id);
                        setShowServiceFilterPicker(false);
                      }}
                    >
                      <Ionicons name="car" size={16} color={serviceFilterVehicle === vehicle.vehicle_id ? '#8b5cf6' : '#888'} />
                      <Text style={[styles.filterPickerItemText, serviceFilterVehicle === vehicle.vehicle_id && styles.filterPickerItemTextSelected]}>
                        {vehicle.plate_number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {getFilteredServices().length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="build-outline" size={64} color="#333" />
                <Text style={styles.emptyStateText}>
                  {services.length === 0 ? 'Brak wpisów serwisowych' : 'Brak wpisów dla wybranego pojazdu'}
                </Text>
                <Text style={styles.emptyStateHint}>
                  {services.length === 0 ? 'Dodaj wpis klikając przycisk powyżej' : 'Zmień filtr lub dodaj nowy wpis'}
                </Text>
              </View>
            ) : (
              getFilteredServices().map(service => (
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
        ) : (
          <>
            {/* Refueling Tab */}
            <TouchableOpacity 
              style={styles.addRefuelingButton}
              onPress={openRefuelingModal}
            >
              <Ionicons name="add-circle" size={24} color="#10b981" />
              <Text style={styles.addRefuelingButtonText}>Dodaj tankowanie</Text>
            </TouchableOpacity>

            {/* Filters for Admin */}
            <View style={styles.filterContainer}>
              <Text style={styles.filterLabel}>Filtruj po pojeździe:</Text>
              <TouchableOpacity 
                style={styles.filterSelect}
                onPress={() => {
                  setShowRefuelingVehicleFilter(!showRefuelingVehicleFilter);
                  setShowRefuelingWorkerFilter(false);
                }}
              >
                <Text style={styles.filterSelectText}>
                  {refuelingFilterVehicle === 'all' 
                    ? 'Wszystkie pojazdy' 
                    : vehicles.find(v => v.vehicle_id === refuelingFilterVehicle)?.plate_number || 'Wybierz'}
                </Text>
                <Ionicons name={showRefuelingVehicleFilter ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
              </TouchableOpacity>
              
              {showRefuelingVehicleFilter && (
                <View style={styles.filterPickerList}>
                  <TouchableOpacity
                    style={[styles.filterPickerItem, refuelingFilterVehicle === 'all' && styles.filterPickerItemSelected]}
                    onPress={() => {
                      setRefuelingFilterVehicle('all');
                      setShowRefuelingVehicleFilter(false);
                    }}
                  >
                    <Text style={[styles.filterPickerItemText, refuelingFilterVehicle === 'all' && styles.filterPickerItemTextSelected]}>
                      Wszystkie pojazdy
                    </Text>
                  </TouchableOpacity>
                  {vehicles.map(vehicle => (
                    <TouchableOpacity
                      key={vehicle.vehicle_id}
                      style={[styles.filterPickerItem, refuelingFilterVehicle === vehicle.vehicle_id && styles.filterPickerItemSelected]}
                      onPress={() => {
                        setRefuelingFilterVehicle(vehicle.vehicle_id);
                        setShowRefuelingVehicleFilter(false);
                      }}
                    >
                      <Ionicons name="car" size={16} color={refuelingFilterVehicle === vehicle.vehicle_id ? '#10b981' : '#888'} />
                      <Text style={[styles.filterPickerItemText, refuelingFilterVehicle === vehicle.vehicle_id && styles.filterPickerItemTextSelected]}>
                        {vehicle.plate_number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            
            <View style={styles.filterContainer}>
              <Text style={styles.filterLabel}>Filtruj po pracowniku:</Text>
              <TouchableOpacity 
                style={styles.filterSelect}
                onPress={() => {
                  setShowRefuelingWorkerFilter(!showRefuelingWorkerFilter);
                  setShowRefuelingVehicleFilter(false);
                }}
              >
                <Text style={styles.filterSelectText}>
                  {refuelingFilterWorker === 'all' 
                    ? 'Wszyscy pracownicy' 
                    : workers.find(w => w.user_id === refuelingFilterWorker)?.name || 'Wybierz'}
                </Text>
                <Ionicons name={showRefuelingWorkerFilter ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
              </TouchableOpacity>
              
              {showRefuelingWorkerFilter && (
                <View style={styles.filterPickerList}>
                  <TouchableOpacity
                    style={[styles.filterPickerItem, refuelingFilterWorker === 'all' && styles.filterPickerItemSelected]}
                    onPress={() => {
                      setRefuelingFilterWorker('all');
                      setShowRefuelingWorkerFilter(false);
                    }}
                  >
                    <Text style={[styles.filterPickerItemText, refuelingFilterWorker === 'all' && styles.filterPickerItemTextSelected]}>
                      Wszyscy pracownicy
                    </Text>
                  </TouchableOpacity>
                  {workers.map(worker => (
                    <TouchableOpacity
                      key={worker.user_id}
                      style={[styles.filterPickerItem, refuelingFilterWorker === worker.user_id && styles.filterPickerItemSelected]}
                      onPress={() => {
                        setRefuelingFilterWorker(worker.user_id);
                        setShowRefuelingWorkerFilter(false);
                      }}
                    >
                      <Ionicons name="person" size={16} color={refuelingFilterWorker === worker.user_id ? '#10b981' : '#888'} />
                      <Text style={[styles.filterPickerItemText, refuelingFilterWorker === worker.user_id && styles.filterPickerItemTextSelected]}>
                        {worker.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {getFilteredRefuelings().length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="water-outline" size={64} color="#333" />
                <Text style={styles.emptyStateText}>
                  {refuelingRecords.length === 0 ? 'Brak wpisów tankowania' : 'Brak wpisów dla wybranych filtrów'}
                </Text>
                <Text style={styles.emptyStateHint}>
                  {refuelingRecords.length === 0 ? 'Dodaj wpis klikając przycisk powyżej' : 'Zmień filtry lub dodaj nowy wpis'}
                </Text>
              </View>
            ) : (
              getFilteredRefuelings().map(record => (
                <View key={record.refueling_id} style={styles.refuelingCard}>
                  <View style={styles.refuelingHeader}>
                    <View style={[styles.cardIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Ionicons name="water" size={24} color="#10b981" />
                    </View>
                    <View style={styles.refuelingInfo}>
                      <Text style={styles.refuelingLiters}>{record.liters} L</Text>
                      <Text style={styles.refuelingVehicle}>
                        <Ionicons name="car" size={14} color="#888" /> {record.vehicle_plate} {record.vehicle_info && `(${record.vehicle_info})`}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.refuelingDetails}>
                    <View style={styles.refuelingDetailRow}>
                      <Ionicons name="cash" size={16} color="#10b981" />
                      <Text style={styles.refuelingDetailText}>{record.amount.toFixed(2)} PLN</Text>
                    </View>
                    <View style={styles.refuelingDetailRow}>
                      <Ionicons name="speedometer" size={16} color="#10b981" />
                      <Text style={styles.refuelingDetailText}>{record.odometer.toLocaleString()} km</Text>
                    </View>
                  </View>
                  
                  <View style={styles.refuelingDateRow}>
                    <Ionicons name="time" size={16} color="#888" />
                    <Text style={styles.refuelingDate}>{formatRefuelingDate(record.timestamp)}</Text>
                  </View>
                  
                  {(record.location_name || (record.latitude && record.longitude)) && (
                    <View style={styles.refuelingLocationRow}>
                      <Ionicons name="location" size={14} color="#10b981" />
                      <Text style={styles.refuelingLocation}>
                        {record.location_name || `${record.latitude?.toFixed(4)}, ${record.longitude?.toFixed(4)}`}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.refuelingFooter}>
                    <Text style={styles.refuelingCreatedBy}>
                      Dodał: {record.user_name}
                    </Text>
                    <TouchableOpacity onPress={() => deleteRefueling(record)}>
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
                {Platform.OS !== 'ios' && Platform.OS !== 'android' ? (
                  <TextInput
                    style={styles.input}
                    value={serviceForm.service_date}
                    onChangeText={(text) => setServiceForm(prev => ({ ...prev, service_date: text }))}
                    placeholder="RRRR-MM-DD (np. 2026-02-15)"
                    placeholderTextColor="#666"
                  />
                ) : (
                  <>
                    <TouchableOpacity 
                      style={styles.datePickerButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar" size={20} color="#8b5cf6" />
                      <Text style={serviceForm.service_date ? styles.datePickerText : styles.datePickerPlaceholder}>
                        {serviceForm.service_date 
                          ? formatServiceDate(serviceForm.service_date)
                          : 'Wybierz datę z kalendarza'}
                      </Text>
                    </TouchableOpacity>
                    
                    {showDatePicker && (
                      <View style={styles.datePickerContainer}>
                        <DateTimePicker
                          value={selectedDate}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={onDateChange}
                          locale="pl-PL"
                          themeVariant="dark"
                        />
                        {Platform.OS === 'ios' && (
                          <TouchableOpacity 
                            style={styles.datePickerDoneButton}
                            onPress={() => setShowDatePicker(false)}
                          >
                            <Text style={styles.datePickerDoneText}>Gotowe</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}
                
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

      {/* Refueling Modal */}
      <Modal visible={refuelingModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="water" size={24} color="#10b981" />
                  <Text style={styles.modalTitle}>Dodaj tankowanie</Text>
                </View>
                <TouchableOpacity onPress={() => setRefuelingModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                style={styles.modalBody}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                {/* Admin - Vehicle Picker */}
                {isAdmin && (
                  <>
                    <Text style={styles.inputLabel}>Pojazd *</Text>
                    <TouchableOpacity 
                      style={styles.selectInput}
                      onPress={() => setShowRefuelingVehiclePicker(!showRefuelingVehiclePicker)}
                    >
                      <Text style={refuelingForm.vehicle_id ? styles.selectInputText : styles.selectInputPlaceholder}>
                        {refuelingForm.vehicle_id 
                          ? vehicles.find(v => v.vehicle_id === refuelingForm.vehicle_id)?.plate_number || 'Wybierz pojazd'
                          : 'Wybierz pojazd z listy'}
                      </Text>
                      <Ionicons name={showRefuelingVehiclePicker ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
                    </TouchableOpacity>
                    
                    {showRefuelingVehiclePicker && (
                      <View style={styles.vehiclePickerList}>
                        {vehicles.length === 0 ? (
                          <Text style={styles.noVehiclesText}>Brak pojazdów - dodaj pojazd w zakładce "Pojazdy"</Text>
                        ) : (
                          vehicles.map(vehicle => (
                            <TouchableOpacity
                              key={vehicle.vehicle_id}
                              style={[
                                styles.vehiclePickerItem,
                                refuelingForm.vehicle_id === vehicle.vehicle_id && styles.vehiclePickerItemSelected
                              ]}
                              onPress={() => {
                                setRefuelingForm(prev => ({ ...prev, vehicle_id: vehicle.vehicle_id }));
                                setShowRefuelingVehiclePicker(false);
                              }}
                            >
                              <Ionicons name="car" size={18} color={refuelingForm.vehicle_id === vehicle.vehicle_id ? '#10b981' : '#888'} />
                              <Text style={[
                                styles.vehiclePickerItemText,
                                refuelingForm.vehicle_id === vehicle.vehicle_id && { color: '#10b981', fontWeight: '600' }
                              ]}>
                                {vehicle.plate_number} {vehicle.brand && vehicle.model && `- ${vehicle.brand} ${vehicle.model}`}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    )}
                  </>
                )}

                {/* Employee - Show assigned vehicle */}
                {!isAdmin && myVehicles.length > 0 && (
                  <View style={styles.refuelingVehicleInfo}>
                    <Ionicons name="car" size={20} color="#10b981" />
                    <Text style={styles.refuelingVehicleInfoText}>
                      Pojazd: {myVehicles[0].plate_number} ({myVehicles[0].brand} {myVehicles[0].model})
                    </Text>
                  </View>
                )}

                <Text style={styles.inputLabel}>Ilość litrów *</Text>
                <TextInput
                  style={styles.input}
                  value={refuelingForm.liters}
                  onChangeText={(text) => setRefuelingForm(prev => ({ ...prev, liters: text }))}
                  placeholder="np. 45.5"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                />
                
                <Text style={styles.inputLabel}>Kwota (PLN) *</Text>
                <TextInput
                  style={styles.input}
                  value={refuelingForm.amount}
                  onChangeText={(text) => setRefuelingForm(prev => ({ ...prev, amount: text }))}
                  placeholder="np. 285.00"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                />
                
                <Text style={styles.inputLabel}>Przebieg (km) *</Text>
                <TextInput
                  style={styles.input}
                  value={refuelingForm.odometer}
                  onChangeText={(text) => setRefuelingForm(prev => ({ ...prev, odometer: text }))}
                  placeholder="np. 125000"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
                
                <View style={styles.refuelingNote}>
                  <Ionicons name="information-circle" size={18} color="#888" />
                  <Text style={styles.refuelingNoteText}>
                    Data, godzina i lokalizacja GPS zostaną zapisane automatycznie.
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={[styles.saveButton, { backgroundColor: '#10b981' }, isSubmittingRefueling && styles.disabledButton]} 
                  onPress={addRefueling}
                  disabled={isSubmittingRefueling}
                >
                  {isSubmittingRefueling ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Zapisz tankowanie</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assignment Report Modal */}
      <Modal visible={showAssignmentReportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModalContent}>
            <View style={styles.reportModalHeader}>
              <Ionicons name="document-text" size={40} color="#10b981" />
              <Text style={styles.reportModalTitle}>Urządzenie przypisane!</Text>
              <Text style={styles.reportModalSubtitle}>
                Przypisano do: {lastAssignment?.workerName}
              </Text>
            </View>
            
            <View style={styles.reportModalBody}>
              <Text style={styles.reportModalQuestion}>
                Czy chcesz wygenerować protokół przekazania urządzeń (PDF)?
              </Text>
              
              <View style={styles.reportModalInfo}>
                <Text style={styles.reportModalInfoTitle}>Raport będzie zawierał:</Text>
                <View style={styles.reportModalInfoItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={styles.reportModalInfoText}>Datę przypisania</Text>
                </View>
                <View style={styles.reportModalInfoItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={styles.reportModalInfoText}>Dane pracownika</Text>
                </View>
                <View style={styles.reportModalInfoItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={styles.reportModalInfoText}>Listę urządzeń z numerami seryjnymi</Text>
                </View>
                <View style={styles.reportModalInfoItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                  <Text style={styles.reportModalInfoText}>Miejsce na podpis pracownika</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.reportModalButtons}>
              <TouchableOpacity 
                style={styles.reportModalButtonSecondary}
                onPress={() => {
                  setShowAssignmentReportModal(false);
                  if (Platform.OS === 'web') {
                    window.alert('Przypisano do pracownika');
                  } else {
                    Alert.alert('Sukces', 'Przypisano do pracownika');
                  }
                }}
              >
                <Text style={styles.reportModalButtonSecondaryText}>Pomiń</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.reportModalButtonPrimary, generatingPdf && styles.disabledButton]}
                onPress={generateAssignmentPdf}
                disabled={generatingPdf}
              >
                {generatingPdf ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="print" size={20} color="#fff" />
                    <Text style={styles.reportModalButtonPrimaryText}>Generuj PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  // Filter styles
  filterContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  filterLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
  },
  filterSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  filterSelectText: {
    color: '#fff',
    fontSize: 14,
  },
  filterPickerList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 8,
    maxHeight: 200,
  },
  filterPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 10,
  },
  filterPickerItemSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  filterPickerItemText: {
    color: '#ccc',
    fontSize: 14,
  },
  filterPickerItemTextSelected: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  // Date picker styles
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    gap: 10,
  },
  datePickerText: {
    color: '#fff',
    fontSize: 15,
  },
  datePickerPlaceholder: {
    color: '#666',
    fontSize: 15,
  },
  datePickerContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 8,
    padding: 8,
    overflow: 'hidden',
  },
  datePickerDoneButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 8,
  },
  datePickerDoneText: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
  },
  // Refueling styles
  addRefuelingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10b981',
    borderStyle: 'dashed',
    gap: 10,
  },
  addRefuelingButtonText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '600',
  },
  refuelingCard: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  refuelingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refuelingInfo: {
    flex: 1,
  },
  refuelingLiters: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  refuelingVehicle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  refuelingDetails: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 24,
  },
  refuelingDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refuelingDetailText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  refuelingDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 6,
  },
  refuelingDate: {
    color: '#888',
    fontSize: 13,
  },
  refuelingLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  refuelingLocation: {
    color: '#666',
    fontSize: 11,
  },
  refuelingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  refuelingCreatedBy: {
    color: '#666',
    fontSize: 12,
  },
  refuelingVehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
  },
  refuelingVehicleInfoText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '500',
  },
  refuelingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0a0a0a',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 10,
  },
  refuelingNoteText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  disabledButton: {
    opacity: 0.6,
  },
  // Employee refueling styles
  addRefuelingButtonEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  addRefuelingButtonTextEmployee: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  refuelingCardEmployee: {
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  refuelingRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refuelingMainInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  refuelingLitersEmployee: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '700',
  },
  refuelingAmountEmployee: {
    color: '#fff',
    fontSize: 14,
  },
  refuelingOdometerEmployee: {
    color: '#888',
    fontSize: 13,
  },
  refuelingRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  refuelingDateEmployee: {
    color: '#666',
    fontSize: 12,
  },
  refuelingGpsEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
  },
  refuelingGpsTextEmployee: {
    color: '#10b981',
    fontSize: 11,
    flexShrink: 1,
  },
  // Vehicle picker styles for refueling modal
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 200,
  },
  vehiclePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 10,
  },
  vehiclePickerItemSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  vehiclePickerItemText: {
    color: '#ccc',
    fontSize: 14,
  },
  noVehiclesText: {
    color: '#888',
    fontSize: 13,
    padding: 14,
    textAlign: 'center',
  },
  // Assignment Report Modal styles
  reportModalContent: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  reportModalHeader: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  reportModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  reportModalSubtitle: {
    color: '#10b981',
    fontSize: 15,
    marginTop: 8,
  },
  reportModalBody: {
    padding: 20,
  },
  reportModalQuestion: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  reportModalInfo: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
  },
  reportModalInfoTitle: {
    color: '#888',
    fontSize: 13,
    marginBottom: 12,
  },
  reportModalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  reportModalInfoText: {
    color: '#ccc',
    fontSize: 14,
  },
  reportModalButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  reportModalButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  reportModalButtonSecondaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  reportModalButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reportModalButtonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
