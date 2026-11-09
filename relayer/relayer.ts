import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const {
  ETH_RPC_URL,
  BASE_RPC_URL,
  BRIDGE_ETH_ADDRESS,
  BRIDGE_BASE_ADDRESS,
  OWNER_PRIVATE_KEY,
} = process.env;

if (
  !ETH_RPC_URL ||
  !BASE_RPC_URL ||
  !BRIDGE_ETH_ADDRESS ||
  !BRIDGE_BASE_ADDRESS ||
  !OWNER_PRIVATE_KEY
) {
  throw new Error("Missing required environment variables in .env");
}

// Minimal human-readable ABIs matching BridgeETH and BridgeBase
const BRIDGE_ETH_ABI = [
  "event Deposit(address indexed depositor, uint256 amount)",
  "function burnedOnOppositeChain(address userAccount, uint256 _amount) external",
  "function pendingBalance(address user) external view returns (uint256)",
];

const BRIDGE_BASE_ABI = [
  "event Burn(address indexed burner, uint256 amount)",
  "function depositedOnOppositeChain(address userAccount, uint256 _amount) external",
  "function pendingBalance(address user) external view returns (uint256)",
];

function createProvider(url: string): ethers.Provider {
  return url.startsWith("ws")
    ? new ethers.WebSocketProvider(url)
    : new ethers.JsonRpcProvider(url);
}

// Simple promise queue to serialize transactions per chain and avoid nonce races
class TxQueue {
  private queue: Promise<void> = Promise.resolve();

  enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((err) => {
      console.error("Transaction task failed:", err);
    });
    return this.queue;
  }
}

async function main() {
  const ethProvider = createProvider(ETH_RPC_URL!);
  const baseProvider = createProvider(BASE_RPC_URL!);

  const ethWallet = new ethers.Wallet(OWNER_PRIVATE_KEY!, ethProvider);
  const baseWallet = new ethers.Wallet(OWNER_PRIVATE_KEY!, baseProvider);

  const bridgeEth = new ethers.Contract(
    BRIDGE_ETH_ADDRESS!,
    BRIDGE_ETH_ABI,
    ethWallet
  );
  const bridgeBase = new ethers.Contract(
    BRIDGE_BASE_ADDRESS!,
    BRIDGE_BASE_ABI,
    baseWallet
  );

  const ethTxQueue = new TxQueue();
  const baseTxQueue = new TxQueue();

  console.log(`Relayer started with owner address: ${ethWallet.address}`);
  console.log(`Watching BridgeETH at ${BRIDGE_ETH_ADDRESS}`);
  console.log(`Watching BridgeBase at ${BRIDGE_BASE_ADDRESS}`);

  // 1. Listen for Deposit on Ethereum -> Credit pendingBalance on Base
  bridgeEth.on(
    "Deposit",
    (depositor: string, amount: bigint, event: ethers.ContractEventPayload) => {
      const txHash = event.log.transactionHash;
      console.log(
        `[ETH -> BASE] Deposit detected | User: ${depositor} | Amount: ${amount.toString()} | Tx: ${txHash}`
      );

      baseTxQueue.enqueue(async () => {
        try {
          const tx = await bridgeBase.depositedOnOppositeChain!(
            depositor,
            amount
          );
          console.log(
            `[BASE] Submitted depositedOnOppositeChain | Tx: ${tx.hash}`
          );
          const receipt = await tx.wait(1);
          console.log(
            `[BASE] Confirmed in block ${receipt?.blockNumber} for ${depositor}`
          );
        } catch (error) {
          console.error(
            `[BASE] Failed to process Deposit (${txHash}) for ${depositor}:`,
            error
          );
        }
      });
    }
  );

  // 2. Listen for Burn on Base -> Credit pendingBalance on Ethereum
  bridgeBase.on(
    "Burn",
    (burner: string, amount: bigint, event: ethers.ContractEventPayload) => {
      const txHash = event.log.transactionHash;
      console.log(
        `[BASE -> ETH] Burn detected | User: ${burner} | Amount: ${amount.toString()} | Tx: ${txHash}`
      );

      ethTxQueue.enqueue(async () => {
        try {
          const tx = await bridgeEth.burnedOnOppositeChain!(burner, amount);
          console.log(`[ETH] Submitted burnedOnOppositeChain | Tx: ${tx.hash}`);
          const receipt = await tx.wait(1);
          console.log(
            `[ETH] Confirmed in block ${receipt?.blockNumber} for ${burner}`
          );
        } catch (error) {
          console.error(
            `[ETH] Failed to process Burn (${txHash}) for ${burner}:`,
            error
          );
        }
      });
    }
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down relayer...");
    await bridgeEth.removeAllListeners();
    await bridgeBase.removeAllListeners();
    if (ethProvider instanceof ethers.WebSocketProvider) {
      await ethProvider.destroy();
    }
    if (baseProvider instanceof ethers.WebSocketProvider) {
      await baseProvider.destroy();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error starting relayer:", error);
  process.exit(1);
});