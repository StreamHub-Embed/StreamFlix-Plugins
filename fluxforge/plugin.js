(function() {
    var tmdbBase = manifest && manifest.baseUrl || "https://api.tmdb.org";
    var tmdbKey = manifest && manifest.apiKey || "";
    var TMDB_API = tmdbBase + "/3" + (tmdbKey ? "?api_key=" + tmdbKey : "");
    var TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
    var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    var HEADERS = { "User-Agent": UA, "Accept": "application/json" };
    var _tmdbCache = {};

    // ───── Provider header presets (from Kotlin extractors) ─────
    var H_VAPLAYER = { "Referer": "https://nextgencloudfabric.com/", "User-Agent": UA };
    var H_VIDLINK  = { "Origin": "https://vidlink.pro", "Referer": "https://vidlink.pro/", "User-Agent": UA };
    var H_VIDEASY  = { "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/", "Accept": "*/*", "User-Agent": UA };
    var H_VIDROCK  = { "Origin": "https://vidrock.ru", "User-Agent": UA };
    var H_VIDFAST  = { "Referer": "https://vidfast.pro/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };
    var H_RIVESTREAM = { "User-Agent": UA };
    var H_VIDSYNC   = { "Origin": "https://vidsync.xyz", "Referer": "https://vidsync.xyz/", "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Accept": "*/*" };
    var H_MOVIELINKBD = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.5", "Cookie": "xla=s4t", "Referer": "https://movielinkbd.shop/" };
    var MOVIELINKBD_BASE = "https://movielinkbd.shop";

    // ───── SkyMoviesHD Config ─────
    var SKY_API = "https://skymovieshd.ceo";
    var H_SKY = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" };

    function cleanText(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

    // Helper to get base domain URL
    function getBaseUrl(url) {
        var m = String(url || "").match(/^(https?:\/\/[^\/]+)/);
        return m ? m[1] : url;
    }

    // Helper to fetch page body with custom headers
    async function fetchUrl(url, ch) {
        try {
            var merged = Object.assign({}, HEADERS, ch || {});
            var res = await http_get(url, merged);
            return res ? (res.body || res.text || "") : "";
        } catch (_) { return ""; }
    }

    async function fetchJson(url) {
        try { var r = await http_get(url, { headers: HEADERS }); return JSON.parse(r.body || "null"); }
        catch (_) { return null; }
    }

    function tmdbImage(path, size) {
        return path ? TMDB_IMAGE_BASE + "/" + (size || "original") + path : null;
    }

    function itemTitle(item) { return cleanText(item.title || item.name); }
    function itemDate(item) { return item.release_date || item.first_air_date || ""; }
    function itemYear(item) { var y = parseInt(itemDate(item).split("-")[0], 10); return isNaN(y) ? undefined : y; }

    function mapItem(item, mediaType) {
        var type = mediaType || item.media_type;
        if (type !== "tv") type = "movie";
        return new MultimediaItem({
            title: itemTitle(item),
            url: "tmdb://" + type + "/" + item.id,
            posterUrl: tmdbImage(item.poster_path, "w500"),
            bannerUrl: tmdbImage(item.backdrop_path),
            year: itemYear(item),
            score: item.vote_average || undefined,
            type: type === "tv" ? "series" : "movie",
            contentType: type === "tv" ? "series" : "movie",
            syncData: { tmdb: String(item.id) }
        });
    }

    async function fetchList(endpoint, params) {
        var json = await fetchJson(TMDB_API + "/" + endpoint + "?" + (params || ""));
        var results = Array.isArray(json && json.results) ? json.results : [];
        var hasMt = results.length > 0 && results[0].media_type;
        return results.slice(0, 20).map(function(item) {
            var t = hasMt ? item.media_type : (endpoint.indexOf("tv") !== -1 ? "tv" : "movie");
            return mapItem(item, t);
        });
    }

    async function getHome(cb) {
        try {
            var cats = await Promise.all([
                fetchList("trending/all/week"),
                fetchList("movie/popular"),
                fetchList("tv/popular"),
                fetchList("movie/top_rated"),
                fetchList("movie/now_playing"),
                fetchList("movie/upcoming"),
                fetchList("tv/top_rated"),
                fetchList("tv/airing_today")
            ]);
            cb({ success: true, data: {
                "Trending": cats[0],
                "Popular Movies": cats[1],
                "Popular TV": cats[2],
                "Top Rated": cats[3],
                "Now Playing": cats[4],
                "Upcoming": cats[5],
                "Top Rated TV": cats[6],
                "Airing Today": cats[7]
            }});
        } catch (e) {
            cb({ success: false, errorCode: "API_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            var q = encodeURIComponent(cleanText(query));
            var [m, t] = await Promise.all([
                fetchJson(TMDB_API + "/search/movie?query=" + q),
                fetchJson(TMDB_API + "/search/tv?query=" + q)
            ]);
            var items = [], seen = {};
            (m && m.results || []).slice(0, 10).forEach(function(v) {
                var k = "m:" + v.id; if (!seen[k]) { seen[k] = true; items.push(mapItem(v, "movie")); }
            });
            (t && t.results || []).slice(0, 10).forEach(function(v) {
                var k = "t:" + v.id; if (!seen[k]) { seen[k] = true; items.push(mapItem(v, "tv")); }
            });
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "API_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            var parts = url.replace("tmdb://", "").split("/");
            var mediaType = parts[0], tmdbId = parts[1];
            if (!mediaType || !tmdbId) return cb({ success: false, errorCode: "INVALID_URL", message: "" });

            var isTv = mediaType === "tv", ep = isTv ? "tv" : "movie";
            var details = await fetchJson(TMDB_API + "/" + ep + "/" + tmdbId + "?append_to_response=credits,external_ids");
            if (!details) return cb({ success: false, errorCode: "NOT_FOUND", message: "" });

            var cast = (details.credits && details.credits.cast || [])
                .filter(function(c) { return c.name && c.profile_path; })
                .slice(0, 15)
                .map(function(c) {
                    try { return { name: c.name, image: tmdbImage(c.profile_path, "w185"), role: c.character || "" }; }
                    catch (_) { return null; }
                }).filter(Boolean);
            var imdbId = (details.external_ids && details.external_ids.imdb_id) || "";
            var genres = Array.isArray(details.genres) ? details.genres.map(function(g) { return g.name; }) : [];
            var logoUrl = imdbId ? "https://live.metahub.space/logo/medium/" + imdbId + "/img" : undefined;

            var item = new MultimediaItem({
                title: cleanText(details.title || details.name),
                url: url,
                posterUrl: tmdbImage(details.poster_path, "w500"),
                bannerUrl: tmdbImage(details.backdrop_path),
                description: cleanText(details.overview),
                year: itemYear(details),
                score: details.vote_average || undefined,
                tags: genres.length ? genres : undefined,
                cast: cast.length ? cast : undefined,
                logoUrl: logoUrl,
                syncData: { tmdb: String(tmdbId), imdb: imdbId },
                type: isTv ? "series" : "movie",
                contentType: isTv ? "series" : "movie"
            });

            if (isTv) {
                var seasons = Array.isArray(details.seasons) ? details.seasons : [];
                var episodes = [];
                var seasonDatas = await Promise.all(seasons.map(function(s) {
                    var sn = s.season_number;
                    if (sn == null || sn === 0) return null;
                    return fetchJson(TMDB_API + "/tv/" + tmdbId + "/season/" + sn);
                }));
                seasonDatas.forEach(function(sd) {
                    if (!sd || !Array.isArray(sd.episodes)) return;
                    sd.episodes.forEach(function(ep) {
                        episodes.push(new Episode({
                            name: cleanText(ep.name),
                            season: ep.season_number,
                            episode: ep.episode_number,
                            url: JSON.stringify([{ name: "TMDB", url: "tmdb://episode/" + tmdbId + "/" + ep.season_number + "/" + ep.episode_number }]),
                            posterUrl: tmdbImage(ep.still_path, "w300"),
                            description: cleanText(ep.overview),
                            airDate: ep.air_date || undefined,
                            rating: ep.vote_average || undefined
                        }));
                    });
                });
                if (episodes.length === 0) episodes.push(new Episode({ name: "No episodes", season: 1, episode: 1, url: "[]" }));
                item.episodes = episodes;
            } else {
                item.episodes = [new Episode({
                    name: "Play",
                    season: 1,
                    episode: 1,
                    url: JSON.stringify([{ name: "TMDB", url: "tmdb://movie/" + tmdbId }]),
                    posterUrl: tmdbImage(details.poster_path, "w500")
                })];
            }
            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    // ───── Quality helpers ─────
    function parseQuality(str) {
        if (!str) return 1080;
        var m = String(str).match(/(\d{3,4})[pP]/);
        return m ? parseInt(m[1], 10) : 1080;
    }
    function qLabel(q) { var n = parseInt(q, 10); return n ? n + "p" : ""; }

    // ───── AES-256-CBC pure JS (fallback when crypto.subtle unavailable) ─────
    // ───── Provider: Vaplayer ─────
    async function fetchVaplayer(tmdbId, season, episode) {
        try {
            var url = "https://streamdata.vaplayer.ru/api.php?tmdb=" + tmdbId;
            if (season != null) url += "&type=tv&season=" + season + "&episode=" + episode;
            else url += "&type=movie";

            var res = await http_get(url, { headers: {
                "User-Agent": UA, "Referer": "https://nextgencloudfabric.com/", "Accept": "application/json"
            }});
            if (!res || !res.body) return [];
            var json = JSON.parse(res.body);
            var urls = json.data && json.data.stream_urls;
            if (!Array.isArray(urls)) return [];
            return urls.map(function(u, i) {
                return new StreamResult({ source: "Vaplayer [Server " + (i + 1) + " - 1080p]", name: "Vaplayer [Server " + (i + 1) + "]", url: u, quality: 1080, headers: H_VAPLAYER });
            });
        } catch (_) { return []; }
    }

    // ───── Provider: Vidlink ─────
    async function fetchVidlink(tmdbId, season, episode) {
        try {
            var encRes = await http_get("https://enc-dec.app/api/enc-vidlink?text=" + tmdbId, { headers: HEADERS });
            if (!encRes || !encRes.body) return [];
            var encData = JSON.parse(encRes.body).result;
            if (!encData) return [];

            var base = "https://vidlink.pro";
            var apiUrl = season == null
                ? base + "/api/b/movie/" + encData
                : base + "/api/b/tv/" + encData + "/" + season + "/" + episode;

            var res = await http_get(apiUrl, { headers: {
                "User-Agent": UA, "Referer": base + "/", "Origin": base, "Accept": "application/json"
            }});
            if (!res || !res.body) return [];
            var json = JSON.parse(res.body);
            var playlist = json.stream && json.stream.playlist;
            if (!playlist) return [];
            return [new StreamResult({ source: "Vidlink [Auto - 1080p]", name: "Vidlink", url: playlist, quality: 1080, headers: H_VIDLINK })];
        } catch (_) { return []; }
    }

    // ───── Provider: VidEasy (api.wingsdatabase.com) ─────
    async function fetchVidEasy(tmdbId, season, episode) {
        try {
            var details = _tmdbCache[tmdbId] || await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (!details) return [];
            var title = details.title || details.name || "";
            var year = (details.release_date || details.first_air_date || "").split("-")[0];
            var imdbId = details.external_ids && details.external_ids.imdb_id;
            var imdb = imdbId != null ? imdbId : "";

            // Step 1: Get seed from wingsdatabase
            var seedUrl = "https://api.wingsdatabase.com/seed?mediaId=" + tmdbId;
            var seedResp = await http_get(seedUrl, { headers: { "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/", "User-Agent": UA } });
            if (!seedResp || !seedResp.body) return [];
            var seedData = JSON.parse(seedResp.body);
            var seed = seedData.seed;
            var enc = "2";

            // Step 2: Query each wing server
            var servers = ["jett", "cdn", "tejo", "neon2", "ym", "downloader2", "m4uhd", "hdmovie", "meine", "lamovie", "superflix"];
            var q = function(t) { return encodeURIComponent(t).replace(/%20/g, "%20"); };
            var encTitle = q(q(title));

            var results = [];
            var wingHeaders = { "User-Agent": UA, "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/" };

            await Promise.all(servers.map(async function(srv) {
                try {
                    var srcUrl = "https://api.wingsdatabase.com/" + srv + "/sources-with-title?title=" + encTitle + "&mediaType=" + (season == null ? "movie" : "tv") + "&year=" + year + "&tmdbId=" + tmdbId + "&imdbId=" + imdb + "&enc=" + enc + "&seed=" + seed;
                    if (season != null) srcUrl += "&episodeId=" + episode + "&seasonId=" + season;

                    var encResp = await http_get(srcUrl, { headers: wingHeaders });
                    if (!encResp || !encResp.body || encResp.status !== 200) return;

                    var decResp = await http_post("https://enc-dec.app/api/dec-videasy", {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: encResp.body, id: parseInt(tmdbId, 10), seed: seed })
                    });
                    if (!decResp || !decResp.body) return;
                    var decJson = JSON.parse(decResp.body);
                    var r = decJson.result;
                    if (!r || !r.sources) return;

                    for (var j = 0; j < r.sources.length; j++) {
                        var src = r.sources[j];
                        if (src.url) {
                            var q = parseQuality(src.quality);
                            results.push(new StreamResult({
                                source: "VidEasy [" + srv.toUpperCase() + " - " + qLabel(q) + "]",
                                name: "VidEasy [" + srv.toUpperCase() + " " + qLabel(q) + "]",
                                url: src.url,
                                quality: q,
                                headers: { "User-Agent": UA, "Referer": "https://player.videasy.to/" }
                            }));
                        }
                    }
                } catch (_) {}
            }));
            return results;
        } catch (_) { return []; }
    }

    // ───── Provider: Vidrock (AES-256-CBC) ─────
    async function fetchVidrock(tmdbId, season, episode) {
        try {
            var keyB64 = "eDdrOW1QcVQycld2WTh6QTViQzNuRjZoSjJsSzRtTjk=";
            var type = season == null ? "movie" : "tv";
            var text = type === "tv" ? tmdbId + "_" + season + "_" + episode : String(tmdbId);

            var encrypted = await vidrockEncrypt(keyB64, text);
            if (!encrypted) return [];

            var url = "https://vidrock.ru/api/" + type + "/" + encrypted;
            var res = await http_get(url, { headers: { "Accept": "application/json, text/plain, */*", "User-Agent": UA } });
            if (!res || !res.body) return [];
            var sources = JSON.parse(res.body);

            var results = [];
            var keys = Object.keys(sources);
            for (var ki = 0; ki < keys.length; ki++) {
                var key = keys[ki];
                var obj = sources[key];
                if (!obj || !obj.url) continue;
                var lang = obj.language || "Unknown";
                var rawUrl = obj.url.indexOf("%") !== -1 ? decodeURIComponent(obj.url) : obj.url;
                var fmt = rawUrl.indexOf(".mp4") !== -1 ? " MP4" : "";
                var q = parseQuality(key);
                results.push(new StreamResult({ source: "Vidrock [" + lang + fmt + " - " + qLabel(q) + "]", name: "Vidrock [" + key + " " + lang + fmt + " " + qLabel(q) + "]", url: rawUrl, quality: q, headers: H_VIDROCK }));
            }
            return results;
        } catch (_) { return []; }
    }

    function strToBytes(str) {
        var b = []; for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); if (c < 128) b.push(c); else if (c < 2048) { b.push(192 | (c >> 6)); b.push(128 | (c & 63)); } else { b.push(224 | (c >> 12)); b.push(128 | ((c >> 6) & 63)); b.push(128 | (c & 63)); } } return b;
    }
    function bytesToStr(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }

    function rawBytes(str) { var b = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xFF; return b; }

    async function vidrockEncrypt(keyB64, plaintext) {
        try {
            if (globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.subtle.encrypt) {
                var keyStr = atob(keyB64);
                var rawKey = rawBytes(keyStr);
                var rawIv = rawKey.slice(0, 16);
                var ptBytes = new TextEncoder().encode(plaintext);
                var key = await globalThis.crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["encrypt"]);
                var enc = await globalThis.crypto.subtle.encrypt({ name: "AES-CBC", iv: rawIv }, key, ptBytes);
                var b64 = btoa(bytesToStr(new Uint8Array(enc)));
                return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
            }
        } catch (_) {}
        try {
            if (globalThis.crypto && globalThis.crypto.encryptAES) {
                var keyStr = atob(keyB64);
                var ivB64 = btoa(keyStr.substring(0, 16));
                var ptB64 = btoa(unescape(encodeURIComponent(plaintext)));
                var encB64 = await globalThis.crypto.encryptAES(ptB64, keyB64, ivB64);
                if (encB64) return encB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
            }
        } catch (_) {}
        return null;
    }

    // ───── Provider: VidFast (multi-step encryption) ─────
    async function fetchVidFast(tmdbId, season, episode) {
        try {
            var api = "https://enc-dec.app/api";
            var version = "1";
            var requestUrl = season == null
                ? "https://vidfast.pro/movie/" + tmdbId
                : "https://vidfast.pro/tv/" + tmdbId + "/" + season + "/" + episode;

            var baseHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                "Referer": "https://vidfast.pro/",
                "X-Requested-With": "XMLHttpRequest"
            };

            var pageRes = await http_get(requestUrl, { headers: baseHeaders });
            if (!pageRes || !pageRes.body) return [];
            var encMatch = pageRes.body.match(/\\"en\\":\\"(.*?)\\"/);
            if (!encMatch) return [];
            var encodedText = encMatch[1];

            var encRes = await http_get(api + "/enc-vidfast?text=" + encodeURIComponent(encodedText) + "&version=" + version, { headers: baseHeaders });
            if (!encRes || !encRes.body) return [];
            var encJson = JSON.parse(encRes.body);
            var result = encJson.result;
            if (!result || !result.servers || !result.stream) return [];

            baseHeaders["X-CSRF-Token"] = result.token;

            var serversRes = await http_post(result.servers, { headers: baseHeaders });
            if (!serversRes || !serversRes.body) return [];
            var serversEncrypted = serversRes.body;

            var decServRes = await http_post(api + "/dec-vidfast", {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: serversEncrypted, version: version })
            });
            if (!decServRes || !decServRes.body) return [];
            var decServ = JSON.parse(decServRes.body);
            var serversList = decServ.result;
            if (!Array.isArray(serversList)) return [];

            var results = [];
            await Promise.all(serversList.map(async function(server, idx) {
                try {
                    var name = server.name || "Server " + (idx + 1);
                    var data = server.data;
                    if (!data) return;

                    var streamUrl = result.stream + "/" + data;
                    var streamRes = await http_post(streamUrl, { headers: baseHeaders, body: "" });
                    if (!streamRes || !streamRes.body) return;

                    var decStreamRes = await http_post(api + "/dec-vidfast", {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: streamRes.body, version: version })
                    });
                    if (!decStreamRes || !decStreamRes.body) return;
                    var decStream = JSON.parse(decStreamRes.body);
                    var finalUrl = decStream.result && decStream.result.url;
                    if (!finalUrl) return;

                    results.push(new StreamResult({ source: "VidFast [" + name + " - 1080p]", name: "VidFast [" + name + "]", url: finalUrl, quality: 1080, headers: H_VIDFAST }));
                } catch (_) {}
            }));
            return results;
        } catch (_) { return []; }
    }

    // ───── Provider: RiveStream ─────
    async function fetchRiveStream(tmdbId, season, episode) {
        try {
            var RiveStreamAPI = "https://www.rivestream.app";
            var headers = { "User-Agent": UA };

            // 1. Get source list
            var srcListRes = await http_get(RiveStreamAPI + "/api/backendfetch?requestID=VideoProviderServices&secretKey=rive", { headers: headers });
            if (!srcListRes || !srcListRes.body) return [];
            var srcList = JSON.parse(srcListRes.body);
            var sources = srcList.data;
            if (!Array.isArray(sources) || sources.length === 0) return [];

            // 2. Get app script URL
            var mainRes = await http_get(RiveStreamAPI, { headers: headers });
            if (!mainRes || !mainRes.body) return [];
            var appScriptMatch = mainRes.body.match(/script\s+src="([^"]*_app[^"]*)"/);
            if (!appScriptMatch) return [];
            var appScript = appScriptMatch[1];
            if (appScript.indexOf("http") !== 0) appScript = RiveStreamAPI + appScript;

            // 3. Get key list from app script
            var jsRes = await http_get(appScript, { headers: headers });
            if (!jsRes || !jsRes.body) return [];
            var keyListMatch = jsRes.body.match(/let\s+c\s*=\s*(\[[^\]]*\])/);
            if (!keyListMatch) return [];
            var keyListStr = keyListMatch[1];
            var keyMatches = keyListStr.match(/"([^"]+)"/g);
            if (!keyMatches) return [];
            var keyList = keyMatches.map(function(k) { return k.replace(/"/g, ""); });
            if (keyList.length === 0) return [];

            // 4. Get secret key from worker (retry 3x)
            var secretKey = "";
            for (var ri = 0; ri < 3 && !secretKey; ri++) {
                var secretRes = await http_get("https://rivestream.supe2372.workers.dev/?input=" + tmdbId + "&cList=" + keyList.join(","), { headers: headers });
                if (secretRes && secretRes.body && secretRes.body.trim().length > 4) secretKey = secretRes.body.trim();
                if (!secretKey && ri < 2) await new Promise(function(r) { setTimeout(r, 500); });
            }
            if (!secretKey) return [];

            // 5. Fetch per-source streams (parallel)
            var results = [];
            await Promise.all(sources.map(async function(source) {
                try {
                    var streamUrl = RiveStreamAPI + "/api/backendfetch?requestID=" + (season == null ? "movieVideoProvider" : "tvVideoProvider") + "&id=" + tmdbId + "&service=" + source;
                    if (season != null) streamUrl += "&season=" + season + "&episode=" + episode;
                    streamUrl += "&secretKey=" + secretKey;

                    var streamRes = await http_get(streamUrl, { headers: headers });
                    if (!streamRes || !streamRes.body) return;
                    var streamJson = JSON.parse(streamRes.body);
                    var data = streamJson.data;
                    if (!data || !data.sources) return;

                    for (var j = 0; j < data.sources.length; j++) {
                        var s = data.sources[j];
                        var url = s.url;
                        if (!url) continue;
                        var srcName = s.source || "";
                        var q = parseQuality(s.quality || 1080);
                        var nameLabel = "RiveStream [" + srcName + (srcName ? " " : "") + qLabel(q) + "]";
                        var displaySource = "RiveStream [" + (srcName || "Auto") + " - " + qLabel(q) + "]";

                        if (url.indexOf("proxy?url=") !== -1) {
                            try {
                                var fullyDecoded = decodeURIComponent(url);
                                var encodedUrl = fullyDecoded.split("proxy?url=")[1].split("&headers=")[0];
                                var decodedUrl = decodeURIComponent(encodedUrl);
                                var encodedHeaders = fullyDecoded.split("&headers=")[1];
                                var proxyHeaders = {};
                                if (encodedHeaders) {
                                    try {
                                        var hJson = JSON.parse(decodeURIComponent(encodedHeaders));
                                        if (hJson.Referer) proxyHeaders["Referer"] = hJson.Referer;
                                        if (hJson.Origin) proxyHeaders["Origin"] = hJson.Origin;
                                    } catch (_) {}
                                }
                                results.push(new StreamResult({ source: displaySource, name: nameLabel, url: decodedUrl, quality: q, headers: proxyHeaders }));
                            } catch (_) {
                                results.push(new StreamResult({ source: displaySource, name: nameLabel, url: url, quality: q, headers: H_RIVESTREAM }));
                            }
                        } else {
                            results.push(new StreamResult({ source: displaySource, name: nameLabel, url: url, quality: q, headers: H_RIVESTREAM }));
                        }
                    }
                } catch (_) {}
            }));
            return results;
        } catch (_) { return []; }
    }



    // ───── Helper: uqloads packed-script extractor ─────
    function unPackPacked(str) {
        var m = str.match(/eval\(function\s*\(p,a,c,k,e,[dr]\)\s*\{[\s\S]*?return\s+p\}\s*\(\s*'([^']*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*\.split\s*\(\s*'\|'\s*\)/);
        if (!m) return str;
        var p = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\x/g, "\\x");
        var a = parseInt(m[2], 10);
        var c = parseInt(m[3], 10);
        var k = m[4].split('|');
        var map = {};
        for (var i = 0; i < c; i++) map[i.toString(a)] = k[i];
        var keys = Object.keys(map).sort(function(x, y) { return y.length - x.length; });
        var re = new RegExp('\\b(' + keys.join('|').replace(/\\/g, "\\\\") + ')\\b', 'g');
        return p.replace(re, function(_, w) { return map[w] || _; });
    }

    async function fetchFromUqloads(url) {
        try {
            var u = url.replace("/download/", "/e/");
            var res = await http_get(u, { headers: { "User-Agent": UA, "Referer": "https://uqloads.xyz/" } });
            if (!res || !res.body) return null;
            var doc = parseHtml(res.body);
            var iframe = doc.querySelector("iframe");
            if (iframe) {
                var src = iframe.getAttribute("src");
                res = await http_get(src, {
                    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.5", "Sec-Fetch-Dest": "iframe", "Referer": u }
                });
                if (!res || !res.body) return null;
            }
            var unpacked = unPackPacked(res.body);
            var hlsMatch = unpacked.match(/hls2":"([^"]+)"/);
            if (hlsMatch) return hlsMatch[1];
            hlsMatch = unpacked.match(/hls4":"([^"]+)"/);
            if (hlsMatch) return "https://uqloads.xyz" + hlsMatch[1];
            return null;
        } catch (_) { return null; }
    }

    // ───── Provider: 2Embed ─────
    async function fetch2embed(imdbId, season, episode) {
        try {
            var url = season == null
                ? "https://www.2embed.cc/embed/" + imdbId
                : "https://www.2embed.cc/embedtv/" + imdbId + "&s=" + season + "&e=" + episode;
            var res = await http_post(url, {
                headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": url },
                body: "pls=pls"
            });
            if (!res || !res.body) return [];
            var doc = parseHtml(res.body);
            var iframe = doc.querySelector("iframe#iframesrc");
            if (!iframe) return [];
            var dataSrc = iframe.getAttribute("data-src");
            if (!dataSrc) return [];
            var id = (dataSrc.match(/id=([^&]+)/) || [])[1];
            if (!id) return [];
            var m3u8 = await fetchFromUqloads("https://uqloads.xyz/e/" + id);
            if (m3u8) return [new StreamResult({ source: "2Embed [Auto - 1080p]", name: "2Embed", url: m3u8, quality: 1080 })];
            return [];
        } catch (_) { return []; }
    }

    // ───── Provider: VidSrcXyz (multi-decrypt) ─────
    var VSRC_DECRYPT = {
        "TsA2KGDGux": function(s) {
            var r = s.split('').reverse().join('').replace(/-/g, '+').replace(/_/g, '/');
            var d = atob(r);
            return d.split('').map(function(c) { return String.fromCharCode(c.charCodeAt(0) - 7); }).join('');
        },
        "ux8qjPHC66": function(s) {
            var rev = s.split('').reverse().join('');
            var hex = '';
            for (var i = 0; i < rev.length; i += 2) hex += String.fromCharCode(parseInt(rev.substr(i, 2), 16));
            var key = "X9a(O;FMV2-7VO5x;Ao\u0005:dN1NoFs?j,";
            var out = '';
            for (var i = 0; i < hex.length; i++) out += String.fromCharCode(hex.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            return out;
        },
        "xTyBxQyGTA": function(s) {
            var r = s.split('').reverse().join('');
            var f = '';
            for (var i = 0; i < r.length; i += 2) f += r[i];
            return atob(f);
        },
        "IhWrImMIGL": function(s) {
            var rev = s.split('').reverse().join('');
            var rot13 = rev.split('').map(function(c) {
                var code = c.charCodeAt(0);
                if (code >= 97 && code <= 109) return String.fromCharCode(code + 13);
                if (code >= 65 && code <= 77) return String.fromCharCode(code + 13);
                if (code >= 110 && code <= 122) return String.fromCharCode(code - 13);
                if (code >= 78 && code <= 90) return String.fromCharCode(code - 13);
                return c;
            }).join('');
            return atob(rot13.split('').reverse().join(''));
        },
        "o2VSUnjnZl": function(s) {
            var from = "xyzabcdefghijklmnopqrstuvwXYZABCDEFGHIJKLMNOPQRSTUVW";
            var to = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            var map = {};
            for (var i = 0; i < from.length; i++) map[from[i]] = to[i];
            return s.split('').map(function(c) { return map[c] || c; }).join('');
        },
        "eSfH1IRMyL": function(s) {
            var rev = s.split('').reverse().join('');
            var shifted = rev.split('').map(function(c) { return String.fromCharCode(c.charCodeAt(0) - 1); }).join('');
            var hex = '';
            for (var i = 0; i < shifted.length; i += 2) hex += String.fromCharCode(parseInt(shifted.substr(i, 2), 16));
            return hex;
        },
        "Oi3v1dAlaM": function(s) {
            var r = s.split('').reverse().join('').replace(/-/g, '+').replace(/_/g, '/');
            var d = atob(r);
            return d.split('').map(function(c) { return String.fromCharCode(c.charCodeAt(0) - 5); }).join('');
        },
        "sXnL9MQIry": function(s) {
            var hex = '';
            for (var i = 0; i < s.length; i += 2) hex += String.fromCharCode(parseInt(s.substr(i, 2), 16));
            var xorKey = "pWB9V)[*4I`nJpp?ozyB~dbr9yt!_n4u";
            var xored = '';
            for (var i = 0; i < hex.length; i++) xored += String.fromCharCode(hex.charCodeAt(i) ^ xorKey.charCodeAt(i % xorKey.length));
            var shifted = xored.split('').map(function(c) { return String.fromCharCode(c.charCodeAt(0) - 3); }).join('');
            return atob(shifted);
        },
        "JoAHUMCLXV": function(s) {
            var r = s.split('').reverse().join('').replace(/-/g, '+').replace(/_/g, '/');
            var d = atob(r);
            return d.split('').map(function(c) { return String.fromCharCode(c.charCodeAt(0) - 3); }).join('');
        },
        "KJHidj7det": function(s) {
            var trimmed = s.substring(10, s.length - 16);
            var d = atob(trimmed);
            var key = "3SAY~#%Y(V%>5d/Yg$G[Lh1rK4a;7ok";
            var out = '';
            for (var i = 0; i < d.length; i++) out += String.fromCharCode(d.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            return out;
        },
        "playerjs": function(s) {
            var a = s.substring(2);
            var patterns = ["*,4).(_)()", "33-*.4/9[6", ":]&*1@@1=&", "=(=:19705/", "%?6497.[:4"];
            for (var p = 0; p < patterns.length; p++) {
                var encoded = btoa(patterns[p]);
                a = a.replace("/@#@/" + encoded, "");
            }
            return atob(a);
        }
    };

    var VSRC_DOMAINS = {
        "v1": "shadowlandschronicles.com",
        "v2": "cloudnestra.com",
        "v3": "thepixelpioneer.com",
        "v4": "putgate.org",
        "v5": ""
    };

    async function fetchVidSrcXyz(imdbId, season, episode) {
        try {
            var url = season == null
                ? "https://vidsrc-embed.su/embed/movie?imdb=" + imdbId
                : "https://vidsrc-embed.su/embed/tv?imdb=" + imdbId + "&season=" + season + "&episode=" + episode;
            var res = await http_get(url, { headers: { "User-Agent": UA } });
            if (!res || !res.body) return [];
            var doc = parseHtml(res.body);
            var iframeSrc = doc.querySelector("iframe") && doc.querySelector("iframe").getAttribute("src");
            if (!iframeSrc) return [];
            if (iframeSrc.indexOf("http") !== 0) iframeSrc = "https:" + iframeSrc;
            res = await http_get(iframeSrc, { headers: { "User-Agent": UA, "Referer": url } });
            if (!res || !res.body) return [];
            var srcMatch = res.body.match(/src:\s+'([^']+)'/);
            if (!srcMatch) return [];
            var prorcpUrl = srcMatch[1];
            var host = iframeSrc.substring(0, iframeSrc.indexOf("/", 8));
            if (prorcpUrl.indexOf("http") !== 0) prorcpUrl = host + prorcpUrl;
            var ref = prorcpUrl.indexOf("rcp") !== -1 ? prorcpUrl.substring(0, prorcpUrl.indexOf("rcp")) : prorcpUrl;
            res = await http_get(prorcpUrl, { headers: { "User-Agent": UA, "Referer": iframeSrc } });
            if (!res || !res.body) return [];
            var playerMatch = res.body.match(/Playerjs\(\{.*?file:"([^"]*)".*?\}\)/);
            var content = "", id = "";
            if (playerMatch) {
                content = playerMatch[1];
                id = "playerjs";
            } else {
                var reporting = parseHtml(res.body).querySelector("#reporting_content");
                if (!reporting) return [];
                var node = reporting.nextElementSibling;
                if (!node) return [];
                id = node.getAttribute("id") || "";
                content = node.textContent || "";
            }
            var decryptFn = VSRC_DECRYPT[id];
            if (!decryptFn) return [];
            var decrypted = decryptFn(content);
            var mirrors = decrypted.split(" or ").filter(function(u) { return u.indexOf("http") === 0; });
            var results = [];
            var placeholderRe = /\{(v\d+)\}/g;
            for (var i = 0; i < mirrors.length; i++) {
                var raw = mirrors[i];
                var verMatch = raw.match(/\{(v\d+)\}/);
                var version = verMatch ? verMatch[1] : "";
                var domain = VSRC_DOMAINS[version] || "";
                var finalUrl = domain ? raw.replace(placeholderRe, domain) : raw;
                var srvLabel = version ? "Server " + version.toUpperCase() : "";
                var displaySource = "VidsrcXYZ [" + (srvLabel || "Auto") + " - 1080p]";
                results.push(new StreamResult({ source: displaySource, name: "VidsrcXYZ" + (srvLabel ? " [" + srvLabel + "]" : ""), url: finalUrl, quality: 1080, headers: { "Referer": ref } }));
            }
            return results;
        } catch (_) { return []; }
    }

    // ───── SkyMoviesHD Stream Provider ─────
    async function resolveBusyCdn(url) {
        try {
            for (var hi = 0; hi < 5; hi++) {
                var redirectRes = await http_get(url, { redirect: "manual", headers: { "User-Agent": UA } });
                if (!redirectRes) break;
                if (redirectRes.status >= 301 && redirectRes.status <= 308) {
                    var loc = redirectRes.headers["location"] || redirectRes.headers["Location"];
                    if (!loc) break;
                    if (loc.indexOf("fastcdn-dl.pages.dev") !== -1) {
                        var urlParam = loc.match(/[?&]url=([^&]+)/);
                        if (urlParam) return decodeURIComponent(urlParam[1]);
                    }
                    url = loc.indexOf("http") === 0 ? loc : getBaseUrl(url) + (loc.indexOf("/") === 0 ? "" : "/") + loc;
                } else {
                    if (url.indexOf("fastcdn-dl.pages.dev") !== -1) {
                        var urlParam = url.match(/[?&]url=([^&]+)/);
                        if (urlParam) return decodeURIComponent(urlParam[1]);
                    }
                    break;
                }
            }
        } catch (_) {}
        return null;
    }

    async function resolveDirectStream(url) {
        var streams = [];
        var HTML_HEADERS = { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
        try {
            var lowerUrl = url.toLowerCase();
            if (lowerUrl.indexOf("pixeldrain.dev/u/") !== -1 || lowerUrl.indexOf("pixeldrain.com/u/") !== -1) {
                var pxlId = url.split("/u/")[1].split("?")[0];
                streams.push({ url: "https://pixeldrain.dev/api/file/" + pxlId + "?download", label: "Pixeldrain API" });
            } else if (lowerUrl.indexOf("filepress") !== -1) {
                var parsedUrl = String(url || "");
                var m = parsedUrl.match(/\/file\/([a-zA-Z0-9]+)/);
                var fileId = m ? m[1] : "";
                if (fileId) {
                    var initialBaseUrl = getBaseUrl(url);
                    var finalBaseUrl = initialBaseUrl;
                    var redirectCheck = await http_get(url, { redirect: "manual", headers: { "User-Agent": UA } });
                    if (redirectCheck && (redirectCheck.status === 301 || redirectCheck.status === 302 || redirectCheck.status === 307 || redirectCheck.status === 308)) {
                        var loc = redirectCheck.headers["location"] || redirectCheck.headers["Location"];
                        if (loc) {
                            if (loc.indexOf("http") === 0) {
                                finalBaseUrl = getBaseUrl(loc);
                            }
                        }
                    }
                    var getUrl = finalBaseUrl + "/api/file/get/" + fileId;
                    var detailRes = await http_get(getUrl, { headers: { "Accept": "application/json", "User-Agent": UA } });
                    if (detailRes && detailRes.body) {
                        try {
                            var detailJson = JSON.parse(detailRes.body);
                            if (detailJson && detailJson.status && detailJson.data) {
                                var downloadOptions = detailJson.data.downloadOptions || {};
                                var preferredMethod = "";
                                if (downloadOptions.indexDownlaod) preferredMethod = "indexDownlaod";
                                else if (downloadOptions.publicDownlaod) preferredMethod = "publicDownlaod";
                                else if (downloadOptions.publicUserDownlaod) preferredMethod = "publicUserDownlaod";

                                if (preferredMethod) {
                                    var postUrl = finalBaseUrl + "/api/file/downlaod/";
                                    var initPayload = {
                                        captchaValue: "",
                                        id: fileId,
                                        method: preferredMethod
                                    };
                                    var initRes = await http_post(postUrl, {
                                        headers: {
                                            "Content-Type": "application/json",
                                            "Referer": url,
                                            "Origin": finalBaseUrl
                                        },
                                        body: JSON.stringify(initPayload)
                                    });
                                    if (initRes && initRes.body) {
                                        var initJson = JSON.parse(initRes.body);
                                        if (initJson && initJson.status && initJson.data) {
                                            var taskId = initJson.data;
                                            var usesV2 = ["publicDownlaod", "privateDownlaod", "publicUserDownlaod", "indexDownlaod", "cloudDownlaod", "cloudR2Downlaod"].indexOf(preferredMethod) !== -1;
                                            var finalUrl = finalBaseUrl + "/api/file/" + (usesV2 ? "downlaod2/" : "downlaod/");
                                            var finalPayload = {
                                                captchaValue: "",
                                                id: taskId,
                                                method: preferredMethod
                                            };
                                            var finalRes = await http_post(finalUrl, {
                                                headers: {
                                                    "Content-Type": "application/json",
                                                    "Referer": url,
                                                    "Origin": finalBaseUrl
                                                },
                                                body: JSON.stringify(finalPayload)
                                            });
                                            if (finalRes && finalRes.body) {
                                                var finalJson = JSON.parse(finalRes.body);
                                                if (finalJson && finalJson.status && finalJson.data) {
                                                    var dlLinks = finalJson.data;
                                                    if (Array.isArray(dlLinks)) {
                                                        for (var li = 0; li < dlLinks.length; li++) {
                                                            if (dlLinks[li]) streams.push({ url: dlLinks[li], label: "FilePress Direct", referer: finalBaseUrl + "/", skip_filter: true });
                                                        }
                                                    } else if (typeof dlLinks === "string" && dlLinks) {
                                                        streams.push({ url: dlLinks, label: "FilePress Direct", referer: finalBaseUrl + "/", skip_filter: true });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (_) {}
                    }
                }
            } else if (lowerUrl.indexOf("gdflix.dev/file/") !== -1) {
                var html = await fetchUrl(url, HTML_HEADERS);
                if (html) {
                    var busyM = html.match(/href="([^"]*instant\.busycdn\.xyz[^"]*)"/i);
                    if (busyM) {
                        var busyUrl = await resolveBusyCdn(busyM[1]);
                        if (busyUrl) streams.push({ url: busyUrl, label: "GDFlix Instant Direct" });
                    }
                    var fastM = html.match(/href="([^"]*gdflix\.dev\/zfile\/[^"]*)"/i);
                    if (fastM) streams.push({ url: fastM[1], label: "GDFlix Fast Cloud" });
                }
            } else if (lowerUrl.indexOf("hubcloud") !== -1 || lowerUrl.indexOf("vcloud") !== -1) {
                var html = await fetchUrl(url, HTML_HEADERS);
                if (html) {
                    var genM = html.match(/href="([^"]*gamerxyt\.com\/hubcloud\.php[^"]*)"/i);
                    if (genM) {
                        var genUrl = genM[1].replace(/&amp;/g, "&");
                        var genHtml = await fetchUrl(genUrl, HTML_HEADERS);
                        if (genHtml) {
                            var pxM = genHtml.match(/href="([^"]*pixel\.hubcloud\.cx[^"]*)"/i);
                            if (pxM) streams.push({ url: pxM[1], label: "HubCloud 10Gbps" });
                            var pxlM = genHtml.match(/var\s+pxl\s*=\s*["']([^"']+)["']/);
                            if (pxlM) {
                                var pxlId = pxlM[1].split("/u/")[1];
                                streams.push({ url: "https://pixeldrain.dev/api/file/" + pxlId + "?download", label: "HubCloud Pixeldrain" });
                            }
                            var buzzM = genHtml.match(/href="([^"]*bzzhr\.co[^"]*)"/i);
                            if (buzzM) streams.push({ url: buzzM[1], label: "HubCloud Buzz" });
                            var zipM = genHtml.match(/href="([^"]*workers\.dev\/[^"]*\.zip)"/i);
                            if (zipM) streams.push({ url: zipM[1], label: "HubCloud ZipDisk" });
                        }
                    }
                }
            } else if (lowerUrl.indexOf("voe.sx/") !== -1) {
                // Decrypt VOE player stream URL
                var html = await fetchUrl(url, HTML_HEADERS);
                if (html) {
                    var redirM = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                    if (redirM) {
                        var redirHtml = await fetchUrl(redirM[1], HTML_HEADERS);
                        if (redirHtml) {
                            var decrypted = false;
                            var jsonM = redirHtml.match(/<script type="application\/json">(\[.*?\])<\/script>/);
                            if (jsonM) {
                                try {
                                    var arr = JSON.parse(jsonM[1]);
                                    var str = arr[0];
                                    var rot = str.replace(/[a-zA-Z]/g, function(c) {
                                        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
                                    });
                                    var clean = rot.replace(/[^a-zA-Z0-9+\/=]/g, '');
                                    var bin = atob(clean);
                                    var shifted = [];
                                    for (var i = bin.length - 1; i >= 0; i--) {
                                        shifted.push(String.fromCharCode((bin.charCodeAt(i) - 3 + 256) % 256));
                                    }
                                    var finalClean = shifted.join('').replace(/[^a-zA-Z0-9+\/=]/g, '');
                                    var decryptedJson = JSON.parse(atob(finalClean));
                                    if (decryptedJson) {
                                        if (decryptedJson.source) {
                                            streams.push({ url: decryptedJson.source, label: "VOE Playback HLS" });
                                            decrypted = true;
                                        }
                                        if (decryptedJson.direct_access_url) {
                                            streams.push({ url: decryptedJson.direct_access_url, label: "VOE Direct MP4" });
                                            decrypted = true;
                                        }
                                    }
                                } catch (_) {}
                            }
                            if (!decrypted) {
                                var srcM = redirHtml.match(/var\s+source\s*=\s*['"]([^'"]+)['"]/);
                                if (srcM && srcM[1].indexOf("test-videos.co.uk") === -1) {
                                    streams.push({ url: srcM[1], label: "VOE Direct" });
                                }
                                var dlPageM = redirHtml.match(/href="([^"]*\/download)"/i);
                                if (dlPageM) {
                                    var dlHtml = await fetchUrl(dlPageM[1], HTML_HEADERS);
                                    if (dlHtml) {
                                        var dlRedir = dlHtml.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                                        if (dlRedir) {
                                            var targetHtml = await fetchUrl(dlRedir[1], HTML_HEADERS);
                                            if (targetHtml) {
                                                var finalDl = targetHtml.match(/href="([^"]*)"[^>]*class="[^"]*(?:btn-primary|download-user-file)/i) || targetHtml.match(/class="[^"]*(?:btn-primary|download-user-file)"[^>]*href="([^"]*)"/i);
                                                if (finalDl) streams.push({ url: finalDl[1], label: "VOE Download File" });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (lowerUrl.indexOf("multicloudlinks") !== -1) {
                // Manual redirect chain to ensure we get the final HTML page
                var mcUrl = url;
                for (var mci = 0; mci < 5; mci++) {
                    var mcRes = await http_get(mcUrl, { redirect: "manual", headers: { "User-Agent": UA, "Accept": "text/html,*/*" } });
                    if (!mcRes) break;
                    if (mcRes.status >= 301 && mcRes.status <= 308) {
                        var newLoc = mcRes.headers["location"] || mcRes.headers["Location"];
                        if (!newLoc) break;
                        mcUrl = newLoc.indexOf("http") === 0 ? newLoc : getBaseUrl(mcUrl) + (newLoc.indexOf("/") === 0 ? "" : "/") + newLoc;
                        continue;
                    }
                    // Got final page — extract download links
                    var body = mcRes.body || "";
                    if (body) {
                        // 1) Turbo download (dr*.multidownload.shop)
                        var turboM = body.match(/href=['"]([^'"]*multidownload\.shop\/d\/[^'"]+)['"]/i);
                        if (turboM) {
                            var tu = turboM[1].replace(/&amp;/g, '&');
                            if (tu.indexOf("action=download") === -1) {
                                tu += (tu.indexOf("?") !== -1 ? "&" : "?") + "action=download";
                            }
                            streams.push({ url: tu, label: "MultiCloud Turbo" });
                            break;
                        }
                        // 2) Direct download (cgd*.multicloudlinks.com)
                        var cgdM = body.match(/href=['"](https?:\/\/cgd\d+\.multicloudlinks\.com\/[^'"]+)['"]/i);
                        if (cgdM) {
                            streams.push({ url: cgdM[1], label: "MultiCloud Direct" });
                            break;
                        }
                        // 3) Any multidownload.shop link
                        var anyM = body.match(/href=['"]([^'"]*multidownload\.shop\/[^'"]+)['"]/i);
                        if (anyM) {
                            streams.push({ url: anyM[1].replace(/&amp;/g, '&'), label: "MultiCloud Download" });
                            break;
                        }
                    }
                    break;
                }
            } else if (lowerUrl.indexOf("uploadflix") !== -1) {
                var ufUrl = url;
                for (var ufi = 0; ufi < 5; ufi++) {
                    var ufRes = await http_get(ufUrl, { redirect: "manual", headers: { "User-Agent": UA, "Accept": "text/html,*/*" } });
                    if (!ufRes) break;
                    if (ufRes.status >= 301 && ufRes.status <= 308) {
                        var newLoc = ufRes.headers["location"] || ufRes.headers["Location"];
                        if (!newLoc) break;
                        ufUrl = newLoc.indexOf("http") === 0 ? newLoc : getBaseUrl(ufUrl) + (newLoc.indexOf("/") === 0 ? "" : "/") + newLoc;
                        continue;
                    }
                    var ufBody = ufRes.body || "";
                    if (ufBody) {
                        // 1) secure-storage.top direct link
                        var ssM = ufBody.match(/href=['"](https?:\/\/[^'"]*secure-storage\.top[^'"]+)['"]/i);
                        if (ssM) { streams.push({ url: ssM[1], label: "UploadFlix Direct" }); break; }
                        // 2) kingfiles.club direct link
                        var kfM = ufBody.match(/href=['"](https?:\/\/[^'"]*kingfiles\.club[^'"]+)['"]/i);
                        if (kfM) { streams.push({ url: kfM[1], label: "UploadFlix Direct" }); break; }
                        // 3) anchor wrapping "Create Download Link" button
                        var cdM = ufBody.match(/href=['"]([^'"]+)['"][^>]*>[\s\S]{0,500}Create Download Link/i);
                        if (cdM) { streams.push({ url: cdM[1], label: "UploadFlix Direct" }); break; }
                    }
                    break;
                }
            } else if (lowerUrl.indexOf("uploadhub") !== -1) {
                var uhUrl = url;
                for (var uhi = 0; uhi < 5; uhi++) {
                    var uhRes = await http_get(uhUrl, { redirect: "manual", headers: { "User-Agent": UA, "Accept": "text/html,*/*" } });
                    if (!uhRes) break;
                    if (uhRes.status >= 301 && uhRes.status <= 308) {
                        var newLoc = uhRes.headers["location"] || uhRes.headers["Location"];
                        if (!newLoc) break;
                        uhUrl = newLoc.indexOf("http") === 0 ? newLoc : getBaseUrl(uhUrl) + (newLoc.indexOf("/") === 0 ? "" : "/") + newLoc;
                        continue;
                    }
                    var uhBody = uhRes.body || "";
                    if (uhBody) {
                        var idM = uhBody.match(/name="id"\s+value="([^"]+)"/i);
                        if (idM) {
                            var postRes = await http_post(uhUrl, {
                                headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": getBaseUrl(uhUrl), "Referer": uhUrl },
                                body: "op=download2&id=" + encodeURIComponent(idM[1]) + "&rand=&referer=&method_free=1&method_premium=&adblock_detected=0"
                            });
                            if (postRes && postRes.body) {
                                var dlM = postRes.body.match(/id="direct_link"[^>]*>[\s\S]*?href=['"]([^'"]+)['"]/i);
                                if (dlM) {
                                    streams.push({ url: dlM[1], label: "UploadHub Direct" });
                                }
                            }
                        }
                    }
                    break;
                }
            } else if (lowerUrl.indexOf("streamtape") !== -1 || lowerUrl.indexOf("tpead.net") !== -1) {
                var html = await fetchUrl(url, HTML_HEADERS);
                if (html) {
                    var tapeM = html.match(/id="ideoooolink"[^>]*>([^<]+)/i);
                    if (tapeM) {
                        var path = tapeM[1];
                        var originalBase = getBaseUrl(url);
                        var matchDom = path.match(/^\/[^\/]+\/(get_video.*)/);
                        if (matchDom) {
                            path = "/" + matchDom[1];
                        }
                        streams.push({ url: originalBase + path, label: "Streamtape Stream" });
                    }
                }
            }
        } catch (_) {}
        return streams;
    }

    function skyParseTitle(raw) {
        var t = cleanText(raw);
        var y = null, ym = t.match(/\((\d{4})\)/);
        if (ym) y = parseInt(ym[1], 10);
        var title = t
            .replace(/\((\d{4})\)/, " ")
            .replace(/\s*\[.*?\]/g, " ")
            .replace(/\s*\d{3,4}p\s*/i, " ")
            .replace(/\s*(?:HEVC|HDRip|x264|x265|AAC|ESubs?|UNRATED|10Bit|HC|ORG|CAMRip|HDRip|PREHD|HDTC|WEB\s*DL|HDTV|DVD\s*Rip|BRRip|BluRay)\s*/gi, " ")
            .replace(/\s*(?:DDP5[.]1|AC3|5[.]1|2[.]0)\s*/gi, " ")
            .replace(/\s*(?:Hindi|English|Tamil|Telugu|Urdu|Bengali|Punjabi|Marathi|Gujarati|Malayalam|Kannada|Bhojpuri|Oriya|Assamese|Dual\s*Audio|Pakistani|Bangladeshi)\s*/gi, " ")
            .replace(/\s+Dubbed\s+/gi, " ")
            .replace(/\s+HQ\s+/gi, " ")
            .replace(/\s*(?:Full\s+)?(?:South\s+)?Movie/gi, " ")
            .replace(/\s*Complete\s+Series.*/i, " ")
            .replace(/\s*Web\s+Series.*/i, " ")
            .replace(/\s+S\d{2}E?\d{0,2}\s*/i, " ")
            .replace(/[|]/g, " ")
            .replace(/\./g, " ")
            .replace(/\s+(?:South|Full|ORG|Original|Dubbed|Hollywood|Bollywood)\s*/gi, " ")
            .replace(/\s+Movie\s*/gi, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        return { title: title || t, year: y };
    }

    async function fetchSkyMoviesHD(tmdbId, season, episode) {
        try {
            // Get TMDB details for title/year
            var details = _tmdbCache[tmdbId] || await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (!details) return [];
            var searchTitle = details.title || details.name || "";
            var searchYear = (details.release_date || details.first_air_date || "").split("-")[0];

            // Search skymovieshd
            var q = encodeURIComponent(cleanText(searchTitle));
            var res = await http_get(SKY_API + "/search.php?search=" + q + "&cat=All", { headers: H_SKY });
            if (!res || !res.body) return [];

            var doc = parseHtml(res.body);
            var anchors = doc.querySelectorAll("a[href*='/movie/']");
            var matches = [];
            for (var ai = 0; ai < anchors.length; ai++) {
                var href = anchors[ai].getAttribute("href");
                var text = cleanText(anchors[ai].textContent);
                if (!href || !text) continue;

                var parsed = skyParseTitle(text);
                var score = 0;
                if (parsed.title.toLowerCase() === searchTitle.toLowerCase()) score += 5;
                else if (parsed.title.toLowerCase().indexOf(searchTitle.toLowerCase()) !== -1) score += 3;
                if (parsed.year && searchYear && parsed.year === parseInt(searchYear, 10)) score += 2;

                if (score >= 5) {
                    if (href.indexOf("/") !== 0) href = "/" + href;
                    var dup = false;
                    for (var mi = 0; mi < matches.length; mi++) {
                        if (matches[mi].href === href) { dup = true; break; }
                    }
                    if (!dup) matches.push({ href: href, score: score });
                }
            }

            if (matches.length === 0) {
                for (var ai = 0; ai < anchors.length; ai++) {
                    var href = anchors[ai].getAttribute("href");
                    var text = cleanText(anchors[ai].textContent);
                    if (!href || !text) continue;

                    var parsed = skyParseTitle(text);
                    var score = 0;
                    if (parsed.title.toLowerCase().indexOf(searchTitle.toLowerCase()) !== -1) score += 3;
                    if (parsed.year && searchYear && parsed.year === parseInt(searchYear, 10)) score += 2;

                    if (score >= 3) {
                        if (href.indexOf("/") !== 0) href = "/" + href;
                        var dup = false;
                        for (var mi = 0; mi < matches.length; mi++) {
                            if (matches[mi].href === href) { dup = true; break; }
                        }
                        if (!dup) matches.push({ href: href, score: score });
                    }
                }
            }

            if (matches.length === 0) return [];

            // Scrape up to 3 matching pages for multiple qualities
            matches.sort(function(a, b) { return b.score - a.score; });
            var slicedMatches = matches.slice(0, 3);

            var results = [];
            var seenUrls = {};
            var seenHr = {};
            var seenCandidates = {};

            // 1. Fetch all quality page HTML contents in parallel
            var prs = await Promise.all(slicedMatches.map(function(match) {
                return http_get(SKY_API + match.href, { headers: H_SKY });
            }));

            // 2. Extract anchors & details from all page bodies
            var pageData = [];
            for (var mi = 0; mi < prs.length; mi++) {
                var pr = prs[mi];
                if (!pr || !pr.body) continue;
                var anchors2 = parseHtml(pr.body).querySelectorAll("a");
                var quality = 1080;
                var titleM = pr.body.match(/<title>([^<]+)<\/title>/i);
                var qm = (titleM ? titleM[1] : "").match(/(\d{3,4})[pP]/);
                if (qm) quality = parseInt(qm[1], 10);
                pageData.push({ anchors: anchors2, quality: quality });
            }

            // 3. Collect unique HRs that need to be fetched (e.g. howblogs.xyz) and non-howblogs candidate URLs
            var hrList = [];
            var directCandidates = []; // For other direct links like voe, streamtape, pixeldrain, hubcloud
            var hrToQualityAndText = {}; // To preserve quality & text when howblogs resolves

            for (var pd = 0; pd < pageData.length; pd++) {
                var anchors2 = pageData[pd].anchors;
                var quality = pageData[pd].quality;
                for (var bi = 0; bi < anchors2.length; bi++) {
                    var hr = anchors2[bi].getAttribute("href") || "";
                    var txt = cleanText(anchors2[bi].textContent);
                    if (!/howblogs\.xyz|tpead\.net|hubcloud|cinedrive|gdflix|hubdrive|filepress|gofile|voe|streamtape|pixeldrain|multicloudlinks|uploadflix|uploadhub|busycdn/i.test(hr)) continue;
                    if (seenHr[hr]) continue;
                    seenHr[hr] = true;

                    if (hr.indexOf("howblogs.xyz") !== -1) {
                        hrList.push(hr);
                        hrToQualityAndText[hr] = { quality: quality, txt: txt };
                    } else {
                        directCandidates.push({ url: hr, quality: quality, txt: txt });
                    }
                }
            }

            // 4. Fetch all howblogs pages in parallel
            var howblogsResponses = await Promise.all(hrList.map(function(hr) {
                return http_get(hr, { headers: H_SKY }).then(function(res) {
                    return { hr: hr, body: res ? (res.body || res.text || "") : "" };
                });
            }));

            // 5. Parse howblogs bodies to get final candidate URLs
            var allCandidates = []; // Array of { url, quality, txt }
            for (var h = 0; h < howblogsResponses.length; h++) {
                var hbr = howblogsResponses[h];
                if (!hbr || !hbr.body) continue;
                var meta = hrToQualityAndText[hbr.hr];
                var hbdoc = parseHtml(hbr.body);
                var hbAs = hbdoc.querySelectorAll("a");
                for (var hi = 0; hi < hbAs.length; hi++) {
                    var hbHref = hbAs[hi].getAttribute("href") || "";
                    if (hbHref.indexOf("http") === 0 && !hbHref.includes("howblogs")) {
                        allCandidates.push({ url: hbHref, quality: meta.quality, txt: meta.txt });
                    }
                }
            }
            // Add direct candidates
            allCandidates = allCandidates.concat(directCandidates);

            // 6. Deduplicate all candidates
            var uniqueCandidates = [];
            for (var c = 0; c < allCandidates.length; c++) {
                var cand = allCandidates[c];
                if (seenCandidates[cand.url]) continue;
                seenCandidates[cand.url] = true;
                uniqueCandidates.push(cand);
            }

            // 7. Resolve all direct streams in parallel!
            var resolvedResults = await Promise.all(uniqueCandidates.map(function(cand) {
                return resolveDirectStream(cand.url).then(function(streams) {
                    return { cand: cand, streams: streams };
                });
            }));

            // 8. Build final results
            for (var r = 0; r < resolvedResults.length; r++) {
                var cand = resolvedResults[r].cand;
                var directStreams = resolvedResults[r].streams;
                if (directStreams && directStreams.length > 0) {
                    for (var ds = 0; ds < directStreams.length; ds++) {
                        var sUrl = directStreams[ds].url;
                        if (seenUrls[sUrl]) continue;
                        seenUrls[sUrl] = true;
                        var isParallel = (/pixeldrain|hubcloud|gdflix|hubdrive|filepress|gofile|cinedrive/i.test(sUrl) || /pixeldrain|hubcloud|gdflix|hubdrive|filepress|gofile|cinedrive/i.test(cand.url))
                             && !/\.(m3u8|mpd|ts)($|\?)/i.test(sUrl)
                             && sUrl.indexOf("master.m3u8") === -1
                             && sUrl.indexOf("/hls2") === -1
                             && sUrl.indexOf("/urlset/") === -1;
                        results.push(new StreamResult({
                            source: "SkyMoviesHD [" + directStreams[ds].label + "]",
                            name: "SkyMoviesHD [" + directStreams[ds].label + "]",
                            url: sUrl,
                            quality: cand.quality,
                            headers: { "User-Agent": UA, "Referer": directStreams[ds].referer || (getBaseUrl(cand.url) + "/") },
                            parallel: isParallel,
                            skip_filter: directStreams[ds].skip_filter
                        }));
                    }
                } else {
                    if (seenUrls[cand.url]) continue;
                    seenUrls[cand.url] = true;
                    var isParallel = /pixeldrain|hubcloud|gdflix|hubdrive|filepress|gofile|cinedrive/i.test(cand.url)
                         && !/\.(m3u8|mpd|ts)($|\?)/i.test(cand.url)
                         && cand.url.indexOf("master.m3u8") === -1
                         && cand.url.indexOf("/hls2") === -1
                         && cand.url.indexOf("/urlset/") === -1;
                    results.push(new StreamResult({
                        source: "SkyMoviesHD [" + cand.txt + "]",
                        name: "SkyMoviesHD [" + cand.txt + "]",
                        url: cand.url,
                        quality: cand.quality,
                        headers: { "User-Agent": UA, "Referer": SKY_API + "/" },
                        parallel: isParallel
                    }));
                }
            }

            return results;
        } catch (_) { return []; }
    }

    // ───── Provider: VidCore ─────
    async function fetchVidCore(tmdbId, season, episode) {
        try {
            var api = "https://enc-dec.app/api";
            var baseUrl = season == null
                ? "https://vidcore.net/movie/" + tmdbId
                : "https://vidcore.net/tv/" + tmdbId + "/" + season + "/" + episode;
            var pageRes = await http_get(baseUrl, { headers: { "User-Agent": UA, "Referer": "https://vidcore.net/", "X-Requested-With": "XMLHttpRequest" } });
            if (!pageRes || !pageRes.body) return [];
            var encMatch = pageRes.body.match(/\\"en\\":\\"(.*?)\\"/);
            if (!encMatch) return [];
            var text = encMatch[1];

            var encRes = await http_get(api + "/enc-vidcore?text=" + encodeURIComponent(text), { headers: { "User-Agent": UA } });
            if (!encRes || !encRes.body) return [];
            var parts = JSON.parse(encRes.body);
            if (parts.status !== 200) return [];
            var servers = parts.result.servers;
            var stream = parts.result.stream;
            var token = parts.result.token;
            var version = parts.result.version || "1";

            var baseHeaders = { "User-Agent": UA, "Referer": "https://vidcore.net/", "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": token };

            var serversEnc = await http_post(servers, { headers: baseHeaders });
            if (!serversEnc || !serversEnc.body) return [];

            var decRes = await http_post(api + "/dec-vidcore", {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: serversEnc.body, version: version })
            });
            if (!decRes || !decRes.body) return [];
            var serversDec = JSON.parse(decRes.body);
            if (serversDec.status !== 200) return [];
            var serversList = serversDec.result;
            if (!Array.isArray(serversList)) return [];

            var results = [];
            await Promise.all(serversList.map(async function(srv) {
                try {
                    var name = srv.name || "Server";
                    var data = srv.data;
                    if (!data) return;
                    var streamUrl = stream + "/" + data;
                    var streamEnc = await http_post(streamUrl, { headers: baseHeaders, body: "" });
                    if (!streamEnc || !streamEnc.body) return;

                    var decStreamRes = await http_post(api + "/dec-vidcore", {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: streamEnc.body, version: version })
                    });
                    if (!decStreamRes || !decStreamRes.body) return;
                    var decStream = JSON.parse(decStreamRes.body);
                    if (decStream.status !== 200) return;
                    var finalUrl = decStream.result && decStream.result.url;
                    if (!finalUrl) return;
                    results.push(new StreamResult({ source: "VidCore [" + name + " - 1080p]", name: "VidCore [" + name + "]", url: finalUrl, quality: 1080, headers: { "Referer": "https://vidcore.net/" } }));
                } catch (_) {}
            }));
            return results;
        } catch (_) { return []; }
    }

    // ───── Provider: VidSync ─────
    var VIDSYNC_SERVERS = ["cinevault", "cinedub", "cinebox", "cineflix", "cinevip", "cinecloud", "cine4k"];
    async function fetchVidSync(tmdbId, season, episode) {
        try {
            var api = "https://enc-dec.app/api";
            var details = _tmdbCache[tmdbId] || await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (!details) return [];
            var title = details.title || details.name || "";
            var year = (details.release_date || details.first_air_date || "").split("-")[0];
            if (!title || !year) return [];

            var tokenResp = await http_get(api + "/enc-vidsync", { headers: HEADERS });
            if (!tokenResp || !tokenResp.body) return [];
            var tokenData = JSON.parse(tokenResp.body);
            if (tokenData.status !== 200) return [];
            var turnstileToken = tokenData.result && tokenData.result.token;
            if (!turnstileToken) return [];

            var qTitle = encodeURIComponent(title).replace(/%20/g, "+");
            var mediaType = season == null ? "movie" : "tv";
            var baseHeaders = { "User-Agent": UA, "Origin": "https://vidsync.xyz", "Referer": "https://vidsync.xyz/", "X-Requested-With": "XMLHttpRequest", "Accept": "*/*", "X-Cf-Turnstile": turnstileToken };

            var results = [];
            await Promise.all(VIDSYNC_SERVERS.map(async function(server) {
                try {
                    var fetchUrl = "https://vidsync.xyz/api/stream/fetch?title=" + qTitle + "&type=" + mediaType + "&releaseYear=" + year + "&mediaId=" + tmdbId + "&serverName=" + server;
                    if (season != null) fetchUrl += "&season=" + season + "&episode=" + episode;

                    var encResp = await http_get(fetchUrl, { headers: baseHeaders });
                    if (!encResp || !encResp.body) return;

                    var decResp = await http_post(api + "/dec-vidsync", {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: encResp.body, id: tmdbId })
                    });
                    if (!decResp || !decResp.body) return;
                    var decData = JSON.parse(decResp.body);
                    if (decData.status !== 200) return;
                    var streamData = decData.result;
                    if (!streamData) return;

                    var url = typeof streamData === "string" ? streamData : (streamData.url || streamData.file || "");
                    if (url) {
                        results.push(new StreamResult({ source: "VidSync [" + server.toUpperCase() + " - 1080p]", name: "VidSync [" + server.toUpperCase() + "]", url: url, quality: 1080, headers: H_VIDSYNC }));
                    }
                } catch (_) {}
            }));
            return results;
        } catch (_) { return []; }
    }

    // ───── Provider: MovieLinkBD ─────
    function mlbdCleanText(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

    function mlbdDecode(v) {
        return String(v || "").replace(/&#(\d+);/g, function(_, c) { return String.fromCharCode(Number(c)); }).replace(/&#x([0-9a-f]+);/gi, function(_, c) { return String.fromCharCode(parseInt(c, 16)); }).replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
    }

    function mlbdFixUrl(u) {
        if (!u) return ""; u = mlbdDecode(String(u).trim());
        if (u.indexOf("://") > 0) return u;
        if (u.indexOf("//") === 0) return "https:" + u;
        return MOVIELINKBD_BASE + (u.indexOf("/") === 0 ? "" : "/") + u;
    }

    function mlbdExtractGetLinks(html) {
        var links = [];
        var seen = {};
        var re = /<a[^>]+href="(\/getLink\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = re.exec(html))) {
            if (seen[m[1]]) continue; seen[m[1]] = true;
            var text = mlbdCleanText(m[2].replace(/<[^>]+>/g, " "));
            var quality = "Auto", size = "";
            var qm = text.match(/(\d{3,4})\s*p/i);
            if (qm) quality = qm[1] + "p";
            var sm = text.match(/([\d.]+)\s*(MB|GB|KB)/i);
            if (sm) size = sm[1] + " " + sm[2];
            links.push({ url: mlbdFixUrl(m[1]), quality: quality, size: size });
        }
        if (links.length === 0) {
            re = /href="(\/getLink\/[^"]+)"/gi;
            while ((m = re.exec(html))) {
                if (seen[m[1]]) continue; seen[m[1]] = true;
                var ctx = html.substring(Math.max(0, m.index - 200), m.index + 300);
                var qm = ctx.match(/(\d{3,4})\s*p/i);
                links.push({ url: mlbdFixUrl(m[1]), quality: qm ? qm[1] + "p" : "Auto", size: "" });
            }
        }
        return links;
    }

    function mlbdGetFileUrl(html) {
        var m = /href="(\/file\/[^"]+)"/i.exec(html);
        return m ? mlbdFixUrl(m[1]) : null;
    }

    function mlbdGetTokenUrl(html) {
        var m = /href="(\/file\/[^"]+\?token=[^"]+)"/i.exec(html);
        if (m) return mlbdFixUrl(m[1]);
        m = /href="(\/file\/[^"]+\?[a-z]+=[^"]+)"/i.exec(html);
        return m ? mlbdFixUrl(m[1]) : null;
    }

    function mlbdClassifyUrl(url) {
        if (!url) return null;
        var u = url.toLowerCase();
        if (u.indexOf("instantcloud") >= 0) return "InstantCloud";
        if (u.indexOf(".r2.dev") >= 0 || u.indexOf("cloudflare") >= 0 || u.indexOf("fastcloud") >= 0) return "FastCloud";
        if (u.indexOf("movielinkbd.mom") >= 0 || u.indexOf("movielinkbd.") >= 0) return "Mirror-" + u.match(/\/\/([^.]+)\./)?.[1] || "Mirror";
        if (u.indexOf("/open/") >= 0) return "Direct";
        if (u.indexOf("/download/") >= 0) return "CloudDownloader";
        if (u.indexOf("play.") >= 0 && u.match(/\/watch\//)) return "Stream";
        return null;
    }

    function mlbdExtractFinal(html) {
        var results = [];
        var seen = {};
        var re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = re.exec(html))) {
            var url = mlbdFixUrl(m[1]);
            if (!url || seen[url]) continue; seen[url] = true;
            if (url.indexOf(MOVIELINKBD_BASE) === 0 && url.indexOf("/getLink/") < 0 && url.indexOf("/file/") < 0 && url.indexOf("/getWatch/") < 0) {
                var name = mlbdClassifyUrl(url);
                if (name) results.push({ url: url, name: name });
            }
            if (url.indexOf("http") === 0 && url.indexOf(MOVIELINKBD_BASE) !== 0 && url.indexOf("cloudflare.com") < 0) {
                var name = mlbdClassifyUrl(url);
                if (name) results.push({ url: url, name: name });
            }
        }
        var sm = /const\s+SRC\s*=\s*"([^"]+)"/.exec(html);
        if (sm) {
            var su = mlbdDecode(sm[1].replace(/\\\//g, "/"));
            if (!seen[su]) { seen[su] = true; results.push({ url: su, name: "Stream" }); }
        }
        return results;
    }

    async function mlbdResolve(getLinkUrl, quality) {
        var fallback = null;
        try {
            var res = await http_get(getLinkUrl, { headers: H_MOVIELINKBD });
            if (res && res.body) {
                var fileUrl = mlbdGetFileUrl(res.body);
                if (fileUrl) {
                    fallback = [{ url: fileUrl, name: "FileRedirect", quality: quality }];
                    var res2 = await http_get(fileUrl, { headers: H_MOVIELINKBD });
                    if (res2 && res2.body) {
                        var tokenUrl = mlbdGetTokenUrl(res2.body);
                        if (tokenUrl) {
                            fallback = [{ url: tokenUrl, name: "TokenRedirect", quality: quality }];
                            var res3 = await http_get(tokenUrl, { headers: H_MOVIELINKBD });
                            if (res3 && res3.body) {
                                var links = mlbdExtractFinal(res3.body);
                                if (links && links.length > 0) {
                                    links.forEach(function(l) { l.quality = quality; });
                                    return links;
                                }
                            }
                        }
                    }
                }
            }
        } catch (_) {}
        return fallback;
    }

    async function fetchMovieLinkBD(tmdbId, season, episode) {
        try {
            var details = _tmdbCache[tmdbId] || await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (!details) return [];
            var title = details.title || details.name || "";
            var year = (details.release_date || details.first_air_date || "").split("-")[0];
            if (!title) return [];

            var searchRes = await http_get(MOVIELINKBD_BASE + "/search?q=" + encodeURIComponent((title + " " + year).trim()), { headers: H_MOVIELINKBD });
            if (!searchRes || !searchRes.body) return [];

            var movieUrl = null;
            var seenUrls = {};
            var searchRe = /<a[^>]+href="((?:https?:)?\/\/[^"']+\/(?:movie|series)\/[^"']+)"[^>]*>/gi;
            var sm;
            while ((sm = searchRe.exec(searchRes.body))) {
                var u = sm[1].indexOf("http") === 0 ? sm[1] : (MOVIELINKBD_BASE + sm[1]);
                if (seenUrls[u]) continue; seenUrls[u] = true;
                var ctx = searchRes.body.substring(Math.max(0, sm.index - 200), sm.index + 100);
                var tt = ctx.match(/(?:alt|title)="([^"]+)"/i);
                var t = tt ? mlbdCleanText(tt[1]) : "";
                if (!t) { var tt2 = ctx.replace(/<[^>]+>/g, " ").match(title.substring(0, 15).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); if (tt2) t = tt2[0]; }
                var tl = t.toLowerCase(), titleL = title.toLowerCase();
                if (tl && (tl.indexOf(titleL.substring(0, Math.min(12, titleL.length))) >= 0 || titleL.indexOf(tl.substring(0, Math.min(12, tl.length))) >= 0)) {
                    movieUrl = u; break;
                }
            }
            if (!movieUrl) {
                for (var u2 in seenUrls) { movieUrl = u2; break; }
            }
            if (!movieUrl) return [];

            var movieRes = await http_get(movieUrl, { headers: H_MOVIELINKBD });
            if (!movieRes || !movieRes.body) return [];

            var getLinks = mlbdExtractGetLinks(movieRes.body);
            if (getLinks.length === 0) return [];

            var results = [];
            var resolveCalls = getLinks.map(function(gl) {
                return mlbdResolve(gl.url, gl.quality).then(function(finalLinks) {
                    var qVal = parseInt(gl.quality, 10) || 0;
                    if (finalLinks && finalLinks.length > 0) {
                        finalLinks.forEach(function(fl) {
                            results.push(new StreamResult({ source: "MovieLinkBD [" + fl.name + " - " + gl.quality + "]", url: fl.url, quality: qVal, headers: H_MOVIELINKBD }));
                        });
                    } else {
                        results.push(new StreamResult({ source: "MovieLinkBD [GetLink - " + gl.quality + "]", url: gl.url, quality: qVal, headers: H_MOVIELINKBD }));
                    }
                });
            });
            await Promise.all(resolveCalls);
            return results;
        } catch (_) { return []; }
    }

    // ─ Provider timeout + circuit breaker ─────
    var FLUX_TIMEOUT_MS = 12000;
    var FLUX_MAX_FAILURES = 2;

    function fluxTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise(function(r) { setTimeout(function() { r([]); }, ms); })
        ]);
    }

    function fluxStream(providerFn, name, failMap) {
        return function() {
            if ((failMap[name] || 0) >= FLUX_MAX_FAILURES) return Promise.resolve([]);
            return fluxTimeout(providerFn.apply(null, arguments), FLUX_TIMEOUT_MS).then(function(r) {
                if (!r || (Array.isArray(r) && r.length === 0)) {
                    failMap[name] = (failMap[name] || 0) + 1;
                } else {
                    failMap[name] = 0;
                }
                return r;
            });
        };
    }

    // ───── loadStreams ─────
    async function loadStreams(data, cb) {
        try {
            var links = [];
            try { links = JSON.parse(data); } catch(_) { links = [{ url: data }]; }
            if (!Array.isArray(links)) links = [links];

            var tmdbId, season, episode;
            links.forEach(function(link) {
                var url = (link && (link.url || link)) || "";
                if (url.indexOf("tmdb://episode/") === 0) {
                    var p = url.replace("tmdb://episode/", "").split("/");
                    tmdbId = p[0]; season = parseInt(p[1], 10); episode = parseInt(p[2], 10);
                } else if (url.indexOf("tmdb://movie/") === 0) {
                    tmdbId = url.replace("tmdb://movie/", "");
                } else if (url.indexOf("tmdb://tv/") === 0) {
                    tmdbId = url.replace("tmdb://tv/", "");
                }
            });

            if (!tmdbId) return cb({ success: true, data: [] });

            var imdbId = "";
            var details = await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (details) _tmdbCache[tmdbId] = details;
            if (details && details.external_ids && details.external_ids.imdb_id) imdbId = details.external_ids.imdb_id;

            var failMap = {};
            var wrappedVaplayer = fluxStream(fetchVaplayer, "Vaplayer", failMap);
            var wrappedVidlink = fluxStream(fetchVidlink, "Vidlink", failMap);
            var wrappedVidEasy = fluxStream(fetchVidEasy, "VidEasy", failMap);
            var wrappedVidrock = fluxStream(fetchVidrock, "Vidrock", failMap);
            var wrappedRiveStream = fluxStream(fetchRiveStream, "RiveStream", failMap);
            var wrapped2embed = fluxStream(fetch2embed, "2embed", failMap);
            var wrappedVidSrcXyz = fluxStream(fetchVidSrcXyz, "VidSrcXyz", failMap);
            var wrappedSkyMoviesHD = fluxStream(fetchSkyMoviesHD, "SkyMoviesHD", failMap);
            var wrappedVidFast = fluxStream(fetchVidFast, "VidFast", failMap);
            var wrappedVidCore = fluxStream(fetchVidCore, "VidCore", failMap);
            var wrappedVidSync = fluxStream(fetchVidSync, "VidSync", failMap);
            var wrappedMovieLinkBD = fluxStream(fetchMovieLinkBD, "MovieLinkBD", failMap);

            var providerCalls = [
                wrappedVaplayer(tmdbId, season, episode),
                wrappedVidlink(tmdbId, season, episode),
                wrappedVidEasy(tmdbId, season, episode),
                wrappedVidrock(tmdbId, season, episode),
                wrappedRiveStream(tmdbId, season, episode),
                wrapped2embed(imdbId, season, episode),
                wrappedVidSrcXyz(imdbId, season, episode),
                wrappedSkyMoviesHD(tmdbId, season, episode),
                wrappedVidFast(tmdbId, season, episode),
                wrappedVidCore(tmdbId, season, episode),
                wrappedVidSync(tmdbId, season, episode),
                wrappedMovieLinkBD(tmdbId, season, episode)
            ];

            var settled = await Promise.allSettled(providerCalls);
            var results = [];
            var seen = {};
            settled.forEach(function(s) {
                var r = s.status === "fulfilled" ? s.value : [];
                if (Array.isArray(r)) r.forEach(function(stream) {
                    if (stream && stream.url && !seen[stream.url]) {
                        seen[stream.url] = true;
                        stream.drop_403 = true;
                        results.push(stream);
                    }
                });
            });

            results.sort(function(a, b) {
                if ((b.quality || 0) !== (a.quality || 0)) return (b.quality || 0) - (a.quality || 0);
                var aR = (a.source || "").toLowerCase().indexOf("rivestream") !== -1, bR = (b.source || "").toLowerCase().indexOf("rivestream") !== -1;
                return aR !== bR ? (aR ? 1 : -1) : (a.source || "").localeCompare(b.source || ""); // RiveStream sources last
            });
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
