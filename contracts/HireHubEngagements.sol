// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IHireHubIdentity {
    function profileCount() external view returns (uint256);
    function profileOfWallet(address wallet) external view returns (uint256);
}

/// @title HireHubEngagements
/// @notice Bilateral work agreements anchored to profiles in the immutable HireHub registry.
/// @dev Payments are optional. A zero amount represents a reputation-only engagement.
contract HireHubEngagements {
    enum EngagementStatus {
        Proposed,
        Accepted,
        Submitted,
        RevisionRequested,
        Completed,
        Rejected,
        Cancelled,
        Disputed
    }

    struct Engagement {
        uint256 employerProfileId;
        uint256 contributorProfileId;
        address employer;
        address contributor;
        address paymentToken;
        uint256 paymentAmount;
        string title;
        string description;
        string evidenceUri;
        bytes32 evidenceHash;
        string review;
        uint64 createdAt;
        uint64 updatedAt;
        uint8 rating;
        EngagementStatus status;
    }

    error EmptyValue();
    error EngagementNotFound();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidProfile();
    error InvalidRating();
    error InvalidState();
    error LimitTooLarge();
    error NotContributor();
    error NotEmployer();
    error ReentrantCall();
    error SameProfile();
    error TextTooLong();
    error TokenTransferFailed();

    uint256 public constant MAX_PAGE_SIZE = 50;
    uint256 public constant STALE_AFTER = 30 days;
    IHireHubIdentity public immutable identity;
    uint256 public engagementCount;

    mapping(uint256 => Engagement) private _engagements;
    mapping(uint256 => uint256[]) private _employerEngagementIds;
    mapping(uint256 => uint256[]) private _contributorEngagementIds;
    mapping(uint256 => uint256) public profileCompletedCount;

    uint256 private _unlocked = 1;

    event EngagementCreated(
        uint256 indexed engagementId,
        uint256 indexed employerProfileId,
        uint256 indexed contributorProfileId,
        address employer,
        address paymentToken,
        uint256 paymentAmount
    );
    event EngagementAccepted(
        uint256 indexed engagementId,
        address indexed contributor
    );
    event EvidenceSubmitted(
        uint256 indexed engagementId,
        bytes32 indexed evidenceHash,
        string evidenceUri
    );
    event RevisionRequested(uint256 indexed engagementId, string feedback);
    event EngagementCompleted(
        uint256 indexed engagementId,
        uint8 rating,
        uint256 paymentAmount
    );
    event EngagementRejected(uint256 indexed engagementId, string reason);
    event EngagementCancelled(uint256 indexed engagementId);
    event EngagementDisputed(uint256 indexed engagementId, address indexed raisedBy);
    event EngagementWithdrawn(uint256 indexed engagementId, address indexed contributor);
    event StaleEngagementReclaimed(uint256 indexed engagementId);

    modifier nonReentrant() {
        if (_unlocked != 1) revert ReentrantCall();
        _unlocked = 2;
        _;
        _unlocked = 1;
    }

    constructor(address identityAddress) {
        if (identityAddress == address(0)) revert InvalidAddress();
        identity = IHireHubIdentity(identityAddress);
    }

    function createEngagement(
        uint256 contributorProfileId,
        string calldata title,
        string calldata description,
        address paymentToken,
        uint256 paymentAmount
    ) external nonReentrant returns (uint256 engagementId) {
        uint256 employerProfileId = _profileOf(msg.sender);
        if (
            contributorProfileId == 0 ||
            contributorProfileId > identity.profileCount()
        ) revert InvalidProfile();
        if (employerProfileId == contributorProfileId) revert SameProfile();
        if ((paymentAmount == 0) != (paymentToken == address(0))) {
            revert InvalidAmount();
        }
        if (paymentAmount != 0 && paymentToken.code.length == 0) {
            revert InvalidAddress();
        }
        _validateRequired(title, 100);
        _validateOptional(description, 500);

        engagementId = ++engagementCount;
        _engagements[engagementId] = Engagement({
            employerProfileId: employerProfileId,
            contributorProfileId: contributorProfileId,
            employer: msg.sender,
            contributor: address(0),
            paymentToken: paymentToken,
            paymentAmount: paymentAmount,
            title: title,
            description: description,
            evidenceUri: "",
            evidenceHash: bytes32(0),
            review: "",
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            rating: 0,
            status: EngagementStatus.Proposed
        });
        _employerEngagementIds[employerProfileId].push(engagementId);
        _contributorEngagementIds[contributorProfileId].push(engagementId);

        if (paymentAmount != 0) {
            uint256 balanceBefore = _tokenBalance(paymentToken, address(this));
            _safeTransferFrom(paymentToken, msg.sender, address(this), paymentAmount);
            if (
                _tokenBalance(paymentToken, address(this)) - balanceBefore !=
                paymentAmount
            ) revert TokenTransferFailed();
        }

        emit EngagementCreated(
            engagementId,
            employerProfileId,
            contributorProfileId,
            msg.sender,
            paymentToken,
            paymentAmount
        );
    }

    function acceptEngagement(uint256 engagementId) external {
        Engagement storage engagement = _getEngagement(engagementId);
        if (_profileOf(msg.sender) != engagement.contributorProfileId) {
            revert NotContributor();
        }
        if (engagement.status != EngagementStatus.Proposed) revert InvalidState();

        engagement.contributor = msg.sender;
        engagement.status = EngagementStatus.Accepted;
        engagement.updatedAt = uint64(block.timestamp);
        emit EngagementAccepted(engagementId, msg.sender);
    }

    function submitEvidence(
        uint256 engagementId,
        string calldata evidenceUri,
        bytes32 evidenceHash
    ) external {
        Engagement storage engagement = _getEngagement(engagementId);
        if (_profileOf(msg.sender) != engagement.contributorProfileId) {
            revert NotContributor();
        }
        if (
            engagement.status != EngagementStatus.Accepted &&
            engagement.status != EngagementStatus.RevisionRequested
        ) revert InvalidState();
        _validateRequired(evidenceUri, 256);
        if (evidenceHash == bytes32(0)) revert EmptyValue();

        engagement.contributor = msg.sender;
        engagement.evidenceUri = evidenceUri;
        engagement.evidenceHash = evidenceHash;
        engagement.status = EngagementStatus.Submitted;
        engagement.updatedAt = uint64(block.timestamp);
        emit EvidenceSubmitted(engagementId, evidenceHash, evidenceUri);
    }

    function requestRevision(
        uint256 engagementId,
        string calldata feedback
    ) external {
        Engagement storage engagement = _getEngagement(engagementId);
        _requireEmployer(engagement);
        if (engagement.status != EngagementStatus.Submitted) revert InvalidState();
        _validateRequired(feedback, 500);

        engagement.review = feedback;
        engagement.status = EngagementStatus.RevisionRequested;
        engagement.updatedAt = uint64(block.timestamp);
        emit RevisionRequested(engagementId, feedback);
    }

    function approveEngagement(
        uint256 engagementId,
        uint8 rating,
        string calldata review
    ) external nonReentrant {
        Engagement storage engagement = _getEngagement(engagementId);
        _requireEmployer(engagement);
        // A dispute can still be settled in the contributor's favour once evidence exists.
        if (
            engagement.status != EngagementStatus.Submitted &&
            !(
                engagement.status == EngagementStatus.Disputed &&
                engagement.evidenceHash != bytes32(0)
            )
        ) revert InvalidState();
        if (rating == 0 || rating > 5) revert InvalidRating();
        _validateOptional(review, 500);

        engagement.rating = rating;
        engagement.review = review;
        engagement.status = EngagementStatus.Completed;
        engagement.updatedAt = uint64(block.timestamp);
        profileCompletedCount[engagement.contributorProfileId]++;

        if (engagement.paymentAmount != 0) {
            _safeTransfer(
                engagement.paymentToken,
                engagement.contributor,
                engagement.paymentAmount
            );
        }
        emit EngagementCompleted(engagementId, rating, engagement.paymentAmount);
    }

    function rejectEngagement(
        uint256 engagementId,
        string calldata reason
    ) external nonReentrant {
        Engagement storage engagement = _getEngagement(engagementId);
        _requireEmployer(engagement);
        if (
            engagement.status != EngagementStatus.Submitted &&
            engagement.status != EngagementStatus.RevisionRequested
        ) revert InvalidState();
        _validateRequired(reason, 500);

        engagement.review = reason;
        engagement.status = EngagementStatus.Rejected;
        engagement.updatedAt = uint64(block.timestamp);
        _refundEmployer(engagement);
        emit EngagementRejected(engagementId, reason);
    }

    function cancelProposal(uint256 engagementId) external nonReentrant {
        Engagement storage engagement = _getEngagement(engagementId);
        _requireEmployer(engagement);
        if (engagement.status != EngagementStatus.Proposed) revert InvalidState();

        engagement.status = EngagementStatus.Cancelled;
        engagement.updatedAt = uint64(block.timestamp);
        _refundEmployer(engagement);
        emit EngagementCancelled(engagementId);
    }

    function declineEngagement(uint256 engagementId) external nonReentrant {
        Engagement storage engagement = _getEngagement(engagementId);
        if (_profileOf(msg.sender) != engagement.contributorProfileId) {
            revert NotContributor();
        }
        if (engagement.status != EngagementStatus.Proposed) revert InvalidState();

        engagement.status = EngagementStatus.Rejected;
        engagement.updatedAt = uint64(block.timestamp);
        _refundEmployer(engagement);
        emit EngagementRejected(engagementId, "Declined by contributor");
    }

    function raiseDispute(uint256 engagementId) external {
        Engagement storage engagement = _getEngagement(engagementId);
        uint256 callerProfileId = _profileOf(msg.sender);
        if (
            callerProfileId != engagement.employerProfileId &&
            callerProfileId != engagement.contributorProfileId
        ) revert InvalidProfile();
        if (
            engagement.status != EngagementStatus.Accepted &&
            engagement.status != EngagementStatus.Submitted &&
            engagement.status != EngagementStatus.RevisionRequested
        ) revert InvalidState();

        engagement.status = EngagementStatus.Disputed;
        engagement.updatedAt = uint64(block.timestamp);
        emit EngagementDisputed(engagementId, msg.sender);
    }

    function withdrawEngagement(uint256 engagementId) external nonReentrant {
        Engagement storage engagement = _getEngagement(engagementId);
        if (_profileOf(msg.sender) != engagement.contributorProfileId) {
            revert NotContributor();
        }
        if (
            engagement.status != EngagementStatus.Accepted &&
            engagement.status != EngagementStatus.RevisionRequested &&
            engagement.status != EngagementStatus.Disputed
        ) revert InvalidState();

        engagement.status = EngagementStatus.Cancelled;
        engagement.updatedAt = uint64(block.timestamp);
        _refundEmployer(engagement);
        emit EngagementWithdrawn(engagementId, msg.sender);
    }

    function reclaimStaleEngagement(uint256 engagementId) external nonReentrant {
        Engagement storage engagement = _getEngagement(engagementId);
        _requireEmployer(engagement);
        if (
            engagement.status != EngagementStatus.Accepted &&
            engagement.status != EngagementStatus.RevisionRequested
        ) revert InvalidState();
        if (block.timestamp < uint256(engagement.updatedAt) + STALE_AFTER) {
            revert InvalidState();
        }

        engagement.status = EngagementStatus.Cancelled;
        engagement.updatedAt = uint64(block.timestamp);
        _refundEmployer(engagement);
        emit StaleEngagementReclaimed(engagementId);
    }

    function getEngagement(
        uint256 engagementId
    ) external view returns (Engagement memory) {
        return _getEngagement(engagementId);
    }

    function getProfileEngagementIds(
        uint256 profileId,
        bool asEmployer,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids) {
        if (limit > MAX_PAGE_SIZE) revert LimitTooLarge();
        uint256[] storage source = asEmployer
            ? _employerEngagementIds[profileId]
            : _contributorEngagementIds[profileId];
        if (offset >= source.length || limit == 0) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > source.length) end = source.length;
        ids = new uint256[](end - offset);
        for (uint256 index = offset; index < end; index++) {
            ids[index - offset] = source[index];
        }
    }

    function getProfileEngagementCount(
        uint256 profileId,
        bool asEmployer
    ) external view returns (uint256) {
        return asEmployer
            ? _employerEngagementIds[profileId].length
            : _contributorEngagementIds[profileId].length;
    }

    function _profileOf(address wallet) private view returns (uint256 profileId) {
        profileId = identity.profileOfWallet(wallet);
        if (profileId == 0) revert InvalidProfile();
    }

    function _requireEmployer(Engagement storage engagement) private view {
        if (_profileOf(msg.sender) != engagement.employerProfileId) {
            revert NotEmployer();
        }
    }

    function _getEngagement(
        uint256 engagementId
    ) private view returns (Engagement storage engagement) {
        engagement = _engagements[engagementId];
        if (engagement.employerProfileId == 0) revert EngagementNotFound();
    }

    function _refundEmployer(Engagement storage engagement) private {
        if (engagement.paymentAmount != 0) {
            _safeTransfer(
                engagement.paymentToken,
                engagement.employer,
                engagement.paymentAmount
            );
        }
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) private {
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount)
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _tokenBalance(address token, address account) private view returns (uint256) {
        (bool success, bytes memory result) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, account)
        );
        if (!success || result.length < 32) revert TokenTransferFailed();
        return abi.decode(result, (uint256));
    }

    function _validateRequired(string calldata value, uint256 maxLength) private pure {
        if (bytes(value).length == 0) revert EmptyValue();
        if (bytes(value).length > maxLength) revert TextTooLong();
    }

    function _validateOptional(string calldata value, uint256 maxLength) private pure {
        if (bytes(value).length > maxLength) revert TextTooLong();
    }
}
