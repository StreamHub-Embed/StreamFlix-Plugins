(function() {
    var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    var ROG_API = "https://rogmovies.cv";

    var H_ROG = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": UA,
        "cookie": "xla=s4t"
    };

    function cleanText(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

    function parseQuality(str) {
        if (!str) return 1080;
        var m = String(str).match(/(\d{3,4})[pP]/);
        return m ? parseInt(m[1], 10) : 1080;
    }

    function extractSlug(url) {
        var m = url.match(/rogmovies:\/\/(movie|episode)\/(.+)/);
        if (!m) return null;
        var rest = m[2];
        var slug = rest.split("?")[0];
        var params = {};
        if (rest.indexOf("?") !== -1) {
            rest.split("?")[1].split("&").forEach(function(p) { var kv = p.split("="); params[kv[0]] = kv[1]; });
        }
        return { type: m[1], slug: slug, season: params.season ? parseInt(params.season, 10) : null, episode: params.episode ? parseInt(params.episode, 10) : null };
    }

    function cleanTitle(raw) {
        var t = cleanText(raw);
        t = t.replace(/^(?:Download|Watch)\s+/i, "");
        t = t.replace(/\s*\d{3,4}p.*$/i, "");
        t = t.replace(/\s*WEB-DL.*$/i, "");
        t = t.replace(/\s*\[.*?\]/g, "");
        t = t.replace(/\s*\(.*?\)/g, " ").trim();
        t = t.replace(/\s{2,}/g, " ");
        return t;
    }

    function cleanHref(href) {
        if (!href) return "";
        var path = href;
        if (href.indexOf("http") === 0) {
            var m = href.match(/^https?:\/\/[^\/]+(\/.*)/);
            if (m) path = m[1];
        }
        if (path.indexOf("/") !== 0) {
            path = "/" + path;
        }
        return path;
    }

    // ───────── getHome: scrape rogmovies.cv ─────────
    async function fetchCategory(urlPath, categoryName) {
        try {
            var url = urlPath.indexOf("http") === 0 ? urlPath : ROG_API + urlPath;
            var res = await http_get(url, { headers: H_ROG });
            if (!res || !res.body) return [];
            var doc = parseHtml(res.body);
            var items = [];
            var seen = {};

            var anchors = doc.querySelectorAll("a");
            for (var i = 0; i < anchors.length; i++) {
                var a = anchors[i];
                var rawHref = a.getAttribute("href") || "";
                if (!rawHref.includes("/download-")) continue;
                var href = cleanHref(rawHref);
                if (!href || seen[href]) continue;
                seen[href] = true;

                var img = a.querySelector("img");
                var poster = img ? (img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || img.getAttribute("src")) : null;
                if (poster && poster.indexOf("/") === 0 && poster.indexOf("//") !== 0) {
                    poster = ROG_API + poster;
                }
                var altText = img ? img.getAttribute("alt") || "" : "";
                var text = a.textContent || "";
                var title = cleanTitle(altText || text);
                if (!title || title.length < 5) continue;

                var isSeries = /season|s\d+\b|series|complete.?series|web.?series|tv.?show/i.test((altText || text) + " " + href);
                var contentType = isSeries ? "series" : "movie";
                items.push(new MultimediaItem({
                    title: title,
                    url: "rogmovies://" + (isSeries ? "episode" : "movie") + href,
                    posterUrl: poster,
                    type: contentType,
                    contentType: contentType
                }));

                if (items.length >= 20) break;
            }
            return items;
        } catch (_) {
            return [];
        }
    }

    // ───────── getHome: scrape rogmovies.cv ─────────
    async function getHome(cb) {
        try {
            var categories = [
                { name: "Latest Releases", path: "/" },
                { name: "Bollywood Movies", path: "/bollywood/" },
                { name: "Hindi-Dubbed Movies", path: "/hindi-dubbed-movies/" },
                { name: "Netflix", path: "/web-series/netflix/" },
                { name: "Amazon Prime Video", path: "/web-series/amazon-prime-video/" },
                { name: "Zee5 Originals", path: "/web-series/zee5-originals/" },
                { name: "Amazon Prime: MiniTV", path: "/web-series/amazon-prime-video/minitv/" }
            ];

            var results = await Promise.all(categories.map(async function(cat) {
                var items = await fetchCategory(cat.path, cat.name);
                return { name: cat.name, items: items };
            }));

            var homeData = {};
            results.forEach(function(r) {
                if (r.items && r.items.length > 0) {
                    homeData[r.name] = r.items;
                }
            });

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    // ───────── search ─────────
    async function search(query, cb) {
        try {
            var q = encodeURIComponent(cleanText(query));
            var res = await http_get(ROG_API + "/search.php?q=" + q, { headers: H_ROG });
            if (!res || !res.body) return cb({ success: false, errorCode: "SEARCH_ERROR", message: "" });
            var json = JSON.parse(res.body);
            if (!Array.isArray(json.hits)) return cb({ success: true, data: [] });

            var items = [];
            var seen = {};
            json.hits.forEach(function(hit) {
                var doc = hit.document;
                if (!doc || !doc.permalink || !doc.post_title) return;
                var permalink = cleanHref(doc.permalink);
                if (seen[permalink]) return;
                seen[permalink] = true;

                var title = cleanTitle(doc.post_title);
                var isSeries = /season|s\d+\b|series|complete.?series|web.?series|tv.?show/i.test((doc.post_title || "") + " " + (doc.permalink || ""));

                var poster = doc.post_thumbnail || undefined;
                if (poster && poster.indexOf("/") === 0 && poster.indexOf("//") !== 0) {
                    poster = ROG_API + poster;
                }

                items.push(new MultimediaItem({
                    title: title || doc.post_title,
                    url: "rogmovies://" + (isSeries ? "episode" : "movie") + permalink,
                    posterUrl: poster,
                    type: isSeries ? "series" : "movie",
                    contentType: isSeries ? "series" : "movie"
                }));
            });
            cb({ success: true, data: items.slice(0, 20) });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    // ───────── load: scrape content page ─────────
    async function load(url, cb) {
        try {
            var info = extractSlug(url);
            if (!info) return cb({ success: false, errorCode: "INVALID_URL", message: "" });

            var permalink = cleanHref(info.slug);
            var pageUrl = ROG_API + permalink;

            var res = await http_get(pageUrl, { headers: H_ROG });
            if (!res || !res.body) return cb({ success: false, errorCode: "NOT_FOUND", message: "" });
            var doc = parseHtml(res.body);

            // Title
            var titleEl = doc.querySelector("h1") || doc.querySelector("title");
            var rawTitle = titleEl ? cleanText(titleEl.textContent) : "";
            var title = cleanTitle(rawTitle) || rawTitle;

            // Description
            var metaDesc = doc.querySelector("meta[name='description']");
            var description = metaDesc ? cleanText(metaDesc.getAttribute("content") || "") : "";

            // Poster: try og:image first, then first img
            var ogImg = doc.querySelector("meta[property='og:image']");
            var poster = ogImg ? ogImg.getAttribute("content") : null;
            if (!poster) {
                var firstImg = doc.querySelector("img.wp-post-image, img[src*='/wp-content/uploads/'], img[src*='tmdb.org']");
                poster = firstImg ? (firstImg.getAttribute("data-src") || firstImg.getAttribute("data-lazy-src") || firstImg.getAttribute("data-original") || firstImg.getAttribute("src")) : null;
            }
            if (poster && poster.indexOf("/") === 0 && poster.indexOf("//") !== 0) {
                poster = ROG_API + poster;
            }

            // Year
            var year = null;
            var yearMatch = rawTitle.match(/(\d{4})/);
            if (yearMatch) year = parseInt(yearMatch[1], 10);

            var isSeries = /season|s\d+\b|series|complete.?series|web.?series|tv.?show/i.test(rawTitle + " " + permalink + " " + (description || ""));
            var itemUrl = "rogmovies://" + (isSeries ? "episode" : "movie") + permalink;

            // Cinemeta enrichment for clean Title & Description
            var imdbM = res.body.match(/imdb\.com\/title\/(tt\d+)/i);
            var imdbId = imdbM ? imdbM[1] : '';
            if (imdbId) {
                try {
                    var cUrl = "https://v3-cinemeta.strem.io/meta/" + (isSeries ? "series" : "movie") + "/" + imdbId + ".json";
                    var cRes = await http_get(cUrl);
                    if (cRes && cRes.body) {
                        var cJson = JSON.parse(cRes.body);
                        if (cJson && cJson.meta) {
                            description = cJson.meta.description || description;
                            title = cJson.meta.name || title;
                            if (cJson.meta.poster) poster = cJson.meta.poster;
                            if (cJson.meta.year) {
                                var yMatch = String(cJson.meta.year).match(/(\d{4})/);
                                if (yMatch) year = parseInt(yMatch[1], 10);
                            }
                        }
                    }
                } catch (_) {}
            }

            var item = new MultimediaItem({
                title: title,
                url: itemUrl,
                posterUrl: poster,
                description: description || undefined,
                year: year,
                type: isSeries ? "series" : "movie",
                contentType: isSeries ? "series" : "movie"
            });

            if (isSeries) {
                // Extract episodes from season structure (mirrors Kotlin invokeRogmovies)
                var hds = doc.querySelectorAll("h3, h5");
                var episodes = [];
                var epCounter = {};
                var globalEp = 0;

                for (var hi = 0; hi < hds.length; hi++) {
                    var sText = hds[hi].textContent || "";
                    var sMatch = sText.match(/Season\s+(\d+)/i);
                    if (!sMatch) continue;
                    var sn = parseInt(sMatch[1], 10);

                    // Walk siblings collecting download links
                    var el = hds[hi].nextElementSibling;
                    while (el) {
                        var tag = (el.tagName || "").toLowerCase();
                        if (tag === "h3" || tag === "h5") break;
                        var as = el.querySelectorAll("a");
                        for (var ai = 0; ai < as.length; ai++) {
                            var aText = as[ai].textContent || "";
                            if (!/V-Cloud|Single|Episode|G-Direct/i.test(aText)) continue;
                            var epHref = as[ai].getAttribute("href");
                            if (!epHref) continue;

                            globalEp++;
                            if (!epCounter[sn]) epCounter[sn] = 0;
                            epCounter[sn]++;

                            var epName = cleanText(aText);
                            var epPath = cleanHref(epHref);
                            episodes.push(new Episode({
                                name: epName || "Episode " + epCounter[sn],
                                season: sn,
                                episode: epCounter[sn],
                                url: "rogmovies://episode" + epPath + "?season=" + sn + "&episode=" + epCounter[sn],
                                posterUrl: poster
                            }));
                        }
                        el = el.nextElementSibling;
                    }
                }

                if (episodes.length > 0) {
                    item.episodes = episodes;
                } else {
                    // Degenerate to movie if no episode structure found
                    item.type = "movie";
                    item.contentType = "movie";
                    item.episodes = [new Episode({ name: "Play", season: 1, episode: 1, url: itemUrl, posterUrl: poster })];
                }
            } else {
                item.episodes = [new Episode({ name: "Play", season: 1, episode: 1, url: itemUrl, posterUrl: poster })];
            }

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    function extractQualityFromElement(el) {
        if (!el) return 1080;
        var elText = el.textContent || "";
        var qMatch = elText.match(/(\d{3,4})[pP]/);
        if (qMatch) return parseInt(qMatch[1], 10);

        var sibling = el.previousElementSibling;
        while (sibling) {
            var tag = (sibling.tagName || "").toLowerCase();
            if (tag === "h5" || tag === "h3" || tag === "h4" || tag === "p" || tag.indexOf("h") === 0) {
                var text = sibling.textContent || "";
                var qMatch = text.match(/(\d{3,4})[pP]/);
                if (qMatch) return parseInt(qMatch[1], 10);
            }
            sibling = sibling.previousElementSibling;
        }

        var p = el.parentElement;
        if (p) {
            var sibling = p.previousElementSibling;
            while (sibling) {
                var tag = (sibling.tagName || "").toLowerCase();
                if (tag === "h5" || tag === "h3" || tag === "h4" || tag === "p" || tag.indexOf("h") === 0) {
                    var text = sibling.textContent || "";
                    var qMatch = text.match(/(\d{3,4})[pP]/);
                    if (qMatch) return parseInt(qMatch[1], 10);
                }
                sibling = sibling.previousElementSibling;
            }
        }
        return 1080;
    }

    // ───────── V-Cloud / G-Direct resolvers (from Kotlin VCloud/VCloudGDirect extractors) ─────────
    async function resolveVCloudGDirect(url, quality) {
        var q = quality || 1080;
        var qLabel = q + "p";
        try {
            var res = await http_get(url, { headers: H_ROG });
            if (!res || !res.body) return null;
            var vd = parseHtml(res.body).querySelector("#vd");
            if (!vd) return null;
            var href = vd.getAttribute("href");
            if (!href) return null;
            return new StreamResult({ source: "ROGmovies [G-Direct - " + qLabel + "]", name: "ROGmovies [G-Direct]", url: href, quality: q, headers: H_ROG });
        } catch (_) { return null; }
    }

    async function resolveVCloud(url, quality) {
        var q = quality || 1080;
        var qLabel = q + "p";
        try {
            var href = url;
            if (href.indexOf("api/index.php") !== -1) {
                var res = await http_get(url, { headers: H_ROG });
                if (!res || !res.body) return [];
                var a = parseHtml(res.body).querySelector("div.main h4 a");
                if (!a) return [];
                href = a.getAttribute("href");
                if (!href) return [];
            }
            var res2 = await http_get(href, { headers: H_ROG });
            if (!res2 || !res2.body) return [];
            var body = res2.body;
            var urlValue = "";
            var b64m = body.match(/atob\(atob\('([^']+)'\)\)/);
            if (b64m) { try { urlValue = atob(atob(b64m[1])); } catch (_) {} }
            if (!urlValue) {
                var vm = body.match(/var\s+url\s*=\s*'([^']*)'/);
                if (vm) urlValue = vm[1];
            }
            if (!urlValue) return [];
            var res3 = await http_get(urlValue, { headers: H_ROG });
            if (!res3 || !res3.body) return [];
            var doc3 = parseHtml(res3.body);
            var cardBody = doc3.querySelector("div.card-body");
            if (!cardBody) return [];
            var btns = cardBody.querySelectorAll("h2 a.btn");
            var out = [];
            for (var i = 0; i < btns.length; i++) {
                var lh = btns[i].getAttribute("href");
                var lt = btns[i].textContent || "";
                if (lh) out.push(new StreamResult({ source: "ROGmovies [V-Cloud " + lt.trim() + " - " + qLabel + "]", name: "ROGmovies [V-Cloud " + lt.trim() + "]", url: lh, quality: q, headers: H_ROG }));
            }
            return out;
        } catch (_) { return []; }
    }

    async function resolveRogmoviesSource(url, quality) {
        var q = quality || 1080;
        var qLabel = q + "p";
        try {
            if (/vcloud/i.test(url)) { var r = await resolveVCloud(url, q); if (r && r.length > 0) return r; }
            if (/fastdl\.icu/i.test(url)) { var r = await resolveVCloudGDirect(url, q); if (r) return [r]; }
            return [new StreamResult({ source: "ROGmovies [Auto - " + qLabel + "]", name: "ROGmovies", url: url, quality: q, headers: H_ROG })];
        } catch (_) { return []; }
    }

    // ───────── loadStreams: extract V-Cloud/G-Direct from content page ─────────
    async function loadStreams(data, cb) {
        try {
            var links = [];
            try { links = JSON.parse(data); } catch(_) { links = [{ url: data }]; }
            if (!Array.isArray(links)) links = [links];

            var targetSlug, targetSeason, targetEpisode;
            links.forEach(function(link) {
                var u = (link && (link.url || link)) || "";
                var info = extractSlug(u);
                if (info) { targetSlug = info.slug; targetSeason = info.season; targetEpisode = info.episode; }
            });

            if (!targetSlug) return cb({ success: true, data: [] });

            var permalink = cleanHref(targetSlug);
            var pageUrl = ROG_API + permalink;

            var res = await http_get(pageUrl, { headers: H_ROG });
            if (!res || !res.body) return cb({ success: false, errorCode: "STREAM_ERROR", message: "" });
            var doc = parseHtml(res.body);
            var results = [];

            // Dedicated episode mode (from TV series)
            if (targetSeason != null && targetEpisode != null) {
                var epText = "Episode " + targetEpisode;
                var epH4s = doc.querySelectorAll("h4");
                var matched = false;
                for (var ei = 0; ei < epH4s.length; ei++) {
                    if ((epH4s[ei].textContent || "").indexOf(epText) === -1) continue;
                    var ns = epH4s[ei].nextElementSibling;
                    if (!ns) continue;
                    var eas = ns.querySelectorAll("a");
                    for (var ai = 0; ai < eas.length; ai++) {
                        if (/V-Cloud|Single|Episode|G-Direct/i.test(eas[ai].textContent || "")) {
                            var l2 = eas[ai].getAttribute("href");
                            if (l2) {
                                var quality = extractQualityFromElement(eas[ai]);
                                var r2 = await resolveRogmoviesSource(l2, quality);
                                r2.forEach(function(x) { if (x) results.push(x); });
                                matched = true;
                            }
                        }
                    }
                    if (matched) break;
                }

                // Fallback: search season section for episode-specific links (mirrors Kotlin TV flow)
                if (!matched) {
                    var sRgx = new RegExp("Season " + targetSeason, "i");
                    var hds = doc.querySelectorAll("h3, h5");
                    for (var hi = 0; hi < hds.length; hi++) {
                        if (!sRgx.test(hds[hi].textContent || "")) continue;
                        var el = hds[hi].nextElementSibling;
                        while (el) {
                            var tag = (el.tagName || "").toLowerCase();
                            if (tag === "h3" || tag === "h5") break;
                            var as = el.querySelectorAll("a");
                            for (var ai = 0; ai < as.length; ai++) {
                                if (/V-Cloud|Single|Episode|G-Direct/i.test(as[ai].textContent || "")) {
                                    var link = as[ai].getAttribute("href");
                                    if (link) {
                                        // Fetch intermediate episode page
                                        try {
                                            var epRes = await http_get(link, { headers: H_ROG });
                                            if (!epRes || !epRes.body) continue;
                                            var epDoc = parseHtml(epRes.body);
                                            var epNodes = epDoc.querySelectorAll("h4");
                                            for (var eji = 0; eji < epNodes.length; eji++) {
                                                if ((epNodes[eji].textContent || "").indexOf(epText) === -1) continue;
                                                var ns2 = epNodes[eji].nextElementSibling;
                                                if (!ns2) continue;
                                                var eas2 = ns2.querySelectorAll("a");
                                                for (var aji = 0; aji < eas2.length; aji++) {
                                                    if (/V-Cloud|Single|Episode|G-Direct/i.test(eas2[aji].textContent || "")) {
                                                        var l3 = eas2[aji].getAttribute("href");
                                                        if (l3) {
                                                            var quality = extractQualityFromElement(eas2[aji]);
                                                            var r3 = await resolveRogmoviesSource(l3, quality);
                                                            r3.forEach(function(x) { if (x) results.push(x); });
                                                        }
                                                    }
                                                }
                                                break;
                                            }
                                        } catch (_) {}
                                    }
                                }
                            }
                            el = el.nextElementSibling;
                        }
                    }
                }
            }

            // Movie mode: extract dwd-button -> btn V-Cloud/G-Direct (mirrors Kotlin movie flow)
            if (results.length === 0) {
                var dwd = doc.querySelectorAll("button.dwd-button");
                var dwdItems = [];
                var dwdUrls = {};
                for (var di = 0; di < dwd.length; di++) {
                    var p = dwd[di].parentElement;
                    var h = p ? p.getAttribute("href") : null;
                    if (h && !dwdUrls[h]) {
                        dwdUrls[h] = true;
                        var quality = extractQualityFromElement(dwd[di]);
                        dwdItems.push({ url: h, quality: quality });
                    }
                }
                await Promise.all(dwdItems.map(async function(item) {
                    try {
                        var subRes = await http_get(item.url, { headers: H_ROG });
                        if (!subRes || !subRes.body) return;
                        var subDoc = parseHtml(subRes.body);
                        var sbtns = subDoc.querySelectorAll("button.btn");
                        for (var sj = 0; sj < sbtns.length; sj++) {
                            if (/V-Cloud|G-Direct/i.test(sbtns[sj].textContent || "")) {
                                var p2 = sbtns[sj].parentElement;
                                var l = p2 ? p2.getAttribute("href") : null;
                                if (l) {
                                    var r = await resolveRogmoviesSource(l, item.quality);
                                    r.forEach(function(x) { if (x) results.push(x); });
                                }
                            }
                        }
                    } catch (_) {}
                }));
            }

            // Final fallback: direct V-Cloud/G-Direct buttons on the page
            if (results.length === 0) {
                var allBtns = doc.querySelectorAll("button.btn, a.btn");
                for (var bi = 0; bi < allBtns.length; bi++) {
                    var el = allBtns[bi];
                    var text = el.textContent || "";
                    if (!/V-Cloud|G-Direct/i.test(text)) continue;
                    var href = el.tagName.toLowerCase() === "a" ? el.getAttribute("href") : (el.parentElement ? el.parentElement.getAttribute("href") : null);
                    if (href) {
                        var quality = extractQualityFromElement(el);
                        var r = await resolveRogmoviesSource(href, quality);
                        r.forEach(function(x) { if (x) results.push(x); });
                    }
                }
            }

            var seen = {};
            var deduped = [];
            results.forEach(function(r) {
                if (r && r.url && !seen[r.url]) { seen[r.url] = true; deduped.push(r); }
            });

            cb({ success: true, data: deduped });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
