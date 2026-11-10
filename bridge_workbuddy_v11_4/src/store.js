import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// DPAPI binds the vault key to the current Windows user. No credential in arguments.
function dpapi(input, decrypt = false) {
  return new Promise((resolve, reject) => {
    const method = decrypt ? 'Unprotect' : 'Protect';
    const command = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${method}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', d => out += d); child.stderr.resume();
    child.on('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('本机凭据保护服务超时')); }, 20000);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.from(out.trim(), 'base64')) : reject(new Error('无法读取本机加密凭据，请使用原 Windows 用户启动')); });
    child.stdin.on('error', () => {}); child.stdin.end(input.toString('base64'));
  });
}
export class Store {
  constructor(root) { this.root = root; this.queue = Promise.resolve(); this.state = { version: 1, activeId: null, accounts: [] }; }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const keyFile = join(this.root, process.platform === 'win32' ? 'vault-key.dpapi' : 'vault-key.bin');
    try { const raw = await readFile(keyFile); this.key = process.platform === 'win32' ? await dpapi(raw, true) : raw; }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.key = randomBytes(32);
      await writeFile(keyFile, process.platform === 'win32' ? await dpapi(this.key) : this.key, { flag: 'wx', mode: 0o600 });
    }
    try {
      const doc = JSON.parse(await readFile(join(this.root, 'vault.enc.json'), 'utf8'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(doc.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(doc.tag, 'base64'));
      this.state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(doc.body, 'base64')), decipher.final()]).toString());
      if (this.state.version !== 1 || !Array.isArray(this.state.accounts)) throw new Error('账号库格式不支持');
    } catch (e) { if (e.code !== 'ENOENT') throw new Error('账号库无法解密，已停止启动以保护原数据'); }
    return this;
  }
  serialize(job) { const p = this.queue.then(job); this.queue = p.catch(() => {}); return p; }
  change(fn) {
    return this.serialize(async () => {
      const next = structuredClone(this.state); const result = await fn(next);
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(next)), cipher.final()]);
      const doc = { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), body: body.toString('base64') };
      const tmp = join(this.root, `vault-${randomBytes(8).toString('hex')}.tmp`);
      await writeFile(tmp, JSON.stringify(doc), { mode: 0o600 });
      await rename(tmp, join(this.root, 'vault.enc.json')); this.state = next; return result;
    });
  }
  append(kind, value) { return this.serialize(() => appendFile(join(this.root, `${kind}.jsonl`), JSON.stringify(value) + '\n', { mode: 0o600 })); }
  async rows(kind) {
    await this.queue;
    try {
      const lines = (await readFile(join(this.root, `${kind}.jsonl`), 'utf8')).split('\n').filter(Boolean);
      return lines.map((line, i) => { try { return JSON.parse(line); } catch { throw new Error(`记录文件第 ${i + 1} 行损坏，请保留文件后联系修复`); } });
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
}
