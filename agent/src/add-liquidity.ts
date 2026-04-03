import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { createPublicClient, createWalletClient, http, parseEther, parseUnits, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { getEnvOrThrow } from './config.js'

const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

// Uniswap V3 addresses on Base Sepolia
const POSITION_MANAGER = '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2' // NonfungiblePositionManager
const FACTORY = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' // UniswapV3Factory

async function main() {
  const account = privateKeyToAccount(getEnvOrThrow('PRIVATE_KEY') as `0x${string}`)
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(getEnvOrThrow('BASE_SEPOLIA_RPC_URL')) })
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(getEnvOrThrow('BASE_SEPOLIA_RPC_URL')) })

  console.log('Wallet:', account.address)

  // Step 1: Wrap 0.01 ETH → WETH
  console.log('\n1️⃣  Wrapping 0.01 ETH → WETH...')
  const wrapTx = await walletClient.sendTransaction({
    to: WETH as `0x${string}`,
    value: parseEther('0.01'),
    data: '0xd0e30db0' as `0x${string}`, // deposit()
  })
  console.log('Wrap tx:', wrapTx)
  await publicClient.waitForTransactionReceipt({ hash: wrapTx })
  console.log('Wrapped ✓')

  // Step 2: Approve USDC + WETH to Position Manager
  console.log('\n2️⃣  Approving tokens...')
  const approveAbi = [{
    name: 'approve', type: 'function' as const,
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable' as const,
  }]

  const approveUSDC = await walletClient.writeContract({
    address: USDC as `0x${string}`,
    abi: approveAbi,
    functionName: 'approve',
    args: [POSITION_MANAGER as `0x${string}`, parseUnits('5', 6)],
  })
  await publicClient.waitForTransactionReceipt({ hash: approveUSDC })
  console.log('USDC approved ✓')

  const approveWETH = await walletClient.writeContract({
    address: WETH as `0x${string}`,
    abi: approveAbi,
    functionName: 'approve',
    args: [POSITION_MANAGER as `0x${string}`, parseEther('0.01')],
  })
  await publicClient.waitForTransactionReceipt({ hash: approveWETH })
  console.log('WETH approved ✓')

  // Step 3: Create pool + add liquidity via mint
  // token0 must be < token1 (sorted by address)
  const token0 = USDC.toLowerCase() < WETH.toLowerCase() ? USDC : WETH
  const token1 = USDC.toLowerCase() < WETH.toLowerCase() ? WETH : USDC
  const isUSDCToken0 = token0.toLowerCase() === USDC.toLowerCase()

  console.log('\n3️⃣  Adding liquidity...')
  console.log('token0:', token0, isUSDCToken0 ? '(USDC)' : '(WETH)')
  console.log('token1:', token1, isUSDCToken0 ? '(WETH)' : '(USDC)')

  // Fee tier: 3000 (0.3%)
  const fee = 3000

  // Price: ~1 USDC = 0.0003 ETH (i.e. 1 ETH = ~3333 USDC)
  // sqrtPriceX96 depends on token ordering
  // If USDC is token0: price = WETH/USDC = 0.0003, sqrt(0.0003) * 2^96 ≈ 1.37e15
  // If WETH is token0: price = USDC/WETH = 3333, sqrt(3333) * 2^96 ≈ 4.57e18
  // Using wide tick range to ensure we provide liquidity

  // Use createAndInitializePoolIfNecessary + mint via multicall
  const mintAbi = [{
    name: 'createAndInitializePoolIfNecessary',
    type: 'function' as const,
    inputs: [
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'payable' as const,
  }, {
    name: 'mint',
    type: 'function' as const,
    inputs: [{
      name: 'params', type: 'tuple',
      components: [
        { name: 'token0', type: 'address' },
        { name: 'token1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickLower', type: 'int24' },
        { name: 'tickUpper', type: 'int24' },
        { name: 'amount0Desired', type: 'uint256' },
        { name: 'amount1Desired', type: 'uint256' },
        { name: 'amount0Min', type: 'uint256' },
        { name: 'amount1Min', type: 'uint256' },
        { name: 'recipient', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ]
    }],
    outputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'payable' as const,
  }, {
    name: 'multicall',
    type: 'function' as const,
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable' as const,
  }]

  // sqrtPriceX96 for ~3333 USDC/WETH ratio
  // If USDC (6 dec) is token0, WETH (18 dec) is token1:
  //   price = amount1/amount0 in raw units = (WETH_raw / USDC_raw)
  //   For 1 USDC (1e6) = 0.0003 WETH (3e14):  price = 3e14 / 1e6 = 3e8
  //   sqrtPriceX96 = sqrt(3e8) * 2^96 = 17320.5 * 79228162514264337593543950336 ≈ 1.372e21
  const sqrtPriceX96 = isUSDCToken0
    ? 1372000000000000000000n   // USDC is token0
    : 4572000000000000000000000000000000000000n // WETH is token0 (unlikely since 0x03.. < 0x42..)

  // Wide tick range: -887220 to 887220 (full range for 0.3% fee, tick spacing = 60)
  const tickLower = -887220
  const tickUpper = 887220

  const amount0 = isUSDCToken0 ? parseUnits('2', 6) : parseEther('0.005')   // 2 USDC or 0.005 WETH
  const amount1 = isUSDCToken0 ? parseEther('0.005') : parseUnits('2', 6)   // 0.005 WETH or 2 USDC

  // Encode multicall: createPool + mint
  const createPoolData = encodeFunctionData({
    abi: mintAbi,
    functionName: 'createAndInitializePoolIfNecessary',
    args: [token0 as `0x${string}`, token1 as `0x${string}`, fee, sqrtPriceX96],
  })

  const mintData = encodeFunctionData({
    abi: mintAbi,
    functionName: 'mint',
    args: [{
      token0: token0 as `0x${string}`,
      token1: token1 as `0x${string}`,
      fee,
      tickLower,
      tickUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: account.address,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }],
  })

  const multicallData = encodeFunctionData({
    abi: mintAbi,
    functionName: 'multicall',
    args: [[createPoolData, mintData]],
  })

  try {
    const tx = await walletClient.sendTransaction({
      to: POSITION_MANAGER as `0x${string}`,
      data: multicallData,
    })
    console.log('✅ Liquidity added!')
    console.log('Tx:', tx)
    console.log('Explorer: https://sepolia.basescan.org/tx/' + tx)

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    console.log('Status:', receipt.status)
  } catch (e: any) {
    console.error('❌ Failed:', e.message)

    // Try just createPool first, then mint separately
    console.log('\nTrying createPool separately...')
    try {
      const poolTx = await walletClient.sendTransaction({
        to: POSITION_MANAGER as `0x${string}`,
        data: createPoolData,
      })
      console.log('Pool tx:', poolTx)
      await publicClient.waitForTransactionReceipt({ hash: poolTx })
      console.log('Pool created ✓')

      console.log('Now minting position...')
      const mintTx = await walletClient.sendTransaction({
        to: POSITION_MANAGER as `0x${string}`,
        data: mintData,
      })
      console.log('✅ Mint tx:', mintTx)
      await publicClient.waitForTransactionReceipt({ hash: mintTx })
      console.log('Liquidity added ✓')
    } catch (e2: any) {
      console.error('❌ Also failed:', e2.message)
    }
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
