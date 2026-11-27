import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { getDb, today } from '../db';
import { Button, Card, Chips, Field, s } from '../ui';

export default function Rates() {
  const [list, setList] = useState([]);
  const [date, setDate] = useState(today());
  const [type, setType] = useState('Cow');
  const [fatRate, setFatRate] = useState('');
  const [snfRate, setSnfRate] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    setList(await db.getAllAsync('SELECT * FROM Rate_tbl ORDER BY applicable_date DESC, rate_id DESC'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('Date format YYYY-MM-DD me dalo');
    if (!fatRate || !snfRate) return Alert.alert('Fat rate aur SNF rate dalo');
    const db = await getDb();
    await db.runAsync('INSERT INTO Rate_tbl (applicable_date, milk_type, fat_rate, snf_rate) VALUES (?,?,?,?)',
      [date, type, Number(fatRate), Number(snfRate)]);
    setFatRate(''); setSnfRate(''); load();
  };

  const remove = (r) => Alert.alert('Delete?', `${r.applicable_date} ${r.milk_type}`, [
    { text: 'No' },
    { text: 'Yes', style: 'destructive', onPress: async () => {
      const db = await getDb();
      await db.runAsync('DELETE FROM Rate_tbl WHERE rate_id=?', [r.rate_id]); load();
    } },
  ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={s.h1}>Naya rate</Text>
        <Text style={s.muted}>Rate/Ltr = Fat% × Fat Rate + SNF% × SNF Rate</Text>
        <Field label="Applicable date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <Chips options={['Cow', 'Buffalo']} value={type} onChange={setType} />
        <Field label="Fat rate (per 1% fat)" value={fatRate} onChangeText={setFatRate} keyboardType="decimal-pad" />
        <Field label="SNF rate (per 1% SNF)" value={snfRate} onChangeText={setSnfRate} keyboardType="decimal-pad" />
        <Button title="Save rate" onPress={save} />
      </Card>
      {list.map((r) => (
        <Card key={r.rate_id}>
          <View style={s.row}>
            <View>
              <Text style={s.bold}>{r.applicable_date} · {r.milk_type}</Text>
              <Text style={s.muted}>Fat {r.fat_rate} · SNF {r.snf_rate}</Text>
            </View>
            <Button title="Delete" kind="danger" onPress={() => remove(r)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
