// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title HireHub
/// @notice A dual-lane contributor directory for EVM and Solana wallet users on Rome.
contract HireHub {
    enum WorkStatus {
        Pending,
        Approved,
        Rejected
    }

    struct Profile {
        address owner;
        string displayName;
        string headline;
        string bio;
        string avatarUrl;
        uint64 createdAt;
        uint32 workCount;
        uint32 attestationCount;
        bool exists;
    }

    struct WorkRecord {
        uint256 profileId;
        address contributor;
        address employer;
        string title;
        string description;
        string evidenceUrl;
        string review;
        uint64 createdAt;
        uint64 reviewedAt;
        uint8 rating;
        WorkStatus status;
    }

    error AlreadyHasProfile();
    error EmptyValue();
    error InvalidAddress();
    error InvalidProfile();
    error InvalidRating();
    error InvalidWork();
    error LinkNotProposed();
    error NotEmployer();
    error NotProfileMember();
    error NotProfileOwner();
    error TextTooLong();
    error WorkAlreadyReviewed();

    uint256 public profileCount;
    uint256 public workCount;

    mapping(uint256 => Profile) private _profiles;
    mapping(address => uint256) public profileOfWallet;
    mapping(uint256 => address[]) private _profileWallets;
    mapping(uint256 => mapping(address => bool)) public pendingWalletLinks;
    mapping(uint256 => WorkRecord) private _workRecords;
    mapping(uint256 => uint256[]) private _profileWorkIds;

    event ProfileCreated(uint256 indexed profileId, address indexed owner, string displayName);
    event ProfileUpdated(uint256 indexed profileId);
    event WalletLinkProposed(uint256 indexed profileId, address indexed wallet);
    event WalletLinkCancelled(uint256 indexed profileId, address indexed wallet);
    event WalletLinked(uint256 indexed profileId, address indexed wallet);
    event WorkSubmitted(
        uint256 indexed workId,
        uint256 indexed profileId,
        address indexed employer,
        address contributor
    );
    event WorkReviewed(
        uint256 indexed workId,
        uint256 indexed profileId,
        address indexed employer,
        bool approved,
        uint8 rating
    );

    modifier onlyProfileOwner(uint256 profileId) {
        if (!_profiles[profileId].exists) revert InvalidProfile();
        if (_profiles[profileId].owner != msg.sender) revert NotProfileOwner();
        _;
    }

    modifier onlyProfileMember(uint256 profileId) {
        if (!_profiles[profileId].exists) revert InvalidProfile();
        if (profileOfWallet[msg.sender] != profileId) revert NotProfileMember();
        _;
    }

    function createProfile(
        string calldata displayName,
        string calldata headline,
        string calldata bio,
        string calldata avatarUrl
    ) external returns (uint256 profileId) {
        if (profileOfWallet[msg.sender] != 0) revert AlreadyHasProfile();
        _validateProfile(displayName, headline, bio, avatarUrl);

        profileId = ++profileCount;
        _profiles[profileId] = Profile({
            owner: msg.sender,
            displayName: displayName,
            headline: headline,
            bio: bio,
            avatarUrl: avatarUrl,
            createdAt: uint64(block.timestamp),
            workCount: 0,
            attestationCount: 0,
            exists: true
        });
        profileOfWallet[msg.sender] = profileId;
        _profileWallets[profileId].push(msg.sender);

        emit ProfileCreated(profileId, msg.sender, displayName);
        emit WalletLinked(profileId, msg.sender);
    }

    function updateProfile(
        uint256 profileId,
        string calldata displayName,
        string calldata headline,
        string calldata bio,
        string calldata avatarUrl
    ) external onlyProfileOwner(profileId) {
        _validateProfile(displayName, headline, bio, avatarUrl);
        Profile storage profile = _profiles[profileId];
        profile.displayName = displayName;
        profile.headline = headline;
        profile.bio = bio;
        profile.avatarUrl = avatarUrl;
        emit ProfileUpdated(profileId);
    }

    function proposeWallet(uint256 profileId, address wallet) external onlyProfileOwner(profileId) {
        if (wallet == address(0)) revert InvalidAddress();
        if (profileOfWallet[wallet] != 0) revert AlreadyHasProfile();
        pendingWalletLinks[profileId][wallet] = true;
        emit WalletLinkProposed(profileId, wallet);
    }

    function cancelWalletProposal(
        uint256 profileId,
        address wallet
    ) external onlyProfileOwner(profileId) {
        pendingWalletLinks[profileId][wallet] = false;
        emit WalletLinkCancelled(profileId, wallet);
    }

    function acceptWalletLink(uint256 profileId) external {
        if (!_profiles[profileId].exists) revert InvalidProfile();
        if (profileOfWallet[msg.sender] != 0) revert AlreadyHasProfile();
        if (!pendingWalletLinks[profileId][msg.sender]) revert LinkNotProposed();

        pendingWalletLinks[profileId][msg.sender] = false;
        profileOfWallet[msg.sender] = profileId;
        _profileWallets[profileId].push(msg.sender);
        emit WalletLinked(profileId, msg.sender);
    }

    function submitWork(
        uint256 profileId,
        address employer,
        string calldata title,
        string calldata description,
        string calldata evidenceUrl
    ) external onlyProfileMember(profileId) returns (uint256 workId) {
        if (employer == address(0) || employer == msg.sender) revert InvalidAddress();
        _validateRequired(title, 100);
        _validateOptional(description, 500);
        _validateRequired(evidenceUrl, 256);

        workId = ++workCount;
        _workRecords[workId] = WorkRecord({
            profileId: profileId,
            contributor: msg.sender,
            employer: employer,
            title: title,
            description: description,
            evidenceUrl: evidenceUrl,
            review: "",
            createdAt: uint64(block.timestamp),
            reviewedAt: 0,
            rating: 0,
            status: WorkStatus.Pending
        });
        _profileWorkIds[profileId].push(workId);
        _profiles[profileId].workCount++;

        emit WorkSubmitted(workId, profileId, employer, msg.sender);
    }

    function reviewWork(
        uint256 workId,
        bool approved,
        uint8 rating,
        string calldata review
    ) external {
        WorkRecord storage record = _workRecords[workId];
        if (record.profileId == 0) revert InvalidWork();
        if (record.employer != msg.sender) revert NotEmployer();
        if (record.status != WorkStatus.Pending) revert WorkAlreadyReviewed();
        if ((approved && (rating == 0 || rating > 5)) || (!approved && rating != 0)) {
            revert InvalidRating();
        }
        _validateOptional(review, 500);

        record.status = approved ? WorkStatus.Approved : WorkStatus.Rejected;
        record.rating = rating;
        record.review = review;
        record.reviewedAt = uint64(block.timestamp);
        if (approved) _profiles[record.profileId].attestationCount++;

        emit WorkReviewed(workId, record.profileId, msg.sender, approved, rating);
    }

    function getProfile(uint256 profileId) external view returns (Profile memory) {
        if (!_profiles[profileId].exists) revert InvalidProfile();
        return _profiles[profileId];
    }

    function getProfileWallets(uint256 profileId) external view returns (address[] memory) {
        if (!_profiles[profileId].exists) revert InvalidProfile();
        return _profileWallets[profileId];
    }

    function getProfileWorkIds(uint256 profileId) external view returns (uint256[] memory) {
        if (!_profiles[profileId].exists) revert InvalidProfile();
        return _profileWorkIds[profileId];
    }

    function getWork(uint256 workId) external view returns (WorkRecord memory) {
        if (_workRecords[workId].profileId == 0) revert InvalidWork();
        return _workRecords[workId];
    }

    function _validateProfile(
        string calldata displayName,
        string calldata headline,
        string calldata bio,
        string calldata avatarUrl
    ) private pure {
        _validateRequired(displayName, 64);
        _validateRequired(headline, 120);
        _validateOptional(bio, 500);
        _validateOptional(avatarUrl, 256);
    }

    function _validateRequired(string calldata value, uint256 maxLength) private pure {
        if (bytes(value).length == 0) revert EmptyValue();
        if (bytes(value).length > maxLength) revert TextTooLong();
    }

    function _validateOptional(string calldata value, uint256 maxLength) private pure {
        if (bytes(value).length > maxLength) revert TextTooLong();
    }
}
