import {
  stripComments,
  findContractInfo,
  extractFunctions,
} from "../split-facet";

describe("split-facet helpers", () => {
  test("stripComments preserves code and removes comments", () => {
    const src = `// a comment\npragma solidity ^0.8.0; /* block */\ncontract X {}`;
    const out = stripComments(src);
    expect(out).toContain("pragma solidity");
    expect(out).not.toContain("/* block */");
  });

  test("strings-with-braces: does not mis-balance braces inside strings", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { function f() public { string memory s = "hello { world }"; } }`;
    const info = findContractInfo(stripComments(src));
    expect(info).not.toBeNull();
    const fns = extractFunctions(info!.body);
    expect(fns.map((f) => f.name)).toContain("f");
  });

  test("multiple contracts: find first or named contract when specified", () => {
    const src = `pragma solidity ^0.8.0;\ncontract A { function a() public {} }\ncontract B { function b() public {} }`;
    const cleaned = stripComments(src);
    const first = findContractInfo(cleaned);
    expect(first).not.toBeNull();
    expect(first!.contractName).toBe("A");
    const named = findContractInfo(cleaned, "B");
    expect(named).not.toBeNull();
    expect(named!.contractName).toBe("B");
  });

  test("constructor/fallback/receive detection", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { constructor() public {} fallback() external {} receive() external payable {} }`;
    const info = findContractInfo(stripComments(src));
    const fns = extractFunctions(info!.body);
    const names = fns.map((f) => f.name);
    expect(names).toContain("constructor");
    expect(names).toContain("fallback");
    expect(names).toContain("receive");
  });

  test("virtual/override preservation in signature", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { function f() public virtual returns (uint) {} function g() public override(C) {} }`;
    const info = findContractInfo(stripComments(src));
    const fns = extractFunctions(info!.body);
    const sigs = fns.map((f) => f.signature);
    expect(sigs.some((s) => /virtual/.test(s))).toBeTruthy();
    expect(sigs.some((s) => /override/.test(s))).toBeTruthy();
  });

  test("no functions found case", () => {
    const src = `pragma solidity ^0.8.0;\ncontract C { uint x; }`;
    const info = findContractInfo(stripComments(src));
    const fns = extractFunctions(info!.body);
    expect(fns.length).toBe(0);
  });
});
