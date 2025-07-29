import { randomBytes } from 'crypto';
import { solidityPackedKeccak256 } from 'ethers';
import { HashLock } from '@1inch/cross-chain-sdk';

/**
 * Generate random 32-byte hex string with 0x prefix
 * Required for fusion+ secret generation
 */
export function getRandomBytes32(): string {
  return '0x' + Buffer.from(randomBytes(32)).toString('hex');
}

/**
 * Generate secrets and hash locks for fusion orders
 */
export function generateSecretsAndHashLock(secretsCount: number) {
  const secrets = Array.from({ length: secretsCount }).map(() => getRandomBytes32());
  const secretHashes = secrets.map(x => HashLock.hashSecret(x));

  const hashLock = secretsCount === 1
    ? HashLock.forSingleFill(secrets[0])
    : HashLock.forMultipleFills(
        secretHashes.map((secretHash, i) =>
          solidityPackedKeccak256(['uint64', 'bytes32'], [i, secretHash.toString()])
        )
      );

  return {
    secrets,
    secretHashes,
    hashLock
  };
}

/**
 * Chain-agnostic asset interface for different token standards
 */
export interface UniversalAsset {
  chainId: string | number;
  address: string;
  symbol: string;
  decimals: number;
  standard: 'ERC20' | 'FA1.2' | 'FA2' | 'APTOS_COIN' | 'SUI_COIN' | 'NATIVE';
}

/**
 * Universal transaction parameters for cross-chain compatibility
 */
export interface UniversalTxParams {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  nonce?: number;
  chainSpecific?: Record<string, any>; // For chain-specific parameters
}

/**
 * Order lifecycle states
 */
export enum OrderStatus {
  CREATED = 'created',
  PENDING = 'pending',
  PARTIALLY_FILLED = 'partially_filled',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  FAILED = 'failed'
}

/**
 * Universal order interface for cross-chain fusion orders
 */
export interface UniversalOrder {
  orderHash: string;
  srcChain: string | number;
  dstChain: string | number;
  srcAsset: UniversalAsset;
  dstAsset: UniversalAsset;
  amount: string;
  minReturn: string;
  maker: string;
  taker?: string;
  deadline: number;
  status: OrderStatus;
  fills: OrderFill[];
  secrets?: string[];
  secretHashes?: string[];
  hashLock?: any;
}

/**
 * Order fill information
 */
export interface OrderFill {
  idx: number;
  amount: string;
  txHash: string;
  timestamp: number;
  resolver: string;
}

/**
 * Validate order parameters before submission
 */
export function validateOrderParams(order: Partial<UniversalOrder>): boolean {
  const required = ['srcChain', 'dstChain', 'srcAsset', 'dstAsset', 'amount', 'maker', 'deadline'];
  
  for (const field of required) {
    if (!order[field as keyof UniversalOrder]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate amount is positive
  if (BigInt(order.amount!) <= 0n) {
    throw new Error('Amount must be positive');
  }

  // Validate deadline is in the future
  if (order.deadline! <= Math.floor(Date.now() / 1000)) {
    throw new Error('Deadline must be in the future');
  }

  return true;
}

/**
 * Calculate order hash for tracking
 */
export function calculateOrderHash(order: Partial<UniversalOrder>): string {
  const orderData = {
    srcChain: order.srcChain,
    dstChain: order.dstChain,
    srcAsset: order.srcAsset?.address,
    dstAsset: order.dstAsset?.address,
    amount: order.amount,
    maker: order.maker,
    deadline: order.deadline
  };

  return solidityPackedKeccak256(
    ['string'],
    [JSON.stringify(orderData)]
  );
}

/**
 * Format amount for different chain decimal systems
 */
export function formatAmount(amount: string, decimals: number): string {
  const amountBN = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  return (amountBN * BigInt(10 ** 18) / divisor).toString();
}

/**
 * Parse amount from different chain decimal systems
 */
export function parseAmount(amount: string, decimals: number): string {
  const amountBN = BigInt(amount);
  const multiplier = BigInt(10 ** decimals);
  return (amountBN * multiplier / BigInt(10 ** 18)).toString();
}

/**
 * Sleep utility for polling operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry utility for network operations
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }

  throw lastError!;
}
