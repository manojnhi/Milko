import React, { useState } from 'react';
import { Image, View } from 'react-native';
import JSZip from 'jszip';
import * as repo from '../core/repo.js';
import { counts, createBackup, getSnapshot, parseBackup, restoreBackup } from '../core/backup.js';
import { DATE_FORMATS, localDateTime, today } from '../core/dates.js';
import { decodeText } from '../core/csv.js';
import { writeXlsx } from '../core/xlsx.js';
import { pickPhoto } from '../platform/photo';
import { pickFile, saveFile } from '../platform/files';
import { randomBytes } from '../platform/random';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, Chips, Field, LanguagePicker, Screen, s, Text, ThemePicker } from '../ui';

const MAX_BACKUP = 60 * 1024 * 1024;

export default function Settings() {
  const { db, user, setUser, settings, reloadSettings, setPref, L, notify, confirm, changed, fail, go, date } = useApp();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState(null);
  const [cred, setCred] = useState({ current: '', username: user.username, password: '', repeat: '' });
  const [busy, setBusy] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  const info = useLoad(async () => ({
    snapshot: !!(await db.getFirstAsync('SELECT 1 x FROM Backup_snapshot LIMIT 1')),
    entries: (await db.getFirstAsync('SELECT COUNT(*) c FROM Purchase')).c,
    audit: showAudit ? await repo.listAudit(db, 100) : [],
  }), [showAudit]);

  const set = (k) => (v) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };
  const setC = (k) => (v) => setCred((c) => ({ ...c, [k]: v }));
  // Theme/language turant lagu hote hain aur save bhi (Save settings dabane ki zaroorat nahi).
  const pref = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setPref({ [k]: v }); };
  const err = (field) => (error?.field === field ? errorText(error, L) : undefined);

  const work = (name, task) => async () => {
    setBusy(name);
    await new Promise((r) => setTimeout(r, 30));
    try { await task(); } catch (e) { setError(e); fail(e); }
    setBusy('');
  };

  const save = work('save', async () => {
    await repo.saveSettings(db, form);
    await reloadSettings();
    notify(L('Settings saved', 'सेटिंग सेव हुई'));
  });

  const logo = work('logo', async () => {
    const uri = await pickPhoto('gallery', { square: false, width: 300, png: true });
    if (uri) set('logo')(uri);
  });

  const changeLogin = work('cred', async () => {
    if (cred.password !== cred.repeat) throw new Error(L('Passwords do not match', 'पासवर्ड मेल नहीं खाते'));
    const next = await repo.changeCredentials(db, user.id, cred.current, cred.username, cred.password, randomBytes);
    setUser(next);
    setCred({ current: '', username: next.username, password: '', repeat: '' });
    notify(L('Login changed', 'लॉगिन बदल गया'));
  });

  const download = async (data, name) => saveFile(name, JSON.stringify(data), 'application/json');
  const backup = work('backup', async () => download(await createBackup(db), `milko-backup-${today()}.json`));

  const exportAll = work('export', async () => {
    const data = await createBackup(db);
    const sheet = (name, rows) => ({ name, rows: rows.length ? [Object.keys(rows[0]), ...rows.map((r) => Object.values(r))] : [['No data']] });
    const t = data.tables;
    await saveFile(`milko-all-data-${today()}.xlsx`, await writeXlsx(JSZip, [
      sheet('Milkmen', t.Milkman_tbl), sheet('Rates', t.Rate_tbl), sheet('Milkman Prices', t.Milkman_rate), sheet('Purchases', t.Purchase), sheet('Payments', t.Payment),
    ]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  const apply = async (data) => {
    await restoreBackup(db, data, user.username);
    await reloadSettings();
    setForm(await repo.getSettings(db));
    changed();
  };

  const restore = work('restore', async () => {
    const file = await pickFile(MAX_BACKUP);
    if (!file) return;
    const data = parseBackup(decodeText(file.bytes));
    const c = counts(data);
    const ok = await confirm({
      title: L('Replace ALL data with this backup?', 'पूरा डेटा इस backup से बदलें?'), danger: true, ok: L('Back up current data & restore', 'पहले backup, फिर restore'),
      message: `${file.name}\n${localDateTime(new Date(data.createdAt))}\n${c.milkmen} milkmen, ${c.purchases} entries, ${c.payments} payments, ${c.rates} rates\n\n${L('Current data is first saved as a safety backup.', 'मौजूदा डेटा पहले safety backup में सेव होगा।')}`,
    });
    if (!ok) return;
    try { await download(await createBackup(db), `milko-before-restore-${today()}.json`); }
    catch { /* share band kiya: app ke andar ka snapshot phir bhi banta hai */ }
    const go2 = await confirm({ title: L('Restore now?', 'अब restore करें?'), message: L('Check that the safety backup was saved. An in-app copy is also kept for Undo.', 'देख लें कि safety backup सेव हुआ। Undo के लिए app में भी copy रहेगी।'), danger: true });
    if (!go2) return;
    await apply(data);
    notify(L('Backup restored', 'Backup restore हो गया'));
  });

  const undo = work('undo', async () => {
    const data = await getSnapshot(db);
    if (!data) return;
    const ok = await confirm({ title: L('Undo last restore?', 'पिछला restore वापस लें?'), message: `${L('Go back to data from', 'इस समय के डेटा पर लौटें')} ${localDateTime(new Date(data.createdAt))}. ${L('Changes made after that will be replaced.', 'उसके बाद के बदलाव हट जाएँगे।')}`, danger: true });
    if (!ok) return;
    await apply(data);
    notify(L('Previous data is back', 'पिछला डेटा वापस आ गया'));
  });

  return (
    <Screen>
      <Card>
        <Text style={s.h2}>{L('Appearance', 'दिखावट')}</Text>
        <View style={s.field}>
          <Text style={s.label}>Language / भाषा</Text>
          <LanguagePicker />
        </View>
        <View style={s.field}>
          <Text style={s.label}>{L('Theme', 'थीम')}</Text>
          <ThemePicker value={form.theme} onChange={pref('theme')} />
        </View>
      </Card>

      <Card>
        <Text style={s.h2}>{L('Business profile', 'डेयरी प्रोफ़ाइल')}</Text>
        <View style={s.wrap}>
          {form.logo ? <Image accessibilityLabel="Logo" source={{ uri: form.logo }} resizeMode="contain" style={{ width: 80, height: 80 }} /> : null}
          <Button small kind="ghost" icon="image-outline" title={L('Choose logo', 'लोगो चुनें')} onPress={logo} />
          {form.logo ? <Button small kind="danger" title={L('Remove logo', 'लोगो हटाएँ')} onPress={() => set('logo')('')} /> : null}
        </View>
        <Field label={L('Dairy / business name', 'डेयरी का नाम')} value={form.businessName} onChangeText={set('businessName')} error={err('businessName')} />
        <Field label={L('Address', 'पता')} value={form.address} onChangeText={set('address')} multiline />
        <Field label={L('Phone', 'फ़ोन')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={err('phone')} />
        <Chips label={L('Currency', 'मुद्रा')} options={['₹', 'Rs.', '$', '€', '£']} value={form.currency} onChange={set('currency')} />
        <Chips label={L('Date format', 'तारीख format')} options={DATE_FORMATS} value={form.dateFormat} onChange={set('dateFormat')} />
        <Chips label={L('Milk unit', 'दूध की यूनिट')} options={[['L', 'Litre'], ['Kg', 'Kg']]} value={form.unit} onChange={set('unit')} />
        {form.unit === 'L' && (
          <>
            <Chips label={L('Show quantity in', 'मात्रा किसमें दिखाएँ')} options={[['L', L('Litre', 'लीटर')], ['Magha', L('Magha', 'मघा')], ['both', L('Both', 'दोनों')]]} value={form.qtyDisplay} onChange={set('qtyDisplay')} />
            <Field label={L('Litres in 1 Magha', '1 मघा में कितने लीटर')} value={form.maghaFactor} onChangeText={set('maghaFactor')} keyboardType="decimal-pad" error={err('maghaFactor')}
              hint={L('Old Milko database uses 1.176. Saved entries do not change.', 'पुराने Milko database में 1.176 था। पुरानी एंट्री नहीं बदलतीं।')} />
          </>
        )}
        <Chips label={L('Amount rounding', 'राशि की राउंडिंग')} options={[['paise', L('Keep paise', 'पैसे सहित')], ['rupee', L('Round to rupees', 'पूरे रुपये में')]]} value={form.rounding} onChange={set('rounding')} />
        <Text style={[s.muted, { marginBottom: 10 }]}>{form.rounding === 'rupee'
          ? L('Example: ₹2,287.49 becomes ₹2,287 and ₹2,287.50 becomes ₹2,288. Applies to new and changed entries only.', 'उदाहरण: ₹2,287.49 = ₹2,287 और ₹2,287.50 = ₹2,288। सिर्फ़ नई और बदली गई एंट्री पर।')
          : L('Amounts are kept up to 2 decimals. Saved entries do not change.', 'राशि पैसे तक रहती है। पुरानी एंट्री नहीं बदलती।')}</Text>
        {info.data?.entries > 0 && <Text style={[s.muted, { marginBottom: 10 }]}>{L('Unit is locked because entries exist.', 'एंट्री होने के कारण यूनिट बदली नहीं जा सकती।')}</Text>}
        <Chips label={L('Auto-lock after leaving the app', 'app छोड़ने पर auto-lock')} options={[['1', '1 min'], ['5', '5 min'], ['15', '15 min'], ['0', L('Off', 'बंद')]]} value={form.lockMinutes} onChange={set('lockMinutes')} />
        <Button busy={busy === 'save'} title={L('Save settings', 'सेटिंग सेव करें')} onPress={save} />
        <Button kind="ghost" icon="pricetags-outline" title={L('Rate formula & milk types', 'रेट फॉर्मूला और दूध के प्रकार')} onPress={() => go('rates')} />
      </Card>

      <Card>
        <Text style={s.h2}>{L('App lock login', 'लॉगिन बदलें')}</Text>
        <Field label={L('Current password', 'मौजूदा पासवर्ड')} value={cred.current} onChangeText={setC('current')} secureTextEntry />
        <Field label={L('Username', 'यूज़रनेम')} value={cred.username} onChangeText={setC('username')} autoCapitalize="none" />
        <Field label={L('New password', 'नया पासवर्ड')} value={cred.password} onChangeText={setC('password')} secureTextEntry />
        <Field label={L('Repeat new password', 'नया पासवर्ड दोबारा')} value={cred.repeat} onChangeText={setC('repeat')} secureTextEntry />
        <Button busy={busy === 'cred'} title={L('Change login', 'लॉगिन बदलें')} onPress={changeLogin} />
        <Text style={s.muted}>{L('This locks the app screen. The database file is not encrypted.', 'यह app की स्क्रीन lock है। database file encrypted नहीं है।')}</Text>
      </Card>

      <Card>
        <Text style={s.h2}>{L('Backup, restore & export', 'बैकअप, restore और export')}</Text>
        <Banner text={L('Backup files contain names, phones and photos and are not encrypted. Keep them private, and keep a copy outside this device.', 'Backup में नाम, फ़ोन और फोटो होते हैं और encrypted नहीं है। इसे सुरक्षित और device के बाहर भी रखें।')} />
        <Button icon="download-outline" busy={busy === 'backup'} title={L('Create backup file', 'Backup फ़ाइल बनाएँ')} onPress={backup} />
        <Button kind="ghost" icon="grid-outline" busy={busy === 'export'} title={L('Export all data to Excel', 'सारा डेटा Excel में')} onPress={exportAll} />
        <Button kind="danger" icon="refresh-outline" busy={busy === 'restore'} title={L('Restore from backup', 'Backup से restore')} onPress={restore} />
        {info.data?.snapshot && <Button kind="ghost" busy={busy === 'undo'} title={L('Undo last restore', 'पिछला restore वापस लें')} onPress={undo} />}
        <Text style={s.muted}>{L('Login username/password are not part of backups.', 'लॉगिन password backup में शामिल नहीं।')}</Text>
      </Card>

      <Card>
        <Text style={s.h2}>{L('Audit log', 'बदलाव का इतिहास')}</Text>
        <Button kind="ghost" title={showAudit ? L('Hide', 'छुपाएँ') : L('Show last 100 changes', 'पिछले 100 बदलाव')} onPress={() => setShowAudit(!showAudit)} />
        {showAudit && (info.data?.audit || []).map((a) => {
          const row = a.entity === 'purchase' || a.entity === 'payment' ? JSON.parse(a.before_json || a.after_json || 'null') : null;
          return (
            <View key={a.id} style={s.option}>
              <Text style={s.bold}>{a.action} · {a.entity} #{a.entity_id}</Text>
              <Text style={s.muted}>{localDateTime(new Date(a.at))} · {a.user || '—'}{a.reason ? ` · ${a.reason}` : ''}</Text>
              {row ? <Text style={s.muted}>{date(row.date)} · code {row.milkman_code}{row.qty ? ` · qty ${row.qty}` : ''} · {row.amount}</Text> : null}
            </View>
          );
        })}
        {showAudit && info.error ? <Banner kind="error" text={errorText(info.error, L)} /> : null}
      </Card>
    </Screen>
  );
}
