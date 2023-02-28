import {Relayer, RelayerBuilder, RelayResponse, RelayStatus} from "./types";
import {Wallet} from "ethers";

export const Relayers = (relayers: (RelayerBuilder<RelayResponse, RelayStatus, any> | Promise<RelayerBuilder<RelayResponse, RelayStatus, any>>)[]) => {
    const cachedRelayerForChain: Record<number, Relayer<RelayResponse, RelayStatus, any>> = {};

    return {
        for: async (chainId: number, wallet: Wallet):Promise<Relayer<RelayResponse, RelayStatus, any> | null> => {
            if (cachedRelayerForChain[chainId]) {
                return cachedRelayerForChain[chainId];
            }

            for (const relayerBuilder of relayers) {
                const relayer = await (await relayerBuilder)(chainId, wallet);
                if (await relayer.supportsChain(chainId)) {
                    cachedRelayerForChain[chainId] = relayer;
                    return relayer;
                }
            }

            return null;
        }
    }
}

export const waitForRelay = async (relayer: Relayer<RelayResponse, RelayStatus, any>, taskId: string, pollPeriod = 5000, stopAfter = 60_000) => {
    let stopAt = Date.now() + stopAfter;
    let status: RelayStatus = {isComplete: false, isError: false, transactionHash: undefined};
    while (!status.isComplete && Date.now() < stopAt) {
        status = await relayer.lookup(taskId);
        console.log(`Relay status: ${JSON.stringify(status)}`);
        await new Promise(resolve => setTimeout(resolve, pollPeriod));
    }
    return status;
}