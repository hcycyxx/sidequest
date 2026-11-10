import { randomUUID } from 'node:crypto';
import { Client, domainOf, regionOf, jsonRequest, currentModels } from './upstream.js';

const expiry = (d, absolute, relative) => { const v = Number(d[absolute]); return v > 0 ? (v < 1e12 ? v * 1000 : v) : Number(d[relative]) > 0 ? Date.now() + Number(d[relative]) * 1000 : 0; };
const string = (...values) => values.find(v => typeof v === 'string' && v.trim())?.trim() ?? '';
export const dayKey = t => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
export function publicAccount(a) {
  return { id: a.id, region: a.region, nickname: a.nickname || '未提供昵称', label: a.label || '', uidHint: a.uid ? `${a.uid.slice(0, 3)}…${a.uid.slice(-3)}` : '', email: a.email || null, phone: a.phone || null, expiresAt: a.expiresAt || null, source: a.source, addedAt: a.addedAt, balance: a.balance ?? null };
}
export class Engine {
  constructor(store, { client = new Client(), importDesktop } = {}) {
    this.store = store; this.client = client; this.importDesktop = importDesktop; this.sessions = new Map(); this.refreshing = new Map(); this.modelsCache = new Map();
  }
  account(id) {
    const a = this.store.state.accounts.find(a => a.id === (id || this.store.state.activeId));
    if (!a) throw Object.assign(new Error('请先添加并选用一个账号'), { status: 400 }); return a;
  }
  accounts() { return { activeId: this.store.state.activeId, activeByRegion: this.store.state.activeByRegion ?? {}, accounts: this.store.state.accounts.map(publicAccount) }; }
  async add(credential, source = 'oauth') {
    const domain = domainOf(credential.domain), region = regionOf(domain);
    if (!credential.accessToken || !credential.uid) throw new Error('账号身份不完整，未保存；请重新登录');
    const id = `${region}_${credential.enterpriseId || 'personal'}_${credential.uin || credential.uid}`;
    const data = { ...credential, id, domain, region, source, addedAt: Date.now() };
    await this.store.change(s => {
      const i = s.accounts.findIndex(a => a.id === id);
      if (i >= 0) s.accounts[i] = { ...s.accounts[i], ...data, label: s.accounts[i].label, addedAt: s.accounts[i].addedAt };
      else s.accounts.push(data);
      s.activeId ??= id;
      s.activeByRegion ??= {}; s.activeByRegion[region] ??= id;
    }); return publicAccount(this.account(id));
  }
  async desktop(region = 'cn') {
    if (!['cn', 'global'].includes(region)) throw new Error('请选择国内版或国际版');
    if (!this.importDesktop) throw new Error('当前环境不支持读取桌面登录');
    const a = await this.importDesktop(region);
    domainOf(a.domain);
    // Profile verifies that the imported sign-in belongs to a working account.
    const profile = await this.client.profile({ ...a, region });
    return this.add({ ...a, ...this.identity(profile), uid: string(profile.uid, profile.userId, a.uid), domain: a.domain }, 'desktop');
  }
  identity(p) {
    const id = (...v) => string(...v.map(x => typeof x === 'number' && Number.isFinite(x) ? String(x) : x));
    return { uid: id(p.uid, p.userId, p.Uid), nickname: string(p.displayName, p.enterpriseUserName, p.nickname, p.NickName), uin: id(p.uin, p.Uin), enterpriseId: id(p.enterpriseId, p.EnterpriseId), email: string(p.email, p.Email), phone: string(p.phoneNumber, p.phone) };
  }
  async select(id) { const a = this.account(id); await this.store.change(s => { s.activeId = id; s.activeByRegion ??= {}; s.activeByRegion[a.region] = id; }); return this.accounts(); }
  async label(id, label) { this.account(id); if (typeof label !== 'string' || label.length > 80) throw new Error('备注最多 80 字'); await this.store.change(s => { s.accounts.find(a => a.id === id).label = label; }); return this.accounts(); }
  async refresh(id) {
    if (this.refreshing.has(id)) return this.refreshing.get(id);
    const job = (async () => { const old = this.account(id), next = await this.client.refresh(old); if (regionOf(next.domain) !== old.region) throw new Error('刷新结果区域不一致'); await this.store.change(s => { const i = s.accounts.findIndex(a => a.id === id); s.accounts[i] = { ...s.accounts[i], ...next }; }); return this.account(id); })();
    this.refreshing.set(id, job); try { return await job; } finally { this.refreshing.delete(id); }
  }
  async authorized(id, fn) {
    let a = this.account(id);
    if (a.expiresAt && a.expiresAt <= Date.now() + 60000) a = await this.refresh(a.id);
    try { return await fn(a); } catch (e) { if (e.status !== 401) throw e; return fn(await this.refresh(a.id)); }
  }
  async balance(id) {
    const a = this.account(id), balance = await this.authorized(a.id, a => this.client.credits(a));
    await this.store.append('balances', { accountId: a.id, ...balance });
    await this.store.change(s => { s.accounts.find(x => x.id === a.id).balance = balance; }); return balance;
  }
  async models(id, force = false) {
    const a = this.account(id), cached = this.modelsCache.get(a.id);
    if (!force && cached && Date.now() - cached.checkedAt < 300000) return { ...cached, models: currentModels(cached.models) };
    const result = { models: await this.authorized(a.id, a => this.client.models(a)), checkedAt: Date.now(), rateNote: '上游积分倍率，不是每次固定扣分；活动倍率按上游时间窗判断。' };
    this.modelsCache.set(a.id, result); return { ...result, models: currentModels(result.models) };
  }
  async startLogin(region = 'cn') {
    if (!['cn', 'global'].includes(region)) throw new Error('请选择国内版或国际版');
    for (const [id, s] of this.sessions) if (s.expiresAt <= Date.now()) this.sessions.delete(id);
    if (this.sessions.size >= 5) throw new Error('进行中的登录过多，请完成或取消已有登录');
    const base = region === 'cn' ? 'https://www.codebuddy.cn' : 'https://www.workbuddy.ai';
    const data = await jsonRequest(this.client.fetch, `${base}/v2/plugin/auth/state?platform=workbuddy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!data.state || typeof data.state !== 'string') throw new Error('登录服务没有返回授权标识');
    const url = new URL(data.authUrl || data.auth_url || `${base}/login?state=${encodeURIComponent(data.state)}`);
    if (url.protocol !== 'https:') throw new Error('登录服务返回的链接无效'); domainOf(url.hostname);
    const id = randomUUID(), expiresAt = Date.now() + 600000;
    this.sessions.set(id, { state: data.state, region, base, expiresAt, polling: false });
    return { loginId: id, verificationUri: url.href, expiresAt };
  }
  cancelLogin(id) { this.sessions.delete(id); }
  async pollLogin(id) {
    const s = this.sessions.get(id); if (!s) throw new Error('登录已结束，请重新开始');
    if (s.expiresAt <= Date.now()) { this.sessions.delete(id); throw new Error('登录已超时，请重新开始'); }
    if (s.polling || (s.lastPoll && Date.now() - s.lastPoll < 1800)) return { done: false };
    s.polling = true; s.lastPoll = Date.now();
    try {
      const url = `${s.base}/v2/plugin/auth/token?state=${encodeURIComponent(s.state)}`;
      const r = await this.client.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!r.ok) { await r.body?.cancel(); if (r.status >= 500 || r.status === 429) return { done: false }; throw new Error(`授权查询失败（HTTP ${r.status}）`); }
      const doc = await r.json(); if (![0, 200].includes(doc.code)) return { done: false };
      const d = doc.data ?? {}, accessToken = d.accessToken || d.access_token;
      if (!accessToken) return { done: false };
      const domain = domainOf(d.domain || new URL(s.base).hostname);
      if (regionOf(domain) !== s.region) throw new Error('登录账号与所选区域不一致');
      const a = { accessToken, refreshToken: d.refreshToken || d.refresh_token || '', domain, region: s.region, expiresAt: expiry(d, 'expiresAt', 'expiresIn') || expiry(d, 'expires_at', 'expires_in'), refreshExpiresAt: expiry(d, 'refreshExpiresAt', 'refreshExpiresIn') };
      const profile = await this.client.profile(a);
      if (!this.sessions.has(id)) return { done: false, cancelled: true };
      const account = await this.add({ ...a, ...this.identity(profile) }); this.sessions.delete(id); return { done: true, account };
    } finally { s.polling = false; }
  }
  async usage(id, period = 'today', limit = 200) {
    const now = dayKey(Date.now());
    const rows = (await this.store.rows('requests')).filter(r => (!id || r.accountId === id) && (period === 'all' || (period === 'month' ? dayKey(r.at).slice(0, 7) === now.slice(0, 7) : dayKey(r.at) === now)));
    const known = rows.filter(r => typeof r.credit === 'number');
    const summary = { requests: rows.length, knownCredit: known.reduce((s, r) => s + r.credit, 0), unknownRequests: rows.length - known.length, failedRequests: rows.filter(r => r.status !== 'ok').length };
    const models = new Map(); for (const r of rows) { const v = models.get(r.model) ?? { model: r.model, requests: 0, knownCredit: 0, unknownRequests: 0 }; v.requests++; if (typeof r.credit === 'number') v.knownCredit += r.credit; else v.unknownRequests++; models.set(r.model, v); }
    return { summary, byModel: [...models.values()], rows: rows.slice(-Math.min(1000, limit)).reverse(), timezone: 'Asia/Shanghai' };
  }
  async run(body, { accountId, onDelta, signal, protocol = 'chat' } = {}) {
    // Resolve once. Switching accounts while streaming must not relabel a request.
    const a = this.account(accountId), requestId = randomUUID(), at = Date.now();
    if (typeof body.model !== 'string' || !body.model.trim()) throw Object.assign(new Error('请选择一个模型'), { status: 400 });
    let seenUsage = null, status = 'ok', failure = null, actualModel = null;
    try {
      const result = await this.authorized(a.id, cred => this.client.chat(cred, body, { onDelta, signal, onUsage: u => { seenUsage = u; } }));
      seenUsage = result.usage ?? seenUsage; actualModel = result.upstreamModel; return { ...result, requestId };
    } catch (e) { status = signal?.aborted ? 'cancelled' : 'error'; failure = e.status ? `HTTP ${e.status}` : '请求未完成'; throw e; }
    finally {
      const credit = typeof seenUsage?.credit === 'number' && Number.isFinite(seenUsage.credit) && seenUsage.credit >= 0 ? seenUsage.credit : null;
      const n = key => typeof seenUsage?.[key] === 'number' ? seenUsage[key] : null;
      await this.store.append('requests', { requestId, at, accountId: a.id, accountName: a.label || a.nickname || '账号', model: actualModel || body.model.replace(/\[[^\]]*\]\s*$/u, '').trim(), requestModel: body.model, protocol, durationMs: Date.now() - at, status, error: failure, credit, creditSource: credit === null ? 'unavailable' : 'upstream', inputTokens: n('prompt_tokens'), outputTokens: n('completion_tokens'), cachedTokens: seenUsage?.prompt_tokens_details?.cached_tokens ?? null });
    }
  }
}
