import React, { useState } from 'react';
import { View } from 'react-native';
import JSZip from 'jszip';
import { autoMap, commitImport, IMPORT_TYPES, MAX_BYTES, MAX_ROWS, templateRows, validateImport } from '../core/importer.js';
import { decodeText, parseCSV, toCSV } from '../core/csv.js';
import { openXlsx, writeXlsx } from '../core/xlsx.js';
import { DATE_FORMATS } from '../core/dates.js';
import { pickFile, saveFile } from '../platform/files';
import { errorText, useApp } from '../app-context';
import { Banner, Button, Card, Chips, Loading, Screen, Table, s, colors, Text } from '../ui';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const tick = () => new Promise((r) => setTimeout(r, 30));

export default function Import() {
  const { db, user, L, settings, confirm, changed, fail, notify, go } = useApp();
  const [type, setType] = useState('milkmen');
  const [file, setFile] = useState(null); // { name, excel, sheetNames, book, rows }
  const [sheet, setSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState({});
  const [options, setOptions] = useState({ dateFormat: 'YYYY-MM-DD', decimal: '.', duplicates: 'skip' });
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const spec = IMPORT_TYPES[type];

  const reset = () => { setFile(null); setPlan(null); setSummary(null); setError(''); setProgress(null); };

  const applyRows = (rows, nextType = type) => {
    // Pehli non-empty row ko header maan lete hain; user badal sakta hai.
    const h = Math.max(0, rows.findIndex((r) => r && r.some((c) => String(c).trim())));
    setHeaderRow(h);
    setMapping(autoMap(nextType, rows[h] || []));
    setPlan(null);
  };

  const choose = async () => {
    setError('');
    try {
      const picked = await pickFile(MAX_BYTES);
      if (!picked) return;
      reset();
      setProgress({ label: L('Reading file…', 'फ़ाइल पढ़ रहे हैं…') });
      await tick();
      const ext = picked.name.split('.').pop().toLowerCase();
      if (ext === 'xlsx') {
        const book = await openXlsx(JSZip, picked.bytes);
        const rows = await book.rows(book.sheetNames[0], MAX_ROWS + 50);
        setSheet(book.sheetNames[0]);
        setFile({ name: picked.name, excel: true, sheetNames: book.sheetNames, book, rows });
        applyRows(rows);
      } else if (ext === 'csv' || ext === 'txt') {
        const rows = parseCSV(decodeText(picked.bytes), MAX_ROWS + 50);
        setFile({ name: picked.name, excel: false, sheetNames: [], rows });
        applyRows(rows);
      } else {
        throw new Error(ext === 'xls'
          ? L('Old .xls format is not supported. Save it as .xlsx or CSV.', 'पुराना .xls format नहीं चलता। .xlsx या CSV में सेव करें।')
          : L(`".${ext}" is not supported. Choose a .csv or .xlsx file.`, `".${ext}" नहीं चलता। .csv या .xlsx फ़ाइल चुनें।`));
      }
    } catch (e) { setError(errorText(e, L)); }
    setProgress(null);
  };

  const chooseSheet = async (name) => {
    setSheet(name);
    setProgress({ label: L('Reading sheet…', 'शीट पढ़ रहे हैं…') });
    try {
      const rows = await file.book.rows(name, MAX_ROWS + 50);
      setFile((f) => ({ ...f, rows }));
      applyRows(rows);
    } catch (e) { setError(errorText(e, L)); }
    setProgress(null);
  };

  const template = async (excel) => {
    try {
      const rows = templateRows(type);
      if (excel) await saveFile(`milko-${type}-template.xlsx`, await writeXlsx(JSZip, [{ name: type, rows }]), XLSX_MIME);
      else await saveFile(`milko-${type}-template.csv`, toCSV(rows), 'text/csv');
    } catch (e) { fail(e); }
  };

  const validate = async () => {
    setError('');
    setProgress({ label: L('Checking rows…', 'rows जाँच रहे हैं…'), value: 0 });
    try {
      setPlan(await validateImport(db, type, file.rows.slice(headerRow + 1), mapping, { ...options, excel: file.excel, firstRowNumber: headerRow + 2 },
        (value) => setProgress({ label: L('Checking rows…', 'rows जाँच रहे हैं…'), value })));
    } catch (e) { setError(errorText(e, L)); }
    setProgress(null);
  };

  const commit = async () => {
    const updates = plan.valid.filter((v) => v.action === 'update').length;
    const ok = await confirm({ title: L('Import valid rows?', 'सही rows import करें?'),
      message: `${L('Add', 'नए')}: ${plan.valid.length - updates} · ${L('Update', 'अपडेट')}: ${updates}\n${L('Skipped', 'छोड़े')}: ${plan.skipped.length} · ${L('Invalid (not imported)', 'गलत (import नहीं होंगे)')}: ${plan.failed.length}\n${L('Tip: take a backup first from Settings.', 'सुझाव: पहले Settings से backup लें।')}` });
    if (!ok) return;
    setProgress({ label: L('Importing…', 'इम्पोर्ट हो रहा है…'), value: 0 });
    try {
      const result = await commitImport(db, plan, user.username, (value) => setProgress({ label: L('Importing…', 'इम्पोर्ट हो रहा है…'), value }));
      setSummary({ ...result, plan });
      setPlan(null);
      setFile(null);
      changed();
      notify(L('Import complete', 'इम्पोर्ट पूरा'));
    } catch (e) {
      setError(`${L('Import failed. Nothing was saved.', 'इम्पोर्ट फेल। कुछ भी सेव नहीं हुआ।')} ${errorText(e, L)}`);
    }
    setProgress(null);
  };

  const errorReport = async (p) => {
    try {
      const rows = [['Row', 'Status', 'Reason', 'Original values'],
        ...p.failed.map((x) => [x.line, 'failed', L(...x.reason), ...x.raw]),
        ...p.skipped.map((x) => [x.line, 'skipped', L(...x.reason), ...x.raw])];
      await saveFile(`milko-${p.type}-import-errors.csv`, toCSV(rows), 'text/csv');
    } catch (e) { fail(e); }
  };

  if (progress) {
    return (
      <Screen>
        <Card>
          <Loading />
          <Text style={[s.bold, { textAlign: 'center' }]}>{progress.label} {progress.value !== undefined ? `${Math.round(progress.value * 100)}%` : ''}</Text>
          <View accessibilityRole="progressbar" style={{ height: 8, backgroundColor: colors.primarySoft, borderRadius: 4, marginTop: 10 }}>
            <View style={{ height: 8, width: `${Math.round((progress.value || 0) * 100)}%`, backgroundColor: colors.primary, borderRadius: 4 }} />
          </View>
        </Card>
      </Screen>
    );
  }

  const headers = file?.rows[headerRow] || [];
  const dataRows = file ? file.rows.slice(headerRow + 1).filter((r) => r && r.some((c) => String(c).trim())) : [];
  const columnLabel = (i) => String(headers[i] || '').trim() || `Column ${i + 1}`;
  const previewColumns = headers.slice(0, 12).map((_, i) => ({ key: String(i), label: columnLabel(i) }));

  return (
    <Screen>
      {error ? <Banner kind="error" text={error} /> : null}

      {summary && (
        <Card>
          <Text style={s.h2}>{L('Import summary', 'इम्पोर्ट सारांश')}</Text>
          <Text style={s.bold}>{L('Added', 'जोड़े')}: {summary.added} · {L('Updated', 'अपडेट')}: {summary.updated} · {L('Skipped', 'छोड़े')}: {summary.skipped} · {L('Failed', 'फेल')}: {summary.failed}</Text>
          {(summary.failed > 0 || summary.skipped > 0) && <Button kind="ghost" title={L('Download skipped/failed rows', 'छोड़ी/फेल rows डाउनलोड')} onPress={() => errorReport(summary.plan)} />}
          <Button title={L('Import another file', 'दूसरी फ़ाइल')} onPress={reset} />
          <Button kind="ghost" title={L('Go to Dashboard', 'डैशबोर्ड पर जाएँ')} onPress={() => go('dashboard')} />
        </Card>
      )}

      {!summary && (
        <Card>
          <Text style={s.h2}>1. {L('What to import', 'क्या import करना है')}</Text>
          <Chips options={Object.entries(IMPORT_TYPES).map(([k, v]) => [k, L(...v.label)])} value={type}
            onChange={(t) => { setType(t); setPlan(null); if (file) setMapping(autoMap(t, headers)); }} />
          <Text style={s.muted}>{L('Expected columns (* required)', 'ज़रूरी कॉलम (*)')}: {spec.fields.map((x) => x.label + (x.required ? '*' : '')).join(', ')}</Text>
          {type === 'rates' && <Text style={s.muted}>{L('Formula: fat_snf, fat or fixed', 'Formula: fat_snf, fat या fixed')}</Text>}
          {type === 'purchases' && <Text style={s.muted}>{L('Import milkmen and rates first. Without a Rate column the app rate formula is used.', 'पहले दूधवाले और रेट import करें। Rate कॉलम न हो तो app का फॉर्मूला लगेगा।')}</Text>}
          <View style={s.wrap}>
            <Button small kind="ghost" icon="download-outline" title={L('CSV template', 'CSV नमूना')} onPress={() => template(false)} />
            <Button small kind="ghost" icon="download-outline" title={L('Excel template', 'Excel नमूना')} onPress={() => template(true)} />
          </View>
          <Button icon="folder-open-outline" title={file ? L('Choose another file', 'दूसरी फ़ाइल चुनें') : L('Choose .csv / .xlsx file', '.csv / .xlsx फ़ाइल चुनें')} onPress={choose} />
        </Card>
      )}

      {file && !plan && (
        <>
          <Card>
            <Text style={s.h2}>2. {file.name}</Text>
            {file.sheetNames.length > 1 && <Chips label={L('Sheet', 'शीट')} options={file.sheetNames} value={sheet} onChange={chooseSheet} />}
            <Chips label={L('Header row number', 'हेडर किस row में है')} options={[...new Set([0, 1, 2, 3, 4, 5, headerRow])].filter((i) => i < file.rows.length).sort((a, b) => a - b).map((i) => [i, String(i + 1)])}
              value={headerRow} onChange={(i) => { setHeaderRow(i); setMapping(autoMap(type, file.rows[i] || [])); }} />
            <Text style={[s.muted, { marginBottom: 6 }]}>{dataRows.length} {L('data rows · first 5 shown', 'rows · पहली 5')}</Text>
            <Table columns={previewColumns} rows={dataRows.slice(0, 5)} text={(row, c) => String(row[Number(c.key)] ?? '')} />
          </Card>
          <Card>
            <Text style={s.h2}>3. {L('Map columns', 'कॉलम मिलाएँ')}</Text>
            {spec.fields.map((field) => (
              <Chips key={field.key} label={field.label + (field.required ? ' *' : '')} value={mapping[field.key] ?? -1}
                options={[[-1, L('— none —', '— कोई नहीं —')], ...headers.map((_, i) => [i, columnLabel(i)])]}
                onChange={(i) => setMapping((m) => { const next = { ...m }; if (i < 0) delete next[field.key]; else next[field.key] = i; return next; })} />
            ))}
          </Card>
          <Card>
            <Text style={s.h2}>4. {L('Formats and duplicates', 'format और दोहराव')}</Text>
            <Chips label={L('Date format in file', 'फ़ाइल में तारीख')} options={DATE_FORMATS} value={options.dateFormat} onChange={(v) => setOptions((o) => ({ ...o, dateFormat: v }))} />
            {file.excel && <Text style={[s.muted, { marginBottom: 10 }]}>{L('Real Excel date cells are detected automatically.', 'Excel की date cells अपने-आप पहचानी जाती हैं।')}</Text>}
            <Chips label={L('Decimal separator', 'दशमलव चिह्न')} options={[['.', '1,234.5'], [',', '1.234,5']]} value={options.decimal} onChange={(v) => setOptions((o) => ({ ...o, decimal: v }))} />
            <Chips label={L('If a record already exists', 'पहले से मौजूद हो तो')} options={[['skip', L('Skip', 'छोड़ें')], ['update', L('Update', 'अपडेट करें')]]} value={options.duplicates} onChange={(v) => setOptions((o) => ({ ...o, duplicates: v }))} />
            <Button title={L('Check and preview', 'जाँचें और preview')} onPress={validate} disabled={!dataRows.length} />
            <Text style={s.muted}>{L(`Limit: ${MAX_ROWS} rows per file`, `सीमा: एक फ़ाइल में ${MAX_ROWS} rows`)}</Text>
          </Card>
        </>
      )}

      {plan && (
        <Card>
          <Text style={s.h2}>5. {L('Preview (nothing saved yet)', 'Preview (अभी कुछ सेव नहीं)')}</Text>
          <Banner kind={plan.failed.length ? 'warn' : 'ok'} text={`${L('Valid', 'सही')}: ${plan.valid.length} · ${L('Skipped', 'छोड़े')}: ${plan.skipped.length} · ${L('Invalid', 'गलत')}: ${plan.failed.length}`} />
          {plan.valid.length > 0 && (
            <Table columns={[{ key: 'line', label: 'Row', type: 'int' }, { key: 'action', label: 'Action' },
              ...spec.fields.filter((x) => plan.valid[0].data[x.key] !== undefined && (mapping[x.key] !== undefined || x.required || x.key === 'amount' || x.key === 'rate')).map((x) => ({ key: x.key, label: x.label }))]}
              rows={plan.valid.slice(0, 20).map((v) => ({ ...v.data, line: v.line, action: v.action }))}
              text={(row, c) => String(row[c.key] ?? '')} />
          )}
          {[...plan.failed, ...plan.skipped].slice(0, 30).map((x) => (
            <Text key={x.line} style={{ color: plan.failed.includes(x) ? colors.danger : colors.muted, marginTop: 4 }}>Row {x.line}: {L(...x.reason)}</Text>
          ))}
          {(plan.failed.length > 0 || plan.skipped.length > 0) && <Button kind="ghost" title={L('Download all problem rows', 'सभी दिक्कत वाली rows')} onPress={() => errorReport(plan)} />}
          <Button title={`${L('Import valid rows only', 'सिर्फ़ सही rows import करें')} (${plan.valid.length})`} disabled={!plan.valid.length} onPress={commit} />
          <Button kind="ghost" title={L('Back to mapping', 'mapping पर वापस')} onPress={() => setPlan(null)} />
          <Button kind="ghost" title={L('Cancel import', 'import रद्द करें')} onPress={reset} />
        </Card>
      )}
    </Screen>
  );
}
