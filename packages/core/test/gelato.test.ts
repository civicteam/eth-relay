import * as dotenv from "dotenv";
import { Relayers, waitForRelay } from "../src";
import { BigNumber, providers, Wallet } from "ethers";
import { type GenericRelayer } from "../src/types";
import {
  DEFAULT_GATEWAY_TOKEN_ADDRESS,
  GatewayTs,
} from "@identity.com/gateway-eth-ts";
import { type GatewayTsTransaction } from "@identity.com/gateway-eth-ts/dist/service/GatewayTsTransaction";
import { expect } from "chai";
import { GelatoRelayer } from "../src/relayers/gelato";

dotenv.config({
  path: `${process.cwd()}/../../.env`,
});

describe.only("gelato", function () {
  this.timeout(70_000);
  let provider: providers.InfuraProvider;
  let wallet: Wallet;
  let relay: GenericRelayer;
  let gatewayTs: GatewayTsTransaction;

  before(async () => {
    if (process.env.INFURA_API_KEY === undefined) {
      throw new Error("INFURA_API_KEY is not set");
    }

    if (process.env.GELATO_API_KEY === undefined) {
      throw new Error("GELATO_API_KEY is not set");
    }

    provider = new providers.InfuraProvider(
      "maticmum",
      process.env.INFURA_API_KEY
    );
    wallet = new Wallet(`0x${process.env.PRIVATE_KEY!}`, provider);

    const foundRelayer = await Relayers([
      GelatoRelayer.with({
        apiKey: process.env.GELATO_API_KEY,
      }),
    ]).for(provider.network.chainId, wallet); // Use mumbai as it's fast

    if (!foundRelayer) {
      throw new Error("No relayer found");
    }

    relay = foundRelayer;

    gatewayTs = new GatewayTs(
      wallet,
      DEFAULT_GATEWAY_TOKEN_ADDRESS
    ).transaction();
  });

  it("should get the relayer balance", async () => {
    const balance = await relay.getBalance();

    console.log(balance.toString());

    expect(balance.gt(BigNumber.from(0))).to.be.true;
  });

  it("should forward a transaction", async () => {
    const tx = await gatewayTs.issue(Wallet.createRandom().address, 1n);
    const response = await relay.send(tx);
    const status = await waitForRelay(relay, response.taskId);

    expect(status?.isComplete).to.be.true;
  });
});
