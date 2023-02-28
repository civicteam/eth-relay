import {
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "../types";
import { BigNumber, type PopulatedTransaction, type Wallet } from "ethers";
import {
  GelatoRelay,
  type SponsoredCallERC2771Request,
  type TransactionStatusResponse,
} from "@gelatonetwork/relay-sdk";
import { OneBalance } from "@gelatonetwork/1balance-sdk";

interface GelatoConfig {
  apiKey: string;
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

    private readonly apiKey: string
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
      new GelatoRelayer(wallet, chainId, config.apiKey);
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
      if (error.message === "Failed with error: Status not found") {
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
    if (tx.data === undefined || tx.to === undefined)
      throw new Error(
        "Gelato requires a data field and to address in the transaction."
      );

    const request: SponsoredCallERC2771Request = {
      chainId: this.chainId,
      target: tx.to,
      data: tx.data,
      user: this.wallet.address,
    };

    // send relayRequest to Gelato Relay API
    return this.gelato.sponsoredCallERC2771(request, this.wallet, this.apiKey);
  }

  async supportsChain(chainId: number): Promise<boolean> {
    return this.gelato.isNetworkSupported(chainId);
  }
}
