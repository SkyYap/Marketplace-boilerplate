// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AirmilesEscrow
 * @notice Escrow contract for the Airmiles Marketplace.
 *
 * Flow:
 *   1. Buyer calls deposit() with USDC amount + flight details
 *   2. EigenCompute transfers miles and submits proof
 *   3. Admin/system calls release() to pay seller
 *   4. If transfer fails, admin calls refund() to return funds to buyer
 */
contract AirmilesEscrow is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;

    enum EscrowStatus { NONE, DEPOSITED, RELEASED, REFUNDED }

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        string orderId;
        string departure;
        string destination;
        EscrowStatus status;
        uint256 createdAt;
    }

    // orderId => Escrow
    mapping(string => Escrow) public escrows;

    event Deposited(string indexed orderId, address buyer, address seller, uint256 amount, string departure, string destination);
    event Released(string indexed orderId, address seller, uint256 amount);
    event Refunded(string indexed orderId, address buyer, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Buyer deposits USDC into escrow for a specific order.
     * @param orderId  The marketplace order ID
     * @param seller   The seller's wallet address
     * @param amount   Amount of USDC (in smallest unit, e.g., 6 decimals)
     * @param departure  Departure airport code (e.g., "LAX")
     * @param destination  Destination airport code (e.g., "NRT")
     */
    function deposit(
        string calldata orderId,
        address seller,
        uint256 amount,
        string calldata departure,
        string calldata destination
    ) external nonReentrant {
        require(escrows[orderId].status == EscrowStatus.NONE, "Escrow already exists");
        require(amount > 0, "Amount must be > 0");
        require(seller != address(0), "Invalid seller");
        require(seller != msg.sender, "Buyer cannot be seller");

        // Transfer USDC from buyer to this contract
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        escrows[orderId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            orderId: orderId,
            departure: departure,
            destination: destination,
            status: EscrowStatus.DEPOSITED,
            createdAt: block.timestamp
        });

        emit Deposited(orderId, msg.sender, seller, amount, departure, destination);
    }

    /**
     * @notice Release escrowed funds to the seller (called by admin after verified transfer).
     */
    function release(string calldata orderId) external onlyOwner nonReentrant {
        Escrow storage e = escrows[orderId];
        require(e.status == EscrowStatus.DEPOSITED, "Not in deposited state");

        e.status = EscrowStatus.RELEASED;
        require(usdc.transfer(e.seller, e.amount), "USDC transfer to seller failed");

        emit Released(orderId, e.seller, e.amount);
    }

    /**
     * @notice Refund escrowed funds to the buyer (transfer failed or dispute resolved).
     */
    function refund(string calldata orderId) external onlyOwner nonReentrant {
        Escrow storage e = escrows[orderId];
        require(e.status == EscrowStatus.DEPOSITED, "Not in deposited state");

        e.status = EscrowStatus.REFUNDED;
        require(usdc.transfer(e.buyer, e.amount), "USDC refund failed");

        emit Refunded(orderId, e.buyer, e.amount);
    }

    /**
     * @notice View escrow details for an order.
     */
    function getEscrow(string calldata orderId) external view returns (Escrow memory) {
        return escrows[orderId];
    }
}
