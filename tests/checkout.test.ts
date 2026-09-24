import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  checkoutFee, checkoutPricingMatches, readCheckoutFeeBps,
  checkoutFeeV2, checkoutPricingMatchesV2, readCheckoutConfigV2,
  resolveCheckoutMode,
} from '../src/lib/checkout.ts';

test('checkoutFee rounds up and preserves exact wei accounting', () => {
  assert.equal(checkoutFee(250_000_000_000_000_000n, 500), 12_500_000_000_000_000n);
  assert.equal(checkoutFee(1n, 500), 1n);
  assert.equal(250_000_000_000_000_000n + checkoutFee(250_000_000_000_000_000n, 500), 262_500_000_000_000_000n);
});

test('checkoutFee rejects unsafe pricing configuration', () => {
  assert.throws(() => checkoutFee(1n, 0), RangeError);
  assert.throws(() => checkoutFee(1n, 3001), RangeError);
  assert.throws(() => checkoutFee(-1n, 500), RangeError);
});

test('checkout pricing must match the immutable contract rate', () => {
  assert.equal(checkoutPricingMatches(500, 500), true);
  assert.equal(checkoutPricingMatches(501, 500), false);
  assert.equal(checkoutPricingMatches(0, 0), false);
});

test('readCheckoutFeeBps decodes the contract value and fails closed', async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: `0x${500n.toString(16).padStart(64, '0')}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    assert.equal(await readCheckoutFeeBps('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', `http://127.0.0.1:${address.port}`), 500);
    assert.equal(await readCheckoutFeeBps('invalid', `http://127.0.0.1:${address.port}`), null);
  } finally {
    server.close();
  }
});

// V2（未デプロイ・ドラフト）: max(料率, 1泊あたり最低販売価格 × 泊数) の下限保護
// 実運用値: 1泊の下限を0.5 ETH（現在の相場で16万円相当）としてテストする。
const PER_NIGHT_FLOOR = 500_000_000_000_000_000n; // 0.5 ETH

test('checkoutFeeV2 uses the rate fee when the owner price is already above the nightly floor', () => {
  // 1泊・1 ETHの出品・5%料率 → 通常価格1.05 ETHは1泊0.5 ETHの下限を上回るので料率のみ適用
  const fee = checkoutFeeV2(1_000_000_000_000_000_000n, 500, 1n, PER_NIGHT_FLOOR);
  assert.equal(fee, 50_000_000_000_000_000n);
});

test('checkoutFeeV2 tops up to the nightly floor when the owner price is below it', () => {
  // 1泊・0.3 ETHの出品・5%料率 → 通常価格0.315 ETHは1泊0.5 ETHの下限を下回るため、
  // 0.5 ETHまで引き上げ、差額(0.5-0.3=0.2 ETH)も11hotelの利益に含める
  const fee = checkoutFeeV2(300_000_000_000_000_000n, 500, 1n, PER_NIGHT_FLOOR);
  assert.equal(fee, 200_000_000_000_000_000n);
});

test('checkoutFeeV2 scales the floor by number of nights', () => {
  // 2泊・0.9 ETHの出品・5%料率 → 通常価格0.945 ETHは2泊分の下限1.0 ETHを下回るため下限が採用される
  const fee = checkoutFeeV2(900_000_000_000_000_000n, 500, 2n, PER_NIGHT_FLOOR);
  assert.equal(fee, 100_000_000_000_000_000n);
});

test('checkoutFeeV2 rejects unsafe pricing configuration', () => {
  assert.throws(() => checkoutFeeV2(1n, 0, 1n, 0n), RangeError);
  assert.throws(() => checkoutFeeV2(1n, 3001, 1n, 0n), RangeError);
  assert.throws(() => checkoutFeeV2(-1n, 500, 1n, 0n), RangeError);
  assert.throws(() => checkoutFeeV2(1n, 500, 0n, 0n), RangeError);
  assert.throws(() => checkoutFeeV2(1n, 500, 1n, -1n), RangeError);
});

test('checkoutPricingMatchesV2 requires both rate and nightly floor to match the immutable contract', () => {
  const onchain = { feeBps: 500, perNightFloorWei: PER_NIGHT_FLOOR };
  assert.equal(checkoutPricingMatchesV2({ feeBps: 500, perNightFloorWei: PER_NIGHT_FLOOR }, onchain), true);
  assert.equal(checkoutPricingMatchesV2({ feeBps: 500, perNightFloorWei: 400_000_000_000_000_000n }, onchain), false);
  assert.equal(checkoutPricingMatchesV2({ feeBps: 400, perNightFloorWei: PER_NIGHT_FLOOR }, onchain), false);
});

test('readCheckoutConfigV2 decodes feeBps + perNightFloor and fails closed', async () => {
  // feeBps/perNightFloor どちらの呼び出しも同じ生値(500)を返す簡易スタブ。decodeFunctionResult が
  // ABI型（uint16 / uint256）どおりに number / bigint へ復号できることを確認する。
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: `0x${500n.toString(16).padStart(64, '0')}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    const cfg = await readCheckoutConfigV2('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', `http://127.0.0.1:${address.port}`);
    assert.deepEqual(cfg, { feeBps: 500, perNightFloorWei: 500n });
    assert.equal(await readCheckoutConfigV2('invalid', `http://127.0.0.1:${address.port}`), null);
  } finally {
    server.close();
  }
});

// resolveCheckoutMode: market.ts / fulfill.ts / stay/[tokenId].astro の3箇所が同じ判定基準を
// 共有することで、表示価格と実際の請求額（V2稼働時の下限適用）を一致させるための唯一の分岐点。
test('resolveCheckoutMode falls back to V1 when KEY_NIGHTLY_FLOOR_ETH is unset', async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: `0x${500n.toString(16).padStart(64, '0')}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const rpcUrl = `http://127.0.0.1:${address.port}`;
  try {
    const matching = await resolveCheckoutMode('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', 500, '', rpcUrl);
    assert.deepEqual(matching, { ready: true, v2: false, perNightFloorWei: null });
    const mismatched = await resolveCheckoutMode('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', 400, '', rpcUrl);
    assert.deepEqual(mismatched, { ready: false, v2: false, perNightFloorWei: null });
  } finally {
    server.close();
  }
});

test('resolveCheckoutMode validates against the on-chain V2 config when KEY_NIGHTLY_FLOOR_ETH is set', async () => {
  // feeBps/perNightFloor どちらも同じ生値(500 wei)を返すスタブ。0.0000000000000005 ETH = 500 wei
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: `0x${500n.toString(16).padStart(64, '0')}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const rpcUrl = `http://127.0.0.1:${address.port}`;
  try {
    const matching = await resolveCheckoutMode('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', 500, '0.0000000000000005', rpcUrl);
    assert.deepEqual(matching, { ready: true, v2: true, perNightFloorWei: 500n });
    const mismatchedFloor = await resolveCheckoutMode('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', 500, '0.5', rpcUrl);
    assert.equal(mismatchedFloor.ready, false);
    assert.equal(mismatchedFloor.v2, true);
    const invalidFloor = await resolveCheckoutMode('0x8349173e476d9e51fcf941e6cb0e92d47b24438c', 500, 'not-a-number', rpcUrl);
    assert.deepEqual(invalidFloor, { ready: false, v2: true, perNightFloorWei: null });
  } finally {
    server.close();
  }
});
