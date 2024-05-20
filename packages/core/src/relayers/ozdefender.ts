import {
  type ForwarderConfig,
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "../types";
import { createEIP2771ForwardedTransaction } from "../lib/metatx";
import { type PreparedTransactionRequest, type Signer } from "ethers";
import {
  Relayer as OZRelayer,
  RelayClient,
  type Speed,
  type RelayerTransactionPayload,
} from "@openzeppelin/defender-relay-client";

interface DefenderConfig {
  apiKey: string;
  secretKey: string;
  forwarder: ForwarderConfig;
  speed?: Speed;
  // Used to manage the relayer - fund, get balance etc
  manager?: {
    apiKey: string;
    secretKey: string;
    relayId: string;
  };
}

type DefenderRelayResponse = RelayResponse & {
  hash: string;
};

// Copied from defender internals
interface PickedAxiosErrorFields<TError> {
  request: {
    path: string;
  };
  response: {
    status: number;
    statusText: string;
    data?: TError;
  };
}
export interface DefenderApiResponseError<TErrorData = { message: string }>
  extends Error {
  name: string;
  request: PickedAxiosErrorFields<TErrorData>["request"];
  response: PickedAxiosErrorFields<TErrorData>["response"];
}
const isDefenderApiResponseError = (
  error: any
): error is DefenderApiResponseError =>
  error instanceof Error && "request" in error && "response" in error;

export class DefenderRelayer
  implements Relayer<DefenderRelayResponse, RelayStatus>
{
  private readonly relayer: OZRelayer;
  constructor(
    private readonly signer: Signer,
    private readonly chainId: number,
    private readonly forwarder: ForwarderConfig,

    apiKey: string,
    secretKey: string,
    private readonly speed?: Speed,
    private readonly manager?: DefenderConfig["manager"]
  ) {
    this.relayer = new OZRelayer({ apiKey, apiSecret: secretKey });
  }

  static with(
    config: DefenderConfig
  ): RelayerBuilder<RelayResponse, RelayStatus> {
    return async (chainId: number, signer: Signer) =>
      new DefenderRelayer(
        signer,
        chainId,
        config.forwarder,
        config.apiKey,
        config.secretKey,
        config.speed,
        config.manager
      );
  }

  async fund(amount: bigint): Promise<void> {
    // TODO
  }

  async getBalance(): Promise<bigint> {
    if (!this.manager) throw new Error("No manager config configured");
    if (!this.signer.provider) throw new Error("Signer has no provider");
    const relayClient = new RelayClient({
      apiKey: this.manager.apiKey,
      apiSecret: this.manager.secretKey,
    });
    const relay = await relayClient.get(this.manager.relayId);
    const relayAddress = relay.address;
    return this.signer.provider.getBalance(relayAddress);
  }

  async lookup(task: string): Promise<RelayStatus> {
    const tx = await this.relayer.query(task);
    return {
      transactionHash: tx.hash,
      isComplete: tx.status === "mined" || tx.status === "confirmed",
      isError: tx.status === "failed",
    };
  }

  async send(tx: PreparedTransactionRequest): Promise<DefenderRelayResponse> {
    // If a forwarder is set, use sponsoredCall directly, without the Defender forwarder
    // Sign and wrap the tx in a metatx targeting the custom forwarder
    const metaTx = await createEIP2771ForwardedTransaction(
      tx,
      this.forwarder,
      this.signer
    );
    if (metaTx.data === undefined) throw new Error("Invalid metaTx data");

    const fees = this.speed
      ? { speed: this.speed }
      : {
          maxFeePerGas: metaTx.maxFeePerGas?.toString() ?? "0",
          maxPriorityFeePerGas: metaTx.maxPriorityFeePerGas?.toString() ?? "0",
        };

    const request: RelayerTransactionPayload = {
      ...metaTx,
      ...fees,
      value: metaTx.value?.toString(),
      gasLimit: metaTx.gasLimit?.toString() ?? tx.gasLimit?.toString() ?? "0",
    };

    // send the request via Defender
    try {
      const relayerTransaction = await this.relayer.sendTransaction(request);

      return {
        taskId: relayerTransaction.transactionId,
        hash: relayerTransaction.hash,
      };
    } catch (error) {
      if (isDefenderApiResponseError(error)) {
        console.error(error.response.data?.message);
      }
      throw error;
    }
  }

  async supportsChain(chainId: number): Promise<boolean> {
    return true;
    // return this.relayer.isNetworkSupported(BigInt(chainId));
  }
}
