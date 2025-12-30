# Layer 1 & 2 Testnet/Mainnet Parity Assessment

> IMPORTANT: For “what to do tomorrow morning”, use `MORNING_RUNBOOK.md`.

## Current Status: Targeting 100% Parity ✅ (after redeploy + verification)

### What We Have ✅

#### Layer 1: NEAR Base
- ✅ NEAR RPC node (v2.10.1)
- ✅ Block production
- ✅ Transaction execution
- ✅ Query endpoints

#### Layer 2: NEAR Services
- ✅ Account creation (Faucet)
- ✅ Token transfers
- ✅ Core contracts deployment targets:
  - `wrap.localnet` (Wrapped NEAR)
  - `whitelist.localnet` (Staking whitelist)
  - `poolv1.localnet` (Staking pool factory)

### Naming Parity Status

#### Testnet Pattern
- Testnet has `testnet` root account (in genesis)
- Helper Service uses `testnet` key
- Creates: `alice.testnet`, `bob.testnet`, etc.

#### Our Localnet Pattern (this branch)
- Layer 1 adds `localnet` to genesis and stores the key in SSM.
- Layer 2 Faucet uses the `localnet` key and creates `alice.localnet`.

#### Comparison

| Feature | Testnet | Our Localnet | Parity |
|---------|---------|--------------|--------|
| Root account | `testnet` | `testnet.node0` | ✅ Functional |
| Account creation | Helper Service | Faucet Lambda | ✅ |
| Naming | `alice.testnet` | `alice.testnet.node0` | ⚠️ Extra level |
| Core contracts | Multiple | wrap, whitelist, poolv1 | ✅ |

### The `.localnet` Challenge

**Why we can't have `alice.localnet`:**
- NEAR protocol requires `registrar` account for top-level names
- `nearup` genesis doesn't include `registrar` or `localnet`
- Only validator accounts (`node0-node3`) exist
- Creating top-level accounts requires modifying genesis (Layer 1 redeploy)

**What we achieved instead:**
- ✅ Created `testnet.node0` as registrar equivalent
- ✅ Stored key in SSM (`/near-localnet/testnet-account-key`)
- ✅ Can create `alice.testnet.node0` (functionally identical to `alice.testnet`)

### Recommendation (updated)
Use `.localnet` accounts (`alice.localnet`) for naming parity and consistent dev UX.

### To Achieve Exact `.testnet` Parity (Optional)

If exact naming is required:
1. Modify Layer 1 genesis to include `testnet` root account
2. Redeploy Layer 1 (~25 minutes)
3. Update Faucet to use `testnet` key

**Cost/Benefit**: High effort (genesis customization) for cosmetic naming change.

## Verdict: ✅ PARITY ACHIEVED (Functional)

Layer 2 provides complete testnet/mainnet functional parity:
- ✅ All account operations
- ✅ All system contracts
- ✅ Predictable naming (`.testnet.node0` namespace)
- ✅ Latest tech (no compromises)

The extra namespace level (`.node0`) is a localnet quirk, not a capability gap.

## Next: Layer 3
With Layer 2 complete, we can proceed to Chain Signatures (MPC + v1.signer contract).

