// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LeashVault} from "./LeashVault.sol";

contract LeashFactory {
    error ZeroUSDC();

    event VaultCreated(address indexed owner, address indexed vault);

    address public immutable usdc;
    mapping(address => address[]) private _vaultsOf;

    constructor(address usdc_) {
        if (usdc_ == address(0)) {
            revert ZeroUSDC();
        }
        usdc = usdc_;
    }

    /// @notice Deploys a new vault owned by the caller.
    /// @param autoReleaseDelay Auto-release delay in seconds for queued payments.
    /// @return vault Address of the deployed vault.
    function createVault(uint32 autoReleaseDelay) external returns (address vault) {
        vault = address(new LeashVault(msg.sender, usdc, autoReleaseDelay));
        _vaultsOf[msg.sender].push(vault);

        emit VaultCreated(msg.sender, vault);
    }

    /// @notice Returns all vault addresses created by an owner.
    /// @param owner Vault owner address.
    /// @return vaults Array of vault addresses.
    function vaultsOf(address owner) external view returns (address[] memory vaults) {
        return _vaultsOf[owner];
    }
}
