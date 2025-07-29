import { IConnector } from '../interfaces/IConnector';
import { Maker } from './Maker';
import { Resolver } from './Resolver';
import { TransactionWatcher } from './TransactionWatcher';
import { ApiClient } from '../utils/ApiClient';
import { OrderBuilder } from './OrderBuilder';

import { EtherlinkConnector } from '../connector/etherlink-connector';

export class FusionSDK {
  public readonly maker: Maker;
  public readonly resolver: Resolver;
  public readonly watcher: TransactionWatcher;
  public readonly orderBuilder: OrderBuilder;
  private readonly apiClient: ApiClient;

  constructor(apiKey: string, private readonly connector: IConnector, private readonly etherlinkConnector?: EtherlinkConnector) {
    this.apiClient = new ApiClient(apiKey);
    this.maker = new Maker(connector, this.apiClient, etherlinkConnector);
    this.resolver = new Resolver(connector, this.apiClient, etherlinkConnector);
    this.watcher = new TransactionWatcher(connector);
    this.orderBuilder = new OrderBuilder(connector);
  }
}
