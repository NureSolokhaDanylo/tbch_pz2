// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IAuthorRegistry.sol";
import "./interfaces/IRewardToken.sol";
import "./interfaces/ICrowdfunding.sol";

/// @title Crowdfunding
/// @notice Основний контракт децентралізованої краудфандингової платформи
/// @dev Керує життєвим циклом кампаній, прийомом внесків, випуском токенів винагород та поверненням коштів
contract Crowdfunding is Ownable, Pausable, ICrowdfunding {
    // --- ПОМИЛКИ (Custom Errors) ---
    /// @dev Нульова передана адреса
    error ZeroAddress();
    /// @dev Автор не верифікований у реєстрі
    error NotVerifiedAuthor(address caller);
    /// @dev Ціль збору не може бути нульовою
    error ZeroGoal();
    /// @dev Тривалість збору має бути більшою за нуль
    error ZeroDuration();
    /// @dev Кампанія із зазначеним ID не існує
    error CampaignDoesNotExist(uint256 campaignId);
    /// @dev Термін дії кампанії завершився
    error CampaignEnded(uint256 deadline, uint256 currentTimestamp);
    /// @dev Сума внеску має бути строго більшою за нуль
    error ZeroContribution();
    /// @dev Термін кампанії ще не завершився
    error DeadlineNotPassed(uint256 deadline, uint256 currentTimestamp);
    /// @dev Ціль збору коштів не була досягнута
    error GoalNotReached(uint256 totalPledged, uint256 goal);
    /// @dev Ціль кампанії вже досягнута (повернення неможливе)
    error GoalAlreadyReached(uint256 totalPledged, uint256 goal);
    /// @dev Кошти кампанії вже виведені автором
    error AlreadyClaimed();
    /// @dev Тільки творець кампанії може викликати цю функцію
    error OnlyCampaignAuthor(address expected, address caller);
    /// @dev У адреси виклику відсутній доступний для повернення внесок
    error NoContribution();
    /// @dev Помилка надсилання нативного ETH
    error TransferFailed();
    /// @dev Некоректні параметри пагінації
    error InvalidPaginationParameters();

    // --- ПОДІЇ (Events) ---
    /// @notice Створено нову кампанію
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed author,
        uint256 goal,
        uint256 deadline
    );

    /// @notice Здійснено внесок у кампанію
    event Pledged(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount,
        uint256 rewardTokensMinted
    );

    /// @notice Автор успішно вивів кошти кампанії
    event Claimed(
        uint256 indexed campaignId,
        address indexed author,
        uint256 totalAmount
    );

    /// @notice Вкладник забрав свої кошти у проваленій кампанії
    event Refunded(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount
    );

    // --- ЗМІННІ СТАНУ ---
    /// @notice Реєстр верифікованих авторів
    IAuthorRegistry public immutable authorRegistry;

    /// @notice Токен винагороди вкладників
    IRewardToken public immutable rewardToken;

    /// @notice Загальна кількість створених кампаній
    uint256 public campaignCount;

    /// @notice Сховище кампаній за ID
    mapping(uint256 => Campaign) public campaigns;

    /// @notice Внески користувачів: campaignId => contributor => amount
    mapping(uint256 => mapping(address => uint256)) public contributions;

    // --- МОДИФІКАТОРИ ---
    /// @dev Перевірка існування кампанії
    modifier campaignExists(uint256 campaignId) {
        if (campaignId == 0 || campaignId > campaignCount) {
            revert CampaignDoesNotExist(campaignId);
        }
        _;
    }

    /// @notice Конструктор платформи краудфандингу
    /// @param _authorRegistry Адреса контракту AuthorRegistry
    /// @param _rewardToken Адреса контракту RewardToken
    /// @param _admin Адреса адміністратора платформи
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

    /// @notice Створити нову краудфандингову кампанію
    /// @dev Доступно лише верифікованим авторам у AuthorRegistry
    /// @param goal Цільова сума збору у wei
    /// @param duration Тривалість збору у секундах
    /// @return campaignId Ідентифікатор нової кампанії
    function createCampaign(uint256 goal, uint256 duration)
        external
        override
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

        campaignId = ++campaignCount;
        uint256 deadline = block.timestamp + duration;

        campaigns[campaignId] = Campaign({
            author: msg.sender,
            goal: goal,
            deadline: deadline,
            totalPledged: 0,
            claimed: false
        });

        emit CampaignCreated(campaignId, msg.sender, goal, deadline);
    }

    /// @notice Зробити внесок (ETH) в активну кампанію
    /// @dev Вкладнику нараховуються токени винагороди у співвідношенні 1 ETH (wei) = 1 RewardToken (wei)
    /// @param campaignId Ідентифікатор кампанії
    function pledge(uint256 campaignId)
        external
        payable
        override
        whenNotPaused
        campaignExists(campaignId)
    {
        Campaign storage campaign = campaigns[campaignId];

        if (block.timestamp >= campaign.deadline) {
            revert CampaignEnded(campaign.deadline, block.timestamp);
        }
        if (msg.value == 0) {
            revert ZeroContribution();
        }

        campaign.totalPledged += msg.value;
        contributions[campaignId][msg.sender] += msg.value;

        // Емісія нагородних токенів через зовнішній контракт токена
        rewardToken.mint(msg.sender, msg.value);

        emit Pledged(campaignId, msg.sender, msg.value, msg.value);
    }

    /// @notice Виведення коштів автором при успішному завершенні кампанії
    /// @dev Доступно автору кампанії, коли дедлайн настав і ціль досягнута
    /// @param campaignId Ідентифікатор кампанії
    function claim(uint256 campaignId)
        external
        override
        whenNotPaused
        campaignExists(campaignId)
    {
        Campaign storage campaign = campaigns[campaignId];

        if (msg.sender != campaign.author) {
            revert OnlyCampaignAuthor(campaign.author, msg.sender);
        }
        if (block.timestamp < campaign.deadline) {
            revert DeadlineNotPassed(campaign.deadline, block.timestamp);
        }
        if (campaign.totalPledged < campaign.goal) {
            revert GoalNotReached(campaign.totalPledged, campaign.goal);
        }
        if (campaign.claimed) {
            revert AlreadyClaimed();
        }

        // Checks-Effects-Interactions (CEI):
        // Effect: фіксуємо прапорець claimed до зовнішнього виклику
        campaign.claimed = true;
        uint256 totalToClaim = campaign.totalPledged;

        emit Claimed(campaignId, msg.sender, totalToClaim);

        // Interaction: надсилання коштів автору
        (bool success, ) = campaign.author.call{value: totalToClaim}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    /// @notice Повернення коштів вкладнику при провалі кампанії (патерн Pull)
    /// @dev Реалізовано суворо за патерном Checks-Effects-Interactions для захисту від Reentrancy
    /// @param campaignId Ідентифікатор кампанії
    function claimRefund(uint256 campaignId)
        external
        override
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

        // 2. EFFECTS
        contributions[campaignId][msg.sender] = 0;

        emit Refunded(campaignId, msg.sender, refundAmount);

        // 3. INTERACTIONS
        (bool success, ) = msg.sender.call{value: refundAmount}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    /// @notice Отримати дані кампанії за її ID
    /// @param campaignId Ідентифікатор кампанії
    /// @return Дані структури Campaign
    function getCampaign(uint256 campaignId)
        external
        view
        override
        campaignExists(campaignId)
        returns (Campaign memory)
    {
        return campaigns[campaignId];
    }

    /// @notice Пагінація списку кампаній (порційне читання)
    /// @param offset Початковий індекс (від 0)
    /// @param limit Максимальна кількість елементів для повернення
    /// @return result Масив кампаній
    /// @return total Загальна кількість створених кампаній
    function getCampaigns(uint256 offset, uint256 limit)
        external
        view
        override
        returns (Campaign[] memory result, uint256 total)
    {
        total = campaignCount;
        if (limit == 0) {
            revert InvalidPaginationParameters();
        }
        if (offset >= total) {
            return (new Campaign[](0), total);
        }

        uint256 size = limit;
        if (offset + limit > total) {
            size = total - offset;
        }

        result = new Campaign[](size);
        for (uint256 i = 0; i < size; ++i) {
            // campaignId індексуються з 1
            result[i] = campaigns[offset + i + 1];
        }

        return (result, total);
    }

    /// @notice Аварійна зупинка операцій платформи (Emergency Stop)
    /// @dev Доступна тільки адміністратору платформи
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Відновлення операцій платформи
    /// @dev Доступно тільки адміністратору платформи
    function unpause() external onlyOwner {
        _unpause();
    }
}
