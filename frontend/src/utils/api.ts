import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface FetchOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const token = await AsyncStorage.getItem('session_token');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Błąd serwera' }));
    throw new Error(errorData.detail || 'Wystąpił błąd');
  }
  
  return response.json();
}

export async function uploadFile(endpoint: string, file: { uri: string; name: string; type: string }) {
  const token = await AsyncStorage.getItem('session_token');
  
  const formData = new FormData();
  
  // Check if we're on web platform
  if (typeof window !== 'undefined' && file.uri.startsWith('blob:')) {
    // Web platform - fetch the blob and create a File object
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const fileObj = new File([blob], file.name, { type: file.type });
    formData.append('file', fileObj);
  } else if (typeof window !== 'undefined' && file.uri.startsWith('data:')) {
    // Web platform with data URI - convert to blob
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const fileObj = new File([blob], file.name, { type: file.type });
    formData.append('file', fileObj);
  } else {
    // Mobile platform - append as-is
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
  }
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Błąd serwera' }));
    throw new Error(errorData.detail || 'Wystąpił błąd');
  }
  
  return response.json();
}
