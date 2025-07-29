import { IChainAdapter, IChainAdapterFactory } from '../interfaces/IChainAdapter';
import { EVMChainAdapter } from './EVMChainAdapter';
import { AptosChainAdapter } from './AptosChainAdapter';
import { SuiChainAdapter } from './SuiChainAdapter';
import { TezosChainAdapter } from './TezosChainAdapter';
import { UniversalAsset } from '../utils/fusionUtils';

/**
 * Chain adapter factory for creating chain-specific adapters
 */
export class ChainAdapterFactory implements IChainAdapterFactory {
  private adapters: Map<string | number, new () => IChainAdapter> = new Map();
  private instances: Map<string | number, IChainAdapter> = new Map();

  constructor() {
    this.registerDefaultAdapters();
  }

  /**
   * Register default chain adapters
   */
  private registerDefaultAdapters(): void {
   
    // Etherlink (Tezos L2)
    this.registerAdapter(128123, () => new EVMChainAdapter(
      128123,
      'Etherlink',
      {
        chainId: 128123,
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'XTZ',
        decimals: 18,
        standard: 'NATIVE'
      }
    ));

    // Polygon
    this.registerAdapter(137, () => new EVMChainAdapter(
      137,
      'Polygon',
      {
        chainId: 137,
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'MATIC',
        decimals: 18,
        standard: 'NATIVE'
      }
    ));

    // Non-EVM Chains
    
    // Aptos
    this.registerAdapter('aptos-mainnet', () => new AptosChainAdapter());
    
    // Sui
    this.registerAdapter('sui-mainnet', () => new SuiChainAdapter());
    
    // Tezos
    this.registerAdapter('tezos-mainnet', () => new TezosChainAdapter());

   
  }

  /**
   * Create or get cached adapter instance
   */
  createAdapter(chainId: string | number): IChainAdapter {
    const key = chainId.toString();
    
    // Return cached instance if exists
    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    // Create new instance
    const AdapterClass = this.adapters.get(key);
    if (!AdapterClass) {
      throw new Error(`No adapter registered for chain ID: ${chainId}`);
    }

    const adapter = new AdapterClass();
    this.instances.set(key, adapter);
    
    return adapter;
  }

  /**
   * Get list of supported chain IDs
   */
  getSupportedChains(): (string | number)[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Register a new chain adapter
   */
  registerAdapter(chainId: string | number, adapterFactory: () => IChainAdapter): void {
    const key = chainId.toString();
    this.adapters.set(key, adapterFactory as any);
    
    // Clear cached instance if exists
    if (this.instances.has(key)) {
      this.instances.delete(key);
    }
  }

  /**
   * Get adapter info without creating instance
   */
  getAdapterInfo(chainId: string | number): { chainId: string | number; supported: boolean } {
    const key = chainId.toString();
    return {
      chainId,
      supported: this.adapters.has(key)
    };
  }

  /**
   * Clear all cached instances
   */
  clearCache(): void {
    this.instances.clear();
  }
}

// Export singleton instance
export const chainAdapterFactory = new ChainAdapterFactory();

/**
 * Supported chain configurations
 */
export const SUPPORTED_CHAINS = {
  // EVM-Compatible Chains
  ETHEREUM: 1,
  ARBITRUM: 42161,
  ETHERLINK: 128123,
  BASE: 8453,
  POLYGON: 137,
  
  // Non-EVM Chains
  APTOS: 'aptos-mainnet',
  SUI: 'sui-mainnet',
  TEZOS: 'tezos-mainnet'
} as const;

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: string | number): string {
  const chainMap: Record<string, string> = {
    // EVM Chains
    '1': 'Ethereum',
    '42161': 'Arbitrum One',
    '128123': 'Etherlink',
    '8453': 'Base',
    '137': 'Polygon',
    
    // Non-EVM Chains
    'aptos-mainnet': 'Aptos',
    'sui-mainnet': 'Sui',
    'tezos-mainnet': 'Tezos'
  };

  return chainMap[chainId.toString()] || `Chain ${chainId}`;
}

/**
 * Check if chain is EVM compatible
 */
export function isEVMCompatible(chainId: string | number): boolean {
  const evmChains = [1, 42161, 128123, 8453, 137];
  return evmChains.includes(Number(chainId));
}

/**
 * Get chain architecture type
 */
export function getChainArchitecture(chainId: string | number): 'EVM' | 'Move' | 'Michelson' | 'Unknown' {
  const chainArch: Record<string, string> = {
    // EVM Chains
    '1': 'EVM',
    '42161': 'EVM',
    '128123': 'EVM',
    '8453': 'EVM',
    '137': 'EVM',
    
    // Move-based Chains
    'aptos-mainnet': 'Move',
    'sui-mainnet': 'Move',
    
    // Michelson-based Chains
    'tezos-mainnet': 'Michelson'
  };

  return (chainArch[chainId.toString()] as any) || 'Unknown';
}

/**
 * Get supported token standards for a chain
 */
export function getSupportedTokenStandards(chainId: string | number): string[] {
  const architecture = getChainArchitecture(chainId);
  
  switch (architecture) {
    case 'EVM':
      return ['NATIVE', 'ERC20', 'ERC721', 'ERC1155'];
    case 'Move':
      if (chainId === 'aptos-mainnet') {
        return ['NATIVE', 'APTOS_COIN'];
      } else if (chainId === 'sui-mainnet') {
        return ['NATIVE', 'SUI_COIN'];
      }
      return ['NATIVE'];
    case 'Michelson':
      return ['NATIVE', 'FA1.2', 'FA2'];
    default:
      return ['NATIVE'];
  }
}
