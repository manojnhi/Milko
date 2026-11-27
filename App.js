import React, { useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { colors } from './src/ui';
import Login from './src/screens/Login';
import Dashboard from './src/screens/Dashboard';
import Milkmen from './src/screens/Milkmen';
import Rates from './src/screens/Rates';
import Purchase from './src/screens/Purchase';
import Report from './src/screens/Report';

const TITLES = {
  dashboard: 'Dashboard',
  purchase: 'Milk Purchase',
  milkmen: 'Milkmen',
  rates: 'Rates',
  report: 'Account Report',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('dashboard');

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ExpoStatusBar style="dark" />
        <Login onLogin={setUser} />
      </SafeAreaView>
    );
  }

  const nav = { go: setScreen, user, logout: () => { setUser(null); setScreen('dashboard'); } };
  const Screen = { dashboard: Dashboard, purchase: Purchase, milkmen: Milkmen, rates: Rates, report: Report }[screen];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <ExpoStatusBar style="light" backgroundColor={colors.primary} />
      <View style={{ backgroundColor: colors.primary, padding: 14, flexDirection: 'row', alignItems: 'center' }}>
        {screen !== 'dashboard' && (
          <TouchableOpacity onPress={() => setScreen('dashboard')} style={{ marginRight: 12 }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>←</Text>
          </TouchableOpacity>
        )}
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>{TITLES[screen]}</Text>
        <TouchableOpacity onPress={nav.logout}>
          <Text style={{ color: '#fff' }}>Logout</Text>
        </TouchableOpacity>
      </View>
      <Screen nav={nav} />
    </SafeAreaView>
  );
}
