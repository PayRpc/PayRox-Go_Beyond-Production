/**
 * @fileoverview ethers.js compatibility utilities for PayRox
 * @description Provides compatibility layer between ethers v5 and v6
 */

import { ethers } from 'ethers';

export interface EthersCompat {
    formatEther: (wei: bigint | string) => string;
    parseEther: (ether: string) => bigint;
    getAddress: (address: string) => string;
    isAddress: (address: string) => boolean;
    keccak256: (data: string | Uint8Array) => string;
    solidityPacked: (types: string[], values: any[]) => string;
}

/**
 * Ethers compatibility utilities
 */
export const ethersCompat: EthersCompat = {
    formatEther: (wei: bigint | string): string => {
        return ethers.formatEther(wei);
    },

    parseEther: (ether: string): bigint => {
        return ethers.parseEther(ether);
    },

    getAddress: (address: string): string => {
        return ethers.getAddress(address);
    },

    isAddress: (address: string): boolean => {
        return ethers.isAddress(address);
    },

    keccak256: (data: string | Uint8Array): string => {
        return ethers.keccak256(data);
    },

    solidityPacked: (types: string[], values: any[]): string => {
        return ethers.solidityPacked(types, values);
    }
};

/**
 * Create a provider based on environment
 */
export function createProvider(rpcUrl?: string): ethers.JsonRpcProvider {
    const _url = rpcUrl || process.env.RPC_URL || 'http://localhost:8545';
    return new ethers.JsonRpcProvider(url);
}

/**
 * Create a signer from private key
 */
export function createSigner(privateKey: string, provider?: ethers.Provider): ethers.Wallet {
    return new ethers.Wallet(privateKey, provider);
}

/**
 * Get contract factory with signer
 */
export function getContractFactory(
    abi: any[],
    bytecode: string,
    signer: ethers.Signer
): ethers.ContractFactory {
    return new ethers.ContractFactory(abi, bytecode, signer);
}

export default ethersCompat;
