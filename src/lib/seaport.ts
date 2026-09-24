// Seaport 約定トランザクションの ABI エンコード用ヘルパ（クライアントに同梱される。秘密情報なし）。
// OpenSea の fulfillment_data が返す { function, input_data } を viem の encodeFunctionData に渡せる形へ変換する。
// 対応外の関数が来た場合は呼び出し側でフォールバック（OpenSea 誘導）する。

export interface AbiInput {
  name: string;
  type: string;
  components?: AbiInput[];
}

export interface SeaportFn {
  type: 'function';
  name: string;
  stateMutability: 'payable';
  inputs: AbiInput[];
  outputs: { type: string }[];
}

const ADDITIONAL_RECIPIENT: AbiInput[] = [
  { name: 'amount', type: 'uint256' },
  { name: 'recipient', type: 'address' },
];

const BASIC_ORDER_PARAMETERS: AbiInput = {
  name: 'parameters',
  type: 'tuple',
  components: [
    { name: 'considerationToken', type: 'address' },
    { name: 'considerationIdentifier', type: 'uint256' },
    { name: 'considerationAmount', type: 'uint256' },
    { name: 'offerer', type: 'address' },
    { name: 'zone', type: 'address' },
    { name: 'offerToken', type: 'address' },
    { name: 'offerIdentifier', type: 'uint256' },
    { name: 'offerAmount', type: 'uint256' },
    { name: 'basicOrderType', type: 'uint8' },
    { name: 'startTime', type: 'uint256' },
    { name: 'endTime', type: 'uint256' },
    { name: 'zoneHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' },
    { name: 'offererConduitKey', type: 'bytes32' },
    { name: 'fulfillerConduitKey', type: 'bytes32' },
    { name: 'totalOriginalAdditionalRecipients', type: 'uint256' },
    { name: 'additionalRecipients', type: 'tuple[]', components: ADDITIONAL_RECIPIENT },
    { name: 'signature', type: 'bytes' },
  ],
};

const OFFER_ITEM: AbiInput[] = [
  { name: 'itemType', type: 'uint8' },
  { name: 'token', type: 'address' },
  { name: 'identifierOrCriteria', type: 'uint256' },
  { name: 'startAmount', type: 'uint256' },
  { name: 'endAmount', type: 'uint256' },
];

const CONSIDERATION_ITEM: AbiInput[] = [...OFFER_ITEM, { name: 'recipient', type: 'address' }];

const ORDER_PARAMETERS: AbiInput = {
  name: 'parameters',
  type: 'tuple',
  components: [
    { name: 'offerer', type: 'address' },
    { name: 'zone', type: 'address' },
    { name: 'offer', type: 'tuple[]', components: OFFER_ITEM },
    { name: 'consideration', type: 'tuple[]', components: CONSIDERATION_ITEM },
    { name: 'orderType', type: 'uint8' },
    { name: 'startTime', type: 'uint256' },
    { name: 'endTime', type: 'uint256' },
    { name: 'zoneHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' },
    { name: 'conduitKey', type: 'bytes32' },
    { name: 'totalOriginalConsiderationItems', type: 'uint256' },
  ],
};

const CRITERIA_RESOLVER: AbiInput[] = [
  { name: 'orderIndex', type: 'uint256' },
  { name: 'side', type: 'uint8' },
  { name: 'index', type: 'uint256' },
  { name: 'identifier', type: 'uint256' },
  { name: 'criteriaProof', type: 'bytes32[]' },
];

function basicFn(name: string): SeaportFn {
  return {
    type: 'function', name, stateMutability: 'payable',
    inputs: [BASIC_ORDER_PARAMETERS],
    outputs: [{ type: 'bool' }],
  };
}

export const SEAPORT_FUNCTIONS: Record<string, SeaportFn> = {
  fulfillBasicOrder: basicFn('fulfillBasicOrder'),
  fulfillBasicOrder_efficient_6GL6yc: basicFn('fulfillBasicOrder_efficient_6GL6yc'),
  fulfillOrder: {
    type: 'function', name: 'fulfillOrder', stateMutability: 'payable',
    inputs: [
      { name: 'order', type: 'tuple', components: [ORDER_PARAMETERS, { name: 'signature', type: 'bytes' }] },
      { name: 'fulfillerConduitKey', type: 'bytes32' },
    ],
    outputs: [{ type: 'bool' }],
  },
  fulfillAdvancedOrder: {
    type: 'function', name: 'fulfillAdvancedOrder', stateMutability: 'payable',
    inputs: [
      {
        name: 'advancedOrder', type: 'tuple', components: [
          ORDER_PARAMETERS,
          { name: 'numerator', type: 'uint120' },
          { name: 'denominator', type: 'uint120' },
          { name: 'signature', type: 'bytes' },
          { name: 'extraData', type: 'bytes' },
        ],
      },
      { name: 'criteriaResolvers', type: 'tuple[]', components: CRITERIA_RESOLVER },
      { name: 'fulfillerConduitKey', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
};

/** OpenSea input_data（名前付きオブジェクト）→ ABI 順の位置引数へ。uint/int は BigInt に正規化。 */
export function toSeaportArgs(inputs: AbiInput[], data: Record<string, unknown>): unknown[] {
  return inputs.map((input) => coerce(input, data?.[input.name]));
}

function coerce(input: AbiInput, value: unknown): unknown {
  if (input.type.endsWith('[]')) {
    const elemType = input.type.slice(0, -2);
    const arr = Array.isArray(value) ? value : [];
    return arr.map((v) => coerce({ ...input, type: elemType }, v));
  }
  if (input.type === 'tuple') {
    const obj = (value ?? {}) as Record<string, unknown>;
    return (input.components ?? []).map((c) => coerce(c, obj[c.name]));
  }
  if (/^u?int/.test(input.type)) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' || typeof value === 'string') return BigInt(value);
    return 0n;
  }
  if (input.type === 'bool') return Boolean(value);
  // address / bytes / bytes32 など
  return value ?? '0x';
}
