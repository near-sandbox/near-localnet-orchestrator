# Achieving `.localnet` Naming Parity - Implementation Guide

> IMPORTANT: This document is now historical context.
> The current, canonical next-steps doc is `MORNING_RUNBOOK.md`.

## Understanding NEAR Account Naming

### Official Documentation
According to [NEAR Documentation](https://docs.near.org/concepts/basics/networks):
> "The `.near` suffix is standard for account names on all NEAR networks, including MainNet, TestNet, and LocalNet."

However, in practice:
- **Mainnet**: `alice.near`
- **Testnet**: `alice.testnet` (custom suffix)
- **Localnet** (our goal): `alice.localnet`

### How Testnet Works
From [near-contract-helper source code](https://github.com/near/near-contract-helper):
1. `testnet` account exists in **genesis configuration**
2. Helper Service holds `testnet` account's **private key** (not a smart contract!)
3. When creating `alice.testnet`, Helper signs a transaction from `testnet` account
4. Transaction contains: `CreateAccount` + `Transfer` + `AddKey` actions

**There is NO registrar smart contract** - it's just key management.

## Current State (updated)

### What We Have
- ✅ Faucet Lambda (equivalent to Helper Service)
- ✅ Uses **`localnet`** key in SSM (`/near-localnet/localnet-account-key`)
- ✅ Can create `alice.localnet` accounts (once Layer 1 is deployed with updated genesis)
- ✅ Core contracts target `.localnet` namespace

### The Gap (closed on this branch)
- The `localnet` root account is added via Layer 1 bootstrap (genesis modification).
- No `.node0` backward-compat is maintained in Layer 2 anymore (by design).

## Solution: Modify Genesis Configuration

### Why Genesis Modification is Required
`nearup` creates genesis with only validator accounts:
```json
{
  "records": [
    {"Account": {"account_id": "node0", ...}},
    {"Account": {"account_id": "node1", ...}},
    {"Account": {"account_id": "node2", ...}},
    {"Account": {"account_id": "node3", ...}}
  ]
}
```

To create top-level accounts like `localnet`, we must add it to genesis.

### Implementation Steps

#### 1. Generate Keypair
```bash
near generate-key localnet-root --networkId localnet
# Public Key: ed25519:9PPYxbuuy6EyEtJteSHc8DUuCUe2N9nJTrhh2rFh7Kwb
# (Already done, stored in SSM)
```

#### 2. Modify Genesis (On NEAR Node)
```bash
# SSH/SSM into the instance
aws ssm start-session --target i-04e50891ed0111b73 --profile shai-sandbox-profile

# Backup genesis
sudo cp /home/ubuntu/.near/localnet/node0/genesis.json \
        /home/ubuntu/.near/localnet/node0/genesis.json.backup

# Add localnet account
sudo jq '.records += [{
  "Account": {
    "account_id": "localnet",
    "account": {
      "amount": "100000000000000000000000000000",
      "locked": "0",
      "code_hash": "11111111111111111111111111111111",
      "storage_usage": 182,
      "version": "V1"
    }
  }
}] | .records += [{
  "AccessKey": {
    "account_id": "localnet",
    "public_key": "ed25519:9PPYxbuuy6EyEtJteSHc8DUuCUe2N9nJTrhh2rFh7Kwb",
    "access_key": {
      "nonce": 0,
      "permission": "FullAccess"
    }
  }
}]' /home/ubuntu/.near/localnet/node0/genesis.json > /tmp/genesis_new.json

# Copy to all nodes
for node in node0 node1 node2 node3; do
    sudo cp /tmp/genesis_new.json /home/ubuntu/.near/localnet/$node/genesis.json
done
```

#### 3. Restart NEAR Node
```bash
# Stop nearup
sudo pkill -f nearup

# Clear data directories (genesis change requires fresh start)
sudo rm -rf /home/ubuntu/.near/localnet/node*/data

# Restart nearup
sudo -u ubuntu bash -c "cd ~ && ~/.local/bin/nearup run localnet --binary-path ~/nearcore/target/release > /var/log/nearup.log 2>&1 &"

# Wait for startup
sleep 30

# Verify
curl http://localhost:3030/status
```

#### 4. Update Faucet Configuration
On this branch, Faucet is **localnet-only**:
- Uses `/near-localnet/localnet-account-key`
- Creates `*.localnet`

#### 5. Test
```bash
curl -X POST "https://ee4nn4wyjwxn3wpewkdlp62iia0aqoua.lambda-url.us-east-1.on.aws/" \
  -H "Content-Type: application/json" \
  -d '{"mode": "createAccount", "accountId": "alice.localnet", "publicKey": "ed25519:...", "amount": "10"}'
```

## Automation Approach

### Option A: Manual (Current)
- Run script manually on instance
- One-time setup
- Requires SSH/SSM access

### Option B: Automated (Recommended for Production)
Add to Layer 1 deployment (`AWSNodeRunner/lib/near`):
1. Update `infrastructure-stack.ts` UserData to:
   - Generate `localnet` keypair
   - Modify genesis before starting `nearup`
   - Store key in SSM
2. This makes `.localnet` naming automatic on every deployment

### Option C: Custom Genesis Template
- Create pre-configured genesis JSON with `localnet` account
- Store in S3 or embed in CDK
- UserData downloads and uses custom genesis

## Impact

### Before (Current)
```javascript
await faucet.createAccount('alice.node0', publicKey, amount);
// Works ✅
```

### After (With Genesis Modification)
```javascript
await faucet.createAccount('alice.localnet', publicKey, amount);
// Works ✅ - TRUE testnet parity
```

## Recommendation

**For Layer 2 Completion:**
1. Document this solution (✅ this file)
2. Implement genesis modification (manual or automated)
3. Test `.localnet` account creation
4. Update Faucet to use `localnet` key by default

**Timeline:**
- Manual implementation: ~10 minutes
- Automated (Layer 1 update): ~30 minutes (redeploy + compile)

**Trade-off:**
- Current `.node0` namespace: Works NOW, functional parity ✅
- True `.localnet` namespace: Requires genesis modification, cosmetic improvement

## References
- [NEAR Networks Documentation](https://docs.near.org/concepts/basics/networks)
- [near-contract-helper](https://github.com/near/near-contract-helper) - Helper Service implementation
- Script: `near-localnet-orchestrator/scripts/add-localnet-genesis.sh`

## Status
- ✅ Solution designed
- ✅ Script created
- ✅ Keys generated and stored in SSM
- ⏳ Genesis modification (manual step required)
- ⏳ Faucet update for `.localnet` routing

