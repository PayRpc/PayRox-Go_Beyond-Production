import { expect } from "chai";
import {
  stripComments,
  findContractInfo,
  extractFunctions,
} from "../../../tools/splitter/split-facet";

describe("split-facet helpers (moved into tests/ for discovery)", () => {
  it("stripComments preserves code and removes comments", () => {
    const src = `// a comment\npragma solidity ^0.8.0; /* block */\ncontract X {}`;
    const out = stripComments(src);
    expect(out).to.contain("pragma solidity");
    expect(out).to.not.contain("/* block */");
  });

  it("strings-with-braces: does not mis-balance braces inside strings", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { function f() public { string memory s = "hello { world }"; } }`;
    const info = findContractInfo(stripComments(src));
    expect(info).to.not.be.null;
    const fns = extractFunctions(info!.body);
    expect(fns.map((f) => f.name)).to.contain("f");
  });

  it("multiple contracts: find first or named contract when specified", () => {
    const src = `pragma solidity ^0.8.0;\ncontract A { function a() public {} }\ncontract B { function b() public {} }`;
    const cleaned = stripComments(src);
    const first = findContractInfo(cleaned);
    expect(first).to.not.be.null;
    expect(first!.contractName).to.equal("A");
    const named = findContractInfo(cleaned, "B");
    expect(named).to.not.be.null;
    expect(named!.contractName).to.equal("B");
  });

  it("constructor/fallback/receive detection", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { constructor() public {} fallback() external {} receive() external payable {} }`;
    const info = findContractInfo(stripComments(src));
    const fns = extractFunctions(info!.body);
    const names = fns.map((f) => f.name);
    expect(names).to.contain("constructor");
    expect(names).to.contain("fallback");
    expect(names).to.contain("receive");
  });

  it("virtual/override preservation in signature", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { function f() public virtual returns (uint) {} function g() public override(C) {} }`;
    const info = findContractInfo(stripComments(src));
    const fns = extractFunctions(info!.body);
    const sigs = fns.map((f) => f.signature);
    expect(sigs.some((s) => /virtual/.test(s))).to.be.true;
    expect(sigs.some((s) => /override/.test(s))).to.be.true;
  });

  it("no functions found case", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { uint x; }`;
    const info = findContractInfo(stripComments(src));
    const fns = extractFunctions(info!.body);
    expect(fns.length).to.equal(0);
  });
});
