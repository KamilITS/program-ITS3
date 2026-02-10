import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Camera, CameraView } from 'expo-camera';
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
}

interface Worker {
  user_id: string;
  name: string;
  email: string;
}

export default function AssignDevice() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundDevice, setFoundDevice] = useState<Device | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [workerModalVisible, setWorkerModalVisible] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [recentAssignments, setRecentAssignments] = useState<Array<{device: Device; worker: Worker; time: Date}>>([]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
    if (!isLoading && user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user]);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      loadWorkers();
    }
  }, [isAuthenticated, user]);

  const loadWorkers = async () => {
    try {
      const data = await apiFetch('/api/workers');
      setWorkers(data);
    } catch (error) {
      console.error('Error loading workers:', error);
    }
  };

  const parseScannedData = (rawData: string): string => {
    let data = rawData.trim();
    if (data.includes('\n') || data.includes('\r')) {
      const lines = data.split(/[\r\n]+/).filter(line => line.trim());
      for (const line of lines) {
        if (line.match(/^S[N]?[0-9A-Z]/i) || line.match(/^[0-9]{2}S[A-Z0-9]/i)) {
          return line.trim();
        }
      }
      return lines[0]?.trim() || data;
    }
    return data;
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    const parsedCode = parseScannedData(data);
    setShowCamera(false);
    setSearchQuery(parsedCode);
    await searchDevice(parsedCode);
  };

  const searchDevice = async (code: string) => {
    if (!code.trim()) {
      Alert.alert('Błąd', 'Wprowadź kod urządzenia');
      return;
    }
    
    setIsSearching(true);
    setFoundDevice(null);
    
    try {
      const device = await apiFetch(`/api/devices/scan/${encodeURIComponent(code.trim())}`);
      setFoundDevice(device);
    } catch (error: any) {
      Alert.alert('Nie znaleziono', `Urządzenie o kodzie "${code}" nie istnieje w systemie.`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAssign = async () => {
    if (!foundDevice || !selectedWorker) return;
    
    setIsAssigning(true);
    try {
      await apiFetch(`/api/devices/${foundDevice.device_id}/assign`, {
        method: 'POST',
        body: { worker_id: selectedWorker.user_id },
      });
      
      // Add to recent assignments
      setRecentAssignments(prev => [
        { device: foundDevice, worker: selectedWorker, time: new Date() },
        ...prev.slice(0, 9)
      ]);
      
      Alert.alert(
        'Sukces',
        `Urządzenie "${foundDevice.nazwa}"\n(${foundDevice.numer_seryjny})\n\nzostało przypisane do: ${selectedWorker.name}`,
        [{ text: 'OK', onPress: resetForm }]
      );
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się przypisać urządzenia');
    } finally {
      setIsAssigning(false);
    }
  };

  const resetForm = () => {
    setFoundDevice(null);
    setSearchQuery('');
    setSelectedWorker(null);
  };

  const getWorkerById = (userId: string) => {
    return workers.find(w => w.user_id === userId);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Przypisz urządzenie</Text>
        <TouchableOpacity onPress={resetForm} style={styles.resetButton}>
          <Ionicons name="refresh" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Step 1: Find Device */}
        <View style={styles.stepSection}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepTitle}>Znajdź urządzenie</Text>
          </View>

          {/* Scanner */}
          {showCamera && hasPermission ? (
            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.camera}
                onBarcodeScanned={handleBarCodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'codabar', 'itf14', 'upc_a', 'upc_e', 'pdf417', 'aztec', 'datamatrix'],
                }}
              />
              <View style={styles.scanOverlay}>
                <View style={styles.scanFrame} />
              </View>
              <TouchableOpacity
                style={styles.closeCameraButton}
                onPress={() => setShowCamera(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.scanHint}>
                <Text style={styles.scanHintText}>Skieruj kamerę na kod</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setShowCamera(true)}
              disabled={!hasPermission}
            >
              <Ionicons name="scan" size={32} color="#3b82f6" />
              <Text style={styles.scanButtonText}>
                {hasPermission === false ? 'Brak dostępu do kamery' : 'Skanuj kod'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Search Input */}
          <View style={styles.searchSection}>
            <Text style={styles.orText}>lub wpisz ręcznie</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Numer seryjny / kod kreskowy"
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="characters"
                onSubmitEditing={() => searchDevice(searchQuery)}
                returnKeyType="search"
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={() => searchDevice(searchQuery)}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Device Info */}
        {foundDevice && (
          <View style={styles.stepSection}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumber, styles.stepNumberActive]}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </View>
              <Text style={styles.stepTitle}>Znalezione urządzenie</Text>
            </View>

            <View style={styles.deviceCard}>
              <View style={styles.deviceHeader}>
                <Ionicons name="hardware-chip" size={32} color="#3b82f6" />
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{foundDevice.nazwa}</Text>
                  <Text style={styles.deviceSerial}>{foundDevice.numer_seryjny}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  foundDevice.status === 'dostepny' && { backgroundColor: '#10b981' },
                  foundDevice.status === 'przypisany' && { backgroundColor: '#f59e0b' },
                  foundDevice.status === 'zainstalowany' && { backgroundColor: '#ef4444' },
                ]}>
                  <Text style={styles.statusText}>{foundDevice.status}</Text>
                </View>
              </View>

              {foundDevice.przypisany_do && (
                <View style={styles.currentAssignment}>
                  <Ionicons name="person" size={16} color="#f59e0b" />
                  <Text style={styles.currentAssignmentText}>
                    Obecnie przypisane do: {getWorkerById(foundDevice.przypisany_do)?.name || 'Nieznany'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Step 2: Select Worker */}
        {foundDevice && (
          <View style={styles.stepSection}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepNumber, selectedWorker && styles.stepNumberActive]}>
                {selectedWorker ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <Text style={styles.stepNumberText}>2</Text>
                )}
              </View>
              <Text style={styles.stepTitle}>Wybierz pracownika</Text>
            </View>

            <TouchableOpacity
              style={styles.selectWorkerButton}
              onPress={() => setWorkerModalVisible(true)}
            >
              {selectedWorker ? (
                <View style={styles.selectedWorkerInfo}>
                  <View style={styles.workerAvatar}>
                    <Ionicons name="person" size={24} color="#fff" />
                  </View>
                  <View style={styles.workerDetails}>
                    <Text style={styles.workerName}>{selectedWorker.name}</Text>
                    <Text style={styles.workerEmail}>{selectedWorker.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#888" />
                </View>
              ) : (
                <View style={styles.selectWorkerPlaceholder}>
                  <Ionicons name="person-add" size={24} color="#3b82f6" />
                  <Text style={styles.selectWorkerText}>Wybierz pracownika</Text>
                  <Ionicons name="chevron-forward" size={24} color="#888" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Assign Button */}
        {foundDevice && selectedWorker && (
          <TouchableOpacity
            style={styles.assignButton}
            onPress={handleAssign}
            disabled={isAssigning}
          >
            {isAssigning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.assignButtonText}>Przypisz urządzenie</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Recent Assignments */}
        {recentAssignments.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Ostatnie przypisania</Text>
            {recentAssignments.map((assignment, index) => (
              <View key={index} style={styles.recentItem}>
                <View style={styles.recentIcon}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentDevice}>{assignment.device.nazwa}</Text>
                  <Text style={styles.recentDetails}>
                    {assignment.device.numer_seryjny} → {assignment.worker.name}
                  </Text>
                </View>
                <Text style={styles.recentTime}>
                  {assignment.time.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Worker Selection Modal */}
      <Modal
        visible={workerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWorkerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz pracownika</Text>
              <TouchableOpacity onPress={() => setWorkerModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={workers}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.workerItem,
                    selectedWorker?.user_id === item.user_id && styles.workerItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedWorker(item);
                    setWorkerModalVisible(false);
                  }}
                >
                  <View style={[
                    styles.workerAvatar,
                    selectedWorker?.user_id === item.user_id && styles.workerAvatarSelected,
                  ]}>
                    <Ionicons name="person" size={24} color="#fff" />
                  </View>
                  <View style={styles.workerDetails}>
                    <Text style={styles.workerItemName}>{item.name}</Text>
                    <Text style={styles.workerItemEmail}>{item.email}</Text>
                  </View>
                  {selectedWorker?.user_id === item.user_id && (
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  )}
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.user_id}
              ListEmptyComponent={
                <View style={styles.emptyWorkers}>
                  <Ionicons name="people-outline" size={48} color="#333" />
                  <Text style={styles.emptyWorkersText}>Brak pracowników</Text>
                </View>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
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
  resetButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  stepSection: {
    marginBottom: 24,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberActive: {
    backgroundColor: '#10b981',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 180,
    height: 180,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 16,
  },
  closeCameraButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  scanHint: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanHintText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 13,
  },
  scanButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  searchSection: {
    marginTop: 8,
  },
  orText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
    marginLeft: 16,
  },
  deviceName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deviceSerial: {
    color: '#3b82f6',
    fontSize: 14,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  deviceDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  deviceDetailText: {
    color: '#888',
    fontSize: 13,
    marginLeft: 8,
  },
  currentAssignment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  currentAssignmentText: {
    color: '#f59e0b',
    fontSize: 13,
    marginLeft: 8,
  },
  selectWorkerButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  selectedWorkerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  selectWorkerPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  selectWorkerText: {
    flex: 1,
    color: '#3b82f6',
    fontSize: 16,
    marginLeft: 12,
  },
  workerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerAvatarSelected: {
    backgroundColor: '#10b981',
  },
  workerDetails: {
    flex: 1,
    marginLeft: 12,
  },
  workerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  workerEmail: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 16,
    paddingVertical: 18,
    gap: 10,
    marginTop: 8,
  },
  assignButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  recentSection: {
    marginTop: 32,
  },
  recentTitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  recentIcon: {
    marginRight: 12,
  },
  recentInfo: {
    flex: 1,
  },
  recentDevice: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  recentDetails: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  recentTime: {
    color: '#666',
    fontSize: 12,
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
    maxHeight: '70%',
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
  workerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  workerItemSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  workerItemName: {
    color: '#fff',
    fontSize: 16,
  },
  workerItemEmail: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  emptyWorkers: {
    alignItems: 'center',
    padding: 40,
  },
  emptyWorkersText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
});
