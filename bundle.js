#!/usr/bin/env node
/**
 * bundle.js  - Plugin bundler
 *
 * Combines plugin.js + plugin.json into plugin.bundle.js
 * Manifest embedded as base64 var (survives minification + obfuscation).
 *
 * Usage:
 *   node bundle.js                          # bundle CWD (minified)
 *   node bundle.js ../moviebox              # bundle named plugin dir
 *   node bundle.js --all                    # bundle ALL plugins/
 *   node bundle.js --no-minify              # skip minification
 *   node bundle.js --obfuscate              # minify + obfuscate (harder to reverse)
 *   node bundle.js --obfuscate --obfuscate-level 0.5
 *
 * Obfuscation settings (zero perf impact):
 *   - string array + shuffle/rotate (fast array lookup, no function calls)
 *   - numbers → expressions (parse-time)
 *   - identifier mangling
 *   - NO control flow flattening
 *   - NO dead code injection
 *   - NO self-defending
 *
 * Output: <plugin>/plugin.bundle.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function base64Encode(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function minifyJS(code) {
  try {
    const r = execSync(
      `npx -y terser --compress passes=2 --mangle`,
      { input: code, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 30000, shell: true }
    ).trim();
    if (r && r.length > 0) return r;
  } catch (_) {}
  return code;
}

function obfuscateJS(code, level) {
  const tmpIn = path.join(os.tmpdir(), `ff_bundle_in_${process.pid}.js`);
  const tmpOut = path.join(os.tmpdir(), `ff_bundle_out_${process.pid}.js`);
  fs.writeFileSync(tmpIn, code, 'utf-8');

  try {
    execSync(
      `npx -y javascript-obfuscator "${tmpIn}" --output "${tmpOut}"` +
      ` --compact true` +
      ` --control-flow-flattening false` +
      ` --dead-code-injection false` +
      ` --self-defending false` +
      ` --disable-console-output true` +
      ` --rename-globals false` +
      ` --string-array true` +
      ` --string-array-encoding none` +
      ` --string-array-threshold ${level}` +
      ` --string-array-rotate true` +
      ` --string-array-shuffle true` +
      ` --split-strings true` +
      ` --split-strings-chunk-length 10` +
      ` --numbers-to-expressions true` +
      ` --identifier-names-generator mangled` +
      ` --simplify false` +
      ` --target node`,
      { encoding: 'utf-8', timeout: 120000, shell: true }
    );
    return fs.readFileSync(tmpOut, 'utf-8');
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

function bundlePlugin(pluginDir, skipMinify, obfuscate) {
  const jsPath = path.join(pluginDir, 'plugin.js');
  const jsonPath = path.join(pluginDir, 'plugin.json');
  const outPath = path.join(pluginDir, 'plugin.bundle.js');

  if (!fs.existsSync(jsPath)) {
    console.error(`SKIP ${pluginDir}: missing plugin.js`);
    return false;
  }
  if (!fs.existsSync(jsonPath)) {
    console.error(`SKIP ${pluginDir}: missing plugin.json`);
    return false;
  }

  const pluginJs = fs.readFileSync(jsPath, 'utf-8');
  const pluginJson = fs.readFileSync(jsonPath, 'utf-8');

  let manifest;
  try { manifest = JSON.parse(pluginJson); } catch (e) {
    console.error(`SKIP ${pluginDir}: invalid plugin.json - ${e.message}`);
    return false;
  }

  const manifestB64 = base64Encode(JSON.stringify(manifest));

  if (obfuscate) {
    // Obfuscate plugin code FIRST, then prepend manifest header
    // (prevents obfuscator from encoding the manifest variable/string)
    const before = pluginJs.length;
    let obfuscated = obfuscateJS(pluginJs, OBFUSCATE_LEVEL);
    obfuscated = minifyJS(obfuscated);
    const code = `var __BUNDLED_MANIFEST__="${manifestB64}";\n${obfuscated}`;
    console.log(`  obfuscated: ${before + manifestB64.length + 32} → ${code.length} bytes (${Math.round((1 - code.length / (before + manifestB64.length + 32)) * 100)}% saved)`);
    validateAndWrite(pluginDir, outPath, code);
  } else if (!skipMinify) {
    const code = `var __BUNDLED_MANIFEST__="${manifestB64}";\n${pluginJs}`;
    const before = code.length;
    const minified = minifyJS(code);
    console.log(`  minified: ${before} → ${minified.length} bytes (${Math.round((1 - minified.length / before) * 100)}% saved)`);
    validateAndWrite(pluginDir, outPath, minified);
  } else {
    const code = `var __BUNDLED_MANIFEST__="${manifestB64}";\n${pluginJs}`;
    validateAndWrite(pluginDir, outPath, code);
  }

  return true;
}

function validateAndWrite(pluginDir, outPath, code) {
  const hasManifest = /__BUNDLED_MANIFEST__\s*=\s*"([A-Za-z0-9+/=]+)"/.test(code);
  const hasExports = code.includes('getHome') || code.includes('getHome:');
  if (!hasManifest || !hasExports) {
    console.error(`  ERROR: bundle corrupt (manifest=${hasManifest}, exports=${hasExports})`);
    return;
  }
  fs.writeFileSync(outPath, code, 'utf-8');
  console.log(`BUNDLED ${path.basename(pluginDir)} → ${outPath}`);
}

function findAllPluginDirs(rootDir) {
  return fs.readdirSync(rootDir)
    .map(name => path.join(rootDir, name))
    .filter(p => fs.statSync(p).isDirectory() &&
                 fs.existsSync(path.join(p, 'plugin.js')));
}

// ── CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const skipMinify = args.includes('--no-minify');
const obfuscate = args.includes('--obfuscate');

// Obfuscation level (string array threshold, 0-1). Higher = more strings encoded.
const levelIdx = args.indexOf('--obfuscate-level');
const OBFUSCATE_LEVEL = levelIdx >= 0 && levelIdx + 1 < args.length
  ? parseFloat(args[levelIdx + 1])
  : 0.8;
if (isNaN(OBFUSCATE_LEVEL) || OBFUSCATE_LEVEL < 0 || OBFUSCATE_LEVEL > 1) {
  console.error('--obfuscate-level must be between 0 and 1');
  process.exit(1);
}

const posArgs = args.filter(a => !a.startsWith('--'));
const targetArg = posArgs[0] || null;

if (args.includes('--all')) {
  const pluginsRoot = targetArg
    ? path.resolve(targetArg)
    : path.resolve(__dirname, '..');
  const dirs = findAllPluginDirs(pluginsRoot);
  let ok = 0, fail = 0;
  dirs.forEach(d => { bundlePlugin(d, skipMinify, obfuscate) ? ok++ : fail++; });
  console.log(`\nDone. ${ok} bundled, ${fail} skipped.`);
} else {
  const target = targetArg ? path.resolve(process.cwd(), targetArg) : process.cwd();
  if (!bundlePlugin(target, skipMinify, obfuscate)) process.exit(1);
}
