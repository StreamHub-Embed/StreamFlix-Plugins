(function() {
    var TMDB_API = "https://db.videasy.to/3";
    var TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
    var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    var HEADERS = { "User-Agent": UA, "Accept": "application/json" };

    // ───── Provider header presets (from Kotlin extractors) ─────
    var H_VAPLAYER = { "Referer": "https://nextgencloudfabric.com/", "User-Agent": UA };
    var H_VIDLINK  = { "Origin": "https://vidlink.pro", "Referer": "https://vidlink.pro/", "User-Agent": UA };
    var H_VIDEASY  = { "Origin": "https://player.videasy.net", "Referer": "https://player.videasy.net/", "Accept": "*/*", "User-Agent": UA };
    var H_VIDROCK  = { "Origin": "https://vidrock.ru", "User-Agent": UA };
    var H_VIDFAST  = { "Referer": "https://vidfast.pro/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36", "X-Requested-With": "XMLHttpRequest" };
    var H_RIVESTREAM = { "User-Agent": UA };

    // ───── SkyMoviesHD Config ─────
    var SKY_API = "https://skymovieshd.ceo";
    var H_SKY = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" };

    function cleanText(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

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

            var cast = (details.credits && details.credits.cast || []).slice(0, 15).map(function(c) {
                try { return new Actor({ name: c.name, image: tmdbImage(c.profile_path, "w185"), role: c.character }); }
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

    // ───── Provider: VidEasy ─────
    async function fetchVidEasy(tmdbId, season, episode) {
        try {
            var details = await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (!details) return [];
            var title = details.title || details.name || "";
            var year = (details.release_date || details.first_air_date || "").split("-")[0];
            var imdbId = details.external_ids && details.external_ids.imdb_id;
            var imdb = imdbId != null ? imdbId : "";

            var servers = [
                "myflixerzupcloud","1movies","moviebox","primewire","m4uhd","hdmovie",
                "cdn","primesrcme","visioncine","overflix","superflix","cuevana",
                "lamovie","mb-flix"
            ];
            var q = function(t) { return encodeURIComponent(t).replace(/%20/g, "%20"); };
            var encTitle = q(q(title));

            var results = [];
            await Promise.all(servers.map(async function(srv) {
                try {
                    var srcUrl = "https://api.videasy.net/" + srv + "/sources-with-title?title=" + encTitle + "&mediaType=" + (season == null ? "movie" : "tv") + "&tmdbId=" + tmdbId + "&imdbId=" + imdb + "&year=" + year;
                    if (season != null) {
                        srcUrl += "&episodeId=" + episode + "&seasonId=" + season;
                    }

                    var encResp = await http_get(srcUrl, { headers: {
                        "User-Agent": UA, "Origin": "https://player.videasy.net", "Referer": "https://player.videasy.net/"
                    }});
                    if (!encResp || !encResp.body || encResp.status !== 200) return;

                    var decResp = await http_post("https://enc-dec.app/api/dec-videasy", {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: encResp.body, id: parseInt(tmdbId, 10) })
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
                                headers: H_VIDEASY
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

    async function vidrockEncrypt(keyB64, plaintext) {
        try {
            if (globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.subtle.encrypt) {
                var keyStr = atob(keyB64);
                var keyBytes = new Uint8Array(strToBytes(keyStr));
                var iv = keyBytes.slice(0, 16);
                var ptBytes = new Uint8Array(strToBytes(plaintext));
                var key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
                var enc = await globalThis.crypto.subtle.encrypt({ name: "AES-CBC", iv: iv }, key, ptBytes);
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
                    var streamRes = await http_post(streamUrl, { headers: baseHeaders });
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
            var details = await fetchJson(TMDB_API + "/" + (season == null ? "movie" : "tv") + "/" + tmdbId + "?append_to_response=external_ids");
            if (!details) return [];
            var searchTitle = details.title || details.name || "";
            var searchYear = (details.release_date || details.first_air_date || "").split("-")[0];

            // Search skymovieshd
            var q = encodeURIComponent(cleanText(searchTitle));
            var res = await http_get(SKY_API + "/search.php?search=" + q + "&cat=All", { headers: H_SKY });
            if (!res || !res.body) return [];

            var doc = parseHtml(res.body);
            var anchors = doc.querySelectorAll("a[href*='/movie/']");
            var bestMatch = null, bestScore = 0;

            for (var ai = 0; ai < anchors.length; ai++) {
                var href = anchors[ai].getAttribute("href");
                var text = cleanText(anchors[ai].textContent);
                if (!href || !text) continue;

                var parsed = skyParseTitle(text);
                var score = 0;
                if (parsed.title.toLowerCase() === searchTitle.toLowerCase()) score += 5;
                else if (parsed.title.toLowerCase().indexOf(searchTitle.toLowerCase()) !== -1) score += 3;
                if (parsed.year && searchYear && parsed.year === parseInt(searchYear, 10)) score += 2;
                if (score > bestScore) {
                    bestScore = score;
                    if (href.indexOf("/") !== 0) href = "/" + href;
                    bestMatch = href;
                }
            }

            if (!bestMatch) return [];

            // Scrape movie page for download links
            var pageUrl = SKY_API + bestMatch;
            var pr = await http_get(pageUrl, { headers: H_SKY });
            if (!pr || !pr.body) return [];

            var anchors2 = parseHtml(pr.body).querySelectorAll("a");
            var quality = 1080;
            var qm = pr.body.match(/(\d{3,4})[pP]/);
            if (qm) quality = parseInt(qm[1], 10);

            var results = [];
            for (var bi = 0; bi < anchors2.length; bi++) {
                var hr = anchors2[bi].getAttribute("href") || "";
                var txt = cleanText(anchors2[bi].textContent);
                if (!/howblogs\.xyz|tpead\.net|hubcloud|cinedrive|gdflix|hubdrive|filepress|gofile/i.test(hr)) continue;

                if (hr.indexOf("howblogs.xyz") !== -1) {
                    try {
                        var hbr = await http_get(hr, { headers: H_SKY });
                        if (hbr && hbr.body) {
                            var hbdoc = parseHtml(hbr.body);
                            var hbAs = hbdoc.querySelectorAll("a");
                            for (var hi = 0; hi < hbAs.length; hi++) {
                                var hbHref = hbAs[hi].getAttribute("href") || "";
                                if (hbHref.indexOf("http") === 0 && !hbHref.includes("howblogs")) {
                                    results.push(new StreamResult({
                                        source: "SkyMoviesHD [Resolved]",
                                        name: "SkyMoviesHD [" + txt + "]",
                                        url: hbHref,
                                        quality: quality,
                                        headers: { "User-Agent": UA, "Referer": "https://howblogs.xyz/" }
                                    }));
                                }
                            }
                        }
                    } catch (_) {}
                } else {
                    results.push(new StreamResult({
                        source: "SkyMoviesHD",
                        name: "SkyMoviesHD [" + txt + "]",
                        url: hr,
                        quality: quality,
                        headers: { "User-Agent": UA, "Referer": SKY_API + "/" }
                    }));
                }
            }

            return results;
        } catch (_) { return []; }
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
            if (details && details.external_ids && details.external_ids.imdb_id) imdbId = details.external_ids.imdb_id;

            var results = [];
            var providerCalls = [
                fetchVaplayer(tmdbId, season, episode),
                fetchVidlink(tmdbId, season, episode),
                fetchVidEasy(tmdbId, season, episode),
                fetchVidrock(tmdbId, season, episode),
                fetchRiveStream(tmdbId, season, episode),
                fetch2embed(imdbId, season, episode),
                fetchVidSrcXyz(imdbId, season, episode),
                fetchSkyMoviesHD(tmdbId, season, episode)
            ];
            try { providerCalls.push(fetchVidFast(tmdbId, season, episode)); } catch(_) {}

            var providerResults = await Promise.all(providerCalls);
            var seen = {};
            providerResults.forEach(function(r) {
                if (Array.isArray(r)) r.forEach(function(s) {
                    if (s && s.url && !seen[s.url]) {
                        seen[s.url] = true;
                        s.drop_403 = true;
                        results.push(s);
                    }
                });
            });

            results.sort(function(a, b) {
                return (b.quality || 0) - (a.quality || 0) || (a.source || "").localeCompare(b.source || "");
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
