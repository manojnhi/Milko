import { COLS, ROWS } from './translations.js';

/** Settings me 'language' ki value yahi code hoti hai. Picker me "English name · native name" dono dikhte hain. */
export const LANGUAGES = [
  { code: 'en', en: 'English', native: 'English' },
  { code: 'hi', en: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', en: 'Bengali', native: 'বাংলা' },
  { code: 'mr', en: 'Marathi', native: 'मराठी' },
  { code: 'gu', en: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa', en: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ta', en: 'Tamil', native: 'தமிழ்' },
  { code: 'te', en: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', en: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', en: 'Malayalam', native: 'മലയാളം' },
  { code: 'or', en: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ur', en: 'Urdu', native: 'اردو' },
  { code: 'as', en: 'Assamese', native: 'অসমীয়া' },
];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const isLanguage = (code) => LANGUAGE_CODES.includes(code);
export const languageOf = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
/** "Tamil · தமிழ்" (English ke liye sirf "English"). */
export const languageLabel = (l) => (l.code === 'en' ? 'English' : `${l.en} · ${l.native}`);

const TABLE = {};
COLS.forEach((code, i) => { TABLE[code] = new Map(ROWS.map((r) => [r[0], r[i + 1]])); });

/** Translation table me nahi hai to null (tab app English dikhata hai). Hindi code me hi inline hai. */
export const translate = (code, english) => TABLE[code]?.get(english) ?? null;
