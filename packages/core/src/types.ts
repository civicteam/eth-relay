import {
  type PreparedTransactionRequest,
  type Signer,
  type TypedDataDomain,
} from "ethers";

export interface RelayResponse {
  taskId: string;
}

export interface RelayStatus {
  isComplete: boolean;
  isError: boolean;
  transactionHash: string | undefined;
}

export interface Relayer<R extends RelayResponse, S extends RelayStatus> {
  send: (tx: PreparedTransactionRequest) => Promise<R>;

  lookup: (task: string) => Promise<S>;

  getBalance: () => Promise<bigint>;

  fund: (amount: bigint) => Promise<void>;

  supportsChain: (chainId: number) => Promise<boolean>;
}

export type GenericRelayer = Relayer<RelayResponse, RelayStatus>;

export type RelayerBuilder<R extends RelayResponse, S extends RelayStatus> = (
  chainId: number,
  signer: Signer
) => Promise<Relayer<R, S>>;

export interface ForwarderConfig {
  address: string;
  EIP712Domain: TypedDataDomain;
}
