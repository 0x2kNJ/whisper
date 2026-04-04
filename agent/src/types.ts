export interface TokenConfig {
  address: string
  symbol: string
  decimals: number
}

export interface ChainConfig {
  chainId: number
  rpcUrl: string
  name: string
  tokens: Record<string, TokenConfig>
}

export interface PayrollRecipient {
  address: string
  amount: string
  name?: string
}

export interface SwapQuote {
  routing: string
  quote: {
    amountIn: string
    amountOut: string
    priceImpact: string
    route: string
  }
  permitData?: unknown
  gasFee?: string
}

export interface PaymentReceipt {
  paymentId: string
  recipient: string
  amount: string
  token: string
  timestamp: number
  txHash: string
  chain: string
  private: boolean
  signature?: string
}

export interface EscrowMilestone {
  amount: string
  unlockTime: number
  oracle: string
  triggerPrice: string
  operator: 'GT' | 'LT'
  released: boolean
}

export interface PayrollConfig {
  id: string
  recipients: PayrollRecipient[]
  token: string
  schedule: string
  ownerAddress: string
  signature: string
  createdAt: number
}

export type ToolName =
  | 'check_balance'
  | 'get_quote'
  | 'private_transfer'
  | 'private_swap'
  | 'deposit_to_unlink'
  | 'create_escrow'
  | 'schedule_payroll'
  | 'check_escrow'
  | 'list_strategies'
  | 'get_strategy'
  | 'create_strategy'
  | 'pause_strategy'
  | 'resume_strategy'
  | 'edit_strategy'
  | 'batch_private_transfer'
  | 'private_cross_chain_transfer'
  | 'encrypt_payroll_message'
  | 'decrypt_payroll_message'
  | 'execute_strategy'
  | 'save_contact'
  | 'lookup_contact'
  | 'list_contacts'
