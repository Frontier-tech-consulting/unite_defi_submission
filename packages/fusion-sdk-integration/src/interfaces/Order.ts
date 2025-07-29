export interface Order {
  id: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  makerAddress: string;
  deadline: number;
  signature?: string; // Signature will be added by the maker
}
