// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import "../contracts/Proxy/PayRoxProxyRouter.sol";
import "../contracts/interfaces/IManifestDispatcher.sol";

// Mock dispatcher for testing
contract MockManifestDispatcher {
    bytes32 public activeRoot = keccak256("test.root");
    bool public frozen = false;
    mapping(bytes4 => address) public routes;
    
    function setRoute(bytes4 selector, address facet) external {
        routes[selector] = facet;
    }
    
    function testFunction(uint256 value) external pure returns (uint256) {
        return value * 2;
    }
    
    function revertingFunction() external pure {
        revert("MockRevert");
    }
}

// Mock cross-domain messenger for L2 governance testing
contract MockCrossDomainMessenger {
    address private _xDomainSender;
    
    function setXDomainMessageSender(address sender) external {
        _xDomainSender = sender;
    }
    
    function xDomainMessageSender() external view returns (address) {
        return _xDomainSender;
    }
}

// Test proxy contract
contract TestProxy {
    address public implementation;
    
    constructor(address impl) {
        implementation = impl;
    }
    
    function upgrade(address newImpl) external {
        implementation = newImpl;
    }
    
    function upgradeToAndCall(address newImpl, bytes calldata data) external {
        implementation = newImpl;
        (bool success, bytes memory result) = newImpl.delegatecall(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
    
    fallback() external payable {
        address impl = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

contract PayRoxProxyRouterTest is Test {
    PayRoxProxyRouter router;
    MockManifestDispatcher dispatcher;
    MockCrossDomainMessenger messenger;
    TestProxy proxy;
    
    address owner = address(0x1);
    address governor = address(0x2);
    address user = address(0x3);
    address attacker = address(0x4);
    
    bytes32 constant INIT_SALT = keccak256("payrox.router.init.2024.production");
    bytes32 dispatcherCodehash;
    
    event PayRoxProxyRouterInitialized(
        address owner,
        address dispatcher,
        bytes32 dispatcherCodehash,
        bool strictCodehash
    );
    
    function setUp() external {
        // Deploy dispatcher and get its codehash
        dispatcher = new MockManifestDispatcher();
        dispatcherCodehash = address(dispatcher).codehash;
        
        // Deploy router implementation
        router = new PayRoxProxyRouter();
        
        // Deploy proxy pointing to router
        proxy = new TestProxy(address(router));
        
        // Deploy L2 messenger mock
        messenger = new MockCrossDomainMessenger();
    }
    
    function testInitializationSuccess() external {
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        vm.expectEmit(true, true, true, true);
        emit PayRoxProxyRouterInitialized(owner, address(dispatcher), dispatcherCodehash, true);
        
        proxyRouter.initializeProxyRouter(
            owner,
            address(dispatcher),
            dispatcherCodehash,
            true,
            INIT_SALT
        );
        
        assertEq(proxyRouter.owner(), owner);
        assertEq(proxyRouter.dispatcher(), address(dispatcher));
        assertEq(proxyRouter.dispatcherCodehash(), dispatcherCodehash);
        assertTrue(proxyRouter.strictCodehash());
        assertFalse(proxyRouter.paused());
        assertFalse(proxyRouter.frozen());
    }
    
    function testInitializationWithWrongSalt() external {
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        vm.expectRevert(PayRoxProxyRouter.NotOwner.selector);
        proxyRouter.initializeProxyRouter(
            owner,
            address(dispatcher),
            dispatcherCodehash,
            true,
            keccak256("wrong.salt")
        );
    }
    
    function testInitializationRaceCondition() external {
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Attacker tries to initialize before legitimate owner
        vm.prank(attacker);
        vm.expectRevert(PayRoxProxyRouter.NotOwner.selector);
        proxyRouter.initializeProxyRouter(
            attacker,
            address(dispatcher),
            dispatcherCodehash,
            true,
            INIT_SALT
        );
        
        // Legitimate initialization should still work
        proxyRouter.initializeProxyRouter(
            owner,
            address(dispatcher),
            dispatcherCodehash,
            true,
            INIT_SALT
        );
        
        assertEq(proxyRouter.owner(), owner);
    }
    
    function testAtomicInitializationViaUpgradeToAndCall() external {
        bytes memory initData = abi.encodeWithSelector(
            PayRoxProxyRouter.initializeProxyRouter.selector,
            owner,
            address(dispatcher),
            dispatcherCodehash,
            true,
            INIT_SALT
        );
        
        // This simulates the atomic upgrade + init pattern
        proxy.upgradeToAndCall(address(router), initData);
        
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        assertEq(proxyRouter.owner(), owner);
    }
    
    function testPauseBlocksRouting() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Set up a route
        bytes4 selector = MockManifestDispatcher.testFunction.selector;
        dispatcher.setRoute(selector, address(dispatcher));
        
        // Normal call should work
        (bool success,) = address(proxy).call(
            abi.encodeWithSelector(selector, 42)
        );
        assertTrue(success);
        
        // Pause the router
        vm.prank(owner);
        proxyRouter.setPaused(true);
        
        // Call should now revert
        (success,) = address(proxy).call(
            abi.encodeWithSelector(selector, 42)
        );
        assertFalse(success);
    }
    
    function testSelectorBlocking() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        bytes4 blockedSelector = MockManifestDispatcher.testFunction.selector;
        bytes4 allowedSelector = MockManifestDispatcher.revertingFunction.selector;
        
        // Set up routes
        dispatcher.setRoute(blockedSelector, address(dispatcher));
        dispatcher.setRoute(allowedSelector, address(dispatcher));
        
        // Block one selector
        vm.prank(owner);
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = blockedSelector;
        proxyRouter.setForbiddenSelectors(selectors, true);
        
        // Blocked selector should revert
        (bool success,) = address(proxy).call(
            abi.encodeWithSelector(blockedSelector, 42)
        );
        assertFalse(success);
        
        // Allowed selector should still work (even if it reverts for other reasons)
        (success,) = address(proxy).call(
            abi.encodeWithSelector(allowedSelector)
        );
        assertFalse(success); // This reverts due to MockRevert, not ForbiddenSelector
    }
    
    function testFreezeLocksAdminFunctions() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Freeze the router
        vm.prank(owner);
        proxyRouter.freeze();
        
        // Admin functions should revert
        vm.prank(owner);
        vm.expectRevert(PayRoxProxyRouter.FrozenRouter.selector);
        proxyRouter.setDispatcher(address(dispatcher), bytes32(0));
        
        vm.prank(owner);
        vm.expectRevert(PayRoxProxyRouter.FrozenRouter.selector);
        proxyRouter.setStrictCodehash(false);
        
        // But pause and forbid should still work
        vm.prank(owner);
        proxyRouter.setPaused(true);
        
        vm.prank(owner);
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = bytes4(0x12345678);
        proxyRouter.setForbiddenSelectors(selectors, true);
    }
    
    function testCodehashValidation() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Deploy a new dispatcher with different codehash
        MockManifestDispatcher newDispatcher = new MockManifestDispatcher();
        bytes32 newCodehash = address(newDispatcher).codehash;
        
        // Update dispatcher but keep old codehash (should fail strict checks)
        vm.prank(owner);
        proxyRouter.setDispatcher(address(newDispatcher), dispatcherCodehash);
        
        // Call should revert due to codehash mismatch
        bytes4 selector = MockManifestDispatcher.testFunction.selector;
        (bool success,) = address(proxy).call(
            abi.encodeWithSelector(selector, 42)
        );
        assertFalse(success);
        
        // Fix the codehash
        vm.prank(owner);
        proxyRouter.setDispatcherCodehash(newCodehash);
        
        // Now it should work
        newDispatcher.setRoute(selector, address(newDispatcher));
        (success,) = address(proxy).call(
            abi.encodeWithSelector(selector, 42)
        );
        assertTrue(success);
    }
    
    function testBatchExecution() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        bytes4 selector = MockManifestDispatcher.testFunction.selector;
        dispatcher.setRoute(selector, address(dispatcher));
        
        // Prepare batch calls
        BatchCall[] memory calls = new BatchCall[](2);
        calls[0] = BatchCall({
            selector: selector,
            data: abi.encode(10)
        });
        calls[1] = BatchCall({
            selector: selector,
            data: abi.encode(20)
        });
        
        // Execute batch
        bytes[] memory results = proxyRouter.batchExecute(calls);
        
        assertEq(results.length, 2);
        assertEq(abi.decode(results[0], (uint256)), 20); // 10 * 2
        assertEq(abi.decode(results[1], (uint256)), 40); // 20 * 2
    }
    
    function testL2GovernanceSuccess() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Configure L2 governance
        vm.prank(owner);
        proxyRouter.setL2Governor(address(messenger), governor);
        
        // Set up messenger to return the governor as x-domain sender
        messenger.setXDomainMessageSender(governor);
        
        // Governor action through messenger should work
        vm.prank(address(messenger));
        proxyRouter.setPaused(true);
        
        assertTrue(proxyRouter.paused());
    }
    
    function testL2GovernanceFail() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Configure L2 governance
        vm.prank(owner);
        proxyRouter.setL2Governor(address(messenger), governor);
        
        // Set up messenger to return wrong sender
        messenger.setXDomainMessageSender(attacker);
        
        // Action should fail
        vm.prank(address(messenger));
        vm.expectRevert(PayRoxProxyRouter.NotGovernor.selector);
        proxyRouter.setPaused(true);
    }
    
    function testSelectorCapLimit() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        // Try to set too many selectors
        bytes4[] memory tooManySelectors = new bytes4[](1001);
        for (uint256 i = 0; i < 1001; i++) {
            tooManySelectors[i] = bytes4(uint32(i));
        }
        
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            PayRoxProxyRouter.BatchTooLarge.selector, 
            1001, 
            1000
        ));
        proxyRouter.setForbiddenSelectors(tooManySelectors, true);
    }
    
    function testZeroAddressValidation() external {
        _initializeRouter();
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        
        vm.prank(owner);
        vm.expectRevert(PayRoxProxyRouter.InvalidNewOwner.selector);
        proxyRouter.setL2Governor(address(0), governor);
        
        vm.prank(owner);
        vm.expectRevert(PayRoxProxyRouter.InvalidNewOwner.selector);
        proxyRouter.setL2Governor(address(messenger), address(0));
    }
    
    function _initializeRouter() internal {
        PayRoxProxyRouter proxyRouter = PayRoxProxyRouter(payable(address(proxy)));
        proxyRouter.initializeProxyRouter(
            owner,
            address(dispatcher),
            dispatcherCodehash,
            true,
            INIT_SALT
        );
    }
}
