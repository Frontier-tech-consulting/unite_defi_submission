import { Order } from '../interfaces/Order';
import { IConnector } from '../interfaces/IConnector';

export class OrderBuilder {
  private order: Partial<Order> = {};

  constructor(private readonly connector: IConnector) {}

  public from(token: string, amount: string): this {
    this.order.fromToken = token;
    this.order.fromAmount = amount;
    return this;
  }

  public to(token: string): this {
    this.order.toToken = token;
    return this;
  }

  public withDeadline(deadline: number): this {
    this.order.deadline = deadline;
    return this;
  }

  public async build(): Promise<Order> {
    if (!this.order.fromToken || !this.order.fromAmount || !this.order.toToken) {
      throw new Error('Incomplete order: from, to, and amount are required.');
    }

    this.order.makerAddress = await this.connector.getAddress();
    this.order.id = `order_${this.order.makerAddress}_${Date.now()}`;

    // Set a default deadline if not provided (e.g., 1 hour from now)
    if (!this.order.deadline) {
      this.order.deadline = Math.floor(Date.now() / 1000) + 3600;
    }

    // The toAmount will be determined by the auction, so it's not set here.
    this.order.toAmount = '0';

    return this.order as Order;
  }
}
