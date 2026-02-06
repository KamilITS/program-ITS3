import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';

interface BarcodeItem {
  kod_kreskowy: string;
  nazwa: string;
  count: number;
  devices: any[];
}

interface UserInventory {
  user_id: string;
  user_name: string;
  user_email: string;
  role: string;
  total_devices: number;
  by_barcode: BarcodeItem[];
  low_stock: BarcodeItem[];
  has_low_stock: boolean;
}

export default function Inventory() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [inventory, setInventory] = useState<UserInventory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserInventory | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [filterLowStock, setFilterLowStock] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
    if (!isLoading && user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, user]);

  const loadInventory = async () => {
    try {
      const data = await apiFetch('/api/devices/inventory/summary');
      setInventory(data);
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      loadInventory();
    }
  }, [isAuthenticated, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInventory();
    setRefreshing(false);
  };

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = 
      item.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.user_email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterLowStock) {
      return matchesSearch && item.has_low_stock;
    }
    return matchesSearch;
  });

  const totalDevices = inventory.reduce((sum, i) => sum + i.total_devices, 0);
  const usersWithLowStock = inventory.filter(i => i.has_low_stock).length;

  const renderUserCard = ({ item }: { item: UserInventory }) => (
    <TouchableOpacity
      style={[
        styles.userCard,
        item.has_low_stock && styles.userCardLowStock,
      ]}
      onPress={() => {
        setSelectedUser(item);
        setDetailModalVisible(true);
      }}
    >
      <View style={styles.userHeader}>
        <View style={styles.userAvatar}>
          <Ionicons
            name={item.role === 'admin' ? 'shield' : 'person'}
            size={24}
            color="#fff"
          />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.user_name}</Text>
          <Text style={styles.userEmail}>{item.user_email}</Text>
        </View>
        {item.has_low_stock && (
          <View style={styles.alertBadge}>
            <Ionicons name="warning" size={16} color="#fff" />
          </View>
        )}
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{item.total_devices}</Text>
          <Text style={styles.statLabel}>Urządzeń</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{item.by_barcode.length}</Text>
          <Text style={styles.statLabel}>Typów</Text>
        </View>
        {item.has_low_stock && (
          <View style={[styles.statBox, styles.statBoxAlert]}>
            <Text style={[styles.statNumber, styles.statNumberAlert]}>{item.low_stock.length}</Text>
            <Text style={[styles.statLabel, styles.statLabelAlert]}>Niski stan</Text>
          </View>
        )}
      </View>
      
      {/* Low stock items preview */}
      {item.low_stock.length > 0 && (
        <View style={styles.lowStockPreview}>
          {item.low_stock.slice(0, 2).map((ls, index) => (
            <View key={index} style={styles.lowStockItem}>
              <Ionicons name="alert-circle" size={14} color="#ef4444" />
              <Text style={styles.lowStockText} numberOfLines={1}>
                {ls.nazwa || ls.kod_kreskowy}: {ls.count} szt.
              </Text>
            </View>
          ))}
          {item.low_stock.length > 2 && (
            <Text style={styles.moreItems}>+{item.low_stock.length - 2} więcej</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Stany magazynowe</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Stats */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Ionicons name="cube-outline" size={24} color="#3b82f6" />
          <Text style={styles.summaryNumber}>{totalDevices}</Text>
          <Text style={styles.summaryLabel}>Wszystkich urządzeń</Text>
        </View>
        <View style={[styles.summaryCard, usersWithLowStock > 0 && styles.summaryCardAlert]}>
          <Ionicons name="warning-outline" size={24} color={usersWithLowStock > 0 ? '#ef4444' : '#888'} />
          <Text style={[styles.summaryNumber, usersWithLowStock > 0 && styles.summaryNumberAlert]}>
            {usersWithLowStock}
          </Text>
          <Text style={styles.summaryLabel}>Z niskim stanem</Text>
        </View>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Szukaj pracownika..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterButton, filterLowStock && styles.filterButtonActive]}
          onPress={() => setFilterLowStock(!filterLowStock)}
        >
          <Ionicons name="warning-outline" size={20} color={filterLowStock ? '#fff' : '#ef4444'} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredInventory}
        renderItem={renderUserCard}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>Brak danych</Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedUser?.user_name}
              </Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {selectedUser && (
              <ScrollView style={styles.modalBody}>
                <Text style={styles.modalSubtitle}>
                  Razem: {selectedUser.total_devices} urządzeń
                </Text>
                
                {selectedUser.by_barcode.map((item, index) => (
                  <View 
                    key={index} 
                    style={[
                      styles.inventoryItem,
                      item.count < 4 && styles.inventoryItemLowStock,
                    ]}
                  >
                    <View style={styles.inventoryInfo}>
                      <Text style={styles.inventoryName}>{item.nazwa || 'Bez nazwy'}</Text>
                      <Text style={styles.inventoryCode}>{item.kod_kreskowy}</Text>
                    </View>
                    <View style={[
                      styles.inventoryCount,
                      item.count < 4 && styles.inventoryCountLowStock,
                    ]}>
                      <Text style={[
                        styles.inventoryCountText,
                        item.count < 4 && styles.inventoryCountTextLowStock,
                      ]}>
                        {item.count}
                      </Text>
                      <Text style={[
                        styles.inventoryCountLabel,
                        item.count < 4 && styles.inventoryCountLabelLowStock,
                      ]}>szt.</Text>
                    </View>
                    {item.count < 4 && (
                      <Ionicons name="warning" size={20} color="#ef4444" style={{ marginLeft: 8 }} />
                    )}
                  </View>
                ))}
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
  summaryRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryCardAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  summaryNumber: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  summaryNumberAlert: {
    color: '#ef4444',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
    marginLeft: 8,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#ef4444',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  userCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userCardLowStock: {
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    color: '#888',
    fontSize: 13,
  },
  alertBadge: {
    backgroundColor: '#ef4444',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statBoxAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  statNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statNumberAlert: {
    color: '#ef4444',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  statLabelAlert: {
    color: '#ef4444',
  },
  lowStockPreview: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 10,
  },
  lowStockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  lowStockText: {
    color: '#ef4444',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  moreItems: {
    color: '#ef4444',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
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
  modalBody: {
    padding: 16,
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 16,
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  inventoryItemLowStock: {
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  inventoryInfo: {
    flex: 1,
  },
  inventoryName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inventoryCode: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  inventoryCount: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  inventoryCountLowStock: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  inventoryCountText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  inventoryCountTextLowStock: {
    color: '#ef4444',
  },
  inventoryCountLabel: {
    color: '#888',
    fontSize: 10,
  },
  inventoryCountLabelLowStock: {
    color: '#ef4444',
  },
});
