import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useApp } from '../app-context';
import { Card, Icon, Screen, s, colors, Button } from '../ui';

const ITEMS = [
  ['report', 'bar-chart-outline', 'Reports, print & PDF', 'रिपोर्ट, प्रिंट और PDF'],
  ['rates', 'pricetags-outline', 'Rates & milk types', 'रेट और दूध के प्रकार'],
  ['import', 'cloud-upload-outline', 'Import CSV / Excel', 'CSV / Excel इम्पोर्ट'],
  ['settings', 'settings-outline', 'Settings, security & backup', 'सेटिंग, सुरक्षा और बैकअप'],
];

export default function Menu() {
  const { L, go, logout } = useApp();
  return (
    <Screen>
      {ITEMS.map(([name, icon, en, hi]) => (
        <TouchableOpacity key={name} accessibilityRole="button" onPress={() => go(name)}>
          <Card style={s.row}>
            <Icon name={icon} size={22} color={colors.primary} />
            <Text style={[s.bold, { flex: 1 }]}>{L(en, hi)}</Text>
            <Icon name="chevron-forward" />
          </Card>
        </TouchableOpacity>
      ))}
      <Button kind="ghost" icon="log-out-outline" title={L('Logout', 'लॉगआउट')} onPress={logout} />
    </Screen>
  );
}
