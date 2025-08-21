// src/tools/create2Check.ts
import fs from "fs";
import path from "path";
import {
  keccak256,
  getAddress,
  isHexString,
  dataSlice,
  Interface,
  AbiCoder,
  JsonRpcProvider,
  Contract,
  isAddress,
  solidityPackedKeccak256,
} from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

type Inputs =
  | {
      mode: "artifact";
      artifactPath: string;
      argsJson?: string;
    }
  | {
      mode: "raw";
      bytecodeHex: string;
      constructorTypes?: string; // JSON string: ["address","bytes32",...]
      constructorArgsJson?: string; // JSON string: ["0x..", "...", ...]
    }
  | {
      mode: "contract";
      contractName: string; // read from hre.artifacts
      argsJson?: string;
    };

export type Create2CheckParams = {
  hre: HardhatRuntimeEnvironment;
  factory: string;                // address
  dispatcher?: string;            // address (optional)
  salt: string;                   // bytes32
  expectedAddress?: string;       // address (optional)
  expectedFactoryCodehash?: string;      // bytes32 (optional)
  expectedDispatcherCodehash?: string;   // bytes32 (optional)
  rpcUrlOverride?: string;        // optional: custom provider
  noFail?: boolean;               // don't throw on mismatch
} & Inputs;

function die(msg: string): never {
  throw new Error(`[CREATE2Check] ${msg}`);
}

function normAddr(a: string | undefined, tag: string): string | null {
  if (!a) return null;
  if (!isAddress(a)) die(`Bad ${tag} address: ${a}`);
  return getAddress(a);
}

function normBytes32(x: string | undefined, tag: string): string | null {
  if (!x) return null;
  if (!isHexString(x, 32)) die(`Bad ${tag} bytes32: ${x}`);
  return x.toLowerCase();
}

function ensureHex(x: string, tag: string): string {
  if (!isHexString(x)) die(`Bad ${tag} hex: ${x}`);
  return x.toLowerCase();
}

function hexConcat(a: string, b: string): string {
  return a + b.slice(2);
}

function encodeConstructorFromAbi(abi: any[], argsArr: any[]): string {
  const iface = new Interface(abi);
  // find constructor fragment
  const ctor = iface.fragments.find((f) => f.type === "constructor");
  const inputs = (ctor as any)?.inputs ?? [];
  const types = inputs.map((i: any) => i.type);
  const coder = AbiCoder.defaultAbiCoder();
  return coder.encode(types, argsArr);
}

function encodeConstructorFromTypes(typesJson?: string, argsJson?: string): string {
  const types = typesJson ? JSON.parse(typesJson) : [];
  const args  = argsJson ? JSON.parse(argsJson)  : [];
  const coder = AbiCoder.defaultAbiCoder();
  return coder.encode(types, args);
}

async function buildInitCode(
  hre: HardhatRuntimeEnvironment,
  input: Inputs
): Promise<{ initCode: string; initCodeHash: string; abi?: any[] }> {
  if (input.mode === "artifact") {
    const art = JSON.parse(fs.readFileSync(input.artifactPath, "utf8"));
    const abi: any[] = art.abi;
    const bytecode = art.bytecode || art.deployedBytecode;
    if (!bytecode) die("Artifact missing bytecode");
    const argsArr = input.argsJson ? JSON.parse(input.argsJson) : [];
    const enc = encodeConstructorFromAbi(abi, argsArr);
    const initCode = ensureHex(hexConcat(bytecode, enc), "initCode");
    return { initCode, initCodeHash: keccak256(initCode), abi };
  }
  if (input.mode === "contract") {
    const art = await hre.artifacts.readArtifact(input.contractName);
    const abi: any[] = art.abi;
    const bytecode = art.bytecode || art.deployedBytecode;
    if (!bytecode) die(`Artifact for ${input.contractName} missing bytecode`);
    const argsArr = input.argsJson ? JSON.parse(input.argsJson) : [];
    const enc = encodeConstructorFromAbi(abi, argsArr);
    const initCode = ensureHex(hexConcat(bytecode, enc), "initCode");
    return { initCode, initCodeHash: keccak256(initCode), abi };
  }
  // raw
  const b = ensureHex(input.bytecodeHex, "bytecodeHex");
  const enc = input.constructorTypes
    ? encodeConstructorFromTypes(input.constructorTypes, input.constructorArgsJson)
    : "0x";
  const initCode = ensureHex(hexConcat(b, enc), "initCode");
  return { initCode, initCodeHash: keccak256(initCode) };
}

function computeCreate2(factory: string, salt: string, initCodeHash: string) {
  const digest = solidityPackedKeccak256(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xff", factory, salt, initCodeHash]
  );
  const predicted = getAddress(dataSlice(digest, 12));
  return predicted;
}

async function extCodeHashViaCode(provider: JsonRpcProvider, addr: string) {
  const code = await provider.getCode(addr);
  if (!code || code === "0x") return "0x" + "0".repeat(64);
  return keccak256(code);
}

export interface Create2CheckResult {
  predicted: string;
  initCodeHash: string;
  deployed: boolean;
  checks: {
    predictedVsExpected: boolean;
    factoryCodehash: boolean;
    dispatcherCodehash: boolean;
    onchainPrediction: boolean;
    systemIntegrity: boolean;
  };
}

export async function runCreate2Check(params: Create2CheckParams): Promise<Create2CheckResult> {
  const {
    hre,
    factory,
    dispatcher,
    salt,
    expectedAddress,
    expectedFactoryCodehash,
    expectedDispatcherCodehash,
    rpcUrlOverride,
    noFail,
    ...rest
  } = params;

  console.log("🔍 Starting CREATE2 determinism check...");

  const factoryAddr = normAddr(factory, "factory")!;
  const dispatcherAddr = normAddr(dispatcher, "dispatcher") || undefined;
  const salt32 = normBytes32(salt, "salt")!;
  const expected = normAddr(expectedAddress, "expected") || undefined;
  const expectedFHash = normBytes32(expectedFactoryCodehash, "expectedFactoryCodehash") || undefined;
  const expectedDHash = normBytes32(expectedDispatcherCodehash, "expectedDispatcherCodehash") || undefined;

  const { initCode, initCodeHash } = await buildInitCode(hre, rest as Inputs);
  const predicted = computeCreate2(factoryAddr, salt32, initCodeHash);

  console.log(`📍 Predicted address: ${predicted}`);
  console.log(`🧬 InitCode hash: ${initCodeHash}`);

  const checks = {
    predictedVsExpected: true,
    factoryCodehash: true,
    dispatcherCodehash: true,
    onchainPrediction: true,
    systemIntegrity: true,
  };

  // Off-chain prediction check
  if (expected && predicted.toLowerCase() !== expected.toLowerCase()) {
    const msg = `Predicted (${predicted}) ≠ expected (${expected})`;
    checks.predictedVsExpected = false;
    if (noFail) console.warn("⚠️", msg);
    else die(msg);
  } else if (expected) {
    console.log("✅ Predicted address matches expected");
  }

  // Provider
  const provider =
    rpcUrlOverride ? new JsonRpcProvider(rpcUrlOverride) : (hre.ethers.provider as unknown as JsonRpcProvider);

  // Codehash parity (factory)
  if (expectedFHash) {
    const ch = await extCodeHashViaCode(provider, factoryAddr);
    if (ch.toLowerCase() !== expectedFHash.toLowerCase()) {
      const msg = `Factory codehash mismatch. got=${ch} expected=${expectedFHash}`;
      checks.factoryCodehash = false;
      if (noFail) console.warn("⚠️", msg);
      else die(msg);
    } else {
      console.log("✅ Factory codehash matches expected");
    }
  }

  // Codehash parity (dispatcher)
  if (dispatcherAddr && expectedDHash) {
    const ch = await extCodeHashViaCode(provider, dispatcherAddr);
    if (ch.toLowerCase() !== expectedDHash.toLowerCase()) {
      const msg = `Dispatcher codehash mismatch. got=${ch} expected=${expectedDHash}`;
      checks.dispatcherCodehash = false;
      if (noFail) console.warn("⚠️", msg);
      else die(msg);
    } else {
      console.log("✅ Dispatcher codehash matches expected");
    }
  }

  // On-chain factory predict + integrity
  try {
    const minimalFactoryAbi = [
      {
        type: "function",
        name: "predictAddress",
        stateMutability: "view",
        inputs: [
          { name: "salt", type: "bytes32" },
          { name: "codeHash", type: "bytes32" },
        ],
        outputs: [{ type: "address" }],
      },
      {
        type: "function",
        name: "verifySystemIntegrity",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "bool" }],
      },
    ];
    const f = new Contract(factoryAddr, minimalFactoryAbi, provider);
    
    // Test prediction consistency
    const onchainPred = await f.predictAddress?.(salt32, initCodeHash);
    if (onchainPred && onchainPred.toLowerCase() !== predicted.toLowerCase()) {
      const msg = `Off-chain (${predicted}) ≠ on-chain predictAddress (${onchainPred})`;
      checks.onchainPrediction = false;
      if (noFail) console.warn("⚠️", msg);
      else die(msg);
    } else {
      console.log("✅ On-chain prediction matches off-chain calculation");
    }

    // Test system integrity
    const ok: boolean = await f.verifySystemIntegrity?.() ?? true;
    if (!ok) {
      const msg = `verifySystemIntegrity() returned false`;
      checks.systemIntegrity = false;
      if (noFail) console.warn("⚠️", msg);
      else die(msg);
    } else {
      console.log("✅ System integrity verification passed");
    }
  } catch (e: any) {
    const msg = `Factory predict/integrity check failed: ${e?.message || e}`;
    checks.onchainPrediction = false;
    checks.systemIntegrity = false;
    if (noFail) console.warn("⚠️", msg);
    else die(msg);
  }

  // Is predicted deployed?
  const predCode = await provider.getCode(predicted);
  const deployed = !!(predCode && predCode !== "0x");

  console.log(`📦 Contract deployed: ${deployed ? "YES" : "NO"}`);

  const allChecksPass = Object.values(checks).every(Boolean);
  if (allChecksPass) {
    console.log("🎉 All CREATE2 checks passed!");
  } else {
    console.log("❌ Some CREATE2 checks failed");
  }

  return {
    predicted,
    initCodeHash,
    deployed,
    checks,
  };
}

// Utility for cross-chain tasks
export async function preflightCreate2Check(
  hre: HardhatRuntimeEnvironment,
  config: {
    factory: string;
    dispatcher?: string;
    salt: string;
    contractName: string;
    constructorArgs: any[];
    expectedAddress?: string;
    expectedFactoryCodehash?: string;
    expectedDispatcherCodehash?: string;
    throwOnFail?: boolean;
  }
): Promise<Create2CheckResult> {
  console.log("\n🛫 CREATE2 Preflight Check");
  console.log("=".repeat(50));

  const result = await runCreate2Check({
    hre,
    factory: config.factory,
    dispatcher: config.dispatcher,
    salt: config.salt,
    expectedAddress: config.expectedAddress,
    expectedFactoryCodehash: config.expectedFactoryCodehash,
    expectedDispatcherCodehash: config.expectedDispatcherCodehash,
    mode: "contract",
    contractName: config.contractName,
    argsJson: JSON.stringify(config.constructorArgs),
    noFail: !config.throwOnFail,
  });

  console.log("=".repeat(50));
  return result;
}
