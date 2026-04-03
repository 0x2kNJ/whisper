import dotenv from 'dotenv'
import { resolve } from 'path'
// Load .env from project root (two levels up from agent/src/)
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })
import type { ChainConfig } from './types.js'

export const UNISWAP_API_BASE = 'https://trade-api.gateway.uniswap.org/v1'
export const UNLINK_API_BASE = 'https://api.unlink.xyz'

export const baseSepolia: ChainConfig = {
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || '',
  name: 'Base Sepolia',
  tokens: {
    USDC: {
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      symbol: 'USDC',
      decimals: 6,
    },
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
    },
  },
}

export const arcTestnet: ChainConfig = {
  chainId: 5042002,
  rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  name: 'Arc Testnet',
  tokens: {
    USDC: {
      address: '0x3600000000000000000000000000000000000000',
      symbol: 'USDC',
      decimals: 6,
    },
  },
}

export const UNLINK_POOL = '0x647f9b99af97e4b79DD9Dd6de3b583236352f482'

export function getEnvOrThrow(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}
