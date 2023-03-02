import {
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "./types";
import { type Wallet } from "ethers";

export { GelatoRelayer } from "./relayers/gelato";
export { ITXRelayer } from "./relayers/itx";
export type { RelayResponse, RelayStatus, Relayer, RelayerBuilder };

interface RelayersResult {
  for: (
    chainId: number,
    wallet: Wallet
  ) => Promise<Relayer<RelayResponse, RelayStatus> | null>;
}
export const Relayers = (
  relayers: Array<
    | RelayerBuilder<RelayResponse, RelayStatus>
    | Promise<RelayerBuilder<RelayResponse, RelayStatus>>
  >
): RelayersResult => {
  const cachedRelayerForChain: Record<
    number,
    Relayer<RelayResponse, RelayStatus>
  > = {};

  return {
    for: async (
      chainId: number,
      wallet: Wallet
    ): Promise<Relayer<RelayResponse, RelayStatus> | null> => {
      if (cachedRelayerForChain[chainId] !== undefined) {
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
    },
  };
};

export const waitForRelay = async (
  relayer: Relayer<RelayResponse, RelayStatus>,
  taskId: string,
  pollPeriod = 5000,
  stopAfter = 60_000
): Promise<RelayStatus> => {
  const stopAt = Date.now() + stopAfter;
  let status: RelayStatus = {
    isComplete: false,
    isError: false,
    transactionHash: undefined,
  };
  while (!status.isComplete && !status.isError && Date.now() < stopAt) {
    status = await relayer.lookup(taskId);
    console.log(`Relay status: ${JSON.stringify(status)}`);
    await new Promise((resolve) => setTimeout(resolve, pollPeriod));
  }
  return status;
};
