import React, { useState } from 'react';
import { Text, View } from 'react-native';
import * as repo from '../core/repo.js';
import { today } from '../core/dates.js';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, Chips, DateField, Empty, Field, Loading, More, Screen, s } from '../ui';

export default function Rates() {
  const { db, user, L, money, date, settings, notify, confirm, changed, fail } = useApp();
  const [form, setForm] = useState({ applicable_date: today(), milk_type: 'Cow', method: 'fat_snf', fat_rate: '', snf_rate: '', fixed_rate: '' });
  const [error, setError] = useState(null);
  const [newType, setNewType] = useState('');
  const [limit, setLimit] = useState(30);
  const { data, loading, error: loadError } = useLoad(async () => ({ rates: await repo.listRates(db), types: await repo.listMilkTypes(db) }), []);
  const set = (k) => (v) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };
  const err = (field) => (error?.field === field ? errorText(error, L) : undefined);

  const methods = [['fat_snf', 'Fat + SNF'], ['fat', L('Fat only', 'सिर्फ़ फैट')], ['fixed', L('Fixed per unit', 'फिक्स रेट')]];
  const formula = {
    fat_snf: L('Rate = Fat% × Fat rate + SNF% × SNF rate', 'रेट = Fat% × फैट रेट + SNF% × SNF रेट'),
    fat: L('Rate = Fat% × Fat rate', 'रेट = Fat% × फैट रेट'),
    fixed: L('Rate = fixed amount per unit', 'रेट = प्रति यूनिट तय राशि'),
  };

  const save = async () => {
    try {
      await repo.addRate(db, form, user.username);
      setForm((f) => ({ ...f, fat_rate: '', snf_rate: '', fixed_rate: '' }));
      notify(L('Rate saved', 'रेट सेव हुआ'));
      changed();
    } catch (e) { setError(e); fail(e); }
  };
  const remove = async (r) => {
    const ok = await confirm({ title: L('Remove this rate?', 'यह रेट हटाएँ?'), message: `${date(r.applicable_date)} · ${r.milk_type}\n${L('Saved entries keep their rate. New entries will use an older rate.', 'पुरानी एंट्री का रेट नहीं बदलेगा। नई एंट्री पर पिछला रेट लगेगा।')}`, danger: true });
    if (!ok) return;
    try { await repo.deleteRate(db, r.rate_id, user.username); changed(); } catch (e) { fail(e); }
  };
  const addType = async () => {
    try { await repo.addMilkType(db, newType); setNewType(''); changed(); } catch (e) { fail(e); }
  };
  const toggleType = async (t) => {
    try { await repo.setMilkTypeActive(db, t.name, !t.active); changed(); } catch (e) { fail(e); }
  };

  if (loading) return <Loading />;
  if (loadError) return <Screen><Banner kind="error" text={errorText(loadError, L)} /></Screen>;

  return (
    <Screen>
      <Card>
        <Text style={s.h2}>{L('New rate', 'नया रेट')}</Text>
        <DateField label={L('Applicable from', 'कब से लागू')} value={form.applicable_date} onChange={set('applicable_date')} error={err('applicable_date')} />
        <Chips label={L('Milk type', 'दूध का प्रकार')} options={data.types.filter((t) => t.active).map((t) => t.name)} value={form.milk_type} onChange={set('milk_type')} />
        <Chips label={L('Formula', 'फॉर्मूला')} options={methods} value={form.method} onChange={set('method')} />
        <Text style={[s.muted, { marginBottom: 10 }]}>{formula[form.method]}</Text>
        {form.method !== 'fixed' && <Field label={L('Fat rate (per 1% fat)', 'फैट रेट (प्रति 1%)')} value={form.fat_rate} onChangeText={set('fat_rate')} keyboardType="decimal-pad" error={err('fat_rate')} />}
        {form.method === 'fat_snf' && <Field label={L('SNF rate (per 1% SNF)', 'SNF रेट (प्रति 1%)')} value={form.snf_rate} onChangeText={set('snf_rate')} keyboardType="decimal-pad" error={err('snf_rate')} />}
        {form.method === 'fixed' && <Field label={`${L('Rate', 'रेट')} (${settings.currency}/${settings.unit})`} value={form.fixed_rate} onChangeText={set('fixed_rate')} keyboardType="decimal-pad" error={err('fixed_rate')} />}
        <Button title={L('Save rate', 'रेट सेव करें')} onPress={save} />
      </Card>

      <Card>
        <Text style={s.h2}>{L('Rate history', 'रेट इतिहास')}</Text>
        {!data.rates.length && <Empty icon="pricetags-outline" text={L('No rates yet. Add one before recording milk.', 'कोई रेट नहीं। एंट्री से पहले रेट जोड़ें।')} />}
        {data.rates.slice(0, limit).map((r) => (
          <View key={r.rate_id} style={[s.row, s.option]}>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{date(r.applicable_date)} · {r.milk_type}</Text>
              <Text style={s.muted}>{r.method === 'fixed' ? `${money(r.fixed_rate)} / ${settings.unit}` : r.method === 'fat' ? `Fat × ${r.fat_rate}` : `Fat × ${r.fat_rate} + SNF × ${r.snf_rate}`}</Text>
            </View>
            <Button small kind="danger" icon="trash-outline" title={L('Remove', 'हटाएँ')} onPress={() => remove(r)} />
          </View>
        ))}
        <More total={data.rates.length} shown={Math.min(limit, data.rates.length)} onPress={() => setLimit(limit + 50)} />
      </Card>

      <Card>
        <Text style={s.h2}>{L('Milk types', 'दूध के प्रकार')}</Text>
        {data.types.map((t) => (
          <View key={t.name} style={[s.row, s.option]}>
            <Text style={s.bold}>{t.name}{t.active ? '' : ` (${L('hidden', 'छुपा')})`}</Text>
            <Button small kind="ghost" title={t.active ? L('Hide', 'छुपाएँ') : L('Show', 'दिखाएँ')} onPress={() => toggleType(t)} />
          </View>
        ))}
        <Field label={L('New milk type', 'नया प्रकार')} value={newType} onChangeText={setNewType} style={{ marginTop: 12 }} />
        <Button kind="ghost" title={L('Add type', 'प्रकार जोड़ें')} onPress={addType} />
      </Card>
    </Screen>
  );
}
