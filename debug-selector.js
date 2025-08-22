const _fs = require('fs');
const _path = require('path');
const { keccak256, toUtf8Bytes } = require('ethers');

function selector(sig) {
  return '0x' + keccak256(toUtf8Bytes(sig)).slice(2, 10);
}

// Check PaymentsFacet artifact
const _paymentArt = JSON.parse(fs.readFileSync('./artifacts/contracts/facets/PaymentsFacet.sol/PaymentsFacet.json'));
console.log('PaymentsFacet ABI functions:');
paymentArt.abi.filter(i => i.type === 'function').forEach(fn => {
  const _sig = fn.name + '(' + (fn.inputs || []).map(input => input.type).join(',') + ')';
  const _sel = selector(sig);
  console.log(`  ${sig} = ${sel}`);
  if (sel === '0xf5b541a6') {
    console.log('  *** COLLISION FOUND! ***');
  }
});

console.log('\nRewardsFacet ABI functions:');
const _rewardArt = JSON.parse(fs.readFileSync('./artifacts/contracts/facets/RewardsFacet.sol/RewardsFacet.json'));
rewardArt.abi.filter(i => i.type === 'function').forEach(fn => {
  const _sig = fn.name + '(' + (fn.inputs || []).map(input => input.type).join(',') + ')';
  const _sel = selector(sig);
  console.log(`  ${sig} = ${sel}`);
  if (sel === '0xf5b541a6') {
    console.log('  *** COLLISION FOUND! ***');
  }
});
