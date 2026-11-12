// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAuthorRegistry
/// @notice Інтерфейс реєстру верифікованих авторів краудфандингових кампаній
interface IAuthorRegistry {
    /// @notice Перевірка статусу верифікації автора
    /// @param account Адреса для перевірки
    /// @return true, якщо автор верифікований адміністратором
    function isVerified(address account) external view returns (bool);
}
