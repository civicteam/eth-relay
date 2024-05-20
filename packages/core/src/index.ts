import { type Signer } from "ethers";
import {
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "./types";

export { GelatoRelayer } from "./relayers/gelato";
export { DefenderRelayer } from "./relayers/ozdefender";
export type { RelayResponse, RelayStatus, Relayer, RelayerBuilder };

interface RelayersResult {
  for: (
    chainId: number,
    signer: Signer
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
      signer: Signer
    ): Promise<Relayer<RelayResponse, RelayStatus> | null> => {
      if (cachedRelayerForChain[chainId] !== undefined) {
        return cachedRelayerForChain[chainId];
      }

      for (const relayerBuilder of relayers) {
        const relayer = await (await relayerBuilder)(chainId, signer);
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
