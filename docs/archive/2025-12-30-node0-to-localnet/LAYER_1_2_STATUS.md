# Layer 1 & 2 Status: Operational (Feature Parity In Progress)

> IMPORTANT: This is a point-in-time status doc (old instance IDs / old URLs).
> Use `MORNING_RUNBOOK.md` for the current deploy + verify steps.

## Current State

### Layer 1: NEAR Base ✅
- **Status**: Fully Operational
- **Instance**: `i-04e50891ed0111b73`
- **Private IP**: `10.0.13.20`
- **RPC Endpoint**: `http://10.0.13.20:3030`
- **Stacks**: All `CREATE_COMPLETE`
  - `near-localnet-common`
  - `near-localnet-infrastructure`
  - `near-localnet-install`
  - `near-localnet-sync`

### Layer 2: NEAR Services ✅
- **Status**: Operational
- **Stack**: `near-localnet-faucet-v2` (`UPDATE_COMPLETE`)
- **Function URL**: `https://ee4nn4wyjwxn3wpewkdlp62iia0aqoua.lambda-url.us-east-1.on.aws/`
- **Capabilities**:
  - ✅ Fund existing accounts (`sendMoney`)
  - ✅ Create implicit accounts (hex addresses)
  - ✅ Create named sub-accounts (`alice.node0`)

### Integration Verification ✅
- Layer 2 Lambda successfully connects to Layer 1 node
- Transactions execute successfully
- Test Transaction: `HwuTFdmcBCrDv6K9WfEamv1gyKDADpLsTGYfLdoVzeBk`

## Parity Status: Partial

### What Works
- Basic blockchain operations (transactions, queries)
- Account creation within localnet namespace (`*.node0`)
- Token transfers

### What's Missing for Full Testnet Parity
**Issue**: Localnet (`nearup`) initializes with `node0`, `node1`, etc. as genesis accounts. To create `alice.testnet` style accounts, we need either:
1. A `testnet` root account initialized on the chain
2. Default testnet contracts deployed (if any exist beyond helper service)

**Testnet Account Creation**:
- On Testnet: Helper service holds `testnet` account key, can create `alice.testnet`
- On Our Localnet: Faucet holds `node0` key, can create `alice.node0`

### Action Items for Full Parity
1. ✅ Faucet supports `createAccount` mode
2. ⏳ Load default testnet/mainnet contracts (researching which contracts are needed)
3. ⏳ Optionally: Initialize `testnet` root account for familiar naming

## Commits
- **near-localnet-services**: Faucet with `createAccount` support
- **near-localnet-orchestrator**: Context passing fixes
- **AWSNodeRunner**: (pending commit of any changes)

## Next Steps
1. Research testnet default contracts
2. Deploy missing contracts for parity
3. Update documentation
4. Proceed to Layer 3

