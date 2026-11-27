import React from 'react';
import { Text, View } from 'react-native';
import { dashboard } from '../core/repo.js';
import { today } from '../core/dates.js';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, Empty, Loading, Screen, Stat, s } from '../ui';

export default function Dashboard() {
  const { db, go, L, money, num, date, settings } = useApp();
  const { data, loading, error, reload } = useLoad(() => dashboard(db, today()), []);

  if (loading) return <Loading />;
  if (error) return <Screen><Banner kind="error" text={errorText(error, L)}><Button title={L('Retry', 'दोबारा')} onPress={reload} /></Banner></Screen>;
  const unit = settings.unit;

  return (
    <Screen>
      {data.badDates.length > 0 && (
        <Banner text={`${L('Some old entries have an invalid date and are missing from date reports. Open Collection, choose "All dates", then edit them', 'कुछ पुरानी एंट्री की तारीख गलत है और वे रिपोर्ट में नहीं आतीं। Collection में "सभी तारीख" चुनकर ठीक करें')}: ${data.badDates.map((r) => `#${r.id} "${r.date}" (${L('code', 'कोड')} ${r.milkman_code})`).join(', ')}`} />
      )}
      <Text style={s.h1}>{L("Today's collection", 'आज का संग्रह')} · {date(today())}</Text>
      <View style={[s.wrap, { alignItems: 'stretch' }]}>
        <Stat label={L('Total quantity', 'कुल दूध')} value={`${num(data.today.qty)} ${unit}`} icon="water" />
        <Stat label={L('Total amount', 'कुल राशि')} value={money(data.today.amount)} icon="cash" />
        <Stat label={L('Entries', 'एंट्री')} value={String(data.today.n)} icon="receipt" />
        <Stat label={L('Active milkmen', 'सक्रिय दूधवाले')} value={String(data.active)} icon="people" onPress={() => go('milkmen')} />
        <Stat label={`${L('Pending payments', 'बकाया भुगतान')} (${data.pendingCount})`} value={money(data.pending)} icon="alert-circle" tone="#b45309" onPress={() => go('payments')} />
      </View>
      <Card>
        <Text style={s.muted}>{L('Morning', 'सुबह')}: {num(data.morning.qty)} {unit} · {money(data.morning.amount)}</Text>
        <Text style={s.muted}>{L('Evening', 'शाम')}: {num(data.evening.qty)} {unit} · {money(data.evening.amount)}</Text>
      </Card>
      <View style={s.wrap}>
        <Button icon="add" title={L('New milk entry', 'नई दूध एंट्री')} onPress={() => go('purchase')} />
        <Button kind="ghost" icon="wallet-outline" title={L('Record payment', 'भुगतान दर्ज करें')} onPress={() => go('payments', { add: true })} />
        <Button kind="ghost" icon="bar-chart-outline" title={L('Reports', 'रिपोर्ट')} onPress={() => go('report')} />
      </View>
      <Card style={{ marginTop: 8 }}>
        <Text style={s.h2}>{L('Recent entries', 'हाल की एंट्री')}</Text>
        {data.recent.length === 0 && <Empty icon="water-outline" text={L('No entries yet. Add milkmen and rates, then record the first collection.', 'अभी कोई एंट्री नहीं। पहले दूधवाले और रेट जोड़ें।')}
          action={<Button small title={L('Add milkman', 'दूधवाला जोड़ें')} onPress={() => go('milkmen')} />} />}
        {data.recent.map((r) => (
          <View key={r.id} style={[s.row, s.option]}>
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>{r.milkman_code} · {r.milkman_name || '?'}</Text>
              <Text style={s.muted}>{date(r.date)} · {r.shift === 'Morning' ? L('Morning', 'सुबह') : L('Evening', 'शाम')} · {num(r.qty)} {unit}</Text>
            </View>
            <Text style={s.bold}>{money(r.amount)}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
