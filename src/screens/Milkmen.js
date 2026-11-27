import React, { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import * as repo from '../core/repo.js';
import { today } from '../core/dates.js';
import { hasCamera, pickPhoto } from '../platform/photo';
import { errorText, useApp, useLoad } from '../app-context';
import { Avatar, Banner, Button, Card, Chips, Cols, DateField, Empty, Field, Loading, More, Screen, s } from '../ui';

export default function Milkmen() {
  const { db, user, L, money, num, date, settings, notify, confirm, changed, fail, go } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [limit, setLimit] = useState(50);
  const [view, setView] = useState({ mode: 'list' });
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error: loadError } = useLoad(async () => {
    const list = await repo.listMilkmen(db, { search, status });
    return { list, types: await repo.listMilkTypes(db) };
  }, [search, status]);
  // Photos search ke har akshar par dobara load na hon.
  const photos = useLoad(async () => new Map((await db.getAllAsync('SELECT milkman_code, data FROM Photo'))
    .map((p) => [p.milkman_code, p.data])), []);

  const detail = useLoad(async () => {
    if (view.mode !== 'detail') return null;
    const m = await repo.getMilkman(db, view.code);
    const [balance] = await repo.balances(db, { milkman: view.code, to: today() });
    return { m, balance, photo: await repo.getPhoto(db, view.code), recent: await repo.listPurchases(db, { milkman: view.code }, 10) };
  }, [view.mode, view.code]);

  const set = (k) => (v) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };

  const add = async () => {
    try {
      setForm({ milkman_code: String(await repo.nextCode(db)), milkman_name: '', milk_type: data.types.find((t) => t.active)?.name || 'Cow',
        phone: '', address: '', joining_date: today(), custom_rate: '', notes: '', photo: undefined, preview: '' });
      setError(null);
      setView({ mode: 'form', isNew: true });
    } catch (e) { fail(e); }
  };
  const edit = (m, photo) => {
    setForm({ ...m, milkman_code: String(m.milkman_code), phone: m.phone || '', address: m.address || '', joining_date: m.joining_date || '',
      custom_rate: m.custom_rate ? String(m.custom_rate) : '', notes: m.notes || '', photo: undefined, preview: photo });
    setError(null);
    setView({ mode: 'form', isNew: false, code: m.milkman_code });
  };

  const takePhoto = async (source) => {
    try {
      const uri = await pickPhoto(source);
      if (uri) setForm((f) => ({ ...f, photo: uri, preview: uri }));
    } catch (e) {
      if (e.code !== 'PERMISSION') return fail(e);
      const ok = await confirm({ title: L('Camera permission needed', 'कैमरा अनुमति चाहिए'), message: L('Allow camera access in phone settings, or choose from gallery.', 'फ़ोन सेटिंग में कैमरा अनुमति दें या गैलरी से चुनें।'), ok: L('Open settings', 'सेटिंग खोलें') });
      if (ok) Linking.openSettings();
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const m = await repo.saveMilkman(db, form, { isNew: view.isNew, photo: form.photo, user: user.username });
      notify(L('Milkman saved', 'दूधवाला सेव हुआ'));
      changed();
      setView({ mode: 'detail', code: m.milkman_code });
    } catch (e) { setError(e); fail(e); } finally { setBusy(false); }
  };

  const toggle = async (m) => {
    const ok = await confirm({ title: m.active ? L('Deactivate milkman?', 'निष्क्रिय करें?') : L('Reactivate milkman?', 'फिर सक्रिय करें?'),
      message: `${m.milkman_code} · ${m.milkman_name}\n${L('Old entries and payments are kept.', 'पुरानी एंट्री और भुगतान सुरक्षित रहेंगे।')}`, danger: !!m.active });
    if (!ok) return;
    try { await repo.setMilkmanActive(db, m.milkman_code, !m.active, user.username); changed(); } catch (e) { fail(e); }
  };

  const err = (field) => (error?.field === field ? errorText(error, L) : undefined);

  if (loadError) return <Screen><Banner kind="error" text={errorText(loadError, L)} /></Screen>;
  if (loading) return <Loading />;

  if (view.mode === 'form') {
    return (
      <Screen>
        <Card>
          <Text style={s.h2}>{view.isNew ? L('Add milkman', 'नया दूधवाला') : L('Edit milkman', 'दूधवाला बदलें')}</Text>
          <View style={[s.wrap, { marginBottom: 12 }]}>
            <Avatar uri={form.preview} name={form.milkman_name} size={88} />
            {hasCamera && <Button small kind="ghost" icon="camera-outline" title={L('Camera', 'कैमरा')} onPress={() => takePhoto('camera')} />}
            <Button small kind="ghost" icon="image-outline" title={L('Gallery / file', 'गैलरी / फ़ाइल')} onPress={() => takePhoto('gallery')} />
            {form.preview ? <Button small kind="danger" icon="trash-outline" title={L('Remove photo', 'फोटो हटाएँ')} onPress={() => setForm((f) => ({ ...f, photo: '', preview: '' }))} /> : null}
          </View>
          <Cols>
            <Field label={L('Unique code *', 'यूनिक कोड *')} value={form.milkman_code} onChangeText={set('milkman_code')} keyboardType="number-pad" editable={view.isNew} error={err('milkman_code')} />
            <Field label={L('Name *', 'नाम *')} value={form.milkman_name} onChangeText={set('milkman_name')} error={err('milkman_name')} />
          </Cols>
          <Chips label={L('Milk type', 'दूध का प्रकार')} options={data.types.filter((t) => t.active || t.name === form.milk_type).map((t) => t.name)} value={form.milk_type} onChange={set('milk_type')} />
          <Cols>
            <Field label={L('Phone', 'फ़ोन')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={err('phone')} />
            <DateField optional label={L('Joining date', 'जुड़ने की तारीख')} value={form.joining_date} onChange={set('joining_date')} error={err('joining_date')} />
          </Cols>
          <Field label={L('Address', 'पता')} value={form.address} onChangeText={set('address')} multiline />
          <Field label={`${L('Fixed rate', 'फिक्स रेट')} (${settings.currency}/${settings.unit})`} value={form.custom_rate} onChangeText={set('custom_rate')} keyboardType="decimal-pad" error={err('custom_rate')}
            hint={L('Leave empty to use the rate formula from Rates', 'खाली रखें तो Rates का फॉर्मूला लगेगा')} />
          <Field label={L('Notes', 'नोट')} value={form.notes} onChangeText={set('notes')} multiline />
          <Button busy={busy} icon="checkmark" title={L('Save', 'सेव करें')} onPress={save} />
          <Button kind="ghost" title={L('Cancel', 'रद्द करें')} onPress={() => setView(view.isNew ? { mode: 'list' } : { mode: 'detail', code: view.code })} />
        </Card>
      </Screen>
    );
  }

  if (view.mode === 'detail') {
    const d = detail.data;
    if (detail.error) return <Screen><Banner kind="error" text={errorText(detail.error, L)} /></Screen>;
    if (!d?.m || d.m.milkman_code !== view.code) return <Loading />;
    const line = (label, value) => (value ? <Text style={s.muted}>{label}: <Text style={s.bold}>{value}</Text></Text> : null);
    return (
      <Screen>
        <Button small kind="ghost" icon="arrow-back" title={L('All milkmen', 'सभी दूधवाले')} style={{ alignSelf: 'flex-start' }} onPress={() => setView({ mode: 'list' })} />
        <Card>
          <View style={[s.row, { marginBottom: 10 }]}>
            <Avatar uri={d.photo} name={d.m.milkman_name} size={72} />
            <View style={{ flex: 1 }}>
              <Text style={s.h1}>{d.m.milkman_name}</Text>
              <Text style={s.muted}>{L('Code', 'कोड')} {d.m.milkman_code} · {d.m.milk_type} · {d.m.active ? L('Active', 'सक्रिय') : L('Inactive', 'निष्क्रिय')}</Text>
            </View>
          </View>
          {line(L('Phone', 'फ़ोन'), d.m.phone)}
          {line(L('Address', 'पता'), d.m.address)}
          {line(L('Joined', 'जुड़े'), date(d.m.joining_date))}
          {line(L('Fixed rate', 'फिक्स रेट'), d.m.custom_rate ? money(d.m.custom_rate) : '')}
          {line(L('Notes', 'नोट'), d.m.notes)}
          {line(L('Balance due', 'बकाया'), money(d.balance?.closing || 0))}
          <View style={[s.wrap, { marginTop: 10 }]}>
            <Button small icon="create-outline" title={L('Edit', 'बदलें')} onPress={() => edit(d.m, d.photo)} />
            <Button small kind="ghost" icon="wallet-outline" title={L('Payment', 'भुगतान')} onPress={() => go('payments', { add: true, milkman: d.m.milkman_code })} />
            <Button small kind="ghost" icon="bar-chart-outline" title={L('Report', 'रिपोर्ट')} onPress={() => go('report', { milkman: d.m.milkman_code })} />
            <Button small kind={d.m.active ? 'danger' : 'ghost'} title={d.m.active ? L('Deactivate', 'निष्क्रिय करें') : L('Reactivate', 'सक्रिय करें')} onPress={() => toggle(d.m)} />
          </View>
        </Card>
        <Card>
          <Text style={s.h2}>{L('Recent entries', 'हाल की एंट्री')}</Text>
          {!d.recent.length && <Empty text={L('No entries yet', 'अभी कोई एंट्री नहीं')} />}
          {d.recent.map((r) => (
            <View key={r.id} style={[s.row, s.option]}>
              <Text style={s.muted}>{date(r.date)} · {r.shift === 'Morning' ? L('Morning', 'सुबह') : L('Evening', 'शाम')} · {num(r.qty)} {settings.unit}</Text>
              <Text style={s.bold}>{money(r.amount)}</Text>
            </View>
          ))}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Button icon="person-add-outline" title={L('Add milkman', 'दूधवाला जोड़ें')} onPress={add} />
      <Field label={L('Search name, code or phone', 'नाम, कोड या फ़ोन खोजें')} value={search} onChangeText={setSearch} />
      <Chips options={[['active', L('Active', 'सक्रिय')], ['inactive', L('Inactive', 'निष्क्रिय')], ['all', L('All', 'सभी')]]} value={status} onChange={setStatus} />
      {!data.list.length && <Empty icon="people-outline" text={search ? L('No match found', 'कोई नहीं मिला') : L('No milkmen here yet', 'यहाँ कोई दूधवाला नहीं')} />}
      {data.list.slice(0, limit).map((m) => (
        <TouchableOpacity key={m.milkman_code} accessibilityRole="button" onPress={() => setView({ mode: 'detail', code: m.milkman_code })}>
          <Card style={s.row}>
            <Avatar uri={photos.data?.get(m.milkman_code)} name={m.milkman_name} />
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{m.milkman_code} · {m.milkman_name}</Text>
              <Text style={s.muted}>{m.milk_type}{m.phone ? ` · ${m.phone}` : ''}{m.active ? '' : ` · ${L('Inactive', 'निष्क्रिय')}`}</Text>
            </View>
          </Card>
        </TouchableOpacity>
      ))}
      <More total={data.list.length} shown={Math.min(limit, data.list.length)} onPress={() => setLimit(limit + 100)} />
    </Screen>
  );
}
