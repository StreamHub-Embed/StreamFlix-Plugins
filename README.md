# StreamFlix Plugins

Plugin repo for StreamFlix — personal Tauri-based streaming app.

## Plugins

| Plugin | Description |
|--------|-------------|
| [tmdb-embed](tmdb-embed/) | TMDB metadata + multi-service stream aggregation (Vyla, Movieslay, StreamHub, D3R, Nuvio). Supports movies & TV with subtitle passthrough. |
| [fluxforge](fluxforge/) | Browse movies and TV shows via TMDB proxy API. Lightweight metadata plugin. |

## Usage

Place plugin folder inside StreamFlix's plugin directory. App auto-discovers via `plugin.json`.

## Structure

```
plugin-name/
├── plugin.json   # Metadata (name, version, providers)
└── plugin.js     # Plugin runtime (getHome, search, load, loadStreams)
```
