export enum TransactionStatus {
  PENDING,
  CONFIRMED,
  FAILED
}

export interface IConnector {
  getAddress(): Promise<string>;
  signTransaction(transaction: any): Promise<string>;
  signMessage(message: string): Promise<string>;
  broadcastTransaction(signedTransaction: string): Promise<string>;
  getTransactionStatus(transactionHash: string): Promise<TransactionStatus>;
  getNonce(address: string): Promise<number>;
  getChainId(): Promise<number | string>;
}
