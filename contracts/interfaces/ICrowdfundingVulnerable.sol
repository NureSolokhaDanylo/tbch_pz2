// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ICrowdfunding.sol";

/// @title ICrowdfundingVulnerable
/// @notice Інтерфейс вразливої версії краудфандингу з методом vulnerableClaimRefund
interface ICrowdfundingVulnerable is ICrowdfunding {
    function vulnerableClaimRefund(uint256 campaignId) external;
}
