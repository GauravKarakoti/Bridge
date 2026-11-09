export const CONFIG = {
  ETH_CHAIN_ID: 11155111, // Sepolia
  ETH_CHAIN_HEX: "0xaa36a7",
  ETH_RPC_URL: import.meta.env.VITE_ETH_RPC_URL,

  BASE_CHAIN_ID: 84532, // Base Sepolia
  BASE_CHAIN_HEX: "0x14a34",
  BASE_RPC_URL: import.meta.env.VITE_BASE_RPC_URL,

  TOKEN_ADDRESS: "0x4aD9383e97CfEC2025e0D07124849715F84A24ff",
  WTOKEN_ADDRESS: "0x2E1fa302932a133E7144719b9c02269c3158AAd9",
  BRIDGE_ETH_ADDRESS: "0x0E5f178Fdc45B9EB7304BcbaAf38f78D4786B8D1",
  BRIDGE_BASE_ADDRESS: "0xECD6f5268126a0d36dD6D1D4629146C1abA49Fd3",
};

export const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function decimals() external view returns (uint8)",
];

export const BRIDGE_ETH_ABI = [
  "function deposit(address _tokenAddress, uint256 _amount) external",
  "function withdraw(address _tokenAddress, uint256 _amount) external",
  "function pendingBalance(address user) external view returns (uint256)",
  "event Deposit(address indexed depositor, uint256 amount)",
];

export const BRIDGE_BASE_ABI = [
  "function burn(address _tokenAddress, uint256 _amount) external",
  "function withdraw(address _tokenAddress, uint256 _amount) external",
  "function pendingBalance(address user) external view returns (uint256)",
  "event Burn(address indexed burner, uint256 amount)",
];