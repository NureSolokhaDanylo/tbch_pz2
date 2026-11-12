// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Crowdfunding.sol";

/// @title CrowdfundingVulnerable
/// @notice Вразлива версія контракту Crowdfunding для навчальної демонстрації атаки Reentrancy
/// @dev У функції vulnerableClaimRefund навмисно порушено патерн Checks-Effects-Interactions (CEI)
contract CrowdfundingVulnerable is Crowdfunding {
    constructor(
        address _authorRegistry,
        address _rewardToken,
        address _admin
    ) Crowdfunding(_authorRegistry, _rewardToken, _admin) {}

    /// @notice Вразлива функція повернення коштів
    /// @dev Порушення CEI: зовнішній виклик call (Interactions) виконується ДО обнулення балансу (Effects)
    /// @param campaignId Ідентифікатор кампанії
    function vulnerableClaimRefund(uint256 campaignId)
        external
        whenNotPaused
        campaignExists(campaignId)
    {
        Campaign storage campaign = campaigns[campaignId];

        // 1. CHECKS
        if (block.timestamp < campaign.deadline) {
            revert DeadlineNotPassed(campaign.deadline, block.timestamp);
        }
        if (campaign.totalPledged >= campaign.goal) {
            revert GoalAlreadyReached(campaign.totalPledged, campaign.goal);
        }

        uint256 refundAmount = contributions[campaignId][msg.sender];
        if (refundAmount == 0) {
            revert NoContribution();
        }

        // 2. INTERACTIONS (ПОРУШЕННЯ CEI: надсилання коштів ДО оновлення стану)
        (bool success, ) = msg.sender.call{value: refundAmount}("");
        if (!success) {
            revert TransferFailed();
        }

        // 3. EFFECTS (Обнулення виконується ПІСЛЯ зовнішнього виклику, коли повторний вхід уже відбувся)
        contributions[campaignId][msg.sender] = 0;
        emit Refunded(campaignId, msg.sender, refundAmount);
    }
}
