# Milko – Dairy milk collection & accounting (Expo / React Native)

Offline-first app (local SQLite). Android, web aur Windows desktop (Electron).
Dashboard, Milkmen (photo), Collection, Rates, Payments, Reports (PDF/Print/CSV/Excel), Import wizard, Settings, Backup/Restore.

## 0. Update karne se PEHLE (purana data hai to)

- **Android:** purana app **uninstall mat karo**. Naya APK upar se install karo (same package `com.milko.app` aur same
  signing key / same EAS account zaroori). Uninstall = data delete.
- Pehli baar kholne par database apne-aap v2 me upgrade hota hai. Upgrade ke turant baad **Settings > Create backup file**.
- Purane (1.0) app par wapas **downgrade mat karo**: passwords ab hash hote hain aur delete soft-delete hai.
- **Windows desktop:** purane EXE me har launch par naya port tha, isliye har baar khaali database khulta tha.
  Purane sessions ka data naye app me apne-aap nahi aayega. Purana `%APPDATA%` folder delete na karo.
  Naye version me port fixed (47831) hai.

### Migration kya badalta hai
Sirf naye columns/tables jodta hai; koi purana row delete/rename nahi. Do data changes:
1. Passwords hash hote hain (password wahi rehta hai; `admin` ho to badalna padta hai).
2. Purani entries ka `milk_type` milkman ke **maujooda** type se bhara jata hai (pehle store nahi hota tha).

Purani dikkatein jo apne-aap theek **nahi** ki jati:
- `today()` pehle UTC date deta tha, isliye subah 5:30 se pehle ki entries pichhli date par ho sakti hain. Jaanch lein.
- Payments pehle record nahi hote the, isliye saari purani khareed "bakaya" dikhegi. Jo chuka diya hai, uske liye
  Payments me **Adjustment** (negative amount + note) ya asli payments daalein.

## 1. Setup aur run

Node.js 22.13+ (tests ke liye; build ke liye Node 20 bhi chalta hai).

```bash
npm install
npx expo install --fix    # versions ko Expo SDK 54 se align karta hai
npx expo-doctor           # config/dependency check
npm test                  # core logic + migration tests
npx expo start            # phone: Expo Go se QR scan
npx expo start --web      # browser
```

Pehli baar (naya install) app owner username/password banane ko kehta hai. Koi default login nahi.
Password bhool gaye to recovery nahi hai.

## 2. Android APK

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview      # APK
eas build -p android --profile production   # Play Store AAB
```
Local build (Android Studio + JDK 17): `npx expo prebuild -p android && cd android && ./gradlew assembleRelease`

GitHub Actions: `.github/workflows/build-apk.yml` (secret `EXPO_TOKEN`). Pehli keystore ek baar local `eas build` se banayein.

## 3. Web

```bash
npx expo export -p web     # dist/
```
Hosting par ye headers zaroori hain (SQLite wasm ke liye), aur HTTPS (ya localhost):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Data usi browser aur usi address me rehta hai. Browser data clear karne se data chala jata hai: regular backup lein.
Ek hi tab me kholein.

## 4. Windows desktop

```bash
npm install
npx expo export -p web
cd desktop
npm install
npm start          # test run
npm run dist       # desktop/release/ me installer + portable exe (Windows par)
```
Ya GitHub Actions: "Build Windows EXE".

## 5. Platform behaviour

| Kaam | Android | Browser | Desktop |
|---|---|---|---|
| PDF | file banti hai, share sheet se save/bhejein | print dialog > "Save as PDF" | Save dialog se seedha PDF |
| Print | system print | browser print | system print dialog |
| CSV / Excel / backup | share sheet (Files, Drive, WhatsApp) | download | download/save |
| Photo | camera ya gallery | file chooser | file chooser (camera nahi) |

## 6. Rate formula

Rate screen se har rate ke liye chunein:
- `Fat + SNF`: Fat% × FatRate + SNF% × SnfRate (purana formula, default)
- `Fat only`: Fat% × FatRate
- `Fixed`: tay ₹/unit

Entry date ke din ya usse pehle ka latest rate lagta hai. Milkman ka "Fixed rate" bhara ho to wahi lagta hai.
Amount = Quantity × Rate (2 decimal). Edit me agar date, milkman, type, fat, SNF nahi badle to purana rate rehta hai.

### Milkman ka apna price (v2.1)
Milkmen > Edit > Rate Type > **Own Price (Fat/SNF)**:
`Rate = Price × (FatShare × Fat/StdFat + (100 − FatShare) × SNF/StdSNF) / 100`
Default Std Fat 6.5, Std SNF 9, Fat Share 52 (purane Access database jaisa). "Rate Goes Up And Down" ya
"Only Goes Down" (purana system) chunein. Price tareekh ke saath history me rehta hai.

Priority: Fixed rate / Own price (jo chuna ho), warna common Rates screen.

### Litre aur Magha
`Magha = Litre / 1.176` (Settings me badal sakte hain). Entry Litre ya Magha me likh sakte hain; database me dono save hote
hain. Payment unit milkman par set hota hai: amount = us unit ki quantity × rate. "Show Quantity In" (Litre / Magha / Both)
Settings aur Reports me hai. Amount 2 decimal tak rehta hai (purana Access report poore rupaye me round karta tha).

Database version 3: sirf naye columns aur `Milkman_rate` table judte hain.

### Rounding (v2.2)
Settings > Amount Rounding: **Keep Paise** (default) ya **Round To Rupees** (50 paise se upar agla rupaya).
Har entry ka amount round hota hai; rate 2 decimal hi rehta hai. Pehle se save entries aur payments nahi badalte.

## 7. Accounting

Balance = Opening + Purchase − Payment − Advance + Adjustment. Positive = dairy ko dena hai.
Entry delete aur payment cancel soft-delete hain (reason ke saath, Settings > Audit log).

## 8. Import

Types: milkmen, rates, purchases. `.csv` (UTF-8) aur `.xlsx`; `.xls` nahi. Max 10 MB / 20,000 rows.
Templates aur expected columns Import screen par hain. Order: milkmen → rates → purchases.
Import ek transaction hai: beech me error aaya to kuch bhi save nahi hota.

## 9. Security aur limitations

- Login sirf app lock hai (PBKDF2 hash). Database file aur backup **encrypted nahi** hain.
- Multi-user roles nahi hain.
- **Cloud sync nahi hai.** Purane README me Supabase sync likha tha, par code project me nahi tha
  (`supabase.sql`, `src/config.js` gayab). Devices ke beech data backup/restore se le jaayein (merge nahi, replace hota hai).
- Milk unit (L / Kg) pehli entry ke baad lock ho jata hai; quantity convert nahi hoti.
- Language: English, हिन्दी aur 11 Indian languages (neeche section 10). Milk type names, CSV headers aur kuch lambe messages English me hi rehte hain.

## 10. Theme, font aur language (v2.3)

- **Background photo hata di gayi.** Ab har screen ka rang theme se aata hai (`assets/farm-bg.jpg` delete).
- **Theme:** Settings > Appearance me 10 options: Light, Dark, Black (AMOLED), Green, Sand, Rose, Purple, Ocean,
  Forest (dark green) aur Auto (phone ki dark/light setting). Chunte hi lagu hota hai aur save ho jata hai.
  Naya theme jodna ho to `src/core/themes.js` me ek entry badhayein.
- **Font:** Poppins-Bold hata diya; bold jagah ab Poppins-Medium (halka bold). Print/PDF me bhi 600 weight.
- **Language:** Login screen aur Settings > Appearance me language picker. Har row me English naam + apni lipi dono
  dikhte hain (jaise "Tamil · தமிழ்"). English, Hindi, Bengali, Marathi, Gujarati, Punjabi, Tamil, Telugu, Kannada,
  Malayalam, Odia, Urdu, Assamese.
  Hindi code me inline hai (`L('English', 'हिन्दी')`). Baaki bhasha `src/core/translations.js` se aati hai
  (~165 mukhya labels/buttons/headings). Jo text table me nahi hai wo English me dikhta hai.
  Naya label jodne ke liye `translations.js` ki row ka English text code ke `L('...')` se bilkul same rakhein.
- Tests: `npm test` (i18n/theme tests me har theme ka text-contrast bhi check hota hai).

## Code layout

- `src/core/` – pure logic (migrations, accounting, import, reports, backup, xlsx/csv). Tests: `tests/`.
- `src/platform/` – file/print/photo (`files.js` Android, `files.web.js` web+desktop).
- `src/screens/`, `src/ui.js`, `App.js` – UI.
- Naya schema change: `src/core/migrations.js` me naya step jodein aur `SCHEMA_VERSION` badhayein; purane steps na badlein.
