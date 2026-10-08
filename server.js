// Arcade Hub back end: static files + accounts + shared leaderboard.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUB = path.join(__dirname, 'public');

let db = {};
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { db = {}; }
if (!db || typeof db !== 'object' || Array.isArray(db)) db = {};

const sessions = new Map();
let timer = null;

const save = () => {
  clearTimeout(timer);
  timer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(db, null, 2), () => {}), 300);
};

const n = x => Math.max(0, Math.min(1e7, +x || 0));
const clean = s => {
  const o = {};
  Object.keys(s || {}).slice(0, 60).forEach(k => {
    const v = s[k] || {};
    o[k] = { p:n(v.p), w:n(v.w), pts:n(v.pts), best:n(v.best), lv:Math.min(10,n(v.lv)||1) };
  });
  return o;
};
const normalizeName = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const validName = s => /^[A-Za-z0-9 _-]{2,16}$/.test(String(s || '').trim());
const validPin = s => /^\d{4,8}$/.test(String(s || ''));
const hashPin = (pin, salt) => crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256').toString('hex');
const makeToken = () => crypto.randomBytes(32).toString('hex');
const makeId = () => 'u_' + crypto.randomBytes(9).toString('base64url');

function findByName(name) {
  const key = normalizeName(name);
  for (const [id, p] of Object.entries(db)) {
    if (p && normalizeName(p.name) === key) return [id, p];
  }
  return null;
}
function sessionId(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return sessions.get(token) || null;
}
function json(res, code, data) {
  res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function body(req, cb) {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 100000) req.destroy(); });
  req.on('end', () => {
    try { cb(JSON.parse(b || '{}')); } catch(e) { json(req.res,400,{error:'Invalid JSON'}); }
  });
}

const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};

http.createServer((req,res) => {
  req.res = res;
  const u = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Public leaderboard data.
  if (u.pathname === '/api/players' && req.method === 'GET') {
    return json(res,200,Object.entries(db).map(([id,data]) => ({
      id,
      data: {
        stats: data.stats || {},
        following: Array.isArray(data.following) ? data.following : [],
        name: data.name || ''
      }
    })));
  }

  // Create a unique account.
  if (u.pathname === '/api/register' && req.method === 'POST') {
    return body(req, d => {
      const name = String(d.name || '').trim().replace(/\s+/g,' ');
      const pin = String(d.pin || '');
      if (!validName(name)) return json(res,400,{error:'Name must be 2-16 characters and use letters, numbers, spaces, _ or -.'});
      if (!validPin(pin)) return json(res,400,{error:'PIN must be 4-8 digits.'});
      if (findByName(name)) return json(res,409,{error:'That username is already taken.'});
      const id = makeId(), salt = crypto.randomBytes(16).toString('hex');
      db[id] = {stats:{},following:[],name,auth:{salt,pin:hashPin(pin,salt)},upd:Date.now()};
      save();
      const token = makeToken(); sessions.set(token,id);
      return json(res,201,{ok:true,id,name,token});
    });
  }

  // Log in on another phone/computer.
  if (u.pathname === '/api/login' && req.method === 'POST') {
    return body(req, d => {
      const name = String(d.name || '').trim();
      const pin = String(d.pin || '');
      const found = findByName(name);
      if (!found || !found[1].auth) return json(res,401,{error:'Username or PIN is incorrect.'});
      const [id,p] = found, expected = hashPin(pin,p.auth.salt);
      if (!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(p.auth.pin))) {
        return json(res,401,{error:'Username or PIN is incorrect.'});
      }
      const token = makeToken(); sessions.set(token,id);
      return json(res,200,{ok:true,id,name:p.name,token});
    });
  }

  // Check the saved login.
  if (u.pathname === '/api/session' && req.method === 'GET') {
    const id = sessionId(req);
    if (!id || !db[id]) return json(res,401,{error:'Not logged in.'});
    return json(res,200,{ok:true,id,name:db[id].name});
  }

  // Save only to the currently logged-in player's account.
  const m = u.pathname.match(/^\/api\/players\/([\w-]{1,50})$/);
  if (m && req.method === 'PUT') {
    const id = sessionId(req);
    if (!id || id !== m[1] || !db[id]) return json(res,401,{error:'Please log in again.'});
    return body(req, d => {
      const old = db[id] || {};
      db[id] = {
        ...old,
        stats: clean(d.stats),
        following: (Array.isArray(d.following) ? d.following : []).slice(0,500).map(String),
        name: old.name,
        upd: Date.now()
      };
      save();
      return json(res,200,{ok:true});
    });
  }

  const requested = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  const f = path.join(PUB, requested);
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(f,(e,data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(PORT,() => console.log('Arcade Hub running on port ' + PORT));
