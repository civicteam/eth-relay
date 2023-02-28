import {
  type Relayer,
  type RelayerBuilder,
  type RelayResponse,
  type RelayStatus,
} from "@civic/eth-relay";
import { Biconomy } from "@biconomy/mexa";
import {
  type BigNumber,
  type PopulatedTransaction,
  type providers,
  type Wallet,
} from "ethers";

interface BiconomyConfig {
  apiKey: string;
  contractAddress: string;
}

type BiconomyRelayStatus = RelayStatus & {
  code: number | undefined;
  error: string | undefined;
  // TODO other data
};

// extracted from biconomy config
const BICONOMY_RESPONSE_CODES = {
  SUCCESS: 200,
  ACTION_COMPLETE: 143,
  USER_CONTRACT_NOT_FOUND: 148,
  ERROR_RESPONSE: 144,
  BAD_REQUEST: 400,
};

export class BiconomyRelayer implements Relayer<RelayResponse, RelayStatus> {
  constructor(
    private readonly wallet: Wallet,
    private readonly chainId: number,

    private readonly biconomy: Biconomy
  ) {}

  static with(
    config: BiconomyConfig
  ): RelayerBuilder<RelayResponse, RelayStatus, BiconomyConfig> {
    return async (chainId: number, wallet: Wallet) => {
      // hack needed because Biconomy requires passing in a web3 provider,
      // in the form of an Ethers external provider.
      // even if we have a normal Ethers one.
      const web3provider: providers.ExternalProvider = {
        request: async (request: { method: string; params?: any[] }) => {
          if (request.method === "eth_signTypedData_v4") {
            if (!request.params || request.params.length < 2) {
              throw new Error("Invalid params for eth_signTypedData_v4");
            }
            const param = request.params[1];
            console.log("***param 1", JSON.parse(param));
            console.log("types", param.types);
            return wallet._signTypedData(
              param.domain,
              param.types,
              param.message
            );
          }
          return (wallet.provider as providers.JsonRpcProvider).send(
            request.method,
            request.params ?? []
          );
        },
      };

      const biconomy = new Biconomy(web3provider, {
        apiKey: config.apiKey,
        debug: true,
        contractAddresses: [config.contractAddress],
      });
      console.log("Starting biconomy init...");
      await biconomy.init();
      console.log("Ended biconomy init...");

      return new BiconomyRelayer(wallet, chainId, biconomy);
    };
  }

  async fund(amount: BigNumber): Promise<void> {
    throw new Error("Method not implemented for Biconomy.");
  }

  async getBalance(): Promise<BigNumber> {
    throw new Error("Method not implemented for Biconomy.");
  }

  async lookup(task: string): Promise<BiconomyRelayStatus> {
    const status = await this.biconomy.getTransactionStatus(task);

    const isComplete = status.flag === BICONOMY_RESPONSE_CODES.SUCCESS;

    // TODO what is the "wait state"?
    const isError = status.flag !== BICONOMY_RESPONSE_CODES.SUCCESS;

    return {
      ...status,
      isError,
      isComplete,
    };
  }

  async send(tx: PopulatedTransaction): Promise<RelayResponse> {
    if (tx.data === undefined || tx.to === undefined)
      throw new Error(
        "Gelato requires a data field and to address in the transaction."
      );

    console.log("Sending transaction to biconomy...", tx);

    const txParams = {
      data: tx.data,
      to: tx.to,
      value: tx.value,
      from: this.wallet.address,
      signatureType: "EIP712_SIGN",
    };

    return new Promise((resolve, reject) => {
      if (!this.biconomy.provider.send) {
        reject(new Error("Biconomy send function unavailable."));
        return;
      }
      this.biconomy.provider.send(
        { method: "eth_sendTransaction", params: [txParams] },
        (error, result) => {
          if (error !== undefined) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
    });

    // or should we use this?
    // return this.biconomy.sendTransaction(this.biconomy, this.wallet.address, tx.data);
  }

  async supportsChain(chainId: number): Promise<boolean> {
    return [
      // mainnets
      1, 137, 100, 56, 2021, 1284, 42161, 250,
      // testnets
      3, 4, 42, 5, 77, 80001, 97, 1287, 421611, 4002,
    ].includes(chainId);
  }
}
