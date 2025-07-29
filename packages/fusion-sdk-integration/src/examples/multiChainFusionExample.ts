import "dotenv/config";
import { 
  GeneralizedFusionOrderManager, 
  createFusionOrderManager,
  SUPPORTED_CHAINS,
  getChainName
} from '../orders/fusionOrders';
import {
getChainArchitecture,
getSupportedTokenStandards
} from '../adapters/ChainAdapterFactory';
import { 
  UniversalAsset, 
  OrderStatus, 
  sleep 
} from '../utils/fusionUtils';

/**
 * Comprehensive example demonstrating generalized fusion orders across multiple chains
 */
export class MultiChainFusionExample {
  private fusionManager?: GeneralizedFusionOrderManager;
  
  constructor() {
    console.log('🌐 Multi-Chain Fusion Order Example');
    console.log('=====================================');
  }

  /**
   * Initialize the fusion order manager with multiple chain support
   */
  async initialize(): Promise<void> {
    console.log('\n📋 Initializing Multi-Chain Fusion Manager...');
    
    // Validate environment variables
    const requiredEnvVars = ['DEV_PORTAL_KEY', 'WALLET_KEY', 'WALLET_ADDRESS'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Configure supported chains
    const chainConfigs: Array<{
      chainId: string | number;
      rpcUrl: string;
      contractAddresses?: Record<string, string>;
    }> = [
      // EVM-Compatible Chains
      {
        chainId: SUPPORTED_CHAINS.ARBITRUM,
        rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
        contractAddresses: {
          fusionRouter: '0x111111125421ca6dc452d289314280a0f8842a65',
          aggregationRouter: '0x111111125421ca6dc452d289314280a0f8842a65'
        }
      },
      {
        chainId: SUPPORTED_CHAINS.BASE,
        rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        contractAddresses: {
          fusionRouter: '0x111111125421ca6dc452d289314280a0f8842a65'
        }
      },
      {
        chainId: SUPPORTED_CHAINS.ETHERLINK,
        rpcUrl: process.env.ETHERLINK_RPC_URL || 'https://node.mainnet.etherlink.com',
        contractAddresses: {
          fusionRouter: '0x111111125421ca6dc452d289314280a0f8842a65'
        }
      },
      
      // Non-EVM Chains (Mock configurations for demonstration)
      {
        chainId: SUPPORTED_CHAINS.APTOS,
        rpcUrl: process.env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1',
        contractAddresses: {
          fusionModule: '0x1::fusion::FusionOrderbook'
        }
      },
      {
        chainId: SUPPORTED_CHAINS.SUI,
        rpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443',
        contractAddresses: {
          fusionPackage: '0x2::fusion::Orderbook'
        }
      },
      {
        chainId: SUPPORTED_CHAINS.TEZOS,
        rpcUrl: process.env.TEZOS_RPC_URL || 'https://mainnet.api.tez.ie',
        contractAddresses: {
          fusionContract: 'KT1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb' // Mock Tezos contract address
        }
      }
    ];

    // Create fusion manager
    this.fusionManager = createFusionOrderManager({
      apiKey: process.env.DEV_PORTAL_KEY!,
      privateKey: process.env.WALLET_KEY!,
      walletAddress: process.env.WALLET_ADDRESS!,
      chains: chainConfigs
    });

    console.log('✅ Fusion manager initialized with support for:');
    for (const chain of chainConfigs) {
      const architecture = getChainArchitecture(chain.chainId);
      const tokenStandards = getSupportedTokenStandards(chain.chainId);
      console.log(`- ${getChainName(chain.chainId)} (${architecture}) - ${tokenStandards.join(', ')}`);
    }
  }

  /**
   * Demonstrate EVM to EVM cross-chain swap
   */
  async demonstrateEVMToEVMSwap(): Promise<void> {
    console.log('\n🔄 EVM to EVM Cross-Chain Swap Example');
    console.log('--------------------------------------');
    
    if (!this.fusionManager) {
      throw new Error('Fusion manager not initialized');
    }

    try {
      // Example: Arbitrum USDC to Base USDC
      const orderHash = await this.fusionManager.createOrder({
        srcChainId: SUPPORTED_CHAINS.ARBITRUM,
        dstChainId: SUPPORTED_CHAINS.BASE,
        srcTokenAddress: '0xaf88d065e77c8cC2239327C5EDb6E08f4c7C32D4f71b54bdA02913', // USDC on Arbitrum
        dstTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        amount: '1000000', // 1 USDC (6 decimals)
        walletAddress: process.env.WALLET_ADDRESS!
      });

      console.log(`📝 Order created: ${orderHash}`);
      console.log(`🔍 Monitoring order status...`);

      // Monitor order for 30 seconds
      await this.monitorOrder(orderHash, 30000);
      
    } catch (error) {
      console.error('❌ EVM to EVM swap failed:', error);
    }
  }

  /**
   * Demonstrate EVM to Etherlink cross-chain swap
   */
  async demonstrateEVMToEtherlinkSwap(): Promise<void> {
    console.log('\n🌉 EVM to Etherlink Cross-Chain Swap Example');
    console.log('---------------------------------------------');
    
    if (!this.fusionManager) {
      throw new Error('Fusion manager not initialized');
    }

    try {
      // Example: Ethereum ETH to Etherlink XTZ
      const orderHash = await this.fusionManager.createOrder({
        srcChainId: SUPPORTED_CHAINS.ETHEREUM,
        dstChainId: SUPPORTED_CHAINS.ETHERLINK,
        srcTokenAddress: '0x0000000000000000000000000000000000000000', // Native ETH
        dstTokenAddress: '0x0000000000000000000000000000000000000000', // Native XTZ on Etherlink
        amount: '100000000000000000', // 0.1 ETH
        walletAddress: process.env.WALLET_ADDRESS!
      });

      console.log(`📝 Etherlink order created: ${orderHash}`);
      console.log(`🔍 Monitoring order status...`);

      await this.monitorOrder(orderHash, 30000);
      
    } catch (error) {
      console.error('❌ EVM to Etherlink swap failed:', error);
    }
  }

  /**
   * Demonstrate cross-architecture swap (EVM to Move-based)
   */
  async demonstrateCrossArchitectureSwap(): Promise<void> {
    console.log('\n🏗️ Cross-Architecture Swap Example (EVM → Move)');
    console.log('------------------------------------------------');
    
    if (!this.fusionManager) {
      throw new Error('Fusion manager not initialized');
    }

    try {
      // Note: This is a mock example as 1inch Fusion+ doesn't currently support non-EVM chains
      // In a real implementation, this would require custom bridge protocols
      
      console.log('🚧 Mock Example: Arbitrum USDC → Aptos USDC');
      console.log('   (This demonstrates the adapter pattern for future non-EVM support)');
      
      // Mock order creation for demonstration
      const mockOrderData = {
        srcChain: getChainName(SUPPORTED_CHAINS.ARBITRUM),
        dstChain: getChainName(SUPPORTED_CHAINS.APTOS),
        srcArchitecture: getChainArchitecture(SUPPORTED_CHAINS.ARBITRUM),
        dstArchitecture: getChainArchitecture(SUPPORTED_CHAINS.APTOS),
        bridgeRequired: true,
        estimatedTime: '5-10 minutes'
      };

      console.log('📋 Cross-architecture order details:');
      console.log(`   Source: ${mockOrderData.srcChain} (${mockOrderData.srcArchitecture})`);
      console.log(`   Destination: ${mockOrderData.dstChain} (${mockOrderData.dstArchitecture})`);
      console.log(`   Bridge Required: ${mockOrderData.bridgeRequired}`);
      console.log(`   Estimated Time: ${mockOrderData.estimatedTime}`);
      
    } catch (error) {
      console.error('❌ Cross-architecture swap failed:', error);
    }
  }

  /**
   * Monitor an order until completion or timeout
   */
  private async monitorOrder(orderHash: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      const order = this.fusionManager!.getOrder(orderHash);
      
      if (order) {
        console.log(`📊 Order Status: ${order.status}`);
        console.log(`   Fills: ${order.fills.length}`);
        
        if (order.status === OrderStatus.EXECUTED) {
          console.log('🎉 Order completed successfully!');
          return;
        } else if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.FAILED) {
          console.log(`❌ Order ${order.status}`);
          return;
        }
      }
      
      await sleep(pollInterval);
    }
    
    console.log('⏰ Monitoring timeout reached');
  }

  /**
   * Display supported chains and their capabilities
   */
  displaySupportedChains(): void {
    console.log('\n🌐 Supported Chains and Capabilities');
    console.log('====================================');
    
    const chains = Object.entries(SUPPORTED_CHAINS);
    
    for (const [name, chainId] of chains) {
      const architecture = getChainArchitecture(chainId);
      const tokenStandards = getSupportedTokenStandards(chainId);
      
      console.log(`\n${name}:`);
      console.log(`   Chain ID: ${chainId}`);
      console.log(`   Architecture: ${architecture}`);
      console.log(`   Token Standards: ${tokenStandards.join(', ')}`);
      console.log(`   Status: ${architecture === 'EVM' ? '✅ Fully Supported' : '🚧 Mock Implementation'}`);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.fusionManager) {
      await this.fusionManager.cleanup();
      console.log('\n🧹 Cleaned up fusion manager resources');
    }
  }

  /**
   * Run the complete example
   */
  async run(): Promise<void> {
    try {
      await this.initialize();
      
      this.displaySupportedChains();
      
      // Note: Uncomment these for actual testing with real funds
      // await this.demonstrateEVMToEVMSwap();
      // await this.demonstrateEVMToEtherlinkSwap();
      
      await this.demonstrateCrossArchitectureSwap();
      
      console.log('\n✅ Multi-chain fusion example completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Example failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

/**
 * Main execution function
 */
export async function runMultiChainExample(): Promise<void> {
  const example = new MultiChainFusionExample();
  await example.run();
}

// Execute if run directly
if (require.main === module) {
  runMultiChainExample().catch(console.error);
}

/**
 * Export for use in other modules
 */
export default MultiChainFusionExample;
