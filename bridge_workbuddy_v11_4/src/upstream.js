import { chatUserAgent, resolveChatIdentity, normalizeBodyForTest } from '../vendor/upstream.js';
import { parseWorkBuddyPromos, attachPromos, selectPromoMultiplier, selectPromoBadge } from '../vendor/promo.js';

const ALLOWED = new Set(['www.workbuddy.cn', 'www.codebuddy.cn', 'workbuddy.cn', 'codebuddy.cn', 'www.workbuddy.ai', 'workbuddy.ai', 'www.codebuddy.ai', 'codebuddy.ai']);
export function domainOf(value = 'www.workbuddy.cn') {
  const s = String(value).replace(/^https:\/\//, '').replace(/\/$/, '').toLowerCase();
  if (!ALLOWED.has(s)) throw new Error('账号域名不受支持'); return s;
}
export function regionOf(domain) { return domainOf(domain).endsWith('.cn') ? 'cn' : 'global'; }
export function headersFor(a) {
  const identity = resolveChatIdentity(a.region === 'cn' ? 'cn' : 'ai');
  return { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${a.accessToken}`, 'X-Product': 'SaaS', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': chatUserAgent(identity, a.region === 'cn' ? 'cn' : 'ai'), ...(a.uid ? { 'X-User-Id': a.uid } : {}), ...(a.domain ? { 'X-Domain': a.domain } : {}), ...(a.enterpriseId ? { 'X-Enterprise-Id': a.enterpriseId } : {}) };
}
export class UpstreamError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }
export async function jsonRequest(fetcher, url, options = {}) {
  domainOf(new URL(url).hostname);
  const r = await fetcher(url, { ...options, redirect: 'error', signal: options.signal ?? AbortSignal.timeout(30000) });
  let d; try { d = await r.json(); } catch { throw new UpstreamError(`上游返回非 JSON 内容（HTTP ${r.status}）`, r.ok ? 502 : r.status); }
  if (!r.ok || (d.code !== undefined && ![0, 200].includes(d.code))) throw new UpstreamError(`上游请求失败（HTTP ${r.status}，业务码 ${d.code ?? '未知'}）`, r.ok ? 502 : r.status);
  return d.data ?? d;
}
const finite = v => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;
export function parseCredits(data, enterprise = false, now = Date.now()) {
  if (enterprise) {
    const d = data.Data ?? data; const total = finite(d.limitNum), used = finite(d.credit);
    if (total === undefined || used === undefined) throw new Error('企业计费接口没有提供可用余额');
    return { total, used, remaining: Math.max(0, total - used), packages: [{ name: '企业积分', total, used, remaining: Math.max(0, total - used), refreshAt: d.cycleResetTime ?? null }] };
  }
  const accounts = data.Response?.Data?.Accounts;
  if (!Array.isArray(accounts)) throw new Error('余额接口格式变化，未将未知余额记为零');
  const n = (r, key) => finite(r[key + 'Precise']) ?? finite(r[key]);
  const packages = accounts.map(r => {
    const monthly = r.CapacityType === 4;
    const remaining = n(r, 'CycleCapacityRemain') ?? n(r, 'CapacityRemain');
    if (remaining === undefined) throw new Error('积分包缺少余额字段');
    const total = n(r, 'CycleCapacitySize') ?? n(r, 'CapacitySize') ?? null;
    const used = n(r, 'CycleCapacityUsed') ?? null;
    return { name: r.PackageName ?? '积分包', remaining: Math.max(0, remaining), total, used, monthly, expiresAt: monthly ? null : r.ExpiredTime || r.CycleEndTime || null, refreshAt: monthly ? r.CycleEndTime ?? null : null };
  }).filter(p => p.monthly || (p.remaining > 0 && (!p.expiresAt || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) > now)));
  return { remaining: packages.reduce((s, p) => s + p.remaining, 0), total: packages.every(p => p.total !== null) ? packages.reduce((s, p) => s + p.total, 0) : null, used: packages.every(p => p.used !== null) ? packages.reduce((s, p) => s + p.used, 0) : null, packages };
}
export const parseRate = value => { const m = typeof value === 'string' && /x\s*(\d*\.?\d+)/i.exec(value); return m ? Number(m[1]) : null; };
export function parseModels(data) {
  const models = data.models; if (!Array.isArray(models)) throw new Error('模型目录格式变化');
  const cli = (Array.isArray(data.agents) ? data.agents : []).find(a => a.id === 'cli' || a.name === 'cli');
  const ids = Array.isArray(cli?.models) && cli.models.length ? cli.models.map(m => typeof m === 'string' ? m : m.id) : null;
  const base = models.filter(m => m && typeof m.id === 'string' && !m.disabled && !['auto', 'default-model'].includes(m.id) && m.maxInputTokens > 0 && m.maxOutputTokens > 0 && (!ids || ids.includes(m.id))).map(m => ({ id: m.id, name: m.name || m.id, multiplier: parseRate(m.credits), rawRate: typeof m.credits === 'string' ? m.credits : null, contextWindow: m.maxInputTokens, maxOutput: m.maxOutputTokens, description: m.descriptionZh || m.descriptionEn || '' }));
  if (!base.length) throw new Error('上游目录没有可用模型');
  return attachPromos(base, parseWorkBuddyPromos(data.modelPromotions, data.modelTiers));
}
export function currentModels(models, now = Date.now()) {
  return models.map(m => ({ ...m, currentMultiplier: selectPromoMultiplier(m.promos, now) ?? m.multiplier, promotion: selectPromoBadge(m.promos, now)?.badge?.label ?? null }));
}
export class Client {
  constructor(fetcher = fetch) { this.fetch = fetcher; }
  profile(a) { const base = a.region === 'cn' ? 'www.codebuddy.cn' : domainOf(a.domain); return jsonRequest(this.fetch, `https://${base}/v2/plugin/login/account`, { headers: headersFor(a) }); }
  async credits(a) {
    const enterprise = !!a.enterpriseId, base = a.region === 'cn' ? 'www.codebuddy.cn' : domainOf(a.domain);
    const now = new Date();
    const time = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    const data = await jsonRequest(this.fetch, `https://${base}${enterprise ? '/billing/meter/get-enterprise-user-usage' : '/v2/billing/meter/get-user-resource'}`, { method: 'POST', headers: headersFor(a), body: JSON.stringify(enterprise ? {} : { PageNumber: 1, PageSize: 100, ProductCode: 'p_tcaca', Status: [0, 3], PackageEndTimeRangeBegin: time(now), PackageEndTimeRangeEnd: time(new Date(now.getTime() + 101 * 365 * 86400000)) }) });
    const count = data.Response?.Data?.TotalCount;
    if (!enterprise && count > 100) throw new Error('积分包超过一页，暂不能保证总余额完整');
    return { ...parseCredits(data, enterprise), checkedAt: Date.now() };
  }
  async models(a) {
    const h = headersFor(a); h['User-Agent'] = `WorkBuddy/${resolveChatIdentity(a.region === 'cn' ? 'cn' : 'ai').clientVersion}`;
    try {
      const appModels = parseModels(await jsonRequest(this.fetch, `https://${domainOf(a.domain)}/v3/config`, { headers: h }));
      if (a.region !== 'global') return appModels;
      // International App and CLI rosters differ; merge without losing App promotions.
      try {
        const cliModels = parseModels(await jsonRequest(this.fetch, `https://${domainOf(a.domain)}/v3/config`, { headers: { ...h, 'User-Agent': 'CLI/2.63.2 CodeBuddy/2.63.2' } }));
        const merged = new Map(appModels.map(m => [m.id, m]));
        for (const m of cliModels) merged.set(m.id, { ...merged.get(m.id), ...m, promos: merged.get(m.id)?.promos ?? m.promos });
        return [...merged.values()];
      } catch { return appModels; }
    }
    catch (e) { if (a.region !== 'cn') throw e; return parseModels(await jsonRequest(this.fetch, `https://${domainOf(a.domain)}/v2/enterprises/personal/models`, { headers: h })); }
  }
  async refresh(a) {
    if (!a.refreshToken) throw new UpstreamError('账号登录已过期，请重新扫码', 401);
    const d = await jsonRequest(this.fetch, `https://${domainOf(a.domain)}/v2/plugin/auth/token/refresh`, { method: 'POST', headers: { ...headersFor(a), 'X-Refresh-Token': a.refreshToken, 'X-Auth-Refresh-Source': 'workbuddy' } });
    if (!d.accessToken) throw new UpstreamError('刷新登录失败，请重新扫码', 401);
    return { ...a, accessToken: d.accessToken, refreshToken: d.refreshToken || a.refreshToken, expiresAt: d.expiresIn ? Date.now() + d.expiresIn * 1000 : 0, domain: domainOf(d.domain || a.domain) };
  }
  async chat(account, body, { signal, onDelta, onUsage } = {}) {
    const a = { ...account, edition: account.region === 'cn' ? 'cn' : 'ai' };
    const payload = normalizeBodyForTest(structuredClone(body));
    // Respect explicit output budgets instead of silently increasing paid work.
    if (Number.isFinite(body.max_tokens) && body.max_tokens > 0) payload.max_tokens = body.max_tokens;
    const h = { ...headersFor(a), 'X-IDE-Type': 'WorkBuddy', 'X-IDE-Name': 'WorkBuddy', 'X-IDE-Version': resolveChatIdentity(a.edition).clientVersion, Origin: `https://${a.domain}`, Referer: `https://${a.domain}/` };
    const r = await this.fetch(`https://${domainOf(a.domain)}/v2/chat/completions`, { method: 'POST', headers: h, body: JSON.stringify(payload), redirect: 'error', signal: signal ?? AbortSignal.timeout(600000) });
    if (!r.ok) { await r.body?.cancel(); throw new UpstreamError(`模型请求失败（HTTP ${r.status}）`, r.status); }
    if (!r.headers.get('content-type')?.includes('text/event-stream')) { await r.body?.cancel(); throw new UpstreamError('模型未返回预期的数据流'); }
    return readChatStream(r.body, { onDelta, onUsage });
  }
}
export async function readChatStream(stream, { onDelta, onUsage } = {}) {
  let buffer = '', text = '', reasoning = '', finishReason = null, usage = null, done = false, upstreamModel = null; const calls = new Map();
  const line = raw => {
    if (!raw.startsWith('data:')) return;
    const value = raw.slice(5).trim(); if (value === '[DONE]') { done = true; return; }
    let e; try { e = JSON.parse(value); } catch { return; }
    if (e.error) throw new UpstreamError('上游数据流报告错误');
    if (typeof e.model === 'string') upstreamModel = e.model;
    if (e.usage && typeof e.usage === 'object') { usage = { ...usage, ...e.usage }; onUsage?.(usage); }
    const c = e.choices?.[0]; if (!c) return;
    if (c.finish_reason) finishReason = c.finish_reason;
    const d = c.delta ?? {};
    if (d.content) { text += d.content; onDelta?.({ type: 'text', text: d.content }); }
    if (d.reasoning_content) { reasoning += d.reasoning_content; onDelta?.({ type: 'reasoning', text: d.reasoning_content }); }
    for (const f of d.tool_calls ?? []) {
      const key = f.index ?? 0, prev = calls.get(key) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (f.id) prev.id = f.id;
      if (f.function?.name) prev.function.name += f.function.name;
      if (f.function?.arguments) prev.function.arguments += f.function.arguments;
      calls.set(key, prev);
    }
  };
  const reader = stream.getReader(), decoder = new TextDecoder();
  try { while (true) { const { value, done: ended } = await reader.read(); if (ended) break; buffer += decoder.decode(value, { stream: true }); let n; while ((n = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, n).replace(/\r$/, '')); buffer = buffer.slice(n + 1); } } buffer += decoder.decode(); if (buffer.trim()) line(buffer); }
  catch (e) { await reader.cancel().catch(() => {}); throw e; }
  finally { reader.releaseLock(); }
  if (!done && !finishReason) throw new UpstreamError('上游数据流提前中断，扣费状态以已返回数据为准');
  return { text, reasoning, toolCalls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v), finishReason, usage, upstreamModel };
}
