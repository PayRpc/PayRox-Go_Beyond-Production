// src/tools/create2Check.ts
import fs from "fs";
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
  const _iface = new Interface(abi);
  // find constructor fragment
  const _ctor = _iface.fragments.find((f: any) => f.type === "constructor");
  const _inputs = (_ctor as any)?.inputs ?? [];
  const _types = _inputs.map((i: any) => i.type);
  const _coder = AbiCoder.defaultAbiCoder();
  return _coder.encode(_types, argsArr);
}

function encodeConstructorFromTypes(typesJson?: string, argsJson?: string): string {
  const _types = typesJson ? JSON.parse(typesJson) : [];
  const _args = argsJson ? JSON.parse(argsJson) : [];
  const _coder = AbiCoder.defaultAbiCoder();
  return _coder.encode(_types, _args);
}

async function buildInitCode(
  hre: HardhatRuntimeEnvironment,
  input: Inputs
): Promise<{ initCode: string; initCodeHash: string; abi?: any[] }> {
  if (input.mode === "artifact") {
    const _art = JSON.parse(fs.readFileSync(input.artifactPath, "utf8"));
  const abi: any[] = _art.abi;
  const _bytecode = _art.bytecode || _art.deployedBytecode;
  if (!_bytecode) die("Artifact missing bytecode");
  const _argsArr = input.argsJson ? JSON.parse(input.argsJson) : [];
  const _enc = encodeConstructorFromAbi(abi, _argsArr);
  const _initCode = ensureHex(hexConcat(_bytecode, _enc), "initCode");
  return { initCode: _initCode, initCodeHash: keccak256(_initCode), abi };
  }
  if (input.mode === "contract") {
    const _art = await hre.artifacts.readArtifact(input.contractName);
  const abi: any[] = _art.abi;
  const _bytecode = _art.bytecode || _art.deployedBytecode;
  if (!_bytecode) die(`Artifact for ${input.contractName} missing bytecode`);
  const _argsArr = input.argsJson ? JSON.parse(input.argsJson) : [];
  const _enc = encodeConstructorFromAbi(abi, _argsArr);
  const _initCode = ensureHex(hexConcat(_bytecode, _enc), "initCode");
  return { initCode: _initCode, initCodeHash: keccak256(_initCode), abi };
  }
  // raw
  const _b = ensureHex(input.bytecodeHex, "bytecodeHex");
  const _enc = input.constructorTypes
    ? encodeConstructorFromTypes(input.constructorTypes, input.constructorArgsJson)
    : "0x";
  const _initCode = ensureHex(hexConcat(_b, _enc), "initCode");
  return { initCode: _initCode, initCodeHash: keccak256(_initCode) };
}

function computeCreate2(factory: string, salt: string, initCodeHash: string) {
  const digest = solidityPackedKeccak256(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xff", factory, salt, initCodeHash]
  );
  const _predicted = getAddress(dataSlice(digest, 12));
  return _predicted;
}

async function extCodeHashViaCode(provider: JsonRpcProvider, addr: string) {
  const _code = await provider.getCode(addr);
  if (! _code || _code === "0x") return "0x" + "0".repeat(64);
  return keccak256(_code);
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

  const _factoryAddr = normAddr(factory, "factory")!;
  const _dispatcherAddr = normAddr(dispatcher, "dispatcher") || undefined;
  const _salt32 = normBytes32(salt, "salt")!;
  const _expected = normAddr(expectedAddress, "expected") || undefined;
  const _expectedFHash = normBytes32(expectedFactoryCodehash, "expectedFactoryCodehash") || undefined;
  const _expectedDHash = normBytes32(expectedDispatcherCodehash, "expectedDispatcherCodehash") || undefined;

  const { initCodeHash } = await buildInitCode(hre, rest as Inputs);
  const _predicted = computeCreate2(_factoryAddr, _salt32, initCodeHash);

  console.log(`📍 Predicted address: ${_predicted}`);
  console.log(`🧬 InitCode hash: ${initCodeHash}`);

  const checks = {
    predictedVsExpected: true,
    factoryCodehash: true,
    dispatcherCodehash: true,
    onchainPrediction: true,
    systemIntegrity: true,
  };

  // Off-chain prediction check
  if (_expected && _predicted.toLowerCase() !== _expected.toLowerCase()) {
    const _msg = `Predicted (${_predicted}) ≠ expected (${_expected})`;
    checks.predictedVsExpected = false;
    if (noFail) console.warn("⚠️", _msg);
    else die(_msg);
  } else if (_expected) {
    console.log("✅ Predicted address matches expected");
  }

  // Provider
  const provider =
    rpcUrlOverride ? new JsonRpcProvider(rpcUrlOverride) : (hre.ethers.provider as unknown as JsonRpcProvider);

  // Codehash parity (factory)
  if (_expectedFHash) {
    const _ch = await extCodeHashViaCode(provider, _factoryAddr);
    if (_ch.toLowerCase() !== _expectedFHash.toLowerCase()) {
      const _msg = `Factory codehash mismatch. got=${_ch} expected=${_expectedFHash}`;
      checks.factoryCodehash = false;
      if (noFail) console.warn("⚠️", _msg);
      else die(_msg);
    } else {
      console.log("✅ Factory codehash matches expected");
    }
  }

  // Codehash parity (dispatcher)
  if (_dispatcherAddr && _expectedDHash) {
    const _ch = await extCodeHashViaCode(provider, _dispatcherAddr);
    if (_ch.toLowerCase() !== _expectedDHash.toLowerCase()) {
      const _msg = `Dispatcher codehash mismatch. got=${_ch} expected=${_expectedDHash}`;
      checks.dispatcherCodehash = false;
      if (noFail) console.warn("⚠️", _msg);
      else die(_msg);
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
    const _f = new Contract(_factoryAddr, minimalFactoryAbi, provider);

    // Test prediction consistency
    const _onchainPred = await _f.predictAddress?.(_salt32, initCodeHash);
    if (_onchainPred && _onchainPred.toLowerCase() !== _predicted.toLowerCase()) {
      const _msg = `Off-chain (${_predicted}) ≠ on-chain predictAddress (${_onchainPred})`;
      checks.onchainPrediction = false;
      if (noFail) console.warn("⚠️", _msg);
      else die(_msg);
    } else {
      console.log("✅ On-chain prediction matches off-chain calculation");
    }

    // Test system integrity
    const ok: boolean = await _f.verifySystemIntegrity?.() ?? true;
    if (!ok) {
      const _msg = `verifySystemIntegrity() returned false`;
      checks.systemIntegrity = false;
      if (noFail) console.warn("⚠️", _msg);
      else die(_msg);
    } else {
      console.log("✅ System integrity verification passed");
    }
  } catch (e: any) {
    const _msg = `Factory predict/integrity check failed: ${e?.message || e}`;
    checks.onchainPrediction = false;
    checks.systemIntegrity = false;
  if (noFail) console.warn("⚠️", _msg);
  else die(_msg);
  }

  // Is predicted deployed?
    const _predCode = await provider.getCode(_predicted);
    const _deployed = !!(_predCode && _predCode !== "0x");

  console.log(`📦 Contract deployed: ${_deployed ? "YES" : "NO"}`);

  const _allChecksPass = Object.values(checks).every(Boolean);
  if (_allChecksPass) {
    console.log("🎉 All CREATE2 checks passed!");
  } else {
    console.log("❌ Some CREATE2 checks failed");
  }

  return {
    predicted: _predicted,
    initCodeHash,
    deployed: _deployed,
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
