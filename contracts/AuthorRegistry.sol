// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAuthorRegistry.sol";

/// @title AuthorRegistry
/// @notice Реєстр авторизованих авторів краудфандингових кампаній
/// @dev Керується власником (Admin / Deployer) з використанням OpenZeppelin Ownable
contract AuthorRegistry is Ownable, IAuthorRegistry {
    /// @dev Помилка у разі передачі нульової адреси автора
    error ZeroAddress();

    /// @dev Помилка при спробі повторно верифікувати вже схваленого автора
    error AuthorAlreadyVerified(address account);

    /// @dev Помилка при спробі відкликати статус у неверифікованого автора
    error AuthorNotVerified(address account);

    /// @notice Мапінг дозволених авторів
    mapping(address => bool) public isAuthor;

    /// @notice Подія успішної верифікації автора
    /// @param author Адреса верифікованого автора
    /// @param admin Адреса адміністратора, який виконав операцію
    event AuthorVerified(address indexed author, address indexed admin);

    /// @notice Подія відкликання верифікації автора
    /// @param author Адреса автора, у якого відкликано статус
    /// @param admin Адреса адміністратора, який виконав операцію
    event AuthorRevoked(address indexed author, address indexed admin);

    /// @notice Конструктор реєстру авторів
    /// @param initialAdmin Адреса початкового адміністратора реєстру
    constructor(address initialAdmin) Ownable(initialAdmin) {
        if (initialAdmin == address(0)) {
            revert ZeroAddress();
        }
    }

    /// @notice Додавання адреси автора до білого списку
    /// @dev Доступно тільки адміністратору (onlyOwner)
    /// @param author Адреса автора, що додається
    function addAuthor(address author) external onlyOwner {
        if (author == address(0)) {
            revert ZeroAddress();
        }
        if (isAuthor[author]) {
            revert AuthorAlreadyVerified(author);
        }

        isAuthor[author] = true;
        emit AuthorVerified(author, msg.sender);
    }

    /// @notice Пакетне додавання авторів до білого списку
    /// @dev Доступно тільки адміністратору (onlyOwner)
    /// @param authors Масив адрес авторів
    function batchAddAuthors(address[] calldata authors) external onlyOwner {
        for (uint256 i = 0; i < authors.length; ++i) {
            address author = authors[i];
            if (author == address(0)) {
                revert ZeroAddress();
            }
            if (!isAuthor[author]) {
                isAuthor[author] = true;
                emit AuthorVerified(author, msg.sender);
            }
        }
    }

    /// @notice Відкликання прав автора та видалення з білого списку
    /// @dev Доступно тільки адміністратору (onlyOwner)
    /// @param author Адреса автора, що виключається
    function removeAuthor(address author) external onlyOwner {
        if (author == address(0)) {
            revert ZeroAddress();
        }
        if (!isAuthor[author]) {
            revert AuthorNotVerified(author);
        }

        isAuthor[author] = false;
        emit AuthorRevoked(author, msg.sender);
    }

    /// @notice Перевірка статусу верифікації автора
    /// @param account Адреса для перевірки
    /// @return true, якщо автор верифікований і присутній у білому списку
    function isVerified(address account) external view override returns (bool) {
        return isAuthor[account];
    }
}
