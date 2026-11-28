import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Image, KeyboardAvoidingView, Platform, TouchableOpacity, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { titleCase } from './src/core/text.js';
import { factorOf, toMagha } from './src/core/units.js';
import { getDb } from './src/db';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from './src/core/repo.js';
import { translate } from './src/core/i18n.js';
import { resolveTheme } from './src/core/themes.js';
import { fmtMoney, fmtNum } from './src/core/money.js';
import { formatDate } from './src/core/dates.js';
import { AppContext, errorText } from './src/app-context';
import { NAV_ICONS } from './src/navIcons';
import { applyTheme, Banner, Button, colors, Field, Loading, s, Sheet, FONTS, Text } from './src/ui';
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

  // Hindi code me inline (L('English', 'हिन्दी')); baaki Indian languages translations.js se. Na mile to English.
  const L = useCallback((en, hi) => {
    const lang = settings.language;
    if (lang === 'hi') return hi || en;
    if (lang !== 'en') { const t = translate(lang, en); if (t) return t; }
    return titleCase(en);
  }, [settings.language]);

  // Theme: palette render se pehle lagta hai, taaki is render ke saare child naye rang dekhein.
  const systemDark = useColorScheme() === 'dark';
  const palette = resolveTheme(settings.theme, systemDark);
  applyTheme(palette.c);
  // Font load fail ho to bhi app system font se chalta hai.
  const [fontsLoaded, fontError] = useFonts(FONTS);

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

  const factor = factorOf(settings.maghaFactor);
  const qtyDisplay = settings.unit === 'L' ? settings.qtyDisplay : 'L';
  const litreName = settings.unit === 'L' ? L('Litre', 'लीटर') : 'Kg';
  const qtyText = (litre, magha) => {
    const l = `${fmtNum(litre)} ${litreName}`;
    const m = `${fmtNum(magha)} ${L('Magha', 'मघा')}`;
    return qtyDisplay === 'Magha' ? m : qtyDisplay === 'both' ? `${l} / ${m}` : l;
  };

  const app = {
    qtyText, qtyDisplay, factor, litreName,
    qtyOf: (row) => qtyText(row.qty, row.magha_qty ?? toMagha(row.qty, factor)),
    db, user, setUser, settings, L, wide, go, route, logout, notify, confirm, revision,
    changed: () => setRevision((r) => r + 1),
    reloadSettings: async () => { setSettings(await getSettings(db)); setRevision((r) => r + 1); },
    // Language/theme turant lagu + database me save (Save button ka intezaar nahi).
    setPref: async (patch) => { try { await saveSettings(db, patch); setSettings(await getSettings(db)); } catch (e) { notify(errorText(e, L), 'error'); } },
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
  } else if (!db || (!fontsLoaded && !fontError)) body = <Loading />;
  else if (!user || user.must_change) {
    body = (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Login />
      </View>
    );
  }
  else {
    const [Current, , en, hi] = SCREENS[route.name];
    const nav = (name) => {
      const [, , e, h] = SCREENS[name];
      const active = route.name === name || (!wide && name === 'menu' && !TABS.includes(route.name));
      const color = active ? colors.buttonText : wide ? colors.text : colors.muted;
      return (
        <TouchableOpacity key={name} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={L(e, h)} onPress={() => go(name)}
          style={wide
            ? { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 46, paddingHorizontal: 14, borderRadius: 10, backgroundColor: active ? colors.button : 'transparent' }
            : { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58, backgroundColor: active ? colors.primarySoft : colors.bar }}>
          <Image source={NAV_ICONS[name]} style={{ width: wide ? 32 : 28, height: wide ? 32 : 28 }} />
          <Text numberOfLines={1} style={{ color, fontSize: wide ? 15 : 11, fontWeight: active ? '700' : '400' }}>{L(e, h)}</Text>
        </TouchableOpacity>
      );
    };
    body = (
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide && (
          <View style={{ width: 220, backgroundColor: colors.side, padding: 12, gap: 4, borderRightWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 4, marginBottom: 12 }}>
              <Image source={require('./assets/logo.png')} accessibilityLabel="Milko" style={{ width: 44, height: 44 }} />
              <Text numberOfLines={2} style={{ color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{settings.businessName}</Text>
            </View>
            {Object.keys(SCREENS).filter((k) => k !== 'menu').map(nav)}
          </View>
        )}
        <View style={{ flex: 1, minHeight: 0 }}>
          <View style={[s.row, { backgroundColor: colors.bar, paddingHorizontal: 14, minHeight: 56, borderBottomWidth: 1, borderColor: colors.border }]}>
            {!wide && <Image source={require('./assets/logo.png')} accessibilityLabel="Milko" style={{ width: 36, height: 36 }} />}
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{L(en, hi)}</Text>
              {!wide && <Text numberOfLines={1} style={s.muted}>{settings.businessName}</Text>}
            </View>
            <Button small kind="ghost" icon="lock-closed-outline" title={L('Lock', 'लॉक')} onPress={logout} />
          </View>
          <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg }}>
            <ErrorBoundary key={route.name}>
              <Current />
            </ErrorBoundary>
          </View>
        </View>
        {!wide && <View style={{ flexDirection: 'row', backgroundColor: colors.bar, borderTopWidth: 1, borderColor: colors.border }}>{TABS.map(nav)}</View>}
      </View>
    );
  }

  return (
    <AppContext.Provider value={app}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={palette.c.dark ? 'light' : 'dark'} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          {body}
        </KeyboardAvoidingView>
        {toast && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 72, alignItems: 'center' }}>
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: toast.kind === 'error' ? colors.danger : colors.ok, borderRadius: 10, padding: 12, maxWidth: 520 }}>
              <Text style={{ color: colors.onStrong, fontWeight: '700' }}>{toast.text}</Text>
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
