/**
 * Rang themes. Har theme me dark flag aur poora palette. 'auto' phone ki setting follow karta hai.
 * name = [English key (translations.js me), Hindi].
 */
const light = (o) => ({ dark: false, onStrong: '#ffffff', input: '#ffffff', ...o });
const dark = (o) => ({ dark: true, onStrong: '#0b1020', ...o });

export const THEMES = [
  { id: 'light', name: ['Light', 'हल्का'], c: light({
    primary: '#2f5bd3', primarySoft: '#e8eefc', button: '#cddcfb', buttonText: '#173a8f', chipBorder: '#9db8f3', accent: '#b45309', bg: '#f4f7fd', card: '#ffffff', side: '#ffffff', bar: '#ffffff',
    text: '#1d2433', muted: '#525d75', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9', warnSoft: '#fff4dc', border: '#d6deee' }) },
  { id: 'dark', name: ['Dark', 'गहरा'], c: dark({
    primary: '#8aaaff', primarySoft: '#1f2c4d', button: '#2b4a9c', buttonText: '#e8efff', chipBorder: '#4a6bd0', accent: '#f0a35e', bg: '#0f1524', card: '#182033', side: '#131b2d', bar: '#131b2d', input: '#101827',
    text: '#e6ebf7', muted: '#a3adc4', danger: '#ff8a80', dangerSoft: '#3a1f22', ok: '#6fd08c', okSoft: '#16301f', warnSoft: '#3a3016', border: '#2a3552' }) },
  { id: 'amoled', name: ['Black', 'काला'], c: dark({
    primary: '#8ab4ff', primarySoft: '#14213d', button: '#1f3d8a', buttonText: '#eaf1ff', chipBorder: '#3f63c4', accent: '#f0a35e', bg: '#000000', card: '#0c0c0f', side: '#000000', bar: '#000000', input: '#050507',
    text: '#f2f2f2', muted: '#a0a0a8', danger: '#ff8a80', dangerSoft: '#2e1517', ok: '#6fd08c', okSoft: '#10261a', warnSoft: '#2e2710', border: '#24242c' }) },
  { id: 'green', name: ['Green', 'हरा'], c: light({
    primary: '#2e7d32', primarySoft: '#e3f2e4', button: '#c8e6c9', buttonText: '#1b5e20', chipBorder: '#8fc793', accent: '#b45309', bg: '#f1f8f1', card: '#ffffff', side: '#ffffff', bar: '#ffffff',
    text: '#1b2a1c', muted: '#4f6350', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9', warnSoft: '#fff4dc', border: '#cfe3d0' }) },
  { id: 'sand', name: ['Sand', 'रेत'], c: light({
    primary: '#b45309', primarySoft: '#f8ead6', button: '#f3d9b1', buttonText: '#6e3305', chipBorder: '#dcb67a', accent: '#2f5bd3', bg: '#faf5ec', card: '#fffdf8', side: '#fffdf8', bar: '#fffdf8', input: '#fffdf8',
    text: '#2d2418', muted: '#6b5b45', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9', warnSoft: '#fdf0cf', border: '#e8dcc6' }) },
  { id: 'rose', name: ['Rose', 'गुलाबी'], c: light({
    primary: '#c2185b', primarySoft: '#fde4ec', button: '#f8c9d9', buttonText: '#7d0d3a', chipBorder: '#ec9bb8', accent: '#b45309', bg: '#fdf2f5', card: '#ffffff', side: '#ffffff', bar: '#ffffff',
    text: '#2b1820', muted: '#6c4a57', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9', warnSoft: '#fff4dc', border: '#f0d3dd' }) },
  { id: 'purple', name: ['Purple', 'जामुनी'], c: light({
    primary: '#6d3fd0', primarySoft: '#ece6fa', button: '#dcd0f7', buttonText: '#40208f', chipBorder: '#b49ae9', accent: '#b45309', bg: '#f5f2fc', card: '#ffffff', side: '#ffffff', bar: '#ffffff',
    text: '#221a33', muted: '#5d5275', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9', warnSoft: '#fff4dc', border: '#dcd4ee' }) },
  { id: 'ocean', name: ['Ocean', 'समुद्री'], c: light({
    primary: '#00798c', primarySoft: '#dff1f4', button: '#bfe6ec', buttonText: '#004e5b', chipBorder: '#86c9d4', accent: '#b45309', bg: '#eef8fa', card: '#ffffff', side: '#ffffff', bar: '#ffffff',
    text: '#102a30', muted: '#47636a', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9', warnSoft: '#fff4dc', border: '#c8e3e8' }) },
  { id: 'forest', name: ['Forest', 'जंगल'], c: dark({
    primary: '#6fd08c', primarySoft: '#1b3427', button: '#25603b', buttonText: '#e6f7ec', chipBorder: '#3f9a5e', accent: '#f0a35e', bg: '#0e1a14', card: '#16261d', side: '#122019', bar: '#122019', input: '#0f1b15',
    text: '#e3f1e7', muted: '#9db5a5', danger: '#ff8a80', dangerSoft: '#3a1f22', ok: '#7fe09c', okSoft: '#17301f', warnSoft: '#3a3016', border: '#25382c' }) },
];
// 'auto': phone dark ho to 'dark', warna 'light'.
export const AUTO = { id: 'auto', name: ['Auto', 'ऑटो'] };
export const THEME_IDS = [...THEMES.map((t) => t.id), AUTO.id];
export const isTheme = (id) => THEME_IDS.includes(id);
export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
/** settings.theme + phone ka dark/light -> asli palette. */
export const resolveTheme = (id, systemDark) => themeOf(id === 'auto' ? (systemDark ? 'dark' : 'light') : id);
