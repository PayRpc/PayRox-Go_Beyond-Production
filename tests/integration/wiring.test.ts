// test/integration/wiring.test.ts
import { expect } from "chai";
import { execSync } from "child_process";

describe("Integration wiring", () => {
  it("wiring validator passes", () => {
    const _out = execSync("npm run -s check:wire", { encoding: "utf8" });
    expect(out).to.match(/manifest parity OK/i);
  });
});
