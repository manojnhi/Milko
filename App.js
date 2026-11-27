import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, KeyboardAvoidingView, Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getDb } from './src/db';
import { getSettings, DEFAULT_SETTINGS } from './src/core/repo.js';
import { fmtMoney, fmtNum } from './src/core/money.js';
import { formatDate } from './src/core/dates.js';
import { AppContext, errorText } from './src/app-context';
import { Banner, Button, colors, Field, Icon, Loading, s, Sheet } from './src/ui';
import Login from './src/screens/Login';
import Dashboard from './src/screens/Dashboard';
import Milkmen from './src/screens/Milkmen';
import Rates from './src/screens/Rates';
import Purchase from './src/screens/Purchase';
import Payments from './src/screens/Payments';
import Report from './src/screens/Report';
import Import from './src/screens/Import';
import Settings from './src/screens/Settings';
import Menu from './src/screens/Menu';

const SCREENS = {
  dashboard: [Dashboard, 'grid-outline', 'Dashboard', 'डैशबोर्ड'],
  purchase: [Purchase, 'water-outline', 'Collection', 'दूध संग्रह'],
  milkmen: [Milkmen, 'people-outline', 'Milkmen', 'दूधवाले'],
  payments: [Payments, 'wallet-outline', 'Payments', 'भुगतान'],
  report: [Report, 'bar-chart-outline', 'Reports', 'रिपोर्ट'],
  rates: [Rates, 'pricetags-outline', 'Rates', 'रेट'],
  import: [Import, 'cloud-upload-outline', 'Import', 'इम्पोर्ट'],
  settings: [Settings, 'settings-outline', 'Settings', 'सेटिंग'],
  menu: [Menu, 'menu-outline', 'More', 'और'],
};
const TABS = ['dashboard', 'purchase', 'milkmen', 'payments', 'menu'];

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ padding: 20 }}>
        <Banner kind="error" text={`Screen error: ${this.state.error.message}`} />
        <Button title="Retry / दोबारा" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

function Root() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [db, setDb] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [user, setUser] = useState(null);
  const [route, setRoute] = useState({ name: 'dashboard', params: {} });
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const timer = useRef(null);
  const away = useRef(null);

  const L = useCallback((en, hi) => (settings.language === 'hi' ? hi || en : en), [settings.language]);

  const open = useCallback(async () => {
    setFatal(null);
    try {
      const d = await getDb();
      setSettings(await getSettings(d));
      setDb(d);
    } catch (e) { setFatal(e); }
  }, []);
  useEffect(() => { open(); }, [open]);

  const logout = useCallback(() => { setUser(null); setDialog((d) => { d?.resolve(false); return null; }); setRoute({ name: 'dashboard', params: {} }); }, []);
  const go = useCallback((name, params = {}) => setRoute({ name, params }), []);

  // Auto-lock: itni der background me rehne ke baad dobara password.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const limit = Number(settings.lockMinutes) * 60000;
        if (limit > 0 && away.current && Date.now() - away.current > limit) logout();
        away.current = null;
      } else if (!away.current) away.current = Date.now();
    });
    return () => sub.remove();
  }, [settings.lockMinutes, logout]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!user || route.name === 'dashboard') return false;
      go('dashboard');
      return true;
    });
    return () => sub.remove();
  }, [user, route.name, go]);

  const notify = useCallback((text, kind = 'ok') => {
    clearTimeout(timer.current);
    setToast({ text, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000);
  }, []);

  /** Alert.alert web par kaam nahi karta, isliye apna dialog. Cancel = false, OK = { reason } */
  const confirm = useCallback((opts) => new Promise((resolve) => { setReason(''); setDialog({ ...opts, resolve }); }), []);
  const close = (value) => { dialog.resolve(value); setDialog(null); };

  const app = {
    db, user, setUser, settings, L, wide, go, route, logout, notify, confirm, revision,
    changed: () => setRevision((r) => r + 1),
    reloadSettings: async () => { setSettings(await getSettings(db)); setRevision((r) => r + 1); },
    fail: (e) => notify(errorText(e, L), 'error'),
    money: (v) => fmtMoney(v, settings.currency),
    num: fmtNum,
    date: (v) => formatDate(v, settings.dateFormat),
  };

  let body;
  if (fatal) {
    body = (
      <View style={{ padding: 20, marginTop: 40 }}>
        <Banner kind="error" text={`Database could not be opened. Your data has not been deleted.\nडेटाबेस नहीं खुला; डेटा डिलीट नहीं हुआ है।\n\n${fatal.message}`} />
        <Button title="Retry / दोबारा" onPress={open} />
      </View>
    );
  } else if (!db) body = <Loading />;
  else if (!user || user.must_change) body = <Login />;
  else {
    const [Current, , en, hi] = SCREENS[route.name];
    const nav = (name) => {
      const [, icon, e, h] = SCREENS[name];
      const active = route.name === name || (!wide && name === 'menu' && !TABS.includes(route.name));
      const color = wide ? '#fff' : active ? colors.primary : colors.muted;
      return (
        <TouchableOpacity key={name} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={L(e, h)} onPress={() => go(name)}
          style={wide
            ? { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 46, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? colors.primary : 'transparent' }
            : { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54 }}>
          <Icon name={icon} size={wide ? 19 : 22} color={color} />
          <Text numberOfLines={1} style={{ color, fontSize: wide ? 15 : 11, fontWeight: active ? '800' : '500' }}>{L(e, h)}</Text>
        </TouchableOpacity>
      );
    };
    body = (
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide && (
          <View style={{ width: 220, backgroundColor: colors.side, padding: 12, gap: 4 }}>
            <Text numberOfLines={2} style={{ color: '#fff', fontSize: 19, fontWeight: '800', padding: 8, marginBottom: 8 }}>🥛 {settings.businessName}</Text>
            {Object.keys(SCREENS).filter((k) => k !== 'menu').map(nav)}
          </View>
        )}
        <View style={{ flex: 1, minHeight: 0 }}>
          <View style={[s.row, { backgroundColor: '#fff', paddingHorizontal: 14, minHeight: 56, borderBottomWidth: 1, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{L(en, hi)}</Text>
              {!wide && <Text numberOfLines={1} style={s.muted}>{settings.businessName}</Text>}
            </View>
            <Button small kind="ghost" icon="lock-closed-outline" title={L('Lock', 'लॉक')} onPress={logout} />
          </View>
          <ErrorBoundary key={route.name}>
            <Current />
          </ErrorBoundary>
        </View>
        {!wide && <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: colors.border }}>{TABS.map(nav)}</View>}
      </View>
    );
  }

  return (
    <AppContext.Provider value={app}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          {body}
        </KeyboardAvoidingView>
        {toast && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 72, alignItems: 'center' }}>
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: toast.kind === 'error' ? colors.danger : colors.ok, borderRadius: 10, padding: 12, maxWidth: 520 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{toast.text}</Text>
            </View>
          </View>
        )}
        <Sheet visible={!!dialog} title={dialog?.title || ''} onClose={() => close(false)}>
          {dialog?.message ? <Text style={{ marginBottom: 12, color: colors.text }}>{dialog.message}</Text> : null}
          {dialog?.needReason && <Field label={L('Reason (required)', 'कारण (ज़रूरी)')} value={reason} onChangeText={setReason} />}
          <Button title={dialog?.ok || L('Yes', 'हाँ')} kind={dialog?.danger ? 'danger' : 'primary'}
            disabled={dialog?.needReason && !reason.trim()} onPress={() => close({ reason: reason.trim() })} />
          <Button title={L('Cancel', 'रद्द करें')} kind="ghost" onPress={() => close(false)} />
        </Sheet>
      </SafeAreaView>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
