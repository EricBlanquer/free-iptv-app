/**
 * Regression test for: launching a series episode from a Jellyfin playlist
 * crashed because JellyfinAPI did not expose getSeriesStreamUrl / getVodStreamUrl
 * / getLiveStreamUrl, which playback._doPlayStream calls when the stream
 * object has no pre-baked `url` field.
 *
 * Code path:
 *   1. User opens a Jellyfin series in details → loadSeriesInfo() populates
 *      currentSeriesInfo. Each episode object carries a `url` produced by
 *      JellyfinAPI._streamUrl(ep.Id, ep.Container).
 *   2. User clicks an episode → details.playEpisode() rebuilds a fresh
 *      `stream` object from the DOM data-attributes (id, num, title,
 *      containerExtension) and does NOT copy the `url` from
 *      currentSeriesInfo.
 *   3. playback._doPlayStream sees no `stream.url` and falls into the
 *      `case 'episode': url = apiToUse.getSeriesStreamUrl(...)` branch.
 *   4. apiToUse is the JellyfinAPI instance for the active Jellyfin
 *      playlist → `getSeriesStreamUrl is not a function` → playback
 *      aborts before the player ever loads.
 *
 * Fix: JellyfinAPI implements getSeriesStreamUrl / getVodStreamUrl /
 *      getLiveStreamUrl as thin wrappers over the existing _streamUrl
 *      helper so it is a real drop-in replacement for ProviderAPI as
 *      promised by the class docstring.
 */

const fs = require('fs');
const vm = require('vm');

global.window = global.window || {};
global.window.log = () => {};

const jellyfinSrc = fs.readFileSync('./js/jellyfin.js', 'utf8');
const ctx = { window: global.window, console };
vm.createContext(ctx);
vm.runInContext(jellyfinSrc + '\nthis.JellyfinAPI = JellyfinAPI;', ctx);
const JellyfinAPI = ctx.JellyfinAPI;

describe('JellyfinAPI implements ProviderAPI URL helpers (drop-in contract)', () => {
    let api;

    beforeEach(() => {
        api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
    });

    it('exposes getSeriesStreamUrl as a function', () => {
        expect(typeof api.getSeriesStreamUrl).toBe('function');
    });

    it('exposes getVodStreamUrl as a function', () => {
        expect(typeof api.getVodStreamUrl).toBe('function');
    });

    it('exposes getLiveStreamUrl as a function', () => {
        expect(typeof api.getLiveStreamUrl).toBe('function');
    });

    it('getSeriesStreamUrl returns a /Videos/{id}/stream URL with token', () => {
        const url = api.getSeriesStreamUrl('ep123', 'mkv');
        expect(url).toContain('/Videos/ep123/stream.mkv?');
        expect(url).toContain('api_key=tok');
        expect(url).toContain('MediaSourceId=ep123');
    });

    it('getVodStreamUrl returns a /Videos/{id}/stream URL with token', () => {
        const url = api.getVodStreamUrl('vod456', 'mp4');
        expect(url).toContain('/Videos/vod456/stream.mp4?');
        expect(url).toContain('api_key=tok');
        expect(url).toContain('MediaSourceId=vod456');
    });

    it('getSeriesStreamUrl strips the FFmpeg multi-format probe string', () => {
        // Same defensive behaviour as _streamUrl: the comma-separated FFmpeg
        // probe must not leak into the URL extension or the Tizen player
        // chokes. Pin it here so a refactor on getSeriesStreamUrl alone
        // cannot regress this.
        const url = api.getSeriesStreamUrl('ep1', 'mov,mp4,m4a,3gp,3g2,mj2');
        expect(url).toContain('/Videos/ep1/stream?');
        expect(url).not.toContain('mov,mp4');
    });

    it('getSeriesStreamUrl matches _streamUrl output (single source of truth)', () => {
        // Both must produce the same URL — getSeriesStreamUrl is a thin
        // wrapper around _streamUrl, not a re-implementation. This
        // guards against the two diverging on future container handling.
        expect(api.getSeriesStreamUrl('id', 'mkv')).toBe(api._streamUrl('id', 'mkv'));
        expect(api.getVodStreamUrl('id', 'mp4')).toBe(api._streamUrl('id', 'mp4'));
    });
});

describe('playback._doPlayStream dispatch matches JellyfinAPI surface', () => {
    // Pin the contract: every case in _doPlayStream that calls a get*StreamUrl
    // method must correspond to a real method on JellyfinAPI. This is what
    // makes JellyfinAPI a valid drop-in for ProviderAPI in playback.js.
    const playbackSrc = fs.readFileSync('./js/playback.js', 'utf8');

    it('playback.js calls getSeriesStreamUrl and JellyfinAPI defines it', () => {
        expect(playbackSrc).toMatch(/apiToUse\.getSeriesStreamUrl\(/);
        const api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
        expect(typeof api.getSeriesStreamUrl).toBe('function');
    });

    it('playback.js calls getVodStreamUrl and JellyfinAPI defines it', () => {
        expect(playbackSrc).toMatch(/apiToUse\.getVodStreamUrl\(/);
        const api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
        expect(typeof api.getVodStreamUrl).toBe('function');
    });

    it('playback.js calls getLiveStreamUrl and JellyfinAPI defines it', () => {
        expect(playbackSrc).toMatch(/apiToUse\.getLiveStreamUrl\(/);
        const api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
        expect(typeof api.getLiveStreamUrl).toBe('function');
    });
});
