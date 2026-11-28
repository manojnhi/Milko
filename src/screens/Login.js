import React, { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { changeCredentials, countUsers, createFirstUser, login } from '../core/repo.js';
import { randomBytes } from '../platform/random';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, colors, Field, LanguagePicker, Loading, Screen, s, Text } from '../ui';

export default function Login() {
  const { db, user, setUser, logout, L, settings } = useApp();
  const users = useLoad(() => countUsers(db), []);
  const [form, setForm] = useState({ username: '', current: '', password: '', repeat: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const failures = useRef(0);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  if (users.error) return <Banner kind="error" text={errorText(users.error, L)} />;
  if (users.loading) return <Loading />;

  const mode = user?.must_change ? 'change' : users.data === 0 ? 'create' : 'login';

  const submit = async () => {
    setError('');
    if (mode !== 'login' && form.password !== form.repeat) return setError(L('Passwords do not match', 'पासवर्ड मेल नहीं खाते'));
    setBusy(true);
    // Hashing se pehle spinner dikhne do; galat koshishon par badhta wait.
    await new Promise((r) => setTimeout(r, 50 + Math.min(failures.current, 10) * 1000));
    try {
      if (mode === 'create') setUser(await createFirstUser(db, form.username, form.password, randomBytes));
      else if (mode === 'change') setUser(await changeCredentials(db, user.id, form.current, form.username || user.username, form.password, randomBytes));
      else {
        const found = await login(db, form.username, form.password);
        if (!found) { failures.current += 1; setError(L('Wrong username or password', 'Username या पासवर्ड गलत है')); }
        else {
          // must_change user ke liye yahi component mounted rehta hai, isliye busy yahin reset karna zaroori.
          setForm({ username: '', current: '', password: '', repeat: '' });
          setBusy(false);
          setUser(found);
          return;
        }
      }
    } catch (e) { setError(errorText(e, L)); }
    setBusy(false);
  };

  return (
    <Screen>
      <Card style={{ width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: 32 }}>
        <View style={{ marginBottom: 8 }}><LanguagePicker /></View>
        <Image source={require('../../assets/logo.png')} accessibilityLabel="Milko" style={{ width: 112, height: 112, alignSelf: 'center' }} />
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.primary, textAlign: 'center' }}>Milko</Text>
        <Text style={[s.muted, { textAlign: 'center', marginBottom: 20 }]}>{settings.businessName}</Text>
        {mode === 'create' && <Banner text={L('Create the owner login. There is no password recovery, so keep it safe.', 'मालिक का लॉगिन बनाएँ। पासवर्ड रिकवरी नहीं है, इसे सुरक्षित रखें।')} />}
        {mode === 'change' && <Banner text={L('The default password is not safe. Set a new one to continue.', 'डिफ़ॉल्ट पासवर्ड सुरक्षित नहीं। आगे बढ़ने के लिए नया पासवर्ड रखें।')} />}
        {mode === 'change' && <Field label={L('Current password', 'मौजूदा पासवर्ड')} value={form.current} onChangeText={set('current')} secureTextEntry />}
        <Field label={L('Username', 'यूज़रनेम')} value={form.username} onChangeText={set('username')} autoCapitalize="none" autoCorrect={false}
          placeholder={mode === 'change' ? user.username : ''} />
        <Field label={mode === 'login' ? L('Password', 'पासवर्ड') : L('New password (min 6)', 'नया पासवर्ड (कम से कम 6)')} value={form.password} onChangeText={set('password')} secureTextEntry
          onSubmitEditing={mode === 'login' ? submit : undefined} />
        {mode !== 'login' && <Field label={L('Repeat password', 'पासवर्ड दोबारा')} value={form.repeat} onChangeText={set('repeat')} secureTextEntry />}
        {error ? <Banner kind="error" text={error} /> : null}
        <Button busy={busy} onPress={submit} title={mode === 'create' ? L('Create account', 'अकाउंट बनाएँ') : mode === 'change' ? L('Change password', 'पासवर्ड बदलें') : L('Login', 'लॉगिन')} />
        {mode === 'change' && <Button kind="ghost" title={L('Back', 'वापस')} onPress={logout} />}
      </Card>
    </Screen>
  );
}
