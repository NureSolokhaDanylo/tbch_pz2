// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IAuthorRegistry.sol";
import "./interfaces/IRewardToken.sol";

/// @title CrowdfundingOptimized
/// @notice Оптимізована за газом версія краудфандингової платформи
/// @dev Застосовано оптимізації пакування слотів зберігання (Storage Packing) та кешування storage у memory
contract CrowdfundingOptimized is Ownable, Pausable {
    // --- ПОМИЛКИ (Custom Errors) ---
    error ZeroAddress();
    error NotVerifiedAuthor(address caller);
    error ZeroGoal();
    error ZeroDuration();
    error CampaignDoesNotExist(uint256 campaignId);
    error CampaignEnded(uint64 deadline, uint256 currentTimestamp);
    error ZeroContribution();
    error DeadlineNotPassed(uint64 deadline, uint256 currentTimestamp);
    error GoalNotReached(uint128 totalPledged, uint128 goal);
    error GoalAlreadyReached(uint128 totalPledged, uint128 goal);
    error AlreadyClaimed();
    error OnlyCampaignAuthor(address expected, address caller);
    error NoContribution();
    error TransferFailed();
    error AmountExceedsLimit();

    // =========================================================================
    // ОПТИМІЗАЦІЯ 1: Storage Packing (Пакування змінних структури)
    // У базовому контрактi кожна змiнна uint256/address займала окремий
    // 32-байтний слот (разом 5 слотiв SSTORE = ~100,000 газу при першому записi).
    // Тут змiннi упакованi суворо за специфiкацiєю:
    // - Слот 0: address author (20 байт) + bool claimed (1 байт) = 21 байт <= 32
    // - Слот 1: uint128 goal (16 байт) + uint128 totalPledged (16 байт) = 32 байти
    // - Слот 2: uint64 deadline (8 байт) <= 32 байти
    // Разом 3 слоти замiсть 5 — пряма економiя 40,000 газу (2 холоднi SSTORE)!
    // =========================================================================
    struct Campaign {
        // --- Слот 0 (21 / 32 байт) ---
        address author;
        bool claimed;

        // --- Слот 1 (32 / 32 байт) ---
        uint128 goal;
        uint128 totalPledged;

        // --- Слот 2 (8 / 32 байт) ---
        uint64 deadline;
    }

    // --- ПОДІЇ ---
    event CampaignCreated(uint256 indexed campaignId, address indexed author, uint128 goal, uint64 deadline);
    event Pledged(uint256 indexed campaignId, address indexed contributor, uint256 amount);
    event Claimed(uint256 indexed campaignId, address indexed author, uint256 totalAmount);
    event Refunded(uint256 indexed campaignId, address indexed contributor, uint256 amount);

    IAuthorRegistry public immutable authorRegistry;
    IRewardToken public immutable rewardToken;
    uint256 public campaignCount;

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public contributions;

    modifier campaignExists(uint256 campaignId) {
        if (campaignId == 0 || campaignId > campaignCount) {
            revert CampaignDoesNotExist(campaignId);
        }
        _;
    }

    constructor(
        address _authorRegistry,
        address _rewardToken,
        address _admin
    ) Ownable(_admin) {
        if (_authorRegistry == address(0) || _rewardToken == address(0) || _admin == address(0)) {
            revert ZeroAddress();
        }
        authorRegistry = IAuthorRegistry(_authorRegistry);
        rewardToken = IRewardToken(_rewardToken);
    }

    /// @notice Створення кампанії з оптимізованим пакуванням даних у слоти зберігання
    function createCampaign(uint128 goal, uint64 duration)
        external
        whenNotPaused
        returns (uint256 campaignId)
    {
        if (!authorRegistry.isVerified(msg.sender)) {
            revert NotVerifiedAuthor(msg.sender);
        }
        if (goal == 0) {
            revert ZeroGoal();
        }
        if (duration == 0) {
            revert ZeroDuration();
        }

        unchecked {
            campaignId = ++campaignCount;
        }

        uint64 deadline = uint64(block.timestamp) + duration;

        // Запис в упаковані слоти
        campaigns[campaignId] = Campaign({
            author: msg.sender,
            claimed: false,
            goal: goal,
            totalPledged: 0,
            deadline: deadline
        });

        emit CampaignCreated(campaignId, msg.sender, goal, deadline);
    }

    /// @notice Оптимізований внесок коштів з unchecked-арифметикою
    function pledge(uint256 campaignId)
        external
        payable
        whenNotPaused
        campaignExists(campaignId)
    {
        if (msg.value == 0) {
            revert ZeroContribution();
        }
        if (msg.value > type(uint128).max) {
            revert AmountExceedsLimit();
        }

        Campaign storage campaign = campaigns[campaignId];

        if (block.timestamp >= campaign.deadline) {
            revert CampaignEnded(campaign.deadline, block.timestamp);
        }

        unchecked {
            campaign.totalPledged += uint128(msg.value);
            contributions[campaignId][msg.sender] += msg.value;
        }

        rewardToken.mint(msg.sender, msg.value);
        emit Pledged(campaignId, msg.sender, msg.value);
    }

    // =========================================================================
    // ОПТИМІЗАЦІЯ 2: Кешування storage у memory/stack
    // Читання полiв структури перенесено в локальнi змiннi, що виключає
    // повторнi дорогi опкоди SLOAD (кожен повторний warm SLOAD коштує 100 газу).
    // =========================================================================
    function claim(uint256 campaignId)
        external
        whenNotPaused
        campaignExists(campaignId)
    {
        Campaign storage campaign = campaigns[campaignId];

        // Кешування значень зі storage у локальний стек/пам'ять
        address cachedAuthor = campaign.author;
        bool cachedClaimed = campaign.claimed;
        uint128 cachedGoal = campaign.goal;
        uint128 cachedPledged = campaign.totalPledged;
        uint64 cachedDeadline = campaign.deadline;

        if (msg.sender != cachedAuthor) {
            revert OnlyCampaignAuthor(cachedAuthor, msg.sender);
        }
        if (block.timestamp < cachedDeadline) {
            revert DeadlineNotPassed(cachedDeadline, block.timestamp);
        }
        if (cachedPledged < cachedGoal) {
            revert GoalNotReached(cachedPledged, cachedGoal);
        }
        if (cachedClaimed) {
            revert AlreadyClaimed();
        }

        campaign.claimed = true;
        emit Claimed(campaignId, msg.sender, cachedPledged);

        (bool success, ) = cachedAuthor.call{value: cachedPledged}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    /// @notice Оптимізоване повернення коштів (Pull + CEI + Кешування)
    function claimRefund(uint256 campaignId)
        external
        whenNotPaused
        campaignExists(campaignId)
    {
        Campaign storage campaign = campaigns[campaignId];

        // Кешування значень зі storage
        uint64 cachedDeadline = campaign.deadline;
        uint128 cachedGoal = campaign.goal;
        uint128 cachedPledged = campaign.totalPledged;

        if (block.timestamp < cachedDeadline) {
            revert DeadlineNotPassed(cachedDeadline, block.timestamp);
        }
        if (cachedPledged >= cachedGoal) {
            revert GoalAlreadyReached(cachedPledged, cachedGoal);
        }

        uint256 refundAmount = contributions[campaignId][msg.sender];
        if (refundAmount == 0) {
            revert NoContribution();
        }

        // CEI: обнулення до виклику
        contributions[campaignId][msg.sender] = 0;
        emit Refunded(campaignId, msg.sender, refundAmount);

        (bool success, ) = msg.sender.call{value: refundAmount}("");
        if (!success) {
            revert TransferFailed();
        }
    }
}
