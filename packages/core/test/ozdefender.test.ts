import * as dotenv from "dotenv";
import { Relayers, waitForRelay, DefenderRelayer } from "../src";
import { type GenericRelayer } from "../src/types";
import {
  DEFAULT_FORWARDER_ADDRESS,
  DEFAULT_GATEWAY_TOKEN_ADDRESS,
  GatewayTs,
} from "@identity.com/gateway-eth-ts";
import { expect } from "chai";
import { InfuraProvider, type Signer, Wallet } from "ethers";

dotenv.config({
  path: `${process.cwd()}/../../.env`,
});

describe.only("openzeppelin defender", function () {
  this.timeout(70_000);
  let provider: InfuraProvider;
  let signer: Signer;
  let relay: GenericRelayer;
  let gatewayTs: ReturnType<GatewayTs["transaction"]>;
  let chainId: number;

  before(async () => {
    const requiredEnvVars = [
      "INFURA_API_KEY",
      "PRIVATE_KEY",
      "OZ_API_KEY",
      "OZ_SECRET_KEY",
      "OZ_MANAGER_KEY",
      "OZ_MANAGER_SECRET",
      "OZ_MANAGER_RELAYER_ID",
    ];
    requiredEnvVars.forEach((envVar) => {
      if (process.env[envVar] === undefined) {
        throw new Error(`${envVar} is not set`);
      }
    });

    provider = new InfuraProvider("matic-amoy", process.env.INFURA_API_KEY);
    signer = new Wallet(`0x${process.env.PRIVATE_KEY!}`, provider);

    chainId = await provider
      .getNetwork()
      .then((network) => Number(network.chainId));

    const foundRelayer = await Relayers([
      DefenderRelayer.with({
        apiKey: process.env.OZ_API_KEY!,
        secretKey: process.env.OZ_SECRET_KEY!,
        speed: "fast",
        chainId,
        forwarder: {
          address: DEFAULT_FORWARDER_ADDRESS,
          EIP712Domain: {
            name: "FlexibleNonceForwarder",
            version: "0.0.1",
          },
        },
        manager: {
          apiKey: process.env.OZ_MANAGER_KEY!,
          secretKey: process.env.OZ_MANAGER_SECRET!,
          relayId: process.env.OZ_MANAGER_RELAYER_ID!,
        },
      }),
    ]).for(Number(chainId), signer);

    if (!foundRelayer) {
      throw new Error("No relayer found");
    }

    relay = foundRelayer;

    gatewayTs = new GatewayTs(signer, DEFAULT_GATEWAY_TOKEN_ADDRESS, {
      gasLimit: 2_000_000,
    }).transaction();
  });

  it("should get the relayer balance", async () => {
    const balance = await relay.getBalance();

    expect(Number(balance)).to.be.greaterThan(0);
  });

  it("should forward a transaction", async () => {
    const address = Wallet.createRandom().address;
    const tx = await gatewayTs.issue(address, 1n);
    console.log(`Issuing a pass to ${address}`);

    const response = await relay.send(tx);
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
