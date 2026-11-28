import React from 'react';
import { Image, TouchableOpacity } from 'react-native';
import { NAV_ICONS } from '../navIcons';
import { useApp } from '../app-context';
import { Card, Icon, Screen, s, Button, Text } from '../ui';

const ITEMS = [
  ['report', 'Reports, print & PDF', 'रिपोर्ट, प्रिंट और PDF'],
  ['rates', 'Rates & milk types', 'रेट और दूध के प्रकार'],
  ['import', 'Import CSV / Excel', 'CSV / Excel इम्पोर्ट'],
  ['settings', 'Settings, security & backup', 'सेटिंग, सुरक्षा और बैकअप'],
];

export default function Menu() {
  const { L, go, logout } = useApp();
  return (
    <Screen>
      {ITEMS.map(([name, en, hi]) => (
        <TouchableOpacity key={name} accessibilityRole="button" onPress={() => go(name)}>
          <Card style={s.row}>
            <Image source={NAV_ICONS[name]} style={{ width: 40, height: 40 }} />
            <Text style={[s.bold, { flex: 1 }]}>{L(en, hi)}</Text>
            <Icon name="chevron-forward" />
          </Card>
        </TouchableOpacity>
      ))}
      <Button kind="ghost" icon="log-out-outline" title={L('Logout', 'लॉगआउट')} onPress={logout} />
    </Screen>
  );
}
