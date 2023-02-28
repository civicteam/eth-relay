# ETH Relay

A library encapsulating various transaction relayers on EVM chains

Example usage

```ts
import {Relayers, waitForRelay} from "@civic/eth-relay";

// Relayers should be listed in order of preference
// The first one that supports the chainId will be used
const relayers = Relayers([
    GelatoRelayer.with({
        apiKey: process.env.GELATO_API_KEY!,
    }),
    ITXRelayer.with({
        apiKey: process.env.INFURA_API_KEY!,
        forwarderAddress: ERC2771_FORWARDER_ADDRESS,
        options: {
            schedule: 'fast'
        }
    })]
);

const relay = await relayers.for(chainId, wallet);

const response = await relay.send({
    to: '0x...',
    from: '0x...',
    data: '0x...',
});

// look up tx status
const status = await relay.lookup(response.taskId);

// wait for tx to be confirmed
await waitForRelay(relay, response.taskId);
```