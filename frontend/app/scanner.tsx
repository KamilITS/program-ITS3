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
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Camera, CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

interface Device {
  device_id: string;
  nazwa: string;
  numer_seryjny: string;
  kod_kreskowy?: string;
  kod_qr?: string;
  status: string;
}

interface ScannedCode {
  type: string;
  data: string;
  timestamp: number;
}

export default function Scanner() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [device, setDevice] = useState<Device | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsAddress, setGpsAddress] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [orderType, setOrderType] = useState<string>('instalacja');
  const [showCamera, setShowCamera] = useState(false);
  
  // Multiple codes handling
  const [scannedCodes, setScannedCodes] = useState<ScannedCode[]>([]);
  const [showCodeSelection, setShowCodeSelection] = useState(false);

  const orderTypes = ['instalacja', 'wymiana', 'awaria', 'uszkodzony'];

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    (async () => {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(cameraStatus === 'granted');
      
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          
          const [addr] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (addr) {
            setGpsAddress(`${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || ''}`);
          }
        } catch (error) {
          console.error('Location error:', error);
        }
      }
    })();
  }, []);

  const parseScannedData = (rawData: string): string => {
    let data = rawData.trim();
    
    if (data.includes('\n') || data.includes('\r')) {
      const lines = data.split(/[\r\n]+/).filter(line => line.trim());
      
      for (const line of lines) {
        if (line.match(/^S[N]?[0-9A-Z]/i) || line.match(/^[0-9]{2}S[A-Z0-9]/i)) {
          return line.trim();
        }
        if (line.match(/^20S[A-Z]/i)) {
          return line.trim();
        }
      }
      
      const sortedLines = lines.sort((a, b) => b.length - a.length);
      for (const line of sortedLines) {
        if (line.match(/^[A-Z0-9]+$/i) && line.length >= 6) {
          return line.trim();
        }
      }
      
      return lines[0]?.trim() || data;
    }
    
    return data;
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    const parsedCode = parseScannedData(data);
    const now = Date.now();
    
    // Check if this code was already scanned recently (within 2 seconds)
    const existingCode = scannedCodes.find(
      c => c.data === parsedCode && now - c.timestamp < 2000
    );
    
    if (existingCode) return;
    
    const newCode: ScannedCode = { type, data: parsedCode, timestamp: now };
    const updatedCodes = [...scannedCodes.filter(c => now - c.timestamp < 3000), newCode];
    setScannedCodes(updatedCodes);
    
    // If multiple codes detected, show selection modal
    if (updatedCodes.length > 1) {
      setShowCodeSelection(true);
    } else {
      // Single code - process immediately after a short delay
      setTimeout(() => {
        if (scannedCodes.length <= 1) {
          selectCode(parsedCode);
        }
      }, 500);
    }
  };

  const selectCode = async (code: string) => {
    setShowCodeSelection(false);
    setShowCamera(false);
    setScanned(true);
    setScannedCodes([]);
    await searchDevice(code);
  };

  const searchDevice = async (code: string) => {
    if (!code.trim()) {
      Alert.alert('Błąd', 'Wprowadź kod urządzenia');
      return;
    }
    
    const cleanCode = code.trim().replace(/[\r\n]/g, '');
    
    setIsSearching(true);
    try {
      const foundDevice = await apiFetch(`/api/devices/scan/${encodeURIComponent(cleanCode)}`);
      setDevice(foundDevice);
      setManualCode(foundDevice.numer_seryjny || cleanCode);
      // Pre-fill client address with GPS address
      if (gpsAddress && !clientAddress) {
        setClientAddress(gpsAddress);
      }
    } catch (error: any) {
      const parts = code.split(/[\r\n\s]+/).filter(p => p.trim());
      let found = false;
      
      for (const part of parts) {
        if (part.length >= 4) {
          try {
            const foundDevice = await apiFetch(`/api/devices/scan/${encodeURIComponent(part.trim())}`);
            setDevice(foundDevice);
            setManualCode(foundDevice.numer_seryjny || part.trim());
            // Pre-fill client address with GPS address
            if (gpsAddress && !clientAddress) {
              setClientAddress(gpsAddress);
            }
            found = true;
            break;
          } catch (e) {
            // Continue trying
          }
        }
      }
      
      if (!found) {
        Alert.alert(
          'Nie znaleziono',
          `Urządzenie o kodzie "${cleanCode}" nie istnieje w systemie.\n\nSprawdź czy numer seryjny jest poprawny.`
        );
        setDevice(null);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleInstall = async () => {
    if (!device) return;
    
    // For damaged devices, don't require address
    if (orderType !== 'uszkodzony' && !clientAddress.trim()) {
      Alert.alert('Błąd', 'Wprowadź adres klienta');
      return;
    }
    
    setIsInstalling(true);
    try {
      if (orderType === 'uszkodzony') {
        // Mark device as damaged
        await apiFetch(`/api/devices/${device.device_id}/mark-damaged`, {
          method: 'POST',
          body: {},
        });
        
        Alert.alert(
          'Sukces',
          `Urządzenie "${device.nazwa}"\nNumer seryjny: ${device.numer_seryjny}\n\nZostało oznaczone jako uszkodzone`,
          [{ text: 'OK', onPress: resetScanner }]
        );
      } else {
        // Normal installation
        await apiFetch('/api/installations', {
          method: 'POST',
          body: {
            device_id: device.device_id,
            adres_klienta: clientAddress.trim(),
            latitude: location?.latitude,
            longitude: location?.longitude,
            rodzaj_zlecenia: orderType,
          },
        });
        
        Alert.alert(
          'Sukces',
          `Urządzenie "${device.nazwa}"\nNumer seryjny: ${device.numer_seryjny}\n\nZostało zarejestrowane jako ${orderType}\nAdres: ${clientAddress}`,
          [{ text: 'OK', onPress: resetScanner }]
        );
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zarejestrować');
    } finally {
      setIsInstalling(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setDevice(null);
    setManualCode('');
    setClientAddress('');
    setScannedCodes([]);
    setShowCodeSelection(false);
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
        <Text style={styles.title}>Skanuj urządzenie</Text>
        <TouchableOpacity onPress={resetScanner} style={styles.resetButton}>
          <Ionicons name="refresh" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Camera Scanner */}
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
              onPress={() => {
                setShowCamera(false);
                setScannedCodes([]);
              }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.scanHint}>
              <Text style={styles.scanHintText}>
                {scannedCodes.length > 0 
                  ? `Wykryto ${scannedCodes.length} kod(y) - dotknij aby wybrać`
                  : 'Skieruj kamerę na kod QR lub kreskowy'
                }
              </Text>
            </View>
            
            {/* Scanned codes preview */}
            {scannedCodes.length > 0 && (
              <View style={styles.scannedCodesPreview}>
                {scannedCodes.map((code, index) => (
                  <TouchableOpacity
                    key={`${code.data}-${index}`}
                    style={styles.scannedCodeItem}
                    onPress={() => selectCode(code.data)}
                  >
                    <Ionicons name="barcode-outline" size={16} color="#3b82f6" />
                    <Text style={styles.scannedCodeText} numberOfLines={1}>
                      {code.data}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => {
              setScanned(false);
              setScannedCodes([]);
              setShowCamera(true);
            }}
            disabled={!hasPermission}
          >
            <Ionicons name="scan" size={48} color="#3b82f6" />
            <Text style={styles.scanButtonText}>
              {hasPermission === false
                ? 'Brak dostępu do kamery'
                : 'Dotknij aby skanować'}
            </Text>
            <Text style={styles.scanButtonSubtext}>
              Skanuj kod QR lub kreskowy urządzenia
            </Text>
          </TouchableOpacity>
        )}

        {/* Manual Input */}
        <View style={styles.manualSection}>
          <Text style={styles.sectionTitle}>Lub wpisz numer seryjny ręcznie</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Numer seryjny urządzenia"
              placeholderTextColor="#666"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={() => searchDevice(manualCode)}
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

        {/* Device Info */}
        {device && (
          <View style={styles.deviceSection}>
            <Text style={styles.sectionTitle}>Znalezione urządzenie</Text>
            <View style={styles.deviceCard}>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{device.nazwa}</Text>
                
                {/* Serial number in text */}
                <View style={styles.serialBox}>
                  <Text style={styles.serialLabel}>Numer seryjny:</Text>
                  <Text style={styles.serialNumber}>{device.numer_seryjny}</Text>
                </View>
                
                {device.kod_kreskowy && (
                  <Text style={styles.deviceCode}>Kod kreskowy: {device.kod_kreskowy}</Text>
                )}
                {device.kod_qr && (
                  <Text style={styles.deviceCode}>Kod QR: {device.kod_qr}</Text>
                )}
                <View style={[
                  styles.statusBadge,
                  device.status === 'dostepny' && { backgroundColor: '#10b981' },
                  device.status === 'przypisany' && { backgroundColor: '#3b82f6' },
                  device.status === 'zainstalowany' && { backgroundColor: '#f59e0b' },
                ]}>
                  <Text style={styles.statusText}>{device.status}</Text>
                </View>
              </View>

              {/* GPS Location */}
              {gpsAddress && (
                <View style={styles.locationInfo}>
                  <Ionicons name="navigate" size={18} color="#10b981" />
                  <Text style={styles.locationLabel}>Lokalizacja GPS:</Text>
                  <Text style={styles.locationText}>{gpsAddress}</Text>
                </View>
              )}

              {/* Order Type Selection - FIRST */}
              <Text style={styles.orderTypeLabel}>Rodzaj zlecenia:</Text>
              <View style={styles.orderTypes}>
                {orderTypes.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.orderTypeButton,
                      orderType === type && styles.orderTypeButtonActive,
                      orderType === type && type === 'uszkodzony' && styles.orderTypeButtonDamaged,
                    ]}
                    onPress={() => {
                      setOrderType(type);
                      // Clear address if damaged is selected
                      if (type === 'uszkodzony') {
                        setClientAddress('');
                      }
                    }}
                  >
                    <Text style={[
                      styles.orderTypeText,
                      orderType === type && styles.orderTypeTextActive,
                    ]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Client Address Input - SECOND (disabled for uszkodzony) */}
              {orderType !== 'uszkodzony' && (
                <View style={styles.addressSection}>
                  <Text style={styles.addressLabel}>
                    <Ionicons name="location" size={16} color="#3b82f6" /> Adres klienta *
                  </Text>
                  <TextInput
                    style={styles.addressInput}
                    placeholder="Wpisz adres klienta (wymagane)"
                    placeholderTextColor="#666"
                    value={clientAddress}
                    onChangeText={setClientAddress}
                    multiline
                    numberOfLines={2}
                  />
                </View>
              )}

              {/* Info for damaged devices */}
              {orderType === 'uszkodzony' && (
                <View style={styles.damagedInfoBox}>
                  <Ionicons name="warning" size={20} color="#f59e0b" />
                  <Text style={styles.damagedInfoText}>
                    Urządzenie zostanie przeniesione do zakładki "Uszkodzone"
                  </Text>
                </View>
              )}

              {/* Install Button */}
              <TouchableOpacity
                style={[
                  styles.installButton,
                  orderType !== 'uszkodzony' && !clientAddress.trim() && styles.installButtonDisabled,
                  orderType === 'uszkodzony' && styles.installButtonDamaged,
                ]}
                onPress={handleInstall}
                disabled={isInstalling || (orderType !== 'uszkodzony' && !clientAddress.trim())}
              >
                {isInstalling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={orderType === 'uszkodzony' ? 'alert-circle' : 'checkmark-circle'} size={24} color="#fff" />
                    <Text style={styles.installButtonText}>
                      {orderType === 'uszkodzony' ? 'Oznacz jako uszkodzone' : `Zarejestruj ${orderType}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Code Selection Modal */}
      <Modal
        visible={showCodeSelection}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCodeSelection(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wykryto wiele kodów</Text>
              <TouchableOpacity onPress={() => setShowCodeSelection(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Wybierz właściwy kod:</Text>
            <FlatList
              data={scannedCodes}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.codeSelectItem}
                  onPress={() => selectCode(item.data)}
                >
                  <View style={styles.codeSelectIcon}>
                    <Ionicons 
                      name={item.type.includes('qr') ? 'qr-code' : 'barcode'} 
                      size={24} 
                      color="#3b82f6" 
                    />
                  </View>
                  <View style={styles.codeSelectInfo}>
                    <Text style={styles.codeSelectType}>
                      {item.type.includes('qr') ? 'Kod QR' : 'Kod kreskowy'}
                    </Text>
                    <Text style={styles.codeSelectData}>{item.data}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#888" />
                </TouchableOpacity>
              )}
              keyExtractor={(item, index) => `${item.data}-${index}`}
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
  cameraContainer: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
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
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  closeCameraButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  scanHint: {
    position: 'absolute',
    bottom: 60,
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
  scannedCodesPreview: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scannedCodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: '48%',
  },
  scannedCodeText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  scanButton: {
    height: 200,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  scanButtonSubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  manualSection: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
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
  deviceSection: {
    marginTop: 24,
  },
  deviceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
  },
  deviceInfo: {
    marginBottom: 16,
  },
  deviceName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  serialBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  serialLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  serialNumber: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deviceCode: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  locationLabel: {
    color: '#888',
    fontSize: 12,
    marginLeft: 8,
  },
  locationText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  addressSection: {
    marginBottom: 16,
  },
  addressLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  addressInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3b82f6',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  orderTypeLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  orderTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  orderTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  orderTypeButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  orderTypeText: {
    color: '#888',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  orderTypeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  installButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  installButtonDisabled: {
    backgroundColor: '#333',
  },
  installButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'capitalize',
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
    maxHeight: '60%',
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
  modalSubtitle: {
    color: '#888',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  codeSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  codeSelectIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeSelectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  codeSelectType: {
    color: '#888',
    fontSize: 12,
  },
  codeSelectData: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  orderTypeButtonDamaged: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  damagedInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  damagedInfoText: {
    color: '#f59e0b',
    fontSize: 14,
    flex: 1,
  },
  installButtonDamaged: {
    backgroundColor: '#f59e0b',
  },
});
