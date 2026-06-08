# Plan — Support VPN WireGuard intégré (Android)

> Statut : **planifié, non implémenté**. Plan rédigé le 2026-06-08, mis de côté pour plus tard.
> Décisions actées avec l'utilisateur ; prêt à exécuter.

## Context

L'app Android (`fr.blanquer.freeiptv`) est un wrapper WebView (app JS Tizen portée) + player ExoPlayer/media3, avec un pont JS↔natif (`AndroidBridge` exposé comme `window.Android`). Elle n'a aujourd'hui que la permission `INTERNET` et aucun support VPN.

**Besoin** : permettre à l'utilisateur de configurer et activer un **tunnel WireGuard intégré**, dont seul le trafic de cette app passe (split-tunneling per-app via `addAllowedApplication(self)`). Cas d'usage : contourner les blocages géographiques sur les flux IPTV sans affecter le reste du système.

**Décisions actées** :
- Protocole : **WireGuard** (lib officielle `com.wireguard.android:tunnel`, backend `GoBackend` userspace, sans root)
- Portée : **cette app uniquement** (`Interface.includeApplication(getPackageName())`)
- Source de config : **saisie manuelle + import fichier `.conf` + scan QR** (QR masqué si pas de caméra → cas du projecteur/TV)

**Réserves connues** :
- Devenir une « VPN app » déclenche la **review VPN du Play Store** (disclosure in-app, privacy policy, justification FGS `specialUse`) → latence de review accrue. À anticiper côté store.
- Le QR ajoute `zxing-android-embedded` (tire `androidx.appcompat` en transitif). Utile surtout sur téléphone/tablette ; sur le projecteur de test (sans caméra) le bouton sera masqué.
- Clé privée stockée en clair dans `SharedPreferences` (stockage privé app). Acceptable ; durcissement possible via `EncryptedSharedPreferences` (non retenu pour v1, à signaler).

---

## Architecture

Un **seul point d'entrée natif de parsing** : tout (manuel/fichier/QR) converge vers un texte wg-quick passé à `vpnConfigure(text)`, parsé par `Config.parse(BufferedReader)`. DRY : un seul parseur (natif), le JS ne fait qu'assembler/afficher.

```
JS (settings VPN, Android-only)
  ├─ saisie manuelle (champs) ──> JS assemble le wg-quick ──┐
  ├─ import fichier  ──(natif lit)──────────────────────────┤──> Android.vpnConfigure(text)
  └─ scan QR         ──(natif scanne)───────────────────────┘        │ parse+valide+persiste
                                                                      ▼
                                              window.onVpnEvent({state, config:{champs non-secrets}})
JS connect/disconnect ──> Android.vpnConnect()/vpnDisconnect()
```

---

## Partie 1 — Natif Android

### 1.1 `android/app/build.gradle`
- Ajouter `implementation 'com.wireguard.android:tunnel:1.0.20230706'`
- Ajouter `implementation 'com.journeyapps:zxing-android-embedded:4.3.0'` (QR)
- **Ne PAS** filtrer les ABI : garder toutes (arm pour le projecteur, **x86_64 pour Waydroid**). Le `.so` `libwg-go.so` est livré par la lib pour chaque ABI.

### 1.2 `android/app/src/main/AndroidManifest.xml`
- Permissions : `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` (API 34+, targetSdk 35), `CAMERA` + `<uses-feature camera required=false>`
- Déclarer le service de la lib (classe fournie par l'AAR, **nom exact**) :
```xml
<service
    android:name="com.wireguard.android.backend.GoBackend$VpnService"
    android:permission="android.permission.BIND_VPN_SERVICE"
    android:foregroundServiceType="specialUse"
    android:exported="false">
    <intent-filter><action android:name="android.net.VpnService"/></intent-filter>
    <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
        android:value="Per-app WireGuard tunnel for IPTV streaming"/>
</service>
```

### 1.3 Nouvelle classe `VpnManager.java` (`fr.blanquer.freeiptv`)
Responsabilités :
- Tient `GoBackend backend` (singleton, `applicationContext`), un `AppTunnel implements Tunnel` (name `"freeiptv"`, `onStateChange` → callback JS), un `ExecutorService` mono-thread (toutes les ops backend bloquantes y passent), et `SharedPreferences` (`vpn_config`).
- `configure(String wgQuickText)` : `Config.parse` (off-UI), persiste le texte normalisé (`config.toWgQuickString()`) + flag `vpnEnabled`, renvoie état + champs non-secrets via callback. Force `includeApplication(getPackageName())` et garde `AllowedIPs 0.0.0.0/0` (+ `::/0` seulement si présent).
- `connect()` / `connectAfterConsent()` : `backend.setState(tunnel, UP, config)` sur l'executor. `disconnect()` : `setState(..., DOWN, null)`.
- `queryState()` : `backend.getRunningTunnelNames()` → réconcilie l'état (process death / autre VPN).
- `importFromUri(Uri, ContentResolver)` : lit le `.conf` via SAF puis `configure`.
- `static hasCamera(Context)` : `PackageManager.FEATURE_CAMERA_ANY`.
- État courant exposé via un `volatile State` (lecture synchrone bon marché pour `vpnGetState`).

> Le `includeApplication` utilise `context.getPackageName()` au runtime (jamais hardcodé) pour éviter le bug « tunnel monté mais ne route rien » avec un suffixe de variante.

### 1.4 `MainActivity.java`
- Instancier `VpnManager` dans `onCreate` (après `setupWebView`), avec un callback qui pousse vers JS : `runOnUiThread(() -> mWebView.evaluateJavascript("window.onVpnEvent(" + json + ")", null))` (JSON construit via `org.json.JSONObject`).
- Le flow de consentement et les `startActivityForResult` vivent ici (Activity) : `VpnService.prepare(this)` → si Intent non-null `startActivityForResult(REQ_VPN_CONSENT)`, sinon connect direct.
- Ajouter `onActivityResult` (REQ_VPN_CONSENT → `connectAfterConsent`/erreur ; REQ_OPEN_DOC → `importFromUri` ; QR via `IntentIntegrator.parseActivityResult`).
- Sur `onResume` : `vpnManager.queryState()` pour réconcilier l'état affiché.
- Nouvelles méthodes `@JavascriptInterface` dans `AndroidBridge` (rappel : elles tournent sur le thread binder WebView → `runOnUiThread` pour tout ce qui touche UI/Activity) :
  - `void vpnConfigure(String wgQuickText)`
  - `void vpnConnect()` / `void vpnDisconnect()`
  - `String vpnGetState()` (snapshot synchrone "UP"/"DOWN"/"CONNECTING"/"UNKNOWN")
  - `void vpnImportFile()` (lance `ACTION_OPEN_DOCUMENT`, type `*/*`)
  - `void vpnScanQr()` (lance zxing, gardé par caméra)
  - `boolean vpnHasCamera()`

### 1.5 Lien ExoPlayer
Les sockets ExoPlayer ne survivent pas à une transition VPN : monter/descendre le VPN **hors lecture**. En pratique l'UI VPN est dans les réglages (pas en lecture), donc impact limité ; on s'appuie sur le re-prepare existant en cas d'erreur.

---

## Partie 2 — Web / JS (UI partagée Tizen+Android, section **Android-only**)

### 2.1 `index.html` — nouvelle section settings « VPN »
Miroir du pattern proxy existant (`settings-section` repliable + `settings-row`). Rangée d'activation (toggle `vpnEnabled`), indicateur d'état, puis sous-rangées (visibles si activé) :
- Champs manuels (`settings-input` focusables) : Adresse, Clé privée, DNS, Endpoint, Clé publique du peer, AllowedIPs, Preshared key (option.), Keepalive (option.)
- Action **Importer un fichier** (`settings-action` → `Android.vpnImportFile()`)
- Action **Scanner un QR** (`settings-action`, masquée si `!Android.vpnHasCamera()`)
- Action **Connecter / Déconnecter** (toggle selon état)
La section entière est masquée hors Android (`typeof Android !== 'undefined' && Android`).

### 2.2 `js/settings.js`
- `handleSettingsSelect` : router les nouvelles actions/inputs. Saisie manuelle → assembler le texte wg-quick (concat trivial) → `Android.vpnConfigure(text)`.
- Fonction de visibilité `updateVpnVisibility()` (sur le modèle de `updateProxyUrlVisibility`, ligne ~117) + `invalidateFocusables()`.
- Afficher la section uniquement sur Android + masquer le bouton QR si pas de caméra (au rendu de la section).
- Définir le handler global `window.onVpnEvent(payload)` (met à jour l'indicateur d'état + pré-remplit les champs non-secrets après import/QR).

### 2.3 `js/storage.js`
- Valeurs par défaut dans `loadSettings()` : `vpnEnabled:false`, `vpnAddress:''`, `vpnPrivateKey:''`, `vpnDns:''`, `vpnEndpoint:''`, `vpnPeerPublicKey:''`, `vpnAllowedIps:'0.0.0.0/0, ::/0'`, `vpnPresharedKey:''`, `vpnKeepalive:''`. (Secrets en `localStorage` côté JS pour ré-affichage ; le natif reste la source de vérité pour la reconnexion.)

### 2.4 `js/core/focus.js`
- Les nouveaux `.focusable` de la section settings active sont déjà captés par le sélecteur générique (`#settings-container .settings-section.active-section .focusable...`). Vérifier la navigation 2D (haut/bas/gauche-retour menu) dans les 4 directions une fois rendu. Ajouter « VPN » dans `SETTINGS_MENU_ORDER` (settings.js ~760) au bon rang.

### 2.5 `locales/*.json` (11 langues : en, fr, de, es, it, pt, nl, pl, ru, ar, tr)
- Ajouter toutes les clés (titre section, labels champs, actions, états « Connecté/Déconnecté/Connexion… », erreurs).
- FR : espace insécable avant `: ; ! ?`.
- Rebuild : `node scripts/build-i18n.js`.

---

## Fichiers touchés (récap)
- **Natif** : `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `MainActivity.java` (modif), **`VpnManager.java`** (nouveau)
- **Web** : `index.html`, `js/settings.js`, `js/storage.js`, `js/core/focus.js`
- **i18n** : `locales/*.json` (×11) + rebuild
- **Doc** : `README.md` (nouvelle feature + note Play Store)

---

## Vérification (bout en bout)
1. **Build** : `cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew assembleDebug` — vérifier que `libwg-go.so` est packagé (toutes ABI, dont x86_64 pour Waydroid).
2. **Install + run** sur cible (projecteur Android `HYTY22511211696` et/ou Waydroid) selon flux CLAUDE.md.
3. **Config** : importer un `.conf` WireGuard de test (ou saisie manuelle). Vérifier le dialogue de consentement système VPN au 1er `Connecter`.
4. **Tunnel UP** : confirmer le handshake (état « Connecté » poussé via `onVpnEvent`). Vérifier que l'**IP publique vue par l'app** change (ex. charger un flux/echo d'IP dans la WebView) et que le reste du système n'est PAS tunnelé (per-app).
5. **Robustesse** : couper/réactiver, quitter/relancer l'app (réconciliation via `queryState` sur `onResume`), refuser le consentement (message d'erreur propre), pas de caméra → bouton QR absent.
6. **Navigation TV** : flèches dans les 4 directions sur toute la section VPN.
7. **À tester sur device API 34/35** : comportement FGS `specialUse` (pas de crash au démarrage du service) et DNS per-app sur la ROM cible.

> Un serveur WireGuard de test est nécessaire pour la validation réelle du tunnel (la VM `192.168.1.251` peut en héberger un — à confirmer).

---

## Détail d'implémentation natif (référence)

API `com.wireguard.android:tunnel` (validée pour `1.0.20230706`) :
- Backend : `GoBackend(appContext)` (userspace, sans root ; `WgQuickBackend` exige root → écarté).
- `Config.parse(BufferedReader)` lève `BadConfigException`/`IOException`.
- Build programmatique : `Interface.Builder().setKeyPair(new KeyPair(Key.fromBase64(priv))).parseAddresses(...).parseDnsServers(...).includeApplication(pkg).build()` + `Peer.Builder().parsePublicKey(...).parseEndpoint(...).parseAllowedIPs(...).parsePreSharedKey(...).parsePersistentKeepalive(...)`.
- Mandatoires : Interface PrivateKey + Address ; Peer PublicKey + Endpoint + AllowedIPs. Optionnels : DNS, MTU, PresharedKey, Keepalive.
- `backend.setState(tunnel, State.UP/DOWN, config)` **bloquant** → executor mono-thread obligatoire. `backend.getRunningTunnelNames()` pour l'état.
- Consentement : `VpnService.prepare(activity)` → Intent non-null = `startActivityForResult` ; `onActivityResult` RESULT_OK → UP. Fonctionne en `Activity` simple (pas besoin d'AppCompat).
- Tunnel name : 1–15 chars `[a-zA-Z0-9_=+.-]`.

Pièges (Murphy) :
- Consentement révocable / un seul VPN actif à la fois → toujours re-`prepare` avant UP, surveiller `onStateChange` DOWN.
- Service tué sous pression mémoire → réconcilier l'état sur `onResume`.
- DNS per-app capricieux selon ROM ; IPv6 `::/0` seulement si le serveur le supporte (sinon blackhole) ; MTU 1280 en secours si stalls.
- Nom de service manifest **exact** `com.wireguard.android.backend.GoBackend$VpnService`.
- targetSdk 35 : FGS `specialUse` requis sinon crash au démarrage du service sur Android 14/15.
- Si R8 activé un jour : `-keep class com.wireguard.** { *; }` (minify OFF actuellement).
