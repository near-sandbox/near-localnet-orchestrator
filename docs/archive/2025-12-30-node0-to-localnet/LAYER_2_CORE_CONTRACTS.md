# Layer 2 Core Contracts Integration - Status

> IMPORTANT: This doc reflects an older approach that attempted to compile `near/core-contracts`.
> The current implementation uses pre-built WASMs and deploys contracts into the `.localnet` namespace.
> Use `MORNING_RUNBOOK.md` for the current workflow.

## Implementation Complete
Layer 2 now includes automated deployment of [near/core-contracts](https://github.com/near/core-contracts) for testnet/mainnet parity.

### What's Implemented
- ✅ Automatic cloning of `near/core-contracts` at deployment time
- ✅ Rust wasm32-unknown-unknown target installation
- ✅ Build orchestration via `scripts/build_all.sh`
- ✅ Deployment script generation
- ✅ Graceful degradation (Layer 2 works even if contracts fail)

### Current Issue
**Rust Compilation Error**: The `core-contracts` repository uses `num-bigint v0.3.2` which has API incompatibilities with Rust 1.86 (current toolchain).

```
error[E0308]: mismatched types
  --> num-bigint-0.3.2/src/biguint/convert.rs:70:19
   |
70 |         .div_ceil(&big_digit::BITS.into())
   |                   ^^^^^^^^^^^^^^^^^^^^^^^ expected `u64`, found `&_`
```

### Solutions
1. **Pin Rust Version**: Use Rust 1.78 or earlier (last known working version)
2. **Pre-built WASMs**: Download from `near/core-contracts` releases
3. **Fork & Fix**: Update `core-contracts` dependencies to work with modern Rust
4. **Manual Deployment**: Build locally and deploy via Faucet

### Contracts to Deploy for Parity
- `wrap.node0` - Wrapped NEAR (w-near)
- `whitelist.node0` - Staking pool whitelist
- `poolv1.node0` - Staking pool factory
- `multisig.node0` - Multisig wallets (optional)
- `lockup.node0` - Token vesting (optional)

### Workaround
For immediate use, deploy pre-built contracts manually:
```bash
# Download WASMs from releases
curl -L https://github.com/near/core-contracts/releases/download/v1.0.0/w_near.wasm -o w_near.wasm

# Deploy via Faucet createAccount mode or near-cli
```

## Next Steps
1. Document this limitation in Layer 2 README
2. Provide manual deployment guide
3. Consider forking `core-contracts` with updated dependencies
4. Move to Layer 3 with current baseline

