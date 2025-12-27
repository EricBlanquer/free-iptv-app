# Free IPTV

IPTV player application for Samsung Tizen TV.

## Features

### Content
- **Multi-playlists**: Server API and M3U support with dynamic categories
- **Live TV**: Live channels with EPG (Electronic Program Guide)
- **TV Guide**: Full program grid with channel navigation
- **Replay/Catchup**: Watch past programs (when supported by provider)
- **VOD**: Movies and videos
- **Series**: Seasons and episodes navigation with progress tracking and new episode indicators
- **Manga**: Manga movies and series
- **Special categories**: Sports, concerts, theater, shows, blind test, karaoke
- **Custom categories**: Create your own sections with keyword filtering, custom icons, and mixed movies/series support

### Player
- Native AVPlay player (Samsung optimized)
- Optional HTML5 player
- Playback speed control (×1, ×2, ×4, ×8)
- Display modes (auto, letterbox, stretch, zoom)
- Audio track selector
- Subtitle selector (embedded + external)
- Dialogue boost (audio enhancement, HTML5 only)

### Metadata
- **TMDB**: Posters, descriptions, cast with filmography, ratings
- **OpenSubtitles**: External subtitles
- **SubDL**: Alternative subtitles source

### User Experience
- Full TV remote navigation
- Grid/list view mode (persistent per section)
- Sort options (A-Z, rating, date)
- Filters (hide SD, hide hearing impaired)
- VOD language filter
- "Continue" category (resume playback)
- Watch history (configurable max items)
- Favorites/bookmarks with real-time grid indicator
- Search by title/year
- Remote configuration via QR code
- 11 interface languages (FR, EN, ES, DE, IT, PT, AR, TR, NL, PL, RU)

## Installation on Samsung TV

### Development mode
1. Install [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download)
2. Enable Developer Mode on your TV (Apps > type "12345" > Developer Mode ON > enter PC IP)
3. Connect to your TV:
   ```bash
   ~/tizen-studio/tools/sdb connect <TV_IP>:26101
   ```
4. Build and deploy the `.wgt` package from Tizen Studio

### From Samsung TV App Store
*Coming soon*

## Configuration

### From the TV
1. Go to **Settings**
2. Click **Manage playlists**
3. Add a playlist (Server or M3U)

### From phone/computer (Remote Configuration)
1. On the TV, go to **Settings**
2. Scan the QR code or visit the displayed URL
3. Configure playlists on the web page
4. Click **Generate code for TV**
5. Enter the code on TV and click **Import**

**Remote configuration page**: https://iptv.blanquer.org

## Optional API Keys

These APIs are **optional**. The application works without them, but they enhance the experience with metadata, posters, and subtitles. Configure them in Settings if desired:

| API | Purpose | Get key at |
|-----|---------|------------|
| TMDB | Movie/TV metadata, posters | https://www.themoviedb.org/settings/api |
| OpenSubtitles | Subtitles | https://www.opensubtitles.com/consumers |
| SubDL | Subtitles (alternative) | https://subdl.com |

## Development

### Requirements
- Node.js 18+
- Tizen Studio (for TV deployment)

### Running tests
```bash
npm install
npm test
npm test:coverage
```

### Building i18n
After modifying translation files in `locales/*.json`:
```bash
npm run build:i18n
```
This regenerates `js/i18n.js` with embedded translations.

### Project structure
```
free-iptv-app/
├── js/
│   ├── app.js          # Main application logic
│   ├── provider.js       # IPTV provider API client
│   ├── player.js       # Samsung AVPlay wrapper
│   ├── i18n.js         # Internationalization (auto-generated)
│   ├── tmdb.js         # TMDB API client
│   ├── opensubtitles.js
│   └── subdl.js
├── locales/            # Translation files (*.json)
├── scripts/            # Build scripts
├── css/style.css       # Styles
├── index.html          # Main UI
├── config.html         # Remote configuration page
├── tests/              # Jest tests
└── cloudflare-worker/  # Remote config backend
```

## Legal

### Disclaimer

**This application does not provide any content.** Users are solely responsible for the sources they configure and must ensure they have the legal right to access such content. The developer assumes no responsibility for how this application is used.

### Privacy Policy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md)

## Author

Eric Blanquer - eric.blanquer@gmail.com

## License

MIT License
