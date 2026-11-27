# Milko – Dairy milk collection app (Expo / React Native)

Offline app (SQLite). Login, Milkmen, Rates, Milk Purchase entry, Account Report.
Default login: `admin` / `admin`.

## 1. Expo setup (PC par, ek baar)

1. Node.js LTS install karo (https://nodejs.org).
2. Project folder me terminal kholo:
   ```bash
   npm install
   npx expo install --fix     # versions Expo SDK ke hisaab se align kar deta hai
   npx expo start
   ```
3. Phone me **Expo Go** app install karo, QR scan karo (phone aur PC same WiFi par).

## 2. APK banana (EAS cloud build, Android Studio ki zaroorat nahi)

1. Free account: https://expo.dev/signup
2. Terminal me:
   ```bash
   npm install -g eas-cli
   eas login
   eas build:configure        # pehli baar, agar puche to Android select karo
   eas build -p android --profile preview
   ```
3. Build 10-20 min me complete hota hai. End me **APK download link** milta hai
   (expo.dev dashboard → Builds me bhi). APK phone me install karo
   ("Install unknown apps" allow karna padega).

`eas.json` ka `preview` profile APK banata hai. `production` profile Play Store ke liye
AAB banata hai.

## 3. Local APK (optional, Android Studio + JDK 17 ho to)

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Rate formula

`Rate/Ltr = Fat% × FatRate + SNF% × SnfRate`, `Amount = Qty × Rate`.
Rate screen me jo date <= entry date ho, uska latest rate use hota hai (milk type ke hisaab se).
Formula `src/db.js` ke `calcRate` me badal sakte ho.

## 4. YML workflows (auto APK build)

- `.github/workflows/build-apk.yml` – GitHub Actions. Project GitHub par push karo, repo
  Settings > Secrets > Actions me `EXPO_TOKEN` add karo (expo.dev > Account > Access tokens),
  phir Actions tab > "Build Android APK" > Run workflow.
- `.eas/workflows/build-apk.yml` – Expo ka apna EAS Workflow (GitHub repo expo.dev project se link ho to).

Dono se pehle ek baar local me `eas init` / `eas build:configure` chalana zaroori hai.

## 5. Windows EXE (desktop)

Expo app ko web export karke Electron me wrap kiya hai (`desktop/` folder).

**GitHub se (easy):** repo push karo > Actions > "Build Windows EXE" > Run workflow >
build ke baad **Artifacts > Milko-Windows** se `Milko Setup.exe` (installer) aur portable exe download karo.

**Apne Windows PC par:**
```bash
npm install
npx expo install --fix
npx expo export -p web
cd desktop
npm install
npm run dist          # desktop/release/ me .exe milega
npm start             # sirf test run
```
Note: ye pipeline maine yahan run nahi ki; web par `expo-sqlite` abhi alpha hai, to pehli build me
tweak lag sakta hai. Error aaye to wo bhej dena.

## 6. Mobile ↔ Desktop sync (dono taraf update)

App offline-first hai (local SQLite) aur **Supabase** (free cloud DB) ke through sync hota hai.
Mobile par entry karo to 15 sec ke andar desktop me aa jati hai, aur desktop se karo to mobile me.
Offline kaam karo, net aate hi apne-aap sync ho jata hai. Header me sync status dikhta hai (tap = abhi sync).

**Setup (ek baar):**
1. https://supabase.com par free project banao.
2. SQL Editor me `supabase.sql` ka poora content paste karke Run karo.
3. Project Settings > API se **Project URL** aur **anon public key** copy karo.
4. `src/config.js` me dono daalo.
5. **Uske baad** APK aur EXE dono build karo (dono me same config hona chahiye).

Notes:
- Conflict hone par last edit jeetta hai. Delete bhi sync hota hai.
- Login users (admin/admin) sync nahi hote, har device par local hain.
- anon key app me hoti hai, to URL+key jisko mile wo data dekh sakta hai. Personal/chhote use ke liye theek hai;
  zyada security chahiye to Supabase Auth add karna hoga.

## 7. GitHub Actions troubleshooting

- **APK workflow:** `EXPO_TOKEN` secret zaroori hai. Pehli baar Android keystore bhi banana padta hai, aur
  `--non-interactive` mode me wo nahi ban sakta. Isliye **ek baar apne PC par** ye chalao aur keystore generate hone do:
  `eas build -p android --profile preview` (sawal aaye to "Generate new keystore" = Yes). Uske baad GitHub workflow chalega.
- **EXE workflow:** `babel.config.js` hata diya hai (Expo apna default use karta hai).
