# Project Instructions

## CSS Rules
- Never use `gap` property (not supported on Tizen 5.0) - use `margin` instead
- **Never use `font-size` in component CSS files** - all font sizes must be defined in `css/base.css` under the `text-small`, `text-medium`, `text-large` classes to respect the user's text size setting

## JavaScript Rules
- Never use `console.log` - use `window.log()` function instead (sends to remote debug server)

## Localization
- **Always translate ALL 11 languages** when adding/modifying keys: en, fr, de, es, it, pt, nl, pl, ru, ar, tr
- After modifying translation keys in `locales/*.json`, rebuild with: `node scripts/build-i18n.js`
- For French: use non-breaking space (`\u00A0` or ` `) before double punctuation (`: ; ! ?`)
- In JS code, use `I18n.getLocale() === 'fr' ? '\u00A0: ' : ': '` when concatenating with `:`

## Bug Fixes
- For every bug reported, create a test to prevent regression before fixing the bug
- Debug logs available at: https://iptv.blanquer.org/debug.log?t={timestamp} (use timestamp to bypass cache)

## Server-side Code
- PHP scripts for the website must be placed in `www/`
- Deployed to: https://iptv.blanquer.org/
- FTP host: `ftp://ftp.webmo.fr/www/iptv/` (user: `dpteam`)
- FTP password stored in KDE Wallet: `kwallet-query -r "ftp-ftp.webmo.fr:-1" kdewallet`
- Deploy a file: `curl -s -u "dpteam:$(kwallet-query -r 'ftp-ftp.webmo.fr:-1' kdewallet 2>/dev/null | grep password | cut -d'"' -f4)" -T <local_file> ftp://ftp.webmo.fr/www/iptv/<remote_file>`
- **Cloudflare Worker** (`iptv-config`): Account ID `c6c28855b1b04d0333f8bee06908e911`, API Token `cfut_FUIrUuzm1xz7qwrc0dpxDWzxJk9zIPRHwlj0iOl8cc8912be`
- Deploy worker: `curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/c6c28855b1b04d0333f8bee06908e911/workers/scripts/iptv-config" -H "Authorization: Bearer cfut_FUIrUuzm1xz7qwrc0dpxDWzxJk9zIPRHwlj0iOl8cc8912be" -F "worker=@cloudflare-worker/worker.js;type=application/javascript+module" -F 'metadata={"main_module":"worker.js","keep_bindings":["kv_namespace","secret_text"]};type=application/json'`

## Proxy Server (VM)
- SSH access: `ssh freebox@192.168.1.251`
- Server code is in `server/` directory:
  - `stream-proxy.py` - IPTV stream proxy
  - `tts_handler.py` - Text-to-speech service (Edge-TTS)
  - `stream-proxy.service` - systemd service file

## Tizen Studio Issues

### "Could not launch - application is currently in launch"
This error occurs when Tizen Studio thinks the app is launching but it's stuck. Fix:
```bash
rm -rf ~/workspace-tizen/.metadata/.plugins/org.eclipse.debug.core/.launches/*
rm -rf ~/workspace-tizen/.metadata/.plugins/org.tizen.web.launch/*
```
Then restart Tizen Studio completely.

### NullPointerException during build
Caused by `.wgt` files in the project directory. Fix:
```bash
rm -f ~/free-iptv-app/*.wgt
rm -rf ~/free-iptv-app/.buildResult
```

## CLI Deployment (without Tizen Studio IDE)

### Deployment Rules
- **"build et install" (or just code changes)** = build Tizen + install on TV + deploy Android web assets (all 3 steps automatically)
- Android web auto-update: `scripts/deploy-android-web.sh` uploads web assets to iptv.blanquer.org/android/ — Android devices update automatically on next launch
- Only rebuild Android APK (`gradlew assembleDebug`) when Java code changes

Build, sign, install and run the app from command line:

```bash
# 1. Build (dev - includes config.local.js with dev credentials)
~/tizen-studio/tools/ide/bin/tizen build-web -e "android/*" -e "node_modules/*" -e "server/*" -e "tests/*" -e "scripts/*" -e "cloudflare-worker/*" -e "seller-office/*" -e "www/*" -e "CLAUDE.md" -e "README.md" -e "PRIVACY_POLICY.md" -e "package.json" -e "package-lock.json" -e ".git/*" -- /home/eric/free-iptv-app

# 1b. Build PROD (for Samsung Store - excludes config.local.js, tizen-manifest.xml, locales, .gitignore, icon-512)
# ~/tizen-studio/tools/ide/bin/tizen build-web -e "android/*" -e "node_modules/*" -e "server/*" -e "tests/*" -e "scripts/*" -e "cloudflare-worker/*" -e "seller-office/*" -e "www/*" -e "CLAUDE.md" -e "README.md" -e "PRIVACY_POLICY.md" -e "package.json" -e "package-lock.json" -e "js/config.local.js" -e "tizen-manifest.xml" -e ".git/*" -e ".gitignore" -e ".tizen-package-exclude" -e "locales/*" -- /home/eric/free-iptv-app
# Then remove icon-512.png duplicate before packaging:
# rm /home/eric/free-iptv-app/.buildResult/images/icon-512.png

# 2. Package with signing profile "Blanquer"
~/tizen-studio/tools/ide/bin/tizen package -t wgt -s Blanquer -- /home/eric/free-iptv-app/.buildResult

# 3. Connect to TV
~/tizen-studio/tools/sdb connect 192.168.1.241

# 4. Uninstall previous version (optional)
~/tizen-studio/tools/ide/bin/tizen uninstall -p FreeIPTVAp.SamsungIPTV -s 192.168.1.241:26101

# 5. Install (copy to avoid space issues in filename)
cp "/home/eric/free-iptv-app/.buildResult/Free IPTV.wgt" /tmp/FreeIPTV.wgt
~/tizen-studio/tools/ide/bin/tizen install -n /tmp/FreeIPTV.wgt -s 192.168.1.241:26101

# 6. Run
~/tizen-studio/tools/ide/bin/tizen run -p FreeIPTVAp.SamsungIPTV -s 192.168.1.241:26101

# 7. Clean up build artifacts
rm -rf /home/eric/free-iptv-app/.buildResult

# 8. Build Android APK
cd /home/eric/free-iptv-app/android && ./gradlew assembleDebug

# 9. Stop previous Waydroid session and Weston if running
waydroid session stop 2>/dev/null; pkill -f "weston --socket=waydroid-weston" 2>/dev/null; sleep 2
rm -f /run/user/1000/waydroid-weston.lock 2>/dev/null

# 10. Launch Weston (Wayland compositor needed by Waydroid in X11)
DISPLAY=:0 weston --socket=waydroid-weston &
sleep 3

# 11. Start Waydroid emulator
WAYLAND_DISPLAY=waydroid-weston waydroid show-full-ui &
sleep 15

# 12. Install and launch Android app
waydroid app install /home/eric/free-iptv-app/android/app/build/outputs/apk/debug/app-debug.apk
waydroid app launch fr.blanquer.freeiptv
```

**Important:** The signing profile must be "Blanquer" (not "freesamsungtv"). Certificates are in `~/SamsungCertificate/Blanquer/`.
