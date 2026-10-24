/**
 * 空仓库需要用 Contents API 先做一次初始提交，
 * 之后才能使用 Git Data API（blobs/trees/commits）。
 */
import { readFileSync } from 'fs';
import https from 'https';

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'iiiiiiiiiiiiiKK';
const REPO = 'life-ledger';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        rejectUnauthorized: false,
        headers: {
          Authorization: `token ${TOKEN}`,
          'User-Agent': 'life-ledger-deployer',
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`${method} ${path} → ${res.statusCode}: ${text.slice(0, 300)}`));
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const readme = readFileSync('README.md', 'utf8');

const res = await api('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
  message: 'chore: 初始化仓库',
  content: Buffer.from(readme, 'utf8').toString('base64'),
  branch: 'main',
});

console.log('初始提交:', res.commit.sha.slice(0, 7));
console.log('README:', res.content.html_url);
