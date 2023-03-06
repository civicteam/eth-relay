import { type BigNumber, type PopulatedTransaction, type Wallet } from "ethers";
import { type StaticEIP712Domain } from "./lib/metatx";

export interface RelayResponse {
  taskId: string;
}

export interface RelayStatus {
  isComplete: boolean;
  isError: boolean;
  transactionHash: string | undefined;
}

export interface Relayer<R extends RelayResponse, S extends RelayStatus> {
  send: (tx: PopulatedTransaction) => Promise<R>;

  lookup: (task: string) => Promise<S>;

  getBalance: () => Promise<BigNumber>;

  fund: (amount: BigNumber) => Promise<void>;

  supportsChain: (chainId: number) => Promise<boolean>;
}

export type GenericRelayer = Relayer<RelayResponse, RelayStatus>;

export type RelayerBuilder<R extends RelayResponse, S extends RelayStatus> = (
  chainId: number,
  wallet: Wallet
) => Promise<Relayer<R, S>>;

export interface ForwarderConfig {
  address: string;
  EIP712Domain: StaticEIP712Domain;
}
