/** Same tags as `tag` in programs/realty_chain/src/lib.rs. */

export const OPERATIONS = [
  { tag: 1, name: 'buy', operation: 'Buy shares at a price per share.' },
  { tag: 2, name: 'transfer', operation: 'Send shares to another wallet.' },
  { tag: 3, name: 'list', operation: 'List shares for sale at a price.' },
  { tag: 4, name: 'fill', operation: 'Buy shares from an open ask.' },
  { tag: 5, name: 'cancel', operation: 'Cancel an open ask.' },
  { tag: 6, name: 'deposit', operation: 'Deposit rent for holders to claim.' },
  { tag: 7, name: 'claim', operation: 'Claim rent owed to the signer.' },
  { tag: 8, name: 'redeem', operation: 'Turn shares in for exit proceeds.' },
  { tag: 9, name: 'refund', operation: 'Return shares after a failed raise.' },
  { tag: 10, name: 'mint', operation: 'Mint demo USDC to the signer.' },
  { tag: 11, name: 'create_listing', operation: 'Open a listing with a share cap and a price.' },
  { tag: 12, name: 'open_exit', operation: 'Open redemption with a proceeds amount.' },
  { tag: 13, name: 'configure', operation: 'Write admin, trusted issuer, USDC mint, and claim topics.' },
  { tag: 14, name: 'settle', operation: 'Settle a Corda position. Solana stores the share amount and a 32-byte commitment.' },
] as const;

const TAGS: Record<string, number> = {
  buy: 1,
  subscribe: 1,
  transfer: 2,
  recover: 2,
  recoveridentity: 2,
  forcedtransfer: 2,
  list: 3,
  fill: 4,
  cancel: 5,
  deposit: 6,
  claim: 7,
  redeem: 8,
  refund: 9,
  mint: 10,
  approve: 10,
  createlisting: 11,
  createdistributor: 11,
  create_listing: 11,
  open: 12,
  open_exit: 12,
  configure: 13,
  settle: 14,
};

function commitmentBytes(value: unknown) {
  const hex = typeof value === 'string' ? value.replace(/^0x/, '') : '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('A Corda settlement needs a 32-byte commitment.');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function asBig(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.floor(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function writeU64(target: Uint8Array, offset: number, value: unknown) {
  let n = asBig(value);
  if (n < 0n) n = 0n;
  for (let i = 0; i < 8; i += 1) {
    target[offset + i] = Number(n & 0xffn);
    n >>= 8n;
  }
}

export function encodeInstruction(functionName: string, args?: unknown[]) {
  const key = String(functionName || '').toLowerCase();
  const tag = TAGS[key];
  if (!tag) {
    throw new Error(`Solana program has no ${functionName} instruction.`);
  }
  const list = Array.isArray(args) ? args : [];
  const data = new Uint8Array(key === 'settle' ? 57 : 25);
  data[0] = tag;
  writeU64(data, 1, list[0]);
  writeU64(data, 9, list.length > 1 ? list[1] : list[0]);
  writeU64(data, 17, key === 'settle' ? 0 : (list.length > 2 ? list[2] : 0));
  if (key === 'settle') data.set(commitmentBytes(list[2]), 25);
  return data;
}
