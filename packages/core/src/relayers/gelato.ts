import {Relayer, RelayerBuilder, RelayResponse, RelayStatus} from "../types";
import {BigNumber, PopulatedTransaction, Wallet} from "ethers";
import {GelatoRelay, SponsoredCallERC2771Request, TransactionStatusResponse} from "@gelatonetwork/relay-sdk";

type GelatoConfig = {
    apiKey: string;
}

type GelatoRelayStatus = RelayStatus & Partial<TransactionStatusResponse>

export class GelatoRelayer implements Relayer<RelayResponse, GelatoRelayStatus, GelatoConfig> {
    private gelato: GelatoRelay;
    constructor(
        private readonly wallet: Wallet,
        private readonly chainId: number,

        private readonly apiKey: string,
    ) {
        this.gelato = new GelatoRelay()
    }

    static with(config: GelatoConfig): RelayerBuilder<RelayResponse, GelatoRelayStatus, GelatoConfig> {
        return async (chainId: number, wallet: Wallet) => new GelatoRelayer(wallet, chainId, config.apiKey)
    }

    fund(amount: BigNumber): Promise<void> {
        throw new Error("Method not implemented for Gelato.")
    }

    getBalance(): Promise<BigNumber> {
        throw new Error("Method not implemented for Gelato.")
    }

    async lookup(task: string): Promise<GelatoRelayStatus> {
        try {
            const taskStatus = await this.gelato.getTaskStatus(task);

            if (!taskStatus) return {
                isComplete: false,
                isError: true,
                transactionHash: undefined,
            }
            const isComplete = taskStatus.taskState === "ExecSuccess";
            const isError = ["ExecReverted", "Blacklisted", "Cancelled", "NotFound"].includes(taskStatus.taskState)

            return {
                ...taskStatus,
                isError,
                isComplete,
                transactionHash: taskStatus.transactionHash,
            }
        } catch (error: any) {
            if (error.message === "Failed with error: Status not found") {
                return {
                    isComplete: false,
                    isError: false,
                    transactionHash: undefined,
                }
            }
            console.error(error);
            return {
                isComplete: false,
                isError: true,
                transactionHash: undefined,
            }
        }
    }

    send(tx: PopulatedTransaction): Promise<RelayResponse> {
        if (!tx.data || !tx.to) throw new Error("Gelato requires a data field and to address in the transaction.");

        const request: SponsoredCallERC2771Request = {
            chainId: this.chainId,
            target: tx.to,
            data: tx.data,
            user: this.wallet.address,
        };

        // send relayRequest to Gelato Relay API
        return this.gelato.sponsoredCallERC2771(request, this.wallet, this.apiKey);
    }

    supportsChain(chainId: number): Promise<boolean> {
        return this.gelato.isNetworkSupported(chainId);
    }
}