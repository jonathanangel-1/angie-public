import { copyFile, rename, unlink, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const catalogPath = path.join(ROOT, 'data', 'verified-catalog.json');
const backupPath = `${catalogPath}.last-good`;
const indexPath = path.join(ROOT, 'data', 'catalog-index.json');
const indexBackup = `${indexPath}.last-good`;

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script)], { cwd: ROOT, env: process.env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

await copyFile(catalogPath, backupPath);
await copyFile(indexPath, indexBackup);
try {
  await run('refresh-local-catalog.mjs');
  await run('check-local-catalog.mjs');
  const before = JSON.parse(await readFile(backupPath,'utf8')).products;
  const after = JSON.parse(await readFile(catalogPath,'utf8')).products;
  for (const category of ['top','bottom','dress','layer','shoes']) {
    const oldCount=before.filter(p=>p.category===category).length;
    const newCount=after.filter(p=>p.category===category).length;
    if(newCount < oldCount * 0.65) throw new Error(`${category} coverage dropped from ${oldCount} to ${newCount}; inspect collection before accepting.`);
  }
  await run('prepare-search-index.mjs');
  await unlink(backupPath);
  await unlink(indexBackup);
  console.log('Local catalog update committed.');
} catch (error) {
  await rename(backupPath, catalogPath);
  await rename(indexBackup, indexPath);
  console.error(`Catalog update rejected; restored last good catalog. ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
