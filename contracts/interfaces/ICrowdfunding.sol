// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICrowdfunding
/// @notice Інтерфейс основної платформи краудфандингу
interface ICrowdfunding {
    /// @notice Структура параметрів краудфандингової кампанії
    /// @param author Адреса творця кампанії
    /// @param goal Цільова сума збору у wei
    /// @param deadline Часова мітка (timestamp) завершення кампанії
    /// @param totalPledged Загальна сума зібраних коштів у wei
    /// @param claimed Прапорець виведення коштів автором
    struct Campaign {
        address author;
        uint256 goal;
        uint256 deadline;
        uint256 totalPledged;
        bool claimed;
    }

    /// @notice Створити нову краудфандингову кампанію
    /// @param goal Цільова сума збору у wei
    /// @param duration Тривалість кампанії у секундах
    /// @return campaignId Ідентифікатор створеної кампанії
    function createCampaign(uint256 goal, uint256 duration) external returns (uint256 campaignId);

    /// @notice Зробити внесок (ETH) в активну кампанію
    /// @param campaignId Ідентифікатор кампанії
    function pledge(uint256 campaignId) external payable;

    /// @notice Виведення коштів автором успішної кампанії
    /// @param campaignId Ідентифікатор кампанії
    function claim(uint256 campaignId) external;

    /// @notice Повернення коштів вкладником у разі провалу кампанії (патерн Pull)
    /// @param campaignId Ідентифікатор кампанії
    function claimRefund(uint256 campaignId) external;

    /// @notice Отримати дані кампанії за її ID
    /// @param campaignId Ідентифікатор кампанії
    /// @return Дані структури Campaign
    function getCampaign(uint256 campaignId) external view returns (Campaign memory);

    /// @notice Порційне читання (пагінація) списку кампаній
    /// @param offset Початковий індекс вибірки
    /// @param limit Максимальна кількість записів, що повертаються
    /// @return result Масив структур кампаній
    /// @return total Загальна кількість існуючих кампаній
    function getCampaigns(uint256 offset, uint256 limit) external view returns (Campaign[] memory result, uint256 total);
}
