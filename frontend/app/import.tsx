import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../src/context/AuthContext';
import { uploadFile, uploadFileWeb } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

export default function Import() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

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
              Alert.alert(
                'Sukces',
                `Zaimportowano ${uploadResult.imported} urządzeń${uploadResult.errors.length > 0 ? ` (${uploadResult.errors.length} błędów)` : ''}`
              );
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
        Alert.alert(
          'Sukces',
          `Zaimportowano ${uploadResult.imported} urządzeń${uploadResult.errors.length > 0 ? ` (${uploadResult.errors.length} błędów)` : ''}`
        );
      } else if (uploadResult.errors.length > 0) {
        Alert.alert('Uwaga', 'Nie zaimportowano żadnych urządzeń. Sprawdź błędy poniżej.');
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zaimportować pliku');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Importuj urządzenia</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={24} color="#3b82f6" />
          <Text style={styles.infoText}>
            Plik XLSX powinien zawierać kolumny w następującej kolejności:{'\n\n'}
            1. Nazwa urządzenia{'\n'}
            2. Numer seryjny{'\n'}
            3. Kod kreskowy (opcjonalne){'\n'}
            4. Kod QR (opcjonalne)
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
              <Ionicons name="cloud-upload-outline" size={48} color="#3b82f6" />
              <Text style={styles.uploadButtonText}>
                Wybierz plik XLSX
              </Text>
              <Text style={styles.uploadButtonSubtext}>
                Dotknij aby wybrać plik z dysku
              </Text>
            </>
          )}
        </TouchableOpacity>

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
              </Text>
            </View>

            {result.errors.length > 0 && (
              <View style={styles.errorsContainer}>
                <Text style={styles.errorsTitle}>Błędy ({result.errors.length}):</Text>
                {result.errors.slice(0, 5).map((error, index) => (
                  <Text key={index} style={styles.errorItem}>
                    • {error}
                  </Text>
                ))}
                {result.errors.length > 5 && (
                  <Text style={styles.moreErrors}>
                    ...i {result.errors.length - 5} więcej błędów
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        <View style={styles.exampleSection}>
          <Text style={styles.exampleTitle}>Przykładowy format:</Text>
          <View style={styles.exampleTable}>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableHeader]}>Nazwa</Text>
              <Text style={[styles.tableCell, styles.tableHeader]}>Nr seryjny</Text>
              <Text style={[styles.tableCell, styles.tableHeader]}>Kod</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableCell}>Router XYZ</Text>
              <Text style={styles.tableCell}>SN12345</Text>
              <Text style={styles.tableCell}>1234567890</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableCell}>Switch ABC</Text>
              <Text style={styles.tableCell}>SN67890</Text>
              <Text style={styles.tableCell}>0987654321</Text>
            </View>
          </View>
        </View>
      </View>
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
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  infoText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    marginLeft: 12,
    lineHeight: 22,
  },
  uploadButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  uploadButtonSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  resultCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  errorsContainer: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
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
    marginTop: 8,
  },
  exampleSection: {
    marginTop: 16,
  },
  exampleTitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  exampleTable: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  tableCell: {
    flex: 1,
    padding: 12,
    color: '#fff',
    fontSize: 12,
  },
  tableHeader: {
    backgroundColor: '#0a0a0a',
    fontWeight: '600',
    color: '#3b82f6',
  },
});
