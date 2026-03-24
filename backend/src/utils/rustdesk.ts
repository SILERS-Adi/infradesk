const RUSTDESK_API  = process.env.RUSTDESK_API_URL  || 'http://localhost:21114';
const RUSTDESK_USER = process.env.RUSTDESK_API_USER || 'admin';
const RUSTDESK_PASS = process.env.RUSTDESK_API_PASS || '';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const r = await fetch(`${RUSTDESK_API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: RUSTDESK_USER, password: RUSTDESK_PASS, id: '', uuid: '' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`RustDesk login failed: ${r.status}`);
  const data = await r.json() as { access_token: string };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken!;
}

export async function generateOneTimePassword(rustdeskId: string): Promise<string> {
  const token = await getToken();
  const r = await fetch(`${RUSTDESK_API}/api/device/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: rustdeskId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`RustDesk password failed: ${r.status}`);
  const data = await r.json() as { password: string };
  return data.password;
}

export async function getRustDeskPeers(): Promise<any[]> {
  const token = await getToken();
  const url = new URL(`${RUSTDESK_API}/api/peers`);
  url.searchParams.set('current', '1');
  url.searchParams.set('pageSize', '100');
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`RustDesk peers failed: ${r.status}`);
  const data = await r.json() as { data: any[] };
  return data.data ?? [];
}
