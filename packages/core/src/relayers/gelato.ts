import {
  type ForwarderConfig,
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "../types";
import { createEIP2771ForwardedTransaction } from "../lib/metatx";
import {
  resolveAddress,
  type PreparedTransactionRequest,
  type Signer,
} from "ethers";
import {
  GelatoRelay,
  type TransactionStatusResponse,
} from "@gelatonetwork/relay-sdk";

interface GelatoConfig {
  apiKey: string;
  accountId: string;
  // Setting a custom forwarder uses gelato.sponsoredCall instead of gelato.sponsoredCallERC2771
  // Gelato's default forwarder does not support concurrent requests.
  forwarder?: ForwarderConfig;
}

// extracted from Gelato SDK
export enum NetworkGroup {
  mainnets = "mainnets",
  testnets = "testnets",
}
// const API_URL = "https://api.gelato.digital";
// const POLYGON_USDC_TOKEN_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

type GelatoRelayStatus = RelayStatus & Partial<TransactionStatusResponse>;

export class GelatoRelayer
  implements Relayer<RelayResponse, GelatoRelayStatus>
{
  private readonly networkGroup: NetworkGroup;

  private readonly gelato: GelatoRelay;
  constructor(
    private readonly signer: Signer,
    private readonly chainId: number,

    private readonly apiKey: string,
    private readonly forwarder?: ForwarderConfig
  ) {
    this.gelato = new GelatoRelay();

    // note this list is not the same as the Gelato supported networks list - if a network is not listed here, it may still be supported by Gelato
    // but it will be assumed to be a testnet during the fund or getBalance calls, so should be added here if it is a mainnet.
    const isMainnet = [
      1, // eth mainnet
      137, // polygon
      1_313_161_554, // aurora mainnet
      10, // optimism mainnet
      11_297_108_109, // palm mainnet
      42_161, // arbitrum mainnet
      42_220, // celo mainnet
      43_114, // avalance c chain
      50, // xdc
      56, // bsc
      25, // cronos
      250, // fantom
      100, // xdai / gnosis
      1284, // moonbeam
      1285, // moonriver
    ].includes(chainId);

    this.networkGroup = isMainnet
      ? NetworkGroup.mainnets
      : NetworkGroup.testnets;
  }

  static with(
    config: GelatoConfig
  ): RelayerBuilder<RelayResponse, GelatoRelayStatus> {
    return async (chainId: number, signer: Signer) =>
      new GelatoRelayer(signer, chainId, config.apiKey, config.forwarder);
  }

  async fund(amount: bigint): Promise<void> {
    // const oneBalance = new OneBalance({
    //   networkGroup: this.networkGroup,
    //   url: API_URL,
    // });
    // if (this.networkGroup === NetworkGroup.mainnets) {
    //   return oneBalance
    //     .depositToken(this.signer, POLYGON_USDC_TOKEN_ADDRESS, amount)
    //     .then(() => undefined);
    // }
    //
    // return oneBalance.depositNative(this.wallet, amount).then(() => undefined);
  }

  async getBalance(): Promise<bigint> {
    // const balanceResponse = await new OneBalance({
    //   networkGroup: this.networkGroup,
    //   url: API_URL,
    // }).getSponsor().then(r => r?.mainBalance);
    //
    // if (!balanceResponse)
    //   throw new Error("Null response from gelato on getSponsorBalance.");
    //
    // return BigNumber.from(balanceResponse.remainingBalance);

    return 0n;
  }

  async lookup(task: string): Promise<GelatoRelayStatus> {
    try {
      const taskStatus = await this.gelato.getTaskStatus(task);

      if (!taskStatus)
        return {
          isComplete: false,
          isError: true,
          transactionHash: undefined,
        };
      const isComplete = taskStatus.taskState === "ExecSuccess";
      const isError = [
        "ExecReverted",
        "Blacklisted",
        "Cancelled",
        "NotFound",
      ].includes(taskStatus.taskState);

      return {
        ...taskStatus,
        isError,
        isComplete,
        transactionHash: taskStatus.transactionHash,
      };
    } catch (error: any) {
      if (
        (error as { message: string }).message.endsWith(
          "Failed with error: Status not found"
        )
      ) {
        return {
          isComplete: false,
          isError: false,
          transactionHash: undefined,
        };
      }
      console.error(error);
      return {
        isComplete: false,
        isError: true,
        transactionHash: undefined,
      };
    }
  }

  async send(tx: PreparedTransactionRequest): Promise<RelayResponse> {
    if (!this.forwarder) {
      if (tx.data === undefined || tx.to === undefined) {
        throw new Error(
          "Transaction is missing data or to address - cannot be sent to Gelato"
        );
      }

      const toAddress = await resolveAddress(tx.to);

      // Use Gelato's forwarder - NOTE! This does not support concurrent requests.
      const request = {
        chainId: BigInt(this.chainId),
        target: toAddress,
        data: tx.data,
        user: await this.signer.getAddress(),
      };
      // send relayRequest to Gelato Relay API
      return this.gelato.sponsoredCallERC2771(
        request,
        // Gelato is fixing the ethers version to 6.7.0 which cannot be hoisted without fixing the ethers version globally
        this.signer as any,
        this.apiKey
      );
    }

    // If a forwarder is set, use sponsoredCall directly, without the Gelato forwarder
    // Sign and wrap the tx in a metatx targeting the custom forwarder
    const metaTx = await createEIP2771ForwardedTransaction(
      tx,
      this.forwarder,
      this.signer
    );
    if (metaTx.data === undefined) throw new Error("Invalid metaTx data");

    // create a SponsoredCallRequest pointing to that forwarder
    const request = {
      chainId: BigInt(this.chainId),
      target: this.forwarder.address,
      data: metaTx.data || "",
    };

    // send the request via Gelato
    return this.gelato.sponsoredCall(request, this.apiKey);
  }

  async supportsChain(chainId: number): Promise<boolean> {
    return this.gelato.isNetworkSupported(BigInt(chainId));
  }
}
