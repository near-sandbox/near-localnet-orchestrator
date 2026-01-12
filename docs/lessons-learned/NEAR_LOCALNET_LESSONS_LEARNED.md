# NEAR Localnet: Lessons Learned, Nuances & Gotchas

> **The Complete Guide to Building a Production-Equivalent NEAR Localnet**
>
> This document captures all the hidden gems, pitfalls, and hard-won knowledge from building a 5-layer NEAR localnet simulation stack. If you're setting up a NEAR localnet with Chain Signatures and MPC infrastructure, read this first.

---

## Table of Contents

1. [The 5-Layer Architecture](#the-5-layer-architecture)
2. [Layer 1: NEAR Base - The Foundation](#layer-1-near-base---the-foundation)
3. [Layer 2: NEAR Services - The Utilities](#layer-2-near-services---the-utilities)
4. [Layer 3: Chain Signatures & MPC - The Complexity](#layer-3-chain-signatures--mpc---the-complexity)
5. [Layer 4: Intents Protocol - The Application Layer](#layer-4-intents-protocol---the-application-layer)
6. [NEAR Account Naming - Patterns & Best Practices](#near-account-naming---patterns--best-practices)
7. [Key Management - Security Patterns](#key-management---security-patterns)
8. [MPC Infrastructure - Deep Dive](#mpc-infrastructure---deep-dive)
9. [AWS CDK Patterns & Pitfalls](#aws-cdk-patterns--pitfalls)
10. [Networking & VPC Considerations](#networking--vpc-considerations)
11. [Common Errors & Solutions](#common-errors--solutions)
12. [MPC Setup & Observability](#mpc-setup--observability)
13. [Deployment Timelines & Costs](#deployment-timelines--costs)

---

## The 5-Layer Architecture

### Critical Understanding: This is NOT Optional

The NEAR localnet stack is organized into 5 layers with strict dependencies. **You cannot skip layers or deploy them out of order.**

```
┌─────────────────────────────────────────────────────────┐
│ Layer 5: User Applications                              │
│ (Developer's dApps - not managed by orchestrator)       │
└────────────────────────────────────────────────────────-┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Intents Protocol                               │
│ near-intents-simulator - 1Click API for cross-chain     │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Chain Signatures                               │
│ cross-chain-simulator + EMBEDDED MPC Infrastructure     │
│ ⚠️  MPC is NOT a separate layer!                         │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 2: NEAR Services                                  │
│ near-localnet-services - Faucet, core contracts         │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 1: NEAR Base                                      │
│ AWSNodeRunner - NEAR RPC node, VPC, infrastructure      │
└─────────────────────────────────────────────────────────┘
```

### 🚨 GOTCHA #1: MPC is Embedded in Layer 3

> **MPC infrastructure is NOT a separate layer.** This is the single most confusing aspect of the architecture.

The `cross-chain-simulator` repository includes:
- Chain Signatures API
- v1.signer contract deployment
- **AND** the embedded MPC infrastructure from `github.com/near/mpc`

When you deploy Layer 3, you deploy all three components together.

---

## Layer 1: NEAR Base - The Foundation

### What Gets Deployed

- NEAR Protocol node (v2.10.1)
- VPC with 2 AZs, 1 NAT Gateway
- EC2 instance (t3.large or m7a.2xlarge)
- Security groups for RPC and SSH
- SSM VPC endpoints for Session Manager access

### 🚨 GOTCHA #2: x86_64 Architecture Required

> **NEAR Protocol does NOT support ARM64.** Always use x86_64 instances.

```typescript
// WRONG - will fail
instanceCpuType: "arm64"

// CORRECT
instanceCpuType: "x86_64"
```

Use `m7a.2xlarge` for production or `t3.large` for development.

### 🚨 GOTCHA #3: NEAR Compilation Time

> **nearcore takes 15-20 minutes to compile from source.** This is unavoidable.

The UserData script compiles NEAR from source because:
- nearup requires the binary path
- Pre-built binaries are version-specific
- Source compilation ensures compatibility

**Deployment Timeline:**
- Common Stack: ~2 minutes
- Infrastructure Stack: ~5 minutes (includes cfn-signal)
- Install Stack: ~15 minutes (validates compilation)
- Sync Stack: ~immediate

### 🚨 GOTCHA #4: Ubuntu 24.04 Requires Special pip Flag

When installing `nearup` on Ubuntu 24.04 LTS, you MUST use `--break-system-packages`:

```bash
pip3 install --user --break-system-packages nearup
```

Without this flag, pip will refuse to install packages system-wide and the deployment will fail.

### 🚨 GOTCHA #5: RPC is VPC-Only by Default

The NEAR RPC endpoint (`http://{private-ip}:3030`) is only accessible from within the VPC. To access it locally:

```bash
# Start SSM port forwarding (dynamically discover instance ID)
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" \
  --output text --profile shai-sandbox-profile)

aws ssm start-session \
  --target $INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3030"],"localPortNumber":["3030"]}' \
  --profile shai-sandbox-profile
```

Then access at `http://localhost:3030`.

### 🚨 GOTCHA #6: Log Locations

When debugging, check these log files on the EC2 instance:

| Log File | Purpose |
|----------|---------|
| `/var/log/near-setup.log` | UserData execution |
| `/var/log/nearup.log` | NEAR daemon logs |
| `/var/log/near-init-complete.log` | Initialization marker |

### 🚨 GOTCHA #6.5: NEAR Base P2P Must Bind to 0.0.0.0, Not 127.0.0.1 (CRITICAL FOR MPC)

> **If MPC nodes show `peers: null` and connection refused to port 24567, NEAR Base node0 is binding to localhost only.**

**The Problem:**
NEAR Base node0 starts with `neard run` without specifying `--network-addr`, causing it to bind P2P to `127.0.0.1:24567` by default. MPC nodes in the VPC cannot connect to localhost of a different machine.

**Symptoms:**
```bash
# On MPC node logs:
tier2 failed to connect to ed25519:7PGseFbWxvYVgZ89K1uTJKYoKetWs7BJtbyXDzfbAcqX@10.0.1.12:24567
err="tcp::Stream::connect(): TcpStream::connect(): Connection refused (os error 111)"

# MPC node /status shows:
{
  "peers": null,           # Should be >= 1
  "block": 281717,
  "syncing": false,
  "chain_id": "test-chain-klXRp"
}
```

**Root Cause:**
In `AWSNodeRunner/lib/near/lib/infrastructure-stack.ts` around line 275:
```bash
# Current (BROKEN for MPC peering):
su - ubuntu -c "nohup ~/nearcore/target/release/neard --home ~/.near/localnet/node0 run > ~/neard-node0.log 2>&1 &"
# This binds P2P to 127.0.0.1:24567 by default
```

**Impact:**
- ✅ NEAR Base works fine standalone (4 localnet nodes peer internally)
- ✅ RPC port 3030 works (explicitly bound to 0.0.0.0 by neard)
- ❌ MPC nodes cannot establish P2P connections to NEAR Base
- ❌ MPC indexers show null peers (critical for proper operation)
- ⚠️ MPC nodes CAN read blockchain state via RPC (may appear to work)
- ❌ But MPC coordination requires proper P2P sync (may fail later)

**The Fix:**
Start node0 with explicit `--network-addr` to bind to all interfaces:
```bash
# Fixed (allows MPC nodes to peer):
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
su - ubuntu -c "nohup ~/nearcore/target/release/neard --home ~/.near/localnet/node0 run --network-addr 0.0.0.0:24567 > ~/neard-node0.log 2>&1 &"

# Also update boot node string for node1-3:
BOOT_NODE="${BOOT_PUB}@${PRIVATE_IP}:24567"  # Use private IP, not 127.0.0.1
```

**Why This Matters:**
The MPC `start.sh` explicitly states (line 19-20):
```bash
# boot_nodes must be filled in or else the node will not have any peers.
```

And the MPC README confirms:
> "NEAR Indexer: this is a NEAR node that tracks the shard where the signing smart contract is on."

MPC nodes run **full NEAR indexer nodes**, not RPC-only clients. They need proper P2P connectivity to:
1. Sync blocks efficiently from NEAR Base
2. Maintain blockchain state consistency
3. Detect contract events reliably
4. Coordinate MPC operations properly

**Related Gotchas:**
- See GOTCHA #15.5 for boot_nodes public key matching
- See GOTCHA #15.6 for genesis hash matching
- See GOTCHA #10 for MPC sync requirements

---

## Layer 2: NEAR Services - The Utilities

### What Gets Deployed

- Faucet Lambda for token distribution
- Core contracts: `wrap.localnet`, `whitelist.localnet`, `poolv1.localnet`
- SSM parameters for account keys

### 🚨 GOTCHA #7: Core Contracts Deploy FROM INSIDE the VPC

> **You cannot deploy core contracts from your local machine.** The RPC is VPC-only.

We use a **custom SSM Command document** to deploy contracts from the NEAR EC2 instance itself:

```yaml
# assets/ssm-documents/near-localnet-deploy-core-contracts.yaml
# This runs ON the EC2 instance where localhost:3030 is accessible
```

This pattern avoids network connectivity issues with private RPC endpoints.

### 🚨 GOTCHA #8: Faucet Stack Version Naming

The faucet stack names are versioned (`near-localnet-faucet-v2`, `v3`, `v4`, etc.) because:

1. Lambda VPC ENI cleanup can take 20+ minutes during stack deletion
2. Old stacks may be stuck in `DELETE_IN_PROGRESS`
3. Incrementing version allows fresh deployment without waiting

The code automatically checks multiple versions to find an existing stack:

```typescript
const stackNamesToCheck = [
  'near-localnet-faucet-v6',
  'near-localnet-faucet-v5',
  'near-localnet-faucet-v4',
  // ...
];
```

### 🚨 GOTCHA #9: `.localnet` Naming Parity

To mirror testnet/mainnet naming:
- Root account: `localnet` (added via genesis modification)
- Sub-accounts: `alice.localnet`, `bob.localnet`
- Faucet uses `localnet` key from SSM

This requires Layer 1 to configure the genesis with `localnet` as the root account.

---

## Layer 3: Chain Signatures & MPC - The Complexity

**This layer has the most gotchas. Pay close attention.**

### What Gets Deployed

1. **MPC Infrastructure** (3-8 EC2 nodes running MPC containers)
2. **v1.signer Contract** deployed to `v1.signer.localnet`
3. **Chain Signatures API** for address derivation and signing

### Proper Layer 3 Deployment Flow (CRITICAL)

> **Always follow this exact sequence.** Skipping steps or reordering causes key mismatches.

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Ensure Layer 1 (NEAR Base) is Running                  │
│         - Fresh blockchain state                                 │
│         - Genesis accessible at ~/.near/localnet/node0/         │
│         - Boot nodes available                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Upload Genesis to S3                                    │
│         aws s3 cp ~/.near/localnet/node0/genesis.json \         │
│           s3://bucket/genesis.json                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Generate MPC Keys                                       │
│         ./scripts/generate-test-keys.sh 3                       │
│         - Creates keys for 3 MPC nodes                          │
│         - Outputs mpc-node-keys.json                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Deploy MPC Stack                                        │
│         cdk deploy MpcStandaloneStack --profile ...             │
│         - Creates MPC node EC2 instances                        │
│         - Creates Secrets Manager entries (PLACEHOLDERS)        │
│         - Creates MPC node NEAR accounts using generated keys   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Populate Secrets Manager                                │
│         ./scripts/update-secrets.sh ./mpc-node-keys.json        │
│         - Replaces PLACEHOLDER with real keys                   │
│         - MPC nodes will start using these keys                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Wait for MPC Nodes to Sync (~10 min)                    │
│         - Check logs: docker logs mpc-node                      │
│         - Verify block height matches NEAR Base                 │
│         - Verify 4 peers connected                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Deploy Contract Using mpc-setup.ts                      │
│         npm run start:localnet                                  │
│         - Creates account hierarchy                             │
│         - Deploys v1.signer.wasm                                │
│         - Initializes with Secrets Manager keys                 │
│         - Votes to add ECDSA domain                             │
│         - Waits for key generation                              │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle:** The mpc-setup.ts reads keys from Secrets Manager and uses those SAME keys when:
1. Creating MPC node accounts on-chain
2. Initializing the contract with participant info
3. Voting to add domains

This ensures keys are consistent everywhere.

### 🚨 GOTCHA #10: MPC Nodes MUST Sync to NEAR Base Blockchain

> **MPC nodes need the same genesis as Layer 1.** They are not standalone.

For localnet, MPC nodes must:
- Use the **same genesis.json** as Layer 1
- Connect to Layer 1's boot nodes
- Watch the `v1.signer` contract on Layer 1's chain

We use **S3-based genesis distribution** because:
- EC2 UserData has size limits (~16KB compressed)
- Genesis files are ~6KB base64 encoded
- Every MPC node must use identical genesis

### 🚨 GOTCHA #11: MPC Secrets Manager Placeholders

The MPC CDK stack creates Secrets Manager secrets with **PLACEHOLDER values**:

```
mpc-node-0-mpc_account_sk = "PLACEHOLDER_REPLACE_WITH_REAL_KEY"
```

**MPC nodes will WAIT on boot** (up to 10 minutes) until placeholders are replaced with real keys!

```bash
# Generate and populate keys
./scripts/generate-test-keys.sh 3
./scripts/update-secrets.sh ./mpc-node-keys.json shai-sandbox-profile
```

### 🚨 GOTCHA #11.5: MPC Account Keys MUST Match Between Secrets Manager and On-Chain (CRITICAL)

> **The keys in Secrets Manager MUST match the on-chain access keys.** If they don't, MPC nodes cannot vote.

**The Problem:**
When you redeploy MPC nodes with `redeploy-mpc.sh`, new keys are generated in Secrets Manager. But if the NEAR blockchain still has the OLD MPC node accounts with OLD access keys, there's a mismatch:

```
Secrets Manager (NEW):  ed25519:5sdqHfz5T43XjjcpkmpnLPZbHcJfKkAzT1tk7P5kNaex
On-chain access key (OLD): ed25519:7hEVaincFfGVJeqw9woMJWFJqbFDDPE7yVWaY3U3RQTE
```

**Impact:** MPC nodes cannot sign transactions to vote for domains because their keys don't have on-chain FullAccess.

**Solution - Full Reset Required:**
When redeploying MPC nodes, you MUST also reset the NEAR blockchain state:

```bash
# 1. Destroy MPC stack
cd mpc-repo/infra/aws-cdk
cdk destroy MpcStandaloneStack --profile shai-sandbox-profile

# 2. Reset NEAR Base (resets blockchain state)
# Option A: Restart nearup with fresh data
ssh into NEAR Base
rm -rf ~/.near/localnet
nearup run localnet --binary-path ~/nearcore/target/release

# Option B: Redeploy entire Layer 1 stack
cd AWSNodeRunner/lib/near
cdk destroy --all --profile shai-sandbox-profile
cdk deploy --all --profile shai-sandbox-profile

# 3. Upload fresh genesis to S3 for MPC nodes
aws s3 cp ~/.near/localnet/node0/genesis.json s3://bucket/genesis.json

# 4. Redeploy MPC with fresh keys
./redeploy-mpc.sh

# 5. Deploy contract using mpc-setup.ts (uses Secrets Manager keys)
npm run start:localnet
```

**NEVER:**
- Redeploy MPC nodes without resetting NEAR blockchain
- Manually create MPC node accounts with different keys than Secrets Manager
- Initialize the contract with keys that don't match Secrets Manager

### 🚨 GOTCHA #12: USE_MPC_SETUP Must Be TRUE

> **Always use `USE_MPC_SETUP=true`.** This is the production-equivalent path.

The MPC setup path ensures MPC nodes connect and sync with the NEAR Base node from Layer 1:
1. Initializes contract with `init()`
2. Votes to add ECDSA domain (domain_id: 0)
3. Triggers distributed key generation
4. Ready for signing after keys generate (~10 minutes)

**This is the ONLY supported path.** The legacy path (`USE_MPC_SETUP=false`) was used in earlier iterations but is deprecated and will NOT work properly.

### 🚨 GOTCHA #13: "No Such Domain" Error

If you see this error:
```
Error: No such domain
```

It means the ECDSA domain was never added to the contract. This happens when:
- MPC nodes are running in standalone mode (not synced to Layer 1)
- Domain voting didn't complete
- Boot nodes mismatch (see GOTCHA #15.5)

**Fix:** Ensure MPC nodes are synced to Layer 1 and can reach the v1.signer contract. Check that boot_nodes configuration matches Layer 1's node_key.

### 🚨 GOTCHA #14: MPC Health Checks May Fail (and That's OK)

MPC node endpoints are VPC-only. Health checks from outside the VPC will fail:

```typescript
// Use best_effort mode (default)
const mpcHealthMode = process.env.MPC_NODE_HEALTHCHECK || 'best_effort';

if (mpcHealthMode === 'skip' || mpcHealthMode === 'false') {
  console.log('Skipping MPC node health checks');
}
```

### 🚨 GOTCHA #15: Fetching Boot Node Info via SSM

MPC nodes need the NEAR node_key and genesis from Layer 1. We fetch this via SSM:

```typescript
const parameters = {
  commands: [
    'NODE_KEY=$(curl -sS http://127.0.0.1:3030/status | jq -r .node_key)',
    'GENESIS_B64=$(base64 -w 0 /home/ubuntu/.near/localnet/node0/genesis.json)',
    'echo NODE_KEY=$NODE_KEY',
    'echo GENESIS_B64=$GENESIS_B64',
  ],
};
```

This ensures MPC nodes are always aligned with the currently deployed NEAR chain.

### 🚨 GOTCHA #15.5: Boot Nodes Public Key Mismatch (CRITICAL)

> **If MPC nodes show 0 peers and are stuck at block #0, the boot_nodes public key is WRONG.**

The MPC node's `/data/config.json` contains `network.boot_nodes` in format:
```
ed25519:PUBKEY@NEAR_IP:24567
```

The `ed25519:PUBKEY` portion **MUST match** the NEAR Base node_key. If they don't match, MPC nodes cannot connect to the NEAR localnet peer-to-peer network.

**Diagnosis:**
```bash
# On MPC node (via SSM):
cat /data/config.json | jq -r .network.boot_nodes
# Returns: ed25519:AAAA@10.0.x.x:24567

# On NEAR Base (via SSM):
cat /home/ubuntu/.near/localnet/node0/node_key.json | jq -r .public_key
# Returns: ed25519:BBBB

# If AAAA ≠ BBBB → MPC cannot connect!
```

**Root Cause:** MPC stack was deployed with stale/incorrect `nearBootNodes` context value.

**Fix:** Redeploy MPC stack with correct boot nodes:
```bash
# Get current NEAR Base node_key dynamically
NEAR_KEY=$(cat /home/ubuntu/.near/localnet/node0/node_key.json | jq -r .public_key)
NEAR_IP=$(aws cloudformation describe-stacks --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-private-ip'].OutputValue" --output text)

# Redeploy with correct value
npx cdk deploy --context nearBootNodes="${NEAR_KEY}@${NEAR_IP}:24567"
```

### 🚨 GOTCHA #15.6: Genesis Hash Mismatch Between MPC and NEAR Base

> **MPC nodes require BYTE-IDENTICAL genesis files.** Even small differences will cause sync failures.

**Symptom:**
```
Our genesis: GenesisId { chain_id: "localnet", hash: ABC123... }
their genesis: GenesisId { chain_id: "test-chain-YyAAa", hash: XYZ789... }
```

**Root Cause:** The MPC node's `mpc-node init` command modifies the genesis file, changing the hash.

**Solution:** Copy the EXACT genesis.json from NEAR Base AFTER running `mpc-node init`:

```bash
# On NEAR Base - upload genesis to S3
aws s3 cp /home/ubuntu/.near/localnet/node0/genesis.json s3://your-bucket/genesis.json

# On each MPC node - download and overwrite
docker exec mpc-node sh -c "aws s3 cp s3://your-bucket/genesis.json /data/genesis.json"
docker restart mpc-node
```

### 🚨 GOTCHA #15.7: Chain ID May Not Be "localnet"

> **nearup may generate chain IDs like `test-chain-YyAAa` instead of `localnet`.**

The chain ID is embedded in the genesis file and MUST match across all nodes (NEAR Base and MPC nodes).

**Check your actual chain ID:**
```bash
# On NEAR Base
curl -s http://127.0.0.1:3030/status | jq -r .chain_id
# May return: "test-chain-YyAAa" (NOT "localnet")
```

**Solution:** Always use the chain ID from the running NEAR node, not a hardcoded "localnet" value.

### 🚨 GOTCHA #15.8: NEVER Hardcode AWS Infrastructure Values

> **Do NOT hardcode** instance IDs, IPs, public keys, or ARNs in documentation, scripts, or code.

Always discover values dynamically from CloudFormation outputs or live infrastructure:

| Value | How to Discover |
|-------|-----------------|
| NEAR Instance ID | `aws cloudformation describe-stacks --stack-name near-localnet-infrastructure --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" --output text` |
| NEAR Private IP | `aws cloudformation describe-stacks --stack-name near-localnet-infrastructure --query "Stacks[0].Outputs[?OutputKey=='near-instance-private-ip'].OutputValue" --output text` |
| NEAR node_key | SSM into NEAR Base: `cat /home/ubuntu/.near/localnet/node0/node_key.json \| jq -r .public_key` |
| MPC Instance IDs | `aws cloudformation describe-stacks --stack-name MpcStandaloneStack --query "Stacks[0].Outputs[?contains(OutputKey,'InstanceId')]"` |
| MPC sign_pk | `curl -s http://<mpc-ip>:8080/public_data \| jq -r .near_signer_public_key` |

**Exception:** Dependency versions (package.json, Docker image tags) are appropriate to pin.

See: `.cursor/rules/aws-dynamic-value-discovery.mdc` for full discovery reference.

### 🚨 GOTCHA #15.9: Use near-api-js Instead of near-cli-rs for Localnet

> **near-cli-rs has bugs with nonce fetching on localnet.** Use near-api-js for contract operations.

The `near-cli-rs` tool sometimes fails to find access keys that definitely exist, reporting:
```
Access key for public key ed25519:... has never been observed on the node
```

This happens even when direct RPC queries confirm the key exists. Use `near-api-js` with `InMemoryKeyStore` instead:

```javascript
import pkg from "near-api-js";
const { connect, keyStores, KeyPair } = pkg;

const keyStore = new keyStores.InMemoryKeyStore();
const keyPair = KeyPair.fromString(privateKey);
await keyStore.setKey("localnet", accountId, keyPair);

const near = await connect({
  networkId: "localnet",
  nodeUrl: "http://127.0.0.1:3030",
  keyStore,
});

const account = await near.account(accountId);
// Now all operations work correctly
```

---

## Layer 4: Intents Protocol - The Application Layer

### What Gets Deployed

- 1Click API simulation
- Quote generation for cross-chain swaps
- Route optimization (Rainbow Bridge, Uniswap, Ref Finance)
- Asset registry

### 🚨 GOTCHA #16: Dependency on Layer 3 Config

The Intents layer consumes Chain Signatures config:

```typescript
import { 
  LocalnetConfig,
  getNearRpcUrl,
  getMpcContractId,
  getMpcNodes
} from '@near-sandbox/cross-chain-simulator';
```

If Layer 3 isn't properly deployed, Layer 4 will fail.

### 🚨 GOTCHA #17: Real Infrastructure Over Mocks

> **We don't mock the blockchain.** This simulator runs against real NEAR localnet with real MPC nodes.

The only simulated components are external chain transactions (Ethereum, Bitcoin) that aren't running locally.

---

## NEAR Account Naming - Patterns & Best Practices

### 🚨 GOTCHA #18: NEAR Supports Multi-Level Sub-Accounts

NEAR account naming follows a hierarchical model where sub-accounts can have their own sub-accounts. This is **explicitly supported and encouraged** by the NEAR Protocol.

**Standard Pattern:**
```
localnet                           # Root account
  └── signer.localnet              # Sub-account of localnet
      └── v1.signer.localnet       # Sub-account of signer.localnet
```

**Examples from mainnet/testnet:**
- `v1.signer.testnet` (Chain Signatures on testnet)
- `wrap.near` (wNEAR on mainnet)
- `aurora.near` (Aurora on mainnet)

**Our localnet mirrors this pattern:**
- `v1.signer.localnet` - MPC signer contract
- `wrap.localnet` - wNEAR contract
- `poolv1.localnet` - Staking pool factory

### 🚨 GOTCHA #19: Master Account on Localnet

Different from testnet/mainnet:

| Network | Master Account | Pattern |
|---------|----------------|---------|
| testnet | `testnet` | `*.testnet` |
| mainnet | `near` | `*.near` |
| localnet | `localnet` | `*.localnet` |

This requires genesis modification to add `localnet` as the root account.

### 🚨 GOTCHA #20: `test.near` vs `localnet`

The default nearup localnet creates `test.near` as the master account, but it may have **0 access keys**. We modified the setup to use `localnet` as the root account for naming parity.

---

## Key Management - Security Patterns

### 🚨 GOTCHA #21: NEVER Store Keys in Environment Variables (Production)

**Bad:**
```bash
export MASTER_ACCOUNT_PRIVATE_KEY="ed25519:..."  # ❌ Insecure
```

**Good:**
```bash
export MASTER_ACCOUNT_KEY_ARN="arn:aws:secretsmanager:..."  # ✅ Secure
```

### 🚨 GOTCHA #22: SSM Parameter Naming Convention

Standard SSM parameter names:
```
/near-localnet/localnet-account-id     # String: "localnet"
/near-localnet/localnet-account-key    # SecureString: "ed25519:..."
```

### 🚨 GOTCHA #23: AWS Secrets Manager JSON Format

Master account key secret format:
```json
{
  "account": "localnet",
  "privateKey": "ed25519:..."
}
```

The code parses this and extracts `privateKey`:
```typescript
const secret = JSON.parse(response.SecretString);
return secret.privateKey;
```

### 🚨 GOTCHA #24: KMS for Deployer Account Encryption

Use AWS KMS for encrypting the deployer account key:
```typescript
const kmsKeyId = process.env.DEPLOYER_KMS_KEY_ID;
// Encrypt private key with KMS before storing
// Decrypt on deployment using IAM role
```

---

## MPC Infrastructure - Deep Dive

### 🚨 GOTCHA #25: MPC Docker Image Version Compatibility

MPC nodes must use a version compatible with your nearcore version. **Use the latest stable release:**

| nearcore | Protocol | MPC Image |
|----------|----------|-----------|
| 2.10.1 | 82 | `nearone/mpc-node:3.2.0` |

Check the latest release: `gh release list --repo near/mpc --limit 1`

**⚠️ Code Change Required:** Some config files reference `3.1.0` but should use `3.2.0`. See the staging document for required updates.

### 🚨 GOTCHA #26: Threshold Signatures

The default threshold is 2-of-3:
```typescript
threshold: this.options.threshold || 2
```

This means:
- 3 MPC nodes deployed
- Any 2 nodes can produce a valid signature
- 1 node can be offline without affecting signing

### 🚨 GOTCHA #27: MPC Node Boot Sequence

MPC nodes on boot:
1. Wait for Secrets Manager keys (up to 10 minutes)
2. Sync with NEAR blockchain (need correct genesis + boot_nodes)
3. Watch v1.signer contract for requests
4. Generate beaver triples (background, ~1M per node)
5. Generate presignatures (background)
6. Ready for signing

### 🚨 GOTCHA #28: Contract State Machine

The v1.signer contract has states:

```
NotInitialized → Initializing → Running
      ↓              ↓             ↓
   init()     key_generation   ready for signing
              (domain added)
```

If stuck in `NotInitialized`, domains were never added.
If stuck in `Initializing`, key generation is still in progress (~10 minutes).

---

## AWS CDK Patterns & Pitfalls

### 🚨 GOTCHA #29: Multi-Stack Dependencies

Always use explicit dependencies:
```typescript
infraStack.addDependency(commonStack);
installStack.addDependency(infraStack);
syncStack.addDependency(installStack);
```

### 🚨 GOTCHA #30: cfn-signal for Long-Running UserData

For UserData that takes >5 minutes, use cfn-signal:

```bash
# At end of UserData
/opt/aws/bin/cfn-signal -e $? \
  --stack ${STACK_NAME} \
  --resource ${RESOURCE_ID} \
  --region ${AWS_REGION}
```

### 🚨 GOTCHA #31: CDK Nag Suppressions

Document ALL security suppressions:
```typescript
nag.NagSuppressions.addResourceSuppressions(this, [{
    id: "AwsSolutions-EC23",
    reason: "SSH access needed for debugging, RPC restricted to VPC",
}], true);
```

### 🚨 GOTCHA #32: AWS Profile Required

All CDK commands require the profile:
```bash
cdk deploy --all --profile shai-sandbox-profile
```

Set in environment for convenience:
```bash
export AWS_PROFILE=shai-sandbox-profile
```

### 🚨 GOTCHA #33: CDK Context vs Environment Variables

Use CDK context for deployment-time values:
```bash
cdk deploy -c deployNearNode=false -c nearNodeUrl=http://...
```

Use environment variables for runtime values:
```bash
export NEAR_RPC_URL=http://localhost:3030
```

---

## Networking & VPC Considerations

### 🚨 GOTCHA #34: VPC Endpoints for SSM (Not for Public Access)

We deploy VPC endpoints for **SSM Session Manager access**, not to make the node public:
- `com.amazonaws.{region}.ssm`
- `com.amazonaws.{region}.ssmmessages`
- `com.amazonaws.{region}.ec2messages`

These allow management access to private instances without a public IP. The NEAR RPC remains private within the VPC.

### 🚨 GOTCHA #35: Security Group for RPC

RPC port 3030 should be VPC-only:
```typescript
securityGroup.addIngressRule(
  ec2.Peer.ipv4(vpc.vpcCidrBlock),
  ec2.Port.tcp(3030),
  'NEAR RPC from VPC'
);
```

### 🚨 GOTCHA #36: MPC Nodes in Same VPC as NEAR Base

MPC nodes MUST be deployed in the same VPC as Layer 1:
```typescript
const mpcContext = {
  'vpcId': nearOutputs.outputs.vpc_id,  // Use Layer 1 VPC
  'nearRpcUrl': nearOutputs.outputs.rpc_url,
  // ...
};
```

---

## Common Errors & Solutions

### Error: "Account creation failed for multi-level sub-account"

**Cause:** Parent account doesn't exist in the hierarchy
**Solution:** Create accounts in order: `localnet` → `signer.localnet` → `v1.signer.localnet`

### Error: "Secret not found: arn:aws:secretsmanager:..."

**Cause:** Secret doesn't exist or wrong ARN
**Solution:** 
```bash
aws secretsmanager list-secrets --region us-east-1 \
  --query 'SecretList[?contains(Name, `near`)].{Name:Name,ARN:ARN}'
```

### Error: "Access denied to secret"

**Cause:** IAM role missing Secrets Manager permissions
**Solution:** Redeploy CDK stack to add permissions

### Error: "RPC connection verification failed"

**Cause:** NEAR node not accessible
**Solution:** 
1. Check node is running via SSM: `curl http://localhost:3030/status`
2. Verify security group allows access from VPC CIDR
3. Use SSM port forwarding if accessing from outside VPC

### Error: "No such domain"

**Cause:** MPC nodes not synced to NEAR Base or boot_nodes mismatch
**Solution:** 
1. Verify boot_nodes public key matches Layer 1 node_key (see GOTCHA #15.5)
2. Check MPC node logs: `docker logs mpc-node`
3. Verify genesis matches between MPC and NEAR Base

### Error: "v1.signer.wasm not found"

**Cause:** The MPC signer contract WASM needs to be available
**Solution:** This is handled by Layer 2. Contract deployment and WASM logic belongs in Layer 2 for reuse by Layer 5 applications. Use pre-built contracts from `github.com/near/mpc/releases`.

### Error: "KMS key ID is required"

**Cause:** DEPLOYER_KMS_KEY_ID not set
**Solution:**
```bash
export DEPLOYER_KMS_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name CrossChainSimulatorStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DeployerKmsKeyId`].OutputValue' \
  --output text)
```

### Error: "Access key ... has never been observed on the node"

**Cause:** `near-cli-rs` has a bug with nonce fetching on localnet when the key exists but CLI can't find it.
**Solution:** Use `near-api-js` instead of `near-cli-rs` for contract deployment:

```javascript
import pkg from "near-api-js";
const { connect, keyStores, KeyPair } = pkg;

const keyStore = new keyStores.InMemoryKeyStore();
const keyPair = KeyPair.fromString(privateKey);
await keyStore.setKey("localnet", accountId, keyPair);

const near = await connect({ networkId: "localnet", nodeUrl: RPC_URL, keyStore });
const account = await near.account(accountId);
await account.deployContract(wasmCode);
```

### Error: "LackBalanceForState" / "wouldn't have enough balance to cover storage"

**Cause:** Contract WASM is too large for account balance. The MPC contract is ~1.2MB and requires ~12 NEAR for storage.
**Solution:** Fund the contract account with at least 50-60 NEAR before deployment:

```javascript
await funderAccount.sendMoney(contractAccountId, BigInt("50000000000000000000000000")); // 50 NEAR
```

### Error: "Account does not exist" (but it existed before)

**Cause:** The account was deleted. This can happen when testing contract redeployment flows.
**Solution:** Recreate the full account hierarchy:

```javascript
// 1. Create sub-account with FullAccess key
await parentAccount.createAccount(
  "v1.signer.localnet",
  keyPair.getPublicKey(),
  BigInt("10000000000000000000000000") // 10 NEAR initial
);

// 2. Fund with more NEAR for storage
await parentAccount.sendMoney("v1.signer.localnet", BigInt("50000000000000000000000000"));

// 3. Deploy contract
const contractAccount = await near.account("v1.signer.localnet");
await contractAccount.deployContract(wasmCode);
```

### Error: "missing field `parameters`" on init()

**Cause:** The MPC contract init() expects a specific JSON structure, not flat arguments.
**Solution:** Use the correct init args format:

```javascript
const initArgs = {
  parameters: {
    participants: {
      next_id: 3,
      participants: [
        ["mpc-node-0.localnet", 0, { sign_pk: "ed25519:...", url: "http://..." }],
        ["mpc-node-1.localnet", 1, { sign_pk: "ed25519:...", url: "http://..." }],
        ["mpc-node-2.localnet", 2, { sign_pk: "ed25519:...", url: "http://..." }]
      ]
    },
    threshold: 2
  }
};

await contractAccount.functionCall({
  contractId: "v1.signer.localnet",
  methodName: "init",
  args: initArgs,
  gas: "300000000000000"
});
```

---

## MPC Setup & Observability

### Monitoring MPC Key Generation

The MPC key generation process takes ~10 minutes after domain voting. Currently, observability is limited:

**What We Have:**
- Contract state query: Check if contract is in `Running` state
- MPC node health endpoint: `/health` on each node
- Docker logs: `docker logs mpc-node` on each MPC EC2 instance

**Checking Contract State:**
```bash
# Via SSM on NEAR Base or MPC node:
curl -s http://localhost:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"query",
    "params":{
      "request_type":"call_function",
      "finality":"final",
      "account_id":"v1.signer.localnet",
      "method_name":"state",
      "args_base64":"e30="
    },
    "id":"1"
  }' | jq -r '.result.result' | base64 -d | jq '.protocol_state'
```

Expected states:
- `"NotInitialized"` - Contract not initialized
- `{"Initializing": {...}}` - Key generation in progress
- `{"Running": {...}}` - Ready for signing ✅

**Fail-Fast Improvements Needed:**
1. Better logging during key generation
2. CloudWatch metrics for MPC node sync status
3. Contract state polling with clear status messages
4. Timeout detection for stuck key generation

---

## Deployment Timelines & Costs

### Full Stack Deployment Time

| Layer | Time | Cost/Month |
|-------|------|------------|
| Layer 1: NEAR Base | ~22 minutes | ~$105 |
| Layer 2: NEAR Services | ~5 minutes | ~$5-10 |
| Layer 3: Chain Signatures | ~20 minutes | ~$100-150 |
| Layer 4: Intents Protocol | ~5 minutes | $0 (library) |
| **Total** | **~52 minutes** | **~$210-265** |

### Cost Breakdown

- **NEAR Base EC2** (m7a.2xlarge): ~$105/month
- **MPC Nodes EC2** (3x t3.medium): ~$90/month
- **VPC, NAT Gateway**: ~$35/month
- **Lambda, SSM, Secrets Manager**: ~$5-10/month

---

## Final Checklist

Before deploying, ensure:

- [ ] AWS credentials configured with correct profile
- [ ] x86_64 architecture specified (not ARM64)
- [ ] SSM parameters created for master account
- [ ] VPC has SSM endpoints for Session Manager
- [ ] MPC secrets populated (not placeholders)
- [ ] Account hierarchy created in order (`localnet` → `signer.localnet` → `v1.signer.localnet`)
- [ ] Genesis is shared between NEAR Base and MPC nodes
- [ ] Boot nodes public key matches NEAR Base node_key
- [ ] Security groups allow RPC access from VPC CIDR
- [ ] MPC docker image is `nearone/mpc-node:3.2.0` (latest)
- [ ] CDK Nag suppressions documented

---

## Resources

- [NEAR Documentation](https://docs.near.org/)
- [NEAR Chain Signatures](https://docs.near.org/chain-abstraction/chain-signatures)
- [NEAR Account Model](https://docs.near.org/concepts/basics/accounts/model)
- [MPC Repository](https://github.com/near/mpc)
- [nearcore](https://github.com/near/nearcore)
- [nearup](https://github.com/near/nearup)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

---

---

## Additional Gotchas Discovered During Redeployment

### 🚨 GOTCHA #37: MPC Account Keys MUST Be Created by mpc-setup.ts

> **NEVER manually create MPC node accounts.** Always use mpc-setup.ts from cross-chain-simulator.

The mpc-setup.ts flow:
1. Reads keys from Secrets Manager (`mpc-node-X-mpc_account_sk`)
2. Derives public keys from those private keys
3. Creates MPC node accounts ON-CHAIN with those exact public keys
4. Initializes the contract with those exact public keys as `sign_pk`
5. Votes to add domains using those exact keys

**If you manually create accounts or initialize the contract**, you risk using different keys than what's in Secrets Manager, causing a permanent mismatch.

**Symptoms of Key Mismatch:**
```
Error: Can't complete the action because access key ed25519:XXX doesn't exist
```
Where XXX is the Secrets Manager key but the on-chain account has a different key.

### 🚨 GOTCHA #38: Domain Voting Requires Correct Key Setup

Domain voting (via `vote_add_domains`) requires:
1. MPC node accounts exist on-chain with FullAccess keys
2. Those keys match what's in Secrets Manager
3. mpc-setup.ts orchestrates the voting using Secrets Manager keys

**The mpc-setup.ts handles domain voting automatically.** It:
1. Reads each MPC node's private key from Secrets Manager
2. Signs vote_add_domains transactions for each node
3. Waits for threshold votes (2 of 3)
4. Monitors key generation progress

**If you bypass mpc-setup.ts and try to vote manually**, you must ensure the keys you're using have on-chain FullAccess to the MPC node accounts.

**Checklist if domains aren't being added:**
1. Were accounts created by mpc-setup.ts? (Not manually)
2. Do Secrets Manager keys match on-chain access keys?
3. Are MPC nodes synced? `docker logs mpc-node`
4. Is genesis correct? (See GOTCHA #15.6)
5. Is boot_nodes public key correct? (See GOTCHA #15.5)

### 🚨 GOTCHA #39: Contract Storage Requires ~60 NEAR

The MPC signer contract WASM is ~1.2MB, which requires significant storage stake:

```javascript
// When creating the contract account, fund generously:
const FUND_AMOUNT = "60000000000000000000000000"; // 60 NEAR

await parentAccount.createAccount(
  "v1.signer.localnet",
  keyPair.getPublicKey(),
  BigInt(FUND_AMOUNT)
);
```

**Failing to fund adequately results in:**
```
Error: LackBalanceForState - account wouldn't have enough balance to cover storage
```

---

---

## Full Stack Reset Procedure

When you need to reset the entire localnet stack (e.g., after key mismatches or corrupted state):

### Complete Reset Script

```bash
#!/bin/bash
# full-reset.sh - Reset entire NEAR localnet stack

AWS_PROFILE=shai-sandbox-profile

echo "=== Step 1: Destroy MPC Stack ==="
cd cross-chain-simulator/cross-chain-simulator/mpc-repo/infra/aws-cdk
cdk destroy MpcStandaloneStack --force --profile $AWS_PROFILE

echo "=== Step 2: Destroy NEAR Localnet Stacks ==="
cd AWSNodeRunner/lib/near
cdk destroy near-localnet-test --force --profile $AWS_PROFILE
cdk destroy near-localnet-sync --force --profile $AWS_PROFILE
cdk destroy near-localnet-install --force --profile $AWS_PROFILE
cdk destroy near-localnet-infrastructure --force --profile $AWS_PROFILE
# Keep common stack for VPC reuse, or destroy if needed:
# cdk destroy near-localnet-common --force --profile $AWS_PROFILE

echo "=== Step 3: Clean Secrets Manager ==="
for i in 0 1 2; do
  aws secretsmanager delete-secret --secret-id mpc-node-$i-mpc_account_sk --force-delete-without-recovery --profile $AWS_PROFILE 2>/dev/null || true
  aws secretsmanager delete-secret --secret-id mpc-node-$i-mpc_p2p_private_key --force-delete-without-recovery --profile $AWS_PROFILE 2>/dev/null || true
  aws secretsmanager delete-secret --secret-id mpc-node-$i-mpc_secret_store_key --force-delete-without-recovery --profile $AWS_PROFILE 2>/dev/null || true
done

echo "=== Step 4: Clean SSM Parameters (prevent bitrot) ==="
# MPC node keys
for i in 0 1 2; do
  aws ssm delete-parameter --name "/near-localnet/mpc-node-${i}-account-sk" --profile $AWS_PROFILE 2>/dev/null || true
done
# NEAR Base account keys
for param in agent-test localnet-account-id localnet-account-key master-account-id master-account-key testnet-account-id testnet-account-key; do
  aws ssm delete-parameter --name "/near-localnet/${param}" --profile $AWS_PROFILE 2>/dev/null || true
done

echo "=== Step 5: Redeploy NEAR Base (Layer 1) ==="
cd AWSNodeRunner/lib/near
cdk deploy --all --require-approval never --profile $AWS_PROFILE

echo "=== Step 6: Upload Genesis to S3 ==="
# After NEAR Base is running, upload genesis for MPC nodes
# (Automated in mpc-network.ts via genesisS3Url prop)

echo "=== Step 7: Deploy MPC + Contract (Layer 3) ==="
cd cross-chain-simulator
npm run start:localnet

echo "=== Done! ==="
```

### When to Reset

**Full reset required when:**
- MPC node keys don't match on-chain accounts
- Genesis mismatch between NEAR Base and MPC nodes
- Contract stuck in wrong state
- Blockchain data corruption

**Partial reset (MPC only) when:**
- MPC nodes not syncing (but NEAR Base is fine)
- Contract needs reinitialization (delete account first)

**Why clean SSM parameters?**
- Stale keys cause "key mismatch" debugging nightmares
- Fresh deploys may reuse old (invalid) keys
- Prevents the exact debugging session we went through!

---

*Document Version: 1.3*
*Last Updated: January 2026*
*Maintained by the NEAR Localnet Simulator Team*
