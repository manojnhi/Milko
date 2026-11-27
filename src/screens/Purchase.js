import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as repo from '../core/repo.js';
import { addDays, isISODate, today } from '../core/dates.js';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, Chips, Cols, DateField, Empty, Field, Loading, MilkmanPicker, More, Screen, s, colors } from '../ui';

const blank = (date = today(), shift = new Date().getHours() < 14 ? 'Morning' : 'Evening') =>
  ({ date, shift, milkman_code: '', milk_type: '', qty: '', fat: '', snf: '', remark: '' });

export default function Purchase() {
  const { db, user, L, money, num, date, settings, notify, confirm, changed, fail, revision } = useApp();
  const [form, setForm] = useState(() => blank());
  const [code, setCode] = useState('');
  const [editId, setEditId] = useState(0);
  const [preview, setPreview] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState({ from: today(), to: today(), milkman: '', shift: '' });
  const [limit, setLimit] = useState(40);
  const set = (k) => (v) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };

  const base = useLoad(async () => ({ milkmen: await repo.listMilkmen(db), types: await repo.listMilkTypes(db) }), []);
  const list = useLoad(async () => ({
    rows: await repo.listPurchases(db, filter, limit),
    total: await repo.totalPurchases(db, filter),
  }), [filter.from, filter.to, filter.milkman, filter.shift, limit]);

  const milkmen = base.data?.milkmen || [];
  const selected = milkmen.find((m) => m.milkman_code === Number(form.milkman_code));

  const choose = (value) => {
    const m = milkmen.find((x) => x.milkman_code === Number(value));
    setError(null);
    setCode(value ? String(value) : '');
    setForm((f) => ({ ...f, milkman_code: m ? m.milkman_code : '', milk_type: m ? m.milk_type : '' }));
  };

  // Rate aur amount type karte hi.
  useEffect(() => {
    let live = true;
    if (!form.milkman_code || !form.qty || !form.fat || !form.snf) { setPreview({}); return undefined; }
    repo.previewPurchase(db, form, editId)
      .then((p) => live && setPreview({ rate: p.row.rate, amount: p.row.amount, kept: p.keptRate }))
      .catch((e) => live && setPreview({ message: errorText(e, L) }));
    return () => { live = false; };
  }, [form, editId, revision]);

  const reset = () => { setForm(blank(form.date, form.shift)); setCode(''); setEditId(0); setError(null); };

  const save = async () => {
    setBusy(true);
    try {
      let options = { id: editId || undefined, user: user.username };
      if (editId) {
        const ok = await confirm({ title: L('Change this entry?', 'यह एंट्री बदलें?'), message: L('The old values are kept in the audit log.', 'पुराने मान audit log में रहेंगे।'), needReason: true });
        if (!ok) return;
        options.reason = ok.reason;
      }
      try {
        await repo.savePurchase(db, form, options);
      } catch (e) {
        if (e.code !== 'DUPLICATE') throw e;
        const ok = await confirm({ title: L('Duplicate entry?', 'दोहरी एंट्री?'), message: L('An entry for this milkman, date, shift and milk type already exists. Save another one?', 'इस दूधवाले की इसी तारीख और शिफ्ट की एंट्री पहले से है। फिर भी सेव करें?'), ok: L('Save anyway', 'फिर भी सेव करें'), danger: true });
        if (!ok) return;
        await repo.savePurchase(db, form, { ...options, allowDuplicate: true });
      }
      notify(L('Entry saved', 'एंट्री सेव हो गई'));
      reset();
      changed();
    } catch (e) {
      setError(e);
      fail(e);
    } finally { setBusy(false); }
  };

  const edit = (r) => {
    setEditId(r.id);
    setError(null);
    setCode(String(r.milkman_code));
    setForm({ date: r.date, shift: r.shift, milkman_code: r.milkman_code, milk_type: r.milk_type || '', qty: String(r.qty), fat: String(r.fat), snf: String(r.snf), remark: r.remark || '' });
    notify(L('Edit the entry in the form at the top', 'ऊपर के फ़ॉर्म में एंट्री बदलें'));
  };

  const remove = async (r) => {
    const ok = await confirm({ title: L('Delete entry?', 'एंट्री डिलीट करें?'), message: `${r.milkman_name || r.milkman_code} · ${date(r.date)} · ${num(r.qty)} ${settings.unit} · ${money(r.amount)}`, needReason: true, danger: true, ok: L('Delete', 'डिलीट') });
    if (!ok) return;
    try {
      await repo.deletePurchase(db, r.id, ok.reason, user.username);
      if (editId === r.id) reset();
      notify(L('Entry deleted (kept in audit log)', 'एंट्री डिलीट हुई (audit log में है)'));
      changed();
    } catch (e) { fail(e); }
  };

  if (base.loading) return <Loading />;
  if (base.error) return <Screen><Banner kind="error" text={errorText(base.error, L)} /></Screen>;

  const err = (field) => (error?.field === field ? errorText(error, L) : undefined);
  const typeOptions = base.data.types.filter((t) => t.active || t.name === form.milk_type).map((t) => t.name);
  const shiftOptions = [['Morning', L('Morning', 'सुबह')], ['Evening', L('Evening', 'शाम')]];

  return (
    <Screen>
      <Card>
        <Text style={s.h2}>{editId ? L('Edit entry', 'एंट्री बदलें') : L('New collection', 'नया संग्रह')}</Text>
        <Cols>
          <DateField label={L('Date', 'तारीख')} value={form.date} onChange={set('date')} error={err('date')} />
          <Chips label={L('Shift', 'शिफ्ट')} options={shiftOptions} value={form.shift} onChange={set('shift')} />
        </Cols>
        <Cols>
          <Field label={L('Milkman code', 'दूधवाला कोड')} value={code} keyboardType="number-pad" error={code && !selected ? L('Code not found', 'कोड नहीं मिला') : err('milkman_code')}
            onChangeText={(v) => { setCode(v); const m = milkmen.find((x) => String(x.milkman_code) === v.trim() && x.active); setForm((f) => ({ ...f, milkman_code: m ? m.milkman_code : '', milk_type: m ? m.milk_type : '' })); }} />
          <MilkmanPicker label={L('Milkman', 'दूधवाला')} list={milkmen.filter((m) => m.active || m.milkman_code === Number(form.milkman_code))} value={form.milkman_code} onChange={choose} />
        </Cols>
        {selected && <Chips label={L('Milk type', 'दूध का प्रकार')} options={typeOptions} value={form.milk_type} onChange={set('milk_type')} />}
        <Cols>
          <Field label={`${L('Quantity', 'मात्रा')} (${settings.unit})`} value={form.qty} onChangeText={set('qty')} keyboardType="decimal-pad" error={err('qty')} />
          <Field label="Fat %" value={form.fat} onChangeText={set('fat')} keyboardType="decimal-pad" error={err('fat')} />
          <Field label="SNF %" value={form.snf} onChangeText={set('snf')} keyboardType="decimal-pad" error={err('snf')} />
        </Cols>
        <Field label={L('Remark', 'टिप्पणी')} value={form.remark} onChangeText={set('remark')} />
        {preview.message ? <Banner kind="error" text={preview.message} /> : (
          <View style={[s.banner, { backgroundColor: colors.primarySoft }]}>
            <Text style={s.muted}>{L('Rate', 'रेट')}: {preview.rate ? `${money(preview.rate)} / ${settings.unit}` : '—'}{preview.kept ? ` (${L('original rate kept', 'पुराना रेट रखा')})` : ''}</Text>
            <Text style={s.statValue}>{L('Amount', 'राशि')}: {preview.rate ? money(preview.amount) : '—'}</Text>
          </View>
        )}
        <Button icon="checkmark" busy={busy} title={editId ? L('Update entry', 'अपडेट करें') : L('Save entry', 'सेव करें')} onPress={save} />
        {editId ? <Button kind="ghost" title={L('Cancel edit', 'बदलाव रद्द')} onPress={reset} /> : null}
      </Card>

      <Card>
        <Text style={s.h2}>{L('Entries', 'एंट्री')}</Text>
        <View style={s.wrap}>
          <Button small kind="ghost" title={L('Today', 'आज')} onPress={() => setFilter((f) => ({ ...f, from: today(), to: today() }))} />
          <Button small kind="ghost" title={L('Last 7 days', 'पिछले 7 दिन')} onPress={() => setFilter((f) => ({ ...f, from: addDays(today(), -6), to: today() }))} />
          <Button small kind="ghost" title={L('All dates', 'सभी तारीख')} onPress={() => setFilter((f) => ({ ...f, from: '', to: '' }))} />
        </View>
        <Cols>
          <DateField optional label={L('From', 'से')} value={filter.from} onChange={(from) => setFilter((f) => ({ ...f, from }))} error={filter.from && !isISODate(filter.from) ? L('Invalid date', 'गलत तारीख') : undefined} />
          <DateField optional label={L('To', 'तक')} value={filter.to} onChange={(to) => setFilter((f) => ({ ...f, to }))} error={filter.to && !isISODate(filter.to) ? L('Invalid date', 'गलत तारीख') : undefined} />
        </Cols>
        <Cols>
          <MilkmanPicker allowAll label={L('Filter by milkman', 'दूधवाले से छाँटें')} list={milkmen} value={filter.milkman} onChange={(milkman) => setFilter((f) => ({ ...f, milkman }))} />
          <Chips label={L('Filter by shift', 'शिफ्ट से छाँटें')} options={[['', L('All', 'सभी')], ...shiftOptions]} value={filter.shift} onChange={(shift) => setFilter((f) => ({ ...f, shift }))} />
        </Cols>
        {list.error ? <Banner kind="error" text={errorText(list.error, L)} /> : list.loading ? <Loading /> : (
          <>
            <Text style={[s.bold, { marginBottom: 6 }]}>{list.data.total.n} {L('entries', 'एंट्री')} · {num(list.data.total.qty)} {settings.unit} · {money(list.data.total.amount)}</Text>
            {!list.data.rows.length && <Empty text={L('No entries for these filters', 'इन फ़िल्टर पर कोई एंट्री नहीं')} />}
            {list.data.rows.map((r) => (
              <View key={r.id} style={s.option}>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bold}>{r.milkman_code} · {r.milkman_name || '?'}</Text>
                    <Text style={s.muted}>{date(r.date)} · {r.shift === 'Morning' ? L('Morning', 'सुबह') : L('Evening', 'शाम')} · {r.milk_type || '—'}</Text>
                    <Text style={s.muted}>{num(r.qty)} {settings.unit} · Fat {r.fat} · SNF {r.snf} · {money(r.rate)}</Text>
                    {r.remark ? <Text style={s.muted}>{r.remark}</Text> : null}
                  </View>
                  <Text style={s.bold}>{money(r.amount)}</Text>
                </View>
                <View style={[s.wrap, { justifyContent: 'flex-end' }]}>
                  <Button small kind="ghost" icon="create-outline" title={L('Edit', 'बदलें')} onPress={() => edit(r)} />
                  <Button small kind="danger" icon="trash-outline" title={L('Delete', 'डिलीट')} onPress={() => remove(r)} />
                </View>
              </View>
            ))}
            <More total={list.data.total.n} shown={list.data.rows.length} onPress={() => setLimit(limit + 80)} />
          </>
        )}
      </Card>
    </Screen>
  );
}
