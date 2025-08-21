#!/usr/bin/env ts-node
import fs from "fs";
import path from "path";

const rawName = process.argv[2];
if (!rawName) {
  console.error("Usage: new-facet <Name>  (e.g., new-facet Payments)");
  process.exit(1);
}

// Sanitize & derive names/slot
const FacetName = rawName.replace(/[^A-Za-z0-9_]/g, "");
const facetSlot = FacetName.toLowerCase();

function write(outPath: string, content: string) {
  const fp = path.join(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(
    fp,
    content.replaceAll("{{FacetName}}", FacetName)
           .replaceAll("{{facet_slot}}", facetSlot),
    "utf8"
  );
  console.log("✔", outPath);
}

// ---- TEMPLATES ----
const ifaceTpl = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface I{{FacetName}}Facet {
    event {{FacetName}}Initialized(address operator);
    event {{FacetName}}ConfigSet(uint256 newValue, address indexed by);

    function initialize{{FacetName}}(address operator) external;
    function setConfig(uint256 newValue) external;
    function getConfig() external view returns (uint256);

    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors);
}
`;

const libTpl = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library {{FacetName}}Storage {
    bytes32 internal constant SLOT = keccak256("payrox.facets.{{facet_slot}}.v1");

    struct Layout {
        bool initialized;
        address operator;
        uint256 config;
        uint256 ops;
        address lastCaller;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SLOT;
        assembly { l.slot := slot }
    }
}
`;

const facetTpl = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { PayRoxAccessControlStorage as ACS } from "../libraries/PayRoxAccessControlStorage.sol";
import { PayRoxPauseStorage as PS } from "../libraries/PayRoxPauseStorage.sol";
import { I{{FacetName}}Facet } from "../interfaces/I{{FacetName}}Facet.sol";
import { {{FacetName}}Storage as S } from "../libraries/{{FacetName}}Storage.sol";

contract {{FacetName}}Facet is I{{FacetName}}Facet {
    /* Errors */
    error Paused();
    error NotAdmin();
    error NotOperator();
    error AlreadyInitialized();
    error ZeroAddress();

    /* Optional role key (handy if you expand beyond operator) */
    bytes32 public constant OPERATOR_ROLE = keccak256("{{FacetName}}_OPERATOR");

    /* Modifiers */
    modifier whenNotPaused() {
        if (PS.layout().paused) revert Paused();
        _;
    }

    modifier onlyAdmin() {
        if (!ACS.layout().roles[ACS.DEFAULT_ADMIN_ROLE][msg.sender]) revert NotAdmin();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != S.layout().operator) revert NotOperator();
        _;
    }

    /* Init (one-time, diamond-safe) */
    function initialize{{FacetName}}(address operator) external onlyAdmin {
        if (operator == address(0)) revert ZeroAddress();
        S.Layout storage l = S.layout();
        if (l.initialized) revert AlreadyInitialized();
        l.initialized = true;
        l.operator = operator;
        emit {{FacetName}}Initialized(operator);
    }

    /* Core API */
    function setConfig(uint256 newValue) external whenNotPaused onlyOperator {
        S.Layout storage l = S.layout();
        l.config = newValue;
        unchecked { l.ops += 1; }
        l.lastCaller = msg.sender;
        emit {{FacetName}}ConfigSet(newValue, msg.sender);
    }

    function getConfig() external view returns (uint256) {
        return S.layout().config;
    }

    function getState()
        external
        view
        returns (uint256 config, uint256 ops, address operator, address lastCaller, bool paused)
    {
        S.Layout storage l = S.layout();
        return (l.config, l.ops, l.operator, l.lastCaller, PS.layout().paused);
    }

    /* ERC-165 */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 /* ERC165 */ ||
               interfaceId == type(I{{FacetName}}Facet).interfaceId;
    }

    /* Facet metadata for manifest/loupe tooling */
    function getFacetInfo()
        external
        pure
        returns (string memory name, string memory version, bytes4[] memory selectors)
    {
        name = "{{FacetName}}Facet";
        version = "1.0.0";
        selectors = new bytes4[](5);
        selectors[0] = this.initialize{{FacetName}}.selector;
        selectors[1] = this.setConfig.selector;
        selectors[2] = this.getConfig.selector;
        selectors[3] = this.getState.selector;
        selectors[4] = this.getFacetInfo.selector;
    }
}
`;

// ---- WRITE FILES ----
write(`contracts/interfaces/I${FacetName}Facet.sol`, ifaceTpl);
write(`contracts/libraries/${FacetName}Storage.sol`, libTpl);
write(`contracts/facets/${FacetName}Facet.sol`, facetTpl);

console.log(`\nDone. Next:
- Compile:        npm run compile
- Route selectors: see scripts/manifest/add-facet-routes.ts
- Initialize:     npx hardhat facet:init --name ${FacetName} --operator <EOA> --diamond <DiamondAddress>\n`);
