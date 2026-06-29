(function() {
    const TMDB_BASE = manifest.baseUrl || "https://db.videasy.to/3";
    const SERVICES = manifest.services || [];

    async function getHome(cb) {
        try {
            const endpoints = [
                { name: "Trending Movies", url: `${TMDB_BASE}/trending/movie/day`, type: 'movie' },
                { name: "Trending TV Shows", url: `${TMDB_BASE}/trending/tv/day`, type: 'tv' },
                { name: "Top Rated Movies", url: `${TMDB_BASE}/movie/top_rated`, type: 'movie' },
                { name: "Popular TV Shows", url: `${TMDB_BASE}/tv/popular`, type: 'tv' },
                { name: "Action & Adventure", url: `${TMDB_BASE}/discover/movie?with_genres=28`, type: 'movie' },
                { name: "Animation", url: `${TMDB_BASE}/discover/movie?with_genres=16`, type: 'movie' },
                { name: "Sci-Fi & Fantasy TV", url: `${TMDB_BASE}/discover/tv?with_genres=10765`, type: 'tv' },
                { name: "Comedy Movies", url: `${TMDB_BASE}/discover/movie?with_genres=35`, type: 'movie' }
            ];

            const requests = endpoints.map(ep => ({ url: ep.url, headers: { "Accept": "application/json" } }));
            const responses = await http_parallel(requests, 4);

            const homeData = {};

            responses.forEach((res, i) => {
                if (res && res.status === 200) {
                    try {
                        const data = JSON.parse(res.body);
                        const ep = endpoints[i];
                        const items = [];

                        (data.results || []).forEach(item => {
                            const isMovie = ep.type === 'movie';
                            items.push(new MultimediaItem({
                                title: item.title || item.name || "Unknown",
                                url: JSON.stringify({ id: item.id, type: ep.type }),
                                posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                                type: isMovie ? 'movie' : 'tvseries'
                            }));
                        });

                        if (items.length > 0) {
                            homeData[ep.name] = items;
                        }
                    } catch(e) {}
                }
            });

            cb({ success: true, data: homeData });
        } catch(e) {
            cb({ success: false, message: e.toString() });
        }
    }

    async function search(query, cb) {
        try {
            const res = await http_get(`${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}`, { "Accept": "application/json" });
            const data = JSON.parse(res.body);
            const list = data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv').map(item => {
                return new MultimediaItem({
                    title: item.title || item.name || "Unknown",
                    url: JSON.stringify({ id: item.id, type: item.media_type === 'movie' ? 'movie' : 'tv' }),
                    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                    type: item.media_type === 'movie' ? 'movie' : 'tvseries'
                });
            });
            cb({ success: true, data: list });
        } catch(e) {
            cb({ success: false, message: e.toString() });
        }
    }

    async function load(urlData, cb) {
        try {
            const payload = JSON.parse(urlData);
            const isMovie = payload.type === 'movie';
            const endpoint = isMovie ? `/movie/${payload.id}` : `/tv/${payload.id}`;
            const res = await http_get(`${TMDB_BASE}${endpoint}`, { "Accept": "application/json" });
            const item = JSON.parse(res.body);

            const episodes = [];
            if (isMovie) {
                episodes.push(new Episode({
                    name: item.title || "Watch Movie",
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({ id: payload.id, type: 'movie' }),
                    posterUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : ""
                }));
            } else {
                const seasonRequests = (item.seasons || []).filter(s => s.season_number > 0).map(s => {
                    return {
                        url: `${TMDB_BASE}/tv/${payload.id}/season/${s.season_number}`,
                        headers: { "Accept": "application/json" }
                    };
                });

                const responses = await http_parallel(seasonRequests, 10);
                responses.forEach(r => {
                    if (r.status === 200) {
                        try {
                            const sData = JSON.parse(r.body);
                            (sData.episodes || []).forEach(ep => {
                                episodes.push(new Episode({
                                    name: ep.name || `Episode ${ep.episode_number}`,
                                    season: ep.season_number,
                                    episode: ep.episode_number,
                                    url: JSON.stringify({ id: payload.id, type: 'tv', season: ep.season_number, episode: ep.episode_number }),
                                    posterUrl: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : ""
                                }));
                            });
                        } catch(e) {}
                    }
                });
            }

            const mm = new MultimediaItem({
                title: item.title || item.name || "Unknown",
                url: urlData,
                posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backgroundPosterUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : "",
                description: item.overview,
                type: isMovie ? 'movie' : 'tvseries',
                year: item.release_date ? parseInt(item.release_date.split('-')[0]) : (item.first_air_date ? parseInt(item.first_air_date.split('-')[0]) : undefined),
                episodes: episodes
            });
            cb({ success: true, data: mm });
        } catch(e) {
            cb({ success: false, message: e.toString() });
        }
    }

    async function loadStreams(urlData, cb) {
        try {
            const payload = JSON.parse(urlData);
            const isMovie = payload.type === 'movie';

            // Build endpoints from SERVICES config
            const endpoints = [];
            SERVICES.forEach(s => {
                const url = s.urlType === 'query'
                    ? (isMovie ? `${s.baseUrl}/?id=${payload.id}` : `${s.baseUrl}/?id=${payload.id}&s=${payload.season}&e=${payload.episode}`)
                    : (isMovie ? `${s.baseUrl}/movie?id=${payload.id}` : `${s.baseUrl}/tv?id=${payload.id}&season=${payload.season}&episode=${payload.episode}`);
                endpoints.push({ name: s.name, url });
            });

            // Get proxy port for SSE relay
            let proxyPort;
            try { proxyPort = await getProxyPort(); } catch(e) { proxyPort = 3000; }

            const results = [];
            const seenUrls = new Set();
            let subtitles = [];

            const innerUrl = (u) => {
                try {
                    const p = new URL(u);
                    const q = p.searchParams.get('url');
                    if (q && q.startsWith('http')) return q;
                } catch(e) {}
                return u;
            };
            let pending = endpoints.length;
            let called = false;

            function finish() {
                if (called) return;
                called = true;
                const uniqueSubs = [];
                const subMap = {};
                subtitles.forEach(sub => {
                    const subLabel = sub.label || sub.language || 'Unknown';
                    const subUrl = sub.file || sub.url;
                    if (!subMap[subLabel] && subUrl) {
                        subMap[subLabel] = true;
                        uniqueSubs.push({ label: subLabel, url: subUrl, language: subLabel, lang: subLabel });
                    }
                });
                if (uniqueSubs.length > 0) {
                    results.forEach(res => { res.subtitles = uniqueSubs; });
                }
                cb({ success: true, data: results });
            }

            function processEvent(data, prefix) {
                if (data.type === 'source' && data.source) {
                    const src = data.source;
                    const hdrs = src.proxyHeaders || {};

                    let streamUrl = src.proxyUrl || src.url;
                    if (seenUrls.has(innerUrl(streamUrl))) return;
                    seenUrls.add(innerUrl(streamUrl));

                    const proxyConfig = JSON.stringify({ url: streamUrl, headers: hdrs });
                    const finalUrl = 'MAGIC_PROXY_v2' + btoa(unescape(encodeURIComponent(proxyConfig)));

                    let qNum = undefined;
                    const lbl = src.label || '';
                    if (lbl.toLowerCase().includes('4k')) qNum = 2160;
                    else if (lbl.includes('1080')) qNum = 1080;
                    else if (lbl.includes('720')) qNum = 720;
                    else if (lbl.includes('480')) qNum = 480;

                    results.push(new StreamResult({
                        url: finalUrl,
                        source: `${prefix} ${src.label || src.source}`.trim(),
                        type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
                        headers: hdrs,
                        quality: qNum
                    }));
                } else if (data.type === 'meta' && data.meta && data.meta.subtitles) {
                    subtitles = subtitles.concat(data.meta.subtitles);
                } else if (data.provider) {
                    const hdrs = data.playback_headers || {};

                    // Format 1: Vidlink (data.stream)
                    if (data.status === 'ok' && data.data && data.data.stream) {
                        let fileUrl = data.data.stream.proxyUrl || data.data.stream.playlist || data.data.stream.file;
                        if (fileUrl) {
                            if (seenUrls.has(innerUrl(fileUrl))) return;
                            seenUrls.add(innerUrl(fileUrl));
                            const proxyConfig = JSON.stringify({ url: fileUrl, headers: hdrs });
                            const finalUrl = 'MAGIC_PROXY_v2' + btoa(unescape(encodeURIComponent(proxyConfig)));

                            results.push(new StreamResult({
                                url: finalUrl,
                                source: `${prefix} ${data.provider}`,
                                type: fileUrl.includes('.m3u8') ? 'hls' : 'mp4',
                                headers: hdrs
                            }));
                        }
                        if (data.data.stream.captions) {
                            data.data.stream.captions.forEach(cap => {
                                if (cap.url) subtitles.push({ label: cap.language || 'English', file: cap.url });
                            });
                        }
                    }

                    // Format 2: Vidfast / Videasy / others (data.streams array)
                    if (data.status === 'ok' && data.streams && Array.isArray(data.streams)) {
                        data.streams.forEach(stream => {
                            if (stream.status === 'ok' && stream.data) {
                                let fileUrl = stream.proxyUrl || stream.data.url || stream.data.playlist;
                                if (!fileUrl) return;
                                if (seenUrls.has(innerUrl(fileUrl))) return;
                                seenUrls.add(innerUrl(fileUrl));

                                const proxyConfig = JSON.stringify({ url: fileUrl, headers: hdrs });
                                const finalUrl = 'MAGIC_PROXY_v2' + btoa(unescape(encodeURIComponent(proxyConfig)));

                                const serverName = stream.server_meta ? stream.server_meta.name : stream.server || '';
                                const desc = stream.server_meta ? stream.server_meta.description : '';

                                let qNum = undefined;
                                let lang = stream.language || undefined;

                                if (desc) {
                                    if (desc.toLowerCase().includes('4k')) qNum = 2160;
                                    else if (desc.includes('1080')) qNum = 1080;
                                    else if (desc.includes('720')) qNum = 720;
                                    else if (desc.includes('480')) qNum = 480;
                                    if (!lang) {
                                        const parts = desc.split(',').map(s => s.trim());
                                        lang = parts[0].replace(/audio/i, '').trim();
                                    }
                                }

                                const langStr = lang && lang !== 'Original' ? `[${lang}]` : '';
                                const qStr = qNum ? `[${qNum}p]` : '';

                                results.push(new StreamResult({
                                    url: finalUrl,
                                    source: `${prefix} ${data.provider} ${serverName} ${langStr} ${qStr}`.trim().replace(/\s+/g, ' '),
                                    type: fileUrl.includes('.m3u8') ? 'hls' : 'mp4',
                                    headers: hdrs,
                                    quality: qNum,
                                    language: lang || 'Original'
                                }));

                                if (stream.data.tracks) {
                                    stream.data.tracks.forEach(trk => {
                                        if (trk.file) subtitles.push({ label: trk.label || 'Unknown', file: trk.file });
                                    });
                                }
                            }
                        });
                    }

                    // Format 3: Lordflix / Hexa (data.servers array)
                    if (data.servers && Array.isArray(data.servers)) {
                        data.servers.forEach(srv => {
                            if (srv.status === 'ok' && srv.data) {
                                const streams = srv.data.stream || srv.data.sources || [];
                                streams.forEach(src => {
                                    let fileUrl = src.proxyUrl || src.file || src.playlist || src.url;
                                    if (!fileUrl) return;
                                    if (seenUrls.has(innerUrl(fileUrl))) return;
                                    seenUrls.add(innerUrl(fileUrl));

                                    const proxyConfig = JSON.stringify({ url: fileUrl, headers: hdrs });
                                    const finalUrl = 'MAGIC_PROXY_v2' + btoa(unescape(encodeURIComponent(proxyConfig)));

                                    let qNum = undefined;
                                    const lbl = src.label || src.id || '';
                                    if (lbl.toLowerCase().includes('4k')) qNum = 2160;
                                    else if (lbl.includes('1080')) qNum = 1080;
                                    else if (lbl.includes('720')) qNum = 720;
                                    else if (lbl.includes('480')) qNum = 480;

                                    results.push(new StreamResult({
                                        url: finalUrl,
                                        source: `${prefix} ${data.provider} ${srv.server} ${lbl}`.trim().replace(/\s+/g, ' '),
                                        type: fileUrl.includes('.m3u8') ? 'hls' : 'mp4',
                                        headers: hdrs,
                                        quality: qNum,
                                        language: srv.language || 'Original'
                                    }));

                                    if (src.captions) {
                                        src.captions.forEach(cap => {
                                            if (cap.url || cap.file) subtitles.push({ label: cap.id || cap.language || 'Unknown', file: cap.url || cap.file });
                                        });
                                    }
                                });

                                if (srv.data.tracks) {
                                    srv.data.tracks.forEach(trk => {
                                        if (trk.kind === 'captions' || trk.file) {
                                            subtitles.push({ label: trk.label || 'Unknown', file: trk.file });
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            }

            // Connect each endpoint via EventSource through the Axum SSE proxy
            logRequest('TMDB-SSE', `Connecting to ${endpoints.length} endpoints`);
            endpoints.forEach(ep => {
                const proxyConfig = JSON.stringify({ url: ep.url, headers: { "Accept": "text/event-stream" } });
                const proxyUrl = `http://127.0.0.1:${proxyPort}/sse?d=${encodeURIComponent(btoa(unescape(encodeURIComponent(proxyConfig))))}`;

                const es = new EventSource(proxyUrl);
                let esDone = false;
                let gotData = false;

                es.onopen = () => {
                    logRequest('TMDB-SSE', `${ep.name} opened`);
                };

                es.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'done') {
                            logRequest('TMDB-SSE', `${ep.name} done`);
                            es.close();
                            if (!esDone) { esDone = true; pending--; if (pending === 0) { logRequest('TMDB-SSE', 'All endpoints finished, found ' + results.length + ' streams'); finish(); } }
                            return;
                        }
                        gotData = true;
                        processEvent(data, ep.name);
                    } catch(e) {}
                };

                es.onerror = () => {
                    const msg = gotData ? 'disconnected' : 'failed';
                    logRequest('TMDB-SSE', `${ep.name} ${msg}`);
                    if (!esDone) { esDone = true; pending--; if (pending === 0) { logRequest('TMDB-SSE', 'All endpoints finished, found ' + results.length + ' streams'); finish(); } }
                    es.close();
                };
            });

            // Safety timeout
            setTimeout(() => { logRequest('TMDB-SSE', 'Safety timeout fired, found ' + results.length + ' streams'); finish(); }, 30000);
        } catch(e) {
            cb({ success: false, message: e.toString() });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
