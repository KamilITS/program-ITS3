import React, { useState, useEffect, useRef } from 'react';
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
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { pl } from 'date-fns/locale';

const WARSAW_TZ = 'Europe/Warsaw';

const formatInWarsaw = (dateStr: string, formatStr: string) => {
  const date = new Date(dateStr);
  const warsawDate = toZonedTime(date, WARSAW_TZ);
  return format(warsawDate, formatStr, { locale: pl });
};

// Default order items
const DEFAULT_ORDER_ITEMS = [
  { id: 'ont', name: 'ONT', category: 'device', autoStock: true },
  { id: 'tmobile_cpe', name: 'T-Mobile CPE', category: 'device', autoStock: true },
  { id: 'tmobile_stb', name: 'T-Mobile STB', category: 'device', autoStock: true },
  { id: 'gap', name: 'GAP', category: 'material', autoStock: false },
  { id: 'wkrety', name: 'WKRĘTY', category: 'material', autoStock: false },
  { id: 'adapter', name: 'ADAPTER', category: 'material', autoStock: false },
  { id: 'patchcord', name: 'PATCHCORD', category: 'material', autoStock: false },
  { id: 'pigtail', name: 'PIGTAIL', category: 'material', autoStock: false },
  { id: 'kabel', name: 'KABEL', category: 'material', autoStock: false },
  { id: 'oslonki_spawu', name: 'OSŁONKI SPAWU', category: 'material', autoStock: false },
  { id: 'uchwyt_odc', name: 'UCHWYT ODC', category: 'material', autoStock: false },
  { id: 'uchwyt_usmo6', name: 'UCHWYT USMO6', category: 'material', autoStock: false },
  { id: 'uchwyt_flop', name: 'UCHWYT FLOP', category: 'material', autoStock: false },
  { id: 'kotwa', name: 'KOTWA', category: 'material', autoStock: false },
  { id: 'hak_swinski_ogon', name: 'HAK „ŚWIŃSKI OGON"', category: 'material', autoStock: false },
  { id: 'play_cpe', name: 'PLAY CPE', category: 'device', autoStock: true, subItem: true },
  { id: 'play_stb', name: 'PLAY STB', category: 'device', autoStock: true, subItem: true },
  { id: 'upc_cpe', name: 'UPC CPE', category: 'device', autoStock: true, subItem: true },
  { id: 'upc_stb', name: 'UPC STB', category: 'device', autoStock: true, subItem: true },
];

interface OrderItem {
  id: string;
  name: string;
  category: string;
  autoStock: boolean;
  subItem?: boolean;
  currentStock: string;
  orderQuantity: string;
  isCustom?: boolean;
}

interface Order {
  order_id: string;
  user_id: string;
  user_name: string;
  items: OrderItem[];
  status: string;
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  processed_by_name?: string;
}

export default function Orders() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [customItems, setCustomItems] = useState<OrderItem[]>([]);
  const [customItemText, setCustomItemText] = useState('');
  const [deviceStocks, setDeviceStocks] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Admin state
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [additionalItems, setAdditionalItems] = useState<{id: string, name: string}[]>([]);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (isAdmin) {
        loadOrders();
        loadAdditionalItems();
      } else {
        loadDeviceStocks();
        loadAdditionalItems();
      }
    }
  }, [isAuthenticated, user]);

  const loadDeviceStocks = async () => {
    try {
      const devices = await apiFetch('/api/devices');
      const stocks: Record<string, number> = {};
      
      // Count devices by type
      devices.forEach((device: any) => {
        if (device.status === 'przypisany') {
          const name = device.nazwa?.toUpperCase() || '';
          
          if (name.includes('ONT')) {
            stocks['ont'] = (stocks['ont'] || 0) + 1;
          } else if (name.includes('T-MOBILE') && name.includes('CPE')) {
            stocks['tmobile_cpe'] = (stocks['tmobile_cpe'] || 0) + 1;
          } else if (name.includes('T-MOBILE') && name.includes('STB')) {
            stocks['tmobile_stb'] = (stocks['tmobile_stb'] || 0) + 1;
          } else if (name.includes('PLAY') && name.includes('CPE')) {
            stocks['play_cpe'] = (stocks['play_cpe'] || 0) + 1;
          } else if (name.includes('PLAY') && (name.includes('STB') || name.includes('BOX'))) {
            stocks['play_stb'] = (stocks['play_stb'] || 0) + 1;
          } else if (name.includes('UPC') && name.includes('CPE')) {
            stocks['upc_cpe'] = (stocks['upc_cpe'] || 0) + 1;
          } else if (name.includes('UPC') && name.includes('STB')) {
            stocks['upc_stb'] = (stocks['upc_stb'] || 0) + 1;
          }
        }
      });
      
      setDeviceStocks(stocks);
      initializeOrderItems(stocks);
    } catch (error) {
      console.error('Error loading device stocks:', error);
      initializeOrderItems({});
    } finally {
      setLoading(false);
    }
  };

  const loadAdditionalItems = async () => {
    try {
      const items = await apiFetch('/api/orders/items');
      setAdditionalItems(items || []);
    } catch (error) {
      console.error('Error loading additional items:', error);
    }
  };

  const initializeOrderItems = (stocks: Record<string, number>) => {
    const items = DEFAULT_ORDER_ITEMS.map(item => ({
      ...item,
      currentStock: item.autoStock ? String(stocks[item.id] || 0) : '',
      orderQuantity: '',
    }));
    setOrderItems(items);
  };

  const loadOrders = async () => {
    try {
      const data = await apiFetch('/api/orders');
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateOrderQuantity = (id: string, value: string) => {
    setOrderItems(prev => prev.map(item => 
      item.id === id ? { ...item, orderQuantity: value } : item
    ));
  };

  const updateCurrentStock = (id: string, value: string) => {
    setOrderItems(prev => prev.map(item => 
      item.id === id ? { ...item, currentStock: value } : item
    ));
  };

  const updateCustomItem = (index: number, field: 'orderQuantity', value: string) => {
    setCustomItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addCustomItem = () => {
    if (!customItemText.trim()) return;
    
    const newItem: OrderItem = {
      id: `custom_${Date.now()}`,
      name: customItemText.trim(),
      category: 'custom',
      autoStock: false,
      currentStock: '',
      orderQuantity: '',
      isCustom: true,
    };
    
    setCustomItems(prev => [...prev, newItem]);
    setCustomItemText('');
  };

  const submitOrder = async () => {
    // Get items with order quantity > 0
    const itemsToOrder = [
      ...orderItems.filter(item => item.orderQuantity && parseInt(item.orderQuantity) > 0),
      ...customItems.filter(item => item.orderQuantity && parseInt(item.orderQuantity) > 0),
    ];

    if (itemsToOrder.length === 0) {
      Alert.alert('Błąd', 'Nie zaznaczono żadnych pozycji do zamówienia.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: { items: itemsToOrder },
      });
      
      Alert.alert('Sukces', 'Zamówienie zostało wysłane do administratora.');
      
      // Reset form
      initializeOrderItems(deviceStocks);
      setCustomItems([]);
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się wysłać zamówienia.');
    } finally {
      setSubmitting(false);
    }
  };

  const processOrder = async (orderId: string, status: 'completed' | 'rejected') => {
    try {
      await apiFetch(`/api/orders/${orderId}/process`, {
        method: 'POST',
        body: { status },
      });
      
      Alert.alert('Sukces', status === 'completed' ? 'Zamówienie zostało zrealizowane.' : 'Zamówienie zostało odrzucone.');
      setOrderModalVisible(false);
      loadOrders();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się przetworzyć zamówienia.');
    }
  };

  const addNewItem = async () => {
    if (!newItemName.trim()) return;
    
    try {
      await apiFetch('/api/orders/items', {
        method: 'POST',
        body: { name: newItemName.trim() },
      });
      
      Alert.alert('Sukces', 'Pozycja została dodana.');
      setNewItemName('');
      setAddItemModalVisible(false);
      loadAdditionalItems();
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się dodać pozycji.');
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      await apiFetch(`/api/orders/items/${itemId}`, { method: 'DELETE' });
      loadAdditionalItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const renderOrderRow = (item: OrderItem, index: number, isCustom: boolean = false) => {
    const hasQuantity = item.orderQuantity && parseInt(item.orderQuantity) > 0;
    
    // For custom items - simplified row without stock field
    if (isCustom) {
      return (
        <View key={item.id} style={styles.tableRow}>
          {/* Checkbox */}
          <View style={styles.checkboxCell}>
            <Ionicons 
              name={hasQuantity ? 'checkbox' : 'square-outline'} 
              size={22} 
              color={hasQuantity ? '#10b981' : '#444'} 
            />
          </View>
          
          {/* Item Name - takes more space since no stock cell */}
          <View style={[styles.nameCell, { flex: 2 }]}>
            <Text style={styles.itemName}>{item.name}</Text>
          </View>
          
          {/* Order Quantity */}
          <View style={[styles.orderCell, { width: 80 }]}>
            <TextInput
              style={styles.orderInput}
              value={item.orderQuantity}
              onChangeText={(value) => updateCustomItem(index, 'orderQuantity', value)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#555"
            />
          </View>
        </View>
      );
    }
    
    return (
      <View key={item.id} style={[styles.tableRow, item.subItem && styles.subItemRow]}>
        {/* Checkbox */}
        <View style={styles.checkboxCell}>
          <Ionicons 
            name={hasQuantity ? 'checkbox' : 'square-outline'} 
            size={22} 
            color={hasQuantity ? '#10b981' : '#444'} 
          />
        </View>
        
        {/* Item Name */}
        <View style={styles.nameCell}>
          <Text style={[styles.itemName, item.subItem && styles.subItemName]}>
            {item.subItem ? `  ${item.name}` : item.name}
          </Text>
        </View>
        
        {/* Current Stock */}
        <View style={styles.stockCell}>
          {item.autoStock ? (
            <Text style={styles.autoStockText}>{item.currentStock}</Text>
          ) : (
            <TextInput
              style={styles.stockInput}
              value={item.currentStock}
              onChangeText={(value) => updateCurrentStock(item.id, value)}
              keyboardType="numeric"
              placeholder="-"
              placeholderTextColor="#555"
            />
          )}
        </View>
        
        {/* Order Quantity */}
        <View style={styles.orderCell}>
          <TextInput
            style={styles.orderInput}
            value={item.orderQuantity}
            onChangeText={(value) => updateOrderQuantity(item.id, value)}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#555"
          />
        </View>
      </View>
    );
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

  // Admin View
  if (isAdmin) {
    const pendingOrders = orders.filter(o => o.status === 'pending');
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Zamówienia</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Pending Orders Badge */}
        {pendingOrders.length > 0 && (
          <View style={styles.pendingBanner}>
            <Ionicons name="alert-circle" size={20} color="#fff" />
            <Text style={styles.pendingBannerText}>
              {pendingOrders.length} {pendingOrders.length === 1 ? 'nowe zamówienie' : 'nowych zamówień'}
            </Text>
          </View>
        )}

        <ScrollView 
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} />
          }
        >
          {orders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={64} color="#333" />
              <Text style={styles.emptyText}>Brak zamówień</Text>
            </View>
          ) : (
            orders.map(order => (
              <TouchableOpacity 
                key={order.order_id} 
                style={[
                  styles.orderCard,
                  order.status === 'pending' && styles.orderCardPending,
                  order.status === 'completed' && styles.orderCardCompleted,
                  order.status === 'rejected' && styles.orderCardRejected,
                ]}
                onPress={() => { setSelectedOrder(order); setOrderModalVisible(true); }}
              >
                <View style={styles.orderCardHeader}>
                  <View style={styles.orderUserInfo}>
                    <Ionicons name="person-circle" size={32} color="#3b82f6" />
                    <View>
                      <Text style={styles.orderUserName}>{order.user_name}</Text>
                      <Text style={styles.orderDate}>
                        {formatInWarsaw(order.created_at, 'd MMM yyyy, HH:mm')}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    order.status === 'pending' && { backgroundColor: '#f59e0b' },
                    order.status === 'completed' && { backgroundColor: '#10b981' },
                    order.status === 'rejected' && { backgroundColor: '#ef4444' },
                  ]}>
                    <Text style={styles.statusText}>
                      {order.status === 'pending' ? 'Oczekuje' : order.status === 'completed' ? 'Zrealizowane' : 'Odrzucone'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.orderItemsCount}>
                  {order.items.filter(i => parseInt(i.orderQuantity) > 0).length} pozycji
                </Text>
              </TouchableOpacity>
            ))
          )}
          
          {/* Additional Items Management */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Dodatkowe pozycje</Text>
              <TouchableOpacity onPress={() => setAddItemModalVisible(true)} style={styles.addSectionButton}>
                <Ionicons name="add-circle" size={26} color="#10b981" />
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionDescription}>
              Pozycje dodane przez admina będą widoczne dla pracowników w formularzu zamówienia.
            </Text>
            {additionalItems.map(item => (
              <View key={item.id} style={styles.additionalItemRow}>
                <Text style={styles.additionalItemName}>{item.name}</Text>
                <TouchableOpacity onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Order Details Modal */}
        <Modal
          visible={orderModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setOrderModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Szczegóły zamówienia</Text>
                <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              {selectedOrder && (
                <ScrollView style={styles.modalBody}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderInfoLabel}>Pracownik:</Text>
                    <Text style={styles.orderInfoValue}>{selectedOrder.user_name}</Text>
                  </View>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderInfoLabel}>Data zamówienia:</Text>
                    <Text style={styles.orderInfoValue}>
                      {formatInWarsaw(selectedOrder.created_at, 'd MMMM yyyy, HH:mm')}
                    </Text>
                  </View>
                  {selectedOrder.processed_at && (
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderInfoLabel}>Data realizacji:</Text>
                      <Text style={[
                        styles.orderInfoValue,
                        selectedOrder.status === 'completed' ? { color: '#10b981' } : { color: '#ef4444' }
                      ]}>
                        {formatInWarsaw(selectedOrder.processed_at, 'd MMMM yyyy, HH:mm')}
                      </Text>
                    </View>
                  )}
                  {selectedOrder.processed_by_name && (
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderInfoLabel}>Realizujący:</Text>
                      <Text style={styles.orderInfoValue}>{selectedOrder.processed_by_name}</Text>
                    </View>
                  )}
                  
                  <Text style={styles.orderItemsTitle}>Zamówione pozycje:</Text>
                  {selectedOrder.items
                    .filter(item => parseInt(item.orderQuantity) > 0)
                    .map((item, idx) => (
                      <View key={idx} style={styles.orderItemRow}>
                        <Text style={styles.orderItemName}>{item.name}</Text>
                        <View style={styles.orderItemQuantities}>
                          <Text style={styles.orderItemStock}>Stan: {item.currentStock || '-'}</Text>
                          <Text style={styles.orderItemQty}>Zamówiono: {item.orderQuantity}</Text>
                        </View>
                      </View>
                    ))
                  }
                  
                  {selectedOrder.status === 'pending' && (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity 
                        style={[styles.actionButton, { backgroundColor: '#10b981' }]}
                        onPress={() => processOrder(selectedOrder.order_id, 'completed')}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Zrealizuj</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionButton, { backgroundColor: '#ef4444' }]}
                        onPress={() => processOrder(selectedOrder.order_id, 'rejected')}
                      >
                        <Ionicons name="close-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Odrzuć</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Add Item Modal */}
        <Modal
          visible={addItemModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAddItemModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: 300 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Dodaj pozycję</Text>
                <TouchableOpacity onPress={() => setAddItemModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>Nazwa pozycji:</Text>
                <TextInput
                  style={styles.textInput}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder="Wprowadź nazwę..."
                  placeholderTextColor="#666"
                />
                <TouchableOpacity style={styles.addItemButton} onPress={addNewItem}>
                  <Text style={styles.addItemButtonText}>Dodaj</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Employee View
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Zamów urządzenia</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#3b82f6" />
            <Text style={styles.infoText}>
              Zaznacz pozycje, które chcesz zamówić, wpisując ilość w kolumnie "Zamawiam".
            </Text>
          </View>

          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.checkboxCell}>
              <Ionicons name="checkbox-outline" size={16} color="#888" />
            </View>
            <View style={styles.nameCell}>
              <Text style={styles.tableHeaderText}>Urządzenia/Materiały</Text>
            </View>
            <View style={styles.stockCell}>
              <Text style={styles.tableHeaderText}>Stan</Text>
            </View>
            <View style={styles.orderCell}>
              <Text style={styles.tableHeaderText}>Zamawiam</Text>
            </View>
          </View>

          {/* Order Items */}
          {orderItems.map((item, index) => renderOrderRow(item, index))}
          
          {/* Additional Items from Admin */}
          {additionalItems.map((item, index) => {
            const orderItem: OrderItem = {
              id: item.id,
              name: item.name,
              category: 'additional',
              autoStock: false,
              currentStock: orderItems.find(o => o.id === item.id)?.currentStock || '',
              orderQuantity: orderItems.find(o => o.id === item.id)?.orderQuantity || '',
            };
            return renderOrderRow(orderItem, index);
          })}

          {/* Custom Items Section */}
          <View style={styles.customSection}>
            <Text style={styles.customSectionTitle}>INNE - pozycje własne</Text>
            <Text style={styles.customSectionHint}>
              Tutaj możesz wpisać nazwę i ilość elementów, które nie zostały wymienione powyżej.
            </Text>
            
            {customItems.map((item, index) => renderOrderRow(item, index, true))}
            
            <View style={styles.addCustomRow}>
              <TextInput
                style={styles.customInput}
                value={customItemText}
                onChangeText={setCustomItemText}
                placeholder="Wpisz nazwę pozycji..."
                placeholderTextColor="#666"
                returnKeyType="done"
                onSubmitEditing={addCustomItem}
              />
              <TouchableOpacity style={styles.addCustomButton} onPress={addCustomItem}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity 
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={submitOrder}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Wyślij zamówienie</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
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
  addButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 12,
    margin: 16,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    color: '#3b82f6',
    fontSize: 13,
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  tableHeaderText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  subItemRow: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  checkboxCell: {
    width: 36,
    alignItems: 'center',
  },
  nameCell: {
    flex: 1,
    paddingRight: 8,
  },
  stockCell: {
    width: 60,
    alignItems: 'center',
  },
  orderCell: {
    width: 70,
    alignItems: 'center',
  },
  itemName: {
    color: '#fff',
    fontSize: 13,
  },
  subItemName: {
    color: '#aaa',
    fontSize: 12,
  },
  autoStockText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  stockInput: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    width: 50,
  },
  orderInput: {
    backgroundColor: '#1a1a1a',
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    width: 60,
    borderWidth: 1,
    borderColor: '#333',
  },
  customSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  customSectionTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  customSectionHint: {
    color: '#666',
    fontSize: 11,
    marginBottom: 12,
  },
  addCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 14,
  },
  addCustomButton: {
    backgroundColor: '#3b82f6',
    padding: 10,
    borderRadius: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Admin styles
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    gap: 8,
  },
  pendingBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  orderCard: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#333',
  },
  orderCardPending: {
    borderLeftColor: '#f59e0b',
  },
  orderCardCompleted: {
    borderLeftColor: '#10b981',
  },
  orderCardRejected: {
    borderLeftColor: '#ef4444',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderUserName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  orderDate: {
    color: '#888',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  orderItemsCount: {
    color: '#888',
    fontSize: 13,
    marginTop: 10,
  },
  section: {
    margin: 16,
    padding: 16,
    backgroundColor: '#111',
    borderRadius: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    color: '#888',
    fontSize: 12,
    marginBottom: 12,
  },
  additionalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  additionalItemName: {
    color: '#fff',
    fontSize: 14,
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
  orderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  orderInfoLabel: {
    color: '#888',
    fontSize: 14,
  },
  orderInfoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  orderItemsTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
  },
  orderItemRow: {
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  orderItemName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  orderItemQuantities: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  orderItemStock: {
    color: '#888',
    fontSize: 12,
  },
  orderItemQty: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inputLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  addItemButton: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  addItemButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
