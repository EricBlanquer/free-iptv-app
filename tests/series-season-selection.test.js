/**
 * Regression test for: series details opens on Season 1 instead of the last-watched
 * season when the user already watched the latest available episode (no new episode).
 *
 * Bug repro: last watched S10E14, S10E14 is the latest available episode.
 * updateSeriesContinueButton set seriesContinueEpisode to the FIRST episode (for the
 * "replay from start" Play button), and loadSeriesInfo derived the displayed season from
 * seriesContinueEpisode.season -> Season 1. The fix introduces seriesDisplaySeason, set to
 * the last-watched season in the "no new episode" case, and loadSeriesInfo prefers it.
 *
 * These mirror the implementations in js/details.js. Keep in sync.
 */

function findFirstEpisode(seriesData) {
    if (!seriesData.episodes) return null;
    var seasons = Object.keys(seriesData.episodes).sort(function(a, b) { return parseInt(a) - parseInt(b); });
    if (seasons.length === 0) return null;
    var firstSeason = seasons[0];
    var episodes = seriesData.episodes[firstSeason];
    if (!episodes || episodes.length === 0) return null;
    var firstEp = episodes.reduce(function(min, ep) {
        return parseInt(ep.episode_num) < parseInt(min.episode_num) ? ep : min;
    }, episodes[0]);
    return { id: firstEp.id, season: parseInt(firstSeason), episode: parseInt(firstEp.episode_num) };
}

function analyzeSeriesProgress(seriesData, lastSeason, lastEpisode) {
    var result = { newCount: 0, nextEpisode: null };
    if (!seriesData.episodes) return result;
    var candidates = [];
    var seasonKeys = Object.keys(seriesData.episodes);
    for (var si = 0; si < seasonKeys.length; si++) {
        var sNum = parseInt(seasonKeys[si]);
        var episodes = seriesData.episodes[seasonKeys[si]];
        for (var ei = 0; ei < episodes.length; ei++) {
            var eNum = parseInt(episodes[ei].episode_num);
            if (sNum > lastSeason || (sNum === lastSeason && eNum > lastEpisode)) {
                result.newCount++;
                candidates.push({ id: episodes[ei].id, season: sNum, episode: eNum });
            }
        }
    }
    if (candidates.length > 0) {
        candidates.sort(function(a, b) { return a.season !== b.season ? a.season - b.season : a.episode - b.episode; });
        result.nextEpisode = candidates[0];
    }
    return result;
}

// Mirrors the FIXED updateSeriesContinueButton: returns { continueSeason, displaySeason }.
function computeSeasonsFixed(seriesData, inProgress, lastWatched) {
    if (inProgress) {
        return { continueSeason: inProgress.season, displaySeason: inProgress.season };
    }
    if (lastWatched) {
        var analysis = analyzeSeriesProgress(seriesData, lastWatched.season, lastWatched.episode);
        if (analysis.newCount > 0) {
            return { continueSeason: analysis.nextEpisode.season, displaySeason: analysis.nextEpisode.season };
        }
        // no new episode: Play button replays first episode, but display the last-watched season
        var firstEp = findFirstEpisode(seriesData);
        return { continueSeason: firstEp ? firstEp.season : null, displaySeason: lastWatched.season };
    }
    return { continueSeason: null, displaySeason: null };
}

// Mirrors the BUGGY behaviour (display derived from the continue/play episode only).
function computeSeasonsBuggy(seriesData, inProgress, lastWatched) {
    if (inProgress) return { continueSeason: inProgress.season };
    if (lastWatched) {
        var analysis = analyzeSeriesProgress(seriesData, lastWatched.season, lastWatched.episode);
        if (analysis.newCount > 0) return { continueSeason: analysis.nextEpisode.season };
        var firstEp = findFirstEpisode(seriesData);
        return { continueSeason: firstEp ? firstEp.season : null };
    }
    return { continueSeason: null };
}

// Mirrors loadSeriesInfo target-season resolution (fixed: prefers displaySeason).
function resolveTargetSeason(seriesData, displaySeason, continueSeason) {
    var sorted = Object.keys(seriesData.episodes).sort(function(a, b) { return parseInt(a) - parseInt(b); });
    if (displaySeason != null && seriesData.episodes[displaySeason]) return displaySeason;
    if (continueSeason != null && seriesData.episodes[continueSeason]) return continueSeason;
    return parseInt(sorted[0]);
}

describe('series details: season selection on resume', () => {
    // 10 seasons; the latest available episode is exactly S10E14 (nothing newer).
    var seriesData = { episodes: {} };
    for (var s = 1; s <= 10; s++) {
        var eps = [];
        var count = s === 10 ? 14 : 12;
        for (var e = 1; e <= count; e++) eps.push({ id: s * 100 + e, episode_num: e });
        seriesData.episodes[String(s)] = eps;
    }
    var lastWatched = { season: 10, episode: 14 };

    it('analyze: S10E14 watched and latest available -> no new episode', () => {
        var a = analyzeSeriesProgress(seriesData, 10, 14);
        expect(a.newCount).toBe(0);
        expect(a.nextEpisode).toBeNull();
    });

    it('FIX: displays the last-watched season (10), not season 1', () => {
        var r = computeSeasonsFixed(seriesData, null, lastWatched);
        expect(r.displaySeason).toBe(10);
        // Play button still offers replay from the first episode
        expect(r.continueSeason).toBe(1);
        var target = resolveTargetSeason(seriesData, r.displaySeason, r.continueSeason);
        expect(target).toBe(10);
    });

    it('baseline repro: buggy logic lands on season 1', () => {
        var r = computeSeasonsBuggy(seriesData, null, lastWatched);
        // Buggy: only a continue/play season (first episode) is available -> season 1
        var target = resolveTargetSeason(seriesData, null, r.continueSeason);
        expect(target).toBe(1);
    });

    it('still jumps to the next-episode season when a newer episode exists', () => {
        var r = computeSeasonsFixed(seriesData, null, { season: 5, episode: 3 });
        expect(r.displaySeason).toBe(5);
        expect(resolveTargetSeason(seriesData, r.displaySeason, r.continueSeason)).toBe(5);
    });

    it('moves to next season when last episode of a middle season was watched', () => {
        var r = computeSeasonsFixed(seriesData, null, { season: 4, episode: 12 });
        expect(r.displaySeason).toBe(5); // S04E12 is last of S4 -> next is S05E01
    });

    it('an in-progress episode wins and shows its season', () => {
        var r = computeSeasonsFixed(seriesData, { season: 7, episode: 2 }, { season: 3, episode: 1 });
        expect(r.displaySeason).toBe(7);
        expect(resolveTargetSeason(seriesData, r.displaySeason, r.continueSeason)).toBe(7);
    });

    it('no watch history -> defaults to the first season', () => {
        var r = computeSeasonsFixed(seriesData, null, null);
        expect(r.displaySeason).toBeNull();
        expect(resolveTargetSeason(seriesData, r.displaySeason, r.continueSeason)).toBe(1);
    });
});
