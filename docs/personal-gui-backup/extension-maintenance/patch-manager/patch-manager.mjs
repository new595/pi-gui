#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = 'C:\\Users\\lwj\\.pi\\agent\\npm';
const expectedPackages = new Map([
  ['@4fu/pi-pwsh', '0.10.0'],
  ['pi-subagents', '0.73.1'],
  ['@juicesharp/rpiv-ask-user-question', '2.11.0'],
]);
const sha = data => crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const relativeParts = value => {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\\') || value.split('/').some(x => !x || x === '.' || x === '..' || x.includes(':'))) fail('unsafe_path', `非法相对路径: ${value}`);
  return value.split('/');
};
async function noLinks(target, mustExist = true) {
  const full = path.resolve(target);
  const parsed = path.parse(full);
  let current = parsed.root;
  for (const part of full.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let st;
    try { st = await fs.lstat(current); }
    catch (e) { if (!mustExist && e.code === 'ENOENT') return; throw e; }
    if (st.isSymbolicLink()) fail('unsafe_path', `拒绝符号链接或 junction: ${current}`);
  }
}
async function regularFile(p) {
  await noLinks(p);
  const st = await fs.lstat(p);
  if (!st.isFile()) fail('unsafe_path', `不是普通文件: ${p}`);
  return fs.readFile(p);
}
async function makeDirSafe(p) {
  await noLinks(p, false);
  await fs.mkdir(p, { recursive: true });
  await noLinks(p);
}
async function atomicWrite(target, data) {
  await noLinks(target);
  const temp = path.join(path.dirname(target), `.patch-manager-${crypto.randomUUID()}.tmp`);
  await noLinks(temp, false);
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(data); await handle.sync(); }
  finally { await handle.close(); }
  try { await noLinks(target); await fs.rename(temp, target); }
  catch (e) { await fs.rm(temp, { force: true }); throw e; }
}
async function jsonFile(p) { return JSON.parse((await regularFile(p)).toString('utf8')); }
function parseArgs(argv) {
  let command = 'check';
  if (argv[0] && !argv[0].startsWith('--')) command = argv.shift();
  if (!['check', 'repair', 'undo'].includes(command)) fail('usage', `未知命令: ${command}`);
  const opts = { command, apply: false, json: false, confirmClosed: false };
  const names = { '--root':'root', '--state-dir':'stateDir', '--transaction':'transaction' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply' || arg === '--json' || arg === '--confirm-closed') {
      const key = { '--apply':'apply', '--json':'json', '--confirm-closed':'confirmClosed' }[arg];
      if (opts[key]) fail('usage', `重复参数: ${arg}`);
      opts[key] = true;
    } else if (names[arg] && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      const key = names[arg];
      if (opts[key]) fail('usage', `重复参数: ${arg}`);
      opts[key] = argv[++i];
    } else fail('usage', `未知或缺值参数: ${arg}`);
  }
  if (command === 'check' && (opts.apply || opts.confirmClosed || opts.transaction)) fail('usage', 'check 只读，不接受写入参数');
  if (command !== 'undo' && opts.transaction) fail('usage', '--transaction 只用于 undo');
  if (command === 'undo' && !opts.transaction) fail('usage', 'undo 需要 --transaction ID');
  if (opts.apply && !opts.confirmClosed) fail('usage', '写入前必须传 --confirm-closed，确认已关闭相关 Pi GUI 和 CLI 进程');
  return opts;
}
async function loadManifest() {
  const m = await jsonFile(path.join(here, 'manifest.json'));
  if (m.schema !== 1 || !Array.isArray(m.patches) || m.patches.length !== 5) fail('manifest', '清单结构异常');
  const ids = new Set();
  for (const p of m.patches) {
    if (!/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id) || expectedPackages.get(p.package) !== p.version) fail('manifest', '清单标识、名称或版本异常');
    ids.add(p.id);
    relativeParts(p.target);
    for (const side of ['before', 'after']) {
      if (!/^[A-F0-9]{64}$/.test(p[`${side}Sha256`])) fail('manifest', `清单哈希异常: ${p.id}`);
      const payload = path.resolve(here, p[side]);
      const docsRoot = path.resolve(here, '..') + path.sep;
      if (!payload.startsWith(docsRoot)) fail('unsafe_path', `补丁副本越界: ${p.id}`);
    }
  }
  return m;
}
function packageDir(root, name) { return path.join(root, 'node_modules', ...relativeParts(name)); }
function targetPath(root, p) { return path.join(packageDir(root, p.package), ...relativeParts(p.target)); }
async function packageVersion(root, name) {
  const p = packageDir(root, name);
  const doc = await jsonFile(path.join(p, 'package.json'));
  return { name: doc.name, version: doc.version };
}
async function inspect(root, manifest) {
  const versions = new Map();
  const items = [];
  for (const p of manifest.patches) {
    let status = 'unsafe', detail = '';
    try {
      if (!versions.has(p.package)) versions.set(p.package, await packageVersion(root, p.package));
      const pkg = versions.get(p.package);
      if (pkg.name !== p.package || pkg.version !== p.version) fail('version_mismatch', `包名或版本不符: ${pkg.name}@${pkg.version}`);
      for (const side of ['before', 'after']) {
        const payload = await regularFile(path.resolve(here, p[side]));
        if (sha(payload) !== p[`${side}Sha256`]) fail('payload_mismatch', `补丁副本校验失败: ${p.id}/${side}`);
      }
      const current = await regularFile(targetPath(root, p));
      const hash = sha(current);
      if (hash === p.afterSha256) status = 'patched';
      else if (hash === p.beforeSha256) status = 'repairable';
      else fail('unknown_content', `目标内容未知: ${p.id} (${hash})`);
    } catch (e) { detail = `${e.code || 'io_error'}: ${e.message}`; }
    items.push({ id:p.id, package:p.package, version:p.version, target:p.target, status, ...(detail ? { detail } : {}) });
  }
  const sdk = [];
  for (const name of manifest.sdkDependencies) {
    try {
      const pkg = await packageVersion(root, name);
      sdk.push({ name, expected:manifest.sdkVersion, actual:pkg.version, status:pkg.name === name && pkg.version === manifest.sdkVersion ? 'ok' : 'mismatch' });
    } catch (e) { sdk.push({ name, expected:manifest.sdkVersion, status:'missing_or_unreadable', detail:`${e.code || 'io_error'}: ${e.message}` }); }
  }
  return { patches:items, sdkDependencies:sdk, safe:items.every(x => x.status !== 'unsafe'), fullyPatched:items.every(x => x.status === 'patched'), dependenciesHealthy:sdk.every(x => x.status === 'ok') };
}
async function saveJournal(dir, journal) {
  const p = path.join(dir, 'journal.json');
  if (await fs.stat(p).then(() => true, () => false)) await atomicWrite(p, Buffer.from(JSON.stringify(journal, null, 2) + '\n'));
  else { await noLinks(p, false); await fs.writeFile(p, JSON.stringify(journal, null, 2) + '\n', { flag:'wx' }); }
}
async function withLock(stateDir, fn) {
  await makeDirSafe(stateDir);
  const lock = path.join(stateDir, '.lock');
  await noLinks(lock, false);
  let h;
  try { h = await fs.open(lock, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') fail('busy', '已有操作锁；确认没有工具运行后再处理锁文件'); throw e; }
  try { return await fn(); }
  finally { await h.close(); await fs.unlink(lock); }
}
async function repair(root, stateDir, manifest, report) {
  if (!report.safe) fail('unsafe', '整批预检失败，未写入任何目标');
  const changes = manifest.patches.filter((p, i) => report.patches[i].status === 'repairable');
  if (!changes.length) return { changed:0, message:'所有补丁已存在' };
  return withLock(stateDir, async () => {
    const fresh = await inspect(root, manifest);
    if (!fresh.safe || fresh.patches.some((x, i) => x.status !== report.patches[i].status)) fail('changed', '预检后状态发生变化，未写入');
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
    const dir = path.join(stateDir, id);
    await makeDirSafe(dir);
    const journal = { schema:1, id, root:path.resolve(root), state:'prepared', createdAt:new Date().toISOString(), entries:changes.map(p => ({ id:p.id, package:p.package, version:p.version, target:p.target, beforeSha256:p.beforeSha256, afterSha256:p.afterSha256, state:'pending' })) };
    try {
      for (const p of changes) {
        const entry = journal.entries.find(x => x.id === p.id);
        const pkg = await packageVersion(root, p.package);
        if (pkg.name !== p.package || pkg.version !== p.version) fail('version_mismatch', `写入前包版本已变: ${p.package}`);
        const current = await regularFile(targetPath(root, p));
        if (sha(current) !== p.beforeSha256) fail('changed', `写入前目标已变化: ${p.id}`);
        const backup = path.join(dir, `${p.id}.before`);
        await noLinks(backup, false);
        await fs.writeFile(backup, current, { flag:'wx', mode:0o600 });
        if (sha(await regularFile(backup)) !== p.beforeSha256) fail('backup_error', `备份验证失败: ${p.id}`);
        entry.state = 'intent';
        journal.state = 'applying';
        await saveJournal(dir, journal);
        const payload = await regularFile(path.resolve(here, p.after));
        if (sha(payload) !== p.afterSha256) fail('payload_mismatch', `写入前补丁副本已变化: ${p.id}`);
        if (sha(await regularFile(targetPath(root, p))) !== p.beforeSha256) fail('changed', `写入前目标已变化: ${p.id}`);
        await atomicWrite(targetPath(root, p), payload);
        if (sha(await regularFile(targetPath(root, p))) !== p.afterSha256) fail('write_error', `写入后验证失败: ${p.id}`);
        entry.state = 'applied';
        await saveJournal(dir, journal);
      }
      journal.state = 'complete';
      await saveJournal(dir, journal);
      return { transaction:id, changed:changes.length, state:'complete' };
    } catch (e) {
      journal.state = 'partial';
      journal.error = `${e.code || 'io_error'}: ${e.message}`;
      await saveJournal(dir, journal).catch(() => {});
      fail('partial', `事务 ${id} 未完成；检查 journal.json 后使用 undo --transaction ${id} --apply --confirm-closed 撤销已写文件。原因: ${e.message}`);
    }
  });
}
async function undo(root, stateDir, id, apply) {
  if (!/^[0-9TZ-]{20,}-[a-f0-9-]{36}$/.test(id)) fail('usage', '事务 ID 格式错误');
  const dir = path.join(stateDir, id);
  const journal = await jsonFile(path.join(dir, 'journal.json'));
  if (journal.schema !== 1 || journal.id !== id || journal.root !== path.resolve(root) || !Array.isArray(journal.entries)) fail('unsafe', '事务记录不匹配当前根目录');
  const manifest = await loadManifest();
  const manifestById = new Map(manifest.patches.map(p => [p.id,p]));
  const actions = [];
  for (const entry of journal.entries) {
    const p = manifestById.get(entry.id);
    if (!p || p.package !== entry.package || p.version !== entry.version || p.target !== entry.target || p.beforeSha256 !== entry.beforeSha256 || p.afterSha256 !== entry.afterSha256) fail('unsafe', `事务记录与清单不符: ${entry.id}`);
    const pkg = await packageVersion(root, p.package);
    if (pkg.name !== p.package || pkg.version !== p.version) fail('unsafe', `包版本已变: ${p.package}`);
    const current = sha(await regularFile(targetPath(root, p)));
    if (entry.state === 'pending' && current === p.beforeSha256) continue;
    if (entry.state === 'undone' && current === p.beforeSha256) continue;
    if (!['intent','applied','undo_intent'].includes(entry.state) || ![p.beforeSha256,p.afterSha256].includes(current)) fail('unsafe', `目标已变化，拒绝撤销: ${p.id}`);
    const backup = await regularFile(path.join(dir, `${p.id}.before`));
    if (sha(backup) !== p.beforeSha256) fail('unsafe', `备份损坏，拒绝撤销: ${p.id}`);
    actions.push({ p, entry, backup, needsWrite:current === p.afterSha256 });
  }
  if (!apply) return { transaction:id, wouldUndo:actions.filter(x => x.needsWrite).map(x => x.p.id), wouldFinalize:actions.filter(x => !x.needsWrite).map(x => x.p.id), state:journal.state };
  return withLock(stateDir, async () => {
    // 取得锁后再做整批检查，避免在预览和写入之间使用过期状态。
    const again = await undo(root, stateDir, id, false);
    if (again.wouldUndo.join(',') !== actions.filter(x => x.needsWrite).map(x => x.p.id).join(',') || again.wouldFinalize.join(',') !== actions.filter(x => !x.needsWrite).map(x => x.p.id).join(',')) fail('changed', '事务状态已变化，未写入');
    try {
      for (const {p, entry, backup, needsWrite} of actions) {
        const pkg = await packageVersion(root, p.package);
        if (pkg.name !== p.package || pkg.version !== p.version) fail('version_mismatch', `撤销前包版本已变: ${p.package}`);
        if (sha(await regularFile(targetPath(root, p))) !== (needsWrite ? p.afterSha256 : p.beforeSha256)) fail('changed', `撤销前目标已变化: ${p.id}`);
        if (sha(await regularFile(path.join(dir, `${p.id}.before`))) !== p.beforeSha256) fail('backup_error', `撤销前备份已变化: ${p.id}`);
        if (needsWrite) {
          entry.state = 'undo_intent';
          journal.state = 'undoing';
          await saveJournal(dir, journal);
          await atomicWrite(targetPath(root, p), backup);
        }
        if (sha(await regularFile(targetPath(root, p))) !== p.beforeSha256) fail('write_error', `撤销后验证失败: ${p.id}`);
        entry.state = 'undone';
        journal.state = 'undoing';
        await saveJournal(dir, journal);
      }
      journal.state = 'undone';
      await saveJournal(dir, journal);
      return { transaction:id, undone:actions.filter(x => x.needsWrite).map(x => x.p.id), state:'undone' };
    } catch (e) {
      journal.state = 'partial_undo';
      journal.error = `${e.code || 'io_error'}: ${e.message}`;
      await saveJournal(dir, journal).catch(() => {});
      fail('partial', `事务 ${id} 撤销未完成；保留记录，可再次执行 undo。原因: ${e.message}`);
    }
  });
}
function human(result, code, command) {
  const lines = [];
  if (result.patches) {
    const labels = { patched:'已安装', repairable:'可恢复', unsafe:'需人工处理' };
    for (const item of result.patches) lines.push(`${labels[item.status]}  ${item.package}@${item.version}  ${item.target}${item.detail ? `  ${item.detail}` : ''}`);
    lines.push('');
    for (const sdk of result.sdkDependencies) lines.push(`SDK ${sdk.status === 'ok' ? '正常' : '需检查'}  ${sdk.name}  ${sdk.actual || '缺失/无法读取'}（预期 ${sdk.expected}）`);
  }
  if (result.operation?.wouldRepair) lines.push(`\n预览：将修复 ${result.operation.wouldRepair.length} 个文件：${result.operation.wouldRepair.join(', ') || '无'}`);
  if (result.operation?.transaction) lines.push(`\n事务 ID：${result.operation.transaction}；已修复 ${result.operation.changed} 个文件`);
  if (result.wouldUndo) lines.push(`预览撤销：${result.wouldUndo.join(', ') || '无'}；仅终结记录：${result.wouldFinalize.join(', ') || '无'}`);
  if (result.undone) lines.push(`事务 ${result.transaction} 已撤销：${result.undone.join(', ') || '无需恢复文件'}`);
  lines.push(`\n退出码 ${code}：${code === 0 ? '当前检查正常或操作完成' : code === 2 ? '存在可修复文件或 SDK 异常，请查看上方结果' : '存在不安全状态，请人工检查；未执行本次修复'}`);
  if (command === 'check' && code === 2) lines.push('可运行 repair 预览修复；SDK 依赖需要人工检查。');
  return lines.join('\n') + '\n';
}
let opts;
const wantsJson = process.argv.includes('--json');
try {
  opts = parseArgs(process.argv.slice(2));
  const root = path.resolve(opts.root || defaultRoot);
  const stateDir = path.resolve(opts.stateDir || path.join(here, 'transactions'));
  await noLinks(root);
  const manifest = await loadManifest();
  let result;
  if (opts.command === 'undo') result = await undo(root, stateDir, opts.transaction, opts.apply);
  else {
    const report = await inspect(root, manifest);
    result = { root, ...report };
    if (opts.command === 'repair') {
      result.operation = opts.apply ? await repair(root, stateDir, manifest, report) : { wouldRepair:report.patches.filter(x => x.status === 'repairable').map(x => x.id) };
      if (opts.apply) Object.assign(result, await inspect(root, manifest));
    }
  }
  const code = result.safe === false ? 3 : (result.fullyPatched === false || result.dependenciesHealthy === false) ? 2 : 0;
  if (opts.json) process.stdout.write(JSON.stringify({ ok:code !== 3, exitCode:code, ...result }, null, 2) + '\n');
  else process.stdout.write(human(result, code, opts.command));
  process.exitCode = code;
} catch (e) {
  const code = e.code === 'usage' ? 1 : e.code === 'partial' ? 4 : 3;
  const output = { ok:false, exitCode:code, error:e.code || 'io_error', message:e.message };
  (wantsJson ? process.stdout : process.stderr).write(wantsJson ? JSON.stringify(output, null, 2) + '\n' : `错误（退出码 ${code}）：${e.message}\n`);
  process.exitCode = code;
}
