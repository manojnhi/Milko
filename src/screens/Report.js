import React, { useState } from 'react';
import { ScrollView, Text, View, Share } from 'react-native';
import { getDb, today, round2 } from '../db';
import { Button, Card, Field, s } from '../ui';

export default function Report() {
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState(null);

  const run = async () => {
    const db = await getDb();
    setRows(await db.getAllAsync(
      `SELECT p.milkman_code, COALESCE(m.milkman_name,'?') AS name,
              SUM(p.qty) AS qty, SUM(p.amount) AS amount, COUNT(*) AS n,
              SUM(p.qty*p.fat)/SUM(p.qty) AS avg_fat, SUM(p.qty*p.snf)/SUM(p.qty) AS avg_snf
       FROM Purchase p LEFT JOIN Milkman_tbl m ON m.milkman_code = p.milkman_code
       WHERE p.date BETWEEN ? AND ?
       GROUP BY p.milkman_code ORDER BY p.milkman_code`, [from, to]));
  };

  const totals = (rows || []).reduce((a, r) => ({ q: a.q + r.qty, a: a.a + r.amount }), { q: 0, a: 0 });

  const share = () => {
    const lines = rows.map((r) => `${r.milkman_code} ${r.name}: ${round2(r.qty)} L, ₹${round2(r.amount)}`);
    Share.share({ message: `Milko Account Report ${from} to ${to}\n${lines.join('\n')}\nTotal: ${round2(totals.q)} L, ₹${round2(totals.a)}` });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
        <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} />
        <Button title="Report dikhao" onPress={run} />
      </Card>
      {rows && (
        <>
          <Text style={s.h1}>Total: {round2(totals.q)} L · ₹{round2(totals.a)}</Text>
          {rows.map((r) => (
            <Card key={r.milkman_code}>
              <View style={s.row}>
                <View>
                  <Text style={s.bold}>{r.milkman_code} · {r.name}</Text>
                  <Text style={s.muted}>{r.n} entries · avg Fat {round2(r.avg_fat)} · avg SNF {round2(r.avg_snf)}</Text>
                  <Text style={s.muted}>{round2(r.qty)} L</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800' }}>₹{round2(r.amount)}</Text>
              </View>
            </Card>
          ))}
          {rows.length === 0 && <Text style={s.muted}>Is period me koi entry nahi.</Text>}
          {rows.length > 0 && <Button title="Share report" kind="ghost" onPress={share} />}
        </>
      )}
    </ScrollView>
  );
}
