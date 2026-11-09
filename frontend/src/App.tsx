import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  CONFIG,
  ERC20_ABI,
  BRIDGE_ETH_ABI,
  BRIDGE_BASE_ABI,
} from "./config";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type Direction = "ETH_TO_BASE" | "BASE_TO_ETH";

export default function App() {
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>("ETH_TO_BASE");
  const [amount, setAmount] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Balances formatted in standard units (18 decimals)
  const [tkBalance, setTkBalance] = useState<string>("0.0");
  const [wtkBalance, setWtkBalance] = useState<string>("0.0");
  const [pendingOnEth, setPendingOnEth] = useState<string>("0.0");
  const [pendingOnBase, setPendingOnBase] = useState<string>("0.0");

  // Connect MetaMask / injected wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus("Please install MetaMask to use this bridge.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      setStatus("");
    } catch (err: any) {
      setStatus(err.message || "Failed to connect wallet");
    }
  };

  // Fetch balances across both chains regardless of active wallet network
  const fetchBalances = useCallback(async () => {
    if (!account) return;
    try {
      const ethProvider = new ethers.JsonRpcProvider(CONFIG.ETH_RPC_URL);
      const baseProvider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC_URL);

      const tokenContract = new ethers.Contract(
        CONFIG.TOKEN_ADDRESS,
        ERC20_ABI,
        ethProvider
      );
      const wTokenContract = new ethers.Contract(
        CONFIG.WTOKEN_ADDRESS,
        ERC20_ABI,
        baseProvider
      );
      const bridgeEthContract = new ethers.Contract(
        CONFIG.BRIDGE_ETH_ADDRESS,
        BRIDGE_ETH_ABI,
        ethProvider
      );
      const bridgeBaseContract = new ethers.Contract(
        CONFIG.BRIDGE_BASE_ADDRESS,
        BRIDGE_BASE_ABI,
        baseProvider
      );

      const [tkBal, wtkBal, ethPending, basePending] = await Promise.all([
        tokenContract.balanceOf(account),
        wTokenContract.balanceOf(account),
        bridgeEthContract.pendingBalance(account),
        bridgeBaseContract.pendingBalance(account),
      ]);

      setTkBalance(ethers.formatUnits(tkBal, 18));
      setWtkBalance(ethers.formatUnits(wtkBal, 18));
      setPendingOnEth(ethers.formatUnits(ethPending, 18));
      setPendingOnBase(ethers.formatUnits(basePending, 18));
    } catch (err) {
      console.error("Error fetching cross-chain balances:", err);
    }
  }, [account]);

  // Poll balances every 5 seconds so relayer updates appear automatically
  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 5000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  // Listen for account or network changes in wallet
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts: string[]) =>
      setAccount(accounts[0] || "");
    const handleChainChanged = (hexChainId: string) =>
      setChainId(parseInt(hexChainId, 16));

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  // Ensure wallet is on the required network before signing
  const ensureNetwork = async (targetChainId: number, targetHex: string) => {
    if (chainId !== targetChainId) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }],
      });
    }
  };

  // Step 1A: Approve & Deposit TK on BridgeETH
  const handleDepositEth = async () => {
    if (!amount || Number(amount) <= 0) return;
    setLoading(true);
    try {
      await ensureNetwork(CONFIG.ETH_CHAIN_ID, CONFIG.ETH_CHAIN_HEX);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const parsedAmount = ethers.parseUnits(amount, 18);

      const token = new ethers.Contract(CONFIG.TOKEN_ADDRESS, ERC20_ABI, signer);
      const bridgeEth = new ethers.Contract(
        CONFIG.BRIDGE_ETH_ADDRESS,
        BRIDGE_ETH_ABI,
        signer
      );

      setStatus("Checking token allowance...");
      const allowance: bigint = await token.allowance(
        account,
        CONFIG.BRIDGE_ETH_ADDRESS
      );

      if (allowance < parsedAmount) {
        setStatus("Approving TK for BridgeETH...");
        const approveTx = await token.approve(
          CONFIG.BRIDGE_ETH_ADDRESS,
          parsedAmount
        );
        await approveTx.wait();
      }

      setStatus("Depositing TK into BridgeETH...");
      const depositTx = await bridgeEth.deposit(
        CONFIG.TOKEN_ADDRESS,
        parsedAmount
      );
      await depositTx.wait();

      setStatus(
        "Deposit confirmed! Waiting for relayer to credit pending WTK on Base..."
      );
      setAmount("");
      await fetchBalances();
    } catch (err: any) {
      setStatus(err.reason || err.message || "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  // Step 1B: Burn WTK on BridgeBase
  const handleBurnBase = async () => {
    if (!amount || Number(amount) <= 0) return;
    setLoading(true);
    try {
      await ensureNetwork(CONFIG.BASE_CHAIN_ID, CONFIG.BASE_CHAIN_HEX);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const parsedAmount = ethers.parseUnits(amount, 18);

      const bridgeBase = new ethers.Contract(
        CONFIG.BRIDGE_BASE_ADDRESS,
        BRIDGE_BASE_ABI,
        signer
      );

      setStatus("Burning WTK on BridgeBase...");
      const burnTx = await bridgeBase.burn(CONFIG.WTOKEN_ADDRESS, parsedAmount);
      await burnTx.wait();

      setStatus(
        "Burn confirmed! Waiting for relayer to credit pending TK on Ethereum..."
      );
      setAmount("");
      await fetchBalances();
    } catch (err: any) {
      setStatus(err.reason || err.message || "Burn failed");
    } finally {
      setLoading(false);
    }
  };

  // Step 2A: Claim WTK on Base after Deposit on ETH
  const handleClaimOnBase = async () => {
    if (Number(pendingOnBase) <= 0) return;
    setLoading(true);
    try {
      await ensureNetwork(CONFIG.BASE_CHAIN_ID, CONFIG.BASE_CHAIN_HEX);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const bridgeBase = new ethers.Contract(
        CONFIG.BRIDGE_BASE_ADDRESS,
        BRIDGE_BASE_ABI,
        signer
      );

      const claimAmount = ethers.parseUnits(pendingOnBase, 18);
      setStatus("Claiming WTK from BridgeBase...");
      const tx = await bridgeBase.withdraw(CONFIG.WTOKEN_ADDRESS, claimAmount);
      await tx.wait();

      setStatus("Successfully minted WTK on Base!");
      await fetchBalances();
    } catch (err: any) {
      setStatus(err.reason || err.message || "Claim on Base failed");
    } finally {
      setLoading(false);
    }
  };

  // Step 2B: Claim TK on Ethereum after Burn on Base
  const handleClaimOnEth = async () => {
    if (Number(pendingOnEth) <= 0) return;
    setLoading(true);
    try {
      await ensureNetwork(CONFIG.ETH_CHAIN_ID, CONFIG.ETH_CHAIN_HEX);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const bridgeEth = new ethers.Contract(
        CONFIG.BRIDGE_ETH_ADDRESS,
        BRIDGE_ETH_ABI,
        signer
      );

      const claimAmount = ethers.parseUnits(pendingOnEth, 18);
      setStatus("Withdrawing unlocked TK from BridgeETH...");
      const tx = await bridgeEth.withdraw(CONFIG.TOKEN_ADDRESS, claimAmount);
      await tx.wait();

      setStatus("Successfully withdrew TK on Ethereum!");
      await fetchBalances();
    } catch (err: any) {
      setStatus(err.reason || err.message || "Claim on Ethereum failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            ETH ⇄ Base Bridge
          </h1>
          {!account ? (
            <button
              onClick={connectWallet}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition"
            >
              Connect Wallet
            </button>
          ) : (
            <span className="text-xs font-mono bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
          )}
        </div>

        {/* Wallet Balances */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 text-sm">
          <div>
            <p className="text-slate-400 text-xs">ETH Balance (TK)</p>
            <p className="font-semibold text-base mt-0.5">{tkBalance}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Base Balance (WTK)</p>
            <p className="font-semibold text-base mt-0.5">{wtkBalance}</p>
          </div>
        </div>

        {/* Direction Toggle */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setDirection("ETH_TO_BASE")}
            className={`py-2 text-sm font-medium rounded-lg transition ${
              direction === "ETH_TO_BASE"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ETH → Base (Lock)
          </button>
          <button
            onClick={() => setDirection("BASE_TO_ETH")}
            className={`py-2 text-sm font-medium rounded-lg transition ${
              direction === "BASE_TO_ETH"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Base → ETH (Burn)
          </button>
        </div>

        {/* Transfer Input */}
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            Amount of {direction === "ETH_TO_BASE" ? "TK to Lock" : "WTK to Burn"}
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() =>
                setAmount(direction === "ETH_TO_BASE" ? tkBalance : wtkBalance)
              }
              className="absolute right-3 top-3 text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-md text-indigo-400 font-medium"
            >
              MAX
            </button>
          </div>

          <button
            disabled={!account || loading || !amount}
            onClick={
              direction === "ETH_TO_BASE" ? handleDepositEth : handleBurnBase
            }
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-semibold transition"
          >
            {loading
              ? "Processing..."
              : direction === "ETH_TO_BASE"
              ? "Approve & Deposit TK on ETH"
              : "Burn WTK on Base"}
          </button>
        </div>

        {/* Claimable Pending Balances */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Claimable Bridge Balances
          </h2>

          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div>
              <p className="text-xs text-slate-400">Pending WTK on Base</p>
              <p className="font-semibold">{pendingOnBase} WTK</p>
            </div>
            <button
              disabled={!account || loading || Number(pendingOnBase) <= 0}
              onClick={handleClaimOnBase}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 rounded-lg text-xs font-semibold transition"
            >
              Claim WTK
            </button>
          </div>

          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div>
              <p className="text-xs text-slate-400">Pending TK on ETH</p>
              <p className="font-semibold">{pendingOnEth} TK</p>
            </div>
            <button
              disabled={!account || loading || Number(pendingOnEth) <= 0}
              onClick={handleClaimOnEth}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 rounded-lg text-xs font-semibold transition"
            >
              Claim TK
            </button>
          </div>
        </div>

        {/* Status Message */}
        {status && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 break-words">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}