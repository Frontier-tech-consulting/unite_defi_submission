import { IConnector, TransactionStatus } from '../interfaces/IConnector';

export class TransactionWatcher {
  constructor(private readonly connector: IConnector) {}

  public watch(transactionHash: string, onStatusChange: (status: TransactionStatus) => void): void {
    console.log(`Watching transaction: ${transactionHash}`);
    const interval = setInterval(async () => {
      try {
        const status = await this.connector.getTransactionStatus(transactionHash);
        onStatusChange(status);
        if (status === TransactionStatus.CONFIRMED || status === TransactionStatus.FAILED) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error watching transaction:', error);
        clearInterval(interval);
      }
    }, 5000); // Poll every 5 seconds
  }
}
