const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

let admin = null;
try {
  admin = require('firebase-admin');
} catch (err) {
  console.warn('firebase-admin 모듈을 불러오지 못했습니다. 로컬 파일 저장소로 대체합니다.', err.message);
}

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
let firestore = null;

function initFirebase() {
  if (firestore) return firestore;

  if (admin && firebaseProjectId && firebaseClientEmail && firebasePrivateKey) {
    const credentials = {
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey.replace(/\\n/g, '\n')
    };

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(credentials) });
    }

    firestore = admin.firestore();
    console.log('Using Firebase Firestore storage for leaderboard.');
  } else {
    console.warn('Firebase credentials missing; falling back to local file storage.');
  }

  return firestore;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf-8');
  }
}

async function loadLeaderboard() {
  const db = initFirebase();
  if (db) {
    const snapshot = await db
      .collection('leaderboard')
      .orderBy('score', 'desc')
      .orderBy('submittedAt', 'asc')
      .limit(5)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        name: data.name,
        score: data.score,
        submittedAt: data.submittedAt
      };
    });
  }

  ensureDataFile();
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read leaderboard, resetting.', err);
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf-8');
    return [];
  }
}

async function saveLeaderboard(entries) {
  const db = initFirebase();
  if (db) {
    const batch = db.batch();
    const collectionRef = db.collection('leaderboard');

    entries.forEach((entry) => {
      const docId = (entry.name || 'anonymous')
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '') || 'anonymous';
      const docRef = collectionRef.doc(docId);
      batch.set(docRef, entry);
    });

    // Clean up any extra documents beyond top 5 by fetching current docs.
    const existing = await collectionRef.get();
    existing.docs
      .filter((doc) => !entries.find((e) => (e.name || '').toString().toLowerCase() === (doc.data().name || '').toString().toLowerCase()))
      .forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
    return;
  }

  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

function sortAndTrim(entries) {
  return entries
    .sort((a, b) => {
      if (b.score === a.score) {
        return new Date(a.submittedAt) - new Date(b.submittedAt);
      }
      return b.score - a.score;
    })
    .slice(0, 5);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const typeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };

  const contentType = typeMap[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

let leaderboard = [];
loadLeaderboard()
  .then((entries) => {
    leaderboard = entries;
  })
  .catch((err) => {
    console.error('Failed to initialize leaderboard from storage', err);
  });

function upsertEntry(entries, newEntry) {
  const nameKey = (newEntry.name || '').toString().toLowerCase();
  const filtered = entries.filter(
    (entry) => (entry.name || '').toString().toLowerCase() !== nameKey
  );
  return sortAndTrim([...filtered, newEntry]);
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    if (urlObj.pathname === '/api/leaderboard') {
      if (req.method === 'GET') {
        leaderboard = await loadLeaderboard();
        sendJson(res, 200, { entries: leaderboard });
        return;
      }

      if (req.method === 'POST') {
        try {
          const body = await parseBody(req);
          const name = (body.name || '익명 노동자').toString().trim().slice(0, 32);
          const score = Number(body.score);

          if (!Number.isFinite(score) || score < 0) {
            sendJson(res, 400, { error: '유효하지 않은 점수입니다.' });
            return;
          }

          const entry = {
            name: name || '익명 노동자',
            score: Math.floor(score),
            submittedAt: new Date().toISOString()
          };

          leaderboard = upsertEntry(await loadLeaderboard(), entry);
          await saveLeaderboard(leaderboard);

          sendJson(res, 201, { entries: await loadLeaderboard() });
        } catch (err) {
          console.error('Failed to save leaderboard', err);
          sendJson(res, 400, { error: '요청을 처리할 수 없습니다.' });
        }
        return;
      }

      sendJson(res, 405, { error: '메서드를 지원하지 않습니다.' });
      return;
    }

    let requestedPath = urlObj.pathname === '/' ? '/index.html' : decodeURI(urlObj.pathname);
    const safePath = path.normalize(requestedPath).replace(/^\.\//, '/');
    let filePath = path.join(ROOT_DIR, safePath);

    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('잘못된 경로입니다.');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      serveFile(res, filePath);
    });
  } catch (err) {
    console.error('Unhandled server error', err);
    sendJson(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
});

server.listen(PORT, () => {
  console.log(`Dust Farm server listening on http://localhost:${PORT}`);
});
