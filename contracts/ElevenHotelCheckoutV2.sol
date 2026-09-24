// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @title ElevenHotelCheckoutV2
/// @notice Atomically fulfills an existing THE KEY listing, transfers the NFT to the buyer,
///         and pays an immutable 11hotel service margin to the treasury.
/// @dev V2 adds a per-night minimum total price floor on top of V1's rate-based fee:
///      total = max(listingPrice + ceil(listingPrice * feeBps / 10000), perNightFloor * nights);
///      fee = total - listingPrice. Listing price is set by the seller on the external
///      marketplace and is unaffected by this contract; when the seller's price implies a
///      below-floor nightly rate, the shortfall is added to 11hotel's fee so the buyer's total
///      never prices a night below the floor. perNightFloor is pinned in ETH at deploy time
///      (this contract has no price oracle), so its JPY equivalent drifts with the ETH/JPY rate
///      and the floor should be re-pinned via a new deployment if it drifts materially. No admin
///      key, custody queue, withdrawal function, or upgrade path — same trust model as
///      ElevenHotelCheckout (V1). Any failure reverts the listing fulfillment, NFT transfer, and
///      fee payment together.
contract ElevenHotelCheckoutV2 {
    error InvalidAddress();
    error InvalidFee();
    error InvalidPayment();
    error InvalidSettlement();
    error InvalidNights();
    error Expired();
    error FulfillmentFailed();
    error AssetNotReceived();
    error AssetNotDelivered();
    error FeeTransferFailed();
    error ReentrantCall();
    error UnexpectedBalance();

    address public immutable treasury;
    IERC721Minimal public immutable collection;
    uint16 public immutable feeBps;
    /// @notice Minimum total price component per night, in wei, pinned at deploy time.
    uint256 public immutable perNightFloor;
    mapping(address => bool) public allowedSettlement;

    uint256 private locked = 1;

    event Purchased(
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 listingPrice,
        uint256 nights,
        uint256 fee,
        address indexed settlement
    );

    constructor(
        address treasury_,
        address collection_,
        uint16 feeBps_,
        uint256 perNightFloor_,
        address[] memory settlements_
    ) {
        if (treasury_ == address(0) || collection_ == address(0)) revert InvalidAddress();
        if (feeBps_ == 0 || feeBps_ > 3000) revert InvalidFee();
        if (settlements_.length == 0) revert InvalidSettlement();

        treasury = treasury_;
        collection = IERC721Minimal(collection_);
        feeBps = feeBps_;
        perNightFloor = perNightFloor_;
        for (uint256 i; i < settlements_.length; ++i) {
            if (settlements_[i] == address(0)) revert InvalidAddress();
            allowedSettlement[settlements_[i]] = true;
        }
    }

    function quote(uint256 listingPrice, uint256 nights) public view returns (uint256 fee, uint256 total) {
        if (nights == 0) revert InvalidNights();
        uint256 rateFee = (listingPrice * feeBps + 9_999) / 10_000;
        uint256 standardTotal = listingPrice + rateFee;
        uint256 floorTotal = perNightFloor * nights;
        total = standardTotal > floorTotal ? standardTotal : floorTotal;
        fee = total - listingPrice;
    }

    function purchase(
        address settlement,
        bytes calldata settlementCalldata,
        uint256 tokenId,
        uint256 listingPrice,
        uint256 nights,
        uint256 deadline
    ) external payable {
        if (locked != 1) revert ReentrantCall();
        locked = 2;

        if (block.timestamp > deadline) revert Expired();
        if (!allowedSettlement[settlement]) revert InvalidSettlement();

        (uint256 fee, uint256 total) = quote(listingPrice, nights);
        if (msg.value != total) revert InvalidPayment();
        uint256 startingBalance = address(this).balance - msg.value;

        (bool ok, bytes memory result) = settlement.call{value: listingPrice}(settlementCalldata);
        if (!ok || (result.length >= 32 && !abi.decode(result, (bool)))) revert FulfillmentFailed();
        if (collection.ownerOf(tokenId) != address(this)) revert AssetNotReceived();

        collection.safeTransferFrom(address(this), msg.sender, tokenId);
        if (collection.ownerOf(tokenId) != msg.sender) revert AssetNotDelivered();
        if (address(this).balance != startingBalance + fee) revert UnexpectedBalance();

        (bool paid,) = treasury.call{value: fee}("");
        if (!paid) revert FeeTransferFailed();
        if (address(this).balance != startingBalance) revert UnexpectedBalance();

        emit Purchased(msg.sender, tokenId, listingPrice, nights, fee, settlement);
        locked = 1;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
