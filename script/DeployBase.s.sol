// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import { Script, console } from "forge-std/Script.sol";
import { WToken } from "../src/WToken.sol";
import { BridgeBase } from "../src/BridgeBase.sol";

contract DeployBase is Script {
    function run() external returns (WToken wToken, BridgeBase bridgeBase) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Wrapped Token (WTK) on Base
        wToken = new WToken();

        // 2. Deploy BridgeBase linked to WToken
        bridgeBase = new BridgeBase(address(wToken));

        // 3. Transfer WToken ownership to BridgeBase so it can mint and burn
        wToken.transferOwnership(address(bridgeBase));

        vm.stopBroadcast();

        console.log("Deployer / Relayer Owner:", deployer);
        console.log("WToken (WTK) deployed at:", address(wToken));
        console.log("BridgeBase deployed at:  ", address(bridgeBase));
        console.log("WToken owner set to:     ", wToken.owner());
    }
}