import {
  type ForwarderConfig,
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "../types";
import { BigNumber, type PopulatedTransaction, type Wallet } from "ethers";
import {
  GelatoRelay,
  type SponsoredCallRequest,
  type SponsoredCallERC2771Request,
  type TransactionStatusResponse,
} from "@gelatonetwork/relay-sdk";
import { OneBalance } from "@gelatonetwork/1balance-sdk";
import { createEIP2771ForwardedTransaction } from "../lib/metatx";

interface GelatoConfig {
  apiKey: string;
  // Setting a custom forwarder uses gelato.sponsoredCall instead of gelato.sponsoredCallERC2771
  // Gelato's default forwarder does not support concurrent requests.
  forwarder?: ForwarderConfig;
}

// extracted from Gelato SDK
export enum NetworkGroup {
  mainnets = "mainnets",
  testnets = "testnets",
}
const API_URL = "https://api.gelato.digital";
const POLYGON_USDC_TOKEN_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

type GelatoRelayStatus = RelayStatus & Partial<TransactionStatusResponse>;

export class GelatoRelayer
  implements Relayer<RelayResponse, GelatoRelayStatus>
{
  private readonly networkGroup: NetworkGroup;

  private readonly gelato: GelatoRelay;
  constructor(
    private readonly wallet: Wallet,
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
    return async (chainId: number, wallet: Wallet) =>
      new GelatoRelayer(wallet, chainId, config.apiKey, config.forwarder);
  }

  async fund(amount: BigNumber): Promise<void> {
    const oneBalance = new OneBalance({
      networkGroup: this.networkGroup,
      url: API_URL,
    });
    if (this.networkGroup === NetworkGroup.mainnets) {
      return oneBalance
        .depositToken(this.wallet, POLYGON_USDC_TOKEN_ADDRESS, amount)
        .then(() => undefined);
    }

    return oneBalance.depositNative(this.wallet, amount).then(() => undefined);
  }

  async getBalance(): Promise<BigNumber> {
    const balanceResponse = await new OneBalance({
      networkGroup: this.networkGroup,
      url: API_URL,
    }).getSponsorBalance(this.wallet.address);

    if (!balanceResponse)
      throw new Error("Null response from gelato on getSponsorBalance.");

    return BigNumber.from(balanceResponse.remainingBalance);
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

  async send(tx: PopulatedTransaction): Promise<RelayResponse> {
    if (!this.forwarder) {
      if (tx.data === undefined || tx.to === undefined) {
        throw new Error(
          "Transaction is missing data or to address - cannot be sent to Gelato"
        );
      }
      // Use Gelato's forwarder - NOTE! This does not support concurrent requests.
      const request: SponsoredCallERC2771Request = {
        chainId: this.chainId,
        target: tx.to,
        data: tx.data,
        user: this.wallet.address,
      };
      // send relayRequest to Gelato Relay API
      return this.gelato.sponsoredCallERC2771(
        request,
        this.wallet,
        this.apiKey
      );
    }

    // If a forwarder is set, use sponsoredCall directly, without the Gelato forwarder
    // Sign and wrap the tx in a metatx targeting the custom forwarder
    const metaTx = await createEIP2771ForwardedTransaction(
      tx,
      this.forwarder,
      this.wallet
    );
    if (metaTx.data === undefined) throw new Error("Invalid metaTx data");

    // create a SponsoredCallRequest pointing to that forwarder
    const request: SponsoredCallRequest = {
      chainId: this.chainId,
      target: this.forwarder.address,
      data: metaTx.data || "",
    };

    // send the request via Gelato
    return this.gelato.sponsoredCall(request, this.apiKey);
  }

  async supportsChain(chainId: number): Promise<boolean> {
    return this.gelato.isNetworkSupported(chainId);
  }
}
