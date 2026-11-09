// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import { Script, console } from "forge-std/Script.sol";
import { Token } from "../src/Token.sol";
import { BridgeETH } from "../src/BridgeETH.sol";

contract DeployETH is Script {
    function run() external returns (Token token, BridgeETH bridgeEth) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy native Token (TK) on Ethereum
        token = new Token();

        // 2. Deploy BridgeETH linked to Token
        bridgeEth = new BridgeETH(address(token));

        // 3. Mint initial 1,000 TK to deployer for testing
        token.mint(deployer, 1000 * 10 ** 18);

        vm.stopBroadcast();

        console.log("Deployer / Relayer Owner:", deployer);
        console.log("Token (TK) deployed at:  ", address(token));
        console.log("BridgeETH deployed at:   ", address(bridgeEth));
    }
}