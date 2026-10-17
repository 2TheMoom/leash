// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Standard 6-decimal mock ERC-20 with public mint/burn.
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/// @dev ERC-20 that reverts transfer / transferFrom to a specific blocked address.
contract BlocklistMockERC20 is ERC20 {
    uint8 private _decimals;
    address public blockedAddress;

    error Blocklisted();

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address blocked_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
        blockedAddress = blocked_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    /// @dev Override the internal _update hook to enforce blocklist.
    function _update(address from, address to, uint256 value) internal override {
        if (to == blockedAddress) revert Blocklisted();
        super._update(from, to, value);
    }
}
