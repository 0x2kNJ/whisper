/**
 * Client-side configuration for the Whisper app.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export const AGENT_ENDPOINT = `${API_BASE_URL}/api/agent`

/** Placeholder balance shown in the sidebar (hardcoded for demo) */
export const PLACEHOLDER_BALANCES = [
  { token: 'USDC', amount: '12,450.00', chain: 'Base Sepolia' },
  { token: 'WETH', amount: '3.2500', chain: 'Base Sepolia' },
  { token: 'USDC', amount: '5,000.00', chain: 'Arc Testnet' },
]

export const PLACEHOLDER_WALLET = '0x1a2b...9f0e'
