import * as dotenv from "dotenv";
import { Relayers, waitForRelay } from "../src";
import { BigNumber, providers, Wallet } from "ethers";
import { type GenericRelayer } from "../src/types";
import {
  DEFAULT_FORWARDER_ADDRESS,
  DEFAULT_GATEWAY_TOKEN_ADDRESS,
  GatewayTs,
} from "@identity.com/gateway-eth-ts";
import { type GatewayTsTransaction } from "@identity.com/gateway-eth-ts/dist/service/GatewayTsTransaction";
import { expect } from "chai";
import { GelatoRelayer } from "../src/relayers/gelato";

dotenv.config({
  path: `${process.cwd()}/../../.env`,
});

describe("gelato", function () {
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
        forwarder: {
          address: DEFAULT_FORWARDER_ADDRESS,
          EIP712Domain: {
            name: "FlexibleNonceForwarder",
            version: "0.0.1",
          },
        },
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

    expect(balance.gt(BigNumber.from(0))).to.be.true;
  });

  it("should forward a transaction", async () => {
    const tx = await gatewayTs.issue(Wallet.createRandom().address, 1n);

    const response = await relay.send(tx);
    console.log(response);
    const status = await waitForRelay(relay, response.taskId);
    const txResponse = await provider.getTransaction(status.transactionHash!);

    console.log(txResponse);
    expect(txResponse.confirmations).to.be.greaterThan(0);
    expect(status?.isComplete).to.be.true;
  });

  // this still works but does not support concurrent transactions
  it("should forward a transaction using the default gelato forwarder", async () => {
    const relayerUsingDefaultGelatoForwarder = await Relayers([
      GelatoRelayer.with({
        apiKey: process.env.GELATO_API_KEY!,
      }),
    ]).for(provider.network.chainId, wallet);
    const tx = await gatewayTs.issue(Wallet.createRandom().address, 1n);

    const response = await relayerUsingDefaultGelatoForwarder!.send(tx);
    const status = await waitForRelay(relay, response.taskId);

    expect(status?.isComplete).to.be.true;
  });

  // passes with the custom forwarder but fails with the default one
  it("can handle transactions sent concurrently", async () => {
    const tx1 = await gatewayTs.issue(Wallet.createRandom().address, 1n);
    const tx2 = await gatewayTs.issue(Wallet.createRandom().address, 1n);
    const [response1, response2] = await Promise.all([
      relay.send(tx1),
      relay.send(tx2),
    ]);
    const [status1, status2] = await Promise.all([
      waitForRelay(relay, response1.taskId),
      waitForRelay(relay, response2.taskId),
    ]);

    expect(status1?.isComplete).to.be.true;
    expect(status2?.isComplete).to.be.true;
  });
});
