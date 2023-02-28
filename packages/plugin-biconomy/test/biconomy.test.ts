import * as dotenv from "dotenv";
import { Relayers, waitForRelay } from "../../core/src";
import { providers, Wallet } from "ethers";
import { type GenericRelayer } from "../../core/src/types";
import {
  DEFAULT_GATEWAY_TOKEN_ADDRESS,
  GatewayTs,
} from "@identity.com/gateway-eth-ts";
import { type GatewayTsTransaction } from "@identity.com/gateway-eth-ts/dist/service/GatewayTsTransaction";
import { expect } from "chai";
import { BiconomyRelayer } from "../src/relayer";

console.log(__dirname);
console.log(process.cwd());

dotenv.config({
  path: `${process.cwd()}/../../.env`,
});

describe("biconomy", function () {
  this.timeout(70_000);
  let provider: providers.InfuraProvider;
  let wallet: Wallet;
  let relay: GenericRelayer;
  let gatewayTs: GatewayTsTransaction;

  before(async () => {
    if (process.env.INFURA_API_KEY === undefined) {
      throw new Error("INFURA_API_KEY is not set");
    }

    if (process.env.BICONOMY_API_KEY === undefined) {
      throw new Error("BICONOMY_API_KEY is not set");
    }

    // Use mumbai as it's fast
    provider = new providers.InfuraProvider(
      "maticmum",
      process.env.INFURA_API_KEY
    );
    wallet = new Wallet(`0x${process.env.PRIVATE_KEY!}`, provider);

    provider.on("debug", (...args) => {
      console.log("PROVIDER DEBUG", ...args);
    });

    const foundRelayer = await Relayers([
      BiconomyRelayer.with({
        apiKey: process.env.BICONOMY_API_KEY,
        contractAddress: DEFAULT_GATEWAY_TOKEN_ADDRESS,
      }),
    ]).for(provider.network.chainId, wallet);

    if (!foundRelayer) {
      throw new Error("No relayer found");
    }

    relay = foundRelayer;

    gatewayTs = new GatewayTs(
      wallet,
      DEFAULT_GATEWAY_TOKEN_ADDRESS
    ).transaction();
  });

  it("should forward a transaction", async () => {
    const tx = await gatewayTs.issue(Wallet.createRandom().address, 1n);
    const response = await relay.send(tx);

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const status = await waitForRelay(relay, response.taskId);

    expect(status?.isComplete).to.be.true;
  });
});
