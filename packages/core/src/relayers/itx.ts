import {
  type ForwarderConfig,
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "../types";
import {
  BigNumber,
  type PopulatedTransaction,
  type providers,
  utils,
  type Wallet,
} from "ethers";
import { createEIP2771ForwardedTransaction } from "../lib/metatx";

// ITX deposit contract (same address for all public Ethereum networks)
const ITX_DEPOSIT_CONTRACT = "0x015C7C7A7D65bbdb117C573007219107BD7486f9";

export interface RelayRequest {
  to: string;
  data: string;
  gas: BigNumber | string;
  schedule: "fast" | "slow";
}

type ITXRelayStatus = RelayStatus & Partial<providers.TransactionReceipt>;

export type Options = Pick<RelayRequest, "gas" | "schedule">;

const defaultOptions: Options = {
  gas: "1000000",
  schedule: "slow",
};

type ITXApiKey = string | { projectId: string; projectSecret: string };

interface ITXConfig {
  apiKey: ITXApiKey;
  forwarder: ForwarderConfig;
  options?: Partial<Options>;
}

export class ITXRelayer implements Relayer<RelayResponse, ITXRelayStatus> {
  private readonly provider: providers.JsonRpcProvider;
  private readonly itxOptions: Options;
  constructor(
    private readonly chainId: number,
    private readonly wallet: Wallet,
    private readonly apiKey: ITXApiKey,

    private readonly forwarder: ForwarderConfig,
    options: Partial<Options> = {}
  ) {
    this.provider = this.wallet.provider as providers.JsonRpcProvider;
    this.itxOptions = {
      ...defaultOptions,
      ...options,
    };
  }

  static with(
    config: ITXConfig
  ): RelayerBuilder<RelayResponse, ITXRelayStatus> {
    return async (chainId: number, wallet: Wallet) =>
      new ITXRelayer(
        chainId,
        wallet,
        config.apiKey,
        config.forwarder,
        config.options
      );
  }

  async fund(amount: BigNumber): Promise<void> {
    const tx = await this.wallet.sendTransaction({
      to: ITX_DEPOSIT_CONTRACT,
      value: amount,
    });
    await tx.wait();
  }

  async getBalance(): Promise<BigNumber> {
    const { balance } = await this.provider.send("relay_getBalance", [
      this.wallet.address,
    ]);

    return BigNumber.from(balance);
  }

  async lookup(task: string): Promise<ITXRelayStatus> {
    const statusResponse = await this.provider.send(
      "relay_getTransactionStatus",
      [task]
    );
    if (statusResponse.broadcasts === undefined) {
      // no broadcasts yet
      return {
        isComplete: false,
        isError: false,
        transactionHash: undefined,
      };
    }

    for (let i = 0; i < statusResponse.broadcasts.length; i++) {
      const bc = statusResponse.broadcasts[i];
      const receipt = await this.provider.getTransactionReceipt(bc.ethTxHash);
      if (receipt?.confirmations > 0) {
        const isComplete = receipt.status === 1;
        const isError = receipt.status === 0;
        return {
          ...receipt,
          isComplete,
          isError,
        };
      }
    }

    // no response yet
    return {
      isError: false,
      isComplete: false,
      transactionHash: undefined,
    };
  }

  /**
   *
   * @param tx
   * @private
   */
  private async signRequest(tx: RelayRequest): Promise<string> {
    const relayTransactionHash = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ["address", "bytes", "uint", "uint", "string"],
        [tx.to, tx.data, tx.gas, this.chainId, tx.schedule]
      )
    );
    return this.wallet.signMessage(utils.arrayify(relayTransactionHash));
  }

  async send(tx: PopulatedTransaction): Promise<RelayResponse> {
    if (tx.data === undefined || tx.to === undefined)
      throw new Error(
        "ITX requires a data field and to address in the transaction."
      );

    const metaTx = await createEIP2771ForwardedTransaction(
      tx,
      this.forwarder,
      this.wallet
    );

    if (metaTx.data === undefined || metaTx.to === undefined)
      throw new Error(
        "ITX requires a data field and to address in the meta transaction."
      );

    const request: RelayRequest = {
      ...this.itxOptions,
      to: this.forwarder.address,
      data: metaTx.data,
    };

    console.log("Sending ITX request", request);

    const signature = await this.signRequest(request);

    const { relayTransactionHash } = await this.provider.send(
      "relay_sendTransaction",
      [request, signature]
    );
    return { taskId: relayTransactionHash };
  }

  async supportsChain(chainId: number): Promise<boolean> {
    // ITX supports ethereum mainnet, goerli, polygon mainnet
    return [1, 5, 137].includes(chainId);
  }
}
