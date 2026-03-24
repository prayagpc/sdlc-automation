import crypto from 'node:crypto';

export function verifyJiraWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || !rawBody) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const match = /^(\w+)=(.+)$/.exec(signatureHeader.trim());
  if (!match) return false;
  const [, method, signature] = match;
  const algo = method?.toLowerCase() === 'sha256' ? 'sha256' : null;
  if (!algo) return false;
  const hmac = crypto.createHmac(algo, secret);
  hmac.update(body);
  const expectedHex = hmac.digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedHex, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
