import React, { useState } from 'react';
import { View } from 'react-native';
import JSZip from 'jszip';
import * as repo from '../core/repo.js';
import { buildReport, cellValue, REPORT_TYPES, reportMatrix } from '../core/reports.js';
import { buildReportHtml, displayValue } from '../core/reportHtml.js';
import { isISODate, localDateTime, today } from '../core/dates.js';
import { toCSV } from '../core/csv.js';
import { writeXlsx } from '../core/xlsx.js';
import { pdfMode, printHtml, saveFile, savePdf } from '../platform/files';
import { errorText, useApp, useLoad } from '../app-context';
import { Banner, Button, Card, Chips, Cols, DateField, Empty, Loading, MilkmanPicker, Screen, Stat, Table, s, Text } from '../ui';

const PREVIEW = 200;

export default function Report() {
  const { db, route, L, date, settings, fail, qtyDisplay, factor } = useApp();
  const [pickedQty, setQtyView] = useState(null);
  const qtyView = pickedQty || qtyDisplay;
  const [type, setType] = useState(route.params.type || 'daily');
  const [f, setF] = useState({ from: today().slice(0, 8) + '01', to: today(), milkman: route.params.milkman || '', milkType: '', shift: '' });
  const [busy, setBusy] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const dateError = [f.from, f.to].some((v) => v && !isISODate(v)) ? L('Enter valid dates', 'सही तारीख डालें')
    : f.from && f.to && f.from > f.to ? L('"From" is after "To"', '"से" तारीख "तक" के बाद है') : '';

  const base = useLoad(async () => ({ milkmen: await repo.listMilkmen(db), types: await repo.listMilkTypes(db) }), []);
  const report = useLoad(async () => (dateError ? null : buildReport(db, type, f, L, settings.dateFormat, { display: qtyView, factor, unit: settings.unit })),
    [type, f.from, f.to, f.milkman, f.milkType, f.shift, settings.language, settings.dateFormat, qtyView]);

  if (base.loading) return <Loading />;
  const r = report.data;
  const usesShift = ['daily', 'rate', 'entries'].includes(type);

  const meta = () => {
    const who = base.data.milkmen.find((m) => m.milkman_code === Number(f.milkman));
    return {
      businessName: settings.businessName,
      filters: [
        `${L('Period', 'अवधि')}: ${type === 'pending' ? L('all', 'शुरू') : date(f.from) || L('all', 'शुरू')} – ${date(f.to) || L('today', 'आज')}`,
        `${L('Milkman', 'दूधवाला')}: ${who ? `${who.milkman_code} ${who.milkman_name}` : L('All', 'सभी')}`,
        ...(usesShift ? [`${L('Milk type', 'प्रकार')}: ${f.milkType || L('All', 'सभी')} · ${L('Shift', 'शिफ्ट')}: ${f.shift || L('All', 'सभी')}`] : []),
        `${L('Quantity unit', 'मात्रा यूनिट')}: ${settings.unit !== 'L' ? 'Kg' : { L: L('Litre', 'लीटर'), Magha: L('Magha', 'मघा'), both: L('Litre and Magha', 'लीटर और मघा') }[qtyView]} · ${L('Currency', 'मुद्रा')}: ${settings.currency}`,
      ],
      generated: `${L('Generated', 'बनाया गया')}: ${localDateTime()}`,
    };
  };

  const run = (kind) => async () => {
    setBusy(kind);
    try {
      await new Promise((res) => setTimeout(res, 30));
      const name = `milko-${type}-${f.to || today()}`;
      const m = meta();
      if (kind === 'csv') await saveFile(`${name}.csv`, toCSV(reportMatrix(r, m).rows), 'text/csv');
      else if (kind === 'xlsx') {
        const matrix = reportMatrix(r, m);
        await saveFile(`${name}.xlsx`, await writeXlsx(JSZip, [{ name: 'Report', ...matrix }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        const html = buildReportHtml(r, { settings, filters: m.filters, generated: m.generated });
        if (kind === 'print') await printHtml(html);
        else await savePdf(html, `${name}.pdf`, r.columns.length > 8);
      }
    } catch (e) {
      // Android par share/print band karna error nahi hai.
      if (!/did not complete|cancel/i.test(e.message || '')) fail(e);
    } finally { setBusy(''); }
  };

  return (
    <Screen>
      <Card>
        <Chips label={L('Report', 'रिपोर्ट')} options={REPORT_TYPES.map(([v, en, hi]) => [v, L(en, hi)])} value={type} onChange={setType} />
        <Cols>
          <DateField optional label={L('From', 'से')} value={f.from} onChange={set('from')} />
          <DateField optional label={L('To', 'तक')} value={f.to} onChange={set('to')} />
        </Cols>
        {settings.unit === 'L' && type !== 'ledger' && type !== 'pending' && (
          <Chips label={L('Show quantity in', 'मात्रा किसमें दिखाएँ')} options={[['L', L('Litre', 'लीटर')], ['Magha', L('Magha', 'मघा')], ['both', L('Both', 'दोनों')]]} value={qtyView} onChange={setQtyView} />
        )}
        <MilkmanPicker allowAll label={L('Milkman', 'दूधवाला')} list={base.data.milkmen} value={f.milkman} onChange={set('milkman')} />
        {usesShift && (
          <Cols>
            <Chips label={L('Milk type', 'दूध का प्रकार')} options={[['', L('All', 'सभी')], ...base.data.types.map((t) => [t.name, t.name])]} value={f.milkType} onChange={set('milkType')} />
            <Chips label={L('Shift', 'शिफ्ट')} options={[['', L('All', 'सभी')], ['Morning', L('Morning', 'सुबह')], ['Evening', L('Evening', 'शाम')]]} value={f.shift} onChange={set('shift')} />
          </Cols>
        )}
        {dateError ? <Banner kind="error" text={dateError} /> : null}
      </Card>

      {report.error ? <Banner kind="error" text={errorText(report.error, L)} /> : null}
      {report.loading ? <Loading /> : r && r.type === type && !dateError && (
        <>
          <View style={[s.wrap, { alignItems: 'stretch' }]}>
            {r.summary.map((x) => <Stat key={x.label} label={x.label} value={displayValue(x.value, x.type, settings.currency)} icon="stats-chart" />)}
          </View>
          <View style={s.wrap}>
            <Button small icon="document-outline" busy={busy === 'pdf'} disabled={!r.rows.length}
              title={pdfMode === 'share' ? L('PDF share / save', 'PDF शेयर / सेव') : pdfMode === 'download' ? L('Download PDF', 'PDF डाउनलोड') : L('Save as PDF', 'PDF सेव करें')} onPress={run('pdf')} />
            <Button small kind="ghost" icon="print-outline" busy={busy === 'print'} disabled={!r.rows.length} title={L('Print', 'प्रिंट')} onPress={run('print')} />
            <Button small kind="ghost" icon="download-outline" busy={busy === 'csv'} disabled={!r.rows.length} title="CSV" onPress={run('csv')} />
            <Button small kind="ghost" icon="grid-outline" busy={busy === 'xlsx'} disabled={!r.rows.length} title="Excel" onPress={run('xlsx')} />
          </View>
          {pdfMode === 'print' && <Text style={s.muted}>{L('In the browser, choose "Save as PDF" in the print window.', 'ब्राउज़र की print window में "Save as PDF" चुनें।')}</Text>}
          <Card style={{ marginTop: 8 }}>
            <Text style={s.h2}>{r.title}</Text>
            {r.rows.length ? (
              <Table columns={r.columns} rows={r.rows.slice(0, PREVIEW)} totals={Object.keys(r.totals).length ? r.totals : null}
                text={(row, c) => displayValue(cellValue(row, c, r.dateFormat), c.type, settings.currency)} />
            ) : <Empty icon="bar-chart-outline" text={L('No data for these filters', 'इन फ़िल्टर पर कोई डेटा नहीं')} />}
            {r.rows.length > PREVIEW && <Text style={s.muted}>{L(`Showing first ${PREVIEW} of ${r.rows.length} rows. Totals and exports include all.`, `${r.rows.length} में से पहली ${PREVIEW} rows। Totals और export में सब शामिल।`)}</Text>}
            {r.note ? <Text style={[s.muted, { marginTop: 8 }]}>{r.note}</Text> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
