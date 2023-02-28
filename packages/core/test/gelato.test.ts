import * as dotenv from 'dotenv';
import {Relayers, waitForRelay} from "../src";
import {providers, Wallet} from "ethers";
import {GenericRelayer} from "../src/types";
import {DEFAULT_GATEWAY_TOKEN_ADDRESS, GatewayTs} from "@identity.com/gateway-eth-ts";
import {GatewayTsTransaction} from "@identity.com/gateway-eth-ts/dist/service/GatewayTsTransaction";
import {expect} from "chai";
import {GelatoRelayer} from "../src/relayers/gelato";

dotenv.config({
    path: `${process.cwd()}/../../.env`,
});

describe('gelato', function () {
    this.timeout(70_000);
    let provider: providers.InfuraProvider;
    let wallet: Wallet;
    let relay: GenericRelayer;
    let gatewayTs: GatewayTsTransaction;

    before(async () => {
        if (!process.env.INFURA_API_KEY) {
            throw new Error('INFURA_API_KEY is not set');
        }

        if (!process.env.GELATO_API_KEY) {
            throw new Error('GELATO_API_KEY is not set');
        }

        provider = new providers.InfuraProvider("maticmum", process.env.INFURA_API_KEY);
        wallet = new Wallet(`0x${process.env.PRIVATE_KEY}`, provider);

        const foundRelayer = await Relayers([
            GelatoRelayer.with({
                apiKey: process.env.GELATO_API_KEY,
            })
        ]).for(provider.network.chainId, wallet);  // Use mumbai as it's fast

        if (!foundRelayer) {
            throw new Error('No relayer found');
        }

        relay = foundRelayer;

        gatewayTs = new GatewayTs(wallet, DEFAULT_GATEWAY_TOKEN_ADDRESS).transaction();
    });

    it('should forward a transaction', async () => {
        const tx = await gatewayTs.issue(Wallet.createRandom().address, 1n);
        const response = await relay.send(tx);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const status = await waitForRelay(relay, response.taskId);

        expect(status?.isComplete).to.be.true;
    })
});