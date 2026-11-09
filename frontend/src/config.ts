export const CONFIG = {
  ETH_CHAIN_ID: 11155111, // Sepolia
  ETH_CHAIN_HEX: "0xaa36a7",
  ETH_RPC_URL: import.meta.env.VITE_ETH_RPC_URL,

  BASE_CHAIN_ID: 84532, // Base Sepolia
  BASE_CHAIN_HEX: "0x14a34",
  BASE_RPC_URL: import.meta.env.VITE_BASE_RPC_URL,

  TOKEN_ADDRESS: "0xYourTokenAddressOnEth",
  WTOKEN_ADDRESS: "0xYourWTokenAddressOnBase",
  BRIDGE_ETH_ADDRESS: "0xYourBridgeEthAddress",
  BRIDGE_BASE_ADDRESS: "0xYourBridgeBaseAddress",
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