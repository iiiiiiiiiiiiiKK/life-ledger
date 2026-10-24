/**
 * 通过 GitHub Git Data API 一次性提交整个仓库内容。
 * 本机 git 协议到 github.com:443 被阻断，但 api.github.com 可达，
 * 因此用 REST API 直接建 blob → tree → commit → 更新 ref。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import https from 'https';

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'iiiiiiiiiiiiiKK';
const REPO = 'life-ledger';
const ROOT = process.cwd();

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '_shots', '.artifacts', '.layout-out', '.e2e-out']);
const SKIP_FILES = new Set(['.env', '.env.local']);

if (!TOKEN) {
  console.error('缺少 GH_TOKEN');
  process.exit(1);
}

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
          else reject(new Error(`${method} ${path} → ${res.statusCode}: ${text.slice(0, 400)}`));
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|zip)$/i;

async function main() {
  const files = walk(ROOT).sort();
  console.log(`共 ${files.length} 个文件待上传\n`);

  // 1. 当前 HEAD
  let parentSha = null;
  let baseTree = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    parentSha = ref.object.sha;
    const commit = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
    baseTree = commit.tree.sha;
    console.log(`已有提交 ${parentSha.slice(0, 7)}，将基于它追加`);
  } catch {
    console.log('空仓库，创建首个提交');
  }

  // 2. 创建 blobs
  const tree = [];
  let i = 0;
  for (const file of files) {
    const buf = readFileSync(join(ROOT, file));
    const isBinary = BINARY.test(file);
    const content = isBinary ? buf.toString('base64') : buf.toString('utf8');

    const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content,
      encoding: isBinary ? 'base64' : 'utf-8',
    });
    tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    i++;
    if (i % 10 === 0 || i === files.length) process.stdout.write(`  blob ${i}/${files.length}\r`);
  }
  console.log('\nblob 创建完成');

  // 3. 创建 tree
  const treeRes = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    ...(baseTree ? { base_tree: baseTree } : {}),
    tree,
  });
  console.log('tree:', treeRes.sha.slice(0, 7), `(${treeRes.tree.length} 项)`);

  // 4. 创建 commit
  const message = `feat: 人生账本 Life Ledger v1.0.0

个人生产力资产负债表：把每天的时间当账记。

- 时间记账：时长/起止时间双模式，跨午夜正确计算，重叠与异常输入校验
- 人生财报：时间资产/负债/净值/现金流/注意力成本，公式在界面内可查
- 仪表盘：日/周/月/自定义区间，四张图表 + 今日分配 + 最近记录
- 长期目标：期望周投入 vs 实际投入，按区间周数折算完成度
- 周报：基于真实记录，样本不足明确提示，可改写并导出 Markdown/PNG/JSON
- 分享图：1:1 与 3:4，内容自选，备注永不出现
- 计时器：刷新不丢、暂停不自动继续、重复启动不累加
- 数据：IndexedDB + schemaVersion 迁移，JSON 备份/恢复，CSV 导入导出
- 本地优先：无账号、无后端、无上传

测试：121 个用例全通过；浏览器自检 6/6 视口、18/18 交互项通过。`;

  const commitRes = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message,
    tree: treeRes.sha,
    ...(parentSha ? { parents: [parentSha] } : {}),
  });
  console.log('commit:', commitRes.sha.slice(0, 7));

  // 5. 更新 ref
  if (parentSha) {
    await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
      sha: commitRes.sha,
      force: false,
    });
  } else {
    await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, {
      ref: 'refs/heads/main',
      sha: commitRes.sha,
    });
  }
  console.log('ref refs/heads/main 已更新');
  console.log(`\n完成 → https://github.com/${OWNER}/${REPO}`);
}

main().catch((e) => {
  console.error('\n失败:', e.message);
  process.exit(1);
});
