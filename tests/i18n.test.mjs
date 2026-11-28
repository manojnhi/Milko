import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGUAGES, isLanguage, languageLabel, translate } from '../src/core/i18n.js';
import { COLS, ROWS } from '../src/core/translations.js';
import { THEMES, THEME_IDS, isTheme, resolveTheme } from '../src/core/themes.js';

test('har row me har language ka translation hai (khaali nahi)', () => {
  for (const r of ROWS) {
    assert.equal(r.length, COLS.length + 1, r[0]);
    for (const cell of r) assert.ok(typeof cell === 'string' && cell.trim().length > 0, r[0]);
  }
  assert.equal(new Set(ROWS.map((r) => r[0])).size, ROWS.length, 'duplicate English key');
});

test('language list: English + Hindi + 11 aur, sabhi ke code translation table me', () => {
  assert.equal(LANGUAGES.length, 13);
  for (const c of COLS) assert.ok(isLanguage(c), c);
  assert.ok(isLanguage('en') && isLanguage('hi') && !isLanguage('xx'));
  assert.equal(languageLabel(LANGUAGES.find((l) => l.code === 'ta')), 'Tamil · தமிழ்');
  assert.equal(languageLabel(LANGUAGES[0]), 'English');
});

test('translate: milne par text, na milne par null (App English dikhata hai)', () => {
  assert.equal(translate('ta', 'Dashboard'), 'டாஷ்போர்டு');
  assert.equal(translate('ur', 'Login'), 'لاگ ان');
  assert.equal(translate('bn', 'No such label'), null);
  assert.equal(translate('en', 'Dashboard'), null);
});

test('translation keys wahi hain jo code me L() ya navigation me use hote hain', () => {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') && files.push(`${d}/${e.name}`)));
  walk('src'); files.push('App.js');
  const code = files.filter((f) => !f.endsWith('translations.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  // nav screens ke naam App.js ke SCREENS array se aur naye UI ke labels ThemePicker/Settings se aate hain
  const extra = new Set(['Dashboard', 'Collection', 'Milkmen', 'Payments', 'Rates', 'Import', 'Settings', 'More', 'Appearance', 'Theme', 'Language', 'Choose language', 'Choose theme',
    'Light', 'Dark', 'Black', 'Green', 'Sand', 'Rose', 'Purple', 'Ocean', 'Forest', 'Auto']);
  for (const r of ROWS) {
    const k = r[0];
    const inCode = code.includes(`L('${k}'`) || code.includes(`L("${k}"`) || code.includes(`'${k}'`);
    assert.ok(inCode || extra.has(k), `unused/typo key: ${k}`);
  }
});

test('themes: 10 option (9 + auto), har palette me saare rang, text aur background me kaafi contrast', () => {
  assert.equal(THEME_IDS.length, 10);
  const need = ['primary', 'primarySoft', 'button', 'buttonText', 'chipBorder', 'accent', 'bg', 'card', 'side', 'bar', 'input', 'text', 'muted', 'danger', 'dangerSoft', 'ok', 'okSoft', 'warnSoft', 'border', 'onStrong'];
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const t of THEMES) {
    for (const k of need) assert.match(t.c[k], /^#[0-9a-f]{6}$/i, `${t.id}.${k}`);
    assert.ok(ratio(t.c.text, t.c.bg) >= 7, `${t.id} text/bg`);
    assert.ok(ratio(t.c.text, t.c.card) >= 7, `${t.id} text/card`);
    assert.ok(ratio(t.c.muted, t.c.card) >= 4.5, `${t.id} muted/card`);
    assert.ok(ratio(t.c.buttonText, t.c.button) >= 4.5, `${t.id} buttonText/button`);
    assert.ok(ratio(t.c.primary, t.c.card) >= 3, `${t.id} primary/card`);
    assert.ok(ratio(t.c.danger, t.c.dangerSoft) >= 4.5, `${t.id} danger/dangerSoft`);
    assert.ok(ratio(t.c.text, t.c.warnSoft) >= 7 && ratio(t.c.text, t.c.okSoft) >= 7 && ratio(t.c.text, t.c.dangerSoft) >= 7, `${t.id} banners`);
    assert.ok(ratio(t.c.onStrong, t.c.danger) >= 4.5 && ratio(t.c.onStrong, t.c.ok) >= 4.5, `${t.id} toast`);
    assert.ok(ratio(t.c.text, t.c.primarySoft) >= 7, `${t.id} text/primarySoft`);
  }
});

test('theme validation aur auto', () => {
  assert.ok(isTheme('dark') && isTheme('auto') && !isTheme('neon'));
  assert.equal(resolveTheme('auto', true).id, 'dark');
  assert.equal(resolveTheme('auto', false).id, 'light');
  assert.equal(resolveTheme('unknown', false).id, 'light');
  assert.equal(resolveTheme('rose', true).id, 'rose');
});
