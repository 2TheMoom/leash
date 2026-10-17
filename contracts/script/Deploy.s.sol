// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LeashFactory} from "../LeashFactory.sol";

/// @dev Deploys LeashFactory with the Arc USDC address (same on testnet and mainnet).
///      Run with:
///        forge script contracts/script/Deploy.s.sol --broadcast --rpc-url <RPC>
