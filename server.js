const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf-8');
  }
}

function loadLeaderboard() {
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

function saveLeaderboard(entries) {
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

let leaderboard = loadLeaderboard();

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  if (urlObj.pathname === '/api/leaderboard') {
    if (req.method === 'GET') {
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

        leaderboard = sortAndTrim([...leaderboard, entry]);
        saveLeaderboard(leaderboard);

        sendJson(res, 201, { entries: leaderboard });
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
});

server.listen(PORT, () => {
  console.log(`Dust Farm server listening on http://localhost:${PORT}`);
});
