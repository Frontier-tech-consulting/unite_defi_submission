import { IConnector } from '../interfaces/IConnector';
import { Order } from '../interfaces/Order';
import { ApiClient } from '../utils/ApiClient';

import { EtherlinkConnector } from '../connector/etherlink-connector';

export class Maker {
  constructor(
    private readonly connector: IConnector,
    private readonly apiClient: ApiClient,
    private readonly etherlinkConnector?: EtherlinkConnector // Optional, for cross-chain
  ) {}

  /**
   * Place a Fusion+ order, optionally bridging to Etherlink first if needed.
   * If the order has a crossChainBridge param, use EtherlinkConnector to bridge assets before order.
   */
  public async placeOrder(order: Order & { bridgeParams?: any }): Promise<string> {
    // 1. If Etherlink bridging is required, use the connector
    if (order.bridgeParams && this.etherlinkConnector) {
      const txHash = await this.etherlinkConnector.bridgeToEtherlink(order.bridgeParams);
      const status = await this.etherlinkConnector.monitorBridgeStatus(txHash);
      if (status.status !== 'completed') throw new Error('Etherlink bridge failed');
    }
    // 2. Standard Fusion+ order placement
    const orderForSignature = { ...order };
    delete orderForSignature.signature;

    const signature = await this.connector.signMessage(
      JSON.stringify(orderForSignature)
    );
    order.signature = signature;

    // Assuming an endpoint to submit the order
    const response = await this.apiClient.post<{ orderId: string }>(
      '/orders/submit',
      order
    );
    return response.orderId;
  }

  public async cancelOrder(orderId: string): Promise<boolean> {
    // TODO: Implement order cancellation logic
    console.log('Cancelling order:', orderId);
    return true;
  }

  public async getActiveOrders(): Promise<Order[]> {
    // TODO: Implement logic to fetch active orders
    console.log('Fetching active orders');
    return [];
  }
}
