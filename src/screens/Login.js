import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { getDb } from '../db';
import { Button, Field, colors, s } from '../ui';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    const db = await getDb();
    const row = await db.getFirstAsync(
      'SELECT * FROM tbl_User WHERE username = ? AND password = ?',
      [username.trim(), password]
    );
    if (row) onLogin(row);
    else Alert.alert('Login failed', 'Username ya password galat hai');
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 34, fontWeight: '800', color: colors.primary, textAlign: 'center' }}>🥛 Milko</Text>
      <Text style={[s.muted, { textAlign: 'center', marginBottom: 24 }]}>Dairy milk collection</Text>
      <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title="Login" onPress={submit} />
      <Text style={[s.muted, { textAlign: 'center', marginTop: 12 }]}>Default: admin / admin</Text>
    </View>
  );
}
