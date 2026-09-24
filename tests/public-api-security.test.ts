import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSameOrigin, storedTxHash } from '../src/lib/public-api-security.ts';

test('requireSameOrigin accepts the exact production origin', () => {
  const request = new Request('https://11hotel.vip/api/vip/purchase-status', {
    method: 'POST',
    headers: { origin: 'https://11hotel.vip' },
  });
  assert.equal(requireSameOrigin(request), null);
});

test('requireSameOrigin rejects missing or foreign production origins', () => {
  const missing = new Request('https://11hotel.vip/api/vip/purchase-status', { method: 'POST' });
  const foreign = new Request('https://11hotel.vip/api/vip/purchase-status', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
  });
  assert.equal(requireSameOrigin(missing)?.status, 403);
  assert.equal(requireSameOrigin(foreign)?.status, 403);
});

test('storedTxHash extracts only a valid bound transaction hash', () => {
  const hash = `0x${'ab'.repeat(32)}`;
  assert.equal(storedTxHash(JSON.stringify({ tx_hash: hash })), hash);
  assert.equal(storedTxHash(JSON.stringify({ tx_hash: '0x1234' })), null);
  assert.equal(storedTxHash('not-json'), null);
});
