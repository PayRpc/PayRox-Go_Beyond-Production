#!/usr/bin/env ts-node
/*
 * gen-monolith.ts – produce a large, compile‑clean Solidity monolith (>= target KB)
 * --------------------------------------------------------------------------------
 * Why: You asked for an error‑free 70KB+ contract to test your splitter and gates.
 * This generator writes a single .sol file with many pure/view functions plus
 * filler comments to hit a deterministic source size target, without blowing
 * EIP‑170 at runtime unless you actually deploy it (deployment not required for
 * splitter testing).
 *
 * Usage examples:
 *   ts-node gen-monolith.ts --out contracts/test/PayRoxMegaMonolith.sol \
 *     --name PayRoxMegaMonolith --functions 900 --target-kb 85
 *
 *   # quick default (80KB target, ~700 fns)
 *   ts-node gen-monolith.ts --out contracts/test/Big.sol
 */

import * as fs from "fs";
import * as path from "path";

interface Opts {
  out: string;
  name: string;
  functions: number;
  targetKb: number;
  pragma: string;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    out: "contracts/test/PayRoxMegaMonolith.sol",
    name: "PayRoxMegaMonolith",
    functions: 700,
    targetKb: 80,
    pragma: "0.8.30",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) o.out = argv[++i]!;
    else if (a === "--name" && argv[i + 1]) o.name = argv[++i]!;
    else if (a === "--functions" && argv[i + 1]) o.functions = parseInt(argv[++i]!, 10);
    else if (a === "--target-kb" && argv[i + 1]) o.targetKb = parseInt(argv[++i]!, 10);
    else if (a === "--pragma" && argv[i + 1]) o.pragma = argv[++i]!;
    else if (a === "-h" || a === "--help") {
      console.log(`\nUsage: ts-node gen-monolith.ts [options]\n\nOptions:\n  --out <path>         Output .sol path (default contracts/test/PayRoxMegaMonolith.sol)\n  --name <Contract>    Contract name (default PayRoxMegaMonolith)\n  --functions <n>      Number of generated functions (default 700)\n  --target-kb <kb>     Target source size in KB (default 80)\n  --pragma <ver>       Solidity version (default 0.8.30)\n`);
      process.exit(0);
    }
  }
  return o;
}

function header(name: string, pragma: string): string {
  const bigComment = Array.from({ length: 64 })
    .map((_, i) => ` * Line ${i + 1}: PayRox splitter test block – this comment intentionally increases source size and is ignored by the compiler.`)
    .join("\n");
  return `// SPDX-License-Identifier: MIT
pragma solidity ${pragma};

/**
 * TEST CONTRACT - NOT FOR PRODUCTION USE
 * This is a generated monolith for testing PayRox splitter and gate functionality.
 * It is intentionally large to exercise source-size thresholds and selector parity.
 *
${bigComment}
 */

library PRXMath {
    function mix(uint256 a, uint256 b) internal pure returns (uint256) {
        unchecked { return (a ^ (b * 0x9E3779B97F4A7C15)) + (a << 7) + (b >> 3); }
    }

    function hash256(uint256 input) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(input)));
    }

    function modExp(uint256 base, uint256 exp, uint256 mod) internal pure returns (uint256) {
        uint256 result = 1;
        base = base % mod;
        while (exp > 0) {
            if (exp % 2 == 1) result = (result * base) % mod;
            exp = exp >> 1;
            base = (base * base) % mod;
        }
        return result;
    }
}

error PRXDenied();
error PRXBadInput(uint256 code);
error PRXOverflow(uint256 value, uint256 limit);
error PRXUnderflow(uint256 value, uint256 minimum);

event PRXDidThing(address indexed who, uint256 what, bytes data);
event PRXStateChange(bytes32 indexed key, bytes32 oldValue, bytes32 newValue);
event PRXComputation(uint256 indexed id, uint256 input, uint256 output);

contract ${name} {
    using PRXMath for uint256;

    // State variables to make the contract realistic (not needed for splitter tests)
    address public owner;
    address public pendingOwner;
    mapping(address => uint256) public balanceOf;
    mapping(bytes32 => bytes32) public kv;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(uint256 => bool) public processed;

    uint256 public totalSupply;
    uint256 public maxSupply = 1000000 * 1e18;
    uint256 public nonce;
    bool public paused;

    modifier onlyOwner() {
        if (msg.sender != owner) revert PRXDenied();
        _;
    }

    modifier notPaused() {
        if (paused) revert PRXDenied();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert PRXBadInput(1);
        _;
    }

    constructor() {
        owner = msg.sender;
        totalSupply = 0;
        nonce = 1;
        paused = false;
    }

`;
}

function genFn(i: number): string {
  const n = i.toString().padStart(4, "0");
  const funcType = i % 13;

  switch (funcType) {
    case 0: // view function with complex logic
      return `    /// @notice view function ${n} - complex balance calculation
    function view${n}(uint256 a, uint256 b) external view returns (uint256 sum, uint256 mixv, uint256 balance) {
        sum = a + b;
        mixv = PRXMath.mix(a, b);
        balance = balanceOf[msg.sender] + sum;
        if (balance > maxSupply) balance = maxSupply;
    }

`;

    case 1: // pure function with math operations
      return `    /// @notice pure function ${n} - mathematical operations
    function pure${n}(uint256 a) external pure returns (uint256 result, uint256 hash, uint256 exp) {
        result = PRXMath.mix(a, ${i});
        hash = PRXMath.hash256(result);
        exp = PRXMath.modExp(a, 3, 1000000);
    }

`;

    case 2: // payable function with events
      return `    /// @notice payable function ${n} - balance management
    function pay${n}() external payable notPaused returns (uint256 newBal, uint256 fee) {
        fee = msg.value / 100; // 1% fee
        newBal = balanceOf[msg.sender] += (msg.value - fee);
        totalSupply += (msg.value - fee);
        emit PRXDidThing(msg.sender, newBal, abi.encode(${i}, fee));
        emit PRXComputation(${i}, msg.value, newBal);
    }

`;

    case 3: // state changing function
      return `    /// @notice set kv ${n} - key-value storage
    function set${n}(bytes32 k, bytes32 v) external notPaused {
        bytes32 oldValue = kv[k];
        kv[k] = v;
        emit PRXStateChange(k, oldValue, v);
    }

`;

    case 4: // arithmetic with overflow checks
      return `    /// @notice arithmetic ${n} - safe math operations
    function fn${n}(uint256 a) external pure returns (uint256 result, bool overflow) {
        unchecked {
            result = a * ${i};
            overflow = result / ${i} != a && ${i} != 0;
        }
        if (overflow) result = type(uint256).max;
    }

`;

    case 5: // array manipulation
      return `    /// @notice array function ${n} - data processing
    function array${n}(uint256[] calldata data) external pure returns (uint256 sum, uint256 avg, uint256 max) {
        if (data.length == 0) return (0, 0, 0);
        sum = 0;
        max = data[0];
        for (uint256 j = 0; j < data.length; j++) {
            sum += data[j];
            if (data[j] > max) max = data[j];
        }
        avg = sum / data.length;
    }

`;

    case 6: // approval/allowance functions
      return `    /// @notice approval ${n} - allowance management
    function approve${n}(address spender, uint256 amount) external validAddress(spender) returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

`;

    case 7: // batch operations
      return `    /// @notice batch ${n} - multiple operations
    function batch${n}(address[] calldata targets, uint256[] calldata amounts) external view returns (uint256[] memory results) {
        if (targets.length != amounts.length) revert PRXBadInput(${i});
        results = new uint256[](targets.length);
        for (uint256 j = 0; j < targets.length; j++) {
            results[j] = balanceOf[targets[j]] + amounts[j];
        }
    }

`;

    case 8: // string/bytes operations
      return `    /// @notice string ${n} - data encoding
    function encode${n}(string calldata input) external pure returns (bytes32 hash, bytes memory encoded) {
        encoded = abi.encode(input, ${i});
        hash = keccak256(encoded);
    }

`;

    case 9: // time-based functions
      return `    /// @notice time ${n} - temporal calculations
    function time${n}(uint256 timestamp) external view returns (uint256 elapsed, uint256 future, bool expired) {
        elapsed = block.timestamp > timestamp ? block.timestamp - timestamp : 0;
        future = timestamp + ${i * 3600}; // add hours
        expired = block.timestamp > future;
    }

`;

    case 10: // nested mapping operations
      return `    /// @notice nested ${n} - complex data access
    function nested${n}(address user, address token) external view returns (uint256 balance, uint256 allowed, uint256 combined) {
        balance = balanceOf[user];
        allowed = allowance[user][token];
        combined = PRXMath.mix(balance, allowed);
    }

`;

    case 11: // conditional logic
      return `    /// @notice conditional ${n} - branching logic
    function conditional${n}(uint256 input) external pure returns (uint256 output, string memory category) {
        if (input < 100) {
            output = input * 2;
            category = "small";
        } else if (input < 1000) {
            output = input + ${i};
            category = "medium";
        } else {
            output = input / 2;
            category = "large";
        }
    }

`;

    default: // fallback to simple function
      return `    /// @notice function ${n} - basic operation
    function func${n}(uint256 a, uint256 b) external pure returns (uint256) {
        return PRXMath.mix(a + ${i}, b * ${i % 7 + 1});
    }

`;
  }
}

function footer(): string {
  const endComment = Array.from({ length: 64 })
    .map((_, i) => `    // Filler end line ${i + 1}: ensures source file exceeds target KB without affecting bytecode.`)
    .join("\n");
  return `
    // --- admin helpers ---
    function withdraw(address payable to) external onlyOwner {
        to.transfer(address(this).balance);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function transferOwnership(address newOwner) external onlyOwner validAddress(newOwner) {
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert PRXDenied();
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function emergencyWithdraw() external onlyOwner {
        paused = true;
        payable(owner).transfer(address(this).balance);
    }

    // Batch processing for testing
    function batchProcess(uint256[] calldata ids) external returns (uint256 processedCount) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (!processed[ids[i]]) {
                processed[ids[i]] = true;
                processedCount++;
            }
        }
    }

    // Complex view function for testing
    function getComplexState() external view returns (
        address contractOwner,
        uint256 contractBalance,
        uint256 supply,
        uint256 currentNonce,
        bool isPaused
    ) {
        contractOwner = owner;
        contractBalance = address(this).balance;
        supply = totalSupply;
        currentNonce = nonce;
        isPaused = paused;
    }

${endComment}
}
`;
}

function build(opts: Opts): string {
  let src = header(opts.name, opts.pragma);
  for (let i = 1; i <= opts.functions; i++) {
    src += genFn(i);
  }
  src += footer();
  return src;
}

function padToTarget(src: string, targetBytes: number): string {
  const cur = Buffer.byteLength(src, "utf8");
  if (cur >= targetBytes) return src;
  const deficit = targetBytes - cur;
  const line = "// padding to reach target KB for splitter tests - this line is repeated to meet size requirements\n";
  const repeats = Math.ceil(deficit / Buffer.byteLength(line, "utf8"));
  return src + "\n// === PADDING SECTION FOR SIZE TARGET ===\n" + line.repeat(repeats);
}

(function main() {
  const opts = parseArgs(process.argv);
  const dir = path.dirname(opts.out);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let sol = build(opts);
  sol = padToTarget(sol, opts.targetKb * 1024);
  fs.writeFileSync(opts.out, sol);
  const bytes = Buffer.byteLength(sol, "utf8");
  console.log(`✅ Generated ${opts.out}`);
  console.log(`📊 Size: ${bytes} bytes (~${(bytes / 1024).toFixed(1)}KB)`);
  console.log(`🔧 Functions: ${opts.functions}`);
  console.log(`📝 Contract: ${opts.name}`);
  console.log(`⚡ Ready for splitter and gate testing!`);
})();
