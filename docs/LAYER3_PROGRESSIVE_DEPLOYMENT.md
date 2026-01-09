# Layer 3: Chain Signatures - Progressive Deployment Guide

**Version:** 1.1 (CORRECTED)  
**Date:** January 9, 2026  
**Status:** DRAFT - Awaiting Feedback Before Deployment  

## ⚠️ CRITICAL CORRECTION - Chunk Order Fixed

**What Was Wrong:** Original version deployed MPC infrastructure BEFORE collecting genesis data from NEAR Base.

**Why This Failed:** MPC nodes NEED the genesis.json, node_key, and chain_id from NEAR Base to be **baked into their deployment**. Without this data at deployment time, they can't sync.

**What's Fixed:** Chunk order corrected:
- **OLD:** 3.0 Prerequisites → 3.1 Deploy MPC → 3.2 Collect Genesis (too late!)
- **NEW:** 3.0 Prerequisites → 3.1 Collect Genesis → 3.2 Deploy MPC (with genesis data)

This is why you've been experiencing "1 step forward, 2 steps back" - the fundamental deployment order was incorrect. With this fix, MPC nodes will have the correct genesis data from the start.

---

## Purpose

This document breaks down Layer 3 (Chain Signatures with MPC) into 10 verifiable deployment chunks. After 2 weeks of "1 step forward, 2 steps back," this progressive approach ensures we can:
- Identify exactly where failures occur
- Verify each component before moving forward
- Document blockers and resolutions for each chunk
- Build confidence that the full stack will work

**⚠️ IMPORTANT:** Do NOT proceed to any deployment until all feedback has been addressed for each chunk.

---

## Layer 3 Architecture Overview

Layer 3 consists of these components, deployed in sequence:

```
Prerequisites (Layers 1 & 2 exist)
    ↓
Collect Genesis Data from NEAR Base ← CRITICAL: Must come BEFORE MPC deployment
    ↓
Deploy MPC Infrastructure (using genesis data from previous step)
    ↓
Verify MPC Nodes Are Syncing (replace Secrets Manager keys, check sync)
    ↓
MPC Node Account Creation (on-chain accounts with Secrets Manager keys)
    ↓
Contract Deployment (v1.signer.wasm → v1.signer.localnet)
    ↓
Contract Initialization (init() with participants)
    ↓
Domain Voting (triggers DKG)
    ↓
Distributed Key Generation (ONE-TIME SETUP: ~10 minutes)
    ↓
Chain Signatures API (address derivation + signing - FAST: ~2-3 seconds each)
    ↓
Cross-Chain Demo (full flow)
```

**⚠️ IMPORTANT TIMING CLARIFICATION:**
- **DKG (Chunk 3.8):** ~10 minutes - This is a **ONE-TIME** initial setup when the MPC network first generates its shared key
- **Every Signature After (Chunk 3.9+):** ~2-3 seconds - Uses presignatures + 1 round of communication (~1.2s NEAR block time)

The 10-minute wait happens ONCE during initial deployment. After that, all chain signatures complete in seconds, matching mainnet behavior.

### Key Files in Layer 3

| File | Purpose |
|------|---------|
| `cross-chain-simulator/src/localnet/orchestrator.ts` | Main orchestration entry point (`LocalnetOrchestrator` class) |
| `cross-chain-simulator/src/localnet/mpc-setup.ts` | MPC network setup (`MpcSetup` class) - creates accounts, deploys contract, initializes |
| `cross-chain-simulator/scripts/start-localnet.sh` | Shell wrapper that builds TypeScript and runs orchestrator |
| `cross-chain-simulator/cross-chain-simulator/mpc-repo/infra/aws-cdk/` | MPC EC2 infrastructure CDK code |
| `cross-chain-simulator/contracts/v1.signer.wasm` | MPC signer contract WASM (~1.2MB) |

### Code Flow Summary

The `start-localnet.sh` script:
1. Builds TypeScript (`npm run build`)
2. Runs `LocalnetOrchestrator.start()`
3. Which calls `setupMpcApplicationLayer()`
4. Which creates `MpcSetup` instance and calls `setupMpcNetwork()`

The `MpcSetup.setupMpcNetwork()` method executes:
1. `initializeNear()` - Connect to NEAR RPC
2. `initializeMasterAccount()` - Load `localnet` account
3. `createAccountHierarchy()` - Create `signer.localnet` → `v1.signer.localnet`
4. `createMpcNodeAccounts()` - Create `mpc-node-0/1/2.localnet` with keys from Secrets Manager
5. `deployContract()` - Deploy v1.signer.wasm
6. `initializeContract()` - Call `init()` with participants
7. `voteDomains()` - Vote to add Secp256k1 domain (triggers DKG)
8. `waitForKeyGeneration()` - Poll contract state until `protocol_state: "Running"`

---

## Layer 3 Timing Expectations

**Total Deployment Time:** ~30-40 minutes (one-time setup)

| Phase | Time | Frequency |
|-------|------|-----------|
| Chunks 3.0-3.7 | ~20-30 min | One-time deployment |
| **Chunk 3.8: DKG** | **~10 min** | **One-time initialization** |
| Chunk 3.9: Verification | ~2-3 sec per test | Every signature request |
| Chunk 3.10: Demo | ~5-10 sec | Every cross-chain transaction |

**After Deployment is Complete:**
- ✅ Address derivation: **Instant** (deterministic)
- ✅ Transaction signing: **~2-3 seconds** (1 round of MPC communication)
- ✅ Cross-chain messages: **Seconds** (matches mainnet NEAR + IOTEX)

**The 10-minute wait only happens ONCE during Chunk 3.8** when the MPC network generates its shared key for the first time. All subsequent operations are fast.

---

## Progressive Deployment Chunks

### 📋 Chunk 3.0: Prerequisites Validation

**Goal:** Confirm Layers 1 & 2 are healthy and accessible before starting Layer 3.

**⚠️ NOTE:** After this chunk, we MUST collect genesis data from NEAR Base BEFORE deploying MPC infrastructure (Chunk 3.1 → Chunk 3.2 order is critical).

#### What This Validates

- Layer 1 (NEAR Base) is deployed and RPC is responding
- Layer 2 (Faucet) is deployed
- `localnet` master account exists with access keys
- VPC and networking are configured correctly

#### Actual Code Reference

The orchestrator expects these prerequisites:
- `NEAR_RPC_URL` (default: `http://localhost:3030` but we use private IP)
- `MASTER_ACCOUNT_PRIVATE_KEY` or `MASTER_ACCOUNT_KEY_ARN` (from Secrets Manager)
- NEAR RPC must respond to `/status` endpoint

From `orchestrator.ts` lines 44-54:
```typescript
if (!masterKeyArn && !masterKeyDirect) {
  throw new Error(
    'Master account key required. Provide either:\n' +
    '  - masterAccountKeyArn (ARN from AWS Node Runner Secrets Manager) OR\n' +
    '  - masterAccountPrivateKey (local dev only, not recommended for production)\n'
  );
}
```

#### Verification Commands

```bash
# 1. Verify Layer 1 stack exists
aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --profile shai-sandbox-profile \
  --query "Stacks[0].StackStatus" \
  --output text

# Expected: CREATE_COMPLETE or UPDATE_COMPLETE

# 2. Get NEAR instance details
export NEAR_INSTANCE=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" \
  --output text --profile shai-sandbox-profile)

echo "NEAR Instance: $NEAR_INSTANCE"

# 3. Get NEAR private IP
export NEAR_PRIVATE_IP=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-private-ip'].OutputValue" \
  --output text --profile shai-sandbox-profile)

echo "NEAR Private IP: $NEAR_PRIVATE_IP"

# 4. Test RPC access via SSM
aws ssm send-command \
  --instance-ids "$NEAR_INSTANCE" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "curl -s http://127.0.0.1:3030/status | jq \"{
      latest_block_height: .sync_info.latest_block_height,
      chain_id: .chain_id,
      node_key: .node_key,
      syncing: .sync_info.syncing
    }\""
  ]' \
  --profile shai-sandbox-profile \
  --region us-east-1 \
  --query "Command.CommandId" \
  --output text

# Wait 5 seconds, then get results (replace COMMAND_ID)
aws ssm get-command-invocation \
  --command-id "<COMMAND_ID>" \
  --instance-id "$NEAR_INSTANCE" \
  --profile shai-sandbox-profile \
  --query "StandardOutputContent" \
  --output text

# 5. Verify Layer 2 (Faucet)
aws cloudformation describe-stacks \
  --stack-name near-localnet-faucet-v6 \
  --profile shai-sandbox-profile \
  --query "Stacks[0].StackStatus" \
  --output text

# Expected: CREATE_COMPLETE

# 6. Check localnet master account exists
aws ssm get-parameter \
  --name "/near-localnet/localnet-account-id" \
  --profile shai-sandbox-profile \
  --query "Parameter.Value" \
  --output text

# Expected: localnet

# 7. Verify master account key exists (SecureString)
aws ssm get-parameter \
  --name "/near-localnet/localnet-account-key" \
  --with-decryption \
  --profile shai-sandbox-profile \
  --query "Parameter.Value" \
  --output text | head -c 20

# Expected: ed25519:... (should start with this)
```

#### Success Criteria

- ✅ `near-localnet-infrastructure` stack status: `CREATE_COMPLETE` or `UPDATE_COMPLETE`
- ✅ NEAR instance ID retrieved successfully
- ✅ NEAR private IP retrieved successfully
- ✅ RPC `/status` returns:
  - `latest_block_height > 0`
  - `chain_id` is "localnet" or "test-chain-XXX"
  - `node_key` is a valid ed25519 public key
  - `syncing: false`
- ✅ `near-localnet-faucet-v6` stack status: `CREATE_COMPLETE`
- ✅ SSM parameter `/near-localnet/localnet-account-id` exists and equals "localnet"
- ✅ SSM parameter `/near-localnet/localnet-account-key` exists and starts with "ed25519:"

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| NEAR stack not deployed | - | Check CloudFormation console | Deploy Layer 1 first |
| RPC not responding | GOTCHA #2-6 | Check NEAR process running | SSM into instance, run `nearup status` |
| RPC returns empty/error | - | Port 3030 blocked or node crashed | Check security groups, restart nearup |
| Master account key missing | GOTCHA #19 | SSM parameter not found | Check Layer 1 deployment created this |
| VPC not accessible | GOTCHA #34 | Cannot reach private IP | Ensure MPC nodes will be in same VPC |
| Chain ID unexpected | GOTCHA #15.7 | Chain ID is `test-chain-XXX` not `localnet` | Document actual chain_id for later use |

#### Key Gotchas Referenced

- **GOTCHA #2-6:** Layer 1 specific issues (x86_64, compilation, RPC access, logs)
- **GOTCHA #15.7:** Chain ID may be `test-chain-YyAAa` instead of `localnet`
- **GOTCHA #19:** Account naming - `localnet` is root account for naming parity
- **GOTCHA #34:** VPC endpoints for SSM access (not for public access)

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have verified all commands work in my environment
- [ ] I have documented the actual `chain_id` from my NEAR node: _____________
- [ ] I have documented the actual `node_key` from my NEAR node: _____________
- [ ] I have saved the NEAR_PRIVATE_IP for use in subsequent chunks: _____________
- [ ] **Issues/Concerns:**

---

### 🔍 Chunk 3.1: Collect Genesis & Boot Node Data from NEAR Base

**Goal:** Extract genesis.json, node_key, and chain_id from NEAR Base BEFORE deploying MPC infrastructure.

**⚠️ CRITICAL:** This chunk MUST happen BEFORE Chunk 3.2 (MPC deployment). MPC nodes cannot sync without this data.

#### Why This Must Come First

MPC nodes need these exact values from NEAR Base to sync:
1. **genesis.json** - Byte-identical copy (GOTCHA #15.6)
2. **node_key** - Public key for boot_nodes configuration (GOTCHA #15.5)
3. **chain_id** - May be "localnet" or "test-chain-XXX" (GOTCHA #15.7)
4. **private_ip** - For boot_nodes address

Without this data, MPC nodes will:
- Show 0 peers
- Be stuck at block #0
- Never sync to NEAR Base

#### What We'll Collect

From NEAR Base, we need to extract and save:
- Full genesis.json file (~few MB)
- NEAR node public key (from node_key.json)
- Chain ID (from RPC /status)
- NEAR private IP address

#### Collection Commands

```bash
# Set AWS profile
export AWS_PROFILE=shai-sandbox-profile
export AWS_REGION=us-east-1

# Get NEAR instance ID (from Chunk 3.0)
export NEAR_INSTANCE=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" \
  --output text --profile shai-sandbox-profile)

export NEAR_PRIVATE_IP=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-private-ip'].OutputValue" \
  --output text --profile shai-sandbox-profile)

echo "NEAR Instance: $NEAR_INSTANCE"
echo "NEAR Private IP: $NEAR_PRIVATE_IP"

# 1. Get node_key (boot_nodes public key for MPC)
echo "=== Collecting node_key ==="
NEAR_NODE_KEY_CMD=$(aws ssm send-command \
  --instance-ids "$NEAR_INSTANCE" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "cat /home/ubuntu/.near/localnet/node0/node_key.json | jq -r .public_key"
  ]' \
  --profile shai-sandbox-profile \
  --query "Command.CommandId" \
  --output text)

sleep 5

export NEAR_NODE_KEY=$(aws ssm get-command-invocation \
  --command-id "$NEAR_NODE_KEY_CMD" \
  --instance-id "$NEAR_INSTANCE" \
  --profile shai-sandbox-profile \
  --query "StandardOutputContent" \
  --output text | tr -d '\n')

echo "NEAR Node Key: $NEAR_NODE_KEY"

# 2. Get chain_id
echo "=== Collecting chain_id ==="
CHAIN_ID_CMD=$(aws ssm send-command \
  --instance-ids "$NEAR_INSTANCE" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "curl -s http://127.0.0.1:3030/status | jq -r .chain_id"
  ]' \
  --profile shai-sandbox-profile \
  --query "Command.CommandId" \
  --output text)

sleep 5

export NEAR_CHAIN_ID=$(aws ssm get-command-invocation \
  --command-id "$CHAIN_ID_CMD" \
  --instance-id "$NEAR_INSTANCE" \
  --profile shai-sandbox-profile \
  --query "StandardOutputContent" \
  --output text | tr -d '\n')

echo "NEAR Chain ID: $NEAR_CHAIN_ID"

# 3. Download genesis.json
echo "=== Downloading genesis.json ==="
mkdir -p /tmp/near-layer3-genesis

aws ssm send-command \
  --instance-ids "$NEAR_INSTANCE" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "cat /home/ubuntu/.near/localnet/node0/genesis.json > /tmp/genesis.json",
    "echo Genesis file size: $(stat -f%z /tmp/genesis.json) bytes"
  ]' \
  --profile shai-sandbox-profile

# Note: For large genesis files, use S3:
GENESIS_S3_CMD=$(aws ssm send-command \
  --instance-ids "$NEAR_INSTANCE" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "aws s3 cp /home/ubuntu/.near/localnet/node0/genesis.json s3://YOUR-BUCKET/layer3-genesis.json --region us-east-1"
  ]' \
  --profile shai-sandbox-profile \
  --query "Command.CommandId" \
  --output text)

# Download from S3
aws s3 cp s3://YOUR-BUCKET/layer3-genesis.json /tmp/near-layer3-genesis/genesis.json --profile shai-sandbox-profile

# 4. Compute genesis hash for verification
GENESIS_HASH=$(sha256sum /tmp/near-layer3-genesis/genesis.json | cut -d' ' -f1)
echo "Genesis SHA256: $GENESIS_HASH"

# 5. Save collected data to environment file
cat > /tmp/near-layer3-genesis/layer3-config.env <<EOF
# Layer 3 Configuration - Collected from NEAR Base
# Generated: $(date)

export NEAR_NODE_KEY="$NEAR_NODE_KEY"
export NEAR_CHAIN_ID="$NEAR_CHAIN_ID"
export NEAR_PRIVATE_IP="$NEAR_PRIVATE_IP"
export GENESIS_HASH="$GENESIS_HASH"
export NEAR_BOOT_NODES="${NEAR_NODE_KEY}@${NEAR_PRIVATE_IP}:24567"

# Genesis file location
export GENESIS_FILE="/tmp/near-layer3-genesis/genesis.json"
EOF

echo "=== Configuration saved to /tmp/near-layer3-genesis/layer3-config.env ==="
cat /tmp/near-layer3-genesis/layer3-config.env
```

#### Verification Commands

```bash
# 1. Verify all data collected
echo "=== Verification ==="
echo "NEAR Node Key: $NEAR_NODE_KEY"
echo "NEAR Chain ID: $NEAR_CHAIN_ID"
echo "NEAR Private IP: $NEAR_PRIVATE_IP"
echo "Boot Nodes String: $NEAR_BOOT_NODES"
echo "Genesis Hash: $GENESIS_HASH"

# 2. Verify node_key format
if [[ $NEAR_NODE_KEY == ed25519:* ]]; then
  echo "✅ Node key format valid"
else
  echo "❌ Node key format invalid"
fi

# 3. Verify chain_id is not empty
if [ -n "$NEAR_CHAIN_ID" ]; then
  echo "✅ Chain ID collected: $NEAR_CHAIN_ID"
else
  echo "❌ Chain ID empty"
fi

# 4. Verify genesis file exists and is not empty
if [ -f /tmp/near-layer3-genesis/genesis.json ]; then
  GENESIS_SIZE=$(stat -f%z /tmp/near-layer3-genesis/genesis.json 2>/dev/null || stat -c%s /tmp/near-layer3-genesis/genesis.json)
  echo "✅ Genesis file exists: $GENESIS_SIZE bytes"
  
  # Verify it's valid JSON
  if jq empty /tmp/near-layer3-genesis/genesis.json 2>/dev/null; then
    echo "✅ Genesis file is valid JSON"
  else
    echo "❌ Genesis file is not valid JSON"
  fi
else
  echo "❌ Genesis file not found"
fi

# 5. Verify private IP is valid
if [[ $NEAR_PRIVATE_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✅ Private IP format valid"
else
  echo "❌ Private IP format invalid"
fi

# 6. Save to file for next chunk
echo ""
echo "=== Configuration saved ==="
echo "To use in Chunk 3.2:"
echo "  source /tmp/near-layer3-genesis/layer3-config.env"
```

#### Success Criteria

- ✅ `NEAR_NODE_KEY` collected and starts with "ed25519:"
- ✅ `NEAR_CHAIN_ID` collected (either "localnet" or "test-chain-XXX")
- ✅ `NEAR_PRIVATE_IP` collected and is valid IPv4 address
- ✅ Genesis file downloaded to `/tmp/near-layer3-genesis/genesis.json`
- ✅ Genesis file is valid JSON (can be parsed by jq)
- ✅ Genesis file size > 100KB (typical size is few MB)
- ✅ `NEAR_BOOT_NODES` string formatted as: `ed25519:KEY@IP:24567`
- ✅ Configuration saved to `/tmp/near-layer3-genesis/layer3-config.env`
- ✅ Genesis hash computed for later verification

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| SSM connection fails | - | Can't reach NEAR instance | Check NEAR instance is running, VPC endpoints configured |
| node_key file not found | - | Path incorrect | Verify nearup data directory location |
| RPC not responding | - | NEAR node not running | Check `nearup status`, restart if needed |
| Genesis file too large for SSM | - | File > 2MB | Use S3 transfer method (already in commands) |
| Empty chain_id returned | - | RPC not ready | Wait for NEAR node to fully start |
| Invalid genesis JSON | - | Corrupted file | Re-download, verify NEAR node health |
| S3 bucket not accessible | - | Permissions issue | Create bucket or use existing one, update commands |

#### Key Gotchas Referenced

- **GOTCHA #10:** MPC nodes MUST sync to NEAR Base (same genesis + boot_nodes) - Why this chunk is critical
- **GOTCHA #15:** Fetching boot node info via SSM - Method used here
- **GOTCHA #15.5:** Boot nodes public key mismatch causes 0 peers - Prevented by collecting correct node_key
- **GOTCHA #15.6:** Genesis hash mismatch prevents sync - Prevented by byte-identical copy
- **GOTCHA #15.7:** Chain ID may not be "localnet" - We discover actual chain_id here
- **GOTCHA #15.8:** Never hardcode AWS values - We discover dynamically

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have successfully collected NEAR node_key: _____________
- [ ] I have successfully collected NEAR chain_id: _____________
- [ ] I have downloaded genesis.json and verified it's valid JSON
- [ ] I have saved all configuration to layer3-config.env
- [ ] I understand this data will be used in Chunk 3.2 MPC deployment
- [ ] **Issues/Concerns:**

---

### 🏗️ Chunk 3.2: Deploy MPC Infrastructure with Genesis Data

**Goal:** Deploy 3 MPC EC2 nodes using the genesis data collected in Chunk 3.1.

**⚠️ PREREQUISITE:** Must complete Chunk 3.1 first! This chunk uses the genesis data, node_key, and chain_id from NEAR Base.

#### What This Deploys

The MPC CDK stack (`MpcStandaloneStack`) creates:
- 3 EC2 instances (m7a.xlarge or configurable) in NEAR Base VPC
- EFS file system for shared storage
- Security groups allowing communication with NEAR Base
- Secrets Manager secrets with **PLACEHOLDER** values (replaced in Chunk 3.4)
- IAM roles with Secrets Manager read permissions
- UserData that:
  - Uploads genesis.json from Chunk 3.1 to S3 or embeds it
  - Configures boot_nodes using NEAR node_key from Chunk 3.1
  - Sets chain_id from Chunk 3.1
  - Starts MPC node Docker containers

**Key Difference from Before:** Now the genesis data is BAKED INTO the deployment, not discovered afterwards.

#### Actual Code Reference

CDK code location: `cross-chain-simulator/mpc-repo/infra/aws-cdk/`

The CDK deployment needs to pass genesis data via CDK context or S3:

**Method 1: S3 (Recommended for large genesis files)**
1. Upload genesis.json from Chunk 3.1 to S3
2. Pass S3 URL via CDK context
3. UserData downloads from S3 during boot

**Method 2: CDK Context (For small configurations)**
Pass boot_nodes and chain_id via CDK context:
```bash
cdk deploy \
  -c nearBootNodes="ed25519:${NEAR_NODE_KEY}@${NEAR_PRIVATE_IP}:24567" \
  -c nearChainId="$NEAR_CHAIN_ID" \
  -c genesisS3Url="s3://bucket/genesis.json"
```

**⚠️ NOTE:** The current MPC CDK code may need modification to accept these parameters. If not yet implemented, you'll need to either:
- Update the CDK code to accept genesis data as parameters
- Manually configure genesis after deployment (old method - NOT RECOMMENDED)
- Use the orchestrator scripts which handle this automatically

#### Pre-Deployment: Load Configuration from Chunk 3.1

```bash
# Load the configuration collected in Chunk 3.1
source /tmp/near-layer3-genesis/layer3-config.env

# Verify all variables are loaded
echo "=== Configuration Loaded ==="
echo "NEAR Node Key: $NEAR_NODE_KEY"
echo "NEAR Chain ID: $NEAR_CHAIN_ID"
echo "NEAR Private IP: $NEAR_PRIVATE_IP"
echo "Boot Nodes: $NEAR_BOOT_NODES"
echo "Genesis File: $GENESIS_FILE"
echo "Genesis Hash: $GENESIS_HASH"

# 1. Upload genesis.json to S3 (required for MPC deployment)
# Create S3 bucket if needed
export GENESIS_S3_BUCKET="near-layer3-genesis-$(date +%s)"
aws s3 mb s3://$GENESIS_S3_BUCKET --profile shai-sandbox-profile

# Upload genesis
aws s3 cp $GENESIS_FILE s3://$GENESIS_S3_BUCKET/genesis.json --profile shai-sandbox-profile

export GENESIS_S3_URL="s3://$GENESIS_S3_BUCKET/genesis.json"
echo "Genesis uploaded to: $GENESIS_S3_URL"

# 2. Get VPC ID from NEAR Base (MPC must be in same VPC)
export NEAR_VPC_ID=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-common \
  --query "Stacks[0].Outputs[?OutputKey=='vpc-id'].OutputValue" \
  --output text --profile shai-sandbox-profile)

echo "NEAR VPC ID: $NEAR_VPC_ID"
```

#### Deploy MPC Infrastructure

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator/cross-chain-simulator/mpc-repo/infra/aws-cdk

# Set AWS profile
export AWS_PROFILE=shai-sandbox-profile
export AWS_REGION=us-east-1

# Install dependencies
npm install

# Deploy with genesis data via CDK context
npm run cdk deploy -- \
  -c nearBootNodes="$NEAR_BOOT_NODES" \
  -c nearChainId="$NEAR_CHAIN_ID" \
  -c genesisS3Url="$GENESIS_S3_URL" \
  -c vpcId="$NEAR_VPC_ID" \
  --require-approval never

# This takes ~5-10 minutes
# Watch for:
# - EC2 instances launching
# - EFS mounting
# - Genesis download from S3
# - Docker containers starting with correct boot_nodes
# - Secrets Manager secret creation

# Save deployment outputs
aws cloudformation describe-stacks \
  --stack-name MpcStandaloneStack \
  --profile shai-sandbox-profile \
  --query "Stacks[0].Outputs" \
  --output json > /tmp/near-layer3-genesis/mpc-stack-outputs.json

echo "MPC infrastructure deployed"
```

#### Verification: Check MPC Infrastructure

```bash
# 1. Get MPC instance IDs
export MPC_NODE_0=$(aws cloudformation describe-stacks \
  --stack-name MpcStandaloneStack \
  --query "Stacks[0].Outputs[?OutputKey=='Node0InstanceId'].OutputValue" \
  --output text --profile shai-sandbox-profile)

export MPC_NODE_1=$(aws cloudformation describe-stacks \
  --stack-name MpcStandaloneStack \
  --query "Stacks[0].Outputs[?OutputKey=='Node1InstanceId'].OutputValue" \
  --output text --profile shai-sandbox-profile)

export MPC_NODE_2=$(aws cloudformation describe-stacks \
  --stack-name MpcStandaloneStack \
  --query "Stacks[0].Outputs[?OutputKey=='Node2InstanceId'].OutputValue" \
  --output text --profile shai-sandbox-profile)

echo "MPC Node 0: $MPC_NODE_0"
echo "MPC Node 1: $MPC_NODE_1"
echo "MPC Node 2: $MPC_NODE_2"

# 2. Check instances are running
aws ec2 describe-instances \
  --instance-ids "$MPC_NODE_0" "$MPC_NODE_1" "$MPC_NODE_2" \
  --profile shai-sandbox-profile \
  --query "Reservations[*].Instances[*].[InstanceId, State.Name, PrivateIpAddress, VpcId]" \
  --output table

# 3. Verify VPC matches NEAR Base
# VpcId should match $NEAR_VPC_ID

# 4. Check Secrets Manager secrets created
aws secretsmanager list-secrets \
  --profile shai-sandbox-profile \
  --query "SecretList[?contains(Name, 'mpc-node')].[Name, ARN]" \
  --output table

# 5. Check EFS file system created
aws efs describe-file-systems \
  --profile shai-sandbox-profile \
  --query "FileSystems[?Tags[?Key=='aws:cloudformation:stack-name' && Value=='MpcStandaloneStack']].[FileSystemId, Name]" \
  --output table
```

#### Success Criteria

- ✅ MpcStandaloneStack status: `CREATE_COMPLETE`
- ✅ 3 EC2 instances exist with status "running"
- ✅ All instances in same VPC as NEAR Base (`$NEAR_VPC_ID`)
- ✅ 3 Secrets Manager secrets exist: `mpc-node-0/1/2-mpc_account_sk`
- ✅ Secret values are still "PLACEHOLDER_REPLACE_WITH_REAL_KEY" (will replace in Chunk 3.4)
- ✅ EFS file system created
- ✅ Genesis.json downloaded from S3 during boot (check UserData logs)
- ✅ Docker containers started on all 3 nodes

**Note:** MPC nodes won't fully sync yet because they're waiting for real keys from Secrets Manager (GOTCHA #11). This is expected. Full sync verification happens in Chunk 3.3.

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| CDK deployment fails - context not supported | - | CDK code doesn't accept genesis parameters | May need to update CDK code or use manual method |
| S3 genesis upload fails | - | Permissions or bucket issue | Check S3 permissions, create bucket manually |
| CDK deployment fails - VPC not found | GOTCHA #36 | Can't find NEAR VPC | Verify $NEAR_VPC_ID is correct |
| EFS mount fails | - | UserData errors | Check CloudFormation events, verify EFS security groups |
| Secrets Manager secrets not created | GOTCHA #11 | CDK didn't create secrets | Check CDK code, verify IAM permissions |
| Instances can't reach NEAR RPC | GOTCHA #34 | Security group blocking port 3030 | Update NEAR security group to allow MPC subnet |
| Docker container not starting | - | Check docker logs | SSM into instance, check `docker logs mpc-node` |
| Genesis not downloaded from S3 | - | S3 permissions or URL wrong | Check UserData logs, verify S3 URL |

#### Key Gotchas Referenced

- **GOTCHA #10:** MPC nodes MUST sync to NEAR Base - genesis data baked into deployment
- **GOTCHA #11:** MPC Secrets Manager placeholders - nodes will wait for keys (Chunk 3.4)
- **GOTCHA #36:** MPC nodes must be in same VPC as Layer 1 - verified here
- **GOTCHA #25:** MPC Docker image version compatibility

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have verified MPC stack deployed successfully
- [ ] I have confirmed all 3 instances are in the same VPC as NEAR Base
- [ ] I have documented the MPC instance IDs:
  - Node 0: _____________
  - Node 1: _____________
  - Node 2: _____________
- [ ] I have confirmed genesis.json was baked into deployment (via S3 or CDK context)
- [ ] I understand nodes won't fully sync until keys are replaced in Chunk 3.4
- [ ] **Issues/Concerns:**

---

### 🔄 Chunk 3.3: Verify MPC Nodes Are Syncing

**Goal:** After generating and replacing Secrets Manager keys, verify MPC nodes successfully sync with NEAR Base.

**⚠️ NOTE:** This chunk includes generating real keys for Secrets Manager to replace PLACEHOLDER values, then verifying sync.

#### What This Verifies

After MPC infrastructure is deployed (Chunk 3.2), the MPC nodes are waiting for real keys to replace PLACEHOLDER values in Secrets Manager (GOTCHA #11). 

This chunk:
1. **Generates fresh NEAR key pairs** for each MPC node
2. **Updates Secrets Manager** to replace PLACEHOLDER with real keys
3. **Waits for MPC nodes** to detect new keys (~10 min max wait)
4. **Verifies MPC nodes sync** with NEAR Base:
   - Shows `num_peers >= 1`
   - `latest_block_height` is increasing
   - Genesis chain_id matches
   - Boot_nodes public key matches

**This proves the genesis data from Chunk 3.1 was correctly deployed in Chunk 3.2.**

#### Pre-Flight: Generate Real Keys for Secrets Manager

Before running account creation, we need to replace PLACEHOLDER values in Secrets Manager.

**Option A: Generate Fresh Keys (Recommended for Clean Deployment)**

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator

# Generate 3 new NEAR key pairs
for i in 0 1 2; do
  echo "Generating key for mpc-node-$i"
  
  # Generate key using near-api-js
  node -e "
  const nearAPI = require('near-api-js');
  const keyPair = nearAPI.KeyPair.fromRandom('ed25519');
  console.log(keyPair.toString());
  " > /tmp/mpc-node-${i}-key.txt
  
  MPC_KEY=$(cat /tmp/mpc-node-${i}-key.txt)
  
  # Update Secrets Manager
  aws secretsmanager update-secret \
    --secret-id "mpc-node-${i}-mpc_account_sk" \
    --secret-string "$MPC_KEY" \
    --profile shai-sandbox-profile
  
  echo "Updated mpc-node-$i secret"
done

# Verify secrets updated
for i in 0 1 2; do
  echo "=== mpc-node-$i ==="
  aws secretsmanager get-secret-value \
    --secret-id "mpc-node-${i}-mpc_account_sk" \
    --profile shai-sandbox-profile \
    --query "SecretString" \
    --output text
done
```

**Option B: Use Existing Keys (If Redeploying)**

If you're redeploying and want to keep existing accounts:
```bash
# List current keys (if accounts already exist on-chain)
# Don't regenerate keys if accounts already have keys on-chain
# Instead, ensure Secrets Manager matches what's on-chain

# Check what's currently in Secrets Manager
for i in 0 1 2; do
  echo "=== mpc-node-$i current secret ==="
  aws secretsmanager get-secret-value \
    --secret-id "mpc-node-${i}-mpc_account_sk" \
    --profile shai-sandbox-profile \
    --query "SecretString" \
    --output text
done
```

#### Run Account Creation

This will be part of the full orchestrator, but we can test account creation in isolation:

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator

# Build TypeScript
npm run build

# Set environment variables
export NEAR_RPC_URL=http://${NEAR_PRIVATE_IP}:3030  # From Chunk 3.0
export MASTER_ACCOUNT_PRIVATE_KEY="ed25519:..."     # From SSM /near-localnet/localnet-account-key
export AWS_PROFILE=shai-sandbox-profile
export AWS_REGION=us-east-1

# For testing account creation only, modify orchestrator to stop after accounts
# Or run full orchestrator - it's idempotent and will skip existing accounts

# NOTE: At this stage, we'll run the FULL orchestrator in Chunk 3.4
# This chunk is VALIDATION that we're ready
```

#### Verification: Check Accounts Exist On-Chain

```bash
# Helper function to check account
check_account() {
  local account_id=$1
  echo "=== Checking $account_id ==="
  
  curl -s http://${NEAR_PRIVATE_IP}:3030 \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"query\",
      \"params\": {
        \"request_type\": \"view_account\",
        \"finality\": \"final\",
        \"account_id\": \"$account_id\"
      },
      \"id\": 1
    }" | jq '.result // .error'
  
  echo ""
}

# Check account hierarchy
check_account "localnet"
check_account "signer.localnet"
check_account "v1.signer.localnet"

# Check MPC node accounts
check_account "mpc-node-0.localnet"
check_account "mpc-node-1.localnet"
check_account "mpc-node-2.localnet"

# Check access keys for MPC nodes
check_keys() {
  local account_id=$1
  echo "=== Access keys for $account_id ==="
  
  curl -s http://${NEAR_PRIVATE_IP}:3030 \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"query\",
      \"params\": {
        \"request_type\": \"view_access_key_list\",
        \"finality\": \"final\",
        \"account_id\": \"$account_id\"
      },
      \"id\": 1
    }" | jq '.result.keys[] | {public_key: .public_key, permission: .access_key.permission}'
  
  echo ""
}

check_keys "mpc-node-0.localnet"
check_keys "mpc-node-1.localnet"
check_keys "mpc-node-2.localnet"
```

#### Verify Key Matching (CRITICAL)

```bash
# For each MPC node, verify Secrets Manager private key matches on-chain public key

for i in 0 1 2; do
  echo "=== Verifying mpc-node-$i key match ==="
  
  # Get private key from Secrets Manager
  SM_PRIVATE_KEY=$(aws secretsmanager get-secret-value \
    --secret-id "mpc-node-${i}-mpc_account_sk" \
    --profile shai-sandbox-profile \
    --query "SecretString" \
    --output text)
  
  echo "Secrets Manager private key: ${SM_PRIVATE_KEY:0:30}..."
  
  # Derive public key from private key
  SM_PUBLIC_KEY=$(node -e "
  const nearAPI = require('near-api-js');
  const keyPair = nearAPI.KeyPair.fromString('$SM_PRIVATE_KEY');
  console.log(keyPair.getPublicKey().toString());
  ")
  
  echo "Derived public key: $SM_PUBLIC_KEY"
  
  # Get on-chain public key
  ONCHAIN_KEY=$(curl -s http://${NEAR_PRIVATE_IP}:3030 \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"query\",
      \"params\": {
        \"request_type\": \"view_access_key_list\",
        \"finality\": \"final\",
        \"account_id\": \"mpc-node-${i}.localnet\"
      },
      \"id\": 1
    }" | jq -r '.result.keys[0].public_key')
  
  echo "On-chain public key: $ONCHAIN_KEY"
  
  if [ "$SM_PUBLIC_KEY" == "$ONCHAIN_KEY" ]; then
    echo "✅ MATCH"
  else
    echo "❌ MISMATCH - THIS WILL BREAK VOTING!"
  fi
  
  echo ""
done
```

#### Success Criteria

- ✅ All accounts exist on-chain:
  - `localnet` (amount > 0)
  - `signer.localnet` (amount > 0)
  - `v1.signer.localnet` (amount >= 60 NEAR for contract storage)
  - `mpc-node-0.localnet` (amount > 0)
  - `mpc-node-1.localnet` (amount > 0)
  - `mpc-node-2.localnet` (amount > 0)
- ✅ Each MPC node account has exactly 1 FullAccess key
- ✅ **CRITICAL:** For each MPC node, Secrets Manager private key → derived public key MATCHES on-chain public key
- ✅ `v1.signer.localnet` has sufficient balance for contract deployment (~60 NEAR)

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| Account creation fails | - | Insufficient master account balance | Fund localnet account via faucet |
| Key mismatch | GOTCHA #11.5 | Derived public key ≠ on-chain key | Regenerate keys, ensure atomic update |
| Secrets not updated | GOTCHA #11 | Still showing PLACEHOLDER | Rerun key generation, verify update |
| RPC connection fails | - | Can't reach NEAR_RPC_URL | Check VPC, security groups, SSM port forward if needed |
| Near-api-js nonce issues | GOTCHA #15.9 | Nonce out of sync | Use near-api-js InMemoryKeyStore (already done in code) |
| Insufficient storage balance | GOTCHA #39 | v1.signer.localnet < 60 NEAR | Increase funding amount in createAccountHierarchy |

#### Key Gotchas Referenced

- **GOTCHA #11.5:** Keys MUST match between Secrets Manager and on-chain (CRITICAL)
- **GOTCHA #15.9:** Use near-api-js instead of near-cli-rs for localnet
- **GOTCHA #37:** MPC accounts MUST be created by mpc-setup.ts
- **GOTCHA #39:** Contract storage requires ~60 NEAR

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have generated fresh keys and updated Secrets Manager
- [ ] I have verified Secrets Manager no longer shows PLACEHOLDER values
- [ ] I have confirmed all accounts will be funded sufficiently
- [ ] I understand that key mismatch will break domain voting in Chunk 3.6
- [ ] **Issues/Concerns:**

---

### 🔑 Chunk 3.4: MPC Node Account Creation

**Goal:** Create on-chain NEAR accounts for MPC nodes with public keys matching Secrets Manager private keys.

**⚠️ NOTE:** At this point, Secrets Manager has real keys (from Chunk 3.3) and MPC nodes are syncing.

#### What This Deploys

The `MpcSetup.deployContract()` method:
1. Reads WASM file from `contracts/v1.signer.wasm` (~1.2MB)
2. Deploys to `v1.signer.localnet` account
3. Does NOT call any initialization methods yet

#### Actual Code Reference

From `mpc-setup.ts` line 99:
```typescript
const deployedContractId = await this.deployContract(contractId);
```

This method uses `near-api-js` to deploy the contract:
```typescript
await this.contractAccount!.deployContract(wasmBuffer);
```

The contract WASM must be downloaded first.

#### Pre-Flight: Get Contract WASM

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator

# Download v1.signer.wasm from NEAR MPC releases
./contracts/download-wasm.sh

# Verify WASM file exists and is correct size
ls -lh contracts/v1.signer.wasm
# Expected: ~1.2MB (approximately 1,200,000 bytes)

# Check WASM is valid
file contracts/v1.signer.wasm
# Expected: WebAssembly (wasm) binary module
```

#### Contract Deployment (Part of Full Orchestrator)

The contract deployment happens as part of the full orchestrator flow:

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator

# Build TypeScript
npm run build

# Set environment variables
export NEAR_RPC_URL=http://${NEAR_PRIVATE_IP}:3030
export MASTER_ACCOUNT_PRIVATE_KEY="ed25519:..."  # From SSM
export AWS_PROFILE=shai-sandbox-profile
export AWS_REGION=us-east-1

# Run orchestrator (will create accounts + deploy contract)
npm run start:localnet

# Watch for output:
# 📦 [MPC-SETUP] Deploying contract to v1.signer.localnet...
# ✅ [MPC-SETUP] Contract deployed successfully
```

#### Verification: Check Contract Deployed

```bash
# 1. Check contract account has code
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "view_account",
      "finality": "final",
      "account_id": "v1.signer.localnet"
    },
    "id": 1
  }' | jq '.result | {amount, code_hash}'

# Expected: code_hash is NOT "11111111111111111111111111111111"
# Non-zero code_hash means contract is deployed

# 2. Check contract code size
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "view_code",
      "finality": "final",
      "account_id": "v1.signer.localnet"
    },
    "id": 1
  }' | jq '.result.code_base64' | wc -c

# Expected: ~1.6M characters (base64 encoded ~1.2MB WASM)

# 3. Try calling view method (should fail because not initialized yet)
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "public_key",
      "args_base64": "e30="
    },
    "id": 1
  }' | jq

# Expected: Error about contract not initialized, OR empty/null response
# This is OKAY - we'll initialize in Chunk 3.5
```

#### Success Criteria

- ✅ `v1.signer.localnet` account has non-zero `code_hash`
- ✅ Contract code size is approximately 1.2MB (WASM) / 1.6MB (base64)
- ✅ Contract exists but not initialized (calling methods returns error/null)
- ✅ No errors during deployment (check orchestrator output)

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| WASM file not found | - | contracts/v1.signer.wasm missing | Run ./contracts/download-wasm.sh |
| Deployment transaction fails | GOTCHA #15.9 | Nonce issues | near-api-js handles this (already in code) |
| Insufficient gas | - | Transaction out of gas | Increase gas limit in deployContract call |
| Insufficient storage balance | GOTCHA #39 | Account balance < storage cost | Ensured in Chunk 3.3 (60 NEAR funding) |
| Contract already deployed | - | Code already exists | This is OK - deployment is idempotent |

#### Key Gotchas Referenced

- **GOTCHA #15.9:** Use near-api-js instead of near-cli-rs
- **GOTCHA #39:** Contract storage requires ~60 NEAR (funded in Chunk 3.3)

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have confirmed v1.signer.wasm file exists and is valid
- [ ] I have confirmed contract deployment completed successfully
- [ ] I have verified v1.signer.localnet has non-zero code_hash
- [ ] **Issues/Concerns:**

---

### 🎬 Chunk 3.5: Contract Initialization

**Goal:** Call the `init()` method on v1.signer contract with MPC participants.

#### What This Initializes

The `MpcSetup.initializeContract()` method:
1. Calls `init(threshold)` on the contract
2. Passes threshold (default: 2) for 2-of-3 signing
3. Transitions contract state from "NotInitialized" to "Initializing"

The contract state machine (GOTCHA #28):
```
NotInitialized → Initializing → Running
     ↓              ↓              ↓
  init()      key_generation   ready for signing
```

After `init()`, the contract is in "Initializing" state waiting for domain voting (Chunk 3.6) to trigger key generation.

#### Actual Code Reference

From `mpc-setup.ts` line 103:
```typescript
await this.initializeContract(participants);
```

This method calls:
```typescript
await this.contractAccount!.functionCall({
  contractId: this.contractAccount!.accountId,
  methodName: 'init',
  args: { threshold },
  gas: '300000000000000', // 300 TGas
});
```

#### Contract Initialization (Part of Orchestrator)

This happens automatically in the orchestrator after contract deployment:

```bash
# Already running from Chunk 3.4
# Watch for output:
# 🔧 [MPC-SETUP] Initializing contract with participants...
# ✅ [MPC-SETUP] Contract initialized successfully
```

#### Verification: Check Contract State

```bash
# 1. Query contract state
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "state",
      "args_base64": "e30="
    },
    "id": 1
  }' | jq -r '.result.result' | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
print(json.dumps(data, indent=2))
"

# Expected output:
# {
#   "protocol_state": "Initializing",  # NOT "NotInitialized"
#   "participants": {
#     "0": {
#       "account_id": "mpc-node-0.localnet",
#       "sign_pk": "ed25519:...",
#       "url": "http://10.0.x.x:8080"
#     },
#     "1": { ... },
#     "2": { ... }
#   },
#   "threshold": 2,
#   ...
# }

# 2. Check participant count
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "state",
      "args_base64": "e30="
    },
    "id": 1
  }' | jq -r '.result.result' | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
participants = data.get('participants', {})
print(f'Participants: {len(participants)}')
print(f'Threshold: {data.get(\"threshold\", \"unknown\")}')
for idx, p in participants.items():
    print(f'  [{idx}] {p[\"account_id\"]} - {p[\"sign_pk\"][:20]}...')
"

# Expected:
# Participants: 3
# Threshold: 2
#   [0] mpc-node-0.localnet - ed25519:...
#   [1] mpc-node-1.localnet - ed25519:...
#   [2] mpc-node-2.localnet - ed25519:...
```

#### Verify Participant Keys Match Secrets Manager

```bash
# For each participant, verify sign_pk matches Secrets Manager

# Get participant sign_pk from contract
for i in 0 1 2; do
  echo "=== Verifying participant $i ==="
  
  CONTRACT_SIGN_PK=$(curl -s http://${NEAR_PRIVATE_IP}:3030 \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"query\",
      \"params\": {
        \"request_type\": \"call_function\",
        \"finality\": \"final\",
        \"account_id\": \"v1.signer.localnet\",
        \"method_name\": \"state\",
        \"args_base64\": \"e30=\"
      },
      \"id\": 1
    }" | jq -r ".result.result" | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
participants = data.get('participants', {})
print(participants.get('$i', {}).get('sign_pk', 'NOT_FOUND'))
")
  
  echo "Contract sign_pk: $CONTRACT_SIGN_PK"
  
  # Get derived public key from Secrets Manager
  SM_PRIVATE_KEY=$(aws secretsmanager get-secret-value \
    --secret-id "mpc-node-${i}-mpc_account_sk" \
    --profile shai-sandbox-profile \
    --query "SecretString" \
    --output text)
  
  SM_PUBLIC_KEY=$(node -e "
  const nearAPI = require('near-api-js');
  const keyPair = nearAPI.KeyPair.fromString('$SM_PRIVATE_KEY');
  console.log(keyPair.getPublicKey().toString());
  ")
  
  echo "Secrets Manager public key: $SM_PUBLIC_KEY"
  
  if [ "$CONTRACT_SIGN_PK" == "$SM_PUBLIC_KEY" ]; then
    echo "✅ MATCH"
  else
    echo "❌ MISMATCH - Domain voting will FAIL!"
  fi
  
  echo ""
done
```

#### Success Criteria

- ✅ Contract state shows `protocol_state: "Initializing"` (NOT "NotInitialized")
- ✅ Contract has 3 participants configured
- ✅ Threshold is 2 (for 2-of-3 signing)
- ✅ Each participant has:
  - Correct `account_id` (mpc-node-{0,1,2}.localnet)
  - `sign_pk` matching Secrets Manager derived public key
  - Valid `url` (http://10.0.x.x:8080 format)
- ✅ **CRITICAL:** All participant `sign_pk` values match Secrets Manager public keys

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| Contract stuck in "NotInitialized" | GOTCHA #28 | init() never called or failed | Check orchestrator logs, rerun init |
| Participant count ≠ 3 | - | MPC setup didn't create all accounts | Verify Chunk 3.3 completed |
| Participant sign_pk mismatch | GOTCHA #11.5, #37 | Wrong keys in contract | CRITICAL: Must fix before domain voting |
| Participant URL unreachable | - | Invalid private IPs | Get correct MPC node private IPs from CFN |
| Init transaction fails | - | Contract logic error | Check nearcore logs on NEAR Base |

#### Key Gotchas Referenced

- **GOTCHA #11.5:** Keys MUST match between Secrets Manager and contract
- **GOTCHA #28:** Contract state machine: NotInitialized → Initializing → Running
- **GOTCHA #37:** MPC accounts must be created by mpc-setup.ts (ensures correct keys)
- **GOTCHA #38:** Domain voting requires correct key setup

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have confirmed contract state is "Initializing" (not "NotInitialized")
- [ ] I have verified 3 participants configured with threshold 2
- [ ] I have confirmed all participant sign_pk values match Secrets Manager
- [ ] I understand that sign_pk mismatch will break domain voting in next chunk
- [ ] **Issues/Concerns:**

---

### 🗳️ Chunk 3.6: Domain Voting & DKG Trigger

**Goal:** Vote to add the ECDSA domain (Secp256k1) using MPC node keys, triggering distributed key generation.

#### What This Does

The `MpcSetup.voteDomains()` method:
1. For each MPC node account, calls `vote_add_domains()` on the contract
2. Passes domain configuration: `{ domain_id: 0, family: "Secp256k1" }`
3. Uses the private key from Secrets Manager to sign each vote transaction
4. Waits for threshold votes (2 of 3) to be reached
5. Once threshold reached, contract automatically triggers distributed key generation

This is the most failure-prone step because:
- Keys must match exactly (Secrets Manager ↔ on-chain ↔ contract participant)
- MPC nodes must be synced and able to see the vote transactions
- If ANY key mismatches, that vote will fail

#### Actual Code Reference

From `mpc-setup.ts` line 107:
```typescript
await this.voteDomains(participants);
```

This method:
1. Creates NEAR accounts for each participant using keys from Secrets Manager
2. Calls `vote_add_domains` for each participant
3. Waits for votes to be recorded on-chain

#### Domain Voting (Part of Orchestrator)

This happens automatically after contract initialization:

```bash
# Already running from previous chunks
# Watch for output:
# 🗳️  [MPC-SETUP] Voting to add domains...
# 📝 [MPC-SETUP] MPC node 0 voting...
# ✅ [MPC-SETUP] Vote recorded
# 📝 [MPC-SETUP] MPC node 1 voting...
# ✅ [MPC-SETUP] Vote recorded
# 📝 [MPC-SETUP] MPC node 2 voting...
# ✅ [MPC-SETUP] Vote recorded
# ✅ [MPC-SETUP] Domain voting complete. Threshold reached.
```

#### Verification: Check Domain Voting Progress

```bash
# 1. Check contract state for domain voting
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "state",
      "args_base64": "e30="
    },
    "id": 1
  }' | jq -r '.result.result' | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
print(f'Protocol State: {data.get(\"protocol_state\", \"unknown\")}')
print(f'Generating Key: {data.get(\"generating_key\", \"none\")}')
pending_requests = data.get('pending_requests', {})
print(f'Pending Requests: {len(pending_requests)}')
"

# Expected after voting:
# Protocol State: Initializing
# Generating Key: {'instance': 0, 'participants': [...]}
# Pending Requests: 0 (or some number)

# 2. Check for DKG activity in contract
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "state",
      "args_base64": "e30="
    },
    "id": 1
  }' | jq -r '.result.result' | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
generating = data.get('generating_key', {})
if generating:
    print('✅ DKG TRIGGERED')
    print(f'   Instance: {generating.get(\"instance\", \"unknown\")}')
    print(f'   Participants: {len(generating.get(\"participants\", []))}')
else:
    print('❌ DKG NOT TRIGGERED - Domain voting may have failed')
"
```

#### Monitor MPC Node Logs for DKG Activity

```bash
# Check MPC Node 0 logs for DKG activity
export MPC_NODE_0=$(aws cloudformation describe-stacks \
  --stack-name MpcStandaloneStack \
  --query "Stacks[0].Outputs[?OutputKey=='Node0InstanceId'].OutputValue" \
  --output text --profile shai-sandbox-profile)

aws ssm start-session \
  --target "$MPC_NODE_0" \
  --profile shai-sandbox-profile

# Inside SSM session:
sudo docker logs mpc-node --tail 100 | grep -i "keygen\|domain\|vote\|dkg\|generating"

# Expected log patterns:
# - "Observed domain vote"
# - "Starting key generation"
# - "DKG round 1"
# - "Key generation in progress"

# Exit SSM
exit
```

#### Success Criteria

- ✅ All 3 MPC nodes successfully voted (check orchestrator output)
- ✅ No "access key not found" or "permission denied" errors
- ✅ Contract state shows `generating_key.instance: 0`
- ✅ Contract state shows `generating_key.participants` has 3 entries
- ✅ MPC node logs show "Starting key generation" or similar
- ✅ No "No such domain" errors

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| Vote transaction fails: "access key not found" | GOTCHA #11.5 | Secrets Manager key ≠ on-chain key | CRITICAL: Fix key mismatch, redeploy accounts |
| "No such domain" error | GOTCHA #13 | Domain never added | Check vote transactions succeeded |
| Vote succeeds but DKG not triggered | GOTCHA #28 | Threshold not reached | Verify at least 2 of 3 votes succeeded |
| MPC nodes not seeing vote transactions | GOTCHA #15.5 | MPC nodes not synced (0 peers) | Fix genesis/boot_nodes, restart MPC nodes |
| Contract state stuck at "Initializing" without generating_key | - | Votes didn't reach threshold | Check transaction logs for failures |
| Participant can't sign vote | GOTCHA #37 | Account created incorrectly | Recreate accounts using mpc-setup.ts |

#### Key Gotchas Referenced

- **GOTCHA #11.5:** Keys MUST match between Secrets Manager and on-chain
- **GOTCHA #12:** USE_MPC_SETUP must be TRUE (we're using MpcSetup class)
- **GOTCHA #13:** "No such domain" means domain never added
- **GOTCHA #15.5:** MPC nodes must be synced to see vote transactions
- **GOTCHA #37:** MPC accounts must be created by mpc-setup.ts
- **GOTCHA #38:** Domain voting requires correct key setup

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have confirmed all 3 vote transactions succeeded
- [ ] I have verified contract state shows generating_key.instance: 0
- [ ] I have checked MPC node logs show DKG activity
- [ ] I have confirmed no "access key not found" errors
- [ ] **Issues/Concerns:**

---

### ⏳ Chunk 3.8: Distributed Key Generation (DKG) - ONE-TIME SETUP

**Goal:** Wait for DKG to complete (~10 minutes), resulting in a shared Secp256k1 public key.

**⚠️ CRITICAL TIMING NOTE:** This 10-minute wait is a **ONE-TIME** initial setup cost. After DKG completes, all future signatures take only ~2-3 seconds (1 round of communication = ~1.2s NEAR block time).

#### What Happens During DKG

After domain voting triggers DKG, the MPC nodes perform **ONE-TIME** initialization:

**The 10-Minute ONE-TIME Process:**

1. **Distributed Key Generation** (~2-3 minutes)
   - MPC nodes coordinate via NEAR blockchain
   - Use Cait-Sith protocol for threshold key generation
   - Each node generates a key share (private, never shared)
   - Nodes combine shares to produce shared public key
   - Public key is stored in the contract

2. **Background Material Generation** (~7-8 minutes, happens in parallel)
   - Generate ~1 million Beaver triples per node
   - Generate initial buffer of presignatures (~8,192)
   - These enable FAST signing (1 round) for all future signatures

3. **Contract State Transition**
   - Contract transitions to `protocol_state: "Running"`
   - Ready for signing with ~2-3 second response times

**After this ONE-TIME setup completes:**
- ✅ Address derivation: **Instant** (deterministic computation from shared public key)
- ✅ Transaction signing: **~2-3 seconds** (uses pre-generated presignature + 1 round of communication)
- ✅ Cross-chain messages: **Seconds** (matches mainnet NEAR + IOTEX behavior)
- ✅ No more 10-minute waits!

**How Fast Signing Works After DKG:**
```
Sign Request → Pick Presignature (instant) → 1 Round MPC (~1.2s) → Signature Ready
```

From MPC README:
> "When a request comes in, a signature can be generated using a presignature and one round of communication."

The presignatures are continuously generated in the background, so there's always a buffer ready. The "one round of communication" happens via NEAR blockchain (~1.2s block time), giving you the ~2-3 second total time you see on mainnet.

This requires:
- MPC nodes synced to NEAR Base
- MPC nodes able to communicate via blockchain
- No crashes or restarts during DKG

#### Actual Code Reference

From `mpc-setup.ts` line 110:
```typescript
await this.waitForKeyGeneration();
```

This method polls contract state every 30 seconds until:
- `protocol_state === "Running"` OR
- Timeout reached (default: 15 minutes)

#### Monitor DKG Progress

```bash
# Continuous monitoring of contract state
watch -n 10 'curl -s http://'"${NEAR_PRIVATE_IP}"':3030 \
  -H "Content-Type: application/json" \
  -d '"'"'{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "state",
      "args_base64": "e30="
    },
    "id": 1
  }'"'"' | jq -r ".result.result" | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
print(f\"Protocol State: {data.get('\'protocol_state\'', '\'unknown\'')}\")
generating = data.get('\''generating_key'\'', {})
if generating:
    print(f\"DKG Instance: {generating.get('\'instance\'', '\'none\'')}\")
    print(f\"DKG Participants: {len(generating.get('\'participants\'', []))}\")
else:
    print(\"DKG Instance: complete or not started\")
"'

# Watch for:
# Protocol State: Initializing → (stays here during DKG) → Running
# DKG Instance: 0 (present during DKG) → complete (absent when done)
```

#### Monitor MPC Node Logs

```bash
# Check MPC Node 0 for DKG progress
export MPC_NODE_0=$(aws cloudformation describe-stacks \
  --stack-name MpcStandaloneStack \
  --query "Stacks[0].Outputs[?OutputKey=='Node0InstanceId'].OutputValue" \
  --output text --profile shai-sandbox-profile)

aws ssm start-session \
  --target "$MPC_NODE_0" \
  --profile shai-sandbox-profile

# Inside SSM:
# Follow logs in real-time
sudo docker logs mpc-node --tail 50 -f

# Look for patterns:
# - "DKG round 1 complete"
# - "DKG round 2 complete"
# - "Key generation complete"
# - "Public key: secp256k1:..."

# Exit with Ctrl+C, then:
exit
```

#### Check for DKG Completion

```bash
# Once DKG completes, contract should have public_key method working
curl -s http://${NEAR_PRIVATE_IP}:3030 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "v1.signer.localnet",
      "method_name": "public_key",
      "args_base64": "e30="
    },
    "id": 1
  }' | jq -r '.result.result' | python3 -c "
import sys, json
data = json.loads(bytes(json.load(sys.stdin)))
print(f'Public Key: {data}')
"

# Expected: Secp256k1 public key (65 bytes, uncompressed format)
# Example: 04a1b2c3d4...
```

#### Verify MPC Node Health

```bash
# Check MPC node health endpoint
# Get MPC node 0 private IP
export MPC_NODE_0_IP=$(aws ec2 describe-instances \
  --instance-ids "$MPC_NODE_0" \
  --profile shai-sandbox-profile \
  --query "Reservations[0].Instances[0].PrivateIpAddress" \
  --output text)

# SSM into NEAR Base to curl MPC node (from within VPC)
export NEAR_INSTANCE=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='near-instance-id'].OutputValue" \
  --output text --profile shai-sandbox-profile)

aws ssm start-session \
  --target "$NEAR_INSTANCE" \
  --profile shai-sandbox-profile

# Inside SSM (on NEAR Base):
curl http://${MPC_NODE_0_IP}:8080/public_data | jq

# Expected response:
# {
#   "public_key": "secp256k1:...",
#   "epoch": <number>
# }

exit
```

#### Success Criteria

- ✅ Contract state transitions to `protocol_state: "Running"`
- ✅ `generating_key` field disappears from contract state (or becomes null)
- ✅ `public_key()` method returns a valid Secp256k1 public key
- ✅ MPC node logs show "Key generation complete"
- ✅ MPC node health endpoint `/public_data` returns public key
- ✅ DKG completed within ~10-15 minutes

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| DKG never starts | GOTCHA #28 | generating_key never appears | Check domain voting succeeded (Chunk 3.6) |
| DKG stuck/timeout | GOTCHA #15.5, #15.6 | MPC nodes can't coordinate | Check MPC nodes synced, same genesis, 0+ peers |
| MPC node crashes during DKG | - | Check docker logs | Investigate crash, may need to restart Layer 3 |
| Contract stuck at "Initializing" | GOTCHA #28 | DKG not completing | Check MPC node logs for errors |
| "No such domain" during DKG | GOTCHA #13 | Domain was never added | Check domain voting (Chunk 3.6) |
| Public key never appears | - | DKG failed silently | Check MPC node logs for Cait-Sith errors |

#### Key Gotchas Referenced

- **GOTCHA #13:** "No such domain" means domain never added
- **GOTCHA #14:** MPC health checks may fail from outside VPC (expected)
- **GOTCHA #15.5:** MPC nodes must have peers to coordinate
- **GOTCHA #15.6:** Genesis mismatch prevents coordination
- **GOTCHA #28:** Contract state machine takes ~10 min for DKG

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have confirmed contract state is "Running"
- [ ] I have verified public_key() returns a valid Secp256k1 key
- [ ] I have checked MPC node logs show "Key generation complete"
- [ ] I have documented the public key: _____________
- [ ] **Issues/Concerns:**

---

### ✅ Chunk 3.9: Chain Signatures Verification - FAST Signing

**Goal:** Test address derivation and transaction signing to confirm Chain Signatures are working end-to-end.

**⚠️ SPEED EXPECTATION:** Now that DKG is complete (one-time 10-min setup from Chunk 3.8), signing is **FAST:**
- **Address derivation:** Instant (deterministic computation)
- **Transaction signing:** ~2-3 seconds (uses presignatures + 1 round of communication)
- **Cross-chain flow:** Seconds, not minutes (matches mainnet NEAR + IOTEX behavior)

#### What This Tests

Now that DKG is complete (Chunk 3.8), we can test:
1. **Address Derivation:** Derive Bitcoin/Ethereum addresses from NEAR accounts - **INSTANT**
2. **Transaction Signing:** Sign transactions using threshold signatures - **~2-3 SECONDS**
3. **MPC Coordination:** Verify 2-of-3 nodes coordinate to produce signatures - **1 ROUND**

This validates the full Chain Signatures stack without broadcasting to actual blockchains (broadcasting is Layer 5 responsibility).

**Why It's Fast Now:**
- Shared key already generated (DKG complete)
- Presignatures pre-generated in background
- Only 1 round of communication needed (~1.2s NEAR block time)
- No cryptographic setup required

#### Actual Code Reference

The client API is in `cross-chain-simulator/src/chain-signatures/`:
- `simulator.ts` - ChainSignaturesSimulator class
- `near-client.ts` - Calls v1.signer contract
- `mpc-service.ts` - Communicates with MPC nodes

#### Test 1: Address Derivation (Bitcoin)

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator

# Ensure code is built
npm run build

# Test address derivation
node -e "
const { createChainSignaturesClient } = require('./dist');

(async () => {
  const client = createChainSignaturesClient({
    rpcUrl: '${NEAR_RPC_URL}',
    networkId: 'localnet',
    mpcContractId: 'v1.signer.localnet',
  });
  
  console.log('Testing address derivation for Bitcoin...');
  const btcAddr = await client.deriveAddress('alice.localnet', 'bitcoin');
  console.log('✅ Bitcoin Address:', btcAddr.address);
  console.log('   Public Key:', btcAddr.publicKey);
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
"
```

Expected output:
```
Testing address derivation for Bitcoin...
✅ Bitcoin Address: bc1q...
   Public Key: 04a1b2c3...
```

#### Test 2: Address Derivation (Ethereum)

```bash
node -e "
const { createChainSignaturesClient } = require('./dist');

(async () => {
  const client = createChainSignaturesClient({
    rpcUrl: '${NEAR_RPC_URL}',
    networkId: 'localnet',
    mpcContractId: 'v1.signer.localnet',
  });
  
  console.log('Testing address derivation for Ethereum...');
  const ethAddr = await client.deriveAddress('alice.localnet', 'ethereum');
  console.log('✅ Ethereum Address:', ethAddr.address);
  console.log('   Public Key:', ethAddr.publicKey);
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
"
```

Expected output:
```
Testing address derivation for Ethereum...
✅ Ethereum Address: 0x...
   Public Key: 04a1b2c3...
```

#### Test 3: Transaction Signing

```bash
# Use existing test script if available
if [ -f test-signing.js ]; then
  node test-signing.js
else
  # Manual signing test
  node -e "
  const { createChainSignaturesClient } = require('./dist');
  
  (async () => {
    const client = createChainSignaturesClient({
      rpcUrl: '${NEAR_RPC_URL}',
      networkId: 'localnet',
      mpcContractId: 'v1.signer.localnet',
    });
    
    console.log('Testing transaction signing...');
    
    // Request signature for a test payload
    const signature = await client.requestSignature({
      nearAccount: 'alice.localnet',
      chain: 'ethereum',
      payload: '0x1234567890abcdef', // Test payload
    });
    
    console.log('✅ Signature:', signature);
  })().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
  "
fi
```

Expected output:
```
Testing transaction signing...
✅ Signature: {
  r: "0x...",
  s: "0x...",
  v: 27
}
```

#### Test 4: Integration Test (If Available)

```bash
# Run full integration test
if [ -f scripts/test-integration.sh ]; then
  ./scripts/test-integration.sh
elif [ -f test-full-integration.js ]; then
  node test-full-integration.js
else
  echo "⚠️  No integration test found. Manual tests above are sufficient."
fi
```

#### Verify MPC Coordination

```bash
# Check MPC node logs to confirm they participated in signing
for NODE_NUM in 0 1 2; do
  echo "=== MPC Node $NODE_NUM logs ==="
  
  NODE_ID=$(aws cloudformation describe-stacks \
    --stack-name MpcStandaloneStack \
    --query "Stacks[0].Outputs[?OutputKey=='Node${NODE_NUM}InstanceId'].OutputValue" \
    --output text --profile shai-sandbox-profile)
  
  aws ssm send-command \
    --instance-ids "$NODE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=[
      "sudo docker logs mpc-node --tail 50 | grep -i \"sign\|signature\|request\""
    ]' \
    --profile shai-sandbox-profile \
    --query "Command.CommandId" \
    --output text > /tmp/cmd_${NODE_NUM}.txt
  
  sleep 5
  
  CMD_ID=$(cat /tmp/cmd_${NODE_NUM}.txt)
  aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$NODE_ID" \
    --profile shai-sandbox-profile \
    --query "StandardOutputContent" \
    --output text
  
  echo ""
done

# Look for patterns:
# - "Processing signature request"
# - "Participating in signing round"
# - "Signature produced"
```

#### Success Criteria

- ✅ Bitcoin address derivation succeeds and returns valid address
- ✅ Ethereum address derivation succeeds and returns valid address
- ✅ Addresses are deterministic (same input = same output)
- ✅ Transaction signing succeeds and returns signature (r, s, v)
- ✅ No "No such domain" errors
- ✅ MPC node logs show participation in signing
- ✅ Threshold signing works (only 2 of 3 nodes needed)

#### Potential Blockers

| Blocker | Related Gotcha | Diagnosis | Resolution |
|---------|---------------|-----------|------------|
| "No such domain" error | GOTCHA #13 | Domain never added | Check Chunk 3.6 domain voting |
| Address derivation fails | - | Contract not in "Running" state | Wait for DKG (Chunk 3.7) |
| Signing timeout | GOTCHA #14 | MPC nodes not responding | Check MPC node health, VPC access |
| Invalid signatures | - | MPC coordination failing | Check MPC node logs for errors |
| RPC connection errors | - | Can't reach NEAR_RPC_URL | Check VPC, security groups, SSM port forward |
| "Contract method not found" | - | Wrong contract deployed | Verify v1.signer.wasm is correct version |

#### Key Gotchas Referenced

- **GOTCHA #13:** "No such domain" means domain never added
- **GOTCHA #14:** MPC health checks may fail from outside VPC
- **GOTCHA #26:** Threshold is 2-of-3 (only 2 nodes needed)

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK BEFORE PROCEEDING:**
- [ ] I have confirmed Bitcoin address derivation works
- [ ] I have confirmed Ethereum address derivation works
- [ ] I have confirmed transaction signing produces valid signatures
- [ ] I have verified MPC nodes participated in signing
- [ ] **Issues/Concerns:**

---

### 🎯 Chunk 3.9: Cross-Chain Demo (Optional)

**Goal:** Demonstrate full cross-chain flow by signing and broadcasting a transaction to Ethereum localnet.

#### What This Demonstrates

This optional chunk shows the complete flow:
1. Derive Ethereum address from NEAR account (via MPC)
2. Sign Ethereum transaction using Chain Signatures
3. Broadcast signed transaction to Ethereum localnet
4. Verify transaction on Ethereum

**Note:** Broadcasting to destination chains is **Layer 5 responsibility** (see NEAR docs "Relaying the Signature"). This demo is for validation only.

#### Prerequisites

- Ethereum localnet running (either via `ethereum-localnet` CDK or local ganache/hardhat)
- Funded test account on Ethereum

#### Setup Ethereum Localnet (If Not Running)

```bash
# Option A: Deploy via CDK (if using aws-blockchain-node-runners)
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/AWSNodeRunner/lib/ethereum
npm run cdk:deploy

# Option B: Local Ethereum (Hardhat)
cd /tmp
mkdir eth-localnet && cd eth-localnet
npx hardhat init
npx hardhat node &
export ETH_RPC_URL=http://localhost:8545

# Option C: Skip this chunk and proceed to deployment tracking
echo "Skipping Chunk 3.9 - Chain Signatures verified in Chunk 3.8"
```

#### Cross-Chain Demo Script

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/cross-chain-simulator

# Check if demo script exists
if [ -f test-full-cross-chain.js ]; then
  # Run existing demo
  export NEAR_RPC_URL=${NEAR_PRIVATE_IP}:3030
  export ETH_RPC_URL=http://localhost:8545  # Or Ethereum localnet IP
  
  node test-full-cross-chain.js
else
  # Manual demo
  node -e "
  const { createChainSignaturesClient } = require('./dist');
  const { ethers } = require('ethers');
  
  (async () => {
    console.log('🎯 Cross-Chain Demo: NEAR → Ethereum');
    console.log('');
    
    // 1. Derive Ethereum address
    console.log('Step 1: Derive Ethereum address from NEAR account...');
    const client = createChainSignaturesClient({
      rpcUrl: '${NEAR_RPC_URL}',
      networkId: 'localnet',
      mpcContractId: 'v1.signer.localnet',
    });
    
    const ethAddr = await client.deriveAddress('alice.localnet', 'ethereum');
    console.log('✅ Derived address:', ethAddr.address);
    console.log('');
    
    // 2. Create Ethereum transaction
    console.log('Step 2: Create Ethereum transaction...');
    const tx = {
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      value: ethers.parseEther('0.1'),
      gasLimit: 21000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0, // Would need to fetch actual nonce
    };
    
    const txHash = ethers.keccak256(ethers.hexlify(ethers.serializeTransaction(tx)));
    console.log('✅ Transaction hash to sign:', txHash);
    console.log('');
    
    // 3. Sign via Chain Signatures
    console.log('Step 3: Request signature from MPC...');
    const signature = await client.requestSignature({
      nearAccount: 'alice.localnet',
      chain: 'ethereum',
      payload: txHash,
    });
    console.log('✅ Signature:', signature);
    console.log('');
    
    // 4. Broadcast (Layer 5 responsibility, demo only)
    console.log('Step 4: Broadcasting to Ethereum...');
    console.log('⚠️  Broadcasting is Layer 5 responsibility');
    console.log('    Signature is ready for broadcast');
    console.log('');
    
    console.log('✅ Cross-chain demo complete!');
  })().catch(err => {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
  "
fi
```

#### Success Criteria (Optional)

- ✅ Ethereum address derived from NEAR account
- ✅ Ethereum transaction created and hashed
- ✅ Signature produced via Chain Signatures
- ✅ Signature is valid for Ethereum transaction
- ✅ (Optional) Transaction broadcast and confirmed on Ethereum

#### This Chunk is OPTIONAL

If you want to proceed to production deployment, Chunk 3.8 is sufficient validation. Broadcasting to destination chains is handled by Layer 5 applications.

#### Feedback & Actions

**⚠️ PROVIDE FEEDBACK:**
- [ ] I want to run this demo: YES / NO / SKIP
- [ ] If YES, I have Ethereum localnet available: YES / NO
- [ ] If SKIP, I'm satisfied with Chunk 3.8 verification
- [ ] **Issues/Concerns:**

---

## Deployment Tracking Worksheet

Use this table to track progress through all chunks:

| Chunk | Status | Duration | Timestamp | Errors/Concerns | Resolution |
|-------|--------|----------|-----------|----------------|------------|
| 3.0: Prerequisites | ⬜ | - | | | |
| 3.1: Collect Genesis Data | ⬜ | - | | | |
| 3.2: Deploy MPC Infrastructure | ⬜ | - | | | |
| 3.3: Verify MPC Sync | ⬜ | - | | | |
| 3.4: MPC Accounts | ⬜ | - | | | |
| 3.5: Contract Deploy | ⬜ | - | | | |
| 3.6: Contract Init | ⬜ | - | | | |
| 3.7: Domain Voting | ⬜ | - | | | |
| 3.8: DKG | ⬜ | - | | | |
| 3.9: Verification | ⬜ | - | | | |
| 3.10: Demo (Optional) | ⬜ | - | | | |

**Status Legend:**
- ⬜ Not Started
- 🔄 In Progress
- ✅ Complete
- ❌ Failed (see Errors/Concerns)
- ⏸️ Blocked (see Errors/Concerns)

---

## Environment Variables Reference

```bash
# AWS Configuration
export AWS_PROFILE=shai-sandbox-profile
export AWS_REGION=us-east-1

# NEAR Configuration
export NEAR_RPC_URL=http://<NEAR_PRIVATE_IP>:3030
export NEAR_CHAIN_ID=localnet  # Or actual chain_id from Chunk 3.0

# Master Account (from SSM)
export MASTER_ACCOUNT_PRIVATE_KEY="ed25519:..."  # From /near-localnet/localnet-account-key

# Layer 3 Configuration
export MPC_CONTRACT_ID=v1.signer.localnet

# Infrastructure IDs (discovered, not hardcoded)
export NEAR_INSTANCE=i-...  # From CloudFormation
export NEAR_PRIVATE_IP=10.0.x.x  # From CloudFormation
export MPC_NODE_0=i-...  # From CloudFormation
export MPC_NODE_1=i-...  # From CloudFormation
export MPC_NODE_2=i-...  # From CloudFormation
```

---

## Quick Command Reference

```bash
# Get CloudFormation output
get_cf_output() {
  aws cloudformation describe-stacks \
    --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
    --output text --profile shai-sandbox-profile
}

# SSM into instance
ssm_connect() {
  aws ssm start-session --target "$1" --profile shai-sandbox-profile
}

# Check contract state
check_contract_state() {
  curl -s http://${NEAR_PRIVATE_IP}:3030 \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "method": "query",
      "params": {
        "request_type": "call_function",
        "finality": "final",
        "account_id": "v1.signer.localnet",
        "method_name": "state",
        "args_base64": "e30="
      },
      "id": 1
    }' | jq
}

# Check NEAR RPC health
check_near_health() {
  curl -s http://${NEAR_PRIVATE_IP}:3030/status | jq '{
    latest_block_height: .sync_info.latest_block_height,
    chain_id: .chain_id,
    node_key: .node_key,
    syncing: .sync_info.syncing
  }'
}

# Check MPC node sync
check_mpc_sync() {
  local instance_id=$1
  aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=[
      "curl -s http://127.0.0.1:3030/status | jq \"{peers: .num_peers, block: .sync_info.latest_block_height, syncing: .sync_info.syncing}\""
    ]' \
    --profile shai-sandbox-profile \
    --query "Command.CommandId" \
    --output text
}
```

---

## Key Gotchas Summary

Critical gotchas to keep in mind throughout Layer 3 deployment:

| Gotcha | Impact | Prevention |
|--------|--------|------------|
| #10 | MPC nodes MUST sync to NEAR Base | Use same genesis + boot_nodes |
| #11 | Placeholder secrets cause 10-min wait | Replace with real keys before deployment |
| #11.5 | Key mismatch breaks voting | Verify Secrets Manager ↔ on-chain match |
| #12 | USE_MPC_SETUP must be TRUE | Always use MpcSetup class |
| #13 | "No such domain" error | Ensure domain voting succeeded |
| #15.5 | Boot nodes mismatch = 0 peers | Match NEAR node_key exactly |
| #15.6 | Genesis hash mismatch | Use byte-identical genesis files |
| #15.7 | Chain ID may not be "localnet" | Document actual chain_id |
| #15.8 | Never hardcode AWS values | Discover dynamically from CFN |
| #15.9 | near-cli-rs has localnet bugs | Use near-api-js |
| #28 | DKG takes ~10 minutes (ONE-TIME setup) | Be patient during initial deployment; signing is fast afterwards (~2-3 sec) |
| #36 | MPC must be in NEAR VPC | Deploy MPC in same VPC |
| #37 | Use mpc-setup.ts for accounts | Don't create accounts manually |
| #38 | Domain voting needs correct keys | Verify key matching first |
| #39 | Contract needs ~60 NEAR | Fund v1.signer.localnet account |

---

## Next Steps

**Before any deployment:**
1. Read through ALL chunks (3.0 - 3.9)
2. Provide feedback on each chunk in the "Feedback & Actions" sections
3. Document any concerns or questions
4. Wait for resolution of all concerns
5. Then proceed chunk-by-chunk with tracking

**Ready to proceed?**
- [ ] I have read all chunks
- [ ] I have provided feedback on each chunk
- [ ] All concerns have been addressed
- [ ] I am ready to start with Chunk 3.0

---

**Document Status:** DRAFT - Awaiting feedback before deployment

**Last Updated:** January 9, 2026 (v1.1 - corrected chunk order + timing clarifications)
