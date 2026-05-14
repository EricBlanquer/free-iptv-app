# Dedup Anomaly — Investigation Notes (2026-05-14)

WIP investigation of a non-deterministic bug where the VOD grid sometimes shows fewer streams than expected (recently-added films missing from the date-sorted view).

## Symptoms (user-facing)

- User opens **Films → Tout (sorted by date d'ajout)**.
- Expects to see the most recently added films at the top.
- Sometimes the most recent 1-2 films are **missing**: the user sees `Punisher` first instead of the expected `Le Bus : Les Bleus en grève` → `Joy` → `Punisher` order.
- **Restarting the app** often (but not always) fixes it.
- **Reproducible window**: appears transiently after a background refresh fires (the new server data sometimes lands in a "bad" cache state).

## What the logs show

Two distinct cache states alternate in `api.cache.vodStreams['_all']`:

| State | Stream count | Dedup groups | Visible after applyDedup | Key format observed |
|-------|-------------:|-------------:|-------------------------:|---------------------|
| **Good** | 19080 | 15878 | 15878 (3202 hidden) | `title:cleanname|year` |
| **Bad** | 19069 | 3620 | 18801 (only 268 hidden) | `tmdb:NNN` |

Three independent oddities seen in the same session:

1. **Stream count flips 19080 ↔ 19069** without a `saveProviderCache` log between launches that load each version. Either the count comes from different IndexedDB entries (different `playlistId` keys?), or there is a write path that doesn't log.
2. **`_dedupKey` format alternates** between `title:` (loose) and `tmdb:` (tight). Both shapes are valid output of `computeFields` (`js/browse.js:3089`); which one fires depends on whether `s.tmdb` is set when `computeFields` runs. After persist, `_stripStreamsForCache` removes `tmdb` (`js/storage.js:641`) — so a future re-compute (slow path) on the same cache yields `title:` keys, whereas a re-compute on fresh-from-server data (with `tmdb` populated) yields `tmdb:` keys. The cache snapshot you load determines which dedup density you get.
3. **Cache age regresses**: at `01:37:18` the load logged `age: 18min`; 30 seconds later at `01:37:48` the same `playlistId` loaded `age: 378min`. No `saveProviderCache` fired in between. This is the most mysterious symptom — IndexedDB shouldn't return an older record than what was just written.

## Why it actually breaks the user-facing view

The "bad" 19069 array is **missing 11 streams** that are present in the 19080 version. Those 11 include the recently-added films the user is looking for. So the user sees the catalog without the newest items.

The dedup-grouping anomaly (sport collapsing 2574 → 1 group, etc.) is a separate symptom of the `tmdb:` key format, but doesn't directly hide the films — `_applyDedup` only flagged 268 streams as `_hiddenDuplicate` in that state. The films aren't hidden; they're **physically absent** from the streams array.

## Diagnostic instrumentation already in place

The following logs were added to capture the next reproduction (commit referenced in CHANGELOG):

- **`CACHE LOAD vod streams=N ts=T first[id]=key/v3 last[id]=key/v3`** — at every `loadProviderCacheLocal` hit (`js/storage.js`). Shows what's actually on disk: stream count, timestamp, and the `_dedupKey` shape of the first and last stream.
- **`CACHE saveProviderCache: writing NKB ts=T vod=N first=key last=key`** — at every persist (`js/storage.js`). Same shape, on the way out.
- **`DEDUP enter streams=N fast=true samples: 0:tmdb:1/v3/tmdb=42 | mid:title:/v3/tmdb=none | last:...`** — at the top of `_preprocessStreams` (`js/browse.js`). Three sample positions to spot whether `_dedupKey` and `tmdb` field are consistent across the array.
- **`DEDUP ANOMALY: N streams collapsed to G groups (preConsolidate=P), top5: <key>x<count>`** — at the end of `_preprocessStreams` when group count is `< streams.length / 4`. Names the keys that absorbed the most streams.
- **`SIDEBAR render section=X inputCats=N afterCountFilter=M streams=K`** — already in `renderCategories` (`js/browse.js`). Useful to correlate stream count drops with sidebar emptiness.

## How to investigate the next reproduction

1. **Trigger**: force a provider refresh (settings → refresh) OR wait for `PROVIDER_CACHE_TTL` to expire OR restart the app a few times. The bad state usually appears within 1-2 launches after a refresh.
2. **Verify reproduction**: open Films → Tout → sort by date d'ajout. If the user-known recent film (`Le Bus`, etc.) is missing from the top, you have it.
3. **Pull logs**: `curl -s "https://iptv.blanquer.org/debug.log?t=$(date +%s)" -o /tmp/d.log`
4. **Sequence to reconstruct** in the log:
   - Find the `CACHE saveProviderCache` line right before the launch that hit the bad state. Note `ts=`, `vod=`, `first=`, `last=`. This tells you what was last written to disk.
   - Find the matching `CACHE LOAD vod streams=` from the next launch. If `streams=` differs from the saved `vod=`, **that's the bug** — disk write/read disagree (IndexedDB transaction lost or two entries colliding).
   - If `streams=` matches but `first=`/`last=` key shape is `tmdb:` instead of `title:`, the load picked up a refresh-saved version. That's expected behavior of the current logic but produces the bad UX.
   - Find the `DEDUP enter streams=N samples:` line for `vod`. Confirm the keys match what `LOAD` showed.
   - Find any `DEDUP ANOMALY` line — the `top5` key list will name the keys that swallowed too many streams (most likely a single `tmdb:NNN` shared by many unrelated films, or `title:|year` from streams with empty cleanTitle).
5. **Where the 11 streams go**: the difference between the good (19080) and bad (19069) snapshots is most likely produced inside `applyQualityFiltersToSection` (`js/storage.js:904`) — the post-refresh `cacheData` already has the smaller count when `saveProviderCache` is called. Check whether `LANG FILTER` in the same launch dropped a category that should have stayed (the recent `matchesLanguage` rewrite is a candidate). Compare `inputCats` between good and bad launches.

## Hypotheses still open

- **A. Two IndexedDB entries with different `playlistId` keys** are alternately read. `getProviderCacheKey(playlistId)` returns `playlistId || 'default'`; if `playlist.id` is empty in some code path, `'default'` is used, otherwise the real id. A mismatch would explain both the count flip and the timestamp regression. **Test**: after the next bad launch, dump `IndexedDB.iptv-provider-cache` keys via the Tizen WebInspector / Chrome DevTools and see how many entries exist.
- **B. `applyQualityFiltersToSection` is filter-sensitive**: the 11-stream gap is produced by the LANG/SD/3D filters. If one filter setting toggles between launches (`hideSD` etc.), the saved cache differs. **Test**: log `getCurrentFilterSettings()` at every save and compare across the good/bad pair.
- **C. The matchesLanguage rewrite (commit 983cfa0, 2026-05-12) drops a category** that contains `Le Bus` / `Joy`. Other CA|/FR| films that pass language filtering would still show, leaving Punisher first. **Test**: after a bad launch, in `_preprocessSection` add a one-shot grep for the missing stream titles to find their `category_id` and check whether that category survived the lang filter.

## What NOT to do

- **Don't change the dedup key format speculatively** (e.g., always-`title:`) without confirming the root cause. Recommendation matching, stream lookup, history dedup all depend on the current key shape.
- **Don't strip `_dedupKey` to force re-compute** — that breaks the fast path and re-introduces the post-refresh "loading sections" delay.
- **Don't blame `_consolidateDedupGroupsByCleanTitle`** in the absence of evidence. The merge logic is deterministic and idempotent on the same input; it can only AMPLIFY a bad input, not cause it.

## Related code

- `js/browse.js:2498` — `_consolidateDedupGroupsByCleanTitle` (merge groups sharing the same `ct`).
- `js/browse.js:3009` — `_preprocessStreams` (fast path / slow path entry, computeFields).
- `js/storage.js:640` — `_stripStreamsForCache` (drops `tmdb`, keeps `_dedupKey`).
- `js/storage.js:653` — `saveProviderCache` (write to IndexedDB).
- `js/storage.js:584` — `loadProviderCacheLocal` (read from IndexedDB).
- `js/storage.js:978` — `refreshProviderCacheBackground` (refresh entry, calls save then `_invalidatePreprocessCache`).
- `js/storage.js:904` — `applyQualityFiltersToSection` (where the 11-stream loss likely happens).
