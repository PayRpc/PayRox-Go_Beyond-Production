// tasks/payrox-preflight.ts
import { task, types } from "hardhat/config";
import { Interface } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

task("payrox:preflight", "Run PayRox safety battery")
  .addParam("dispatcher", "Address of the ManifestDispatcher contract")
  .addParam("factory", "Address of the ChunkFactory contract")
  .addOptionalParam("verbose", "Enable verbose logging", false, types.boolean)
  .setAction(async ({ dispatcher, factory, verbose }, hre: HardhatRuntimeEnvironment) => {
    console.log("🔍 PayRox Preflight Safety Check");
    console.log("================================");
    
    try {
      // Connect to contracts
      const d = await hre.ethers.getContractAt("IManifestDispatcher", dispatcher);
      const f = await hre.ethers.getContractAt("IChunkFactory", factory);

      if (verbose) {
        console.log(`📡 Dispatcher: ${dispatcher}`);
        console.log(`🏭 Factory: ${factory}`);
      }

      // Check core system state
      console.log("\n1️⃣ System State Check");
      const [root, epoch, frozen, delay] = await Promise.all([
        d.activeRoot(),
        d.activeEpoch(), 
        d.frozen(),
        d.activationDelay()
      ]);

      console.log({
        root: root,
        epoch: epoch.toString(),
        frozen: frozen,
        delay: delay.toString() + "s"
      });

      if (frozen) {
        console.log("⚠️  WARNING: System is frozen");
      }

      // Check factory integrity
      console.log("\n2️⃣ Factory Integrity Check");
      const ok = await f.verifySystemIntegrity();
      if (!ok) {
        throw new Error("❌ System integrity check failed");
      }
      console.log("✅ Factory integrity verified");

      // Check route selector count via Diamond Loupe
      console.log("\n3️⃣ Route Selector Audit");
      const loupe = new Interface([
        "function facetAddresses() view returns (address[])",
        "function facetFunctionSelectors(address) view returns (bytes4[])"
      ]);
      
      const dl = new hre.ethers.Contract(dispatcher, loupe, hre.ethers.provider);
      const facetAddresses: string[] = await dl.facetAddresses();
      
      let totalSelectors = 0;
      const facetDetails: Array<{address: string, selectorCount: number}> = [];
      
      for (const facetAddress of facetAddresses) {
        const selectors = await dl.facetFunctionSelectors(facetAddress);
        totalSelectors += selectors.length;
        facetDetails.push({
          address: facetAddress,
          selectorCount: selectors.length
        });
        
        if (verbose) {
          console.log(`  📍 ${facetAddress}: ${selectors.length} selectors`);
        }
      }
      
      console.log(`📊 Total facets: ${facetAddresses.length}`);
      console.log(`📊 Total selectors: ${totalSelectors}`);

      // Additional checks
      console.log("\n4️⃣ Additional Safety Checks");
      
      // Check if we can query a basic route
      try {
        const testSelector = "0x8da5cb5b"; // owner() selector
        const route = await d.routes(testSelector);
        if (verbose) {
          console.log(`🧪 Test route ${testSelector}:`, route);
        }
        console.log("✅ Route query functionality working");
      } catch (e) {
        console.log("⚠️  Route query test failed (may be expected)");
      }

      console.log("\n🎉 PayRox Preflight Check Complete!");
      console.log("====================================");
      
    } catch (error) {
      console.error("\n❌ Preflight Check Failed!");
      console.error("===========================");
      console.error(error);
      process.exit(1);
    }
  });

// Additional utility task for quick health check
task("payrox:health", "Quick health check for PayRox system")
  .addParam("dispatcher", "Address of the ManifestDispatcher contract")
  .setAction(async ({ dispatcher }, hre: HardhatRuntimeEnvironment) => {
    const d = await hre.ethers.getContractAt("IManifestDispatcher", dispatcher);
    
    const [frozen, epoch] = await Promise.all([
      d.frozen(),
      d.activeEpoch()
    ]);
    
    console.log(`🏥 Health: ${frozen ? "FROZEN" : "ACTIVE"} | Epoch: ${epoch}`);
  });

// Export for potential reuse
export {};
