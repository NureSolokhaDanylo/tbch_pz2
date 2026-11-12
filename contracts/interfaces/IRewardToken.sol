// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IRewardToken
/// @notice Інтерфейс службового токена винагород вкладників
interface IRewardToken is IERC20 {
    /// @notice Емісія токенів винагороди вкладнику
    /// @param to Адреса отримувача токенів
    /// @param amount Кількість токенів для нарахування
    function mint(address to, uint256 amount) external;
}
