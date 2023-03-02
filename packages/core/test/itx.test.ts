import * as dotenv from "dotenv";
import { Relayers, waitForRelay } from "../src";
import { ITXRelayer } from "../src/relayers/itx";
import { providers, Wallet } from "ethers";
import { type GenericRelayer } from "../src/types";
import {
  DEFAULT_FORWARDER_ADDRESS,
  DEFAULT_GATEWAY_TOKEN_ADDRESS,
  GatewayTs,
} from "@identity.com/gateway-eth-ts";
import { type GatewayTsTransaction } from "@identity.com/gateway-eth-ts/dist/service/GatewayTsTransaction";
import { expect } from "chai";

dotenv.config({
  path: `${process.cwd()}/../../.env`,
});
describe("itx", function () {
  this.timeout(70_000);
  let provider: providers.InfuraProvider;
  let wallet: Wallet;
  let relay: GenericRelayer;
  let gatewayTs: GatewayTsTransaction;

  before(async () => {
    if (process.env.INFURA_API_KEY === undefined) {
      throw new Error("INFURA_API_KEY is not set");
    }

    provider = new providers.InfuraProvider(
      "goerli",
      process.env.INFURA_API_KEY
    );
    wallet = new Wallet(`0x${process.env.PRIVATE_KEY!}`, provider);

    const foundRelayer = await Relayers([
      ITXRelayer.with({
        apiKey: process.env.INFURA_API_KEY!,
        forwarder: {
          address: DEFAULT_FORWARDER_ADDRESS,
          EIP712Domain: {
            name: "FlexibleNonceForwarder",
            version: "0.0.1",
          },
        },
        options: {
          schedule: "fast",
        },
      }),
    ]).for(5, wallet); // ITX only works for goerli testnet

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

    const status = await waitForRelay(relay, response.taskId);

    expect(status?.isComplete).to.be.true;
  });
});
