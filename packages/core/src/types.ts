import {BigNumber, PopulatedTransaction, Wallet} from "ethers";

export interface RelayResponse {
    taskId: string;

}

export interface RelayStatus {
    isComplete: boolean;
    isError: boolean;
    transactionHash: string | undefined;
}

export interface Relayer<R extends RelayResponse, S extends RelayStatus, C> {

    send(tx: PopulatedTransaction): Promise<R>;

    lookup(task: string): Promise<S>;

    getBalance(): Promise<BigNumber>;

    fund(amount: BigNumber): Promise<void>;

    supportsChain(chainId: number): Promise<boolean>
}

export type GenericRelayer = Relayer<RelayResponse, RelayStatus, any>;

export type RelayerBuilder<R extends RelayResponse, S extends RelayStatus, C> = (chainId: number, wallet: Wallet) => Promise<Relayer<R, S, C>>;