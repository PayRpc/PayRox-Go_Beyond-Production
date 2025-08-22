import { task, types } from 'hardhat/config';
import fs from 'fs';
import { Wallet, verifyTypedData } from 'ethers';
import { computeManifestHash } from '../src/payrox/orderedMerkle';

type Manifest = {
  header?: {
    version: string;
    versionBytes32: string;
    timestamp: number;
    deployer: string;
    chainId: number;
    previousHash: string;
    gitCommit?: string;
    signer?: string;
    signature?: string;
  };
  root?: string;
  merkleRoot?: string;
};

const DOMAIN = (chainId: number, verifyingContract: string) => ({
  name: 'PayRoxManifest',
  version: '1',
  chainId,
  verifyingContract,
});

const TYPES = {
  ManifestHash: [{ name: 'manifestHash', type: 'bytes32' }],
};

function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJson(p: string, obj: any) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

task('payrox:manifest:sign', 'Sign manifestHash (EIP-712)')
  .addParam('path', 'manifest.root.json', undefined, types.string)
  .addParam(
    'dispatcher',
    'Dispatcher address (verifyingContract)',
    '0x0000000000000000000000000000000000000000',
    types.string,
  )
  .addOptionalParam('key', 'Private key (or use env SIGNER_KEY)', process.env.SIGNER_KEY, types.string)
  .setAction(async (args) => {
    const m: Manifest = readJson(args.path);
    const root = (m.merkleRoot || m.root || '').toLowerCase();
    if (!root || !m.header) throw new Error('manifest missing root/header');

    const gitCommit = process.env.GIT_COMMIT || m.header.gitCommit || '';
    if (gitCommit) m.header.gitCommit = gitCommit;

    const manifestHash = computeManifestHash(
      {
        versionBytes32: m.header.versionBytes32,
        timestamp: m.header.timestamp,
        deployer: m.header.deployer,
        chainId: m.header.chainId,
        previousHash: m.header.previousHash,
      },
      root,
    );

    const pk = args.key as string | undefined;
    if (!pk) throw new Error('SIGNER_KEY not provided');
    const wallet = new Wallet(pk);
    const domain = DOMAIN(m.header.chainId, args.dispatcher);
    const signature = await wallet.signTypedData(domain as any, TYPES as any, { manifestHash });

    m.header.signature = signature;
    m.header.signer = await wallet.getAddress();

    writeJson(args.path, m);
    console.log('✅ Signed manifest:', { signer: m.header.signer, manifestHash, dispatcher: args.dispatcher });
  });

task('payrox:manifest:verify', 'Verify EIP-712 signature in manifest.root.json')
  .addParam('path', 'manifest.root.json', undefined, types.string)
  .addParam(
    'dispatcher',
    'Dispatcher address (verifyingContract)',
    '0x0000000000000000000000000000000000000000',
    types.string,
  )
  .setAction(async (args) => {
    const m: Manifest = readJson(args.path);
    const root = (m.merkleRoot || m.root || '').toLowerCase();
    if (!root || !m.header?.signature || !m.header?.signer) throw new Error('manifest missing root/signature/signer');

    const manifestHash = computeManifestHash(
      {
        versionBytes32: m.header.versionBytes32,
        timestamp: m.header.timestamp,
        deployer: m.header.deployer,
        chainId: m.header.chainId,
        previousHash: m.header.previousHash,
      },
      root,
    );

    const domain = DOMAIN(m.header.chainId, args.dispatcher);
    const recovered = verifyTypedData(domain as any, TYPES as any, { manifestHash }, m.header.signature);
    const ok = recovered.toLowerCase() === m.header.signer.toLowerCase();
    if (!ok) {
      console.error('❌ Signature mismatch', { expected: m.header.signer, recovered });
      process.exit(1);
    }
    console.log('✅ Manifest signature OK', { signer: recovered, manifestHash });
  });
