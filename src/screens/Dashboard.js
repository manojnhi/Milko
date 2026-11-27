import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { getDb, today, round2 } from '../db';
import { Button, Card, s } from '../ui';

export default function Dashboard({ nav }) {
  const [stats, setStats] = useState({ qty: 0, amount: 0, entries: 0, milkmen: 0 });

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const t = await db.getFirstAsync(
        'SELECT COALESCE(SUM(qty),0) q, COALESCE(SUM(amount),0) a, COUNT(*) c FROM Purchase WHERE date = ?',
        [today()]
      );
      const m = await db.getFirstAsync('SELECT COUNT(*) c FROM Milkman_tbl WHERE active = 1');
      setStats({ qty: t.q, amount: t.a, entries: t.c, milkmen: m.c });
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text style={s.h1}>Aaj ka summary ({today()})</Text>
      <View style={{ flexDirection: 'row' }}>
        <Card style={{ flex: 1, marginRight: 6 }}>
          <Text style={s.muted}>Milk (Ltr)</Text>
          <Text style={{ fontSize: 22, fontWeight: '800' }}>{round2(stats.qty)}</Text>
        </Card>
        <Card style={{ flex: 1, marginLeft: 6 }}>
          <Text style={s.muted}>Amount (₹)</Text>
          <Text style={{ fontSize: 22, fontWeight: '800' }}>{round2(stats.amount)}</Text>
        </Card>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Card style={{ flex: 1, marginRight: 6 }}>
          <Text style={s.muted}>Entries</Text>
          <Text style={{ fontSize: 22, fontWeight: '800' }}>{stats.entries}</Text>
        </Card>
        <Card style={{ flex: 1, marginLeft: 6 }}>
          <Text style={s.muted}>Active milkmen</Text>
          <Text style={{ fontSize: 22, fontWeight: '800' }}>{stats.milkmen}</Text>
        </Card>
      </View>
      <Button title="Milk Purchase Entry" onPress={() => nav.go('purchase')} />
      <Button title="Milkmen" kind="ghost" onPress={() => nav.go('milkmen')} />
      <Button title="Rates" kind="ghost" onPress={() => nav.go('rates')} />
      <Button title="Account Report" kind="ghost" onPress={() => nav.go('report')} />
    </ScrollView>
  );
}
