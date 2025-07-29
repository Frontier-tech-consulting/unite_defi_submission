import { UniversalOrder, UniversalTxParams, UniversalAsset, OrderFill } from '../utils/fusionUtils';

/**
 * Signature schemes supported by different chains
 */
export enum SignatureScheme {
  ECDSA_SECP256K1 = 'ecdsa_secp256k1', // Ethereum, Bitcoin
  ED25519 = 'ed25519', // Aptos, Sui, Tezos
  SCHNORR = 'schnorr' // Future Bitcoin, some L2s
}

/**
 * Chain-specific transaction result
 */
export interface ChainTxResult {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  status: 'pending' | 'confirmed' | 'failed';
  chainSpecific?: Record<string, any>;
}

/**
 * Chain adapter interface for protocol abstraction
 */
export interface IChainAdapter {
  readonly chainId: string | number;
  readonly chainName: string;
  readonly signatureScheme: SignatureScheme;
  readonly nativeAsset: UniversalAsset;

  // Connection and setup
  connect(config: ChainConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account management
  getAddress(): Promise<string>;
  getBalance(asset: UniversalAsset, address?: string): Promise<string>;
  getNonce(address?: string): Promise<number>;

  // Transaction operations
  signTransaction(txParams: UniversalTxParams): Promise<string>;
  signMessage(message: string): Promise<string>;
  broadcastTransaction(signedTx: string): Promise<ChainTxResult>;
  getTransactionStatus(txHash: string): Promise<ChainTxResult>;

  // Asset operations
  approveAsset(asset: UniversalAsset, spender: string, amount: string): Promise<ChainTxResult>;
  getAssetAllowance(asset: UniversalAsset, owner: string, spender: string): Promise<string>;

  // Order-specific operations
  createOrder(order: UniversalOrder): Promise<string>;
  cancelOrder(orderHash: string): Promise<ChainTxResult>;
  fillOrder(orderHash: string, fillAmount: string, secret: string): Promise<ChainTxResult>;

  // Event monitoring
  subscribeToEvents(eventTypes: string[], callback: (event: ChainEvent) => void): Promise<void>;
  unsubscribeFromEvents(): Promise<void>;
  getOrderEvents(orderHash: string): Promise<ChainEvent[]>;

  // Hash lock operations
  createHashLock(secret: string, timelock: number): Promise<string>;
  revealSecret(hashLock: string, secret: string): Promise<ChainTxResult>;
  refundHashLock(hashLock: string): Promise<ChainTxResult>;

  // Chain-specific utilities
  estimateGas(txParams: UniversalTxParams): Promise<string>;
  getCurrentBlockNumber(): Promise<number>;
  getBlockTimestamp(blockNumber?: number): Promise<number>;
}

/**
 * Chain configuration interface
 */
export interface ChainConfig {
  rpcUrl: string;
  privateKey?: string;
  mnemonic?: string;
  apiKey?: string;
  networkId?: string | number;
  contractAddresses?: Record<string, string>;
  customParams?: Record<string, any>;
}

/**
 * Chain event interface
 */
export interface ChainEvent {
  eventType: string;
  orderHash?: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  data: Record<string, any>;
}

/**
 * Abstract base class for chain adapters
 */
export abstract class BaseChainAdapter implements IChainAdapter {
  abstract readonly chainId: string | number;
  abstract readonly chainName: string;
  abstract readonly signatureScheme: SignatureScheme;
  abstract readonly nativeAsset: UniversalAsset;

  protected config?: ChainConfig;
  protected connected: boolean = false;

  async connect(config: ChainConfig): Promise<void> {
    this.config = config;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  protected ensureConnected(): void {
    if (!this.connected || !this.config) {
      throw new Error(`Chain adapter for ${this.chainName} is not connected`);
    }
  }

  // Abstract methods that must be implemented by each chain adapter
  abstract getAddress(): Promise<string>;
  abstract getBalance(asset: UniversalAsset, address?: string): Promise<string>;
  abstract getNonce(address?: string): Promise<number>;
  abstract signTransaction(txParams: UniversalTxParams): Promise<string>;
  abstract signMessage(message: string): Promise<string>;
  abstract broadcastTransaction(signedTx: string): Promise<ChainTxResult>;
  abstract getTransactionStatus(txHash: string): Promise<ChainTxResult>;
  abstract approveAsset(asset: UniversalAsset, spender: string, amount: string): Promise<ChainTxResult>;
  abstract getAssetAllowance(asset: UniversalAsset, owner: string, spender: string): Promise<string>;
  abstract createOrder(order: UniversalOrder): Promise<string>;
  abstract cancelOrder(orderHash: string): Promise<ChainTxResult>;
  abstract fillOrder(orderHash: string, fillAmount: string, secret: string): Promise<ChainTxResult>;
  abstract subscribeToEvents(eventTypes: string[], callback: (event: ChainEvent) => void): Promise<void>;
  abstract unsubscribeFromEvents(): Promise<void>;
  abstract getOrderEvents(orderHash: string): Promise<ChainEvent[]>;
  abstract createHashLock(secret: string, timelock: number): Promise<string>;
  abstract revealSecret(hashLock: string, secret: string): Promise<ChainTxResult>;
  abstract refundHashLock(hashLock: string): Promise<ChainTxResult>;
  abstract estimateGas(txParams: UniversalTxParams): Promise<string>;
  abstract getCurrentBlockNumber(): Promise<number>;
  abstract getBlockTimestamp(blockNumber?: number): Promise<number>;
}

/**
 * Chain adapter factory interface
 */
export interface IChainAdapterFactory {
  createAdapter(chainId: string | number): IChainAdapter;
  getSupportedChains(): (string | number)[];
  registerAdapter(chainId: string | number, adapterClass: new () => IChainAdapter): void;
}
