/**
 * Client-side credential pre-hash. The wire carries this digest instead of
 * the raw password; the server applies scrypt to the digest before storing,
 * so neither transit nor the database ever sees a plaintext password.
 * Format rule: sha256hex(`cyan-housing-planner:v1:${password}`).
 * Uses WebCrypto so the same helper works in the browser and in Node tests.
 */
export async function passwordDigest(password: string): Promise<string> {
  const data = new TextEncoder().encode(`cyan-housing-planner:v1:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
