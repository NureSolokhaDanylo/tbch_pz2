// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRewardToken.sol";

/// @title RewardToken
/// @notice ERC-20 токен винагороди для учасників краудфандингових зборів
/// @dev Успадковує OpenZeppelin ERC20 та Ownable. Власником призначається контракт Crowdfunding.
contract RewardToken is ERC20, Ownable, IRewardToken {
    /// @dev Помилка у разі передачі нульової адреси отримувача
    error ZeroAddress();

    /// @dev Помилка при спробі випустити 0 токенів
    error ZeroAmount();

    /// @notice Подія мінтингу токенів вкладнику
    /// @param to Адреса отримувача
    /// @param amount Кількість випущених токенів
    event RewardMinted(address indexed to, uint256 amount);

    /// @notice Ініціалізація токена з назвою, символом та початковим власником
    /// @param initialOwner Адреса початкового власника (контракт Crowdfunding або деплоєр із наступною передачею)
    constructor(address initialOwner) ERC20("Crowd Reward Token", "CRT") Ownable(initialOwner) {
        if (initialOwner == address(0)) {
            revert ZeroAddress();
        }
    }

    /// @notice Емісія токенів винагороди вкладнику
    /// @dev Доступна виключно власнику контракту (контракту Crowdfunding)
    /// @param to Адреса отримувача токенів
    /// @param amount Кількість токенів для нарахування
    function mint(address to, uint256 amount) external override onlyOwner {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        _mint(to, amount);
        emit RewardMinted(to, amount);
    }
}
