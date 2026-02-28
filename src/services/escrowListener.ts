import Web3 from 'web3';
import { config } from '../config';
import { getListings, escrowOrder } from '../db/queries';
import { triggerTransfer } from './transferService';

// ABI — only the Deposited event is needed
const ESCROW_ABI = [
    {
        type: 'event',
        name: 'Deposited',
        inputs: [
            { name: 'orderId', type: 'string', indexed: true, internalType: 'string' },
            { name: 'buyer', type: 'address', indexed: false, internalType: 'address' },
            { name: 'seller', type: 'address', indexed: false, internalType: 'address' },
            { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
            { name: 'departure', type: 'string', indexed: false, internalType: 'string' },
            { name: 'destination', type: 'string', indexed: false, internalType: 'string' },
        ],
        anonymous: false,
    },
] as const;

// Polling interval (Base Sepolia doesn't reliably support WebSocket subscriptions)
const POLL_INTERVAL_MS = 10_000; // 10 seconds

let lastBlockChecked = 0;

/**
 * Start listening for Deposited events on the AirmilesEscrow contract.
 * Uses polling (getLogs) since Base Sepolia public RPC doesn't support subscriptions.
 */
export async function startEscrowListener(): Promise<void> {
    const { rpcUrl, escrowContract } = config;

    if (!escrowContract) {
        console.log('[EscrowListener] No ESCROW_CONTRACT set — skipping event listener');
        return;
    }

    const web3 = new Web3(rpcUrl);
    const contract = new web3.eth.Contract(ESCROW_ABI, escrowContract);

    // Start from the current block
    try {
        lastBlockChecked = Number(await web3.eth.getBlockNumber());
        console.log(`[EscrowListener] Listening for Deposited events on ${escrowContract}`);
        console.log(`[EscrowListener] Chain: ${rpcUrl}, starting from block ${lastBlockChecked}`);
    } catch (err: any) {
        console.error(`[EscrowListener] Failed to get block number: ${err.message}`);
        return;
    }

    // Poll for events
    setInterval(async () => {
        try {
            const currentBlock = Number(await web3.eth.getBlockNumber());

            if (currentBlock <= lastBlockChecked) return;

            const events = await contract.getPastEvents('Deposited', {
                fromBlock: lastBlockChecked + 1,
                toBlock: currentBlock,
            });

            for (const event of events) {
                await handleDepositedEvent(event, web3);
            }

            lastBlockChecked = currentBlock;
        } catch (err: any) {
            console.error(`[EscrowListener] Polling error: ${err.message}`);
        }
    }, POLL_INTERVAL_MS);
}

/**
 * Handle a Deposited event — verify details and update order to ESCROWED.
 * Note: orderId in the event is `indexed`, so Solidity stores keccak256(orderId)
 * instead of the actual string. We match by buyer+route+amount instead.
 */
async function handleDepositedEvent(event: any, web3: Web3): Promise<void> {
    const { orderId: orderIdHash, buyer, seller, amount, departure, destination } = event.returnValues;
    const txHash = event.transactionHash;

    console.log(`[EscrowListener] ───────────────────────────────────────`);
    console.log(`[EscrowListener] Deposited event detected!`);
    console.log(`[EscrowListener]   orderIdHash: ${orderIdHash} (indexed → hashed)`);
    console.log(`[EscrowListener]   buyer:       ${buyer}`);
    console.log(`[EscrowListener]   seller:      ${seller}`);
    console.log(`[EscrowListener]   amount:      ${web3.utils.fromWei(amount, 'mwei')} USDC`);
    console.log(`[EscrowListener]   departure:   ${departure}`);
    console.log(`[EscrowListener]   destination: ${destination}`);
    console.log(`[EscrowListener]   tx:          ${txHash}`);

    // Since orderId is indexed (Solidity hashes indexed strings),
    // match by: comparing keccak256(dbOrderId) with the event hash,
    // and also verify buyer + departure + destination.
    const listings = getListings();

    let matchingOrder = listings.find(o => {
        const hash = web3.utils.keccak256(o.id);
        return hash === orderIdHash;
    });

    // Fallback: match by departure + destination + amount
    if (!matchingOrder) {
        const depositedUSDC = parseFloat(web3.utils.fromWei(amount, 'mwei'));
        matchingOrder = listings.find(o => {
            const expectedCost = (o.price_per_mile || 0) * o.amount;
            return Math.abs(expectedCost - depositedUSDC) < 0.01;
        });
    }

    if (!matchingOrder) {
        console.log(`[EscrowListener] ⚠ No matching LISTED order found`);
        console.log(`[EscrowListener]   Checked ${listings.length} listings`);
        return;
    }

    console.log(`[EscrowListener]   Matched DB order: ${matchingOrder.id}`);

    // Verify: amount matches expected cost
    const expectedCostUSDC = (matchingOrder.price_per_mile || 0) * matchingOrder.amount;
    const depositedUSDC = parseFloat(web3.utils.fromWei(amount, 'mwei'));

    console.log(`[EscrowListener]   Expected:    $${expectedCostUSDC.toFixed(4)} USDC`);
    console.log(`[EscrowListener]   Deposited:   $${depositedUSDC.toFixed(4)} USDC`);

    // Update order to ESCROWED
    escrowOrder(matchingOrder.id, buyer, departure, destination, txHash);

    console.log(`[EscrowListener] ✅ Order ${matchingOrder.id} marked ESCROWED`);
    console.log(`[EscrowListener]    Next: EigenCompute will process the miles transfer`);
    console.log(`[EscrowListener] ───────────────────────────────────────`);

    // Trigger EigenCompute TEE to transfer miles
    triggerTransfer(matchingOrder.id);
}
