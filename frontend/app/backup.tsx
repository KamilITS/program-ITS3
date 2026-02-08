import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

interface BackupSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  email_recipient: string;
  email_enabled: boolean;
  ftp_host: string;
  ftp_port: number;
  ftp_user: string;
  ftp_password: string;
  ftp_path: string;
  ftp_enabled: boolean;
  schedule_enabled: boolean;
  schedule_time: string;
}

interface BackupLog {
  backup_id: string;
  created_at: string;
  size_bytes: number;
  status: string;
  sent_email: boolean;
  sent_ftp: boolean;
  downloaded?: boolean;
  error_message?: string;
}

const SCHEDULE_TIMES = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

export default function BackupScreen() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [settings, setSettings] = useState<BackupSettings>({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_use_tls: true,
    email_recipient: '',
    email_enabled: false,
    ftp_host: '',
    ftp_port: 21,
    ftp_user: '',
    ftp_password: '',
    ftp_path: '/backups/',
    ftp_enabled: false,
    schedule_enabled: false,
    schedule_time: '02:00'
  });
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingFtp, setTestingFtp] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'email' | 'ftp' | 'schedule'>('manual');
  const [showTimeSelector, setShowTimeSelector] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
    if (!isLoading && user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      loadSettings();
      loadLogs();
    }
  }, [isAuthenticated, user]);

  const loadSettings = async () => {
    try {
      const data = await apiFetch('/api/backup/settings');
      setSettings(prev => ({ ...prev, ...data }));
    } catch (error) {
      console.error('Error loading backup settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await apiFetch('/api/backup/logs');
      setLogs(data);
    } catch (error) {
      console.error('Error loading backup logs:', error);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiFetch('/api/backup/settings', {
        method: 'POST',
        body: settings
      });
      Alert.alert('Sukces', 'Ustawienia zostały zapisane');
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się zapisać ustawień');
    } finally {
      setSavingSettings(false);
    }
  };

  const createBackup = async (sendEmail: boolean = false, sendFtp: boolean = false) => {
    setCreatingBackup(true);
    try {
      const result = await apiFetch('/api/backup/create', {
        method: 'POST',
        body: { send_email: sendEmail, send_ftp: sendFtp }
      });
      
      let message = `Kopia zapasowa została utworzona.\nRozmiar: ${(result.size_bytes / 1024).toFixed(2)} KB`;
      
      if (sendEmail) {
        message += result.sent_email ? '\n✅ Wysłano na email' : '\n❌ Nie wysłano na email';
      }
      if (sendFtp) {
        message += result.sent_ftp ? '\n✅ Wysłano na FTP' : '\n❌ Nie wysłano na FTP';
      }
      if (result.errors && result.errors.length > 0) {
        message += '\n\nBłędy: ' + result.errors.join(', ');
      }
      
      Alert.alert('Kopia zapasowa', message);
      loadLogs();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się utworzyć kopii zapasowej');
    } finally {
      setCreatingBackup(false);
    }
  };

  const downloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      if (Platform.OS === 'web') {
        // For web, trigger download
        const token = await require('@react-native-async-storage/async-storage').default.getItem('session_token');
        const response = await fetch('/api/backup/download', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Nie udało się pobrać kopii');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `magazyn_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        Alert.alert('Sukces', 'Kopia zapasowa została pobrana');
        loadLogs();
      } else {
        Alert.alert('Info', 'Pobieranie plików jest dostępne tylko w wersji webowej');
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się pobrać kopii zapasowej');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const testEmail = async () => {
    setTestingEmail(true);
    try {
      await apiFetch('/api/backup/test-email', { method: 'POST' });
      Alert.alert('Sukces', 'Email testowy został wysłany. Sprawdź skrzynkę odbiorczą.');
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się wysłać emaila testowego');
    } finally {
      setTestingEmail(false);
    }
  };

  const testFtp = async () => {
    setTestingFtp(true);
    try {
      await apiFetch('/api/backup/test-ftp', { method: 'POST' });
      Alert.alert('Sukces', 'Plik testowy został wysłany na FTP.');
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się wysłać pliku na FTP');
    } finally {
      setTestingFtp(false);
    }
  };

  const downloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      if (Platform.OS === 'web') {
        const token = await require('@react-native-async-storage/async-storage').default.getItem('session_token');
        const response = await fetch('/api/backup/download-excel', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Nie udało się pobrać kopii Excel');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `magazyn_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        Alert.alert('Sukces', 'Kopia zapasowa Excel została pobrana');
        loadLogs();
      } else {
        Alert.alert('Info', 'Pobieranie plików Excel jest dostępne tylko w wersji webowej');
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się pobrać kopii Excel');
    } finally {
      setDownloadingExcel(false);
    }
  };

  const importBackupJSON = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Import jest dostępny tylko w wersji webowej');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setImportingBackup(true);
      try {
        const token = await require('@react-native-async-storage/async-storage').default.getItem('session_token');
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/backup/import-json', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Nie udało się zaimportować kopii');
        }
        
        const result = await response.json();
        Alert.alert('Sukces', `Import zakończony!\n\nZaimportowano:\n- Użytkownicy: ${result.users || 0}\n- Urządzenia: ${result.devices || 0}\n- Instalacje: ${result.installations || 0}\n- Zadania: ${result.tasks || 0}\n- Wiadomości: ${result.messages || 0}`);
        loadLogs();
      } catch (error: any) {
        Alert.alert('Błąd', error.message || 'Nie udało się zaimportować kopii');
      } finally {
        setImportingBackup(false);
      }
    };
    input.click();
  };

  const importBackupExcel = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Import jest dostępny tylko w wersji webowej');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setImportingBackup(true);
      try {
        const token = await require('@react-native-async-storage/async-storage').default.getItem('session_token');
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/backup/import-excel', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Nie udało się zaimportować kopii Excel');
        }
        
        const result = await response.json();
        Alert.alert('Sukces', `Import Excel zakończony!\n\nZaimportowano:\n- Użytkownicy: ${result.users || 0}\n- Urządzenia: ${result.devices || 0}\n- Instalacje: ${result.installations || 0}\n- Zadania: ${result.tasks || 0}`);
        loadLogs();
      } catch (error: any) {
        Alert.alert('Błąd', error.message || 'Nie udało się zaimportować kopii Excel');
      } finally {
        setImportingBackup(false);
      }
    };
    input.click();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (isLoading || loadingSettings) {
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
        <Text style={styles.title}>Kopie zapasowe</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'manual' && styles.tabActive]}
          onPress={() => setActiveTab('manual')}
        >
          <Ionicons name="download-outline" size={20} color={activeTab === 'manual' ? '#3b82f6' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>Ręcznie</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'email' && styles.tabActive]}
          onPress={() => setActiveTab('email')}
        >
          <Ionicons name="mail-outline" size={20} color={activeTab === 'email' ? '#3b82f6' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'email' && styles.tabTextActive]}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ftp' && styles.tabActive]}
          onPress={() => setActiveTab('ftp')}
        >
          <Ionicons name="server-outline" size={20} color={activeTab === 'ftp' ? '#3b82f6' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'ftp' && styles.tabTextActive]}>FTP</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'schedule' && styles.tabActive]}
          onPress={() => setActiveTab('schedule')}
        >
          <Ionicons name="time-outline" size={20} color={activeTab === 'schedule' ? '#3b82f6' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>Harmonogram</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Manual Tab */}
        {activeTab === 'manual' && (
          <View>
            {/* EXPORT SECTION */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Eksport danych</Text>
              <Text style={styles.sectionDescription}>
                Kopia zawiera: użytkowników, urządzenia, instalacje, zadania i wiadomości (bez załączników).
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1 }]}
                  onPress={downloadBackup}
                  disabled={downloadingBackup}
                >
                  {downloadingBackup ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="code-slash" size={20} color="#fff" />
                      <Text style={styles.primaryButtonText}>Pobierz JSON</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1, backgroundColor: '#10b981' }]}
                  onPress={downloadExcel}
                  disabled={downloadingExcel}
                >
                  {downloadingExcel ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={20} color="#fff" />
                      <Text style={styles.primaryButtonText}>Pobierz Excel</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.secondaryButton, !settings.email_enabled && styles.buttonDisabled]}
                  onPress={() => createBackup(true, false)}
                  disabled={creatingBackup || !settings.email_enabled}
                >
                  <Ionicons name="mail" size={20} color={settings.email_enabled ? '#3b82f6' : '#666'} />
                  <Text style={[styles.secondaryButtonText, !settings.email_enabled && styles.textDisabled]}>
                    Wyślij na email
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryButton, !settings.ftp_enabled && styles.buttonDisabled]}
                  onPress={() => createBackup(false, true)}
                  disabled={creatingBackup || !settings.ftp_enabled}
                >
                  <Ionicons name="server" size={20} color={settings.ftp_enabled ? '#3b82f6' : '#666'} />
                  <Text style={[styles.secondaryButtonText, !settings.ftp_enabled && styles.textDisabled]}>
                    Wyślij na FTP
                  </Text>
                </TouchableOpacity>
              </View>

              {creatingBackup && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={styles.loadingText}>Tworzenie kopii zapasowej...</Text>
                </View>
              )}
            </View>

            {/* IMPORT SECTION */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Import danych</Text>
              <Text style={styles.sectionDescription}>
                Przywróć dane z kopii zapasowej. Istniejące dane zostaną zaktualizowane lub dodane nowe.
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.importButton, { backgroundColor: '#f59e0b' }]}
                  onPress={importBackupJSON}
                  disabled={importingBackup}
                >
                  {importingBackup ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={20} color="#fff" />
                      <Text style={styles.importButtonText}>Import JSON</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.importButton, { backgroundColor: '#8b5cf6' }]}
                  onPress={importBackupExcel}
                  disabled={importingBackup}
                >
                  {importingBackup ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-attach" size={20} color="#fff" />
                      <Text style={styles.importButtonText}>Import Excel</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {importingBackup && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#f59e0b" />
                  <Text style={styles.loadingText}>Importowanie danych...</Text>
                </View>
              )}
            </View>

            {/* Backup History */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Historia kopii</Text>
              {logs.length === 0 ? (
                <Text style={styles.emptyText}>Brak kopii zapasowych</Text>
              ) : (
                logs.slice(0, 10).map((log) => (
                  <View key={log.backup_id} style={styles.logItem}>
                    <View style={styles.logIcon}>
                      <Ionicons 
                        name={log.status === 'success' ? 'checkmark-circle' : 'close-circle'} 
                        size={24} 
                        color={log.status === 'success' ? '#10b981' : '#ef4444'} 
                      />
                    </View>
                    <View style={styles.logInfo}>
                      <Text style={styles.logDate}>{formatDate(log.created_at)}</Text>
                      <Text style={styles.logDetails}>
                        {formatSize(log.size_bytes)}
                        {log.sent_email && ' • Email ✓'}
                        {log.sent_ftp && ' • FTP ✓'}
                        {log.downloaded && ' • Pobrano ✓'}
                      </Text>
                      {log.error_message && (
                        <Text style={styles.logError}>{log.error_message}</Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Włącz wysyłanie na email</Text>
              <Switch
                value={settings.email_enabled}
                onValueChange={(value) => setSettings(prev => ({ ...prev, email_enabled: value }))}
                trackColor={{ false: '#333', true: '#3b82f6' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Serwer SMTP</Text>
              <TextInput
                style={styles.input}
                placeholder="np. smtp.gmail.com"
                placeholderTextColor="#666"
                value={settings.smtp_host}
                onChangeText={(text) => setSettings(prev => ({ ...prev, smtp_host: text }))}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Port</Text>
                <TextInput
                  style={styles.input}
                  placeholder="587"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={String(settings.smtp_port)}
                  onChangeText={(text) => setSettings(prev => ({ ...prev, smtp_port: parseInt(text) || 587 }))}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 2, marginLeft: 12 }]}>
                <Text style={styles.inputLabel}>TLS</Text>
                <View style={styles.switchInline}>
                  <Switch
                    value={settings.smtp_use_tls}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, smtp_use_tls: value }))}
                    trackColor={{ false: '#333', true: '#3b82f6' }}
                    thumbColor="#fff"
                  />
                  <Text style={styles.switchInlineText}>{settings.smtp_use_tls ? 'Włączony' : 'Wyłączony'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email nadawcy (login)</Text>
              <TextInput
                style={styles.input}
                placeholder="twoj@email.com"
                placeholderTextColor="#666"
                keyboardType="email-address"
                autoCapitalize="none"
                value={settings.smtp_user}
                onChangeText={(text) => setSettings(prev => ({ ...prev, smtp_user: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hasło</Text>
              <TextInput
                style={styles.input}
                placeholder="Hasło do emaila"
                placeholderTextColor="#666"
                secureTextEntry
                value={settings.smtp_password}
                onChangeText={(text) => setSettings(prev => ({ ...prev, smtp_password: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email odbiorcy (gdzie wysyłać kopie)</Text>
              <TextInput
                style={styles.input}
                placeholder="backup@firma.pl"
                placeholderTextColor="#666"
                keyboardType="email-address"
                autoCapitalize="none"
                value={settings.email_recipient}
                onChangeText={(text) => setSettings(prev => ({ ...prev, email_recipient: text }))}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Zapisz ustawienia</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.testButton}
                onPress={testEmail}
                disabled={testingEmail || !settings.smtp_host}
              >
                {testingEmail ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <Text style={styles.testButtonText}>Test</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* FTP Tab */}
        {activeTab === 'ftp' && (
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Włącz wysyłanie na FTP</Text>
              <Switch
                value={settings.ftp_enabled}
                onValueChange={(value) => setSettings(prev => ({ ...prev, ftp_enabled: value }))}
                trackColor={{ false: '#333', true: '#3b82f6' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Host FTP</Text>
              <TextInput
                style={styles.input}
                placeholder="np. ftp.firma.pl"
                placeholderTextColor="#666"
                autoCapitalize="none"
                value={settings.ftp_host}
                onChangeText={(text) => setSettings(prev => ({ ...prev, ftp_host: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Port</Text>
              <TextInput
                style={styles.input}
                placeholder="21"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={String(settings.ftp_port)}
                onChangeText={(text) => setSettings(prev => ({ ...prev, ftp_port: parseInt(text) || 21 }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Login FTP</Text>
              <TextInput
                style={styles.input}
                placeholder="nazwa_uzytkownika"
                placeholderTextColor="#666"
                autoCapitalize="none"
                value={settings.ftp_user}
                onChangeText={(text) => setSettings(prev => ({ ...prev, ftp_user: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hasło FTP</Text>
              <TextInput
                style={styles.input}
                placeholder="Hasło"
                placeholderTextColor="#666"
                secureTextEntry
                value={settings.ftp_password}
                onChangeText={(text) => setSettings(prev => ({ ...prev, ftp_password: text }))}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ścieżka docelowa</Text>
              <TextInput
                style={styles.input}
                placeholder="/backups/"
                placeholderTextColor="#666"
                autoCapitalize="none"
                value={settings.ftp_path}
                onChangeText={(text) => setSettings(prev => ({ ...prev, ftp_path: text }))}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Zapisz ustawienia</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.testButton}
                onPress={testFtp}
                disabled={testingFtp || !settings.ftp_host}
              >
                {testingFtp ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <Text style={styles.testButtonText}>Test</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Automatyczne kopie zapasowe</Text>
              <Switch
                value={settings.schedule_enabled}
                onValueChange={(value) => setSettings(prev => ({ ...prev, schedule_enabled: value }))}
                trackColor={{ false: '#333', true: '#3b82f6' }}
                thumbColor="#fff"
              />
            </View>

            <Text style={styles.scheduleInfo}>
              Kopie będą tworzone codziennie o wybranej godzinie i wysyłane na skonfigurowane kanały (email, FTP).
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Godzina wykonywania kopii</Text>
              <TouchableOpacity 
                style={styles.timeSelector}
                onPress={() => setShowTimeSelector(!showTimeSelector)}
              >
                <Ionicons name="time" size={24} color="#3b82f6" />
                <Text style={styles.timeSelectorText}>{settings.schedule_time}</Text>
                <Ionicons name={showTimeSelector ? 'chevron-up' : 'chevron-down'} size={24} color="#888" />
              </TouchableOpacity>
            </View>

            {showTimeSelector && (
              <View style={styles.timeList}>
                {SCHEDULE_TIMES.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.timeItem,
                      settings.schedule_time === time && styles.timeItemActive
                    ]}
                    onPress={() => {
                      setSettings(prev => ({ ...prev, schedule_time: time }));
                      setShowTimeSelector(false);
                    }}
                  >
                    <Text style={[
                      styles.timeItemText,
                      settings.schedule_time === time && styles.timeItemTextActive
                    ]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.channelsSection}>
              <Text style={styles.channelsTitle}>Kanały wysyłki:</Text>
              <View style={styles.channelItem}>
                <Ionicons 
                  name={settings.email_enabled ? 'checkmark-circle' : 'close-circle'} 
                  size={20} 
                  color={settings.email_enabled ? '#10b981' : '#ef4444'} 
                />
                <Text style={styles.channelText}>
                  Email: {settings.email_enabled ? 'Skonfigurowany' : 'Nie skonfigurowany'}
                </Text>
              </View>
              <View style={styles.channelItem}>
                <Ionicons 
                  name={settings.ftp_enabled ? 'checkmark-circle' : 'close-circle'} 
                  size={20} 
                  color={settings.ftp_enabled ? '#10b981' : '#ef4444'} 
                />
                <Text style={styles.channelText}>
                  FTP: {settings.ftp_enabled ? 'Skonfigurowany' : 'Nie skonfigurowany'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Zapisz harmonogram</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.noteText}>
              ⚠️ Uwaga: Automatyczne kopie wymagają, aby serwer był uruchomiony o wybranej godzinie.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
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
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    color: '#888',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    color: '#888',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  textDisabled: {
    color: '#666',
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 10,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  logIcon: {
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  logDate: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  logDetails: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  logError: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  switchLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  inputRow: {
    flexDirection: 'row',
  },
  switchInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  switchInlineText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 10,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  testButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '500',
  },
  scheduleInfo: {
    color: '#888',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 20,
  },
  timeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  timeSelectorText: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  timeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginBottom: 20,
    gap: 8,
  },
  timeItem: {
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  timeItemActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  timeItemText: {
    color: '#fff',
    fontSize: 14,
  },
  timeItemTextActive: {
    fontWeight: '600',
  },
  channelsSection: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  channelsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  channelText: {
    color: '#888',
    fontSize: 14,
  },
  noteText: {
    color: '#f59e0b',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
});
