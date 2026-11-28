import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import * as repo from '../core/repo.js';
import { isISODate, today } from '../core/dates.js';
import { sumMoney } from '../core/money.js';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, Chips, Cols, DateField, Empty, Field, Loading, MilkmanPicker, More, Screen, s, Text } from '../ui';

export default function Payments() {
  const { db, user, route, L, money, date, notify, confirm, changed, fail, go } = useApp();
  const preset = route.params.milkman || '';
  const empty = { milkman_code: preset, date: today(), type: 'payment', amount: '', mode: 'Cash', reference: '', notes: '' };
  const [open, setOpen] = useState(!!route.params.add);
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState({ milkman: preset, from: today().slice(0, 8) + '01', to: today() });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(30);
  const set = (k) => (v) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };
  const err = (field) => (error?.field === field ? errorText(error, L) : undefined);

  const { data, loading, error: loadError } = useLoad(async () => ({
    milkmen: await repo.listMilkmen(db),
    balances: await repo.balances(db, filter),
    ledger: await repo.listPayments(db, filter),
    current: form.milkman_code ? (await repo.balances(db, { milkman: form.milkman_code }))[0]?.closing || 0 : null,
  }), [filter.milkman, filter.from, filter.to, form.milkman_code]);

  const typeLabel = { payment: L('Payment', 'भुगतान'), advance: L('Advance', 'एडवांस'), adjustment: L('Adjustment', 'एडजस्टमेंट') };

  const save = async () => {
    setBusy(true);
    try {
      const p = repo.checkPayment(form);
      if (!p.milkman_code) throw Object.assign(new Error('Select a milkman'), { msg: ['Select a milkman', 'दूधवाला चुनें'], field: 'milkman_code' });
      const who = data.milkmen.find((m) => m.milkman_code === p.milkman_code);
      const ok = await confirm({ title: L('Save this record?', 'यह रिकॉर्ड सेव करें?'), message: `${who?.milkman_name} · ${typeLabel[p.type]} · ${money(p.amount)} · ${date(p.date)}` });
      if (!ok) return;
      await repo.addPayment(db, form, user.username);
      setForm({ ...empty, milkman_code: '' });
      setOpen(false);
      notify(L('Saved', 'सेव हो गया'));
      changed();
    } catch (e) { setError(e); fail(e); } finally { setBusy(false); }
  };

  const cancel = async (p) => {
    const ok = await confirm({ title: L('Cancel this record?', 'यह रिकॉर्ड कैंसल करें?'), message: `${p.milkman_name} · ${typeLabel[p.type]} · ${money(p.amount)} · ${date(p.date)}`, needReason: true, danger: true, ok: L('Cancel record', 'कैंसल करें') });
    if (!ok) return;
    try { await repo.cancelPayment(db, p.id, ok.reason, user.username); changed(); } catch (e) { fail(e); }
  };

  if (loadError) return <Screen><Banner kind="error" text={errorText(loadError, L)} /></Screen>;
  if (loading) return <Loading />;

  const total = (k) => sumMoney(data.balances.map((b) => b[k]));
  const bad = (v) => (v && !isISODate(v) ? L('Invalid date', 'गलत तारीख') : undefined);

  return (
    <Screen>
      <Button icon={open ? 'close' : 'add'} kind={open ? 'ghost' : 'primary'} title={open ? L('Close form', 'फ़ॉर्म बंद करें') : L('Record payment / advance / adjustment', 'भुगतान / एडवांस / एडजस्टमेंट')} onPress={() => setOpen(!open)} />
      {open && (
        <Card>
          <MilkmanPicker label={L('Milkman', 'दूधवाला')} list={data.milkmen} value={form.milkman_code} onChange={set('milkman_code')} error={err('milkman_code')} />
          {data.current !== null && <Text style={[s.bold, { marginBottom: 10 }]}>{L('Current balance due', 'अभी बकाया')}: {money(data.current)}</Text>}
          <Chips label={L('Type', 'प्रकार')} options={repo.PAY_TYPES.map((t) => [t, typeLabel[t]])} value={form.type} onChange={set('type')} />
          {form.type === 'adjustment' && <Banner text={L('Positive amount increases what you owe; negative reduces it. To clear dues already paid before this update, enter a negative adjustment with a note.', 'धनात्मक राशि से बकाया बढ़ता है, ऋणात्मक से घटता है। इस अपडेट से पहले चुकाया हिसाब हटाने के लिए ऋणात्मक एडजस्टमेंट डालें।')} />}
          <Cols>
            <DateField label={L('Date', 'तारीख')} value={form.date} onChange={set('date')} error={err('date')} />
            <Field label={L('Amount', 'राशि')} value={form.amount} onChangeText={set('amount')} keyboardType={form.type === 'adjustment' ? 'numbers-and-punctuation' : 'decimal-pad'} error={err('amount')} />
          </Cols>
          {form.type !== 'adjustment' && <Chips label={L('Mode', 'तरीका')} options={repo.PAY_MODES} value={form.mode} onChange={set('mode')} />}
          <Field label={L('Reference (UTR / cheque no.)', 'रेफ़रेंस (UTR / चेक नं.)')} value={form.reference} onChangeText={set('reference')} />
          <Field label={L('Notes', 'नोट')} value={form.notes} onChangeText={set('notes')} error={err('notes')} multiline />
          <Button busy={busy} title={L('Save', 'सेव करें')} onPress={save} />
        </Card>
      )}

      <Card>
        <MilkmanPicker allowAll label={L('Milkman', 'दूधवाला')} list={data.milkmen} value={filter.milkman} onChange={(milkman) => setFilter((f) => ({ ...f, milkman }))} />
        <Cols>
          <DateField optional label={L('From', 'से')} value={filter.from} onChange={(from) => setFilter((f) => ({ ...f, from }))} error={bad(filter.from)} />
          <DateField optional label={L('To', 'तक')} value={filter.to} onChange={(to) => setFilter((f) => ({ ...f, to }))} error={bad(filter.to)} />
        </Cols>
        <Text style={s.muted}>{L('Opening', 'पिछला')} {money(total('opening'))} + {L('Purchase', 'खरीद')} {money(total('purchase'))} − {L('Paid', 'भुगतान')} {money(total('payment'))} − {L('Advance', 'एडवांस')} {money(total('advance'))} + {L('Adjust', 'एडजस्ट')} {money(total('adjustment'))}</Text>
        <Text style={s.statValue}>{L('Balance', 'बकाया')}: {money(total('closing'))}</Text>
        <Button small kind="ghost" icon="bar-chart-outline" title={L('Export / print in Reports', 'Reports में export / print')} onPress={() => go('report', { milkman: filter.milkman, type: 'account' })} />
      </Card>

      <Card>
        <Text style={s.h2}>{L('Balances by milkman', 'दूधवाले के अनुसार बकाया')}</Text>
        {!data.balances.length && <Empty text={L('No transactions yet', 'अभी कोई लेन-देन नहीं')} />}
        {data.balances.slice(0, limit).map((b) => (
          <TouchableOpacity key={b.milkman_code} accessibilityRole="button" style={[s.option, s.row]}
            onPress={() => setFilter((f) => ({ ...f, milkman: b.milkman_code }))}>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{b.milkman_code} · {b.name}</Text>
              <Text style={s.muted}>{L('Purchase', 'खरीद')} {money(b.purchase)} · {L('Paid+Adv', 'भुगतान+एडवांस')} {money(sumMoney([b.payment, b.advance]))}</Text>
            </View>
            <Text style={s.bold}>{money(b.closing)}</Text>
          </TouchableOpacity>
        ))}
        <More total={data.balances.length} shown={Math.min(limit, data.balances.length)} onPress={() => setLimit(limit + 50)} />
      </Card>

      <Card>
        <Text style={s.h2}>{L('Payment ledger', 'भुगतान खाता')}</Text>
        {!data.ledger.length && <Empty icon="wallet-outline" text={L('No payments in this period', 'इस अवधि में कोई भुगतान नहीं')} />}
        {data.ledger.slice(0, limit).map((p) => (
          <View key={p.id} style={s.option}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>{p.milkman_code} · {p.milkman_name || '?'}</Text>
                <Text style={s.muted}>{date(p.date)} · {typeLabel[p.type]}{p.mode ? ` · ${p.mode}` : ''}{p.reference ? ` · ${p.reference}` : ''}</Text>
                {p.notes ? <Text style={s.muted}>{p.notes}</Text> : null}
              </View>
              <Text style={s.bold}>{money(p.amount)}</Text>
            </View>
            <Button small kind="ghost" title={L('Cancel', 'कैंसल')} style={{ alignSelf: 'flex-end' }} onPress={() => cancel(p)} />
          </View>
        ))}
        <More total={data.ledger.length} shown={Math.min(limit, data.ledger.length)} onPress={() => setLimit(limit + 50)} />
      </Card>
    </Screen>
  );
}
