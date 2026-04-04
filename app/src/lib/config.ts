/**
 * Client-side configuration for the Whisper app.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export const AGENT_ENDPOINT = `${API_BASE_URL}/api/agent`
export const BALANCES_ENDPOINT = `${API_BASE_URL}/api/balances`
export const CONVERSATIONS_ENDPOINT = `${API_BASE_URL}/api/conversations`
