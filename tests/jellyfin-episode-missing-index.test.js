/**
 * Regression test for: a Jellyfin series whose media files are not
 * properly tagged showed only the well-tagged season and silently
 * dropped the rest of the episodes.
 *
 * Real-world case ("Code Quantum"):
 *   /Shows/{id}/Seasons returns 2 seasons:
 *     - "Season 2" (IndexNumber=1, Id=A) -> 8 episodes with proper
 *       IndexNumber + ParentIndexNumber set.
 *     - "Saison 1" (IndexNumber=null, Id=B) -> 88 episodes with NO
 *       IndexNumber and NO ParentIndexNumber. Jellyfin classifies
 *       these as "Season Unknown" because the user's filenames
 *       ("04 La Main droite du Seigneur", "05 Le défi est lancé"...)
 *       don't match Jellyfin's naming convention.
 *
 * Symptoms before the fix:
 *   (a) /Shows/{id}/Episodes (bulk) returned all 96 episodes, but
 *       the fallback `ParentIndexNumber || 1` lumped the 88 unknowns
 *       under season 1 alongside the 8 real S1 episodes, so the user
 *       still only saw a single "Saison 1" button.
 *   (b) renderEpisodes crashed on the first `ep.episode_num.toString()`
 *       call because the 88 unknowns had no episode_num.
 *   (c) Defensive workaround: filtering episodes without IndexNumber
 *       hid all 88 episodes — series effectively had 8 episodes.
 *
 * Fix:
 *   - Fetch episodes per season via /Shows/{id}/Episodes?seasonId={id}
 *     (the same call the official Jellyfin web client uses). This
 *     groups episodes by their actual season Id rather than by the
 *     unreliable ParentIndexNumber on the episode itself.
 *   - For seasons whose IndexNumber is null, allocate a synthetic
 *     season number that doesn't collide with real ones (0, then
 *     anything still free).
 *   - For episodes whose IndexNumber is null, extract a number from
 *     the leading digits of the Name ("04 La Main droite..." -> 4);
 *     otherwise fall back to the position in the season's episode
 *     array. Either way episode_num is always a number, so
 *     renderEpisodes' .toString() comparison can no longer trip.
 *   - renderEpisodes itself still carries a defense-in-depth guard
 *     against undefined episode_num so a single rogue episode from
 *     any future source cannot break the whole grid.
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

function makeApiWithCodeQuantumFixture() {
    const api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
    // Faithful reproduction of the user's Jellyfin response for "Code Quantum".
    api.fetchJellyfin = async function(path) {
        if (path.indexOf('/Seasons') !== -1) {
            return { Items: [
                { Id: 'S1id', Name: 'Season 2', IndexNumber: 1 },
                { Id: 'S0id', Name: 'Saison 1', IndexNumber: null }
            ]};
        }
        if (path.indexOf('/Episodes') !== -1) {
            // Per-season fetch dispatch based on seasonId in URL.
            if (path.indexOf('seasonId=S1id') !== -1) {
                return { Items: [
                    { Id: 'ep1', Name: 'Pilote',
                      ParentIndexNumber: 1, IndexNumber: 1, Container: 'mkv' },
                    { Id: 'ep2', Name: 'Star-Crossed',
                      ParentIndexNumber: 1, IndexNumber: 2, Container: 'mkv' }
                ]};
            }
            if (path.indexOf('seasonId=S0id') !== -1) {
                return { Items: [
                    // Order returned by Jellyfin: irregular. The leading
                    // number in the Name is the user's manual sequence.
                    { Id: 'u4', Name: '04 La Main droite du Seigneur', Container: 'mkv' },
                    { Id: 'u3', Name: '03 Amours croisées',           Container: 'mkv' },
                    { Id: 'u96', Name: '96 Memphis Mélodie',         Container: 'mkv' },
                    { Id: 'uN', Name: 'Bonus sans numéro',           Container: 'mkv' }
                ]};
            }
            return { Items: [] };
        }
        return { Id: 'series1', Name: 'Code Quantum', Overview: '...',
                 ProductionYear: 1989, Genres: [], People: [] };
    };
    return api;
}

describe('JellyfinAPI.getSeriesInfo: all seasons of a partially-tagged library are visible', () => {
    it('returns both seasons (well-tagged AND IndexNumber-null one)', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        const keys = Object.keys(info.episodes).sort();
        // We must see 2 distinct season keys, not just 1. The IndexNumber=1
        // season takes "1"; the IndexNumber=null season takes some other
        // non-colliding synthetic number.
        expect(keys.length).toBe(2);
        expect(keys).toContain('1');
        expect(keys.some(k => k !== '1')).toBe(true);
    });

    it('keeps the 88-episode "Saison Unknown" group intact (no filtering)', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        // Find the synthetic-numbered season (not "1"): it must hold the
        // 4 fixture episodes from S0id, NOT be empty and NOT be merged
        // into season 1.
        const syntheticKey = Object.keys(info.episodes).find(k => k !== '1');
        expect(syntheticKey).toBeDefined();
        const eps = info.episodes[syntheticKey];
        expect(eps).toHaveLength(4);
        expect(eps.map(e => e.id).sort()).toEqual(['u3', 'u4', 'u96', 'uN'].sort());
    });

    it('extracts episode_num from leading digits in Name when IndexNumber is null', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        const syntheticKey = Object.keys(info.episodes).find(k => k !== '1');
        const eps = info.episodes[syntheticKey];
        const byId = {};
        eps.forEach(e => { byId[e.id] = e; });
        expect(byId.u4.episode_num).toBe(4);
        expect(byId.u3.episode_num).toBe(3);
        expect(byId.u96.episode_num).toBe(96);
        // "Bonus sans numéro" has no leading digits — must still get a
        // number (positional), never undefined.
        expect(typeof byId.uN.episode_num).toBe('number');
    });

    it('every returned episode has a numeric episode_num (no undefined leaks)', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        Object.keys(info.episodes).forEach(k => {
            info.episodes[k].forEach(ep => {
                expect(typeof ep.episode_num).toBe('number');
            });
        });
    });

    it('every returned episode carries a stream url (so play does not fall back)', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        Object.keys(info.episodes).forEach(k => {
            info.episodes[k].forEach(ep => {
                expect(ep.url).toContain('/Videos/' + ep.id + '/stream');
            });
        });
    });

    it('fetches episodes per-season via seasonId param, not the bulk endpoint', async () => {
        // Pin the contract: getSeriesInfo must use the per-season call,
        // otherwise Jellyfin libraries with malformed episodes will start
        // returning ungrouped data again.
        const api = makeApiWithCodeQuantumFixture();
        const callPaths = [];
        const origFetch = api.fetchJellyfin;
        api.fetchJellyfin = function(path, opts) {
            callPaths.push(path);
            return origFetch.call(this, path, opts);
        };
        await api.getSeriesInfo('series1');
        const episodeCalls = callPaths.filter(p => p.indexOf('/Episodes') !== -1);
        // Must have one call PER season (here: 2), all carrying seasonId.
        expect(episodeCalls.length).toBe(2);
        episodeCalls.forEach(p => expect(p).toMatch(/seasonId=/));
    });
});

describe('JellyfinAPI.getSeriesInfo: synthetic season number does not collide', () => {
    it('an IndexNumber=null season picks a free slot (not the real season 1)', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        expect(info.episodes['1']).toBeDefined();
        expect(info.episodes['1'].length).toBe(2);
        // The 88-episode group MUST NOT have ended up under "1".
        const otherKey = Object.keys(info.episodes).find(k => k !== '1');
        expect(otherKey).toBeDefined();
        expect(info.episodes[otherKey].length).toBe(4);
    });

    it('returns a "seasons" array sized to match the actual season count', async () => {
        const api = makeApiWithCodeQuantumFixture();
        const info = await api.getSeriesInfo('series1');
        expect(info.seasons).toHaveLength(2);
        info.seasons.forEach(s => {
            expect(typeof s.season_number).toBe('number');
        });
    });
});

describe('details.renderEpisodes guards .toString() against undefined (defense in depth)', () => {
    const detailsSrc = fs.readFileSync('./js/details.js', 'utf8');

    it('no longer calls ep.episode_num.toString() without a typeof guard', () => {
        expect(detailsSrc).not.toMatch(/ep\.episode_num\.toString\(\)/);
    });
});
