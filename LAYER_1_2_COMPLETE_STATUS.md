# Layer 1 & 2 Status: Operational with Known Limitations

## Deployment Status

### Layer 1: NEAR Base ✅ COMPLETE
- **Infrastructure**: All stacks `CREATE_COMPLETE`
  - `near-localnet-common` (VPC, IAM, Security Groups)
  - `near-localnet-infrastructure` (EC2 Instance)
  - `near-localnet-install` (Validation)
  - `near-localnet-sync` (RPC Endpoint)
- **Instance**: `i-04e50891ed0111b73`
- **Private IP**: `10.0.13.20`
- **RPC Endpoint**: `http://10.0.13.20:3030`
- **Status**: ✅ Blockchain active, producing blocks

### Layer 2: NEAR Services ✅ OPERATIONAL
- **Faucet Stack**: `near-localnet-faucet-v2` (`UPDATE_COMPLETE`)
- **Function URL**: `https://ee4nn4wyjwxn3wpewkdlp62iia0aqoua.lambda-url.us-east-1.on.aws/`
- **Capabilities**:
  - ✅ Fund existing accounts
  - ✅ Create implicit accounts (hex addresses)
  - ✅ Create named sub-accounts (`alice.node0`)
- **Integration**: ✅ Lambda → NEAR Node working (VPC connectivity confirmed)

### Core Contracts ⚠️ IN PROGRESS
- **Implementation**: ✅ Deployment logic added to `NearServicesLayer.ts`
- **Automation**: ✅ Clones `near/core-contracts` at deployment time
- **Build**: ❌ Fails due to Rust 1.86 incompatibility with `num-bigint v0.3.2`
- **Workaround**: Manual deployment or pre-built WASMs (documented in `LAYER_2_CORE_CONTRACTS.md`)

## Parity Assessment

### Current Parity Level: Basic
- ✅ Account creation (within localnet namespace)
- ✅ Token transfers
- ✅ Contract deployment capability
- ⏳ System contracts (w-near, staking, multisig) - **Not deployed due to build issue**

### For Full Testnet/Mainnet Parity
**Required**:
- `wrap.node0` (Wrapped NEAR)
- `whitelist.node0` (Staking whitelist)
- `poolv1.node0` (Staking pool factory)

**Optional** (for advanced features):
- `multisig.node0` (Multisig wallets)
- `lockup.node0` (Token vesting)
- `voting.node0` (Governance)

## Known Issues

### Issue 1: Orchestrator IP Caching
The orchestrator sometimes passes stale IP addresses (`10.0.55.70` instead of `10.0.13.20`). Manual Lambda environment variable updates required.
- **Root Cause**: `deployment-state.json` caching or stale CloudFormation output reads
- **Workaround**: Manual `aws lambda update-function-configuration`

### Issue 2: Stack Naming Mismatch
Faucet stack renamed to `near-localnet-faucet-v2` to bypass stuck deletion. `NearServicesLayer.ts` hardcodes `near-localnet-faucet` in output reading.
- **Root Cause**: ENI deletion delays during rollback
- **Workaround**: Update `NearServicesLayer.ts` to check both stack names or revert to `v1` name once cleanup completes

### Issue 3: Core Contracts Build Failure
`near/core-contracts` doesn't compile with Rust 1.86 due to `num-bigint` API changes.
- **Root Cause**: Upstream dependency incompatibility
- **Solutions**:
  a. Pin Rust to 1.78 (add `rust-toolchain.toml`)
  b. Use pre-built WASMs from releases
  c. Fork and update dependencies

## Testing Summary

### ✅ Verified Working
- **Faucet `sendMoney` mode**: `curl` test successful (txHash: `HwuTFdmcBCrDv6K9...`)
- **Faucet `createAccount` mode**: `curl` test successful (txHash: `3uPhFkTv...`)
- **Layer 1 ↔ Layer 2 connectivity**: Lambda in VPC can reach private RPC

### ⚠️ Partial
- **near-cli integration**: Fails due to `localnet` environment config (client-side issue, not platform)
- **Core contracts**: Build infrastructure ready, execution blocked

## Recommendations

### Short Term (Proceed to Layer 3)
- Layer 2 is functional for basic development
- Core contracts can be deployed manually if needed
- Move forward with Layer 3 (Chain Signatures) testing

### Medium Term (Full Parity)
- Fix core-contracts build (pin Rust version or use pre-built)
- Update `NearServicesLayer.ts` to use correct stack name
- Fix IP address caching in Orchestrator

### Long Term (Production)
- Use AWS Systems Manager Parameter Store for inter-layer state (not `deployment-state.json`)
- Add retry logic for ENI cleanup during rollbacks
- Version contract WASMs in S3 for reproducible deployments

## Repository Status
- ✅ `near-sandbox/near-localnet-orchestrator`: Committed
- ✅ `near-sandbox/near-localnet-services`: Committed  
- ✅ `near-sandbox/AWSNodeRunner`: Committed

## Next: Layer 3
Layer 3 (Chain Signatures) requires:
- ✅ Layer 1 NEAR RPC
- ✅ Layer 2 Faucet (for funding)
- ⏳ Ethereum Localnet (partially implemented)
- ⏳ MPC Infrastructure (needs CDK deployment)

