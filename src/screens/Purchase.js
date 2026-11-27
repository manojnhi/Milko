import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { getDb, today, findRate, calcRate, round2 } from '../db';
import { Button, Card, Chips, Field, s } from '../ui';

export default function Purchase() {
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState('Morning');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [remark, setRemark] = useState('');
  const [milkman, setMilkman] = useState(null);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    const db = await getDb();
    setRows(await db.getAllAsync(
      `SELECT p.*, m.milkman_name FROM Purchase p LEFT JOIN Milkman_tbl m ON m.milkman_code = p.milkman_code
       WHERE p.date = ? ORDER BY p.id DESC`, [date]));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!code) return setMilkman(null);
      const db = await getDb();
      setMilkman(await db.getFirstAsync('SELECT * FROM Milkman_tbl WHERE milkman_code=? AND active=1', [Number(code)]));
    })();
  }, [code]);

  const save = async () => {
    if (!milkman) return Alert.alert('Valid active milkman code dalo');
    if (!qty || !fat || !snf) return Alert.alert('Qty, Fat aur SNF dalo');
    const rateRow = await findRate(date, milkman.milk_type);
    if (!rateRow) return Alert.alert('Rate nahi mila', `${milkman.milk_type} ka rate ${date} ya usse pehle ki date ka add karo.`);
    const rate = calcRate(rateRow, fat, snf);
    const amount = round2(Number(qty) * rate);
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO Purchase (date, shift, milkman_code, qty, fat, snf, rate, amount, remark) VALUES (?,?,?,?,?,?,?,?,?)',
      [date, shift, milkman.milkman_code, Number(qty), Number(fat), Number(snf), rate, amount, remark]);
    setCode(''); setQty(''); setFat(''); setSnf(''); setRemark('');
    load();
  };

  const remove = (r) => Alert.alert('Delete entry?', `${r.milkman_name} ${r.qty} L`, [
    { text: 'No' },
    { text: 'Yes', style: 'destructive', onPress: async () => {
      const db = await getDb();
      await db.runAsync('DELETE FROM Purchase WHERE id=?', [r.id]); load();
    } },
  ]);

  const total = rows.reduce((a, r) => ({ q: a.q + r.qty, a: a.a + r.amount }), { q: 0, a: 0 });

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Chips options={['Morning', 'Evening']} value={shift} onChange={setShift} />
        <Field label="Milkman Code" value={code} onChangeText={setCode} keyboardType="numeric" />
        <Text style={[s.muted, { marginBottom: 8, marginTop: -6 }]}>
          {milkman ? `${milkman.milkman_name} (${milkman.milk_type})` : code ? 'Milkman nahi mila' : ''}
        </Text>
        <Field label="Quantity (Ltr)" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
        <Field label="Fat %" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
        <Field label="SNF %" value={snf} onChangeText={setSnf} keyboardType="decimal-pad" />
        <Field label="Remark" value={remark} onChangeText={setRemark} />
        <Button title="Save entry" onPress={save} />
      </Card>
      <Text style={s.h1}>{date} · {round2(total.q)} L · ₹{round2(total.a)}</Text>
      {rows.map((r) => (
        <Card key={r.id}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{r.milkman_code} · {r.milkman_name} ({r.shift})</Text>
              <Text style={s.muted}>{r.qty} L · Fat {r.fat} · SNF {r.snf} · ₹{r.rate}/L</Text>
              <Text style={s.bold}>₹{r.amount}</Text>
            </View>
            <Button title="Del" kind="danger" onPress={() => remove(r)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
