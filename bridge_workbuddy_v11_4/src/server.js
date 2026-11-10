import { createServer } from 'node:http';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { Store } from './store.js';
import { Engine } from './engine.js';
import { safeError } from './errors.js';
import { responsesToChat, buildResponseObject, createResponsesStream } from '../vendor/responses.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INSTANCE_ID = createHash('sha256').update(ROOT).digest('hex').slice(0, 16);
const same = (a, b) => { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); };
export function responseUsage(u) {
  if (!u) return null;
  return { input_tokens: u.prompt_tokens ?? null, output_tokens: u.completion_tokens ?? null, total_tokens: u.total_tokens ?? (typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number' ? u.prompt_tokens + u.completion_tokens : null), input_tokens_details: { cached_tokens: u.prompt_tokens_details?.cached_tokens ?? null }, output_tokens_details: { reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? null }, ...(typeof u.credit === 'number' ? { credit: u.credit } : {}) };
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function bodyOf(req, limit) {
  let size = 0; const chunks = [];
  for await (const b of req) {
    size += b.length;
    if (size > limit) {
      throw Object.assign(new Error(`请求过大（最多 ${formatBytes(limit)}）`), { status: 413 });
    }
    chunks.push(b);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { throw Object.assign(new Error('请求不是有效 JSON'), { status: 400 }); }
}
function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${bytes / 1024 ** 3} GiB`;
  if (bytes >= 1024 ** 2) return `${bytes / 1024 ** 2} MiB`;
  if (bytes >= 1024) return `${bytes / 1024} KiB`;
  return `${bytes} B`;
}
export { formatBytes };
export function makeServer(engine, { apiKey, adminToken = randomBytes(32).toString('hex'), maxBodyBytes = 1024 ** 3, version = '1.0.0' } = {}) {
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024) throw new Error('请求体上限必须至少为 1 KiB');
  const controllers = new Set();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const host = req.headers.host || '', port = server.address()?.port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(host)) return send(res, 403, { error: '仅允许本机访问' });
    const expectedOrigin = `http://${host}`;
    if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: '不接受其他网站发起的访问' });
    const url = new URL(req.url || '/', expectedOrigin); let path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/health') return send(res, 200, { service: 'codex-workbuddy-web-switcher', version, instanceId: INSTANCE_ID, ready: !!engine.store.state.activeId, maxBodyBytes, maxBodyLabel: formatBytes(maxBodyBytes) });
      if (req.method === 'GET' && path === '/api/session') return send(res, 200, { token: adminToken });
      if (req.method === 'GET' && ['/', '/app.js', '/credit-chart.js', '/notice.js', '/style.css', '/favicon.ico', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-512.png'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        const data = await readFile(join(ROOT, 'public', file));
        const mime = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.ico') ? 'image/x-icon' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json; charset=utf-8' : 'text/javascript; charset=utf-8';
        res.writeHead(200, { 'Content-Type': mime }); return res.end(data);
      }
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
      const isAdmin = same(req.headers['x-admin-token'], adminToken);
      const isApi = apiKey && same(bearer, apiKey);
      if (path.startsWith('/api/') && path !== '/api/ccswitch/usage' && !isAdmin) return send(res, 401, { error: '请刷新管理页后重试' });
      if (path === '/api/ccswitch/usage' && !isApi && !isAdmin) return send(res, 401, { error: '桥接密钥无效' });
      if (path.startsWith('/api/')) {
        const b = req.method === 'POST' ? await bodyOf(req, maxBodyBytes) : {};
        const id = url.searchParams.get('accountId') || b.accountId;
        if (path === '/api/shutdown' && req.method === 'POST') {
          engine.sessions?.clear();
          send(res, 200, { ok: true });
          for (const controller of controllers) controller.abort();
          server.close(); server.closeIdleConnections(); return;
        }
        if (path === '/api/accounts' && req.method === 'GET') return send(res, 200, engine.accounts());
        if (path === '/api/accounts/import-desktop' && req.method === 'POST') return send(res, 200, await engine.desktop(b.region));
        if (path === '/api/accounts/select' && req.method === 'POST') return send(res, 200, await engine.select(id));
        if (path === '/api/accounts/label' && req.method === 'POST') return send(res, 200, await engine.label(id, b.label));
        if (path === '/api/balance' && req.method === 'POST') return send(res, 200, await engine.balance(id));
        if (path === '/api/models' && req.method === 'GET') return send(res, 200, await engine.models(id, url.searchParams.get('refresh') === '1'));
        if (path === '/api/usage' && req.method === 'GET') return send(res, 200, await engine.usage(id, url.searchParams.get('period') || 'today'));
        if (path === '/api/login/start' && req.method === 'POST') return send(res, 200, await engine.startLogin(b.region));
        if (path === '/api/login/poll' && req.method === 'POST') return send(res, 200, await engine.pollLogin(b.loginId));
        if (path === '/api/login/cancel' && req.method === 'POST') { engine.cancelLogin(b.loginId); return send(res, 200, { ok: true }); }
        if (path === '/api/ccswitch/config' && req.method === 'GET') return send(res, 200, { baseUrl: `${expectedOrigin}/v1`, apiKey, queryUrl: `${expectedOrigin}/api/ccswitch/usage`, script: makeUsageScript(expectedOrigin), note: '将 API Key 填入 CC Switch；查询脚本复用同一个 API Key。' });
        if (path === '/api/ccswitch/usage' && req.method === 'GET') {
          const rawRegion = url.searchParams.get('region'), region = rawRegion === 'ai' ? 'global' : rawRegion;
          if (region && !['cn', 'global'].includes(region)) throw Object.assign(new Error('账号区域不受支持'), { status: 400 });
          const selectedId = id || (region ? engine.store.state.activeByRegion?.[region] : null);
          if (region && !selectedId) throw Object.assign(new Error('该区域尚未选用账号'), { status: 400 });
          const a = engine.account(selectedId);
          if (region && a.region !== region) throw Object.assign(new Error('账号与查询区域不一致'), { status: 400 });
          const balance = await engine.balance(a.id), usage = await engine.usage(a.id, 'today');
          return send(res, 200, { planName: a.label || a.nickname || 'WorkBuddy', remaining: balance.remaining, total: balance.total, used: balance.used, unit: '积分', extra: `今日已确认扣分 ${usage.summary.knownCredit.toFixed(4)}；${usage.summary.unknownRequests} 次未提供积分；余额更新 ${new Date(balance.checkedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` });
        }
        return send(res, 404, { error: '没有这个管理接口' });
      }
      if (!isApi) return send(res, 401, { error: { message: '请配置本机网页反代 API Key', type: 'authentication_error' } });
      const regionPrefix = /^\/(cn|ai|global)(?=\/)/.exec(path);
      const region = regionPrefix ? (regionPrefix[1] === 'cn' ? 'cn' : 'global') : null;
      if (regionPrefix) path = path.slice(regionPrefix[0].length);
      const accountId = req.headers['x-workbuddy-account'] || url.searchParams.get('accountId') || (region ? engine.store.state.activeByRegion?.[region] : null);
      const a = engine.account(accountId);
      if (region && a.region !== region) throw Object.assign(new Error('该区域没有选用账号，请先在管理页添加并选用'), { status: 400 });
      if (path === '/v1/models' && req.method === 'GET') {
        const d = await engine.models(a.id); return send(res, 200, { object: 'list', data: d.models.map(m => ({ id: m.id, object: 'model', owned_by: `workbuddy-${a.region}`, name: m.name, credit_multiplier: m.currentMultiplier })) });
      }
      if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/responses'].includes(path)) return send(res, 404, { error: { message: '支持 Chat Completions 和 Responses 接口', type: 'not_found' } });
      const b = await bodyOf(req, maxBodyBytes); if (!b || typeof b !== 'object' || Array.isArray(b)) throw Object.assign(new Error('请求内容应为 JSON 对象'), { status: 400 });
      if (b.previous_response_id) throw Object.assign(new Error('请发送完整对话历史；首版不支持 previous_response_id'), { status: 400 });
      if (b.tools && (!Array.isArray(b.tools) || b.tools.some(t => !t || (t.type && t.type !== 'function')))) throw Object.assign(new Error('首版仅支持 function 工具，请由客户端提供工具执行'), { status: 400 });
      if (!b.model) throw Object.assign(new Error('请求缺少模型名称'), { status: 400 });
      const hasImage = value => value && typeof value === 'object' && (['input_image', 'image_url'].includes(value.type) || Object.values(value).some(v => Array.isArray(v) ? v.some(hasImage) : v && typeof v === 'object' && hasImage(v)));
      if (hasImage(b)) throw Object.assign(new Error('首版暂不支持图片输入，请使用文字对话'), { status: 400 });
      const protocol = path.endsWith('/responses') ? 'responses' : 'chat';
      const input = protocol === 'responses' ? responsesToChat(b, b.model) : b;
      const controller = new AbortController(); res.on('close', () => { if (!res.writableFinished) controller.abort(); });
      controllers.add(controller); res.on('close', () => controllers.delete(controller));
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]);
      const id = `resp_${randomUUID().replaceAll('-', '')}`, created = Math.floor(Date.now() / 1000);
      let stream, streamUsage = null, streamFinish = null, started = false;
      const sse = data => { if (res.destroyed) return; if (!started) { res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); started = true; } res.write(data); };
      const frame = (delta, finish = null) => ({ id, object: 'chat.completion.chunk', created, model: b.model, choices: [{ index: 0, delta, finish_reason: finish }] });
      if (b.stream && protocol === 'responses') {
        stream = createResponsesStream({ id, model: b.model, createdAt: created, write: (event, data) => {
          if (event === 'response.completed') { data.response.usage = responseUsage(streamUsage); if (streamFinish === 'length') { event = 'response.incomplete'; data.type = event; data.response.status = 'incomplete'; data.response.incomplete_details = { reason: 'max_output_tokens' }; } }
          sse(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } });
        // Begin only when the first upstream delta arrives; early HTTP errors stay HTTP errors.
      }
      let responseCreated = false;
      const onDelta = d => {
        if (!b.stream) return;
        if (protocol === 'responses') { if (!responseCreated) { stream.responseCreated(); responseCreated = true; } if (d.type === 'text') stream.onTextDelta(d.text); }
        else sse(`data: ${JSON.stringify(frame(d.type === 'reasoning' ? { reasoning_content: d.text } : { content: d.text }))}\n\n`);
      };
      try {
        const result = await engine.run(input, { accountId: a.id, protocol, signal, onDelta });
        if (b.stream) {
          if (protocol === 'responses') {
            if (!responseCreated) stream.responseCreated();
            // Vendor stream writer is wrapped below to replace placeholder usage.
            streamUsage = result.usage; streamFinish = result.finishReason; stream.finish(result.toolCalls);
          } else {
            if (result.toolCalls.length) sse(`data: ${JSON.stringify(frame({ tool_calls: result.toolCalls.map((c, i) => ({ ...c, index: i })) }))}\n\n`);
            sse(`data: ${JSON.stringify(frame({}, result.toolCalls.length ? 'tool_calls' : result.finishReason || 'stop'))}\n\n`);
            sse(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: b.model, choices: [], usage: result.usage })}\n\n`);
            sse('data: [DONE]\n\n');
          } res.end();
        } else if (protocol === 'responses') {
          const response = buildResponseObject({ id, model: b.model, createdAt: created, text: result.text, toolCalls: result.toolCalls });
          response.usage = responseUsage(result.usage);
          if (result.finishReason === 'length') { response.status = 'incomplete'; response.incomplete_details = { reason: 'max_output_tokens' }; }
          send(res, 200, response);
        } else send(res, 200, { id, object: 'chat.completion', created, model: b.model, choices: [{ index: 0, message: { role: 'assistant', content: result.text || null, ...(result.reasoning ? { reasoning_content: result.reasoning } : {}), ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}) }, finish_reason: result.toolCalls.length ? 'tool_calls' : result.finishReason || 'stop' }], usage: result.usage });
      } catch (e) {
        if (!started) throw e;
        if (protocol === 'responses') stream.fail(safeError(e)); else sse(`data: ${JSON.stringify({ error: { message: safeError(e) } })}\n\n`);
        res.end();
      }
    } catch (e) { if (!res.headersSent) send(res, e.status >= 400 && e.status < 600 ? e.status : 500, { error: { message: safeError(e) } }); else res.end(); }
  });
  server.headersTimeout = 15000; server.requestTimeout = 60000; server.keepAliveTimeout = 5000;
  return server;
}
export function makeUsageScript(base) {
  return `(function () {\n  var base = '{{baseUrl}}';\n  var origin = /^https?:\\/\\/[^/]+/.exec(base);\n  var region = /\\/(cn|global|ai)\\/v1\\/?$/.exec(base);\n  var url = (origin ? origin[0] : '${base}') + '/api/ccswitch/usage';\n  if (region) url += '?region=' + region[1];\n  return {\n    request: { url: url, method: 'GET', headers: { Authorization: 'Bearer {{apiKey}}' } },\n    extractor: function (data) { return data; }\n  };\n})()`;
}
export async function start({ port = 8900, dataDir = join(ROOT, 'data'), maxBodyBytes = 1024 ** 3, version = '1.0.0' } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口必须在 1024–65535 之间');
  await mkdir(dataDir, { recursive: true });
  const lockFile = join(dataDir, 'bridge.lock'); let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(await readFile(lockFile, 'utf8'));
    try { process.kill(pid, 0); throw new Error('该数据目录已有桥接运行，请勿重复启动'); }
    catch (p) { if (p.code !== 'ESRCH') throw p; }
    await unlink(lockFile); lock = await open(lockFile, 'wx');
  }
  await lock.writeFile(String(process.pid));
  let cleaned = false; const cleanup = async () => { if (!cleaned) { cleaned = true; await lock.close(); await unlink(lockFile).catch(() => {}); } };
  try {
    // Isolate all reused discovery caches from the old bridge and DSH.
    process.env.DSH_HOME = join(dataDir, 'desktop-discovery');
    const store = await new Store(dataDir).init();
    if (!store.state.apiKey) await store.change(s => { s.apiKey = `wbp_${randomBytes(24).toString('hex')}`; });
    const engine = new Engine(store, { importDesktop: async region => { const { readAuthFile } = await import('../vendor/credentials.js'); return readAuthFile(region === 'cn' ? 'cn' : 'ai'); } });
    const server = makeServer(engine, { apiKey: store.state.apiKey, maxBodyBytes, version });
    server.on('close', cleanup);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    console.log(`Codex WorkBuddy 网页切号反代 v${version}\n管理页：http://127.0.0.1:${port}\n请求体上限：${formatBytes(maxBodyBytes)}`);
    const shutdown = () => { server.close(); server.closeIdleConnections(); setTimeout(() => process.exit(0), 2000).unref(); };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); return { server, engine };
  } catch (e) { await cleanup(); throw e; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), pi = args.indexOf('--port');
  const maxMiB = Number(process.env.WORKBUDDY_MAX_BODY_MIB || 1024);
  if (!Number.isFinite(maxMiB) || maxMiB <= 0) { console.error('WORKBUDDY_MAX_BODY_MIB 必须是正数'); process.exit(1); }
  start({
    port: pi >= 0 ? Number(args[pi + 1]) : Number(process.env.WORKBUDDY_PORT || 8900),
    dataDir: process.env.WORKBUDDY_DATA || join(ROOT, 'data'),
    maxBodyBytes: Math.floor(maxMiB * 1024 ** 2),
  }).catch(e => { console.error(safeError(e)); process.exitCode = 1; });
}
