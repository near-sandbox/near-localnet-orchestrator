# Layer 2: COMPLETE with Testnet/Mainnet Parity ✅

> IMPORTANT: This doc contains old `.node0` examples and old URLs.
> Use `MORNING_RUNBOOK.md` for the current `.localnet` verification flow.

## Deployment Status

### Faucet Service ✅
- **Stack**: `near-localnet-faucet-v2`
- **Function URL**: `https://ee4nn4wyjwxn3wpewkdlp62iia0aqoua.lambda-url.us-east-1.on.aws/`
- **Capabilities**:
  - Fund accounts (`sendMoney`)
  - Create accounts (`createAccount`)
  - Supports implicit and named sub-accounts

### Core Contracts ✅ DEPLOYED
Using pre-built WASMs from [near/core-contracts](https://github.com/near/core-contracts):

1. **wrap.node0** (Wrapped NEAR)
   - Contract: w-near
   - Tx: `HbCfpeGdSpgf7DBwZvETViorfSuQqRjo1HQrXscCkaS9`
   - Purpose: DeFi token wrapping

2. **whitelist.node0** (Staking Whitelist)
   - Contract: whitelist
   - Tx: `y3jerdWEa3K2jLCZUEZCoaqAvHdRqtj1UYgccLXs3k2`
   - Purpose: Validator whitelist management

3. **poolv1.node0** (Staking Pool Factory)
   - Contract: staking-pool-factory
   - Tx: `D1viGU6u3uYbC3HKz5AF9eYsHiA4u1bef12rCRuQGzBR`
   - Purpose: Validator delegation pools

## Parity Achievement

### ✅ Feature Parity with Testnet/Mainnet
- Account creation (Faucet = Helper Service equivalent)
- Token transfers
- System contracts (w-near, staking, whitelist)
- Contract deployment capability

### Deployment Method
- **Automated**: Orchestrator clones `near/core-contracts` at deployment time
- **Pre-built WASMs**: Uses production binaries (no compilation needed)
- **Latest Version**: Always pulls from `master` branch
- **Atomic Deployment**: CreateAccount + Transfer + DeployContract + Init in single transaction

## Known Limitations

### Connectivity Requirement
Contract deployment requires RPC access. Current workaround:
- Manual deployment via SSM tunnel (as demonstrated)
- Future: Deploy via Lambda (in VPC) or SSM Run Command on NEAR node

### Stack Naming
Faucet stack is `near-localnet-faucet-v2` (workaround for stuck deletion). Update `NearServicesLayer.ts` line 375 to check both names.

## Verification Commands

```bash
# Verify wrap.node0
curl http://localhost:3030 -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"wrap.node0"}}'

# Verify whitelist.node0
curl http://localhost:3030 -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"whitelist.node0"}}'

# Verify poolv1.node0
curl http://localhost:3030 -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"poolv1.node0"}}'
```

## Ready for Layer 3

Layer 2 provides everything Layer 3 (Chain Signatures) needs:
- ✅ Faucet for account creation
- ✅ Core contracts for ecosystem compatibility
- ✅ Stable RPC endpoint

**Next**: Deploy Layer 3 (MPC + v1.signer contract)

