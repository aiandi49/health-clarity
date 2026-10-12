// Shared protections for every /api function. Not a route (underscore prefix).
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const UPSTREAM_DEADLINE_MS = 110 * 1000; // shorter than maxDuration (120 s) in vercel.json

const buckets = new Map();

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function visitorKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '') || 'unknown';
}

export function rateLimited(req, name, limit, windowMs) {
  const now = Date.now();
  const key = `${name}:${visitorKey(req)}`;
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return recent.length > limit;
}

export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const allowed = new Set();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) allowed.add(`https://${host}`);
  if (process.env.SITE_ORIGINS) {
    for (const o of process.env.SITE_ORIGINS.split(',')) if (o.trim()) allowed.add(o.trim());
  }
  if (process.env.NODE_ENV !== 'production' && host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    allowed.add(`http://${host}`);
  }
  return allowed.has(origin);
}

export async function readJson(req, maxBytes) {
  if (Number(req.headers['content-length'] || 0) > maxBytes) return { tooLarge: true };
  let raw;
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') raw = req.body;
    else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
    else {
      raw = JSON.stringify(req.body);
      if (Buffer.byteLength(raw, 'utf8') > maxBytes) return { tooLarge: true };
      return { data: req.body };
    }
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) return { tooLarge: true };
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) return { tooLarge: true };
  try { return { data: JSON.parse(raw || '{}') }; } catch { return { bad: true }; }
}

export function guard(req, res, { name, limit, windowMs }) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    send(res, 405, { error: 'Use POST.' });
    return false;
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    send(res, 415, { error: 'Send JSON.' });
    return false;
  }
  if (!originAllowed(req)) {
    send(res, 403, { error: 'This health guide only answers requests from its own site.' });
    return false;
  }
  if (rateLimited(req, name, limit, windowMs)) {
    send(res, 429, { error: 'Too many requests in a short time. Please wait a few minutes and try again.' });
    return false;
  }
  return true;
}

export async function callAnthropic(payload, signal) {
  const key = process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ ...payload, model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, max_tokens: 16000, output_config: { effort: 'medium' } }),
  });
  if (!res.ok) {
    console.error('anthropic status', res.status);
    throw new Error('upstream');
  }
  return res.json();
}

export function textOf(data) {
  return (data.content || []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('');
}
