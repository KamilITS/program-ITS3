import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../src/context/AuthContext';
import { uploadFile, uploadFileWeb, apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

export default function Import() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates?: number; errors: string[]; message?: string } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Manual add state
  const [showManualModal, setShowManualModal] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [barcode, setBarcode] = useState('');
  const [addingDevice, setAddingDevice] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
    if (!isLoading && user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user]);

  const handleFilePick = async () => {
    try {
      // For web platform, use native file input for better compatibility
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
        
        input.onchange = async (e: any) => {
          const selectedFile = e.target.files?.[0];
          if (!selectedFile) return;
          
          setUploading(true);
          setResult(null);
          
          try {
            const uploadResult = await uploadFileWeb('/api/devices/import', selectedFile);
            setResult(uploadResult);
            
            if (uploadResult.imported > 0) {
              Alert.alert('Sukces', uploadResult.message || `Zaimportowano ${uploadResult.imported} urządzeń`);
            } else if (uploadResult.errors.length > 0) {
              Alert.alert('Uwaga', 'Nie zaimportowano żadnych urządzeń. Sprawdź błędy poniżej.');
            }
          } catch (error: any) {
            Alert.alert('Błąd', error.message || 'Nie udało się zaimportować pliku');
          } finally {
            setUploading(false);
          }
        };
        
        input.click();
        return;
      }
      
      // For mobile platforms, use DocumentPicker
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      
      setUploading(true);
      setResult(null);

      const uploadResult = await uploadFile('/api/devices/import', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      
      setResult(uploadResult);
      
      if (uploadResult.imported > 0) {
        Alert.alert('Sukces', uploadResult.message || `Zaimportowano ${uploadResult.imported} urządzeń`);
      } else if (uploadResult.errors.length > 0) {
        Alert.alert('Uwaga', 'Nie zaimportowano żadnych urządzeń. Sprawdź błędy poniżej.');
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zaimportować pliku');
    } finally {
      setUploading(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setSerialNumber(data);
    setBarcode(data);
    setScannerActive(false);
  };

  const handleAddSingleDevice = async () => {
    if (!serialNumber.trim()) {
      Alert.alert('Błąd', 'Wprowadź numer seryjny urządzenia');
      return;
    }

    setAddingDevice(true);
    try {
      await apiFetch('/api/devices/add-single', {
        method: 'POST',
        body: {
          nazwa: deviceName.trim() || 'Urządzenie',
          numer_seryjny: serialNumber.trim(),
          kod_kreskowy: barcode.trim() || serialNumber.trim(),
        },
      });

      Alert.alert('Sukces', `Dodano urządzenie: ${serialNumber}`);
      setDeviceName('');
      setSerialNumber('');
      setBarcode('');
      setShowManualModal(false);
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się dodać urządzenia');
    } finally {
      setAddingDevice(false);
    }
  };

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
          <Text style={styles.title}>Skanuj kod urządzenia</Text>
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
        <Text style={styles.title}>Dodaj urządzenia</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Option 1: Import from file */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-outline" size={24} color="#3b82f6" />
            <Text style={styles.sectionTitle}>Import z pliku Excel</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Plik XLSX powinien zawierać kolumny:{'\n'}
              1. Nazwa • 2. Numer seryjny • 3. Kod kreskowy • 4. Kod QR
            </Text>
          </View>

          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleFilePick}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator size="large" color="#3b82f6" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={40} color="#3b82f6" />
                <Text style={styles.uploadButtonText}>Wybierz plik XLSX</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Option 2: Add single device manually */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="scan-outline" size={24} color="#10b981" />
            <Text style={styles.sectionTitle}>Dodaj pojedyncze urządzenie</Text>
          </View>
          
          <Text style={styles.sectionDescription}>
            Zeskanuj kod kreskowy lub wpisz numer seryjny ręcznie
          </Text>

          <TouchableOpacity
            style={styles.addSingleButton}
            onPress={() => setShowManualModal(true)}
          >
            <Ionicons name="add-circle-outline" size={24} color="#fff" />
            <Text style={styles.addSingleButtonText}>Dodaj urządzenie</Text>
          </TouchableOpacity>
        </View>

        {/* Import result */}
        {result && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons
                name={result.imported > 0 ? 'checkmark-circle' : 'alert-circle'}
                size={24}
                color={result.imported > 0 ? '#10b981' : '#f59e0b'}
              />
              <Text style={styles.resultTitle}>
                Zaimportowano: {result.imported} urządzeń
                {result.duplicates ? ` (pominięto ${result.duplicates} duplikatów)` : ''}
              </Text>
            </View>

            {result.errors && result.errors.length > 0 && (
              <View style={styles.errorsContainer}>
                <Text style={styles.errorsTitle}>Błędy ({result.errors.length}):</Text>
                {result.errors.slice(0, 5).map((error, index) => (
                  <Text key={index} style={styles.errorItem}>• {error}</Text>
                ))}
                {result.errors.length > 5 && (
                  <Text style={styles.moreErrors}>...i {result.errors.length - 5} więcej</Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Manual Add Modal */}
      <Modal
        visible={showManualModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManualModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dodaj urządzenie</Text>
              <TouchableOpacity onPress={() => setShowManualModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nazwa urządzenia (opcjonalne)</Text>
              <TextInput
                style={styles.input}
                placeholder="np. T-MOBILE CPE HOMEBOX"
                placeholderTextColor="#666"
                value={deviceName}
                onChangeText={setDeviceName}
              />

              <Text style={styles.inputLabel}>Numer seryjny *</Text>
              <View style={styles.serialInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Wprowadź lub zeskanuj..."
                  placeholderTextColor="#666"
                  value={serialNumber}
                  onChangeText={setSerialNumber}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => {
                    setShowManualModal(false);
                    setScannerActive(true);
                  }}
                >
                  <Ionicons name="scan" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Kod kreskowy (opcjonalne)</Text>
              <TextInput
                style={styles.input}
                placeholder="Zostaw puste aby użyć numeru seryjnego"
                placeholderTextColor="#666"
                value={barcode}
                onChangeText={setBarcode}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, addingDevice && styles.submitButtonDisabled]}
              onPress={handleAddSingleDevice}
              disabled={addingDevice}
            >
              {addingDevice ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={24} color="#fff" />
                  <Text style={styles.submitButtonText}>Dodaj do magazynu</Text>
                </>
              )}
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
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionDescription: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoText: {
    color: '#3b82f6',
    fontSize: 13,
    lineHeight: 20,
  },
  uploadButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  addSingleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  addSingleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  errorsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  errorsTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorItem: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
  },
  moreErrors: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
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
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    margin: 20,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#333',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
});
