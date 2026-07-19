(function() {
    var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
    var mainUrl = "https://net52.cc";
    var mobileHeaders = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
        "Cache-Control": "max-age=0",
        "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Android WebView";v="144"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Android"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0",
        "X-Requested-With": "XMLHttpRequest"
    };
    var newTvHeaders = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Requested-With": "NetmirrorNewTV v1.0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0",
        "Accept": "application/json, text/plain, */*"
    };
    var newTvDomains = [
        "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==", "aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==", "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr", "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=", "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=", "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl", "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==", "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==", "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==", "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbms=", "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=", "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=", "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo="
    ];

    var PROVIDERS = {
        "NETFLIX": {
            label: "Netflix",
            ott: "nf",
            homePath: "/mobile/home?app=1",
            searchPath: "/mobile/search.php",
            postPath: "/mobile/post.php",
            episodesPath: "/mobile/episodes.php",
            playlistPath: "/mobile/playlist.php",
            poster: function(id) { return proxify("https://imgcdn.kim/poster/v/" + id + ".jpg"); },
            bg: function(id) { return proxify("https://imgcdn.kim/poster/h/" + id + ".jpg"); },
            epPoster: function(id) { return proxify("https://imgcdn.kim/epimg/150/" + id + ".jpg"); },
            isMobile: true,
            usePlaylist: true,
            includeUserToken: false
        },
        "PRIME VIDEO": {
            label: "Prime Video",
            ott: "pv",
            homePath: "/pv/homepage.php",
            searchPath: "/pv/search.php",
            postPath: "/pv/post.php",
            episodesPath: "/pv/episodes.php",
            playlistPath: "/pv/playlist.php",
            poster: function(id) { return proxify("https://imgcdn.kim/pv/v/" + id + ".jpg"); },
            bg: function(id) { return proxify("https://imgcdn.kim/pv/h/" + id + ".jpg"); },
            epPoster: function(id) { return proxify("https://imgcdn.kim/pvepimg/150/" + id + ".jpg"); },
            isMobile: false,
            usePlaylist: false,
            includeUserToken: true
        },
        "HOTSTAR": {
            label: "Hotstar",
            ott: "hs",
            homePath: "/mobile/home?app=1",
            searchPath: "/mobile/hs/search.php",
            postPath: "/mobile/hs/post.php",
            episodesPath: "/mobile/hs/episodes.php",
            playlistPath: "/mobile/hs/playlist.php",
            poster: function(id) { return proxify("https://imgcdn.kim/hs/v/" + id + ".jpg"); },
            bg: function(id) { return proxify("https://imgcdn.kim/hs/h/" + id + ".jpg"); },
            epPoster: function(id) { return proxify("https://imgcdn.kim/hsepimg/150/" + id + ".jpg"); },
            isMobile: true,
            usePlaylist: true,
            includeUserToken: false
        },
        "DISNEY PLUS": {
            label: "Disney+",
            ott: "dp",
            homePath: "/mobile/home?app=1",
            searchPath: "/mobile/hs/search.php",
            postPath: "/mobile/hs/post.php",
            episodesPath: "/mobile/hs/episodes.php",
            playlistPath: "/mobile/hs/playlist.php",
            poster: function(id) { return proxify("https://imgcdn.kim/hs/v/" + id + ".jpg"); },
            bg: function(id) { return proxify("https://imgcdn.kim/hs/h/" + id + ".jpg"); },
            epPoster: function(id) { return proxify("https://imgcdn.kim/hsepimg/150/" + id + ".jpg"); },
            isMobile: true,
            usePlaylist: true,
            includeUserToken: false
        }
    };

    var providerKeys = ["NETFLIX", "PRIME VIDEO", "HOTSTAR", "DISNEY PLUS"];

    function proxify(url) {
        return "https://wsrv.nl/?url=" + encodeURIComponent(url) + "&w=160&output=webp";
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function atobSafe(s) {
        if (typeof atob === "function") return atob(s);
        return s;
    }

    async function bypass() {
        var now = Date.now();
        var cached = globalThis.__netmirror_cookie;
        var cachedTime = globalThis.__netmirror_cookie_time || 0;
        if (cached && (now - cachedTime < 54000000)) return cached;
        try {
            var uuid = generateUUID();
            var body = "g-recaptcha-response=" + encodeURIComponent(uuid);
            var headers = {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "max-age=0",
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": "https://net22.cc",
                "Referer": "https://net22.cc/verify2",
                "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
            };
            var res = await http_post(mainUrl + "/verify.php", { headers: headers, body: body });
            if (res && res.headers) {
                var setCookie = res.headers["Set-Cookie"] || res.headers["set-cookie"] || "";
                if (Array.isArray(setCookie)) setCookie = setCookie.join("; ");
                var m = setCookie.match(/t_hash_t=([^;]+)/);
                if (m) {
                    globalThis.__netmirror_cookie = m[1];
                    globalThis.__netmirror_cookie_time = now;
                    return m[1];
                }
            }
        } catch (_) {}
        return globalThis.__netmirror_cookie || "";
    }

    async function resolveApiUrl() {
        if (globalThis.__netmirror_api_url) return globalThis.__netmirror_api_url;
        for (var i = 0; i < newTvDomains.length; i++) {
            try {
                var base = atobSafe(newTvDomains[i]).replace(/\/+$/, "");
                var res = await http_get(base + "/checknewtv.php", newTvHeaders);
                if (res && res.body) {
                    var json = JSON.parse(res.body);
                    if (json && json.token_hash) {
                        var decoded = atobSafe(json.token_hash).trim().replace(/\/$/, "");
                        if (decoded) {
                            globalThis.__netmirror_api_url = decoded;
                            return decoded;
                        }
                    }
                }
            } catch (_) {}
        }
        throw new Error("Failed to resolve NewTV API base URL");
    }

    function cookieString(provider) {
        var s = "t_hash_t=" + globalThis.__netmirror_cookie + "; ott=" + provider.ott + "; hd=on";
        if (provider.includeUserToken) s += "; user_token=233123f803cf02184bf6c67e149cdd50";
        return s;
    }

    function makeItemUrl(providerId, id) {
        return JSON.stringify({ p: providerId, id: id });
    }

    function parseItemUrl(url) {
        try { return JSON.parse(url); } catch (_) { return null; }
    }

    function convertRuntimeToMinutes(runtime) {
        if (!runtime) return 0;
        var totalMinutes = 0;
        var parts = String(runtime).split(" ");
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (part.endsWith("h")) totalMinutes += (parseInt(part.replace("h", ""), 10) || 0) * 60;
            else if (part.endsWith("m")) totalMinutes += parseInt(part.replace("m", ""), 10) || 0;
            else { var val = parseInt(part, 10); if (!isNaN(val)) totalMinutes += val; }
        }
        return totalMinutes;
    }

    async function fetchPagedEpisodes(pid, provider, seriesId, seasonId, page, episodes) {
        var pg = page;
        while (true) {
            var t = Math.floor(Date.now() / 1000);
            var url = mainUrl + provider.episodesPath + "?s=" + seasonId + "&series=" + seriesId + "&t=" + t + "&page=" + pg;
            var res = await http_get(url, { headers: mobileHeaders });
            if (!res || !res.body) break;
            var data = JSON.parse(res.body);
            if (data && Array.isArray(data.episodes)) {
                data.episodes.forEach(function(item) {
                    if (!item) return;
                    episodes.push(new Episode({
                        name: item.t,
                        season: parseInt(item.s.replace("S", ""), 10) || 1,
                        episode: parseInt(item.ep.replace("E", ""), 10) || 1,
                        url: JSON.stringify({ p: pid, kind: "play", id: item.id, title: item.t }),
                        posterUrl: provider.epPoster(item.id),
                        runtime: parseInt(item.time.replace("m", ""), 10) || undefined
                    }));
                });
            }
            if (!data || data.nextPageShow === 0) break;
            pg++;
        }
    }

    async function getHome(cb) {
        try {
            var cookie = await bypass();
            var tasks = providerKeys.map(function(pid) {
                var provider = PROVIDERS[pid];
                var hdrs = Object.assign({}, provider.isMobile ? mobileHeaders : { "User-Agent": UA }, {
                    "Cookie": cookieString(provider),
                    "Referer": mainUrl + "/home"
                });
                return http_get(mainUrl + provider.homePath, { headers: hdrs }).then(function(res) {
                    if (!res || !res.body) return {};
                    var sections = {};

                    if (pid === "PRIME VIDEO") {
                        var json = JSON.parse(res.body);
                        if (json && Array.isArray(json.post)) {
                            json.post.forEach(function(group) {
                                var name = (group.cate || "Trending").trim();
                                if (!name) return;
                                var ids = String(group.ids || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
                                if (!ids.length) return;
                                var items = ids.map(function(id) {
                                    return new MultimediaItem({
                                        title: " ",
                                        url: makeItemUrl(pid, id),
                                        posterUrl: provider.poster(id),
                                        type: "movie",
                                        contentType: "movie"
                                    });
                                });
                                sections[pid + " - " + name] = items;
                            });
                        }
                    } else {
                        var doc = parseHtml(res.body);
                        var containers = [];
                        var trays = doc.querySelectorAll(".tray-container");
                        for (var i = 0; i < trays.length; i++) containers.push(trays[i]);
                        var top10 = doc.querySelector("#top10");
                        if (top10) containers.push(top10);

                        containers.forEach(function(container) {
                            var h2 = container.querySelector("h2");
                            var span = container.querySelector("span");
                            var name = (h2 ? h2.textContent : (span ? span.textContent : "Category")).trim();
                            if (!name) name = "Category";

                            var articles = container.querySelectorAll("article");
                            var top10Posts = container.querySelectorAll(".top10-post");
                            var itemEls = [];
                            for (var j = 0; j < articles.length; j++) itemEls.push(articles[j]);
                            for (var j = 0; j < top10Posts.length; j++) itemEls.push(top10Posts[j]);

                            var items = [];
                            itemEls.forEach(function(el) {
                                var a = el.querySelector("a");
                                var id = (a ? a.getAttribute("data-post") : null) || el.getAttribute("data-post");
                                if (!id) return;
                                items.push(new MultimediaItem({
                                    title: " ",
                                    url: makeItemUrl(pid, id),
                                    posterUrl: provider.poster(id),
                                    type: "movie",
                                    contentType: "movie"
                                }));
                            });
                            if (items.length > 0) sections[pid + " - " + name] = items;
                        });
                    }
                    return sections;
                }).catch(function() { return {}; });
            });
            var allSections = await Promise.all(tasks);
            var combined = {};
            allSections.forEach(function(sections) {
                Object.keys(sections).forEach(function(key) { combined[key] = sections[key]; });
            });
            cb({ success: true, data: combined });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            var cookie = await bypass();
            var tasks = providerKeys.map(function(pid) {
                var provider = PROVIDERS[pid];
                var hdrs = Object.assign({}, provider.isMobile ? mobileHeaders : { "User-Agent": UA }, {
                    "Cookie": cookieString(provider),
                    "Referer": mainUrl + "/home"
                });
                var t = Math.floor(Date.now() / 1000);
                var url = mainUrl + provider.searchPath + "?s=" + encodeURIComponent(query) + "&t=" + t;
                return http_get(url, { headers: hdrs }).then(function(res) {
                    if (!res || !res.body) return [];
                    var json = JSON.parse(res.body);
                    if (!json || !Array.isArray(json.searchResult)) return [];
                    return json.searchResult.map(function(item) {
                        return { pid: pid, id: String(item.id), title: item.t, provider: provider };
                    });
                }).catch(function() { return []; });
            });
            var results = await Promise.all(tasks);
            var seen = {};
            var out = [];
            results.forEach(function(batch) {
                batch.forEach(function(item) {
                    if (!item.id || seen[item.id]) return;
                    seen[item.id] = true;
                    out.push(new MultimediaItem({
                        title: item.title,
                        url: makeItemUrl(item.pid, item.id),
                        posterUrl: item.provider.poster(item.id),
                        type: "movie",
                        contentType: "movie"
                    }));
                });
            });
            cb({ success: true, data: out });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            var parsed = parseItemUrl(url);
            if (!parsed || !parsed.id) return cb({ success: false, errorCode: "LOAD_ERROR", message: "Invalid URL" });
            var pid = parsed.p || "NETFLIX";
            var provider = PROVIDERS[pid] || PROVIDERS["NETFLIX"];
            var id = parsed.id;
            var cookie = await bypass();
            var hdrs = Object.assign({}, provider.isMobile ? mobileHeaders : { "User-Agent": UA }, {
                "Cookie": cookieString(provider),
                "Referer": mainUrl + "/home"
            });
            var t = Math.floor(Date.now() / 1000);
            var postUrl = mainUrl + provider.postPath + "?id=" + id + "&t=" + t;
            var res = await http_get(postUrl, { headers: hdrs });
            if (!res || !res.body) return cb({ success: false, errorCode: "LOAD_ERROR", message: "Empty response" });
            var data = JSON.parse(res.body);

            var title = data.title;
            var desc = data.desc || "";
            var year = parseInt(data.year, 10) || undefined;
            var score = (data.match || "").replace("IMDb ", "") || undefined;
            if (score) score = parseFloat(score);
            var genre = [];
            if (data.genre) genre = data.genre.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
            var cast = [];
            if (data.cast) cast = data.cast.split(",").map(function(s) { var n = s.trim(); return n ? new Actor({ name: n }) : null; }).filter(Boolean);
            var runtime = convertRuntimeToMinutes(data.runtime);
            var isSeries = data.episodes && data.episodes.length > 0 && data.episodes[0] !== null;
            var episodes = [];

            if (!isSeries) {
                episodes.push(new Episode({
                    name: title, season: 1, episode: 1,
                    url: JSON.stringify({ p: pid, kind: "play", id: id, title: title }),
                    posterUrl: provider.poster(id)
                }));
            } else {
                data.episodes.forEach(function(item) {
                    if (!item) return;
                    episodes.push(new Episode({
                        name: item.t,
                        season: parseInt(item.s.replace("S", ""), 10) || 1,
                        episode: parseInt(item.ep.replace("E", ""), 10) || 1,
                        url: JSON.stringify({ p: pid, kind: "play", id: item.id, title: item.t }),
                        posterUrl: provider.epPoster(item.id),
                        runtime: parseInt(item.time.replace("m", ""), 10) || undefined
                    }));
                });

                if (data.nextPageShow === 1 && data.nextPageSeason) {
                    await fetchPagedEpisodes(pid, provider, id, data.nextPageSeason, 2, episodes);
                }
                if (Array.isArray(data.season) && data.season.length > 1) {
                    for (var si = 0; si < data.season.length - 1; si++) {
                        if (data.season[si] && data.season[si].id) {
                            await fetchPagedEpisodes(pid, provider, id, data.season[si].id, 1, episodes);
                        }
                    }
                }
            }

            var item = new MultimediaItem({
                title: title,
                url: url,
                posterUrl: provider.poster(id),
                bannerUrl: provider.bg(id),
                description: desc,
                year: year,
                score: score,
                tags: genre.length ? genre : undefined,
                cast: cast.length ? cast : undefined,
                runtime: runtime ? String(runtime) : undefined,
                type: isSeries ? "series" : "movie",
                contentType: isSeries ? "series" : "movie",
                episodes: episodes
            });
            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadMobilePlaylist(provider, id, title) {
        var cookie = await bypass();
        var ts = Math.floor(Date.now() / 1000);
        var tParam = encodeURIComponent(title || "");
        var playlistUrl = mainUrl + provider.playlistPath + "?id=" + id + "&t=" + tParam + "&tm=" + ts;
        var hdrs = {
            "Accept": "*/*",
            "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
            "Connection": "keep-alive",
            "Referer": mainUrl + "/mobile/home?app=1",
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Safari/537.36 /OS.Gatu v3.0",
            "X-Requested-With": "app.netmirror.netmirrornew",
            "Cookie": cookieString(provider)
        };
        var res = await http_get(playlistUrl, { headers: hdrs });
        if (!res || !res.body) return [];
        var playlist = JSON.parse(res.body);
        var out = [];
        if (Array.isArray(playlist)) {
            playlist.forEach(function(item) {
                if (!item || !Array.isArray(item.sources)) return;
                item.sources.forEach(function(src, i) {
                    var fileUrl = String(src.file || "");
                    if (!fileUrl) return;
                    if (!/^https?:\/\//i.test(fileUrl)) {
                        fileUrl = (fileUrl.startsWith("/") ? "" : "/") + fileUrl;
                        fileUrl = mainUrl + fileUrl;
                    }
                    var label = src.label || "Auto";
                    var qMatch = fileUrl.match(/[?&]q=(\d+)/i);
                    if (qMatch) label = qMatch[1] + "p";
                    out.push(new StreamResult({
                        source: provider.label,
                        name: provider.label + " [" + label + "]",
                        url: fileUrl,
                        type: "hls",
                        quality: parseInt(label, 10) || undefined,
                        headers: {
                            "Referer": mainUrl + "/",
                            "Cookie": cookieString(provider),
                            "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Safari/537.36 /OS.Gatu v3.0",
                            "Accept": "*/*"
                        }
                    }));
                });
            });
        }
        return out;
    }

    async function loadStreams(data, cb) {
        try {
            var parsed = null;
            try { parsed = JSON.parse(data); } catch (_) {}
            var id = "";
            var title = "";
            if (parsed) {
                if (Array.isArray(parsed)) { id = parsed[0].id || parsed[0]; title = parsed[0].title || ""; }
                else { id = parsed.id || data; title = parsed.title || ""; }
            } else { id = data; }

            var pid = (parsed && parsed.p) || "NETFLIX";
            var provider = PROVIDERS[pid] || PROVIDERS["NETFLIX"];
            var streams = [];

            if (pid === "PRIME VIDEO") {
                try {
                    var apiBase = await resolveApiUrl();
                    var hdrs = Object.assign({}, newTvHeaders, { "Ott": provider.ott });
                    var playerUrl = apiBase + "/newtv/player.php?id=" + id;
                    var res = await http_get(playerUrl, { headers: hdrs });
                    if (res && res.body) {
                        var json = JSON.parse(res.body);
                        if (json && json.video_link) {
                            var referer = json.referer || apiBase;
                            streams.push(new StreamResult({
                                source: provider.label,
                                name: provider.label + " [Auto]",
                                url: json.video_link,
                                quality: 1080,
                                headers: { "Referer": referer, "Cookie": "hd=on" }
                            }));
                        }
                    }
                } catch (_) {}
            } else {
                try {
                    streams = await loadMobilePlaylist(provider, id, title);
                } catch (_) {}
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
