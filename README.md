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
        // OPTIONAL - use only to override Gelato's default forwarder
        forwarder: {
            address: ERC2771_FORWARDER_ADDRESS,
            EIP712Domain: {
                // Your forwarder details here
                name: 'MinimalForwarder',
                version: '0.0.1',
            },
        },
    }),
    ITXRelayer.with({
        apiKey: process.env.INFURA_API_KEY!,
        forwarder: {
            address: ERC2771_FORWARDER_ADDRESS,
            EIP712Domain: {
                // Your forwarder details here
                name: 'MinimalForwarder',
                version: '0.0.1',
            },
        },
        options: {
            schedule: 'fast'
        }
    })]
);

// Get the preferred relay for the chainId
const relay = await relayers.for(chainId, wallet);

// Send a transaction
const response = await relay.send({
    to: '0x...',
    from: '0x...',
    data: '0x...',
});

// Look up tx status
const status = await relay.lookup(response.taskId);

// Wait for tx to be confirmed
await waitForRelay(relay, response.taskId);
```
