import { IConnector } from '../interfaces/IConnector';
import { Order } from '../interfaces/Order';
import { ApiClient } from '../utils/ApiClient';

import { EtherlinkConnector } from '../connector/etherlink-connector';

export class Resolver {
  constructor(
    private readonly connector: IConnector,
    private readonly apiClient: ApiClient,
    private readonly etherlinkConnector?: EtherlinkConnector // Optional, for cross-chain
  ) {}

  public async getActiveOrders(): Promise<Order[]> {
    // Assuming an endpoint to fetch active orders
    return this.apiClient.get<Order[]>('/orders/active');
  }

  /**
   * Fill a Fusion+ order, optionally bridging from Etherlink if needed.
   * If the order has a crossChainBridge param, use EtherlinkConnector to bridge assets before fill.
   */
  public async fillOrder(orderId: string, fillAmount: string, bridgeParams?: any): Promise<string> {
    // 1. If Etherlink bridging is required, use the connector
    if (bridgeParams && this.etherlinkConnector) {
      const txHash = await this.etherlinkConnector.bridgeToEvm(bridgeParams);
      const status = await this.etherlinkConnector.monitorBridgeStatus(txHash);
      if (status.status !== 'completed') throw new Error('Etherlink bridge (to EVM) failed');
    }
    // 2. Standard Fusion+ fill
    const fillData = { orderId, fillAmount };
    const response = await this.apiClient.post<{ transactionHash: string }>(
      '/orders/fill',
      fillData
    );
    return response.transactionHash;
  }
}
