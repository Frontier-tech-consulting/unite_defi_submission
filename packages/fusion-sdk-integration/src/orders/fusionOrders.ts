import "dotenv/config";
import { SDK as CrossChainSDK, HashLock, NetworkEnum } from "@1inch/cross-chain-sdk";
import { solidityPackedKeccak256 } from 'ethers';
import { IChainAdapter, ChainConfig } from '../interfaces/IChainAdapter';
import { chainAdapterFactory, SUPPORTED_CHAINS, getChainName } from '../adapters/ChainAdapterFactory';
import {
  UniversalOrder,
  UniversalAsset,
  OrderStatus,
  OrderFill,
  generateSecretsAndHashLock,
  validateOrderParams,
  calculateOrderHash,
  getRandomBytes32,
  sleep,
  retry
} from '../utils/fusionUtils';

/**
 * Configuration for the generalized fusion order manager
 */
export interface FusionOrderConfig {
  apiKey: string;
  apiUrl?: string;
  makerPrivateKey: string;
  makerAddress: string;
  chainConfigs: Map<string | number, ChainConfig>;
  pollingInterval?: number;
  maxRetries?: number;
}

/**
 * Quote parameters for cross-chain swaps
 */
export interface QuoteParams {
  srcChainId: string | number;
  dstChainId: string | number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  amount: string;
  enableEstimate?: boolean;
  walletAddress: string;
}

/**
 * Generalized Fusion Order Manager for cross-chain atomic swaps
 * Supports multiple blockchain architectures through adapter pattern
 */
export class GeneralizedFusionOrderManager {
  private sdk: CrossChainSDK;
  private adapters: Map<string | number, IChainAdapter> = new Map();
  private activeOrders: Map<string, UniversalOrder> = new Map();
  private orderSecrets: Map<string, string[]> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  public readonly config: FusionOrderConfig;

  constructor(config: FusionOrderConfig) {
    this.config = {
      apiUrl: 'https://api.1inch.dev/fusion-plus',
      pollingInterval: 5000,
      maxRetries: 3,
      ...config
    };

    // Initialize 1inch Cross-Chain SDK
    this.sdk = new CrossChainSDK({
      url: this.config.apiUrl!,
      authKey: this.config.apiKey
    });

    this.initializeAdapters();
  }

  /**
   * Initialize chain adapters for supported chains
   */
  private async initializeAdapters(): Promise<void> {
    for (const [chainId, chainConfig] of this.config.chainConfigs) {
      try {
        const adapter = chainAdapterFactory.createAdapter(chainId);
        await adapter.connect(chainConfig);
        this.adapters.set(chainId, adapter);
        console.log(`✅ Connected to ${getChainName(chainId)} (${chainId})`);
      } catch (error) {
        console.error(`❌ Failed to connect to chain ${chainId}:`, error);
      }
    }
  }

  /**
   * Get quote for cross-chain swap
   */
  async getQuote(params: QuoteParams): Promise<any> {
    console.log(`🔍 Getting quote for ${getChainName(params.srcChainId)} → ${getChainName(params.dstChainId)}`);
    
    return retry(async () => {
      return await this.sdk.getQuote({
        srcChainId: Number(params.srcChainId),
        dstChainId: Number(params.dstChainId),
        srcTokenAddress: params.srcTokenAddress,
        dstTokenAddress: params.dstTokenAddress,
        amount: params.amount,
        enableEstimate: params.enableEstimate || true,
        walletAddress: params.walletAddress
      });
    }, this.config.maxRetries);
  }

  /**
   * Create and place a fusion order
   */
  async createOrder(params: QuoteParams): Promise<string> {
    console.log(`🚀 Creating fusion order...`);
    
    // Validate chain support
    const srcAdapter = this.adapters.get(params.srcChainId);
    const dstAdapter = this.adapters.get(params.dstChainId);
    
    if (!srcAdapter || !dstAdapter) {
      throw new Error(`Unsupported chain pair: ${params.srcChainId} → ${params.dstChainId}`);
    }

    // Get quote from 1inch
    const quote = await this.getQuote(params);
    const secretsCount = quote.getPreset().secretsCount;
    
    console.log(`📋 Quote received, secrets needed: ${secretsCount}`);

    // Generate secrets and hash locks
    const { secrets, secretHashes, hashLock } = generateSecretsAndHashLock(secretsCount);
    
    // Create universal order object
    const order: UniversalOrder = {
      orderHash: '', // Will be set after placement
      srcChain: params.srcChainId,
      dstChain: params.dstChainId,
      srcAsset: {
        chainId: params.srcChainId,
        address: params.srcTokenAddress,
        symbol: 'SRC', // Would be fetched from chain
        decimals: 18,
        standard: 'ERC20'
      },
      dstAsset: {
        chainId: params.dstChainId,
        address: params.dstTokenAddress,
        symbol: 'DST',
        decimals: 18,
        standard: 'ERC20'
      },
      amount: params.amount,
      minReturn: '0', // Would be calculated from quote
      maker: params.walletAddress,
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      status: OrderStatus.CREATED,
      fills: [],
      secrets,
      secretHashes,
      hashLock
    };

    // Validate order parameters
    validateOrderParams(order);

    // Place order with 1inch
    const quoteResponse = await retry(async () => {
      return await this.sdk.placeOrder(quote, {
        walletAddress: params.walletAddress,
        hashLock,
        secretHashes
      });
    }, this.config.maxRetries);

    const orderHash = quoteResponse.orderHash;
    order.orderHash = orderHash;
    order.status = OrderStatus.PENDING;

    // Store order and secrets
    this.activeOrders.set(orderHash, order);
    this.orderSecrets.set(orderHash, secrets);

    console.log(`✅ Order placed successfully: ${orderHash}`);
    
    // Start monitoring the order
    this.startOrderMonitoring(orderHash);
    
    return orderHash;
  }

  /**
   * Start monitoring an order for fills
   */
  private startOrderMonitoring(orderHash: string): void {
    console.log(`👀 Starting monitoring for order: ${orderHash}`);
    
    const intervalId = setInterval(async () => {
      try {
        await this.checkOrderStatus(orderHash);
        await this.processOrderFills(orderHash);
      } catch (error) {
        console.error(`❌ Error monitoring order ${orderHash}:`, error);
      }
    }, this.config.pollingInterval);

    this.pollingIntervals.set(orderHash, intervalId);
  }

  /**
   * Check and update order status
   */
  private async checkOrderStatus(orderHash: string): Promise<void> {
    const order = this.activeOrders.get(orderHash);
    if (!order) return;

    try {
      const orderStatus = await this.sdk.getOrderStatus(orderHash);
      
      if (orderStatus.status === 'executed') {
        order.status = OrderStatus.EXECUTED;
        this.stopOrderMonitoring(orderHash);
        console.log(`🎉 Order ${orderHash} completed successfully!`);
      } else if (orderStatus.status === 'cancelled') {
        order.status = OrderStatus.CANCELLED;
        this.stopOrderMonitoring(orderHash);
        console.log(`❌ Order ${orderHash} was cancelled`);
      }
    } catch (error) {
      console.error(`Error checking order status:`, error);
    }
  }

  /**
   * Process order fills and submit secrets
   */
  private async processOrderFills(orderHash: string): Promise<void> {
    const secrets = this.orderSecrets.get(orderHash);
    if (!secrets) return;

    try {
      const fillsObject = await this.sdk.getReadyToAcceptSecretFills(orderHash);
      
      if (fillsObject.fills.length > 0) {
        console.log(`🔓 Found ${fillsObject.fills.length} fills ready for secrets`);
        
        for (const fill of fillsObject.fills) {
          try {
            await this.sdk.submitSecret(orderHash, secrets[fill.idx]);
            console.log(`✅ Secret submitted for fill ${fill.idx}`);
            
            // Update order with fill information
            const order = this.activeOrders.get(orderHash);
            if (order) {
              order.fills.push({
                idx: fill.idx,
                amount: (fill as any).amount || '0',
                txHash: (fill as any).txHash || '',
                timestamp: Math.floor(Date.now() / 1000),
                resolver: (fill as any).resolver || ''
              });
            }
          } catch (error) {
            console.error(`❌ Error submitting secret for fill ${fill.idx}:`, error);
          }
        }
      }
    } catch (error) {
      if ((error as any).response?.status !== 404) { // 404 is expected when no fills are ready
        console.error(`Error processing fills:`, (error as Error).message);      }
    }
  }

  /**
   * Stop monitoring an order
   */
  private stopOrderMonitoring(orderHash: string): void {
    const intervalId = this.pollingIntervals.get(orderHash);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(orderHash);
      console.log(`⏹️ Stopped monitoring order: ${orderHash}`);
    }
  }

  /**
   * Cancel an active order
   */
  async cancelOrder(orderHash: string): Promise<void> {
    const order = this.activeOrders.get(orderHash);
    if (!order) {
      throw new Error(`Order not found: ${orderHash}`);
    }

    const srcAdapter = this.adapters.get(order.srcChain);
    if (!srcAdapter) {
      throw new Error(`No adapter for source chain: ${order.srcChain}`);
    }

    try {
      await srcAdapter.cancelOrder(orderHash);
      order.status = OrderStatus.CANCELLED;
      this.stopOrderMonitoring(orderHash);
      console.log(`❌ Order cancelled: ${orderHash}`);
    } catch (error) {
      console.error(`Error cancelling order:`, error);
      throw error;
    }
  }

  /**
   * Get order information
   */
  getOrder(orderHash: string): UniversalOrder | undefined {
    return this.activeOrders.get(orderHash);
  }

  /**
   * Get all active orders
   */
  getAllOrders(): UniversalOrder[] {
    return Array.from(this.activeOrders.values());
  }

  /**
   * Approve token spending for an order
   */
  async approveToken(
    chainId: string | number,
    tokenAddress: string,
    spenderAddress: string,
    amount: string = '115792089237316195423570985008687907853269984665640564039457584007913129639935' // Max uint256
  ): Promise<void> {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw new Error(`No adapter for chain: ${chainId}`);
    }

    const asset: UniversalAsset = {
      chainId,
      address: tokenAddress,
      symbol: 'TOKEN',
      decimals: 18,
      standard: 'ERC20'
    };

    console.log(`🔓 Approving token ${tokenAddress} on ${getChainName(chainId)}...`);
    
    const txResult = await adapter.approveAsset(asset, spenderAddress, amount);
    console.log(`✅ Approval transaction: ${txResult.txHash}`);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Stop all monitoring
    for (const [orderHash] of this.pollingIntervals) {
      this.stopOrderMonitoring(orderHash);
    }

    // Disconnect all adapters
    for (const [chainId, adapter] of this.adapters) {
      try {
        await adapter.disconnect();
        console.log(`🔌 Disconnected from ${getChainName(chainId)}`);
      } catch (error) {
        console.error(`Error disconnecting from ${chainId}:`, error);
      }
    }

    this.adapters.clear();
    this.activeOrders.clear();
    this.orderSecrets.clear();
  }
}

/**
 * Factory function to create a fusion order manager with common configurations
 */
export function createFusionOrderManager(config: {
  apiKey: string;
  privateKey: string;
  walletAddress: string;
  chains: Array<{
    chainId: string | number;
    rpcUrl: string;
    contractAddresses?: Record<string, string>;
  }>;
}): GeneralizedFusionOrderManager {
  const chainConfigs = new Map<string | number, ChainConfig>();
  
  for (const chain of config.chains) {
    chainConfigs.set(chain.chainId, {
      rpcUrl: chain.rpcUrl,
      privateKey: config.privateKey,
      contractAddresses: chain.contractAddresses || {}
    });
  }

  return new GeneralizedFusionOrderManager({
    apiKey: config.apiKey,
    makerPrivateKey: config.privateKey,
    makerAddress: config.walletAddress,
    chainConfigs
  });
}

/**
 * Example usage function
 */
export async function exampleUsage(): Promise<void> {
  // Load environment variables
  const config = {
    apiKey: process.env.DEV_PORTAL_KEY!,
    privateKey: process.env.WALLET_KEY!,
    walletAddress: process.env.WALLET_ADDRESS!,
    chains: [
      {
        chainId: SUPPORTED_CHAINS.ARBITRUM,
        rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
      },
      {
        chainId: SUPPORTED_CHAINS.BASE,
        rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org'
      },
      {
        chainId: SUPPORTED_CHAINS.ETHERLINK,
        rpcUrl: process.env.ETHERLINK_RPC_URL || 'https://node.mainnet.etherlink.com'
      }
    ]
  };

  // Validate environment variables
  if (!config.apiKey || !config.privateKey || !config.walletAddress) {
    throw new Error('Missing required environment variables. Please check your .env file.');
  }

  // Create fusion order manager
  const fusionManager = createFusionOrderManager(config);

  try {
    // Example: Create cross-chain swap from Arbitrum to Base
    const orderHash = await fusionManager.createOrder({
      srcChainId: SUPPORTED_CHAINS.ARBITRUM,
      dstChainId: SUPPORTED_CHAINS.BASE,
      srcTokenAddress: '0xaf88d065e77c8cC2239327C5EDb6E08f4c7C32D4f71b54bdA02913', // USDC on Arbitrum
      dstTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      amount: '1000000', // 1 USDC (6 decimals)
      walletAddress: config.walletAddress
    });

    console.log(`🎯 Order created: ${orderHash}`);
    
    // Monitor for completion (in real usage, this would run until completion)
    await sleep(30000); // Wait 30 seconds for demo
    
  } catch (error) {
    console.error('❌ Error in fusion order example:', error);
  } finally {
    await fusionManager.cleanup();
  }
}

// Export for usage in other modules
export { SUPPORTED_CHAINS, getChainName } from '../adapters/ChainAdapterFactory';

// --- Legacy SimpleOrder class for backward compatibility ---
// Note: The original SimpleOrder class has been replaced with GeneralizedFusionOrderManager
// for better cross-chain support and abstraction. The legacy class can be re-implemented
// if needed for backward compatibility.

/*
Usage Example:

const fusionManager = createFusionOrderManager({
  apiKey: process.env.DEV_PORTAL_KEY!,
  privateKey: process.env.WALLET_KEY!,
  walletAddress: process.env.WALLET_ADDRESS!,
  chains: [
    {
      chainId: SUPPORTED_CHAINS.ARBITRUM,
      rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
    },
    {
      chainId: SUPPORTED_CHAINS.BASE,
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org'
    }
  ]
});

// Create cross-chain order
const orderHash = await fusionManager.createOrder({
  srcChainId: SUPPORTED_CHAINS.ARBITRUM,
  dstChainId: SUPPORTED_CHAINS.BASE,
  srcTokenAddress: '0xaf88d065e77c8cC2239327C5EDb6E08f4c7C32D4f71b54bdA02913',
  dstTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amount: '1000000',
  walletAddress: process.env.WALLET_ADDRESS!
});

console.log('Order created:', orderHash);
*/
//   apiKey: process.env.ONEINCH_API_KEY!,
//   network: etherlink,
// });
// await order.fetchOrders();
// await order.createEscrow(orderParams);
// await order.depositToEscrow(depositParams);
// await order.withdrawFromEscrow(withdrawParams);
