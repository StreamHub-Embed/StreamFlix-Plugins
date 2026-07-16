(function() {
    var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    var BASE = String(typeof manifest !== "undefined" && manifest ? manifest.baseUrl || "https://movielinkbd.shop" : "https://movielinkbd.shop").replace(/\/+$/, "");

    var H = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cookie": "xla=s4t",
        "Referer": BASE + "/"
    };

    function cleanText(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

    function decodeHtmlEntities(v) {
        return String(v || "")
            .replace(/&#(\d+);/g, function(_, c) { return String.fromCharCode(Number(c)); })
            .replace(/&#x([0-9a-f]+);/gi, function(_, c) { return String.fromCharCode(parseInt(c, 16)); })
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&quot;/gi, "\"")
            .replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">");
    }

    function getQuality(text) {
        var l = (text || "").toLowerCase();
        if (l.includes("2160p") || l.includes("4k")) return "4K";
        if (l.includes("1080p")) return "1080p";
        if (l.includes("720p")) return "720p";
        if (l.includes("480p")) return "480p";
        if (l.includes("360p") || l.includes("240p")) return "240p";
        return "Auto";
    }

    function fixUrl(u, base) {
        if (!u) return "";
        u = decodeHtmlEntities(String(u).trim());
        if (u.startsWith("//")) return "https:" + u;
        if (u.startsWith("/")) return (base || BASE) + u;
        try { return new URL(u, base || BASE).href; } catch { return u; }
    }

    function extractGetLinkUrls(html) {
        var links = [];
        var seen = {};
        var re = /<a[^>]+href="(\/getLink\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = re.exec(html))) {
            if (seen[m[1]]) continue; seen[m[1]] = true;
            var text = cleanText(m[2].replace(/<[^>]+>/g, " "));
            var quality = "Auto", size = "";
            var qm = text.match(/(\d{3,4})\s*p/i);
            if (qm) quality = qm[1] + "p";
            var sm = text.match(/([\d.]+)\s*(MB|GB|KB)/i);
            if (sm) size = sm[1] + " " + sm[2];
            links.push({ url: fixUrl(m[1]), quality: quality, size: size });
        }
        if (links.length === 0) {
            re = /href="(\/getLink\/[^"]+)"/gi;
            while ((m = re.exec(html))) {
                if (seen[m[1]]) continue; seen[m[1]] = true;
                var ctx = html.substring(Math.max(0, m.index - 200), m.index + 300);
                var qm = ctx.match(/(\d{3,4})\s*p/i);
                links.push({ url: fixUrl(m[1]), quality: qm ? qm[1] + "p" : "Auto", size: "" });
            }
        }
        return links;
    }

    function extractFileUrl(html) {
        var m = /href="(\/file\/[^"]+)"/i.exec(html);
        return m ? fixUrl(m[1]) : null;
    }

    function extractTokenUrl(html) {
        var m = /href="(\/file\/[^"]+\?token=[^"]+)"/i.exec(html);
        if (m) return fixUrl(m[1]);
        m = /href="(\/file\/[^"]+\?[a-z]+=[^"]+)"/i.exec(html);
        return m ? fixUrl(m[1]) : null;
    }

    function classifyUrl(url) {
        if (!url) return null;
        var u = url.toLowerCase();
        if (u.indexOf("instantcloud") >= 0) return "InstantCloud";
        if (u.indexOf(".r2.dev") >= 0 || u.indexOf("cloudflare") >= 0 || u.indexOf("fastcloud") >= 0) return "FastCloud";
        if (u.indexOf("play.") >= 0 && u.match(/\/watch\//)) return "Stream";
        if (u.indexOf("movielinkbd.mom") >= 0 || (u.indexOf("movielinkbd.") >= 0 && u.indexOf("/getLink/") < 0 && u.indexOf("/file/") < 0)) return (u.match(/\/\/([^.]+)\./)?.[1] || "Mirror").replace(/^./, function(c) { return c.toUpperCase(); }) + "Mirror";
        if (u.indexOf("/open/") >= 0) return "Direct";
        if (u.indexOf("/download/") >= 0) return "CloudDownloader";
        if (u.indexOf("play.") >= 0 && u.match(/\/watch\//)) return "Stream";
        return null;
    }

    function extractFinalLinks(html) {
        var results = [];
        var seen = {};
        var re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = re.exec(html))) {
            var url = fixUrl(m[1]);
            if (!url || seen[url]) continue; seen[url] = true;
            if (url.indexOf("http") === 0 && url.indexOf(BASE) !== 0 && url.indexOf("cloudflare.com") < 0) {
                var name = classifyUrl(url);
                if (name) results.push({ url: url, name: name, quality: "Auto" });
            }
            if (url.indexOf(BASE) === 0 && url.indexOf("/getLink/") < 0 && url.indexOf("/file/") < 0 && url.indexOf("/getWatch/") < 0 && url.indexOf("/style/") < 0 && url.indexOf("/img/") < 0) {
                var name = classifyUrl(url);
                if (name) results.push({ url: url, name: name, quality: "Auto" });
            }
        }
        var sm = /const\s+SRC\s*=\s*"([^"]+)"/.exec(html);
        if (sm) {
            var su = decodeHtmlEntities(sm[1].replace(/\\\//g, "/"));
            if (!seen[su]) { seen[su] = true; results.push({ url: su, name: "Stream", quality: "Auto" }); }
        }
        return results;
    }

    async function resolveGetLink(getLinkUrl, quality) {
        var fallback = null;
        try {
            var res = await http_get(getLinkUrl, H);
            if (res && res.body) {
                var fileUrl = extractFileUrl(res.body);
                if (fileUrl) {
                    fallback = [{ url: fileUrl, name: "FileRedirect", quality: quality }];
                    var res2 = await http_get(fileUrl, H);
                    if (res2 && res2.body) {
                        var tokenUrl = extractTokenUrl(res2.body);
                        if (tokenUrl) {
                            fallback = [{ url: tokenUrl, name: "TokenRedirect", quality: quality }];
                            var res3 = await http_get(tokenUrl, H);
                            if (res3 && res3.body) {
                                var links = extractFinalLinks(res3.body);
                                if (links && links.length > 0) {
                                    links.forEach(function(l) { if (!l.quality || l.quality === "Auto") l.quality = quality; });
                                    return links;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return fallback;
    }

    async function getHome(cb) {
        try {
            var res = await http_get(BASE + "/", H);
            if (!res || !res.body) return cb({ success: false, errorCode: "SITE_OFFLINE" });
            var items = [];
            var re = /<a[^>]+href="(https:\/\/[^"']+\/(?:movie|series)\/[^"']+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
            var m;
            var seen = {};
            while ((m = re.exec(res.body))) {
                var url = m[1];
                var poster = m[2];
                var titleMatch = res.body.substring(Math.max(0, m.index - 200), m.index).match(/(?:alt|title)="([^"]+)"/);
                var title = titleMatch ? cleanText(titleMatch[1]) : "Unknown";
                if (seen[url]) continue;
                seen[url] = true;
                var type = url.includes("/series/") ? "series" : "movie";
                items.push(new MultimediaItem({ title: title, url: url, posterUrl: poster, type: type }));
            }
            if (items.length === 0) {
                re = /<a[^>]+href="(https:\/\/4x4rhe\.movielinkbd\.li\/(?:movie|series)\/[^"']+)"[^>]*>\s*(?:<img[^>]+>)?\s*(?:<[^>]+>)*\s*([^<]+)/gi;
                while ((m = re.exec(res.body))) {
                    var url = m[1];
                    var title = cleanText(m[2]);
                    if (seen[url] || !title) continue;
                    seen[url] = true;
                    var type = url.includes("/series/") ? "series" : "movie";
                    items.push(new MultimediaItem({ title: title, url: url, type: type }));
                }
            }
            cb({ success: true, data: { Home: items } });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            var res = await http_get(BASE + "/search?q=" + encodeURIComponent(query), H);
            if (!res || !res.body) return cb({ success: true, data: [] });
            var items = [];
            var re = /<a[^>]+href="(https:\/\/[^"']+\/(?:movie|series)\/[^"']+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
            var m;
            var seen = {};
            while ((m = re.exec(res.body))) {
                var url = m[1];
                var poster = m[2];
                var titleMatch = res.body.substring(Math.max(0, m.index - 300), m.index).match(/(?:alt|title)="([^"]+)"/);
                var title = titleMatch ? cleanText(titleMatch[1]) : "Unknown";
                if (seen[url]) continue;
                seen[url] = true;
                var type = url.includes("/series/") ? "series" : "movie";
                items.push(new MultimediaItem({ title: title, url: url, posterUrl: poster, type: type }));
            }
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: true, data: [] });
        }
    }

    async function load(url, cb) {
        try {
            var res = await http_get(url, H);
            if (!res || !res.body) return cb({ success: false, errorCode: "SITE_OFFLINE" });

            var title = "";
            var tRe = /<h\d[^>]*>\s*([^<]+)\s*<\/h\d>/i;
            var tm = tRe.exec(res.body);
            if (tm) title = cleanText(tm[1]);

            var poster = "";
            var pRe = /<img[^>]+src="([^"]+)"[^>]*alt="Poster/i;
            var pm = pRe.exec(res.body);
            if (pm) poster = pm[1];

            var imdbId = "";
            var imdbRe = /tt\d+/i;
            var im = imdbRe.exec(res.body);
            if (im) imdbId = im[0];

            var isSeries = /\/series\//.test(url) || /episode|season/i.test(title);

            var getLinks = extractGetLinkUrls(res.body);
            if (getLinks.length === 0) {
                var re = /<a[^>]+href="(\/getLink\/[^"]+)"[^>]*>[\s\S]*?(480p|720p|1080p|2160p|4K|360p)[\s\S]*?(?:<\/a>|$)/gi;
                var m;
                while ((m = re.exec(res.body))) {
                    getLinks.push({ url: fixUrl(m[1]), quality: getQuality(m[2]), size: "" });
                }
            }

            var watchRe = /<a[^>]+href="(\/getWatch\/[^"]+)"[^>]*>[\s\S]*?Watch Online[\s\S]*?<\/a>/i;
            var watchM = watchRe.exec(res.body);
            if (watchM) {
                getLinks.unshift({ url: fixUrl(watchM[1]), quality: "Watch", size: "Stream" });
            }

            var movieLinks = [];
            for (var i = 0; i < getLinks.length; i++) {
                movieLinks.push({ source: getLinks[i].url, quality: getLinks[i].quality, size: getLinks[i].size });
            }

            var episodes = [];
            if (movieLinks.length > 0) {
                episodes.push(new Episode({
                    name: "Full Movie",
                    season: 1,
                    episode: 1,
                    url: JSON.stringify(movieLinks),
                    posterUrl: poster || ""
                }));
            }

            if (episodes.length === 0) return cb({ success: false, errorCode: "PARSE_ERROR", message: "No links found" });

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title || "Unknown",
                    url: url,
                    posterUrl: poster || "",
                    type: isSeries ? "series" : "movie",
                    episodes: episodes,
                    syncData: imdbId ? { imdb: imdbId } : undefined
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(dataStr, cb) {
        try {
            var sources = [];
            try { sources = JSON.parse(dataStr); } catch { sources = []; }
            if (!Array.isArray(sources) || sources.length === 0) return cb({ success: true, data: [] });

            var results = [];
            for (var i = 0; i < sources.length; i++) {
                var item = sources[i];
                var q = item.quality || "Auto";
                var finalLinks = await resolveGetLink(item.source, q);
                if (finalLinks && finalLinks.length > 0) {
                    finalLinks.forEach(function(link) {
                        results.push(new StreamResult({
                            url: link.url,
                            source: link.name + " [" + (link.quality || q) + "]",
                            quality: link.quality || q,
                            headers: H
                        }));
                    });
                } else {
                    results.push(new StreamResult({
                        url: item.source,
                        source: "GetLink [" + q + "]",
                        quality: q,
                        headers: H
                    }));
                }
            }

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
