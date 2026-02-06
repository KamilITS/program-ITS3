import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  RefreshControl,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { apiFetch } from '../src/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, isBefore, isToday, isTomorrow } from 'date-fns';
import { pl } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';

interface Task {
  task_id: string;
  title: string;
  description?: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  status: string;
  priority: string;
  completion_photos?: string[];
}

interface Worker {
  user_id: string;
  name: string;
  email: string;
}

export default function Tasks() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date(addDays(new Date(), 1)));
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assigned_to: '',
    due_date: format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
    priority: 'normalne',
  });

  const suggestedTimes = [
    '08:00', '09:00', '10:00', '11:00', '12:00', 
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ];

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated]);

  const loadData = async () => {
    try {
      const [tasksData, workersData] = await Promise.all([
        apiFetch('/api/tasks'),
        apiFetch('/api/workers'),
      ]);
      setTasks(tasksData);
      setWorkers(workersData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !newTask.assigned_to) {
      Alert.alert('Błąd', 'Wypełnij tytuł i przypisz pracownika');
      return;
    }

    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: newTask,
      });
      setModalVisible(false);
      setNewTask({
        title: '',
        description: '',
        assigned_to: '',
        due_date: format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
        priority: 'normalne',
      });
      await loadData();
      Alert.alert('Sukces', 'Zadanie zostało utworzone');
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      await loadData();
    } catch (error: any) {
      Alert.alert('Błąd', error.message);
    }
  };

  const openCompleteModal = (task: Task) => {
    setSelectedTask(task);
    setCompletionPhotos([]);
    setCompleteModalVisible(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCompletionPhotos(prev => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Błąd', 'Brak dostępu do kamery');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCompletionPhotos(prev => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
    }
  };

  const removePhoto = (index: number) => {
    setCompletionPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleCompleteTask = async () => {
    if (!selectedTask) return;
    
    if (completionPhotos.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('Dodaj minimum 1 zdjęcie potwierdzające wykonanie zadania');
      } else {
        Alert.alert('Wymagane zdjęcie', 'Dodaj minimum 1 zdjęcie potwierdzające wykonanie zadania');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${selectedTask.task_id}`, {
        method: 'PUT',
        body: { 
          status: 'zakonczone',
          completion_photos: completionPhotos
        },
      });
      
      setCompleteModalVisible(false);
      setSelectedTask(null);
      setCompletionPhotos([]);
      await loadData();
      
      if (Platform.OS === 'web') {
        window.alert('Zadanie zostało zakończone');
      } else {
        Alert.alert('Sukces', 'Zadanie zostało zakończone');
      }
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert('Błąd: ' + error.message);
      } else {
        Alert.alert('Błąd', error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    Alert.alert(
      'Usuń zadanie',
      'Czy na pewno chcesz usunąć to zadanie?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
              await loadData();
            } catch (error: any) {
              Alert.alert('Błąd', error.message);
            }
          },
        },
      ]
    );
  };

  const filteredTasks = tasks.filter((task) => 
    !statusFilter || task.status === statusFilter
  );

  const statusFilters = [
    { key: null, label: 'Wszystkie' },
    { key: 'oczekujace', label: 'Oczekujące' },
    { key: 'w_trakcie', label: 'W trakcie' },
    { key: 'zakonczone', label: 'Zakończone' },
  ];

  const priorities = ['niskie', 'normalne', 'wysokie', 'pilne'];

  const getDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Dzisiaj';
    if (isTomorrow(date)) return 'Jutro';
    return format(date, 'd MMM', { locale: pl });
  };

  const renderTask = ({ item }: { item: Task }) => {
    const assignedWorker = workers.find((w) => w.user_id === item.assigned_to);
    const dueDate = new Date(item.due_date);
    const isOverdue = isBefore(dueDate, new Date()) && item.status !== 'zakonczone';

    return (
      <View style={[
        styles.taskCard,
        item.status === 'zakonczone' && styles.taskCardCompleted,
      ]}>
        <View style={styles.taskHeader}>
          <TouchableOpacity
            style={[
              styles.statusCheckbox,
              item.status === 'zakonczone' && styles.statusCheckboxCompleted,
            ]}
            onPress={() => {
              if (item.status === 'zakonczone') {
                // Reopen task
                handleUpdateStatus(item.task_id, 'oczekujace');
              } else {
                // Open complete modal with photo requirement
                openCompleteModal(item);
              }
            }}
          >
            {item.status === 'zakonczone' && (
              <Ionicons name="checkmark" size={16} color="#fff" />
            )}
          </TouchableOpacity>

          <View style={styles.taskInfo}>
            <Text style={[
              styles.taskTitle,
              item.status === 'zakonczone' && styles.taskTitleCompleted,
            ]}>
              {item.title}
            </Text>
            {item.description && (
              <Text style={styles.taskDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>

          {isAdmin && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteTask(item.task_id)}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.taskMeta}>
          <View style={[
            styles.priorityBadge,
            item.priority === 'niskie' && { backgroundColor: '#6b7280' },
            item.priority === 'normalne' && { backgroundColor: '#3b82f6' },
            item.priority === 'wysokie' && { backgroundColor: '#f59e0b' },
            item.priority === 'pilne' && { backgroundColor: '#ef4444' },
          ]}>
            <Text style={styles.priorityText}>{item.priority}</Text>
          </View>

          <View style={[styles.dueDateBadge, isOverdue && styles.overdueBadge]}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={isOverdue ? '#ef4444' : '#888'}
            />
            <Text style={[styles.dueDateText, isOverdue && styles.overdueText]}>
              {getDateLabel(item.due_date)}
            </Text>
          </View>

          {assignedWorker && (
            <View style={styles.assignedBadge}>
              <Ionicons name="person-outline" size={14} color="#888" />
              <Text style={styles.assignedText}>{assignedWorker.name}</Text>
            </View>
          )}
          
          {item.completion_photos && item.completion_photos.length > 0 && (
            <View style={styles.photosBadge}>
              <Ionicons name="camera" size={14} color="#10b981" />
              <Text style={styles.photosText}>{item.completion_photos.length} zdjęć</Text>
            </View>
          )}
        </View>

        {item.status !== 'zakonczone' && (
          <View style={styles.taskActions}>
            <TouchableOpacity
              style={[
                styles.statusButton,
                item.status === 'oczekujace' && styles.statusButtonActive,
              ]}
              onPress={() => handleUpdateStatus(item.task_id, 'oczekujace')}
            >
              <Text style={styles.statusButtonText}>Oczekuje</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statusButton,
                item.status === 'w_trakcie' && styles.statusButtonActive,
              ]}
              onPress={() => handleUpdateStatus(item.task_id, 'w_trakcie')}
            >
              <Text style={styles.statusButtonText}>W trakcie</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={() => openCompleteModal(item)}
            >
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.completeButtonText}>Zakończ</Text>
            </TouchableOpacity>
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
        <Text style={styles.title}>Zadania</Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
            <Ionicons name="add" size={28} color="#3b82f6" />
          </TouchableOpacity>
        )}
        {!isAdmin && <View style={{ width: 40 }} />}
      </View>

      {/* Status Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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

      <FlatList
        data={filteredTasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.task_id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>Brak zadań</Text>
          </View>
        }
      />

      {/* Create Task Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nowe zadanie</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Tytuł</Text>
              <TextInput
                style={styles.input}
                placeholder="Wprowadź tytuł..."
                placeholderTextColor="#888"
                value={newTask.title}
                onChangeText={(text) => setNewTask({ ...newTask, title: text })}
              />

              <Text style={styles.inputLabel}>Opis</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Wprowadź opis..."
                placeholderTextColor="#888"
                value={newTask.description}
                onChangeText={(text) => setNewTask({ ...newTask, description: text })}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>Przypisz do</Text>
              <View style={styles.workerSelect}>
                {workers.map((worker) => (
                  <TouchableOpacity
                    key={worker.user_id}
                    style={[
                      styles.workerOption,
                      newTask.assigned_to === worker.user_id && styles.workerOptionActive,
                    ]}
                    onPress={() => setNewTask({ ...newTask, assigned_to: worker.user_id })}
                  >
                    <Text style={[
                      styles.workerOptionText,
                      newTask.assigned_to === worker.user_id && styles.workerOptionTextActive,
                    ]}>
                      {worker.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Priorytet</Text>
              <View style={styles.prioritySelect}>
                {priorities.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityOption,
                      newTask.priority === p && styles.priorityOptionActive,
                    ]}
                    onPress={() => setNewTask({ ...newTask, priority: p })}
                  >
                    <Text style={[
                      styles.priorityOptionText,
                      newTask.priority === p && styles.priorityOptionTextActive,
                    ]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Termin wykonania</Text>
              
              {/* Quick Date Options */}
              <View style={styles.quickDateOptions}>
                <TouchableOpacity
                  style={[styles.quickDateOption, format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && styles.quickDateOptionActive]}
                  onPress={() => {
                    const today = new Date();
                    setSelectedDate(today);
                    setNewTask({ ...newTask, due_date: `${format(today, 'yyyy-MM-dd')}T${selectedTime}` });
                  }}
                >
                  <Text style={styles.quickDateOptionText}>Dziś</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickDateOption, format(selectedDate, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd') && styles.quickDateOptionActive]}
                  onPress={() => {
                    const tomorrow = addDays(new Date(), 1);
                    setSelectedDate(tomorrow);
                    setNewTask({ ...newTask, due_date: `${format(tomorrow, 'yyyy-MM-dd')}T${selectedTime}` });
                  }}
                >
                  <Text style={styles.quickDateOptionText}>Jutro</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickDateOption, format(selectedDate, 'yyyy-MM-dd') === format(addDays(new Date(), 7), 'yyyy-MM-dd') && styles.quickDateOptionActive]}
                  onPress={() => {
                    const nextWeek = addDays(new Date(), 7);
                    setSelectedDate(nextWeek);
                    setNewTask({ ...newTask, due_date: `${format(nextWeek, 'yyyy-MM-dd')}T${selectedTime}` });
                  }}
                >
                  <Text style={styles.quickDateOptionText}>Za tydzień</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Picker */}
              <TouchableOpacity 
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <Ionicons name="calendar" size={24} color="#3b82f6" />
                <Text style={styles.datePickerText}>
                  {format(selectedDate, 'd MMMM yyyy', { locale: pl })}
                </Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
              </TouchableOpacity>

              {showDatePicker && (
                <View style={styles.calendarContainer}>
                  {/* Simple calendar - show days of current month */}
                  <View style={styles.calendarHeader}>
                    <TouchableOpacity 
                      onPress={() => {
                        const prevMonth = new Date(selectedDate);
                        prevMonth.setMonth(prevMonth.getMonth() - 1);
                        setSelectedDate(prevMonth);
                      }}
                    >
                      <Ionicons name="chevron-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonth}>
                      {format(selectedDate, 'LLLL yyyy', { locale: pl })}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => {
                        const nextMonth = new Date(selectedDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        setSelectedDate(nextMonth);
                      }}
                    >
                      <Ionicons name="chevron-forward" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.calendarWeekDays}>
                    {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map(day => (
                      <Text key={day} style={styles.calendarWeekDay}>{day}</Text>
                    ))}
                  </View>
                  
                  <View style={styles.calendarDays}>
                    {(() => {
                      const firstDayOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                      const lastDayOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
                      const startDay = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;
                      const days = [];
                      
                      // Empty cells before first day
                      for (let i = 0; i < startDay; i++) {
                        days.push(<View key={`empty-${i}`} style={styles.calendarDayEmpty} />);
                      }
                      
                      // Days of month
                      for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
                        const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                        const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
                        const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                        
                        days.push(
                          <TouchableOpacity
                            key={day}
                            style={[
                              styles.calendarDay,
                              isSelected && styles.calendarDaySelected,
                              isToday && !isSelected && styles.calendarDayToday,
                            ]}
                            onPress={() => {
                              const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                              setSelectedDate(newDate);
                              setNewTask({ ...newTask, due_date: `${format(newDate, 'yyyy-MM-dd')}T${selectedTime}` });
                            }}
                          >
                            <Text style={[
                              styles.calendarDayText,
                              isSelected && styles.calendarDayTextSelected,
                              isToday && !isSelected && styles.calendarDayTextToday,
                            ]}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      
                      return days;
                    })()}
                  </View>
                </View>
              )}

              {/* Time Selection */}
              <Text style={[styles.inputLabel, { marginTop: 16 }]}>Godzina</Text>
              <View style={styles.timeOptions}>
                {suggestedTimes.map(time => (
                  <TouchableOpacity
                    key={time}
                    style={[styles.timeOption, selectedTime === time && styles.timeOptionActive]}
                    onPress={() => {
                      setSelectedTime(time);
                      setNewTask({ ...newTask, due_date: `${format(selectedDate, 'yyyy-MM-dd')}T${time}` });
                    }}
                  >
                    <Text style={[styles.timeOptionText, selectedTime === time && styles.timeOptionTextActive]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.selectedDateTime}>
                <Ionicons name="time" size={18} color="#3b82f6" />
                <Text style={styles.selectedDateTimeText}>
                  Wybrany termin: {format(selectedDate, 'd MMMM yyyy', { locale: pl })} o {selectedTime}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.createButton} onPress={handleCreateTask}>
              <Text style={styles.createButtonText}>Utwórz zadanie</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Complete Task Modal */}
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Zakończ zadanie</Text>
              <TouchableOpacity onPress={() => setCompleteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedTask && (
                <View style={styles.taskSummary}>
                  <Text style={styles.taskSummaryTitle}>{selectedTask.title}</Text>
                  {selectedTask.description && (
                    <Text style={styles.taskSummaryDesc}>{selectedTask.description}</Text>
                  )}
                </View>
              )}

              <View style={styles.photoRequirement}>
                <Ionicons name="camera" size={24} color="#f59e0b" />
                <Text style={styles.photoRequirementText}>
                  Dodaj minimum 1 zdjęcie potwierdzające wykonanie zadania
                </Text>
              </View>

              <View style={styles.photoButtons}>
                <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                  <Ionicons name="camera" size={24} color="#fff" />
                  <Text style={styles.photoButtonText}>Zrób zdjęcie</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                  <Ionicons name="images" size={24} color="#fff" />
                  <Text style={styles.photoButtonText}>Wybierz z galerii</Text>
                </TouchableOpacity>
              </View>

              {completionPhotos.length > 0 && (
                <View style={styles.photosGrid}>
                  {completionPhotos.map((photo, index) => (
                    <View key={index} style={styles.photoContainer}>
                      <Image source={{ uri: photo }} style={styles.photoPreview} />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => removePhoto(index)}
                      >
                        <Ionicons name="close-circle" size={24} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.photosCount}>
                Dodano zdjęć: {completionPhotos.length}
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.completeTaskButton,
                completionPhotos.length === 0 && styles.completeTaskButtonDisabled
              ]}
              onPress={handleCompleteTask}
              disabled={isSubmitting || completionPhotos.length === 0}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={styles.completeTaskButtonText}>
                    {completionPhotos.length === 0 ? 'Dodaj zdjęcie aby zakończyć' : 'Zakończ zadanie'}
                  </Text>
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
  addButton: {
    padding: 8,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    color: '#888',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  taskCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  taskCardCompleted: {
    opacity: 0.6,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  statusCheckboxCompleted: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  taskDescription: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  deleteButton: {
    padding: 4,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0a0a0a',
    borderRadius: 6,
    gap: 4,
  },
  overdueBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  dueDateText: {
    color: '#888',
    fontSize: 12,
  },
  overdueText: {
    color: '#ef4444',
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0a0a0a',
    borderRadius: 6,
    gap: 4,
  },
  assignedText: {
    color: '#888',
    fontSize: 12,
  },
  taskActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0a0a0a',
  },
  statusButtonActive: {
    backgroundColor: '#3b82f6',
  },
  statusButtonText: {
    color: '#fff',
    fontSize: 12,
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
    maxHeight: '90%',
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
    maxHeight: 400,
  },
  inputLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  workerSelect: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  workerOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  workerOptionActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  workerOptionText: {
    color: '#888',
    fontSize: 14,
  },
  workerOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  prioritySelect: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  priorityOptionActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  priorityOptionText: {
    color: '#888',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  priorityOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#3b82f6',
    margin: 20,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  photosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 6,
    gap: 4,
  },
  photosText: {
    color: '#10b981',
    fontSize: 12,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#10b981',
    gap: 4,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  taskSummary: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  taskSummaryTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  taskSummaryDesc: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  photoRequirement: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  photoRequirementText: {
    color: '#f59e0b',
    fontSize: 14,
    flex: 1,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  photoContainer: {
    position: 'relative',
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
  },
  photosCount: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  completeTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    margin: 20,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  completeTaskButtonDisabled: {
    backgroundColor: '#333',
  },
  completeTaskButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quickDateOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  quickDateOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  quickDateOptionActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  quickDateOptionText: {
    color: '#fff',
    fontSize: 13,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#333',
    gap: 10,
  },
  datePickerText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  calendarContainer: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarMonth: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  calendarWeekDays: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarWeekDay: {
    flex: 1,
    textAlign: 'center',
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  calendarDayEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: '#3b82f6',
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  calendarDayText: {
    color: '#fff',
    fontSize: 14,
  },
  calendarDayTextSelected: {
    fontWeight: 'bold',
  },
  calendarDayTextToday: {
    color: '#3b82f6',
  },
  timeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  timeOptionActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  timeOptionText: {
    color: '#888',
    fontSize: 14,
  },
  timeOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  selectedDateTime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  selectedDateTimeText: {
    color: '#3b82f6',
    fontSize: 14,
    flex: 1,
  },
});
