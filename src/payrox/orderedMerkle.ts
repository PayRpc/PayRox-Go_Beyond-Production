import { ethers } from 'ethers';

export type ManifestHeaderInput = {
  versionBytes32: string;
  timestamp: number;
  deployer: string;
  chainId: number;
  previousHash: string;
};

// Computes a stable manifest hash from header fields and the Merkle root.
// abi.encode(versionBytes32, timestamp, deployer, chainId, previousHash, root)
export function computeManifestHash(header: ManifestHeaderInput, root: string): string {
  const _root = root.toLowerCase();
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256', 'address', 'uint256', 'bytes32', 'bytes32'],
      [
        header.versionBytes32,
        BigInt(header.timestamp),
        ethers.getAddress(header.deployer),
        BigInt(header.chainId),
        header.previousHash,
        _root,
      ],
    ),
  );
}
