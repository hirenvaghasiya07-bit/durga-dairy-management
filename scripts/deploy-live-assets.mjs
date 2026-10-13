import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const databaseId = process.env.DURGA_D1_DATABASE_ID || '80660686-d0e8-4555-b9e0-4b97da4e908f';
const apply = process.argv.includes('--apply');
const root = process.cwd();
const assetFiles = [
  'index.html', 'app.js', 'config.js', 'manifest.json', 'sw.js',
  'akash-v2.js', 'akash-v2-fix.js', 'all-v2.js', 'bootstrap.js',
  'icons/icon-192.svg', 'icons/icon-512.svg'
];

if (!accountId || !apiToken) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first.');
  process.exit(1);
}

const mime = (file) => file.endsWith('.html') ? 'text/html; charset=utf-8'
  : file.endsWith('.js') ? 'application/javascript; charset=utf-8'
  : file.endsWith('.json') ? 'application/json; charset=utf-8'
  : file.endsWith('.svg') ? 'image/svg+xml'
  : 'application/octet-stream';
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
async function d1(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(JSON.stringify(data.errors || data));
  return data.result?.[0]?.results || [];
}

const deployed = [];
for (const file of assetFiles) {
  const localPath = path.join(root, 'public', file);
  const content = await readFile(localPath, 'utf8');
  deployed.push({ path: `/${file.replaceAll(path.sep, '/')}`, content, content_type: mime(file), bytes: Buffer.byteLength(content), sha256: sha(content) });
}
const existing = await d1('SELECT path, content, content_type FROM web_assets ORDER BY path');
const existingMap = new Map(existing.map((row) => [row.path, row]));
console.log(`Found ${existing.length} existing web assets. Prepared ${deployed.length} local assets.`);
for (const asset of deployed) {
  const prior = existingMap.get(asset.path);
  console.log(`${prior ? 'UPDATE' : 'INSERT'} ${asset.path} | ${asset.bytes} bytes | sha256 ${asset.sha256}`);
}

if (!apply) {
  console.log('\nDRY RUN ONLY. No database writes were made. Review the asset list, take a verified backup, then rerun with --apply.');
  process.exit(0);
}

const backupDir = path.join(root, '.durga-backups');
await mkdir(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `web-assets-predeploy-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
await writeFile(backupFile, JSON.stringify({ savedAt: new Date().toISOString(), assets: existing }, null, 2), 'utf8');
console.log(`Saved existing web_assets table to ${backupFile}`);

for (const asset of deployed) {
  await d1(
    'INSERT INTO web_assets(path, content, content_type) VALUES(?, ?, ?) ON CONFLICT(path) DO UPDATE SET content=excluded.content, content_type=excluded.content_type',
    [asset.path, asset.content, asset.content_type]
  );
}

const verify = await d1('SELECT path, content, content_type FROM web_assets WHERE path IN (' + deployed.map(() => '?').join(',') + ')', deployed.map((x) => x.path));
const verifyMap = new Map(verify.map((row) => [row.path, row]));
const failures = deployed.filter((asset) => {
  const row = verifyMap.get(asset.path);
  return !row || row.content !== asset.content || row.content_type !== asset.content_type || sha(row.content) !== asset.sha256;
});
if (failures.length) {
  console.error('Verification failed for:', failures.map((x) => x.path).join(', '));
  console.error('Do not continue deployment. Restore the asset backup and investigate.');
  process.exit(2);
}
console.log(`Verified all ${deployed.length} asset updates. Business data tables were not changed.`);
