import fs from 'node:fs';
import solc from 'solc';

const sourcePath = new URL('../contracts/ElevenHotelCheckoutV2.sol', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'ElevenHotelCheckoutV2.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage);
  process.exit(1);
}
const artifact = output.contracts['ElevenHotelCheckoutV2.sol'].ElevenHotelCheckoutV2;
if (!artifact?.evm?.bytecode?.object) throw new Error('checkout v2 bytecode missing');
if (process.argv.includes('--write')) {
  const target = new URL('../src/generated/checkout-v2-artifact.json', import.meta.url);
  fs.mkdirSync(new URL('../src/generated/', import.meta.url), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` }, null, 2) + '\n');
}
console.log(`ElevenHotelCheckoutV2 compiled (${artifact.evm.deployedBytecode.object.length / 2} bytes deployed)`);
