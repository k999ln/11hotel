// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @title ElevenHotelCheckout
/// @notice Atomically fulfills an existing THE KEY listing, transfers the NFT to the buyer,
///         and pays an immutable 11hotel service margin to the treasury.
/// @dev No admin key, custody queue, withdrawal function, or upgrade path. Any failure reverts
///      the listing fulfillment, NFT transfer, and fee payment together.
contract ElevenHotelCheckout {
    error InvalidAddress();
    error InvalidFee();
    error InvalidPayment();
    error InvalidSettlement();
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
    mapping(address => bool) public allowedSettlement;

    uint256 private locked = 1;

    event Purchased(
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 listingPrice,
        uint256 fee,
        address indexed settlement
    );

    constructor(
        address treasury_,
        address collection_,
        uint16 feeBps_,
        address[] memory settlements_
    ) {
        if (treasury_ == address(0) || collection_ == address(0)) revert InvalidAddress();
        if (feeBps_ == 0 || feeBps_ > 3000) revert InvalidFee();
        if (settlements_.length == 0) revert InvalidSettlement();

        treasury = treasury_;
        collection = IERC721Minimal(collection_);
        feeBps = feeBps_;
        for (uint256 i; i < settlements_.length; ++i) {
            if (settlements_[i] == address(0)) revert InvalidAddress();
            allowedSettlement[settlements_[i]] = true;
        }
    }

    function quote(uint256 listingPrice) public view returns (uint256 fee, uint256 total) {
        fee = (listingPrice * feeBps + 9_999) / 10_000;
        total = listingPrice + fee;
    }

    function purchase(
        address settlement,
        bytes calldata settlementCalldata,
        uint256 tokenId,
        uint256 listingPrice,
        uint256 deadline
    ) external payable {
        if (locked != 1) revert ReentrantCall();
        locked = 2;

        if (block.timestamp > deadline) revert Expired();
        if (!allowedSettlement[settlement]) revert InvalidSettlement();

        (uint256 fee, uint256 total) = quote(listingPrice);
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

        emit Purchased(msg.sender, tokenId, listingPrice, fee, settlement);
        locked = 1;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
