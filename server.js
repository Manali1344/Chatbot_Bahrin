/**
 * SIO Chat Bot Solution — proof of concept
 * Local dev server. No dependencies: Node 18+ only.
 *
 *   1. cp .env.example .env      and put your Anthropic key in it
 *   2. npm start
 *   3. open http://localhost:3000
 *
 * The browser never sees the API key — it calls /api/chat and this file
 * forwards the request to Anthropic. Same shape as the production design,
 * where this proxy sits inside SIO's network.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// --- minimal .env reader (no dotenv dependency) -----------------------------
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const PUBLIC = path.join(__dirname, 'public');
const TTS_LANGS = ['en', 'ar', 'hi', 'ur', 'ml', 'ta', 'bn', 'tl'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function handleChat(req, res) {
  if (!API_KEY) {
    return json(res, 200, {
      error: 'No API key found. Copy .env.example to .env, add ANTHROPIC_API_KEY, and restart the server.',
    });
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1e6) { req.destroy(); return; }
  }

  let payload;
  try { payload = JSON.parse(body); }
  catch { return json(res, 400, { error: 'The request body was not valid JSON.' }); }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: payload.system,
        messages: payload.messages,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const detail = (data && data.error && data.error.message) || upstream.statusText;
      console.error('[anthropic]', upstream.status, detail);
      return json(res, 200, { error: `The model service returned ${upstream.status}: ${detail}` });
    }
    return json(res, 200, data);
  } catch (err) {
    console.error('[proxy]', err.message);
    return json(res, 200, { error: 'Could not reach the model service. Check network access and try again.' });
  }
}

// --- speech: free text-to-speech via Google Translate's voice ---------------
// No key needed. Used when the browser has no installed voice for the language
// (for example Arabic in Chrome or Firefox on Windows). Unofficial endpoint, so
// the production build should swap in a contracted speech service.
async function handleTts(req, res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1e5) { req.destroy(); return; }
  }
  let payload;
  try { payload = JSON.parse(body); }
  catch { return json(res, 400, { error: 'The request body was not valid JSON.' }); }

  const lang = TTS_LANGS.includes(payload.lang) ? payload.lang : 'en';
  const text = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!text) return json(res, 400, { error: 'Nothing to read aloud.' });

  // The endpoint takes at most ~200 characters per request: split on sentence
  // and word boundaries, fetch each part, and join the MP3 frames back together.
  const parts = [];
  let rest = text;
  while (rest.length > 180) {
    let cut = Math.max(...['.', '؟', '?', '!', '،', ',', '।', '۔'].map(p => rest.lastIndexOf(p, 180)));
    if (cut < 60) cut = rest.lastIndexOf(' ', 180);
    if (cut < 1) cut = 180;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);

  try {
    const audio = await Promise.all(parts.map(async (q, i) => {
      const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob'
        + `&tl=${lang}&total=${parts.length}&idx=${i}&textlen=${q.length}&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error(`speech service returned ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    }));
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.end(Buffer.concat(audio));
  } catch (err) {
    console.error('[tts]', err.message);
    return json(res, 502, { error: 'Could not reach the speech service. Check network access.' });
  }
}

function serveStatic(req, res) {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);

  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('Forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  if (req.url === '/api/chat' && req.method === 'POST') return handleChat(req, res);
  if (req.url === '/api/tts' && req.method === 'POST') return handleTts(req, res);
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`\n  SIO Assistant POC running at http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}`);
  console.log(API_KEY ? '  API key loaded.\n' : '  No API key yet — add one to .env and restart.\n');
});
