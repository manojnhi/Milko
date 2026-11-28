import React, { useState } from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import * as repo from '../core/repo.js';
import { isISODate, today } from '../core/dates.js';
import { linkedRate } from '../core/units.js';
import { parseNum } from '../core/money.js';
import { hasCamera, pickPhoto } from '../platform/photo';
import { errorText, useApp, useLoad } from '../app-context';
import { Avatar, Banner, Button, Card, Chips, Cols, DateField, Empty, Field, Loading, More, Screen, s, colors, Text } from '../ui';

export default function Milkmen() {
  const { db, user, L, money, date, settings, notify, confirm, changed, fail, go, qtyOf, litreName } = useApp();
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
    return { m, balance, photo: await repo.getPhoto(db, view.code), recent: await repo.listPurchases(db, { milkman: view.code }, 10), prices: await repo.listPrices(db, view.code) };
  }, [view.mode, view.code]);

  const set = (k) => (v) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };
  const setPrice = (k) => (v) => { setError(null); setForm((f) => ({ ...f, price: { ...f.price, [k]: v } })); };
  const newPrice = () => ({ applicable_date: today(), price: '', std_fat: '6.5', std_snf: '9', fat_share: '52', above_std: 1 });
  const unitName = (u) => (u === 'Magha' ? L('Magha', 'मघा') : litreName);

  const add = async () => {
    try {
      setForm({ milkman_code: String(await repo.nextCode(db)), milkman_name: '', milk_type: data.types.find((t) => t.active)?.name || 'Cow',
        phone: '', address: '', joining_date: today(), custom_rate: '', notes: '', pay_unit: 'L', rate_mode: 'common', price: newPrice(), photo: undefined, preview: '' });
      setError(null);
      setView({ mode: 'form', isNew: true });
    } catch (e) { fail(e); }
  };
  const edit = (m, photo) => {
    const p = detail.data?.prices[0];
    // Nayi lagu-tareekh aaj ki: purani entries aur purana price history waise hi rehte hain.
    const price = p ? { applicable_date: p.applicable_date, price: String(p.price), std_fat: String(p.std_fat), std_snf: String(p.std_snf), fat_share: String(p.fat_share), above_std: p.above_std } : newPrice();
    setForm({ price, original: price, ...m, milkman_code: String(m.milkman_code), phone: m.phone || '', address: m.address || '', joining_date: m.joining_date || '',
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
      let price = form.price;
      const o = form.original;
      // Price badla par tareekh nahi badli: naya price aaj se maana jata hai.
      if (o && o.price && price.applicable_date === o.applicable_date && ['price', 'std_fat', 'std_snf', 'fat_share', 'above_std'].some((k) => String(price[k]) !== String(o[k]))) {
        const ok = await confirm({ title: L('Change price from which date?', 'नया भाव कब से?'), message: L(`The new price will apply from ${date(today())}. To use another date, cancel and change "Price From Date".`, `नया भाव ${date(today())} से लगेगा। दूसरी तारीख के लिए Cancel करके तारीख बदलें।`) });
        if (!ok) return;
        price = { ...price, applicable_date: today() };
      }
      const m = await repo.saveMilkman(db, form, { isNew: view.isNew, photo: form.photo, user: user.username, price });
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

  const removePrice = async (p) => {
    const ok = await confirm({ title: L('Remove this price?', 'यह भाव हटाएँ?'), message: `${date(p.applicable_date)} · ${money(p.price)}\n${L('Saved entries keep their rate.', 'पुरानी एंट्री का रेट नहीं बदलेगा।')}`, danger: true });
    if (!ok) return;
    try { await repo.deletePrice(db, p.id, user.username); changed(); } catch (e) { fail(e); }
  };
  const sample = (fat, snf) => {
    const p = form.price;
    const v = { price: parseNum(p.price), std_fat: parseNum(p.std_fat), std_snf: parseNum(p.std_snf), fat_share: parseNum(p.fat_share), above_std: Number(p.above_std) };
    if (!(v.price > 0 && v.std_fat > 0 && v.std_snf > 0 && v.fat_share >= 0) || !(fat >= 0)) return null;
    return money(linkedRate(v, fat, snf));
  };

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
          {settings.unit === 'L' && (
            <Chips label={L('Payment unit', 'भुगतान किस पर')} options={[['L', L('Litre', 'लीटर')], ['Magha', L('Magha', 'मघा')]]} value={form.pay_unit} onChange={set('pay_unit')} />
          )}
          <Chips label={L('Rate type', 'रेट का तरीका')} value={form.rate_mode} onChange={set('rate_mode')}
            options={[['common', L('Common rate chart', 'सबका एक रेट')], ['own', L('Own price (fat/SNF)', 'अपना भाव (फैट/SNF)')], ['fixed', L('Fixed rate', 'फिक्स रेट')]]} />
          {form.rate_mode === 'common' && <Text style={[s.muted, { marginBottom: 12 }]}>{L('Uses the formula saved in Rates for this milk type.', 'Rates में इस दूध के प्रकार का फॉर्मूला लगेगा।')}</Text>}
          {form.rate_mode === 'fixed' && (
            <Field label={`${L('Fixed rate', 'फिक्स रेट')} (${settings.currency} / ${unitName(form.pay_unit)})`} value={form.custom_rate} onChangeText={set('custom_rate')} keyboardType="decimal-pad" error={err('custom_rate')}
              hint={L('Fat and SNF do not change this rate.', 'फैट/SNF से यह रेट नहीं बदलता।')} />
          )}
          {form.rate_mode === 'own' && (
            <View style={[s.banner, { backgroundColor: colors.primarySoft }]}>
              <Cols>
                <Field label={`${L('Price', 'भाव')} (${settings.currency} / ${unitName(form.pay_unit)})`} value={form.price.price} onChangeText={setPrice('price')} keyboardType="decimal-pad" error={err('price') || err('rate')} />
                <DateField label={L('Price from date', 'भाव कब से')} value={form.price.applicable_date} onChange={setPrice('applicable_date')} error={err('applicable_date')} />
              </Cols>
              <Cols>
                <Field label={L('Standard fat', 'स्टैंडर्ड फैट')} value={form.price.std_fat} onChangeText={setPrice('std_fat')} keyboardType="decimal-pad" error={err('std_fat')} />
                <Field label={L('Standard SNF', 'स्टैंडर्ड SNF')} value={form.price.std_snf} onChangeText={setPrice('std_snf')} keyboardType="decimal-pad" error={err('std_snf')} />
                <Field label={L('Fat share %', 'फैट हिस्सा %')} value={form.price.fat_share} onChangeText={setPrice('fat_share')} keyboardType="decimal-pad" error={err('fat_share')} />
              </Cols>
              <Chips label={L('When fat/SNF is above standard', 'स्टैंडर्ड से ज़्यादा फैट/SNF पर')} value={Number(form.price.above_std)} onChange={setPrice('above_std')}
                options={[[1, L('Rate goes up and down', 'रेट बढ़े और घटे')], [0, L('Only goes down', 'सिर्फ़ घटे')]]} />
              {sample(parseNum(form.price.std_fat), parseNum(form.price.std_snf)) && (
                <Text style={s.bold}>
                  {[-0.5, 0, 0.5].map((d) => { const f = Math.round((parseNum(form.price.std_fat) + d) * 10) / 10; return `Fat ${f} → ${sample(f, parseNum(form.price.std_snf))}`; }).join('   ·   ')}
                </Text>
              )}
              <Text style={s.muted}>{L('Example at standard SNF. At standard fat and SNF the rate equals the price.', 'उदाहरण स्टैंडर्ड SNF पर। स्टैंडर्ड फैट/SNF पर रेट = भाव।')}</Text>
            </View>
          )}
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
          {line(L('Payment unit', 'भुगतान यूनिट'), unitName(d.m.pay_unit))}
          {line(L('Rate type', 'रेट का तरीका'), d.m.rate_mode === 'fixed' ? `${L('Fixed', 'फिक्स')} ${money(d.m.custom_rate)}` : d.m.rate_mode === 'own' ? L('Own price (fat/SNF)', 'अपना भाव') : L('Common rate chart', 'सबका एक रेट'))}
          {line(L('Notes', 'नोट'), d.m.notes)}
          {line(L('Balance due', 'बकाया'), money(d.balance?.closing || 0))}
          <View style={[s.wrap, { marginTop: 10 }]}>
            <Button small icon="create-outline" title={L('Edit', 'बदलें')} onPress={() => edit(d.m, d.photo)} />
            <Button small kind="ghost" icon="wallet-outline" title={L('Payment', 'भुगतान')} onPress={() => go('payments', { add: true, milkman: d.m.milkman_code })} />
            <Button small kind="ghost" icon="bar-chart-outline" title={L('Report', 'रिपोर्ट')} onPress={() => go('report', { milkman: d.m.milkman_code })} />
            <Button small kind={d.m.active ? 'danger' : 'ghost'} title={d.m.active ? L('Deactivate', 'निष्क्रिय करें') : L('Reactivate', 'सक्रिय करें')} onPress={() => toggle(d.m)} />
          </View>
        </Card>
        {d.m.rate_mode === 'own' && (
          <Card>
            <Text style={s.h2}>{L('Price history', 'भाव का इतिहास')}</Text>
            {d.prices.map((p) => (
              <View key={p.id} style={[s.row, s.option]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bold}>{money(p.price)} / {unitName(d.m.pay_unit)} · {L('from', 'से')} {isISODate(p.applicable_date) ? date(p.applicable_date) : p.applicable_date}</Text>
                  <Text style={s.muted}>Fat {p.std_fat} · SNF {p.std_snf} · {p.above_std ? L('up and down', 'बढ़े-घटे') : L('only down', 'सिर्फ़ घटे')}</Text>
                </View>
                {d.prices.length > 1 && <Button small kind="danger" title={L('Remove', 'हटाएँ')} onPress={() => removePrice(p)} />}
              </View>
            ))}
          </Card>
        )}
        <Card>
          <Text style={s.h2}>{L('Recent entries', 'हाल की एंट्री')}</Text>
          {!d.recent.length && <Empty text={L('No entries yet', 'अभी कोई एंट्री नहीं')} />}
          {d.recent.map((r) => (
            <View key={r.id} style={[s.row, s.option]}>
              <Text style={s.muted}>{date(r.date)} · {r.shift === 'Morning' ? L('Morning', 'सुबह') : L('Evening', 'शाम')} · {qtyOf(r)}</Text>
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
