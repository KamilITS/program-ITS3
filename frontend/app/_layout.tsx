import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0a0a0a' },
            animation: 'slide_from_right',
          }}
        />
      </NotificationProvider>
    </AuthProvider>
  );
}
