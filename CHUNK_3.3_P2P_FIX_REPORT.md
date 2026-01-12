# Chunk 3.3 Investigation & P2P Fix Report

**Date:** January 12, 2026  
**Status:** CDK Fix Complete, Awaiting Deployment  

---

## 🔍 Investigation Summary

### Initial Finding
During Chunk 3.3 verification, MPC nodes showed:
- ✅ Docker containers running (Up 2 days)
- ✅ NEAR indexer synced (block 281717)
- ✅ Chain ID correct (test-chain-klXRp)
- ✅ Secrets Manager has real keys
- ❌ **Peers: null** (expected >= 1)
- ❌ **Connection refused** to NEAR Base port 24567

### Root Cause Analysis

**Problem:** NEAR Base node0 binds P2P to `127.0.0.1:24567` (localhost only)

**Evidence:**
1. MPC logs: `Connection refused (os error 111)` to `10.0.1.12:24567`
2. MPC config correctly points to private IP
3. Security groups properly configured
4. MPC code explicitly requires P2P peers (start.sh line 19-20)

**Why This Matters:**
- MPC nodes run **full NEAR indexer nodes** (not RPC-only)
- MPC README states: "NEAR Indexer: this is a NEAR node that tracks the shard"
- P2P connectivity required for proper blockchain sync and MPC coordination

---

## ✅ Solutions Implemented

### 1. Documentation: GOTCHA #6.5 Added

**File:** `near-localnet-orchestrator/docs/lessons-learned/NEAR_LOCALNET_LESSONS_LEARNED.md`

Added comprehensive gotcha covering:
- Symptoms (peers: null, connection refused)
- Root cause (localhost binding)
- Impact analysis
- Fix implementation
- Related gotchas (#15.5, #15.6, #10)

### 2. CDK Code Fix

**File:** `AWSNodeRunner/lib/near/lib/infrastructure-stack.ts` (lines 272-279)

**Changes:**
```typescript
// OLD (Broken):
BOOT_NODE="${BOOT_PUB}@127.0.0.1:24567"
su - ubuntu -c "nohup ~/nearcore/target/release/neard --home ~/.near/localnet/node0 run > ~/neard-node0.log 2>&1 &"

// NEW (Fixed):
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
BOOT_NODE="${BOOT_PUB}@${PRIVATE_IP}:24567"
su - ubuntu -c "nohup ~/nearcore/target/release/neard --home ~/.near/localnet/node0 run --network-addr 0.0.0.0:24567 > ~/neard-node0.log 2>&1 &"
```

**Key improvements:**
- Uses private IP in boot node string (accessible from VPC)
- Adds `--network-addr 0.0.0.0:24567` to bind to all interfaces
- Includes explanatory comments with GOTCHA reference

---

## 🎯 Deployment Options

### Option A: Manual Quick Test (Blocked)
SSM send-command failing on NEAR Base. Interactive session available but requires manual intervention.

**Instructions:** `/tmp/near-p2p-fix-instructions.txt`

### Option B: Redeploy with CDK Fix (Recommended)
Deploy the updated infrastructure-stack.ts:

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/AWSNodeRunner/lib/near
npm run build
cdk deploy --all --profile shai-sandbox-profile --require-approval never
```

**Timeline:**
- Layer 1 deployment: ~22 minutes
- Layer 3 (from Chunk 3.0): ~45 minutes
- **Total:** ~67 minutes

---

## 📊 Verification Checklist

After deploying the fix, verify:

### On NEAR Base:
```bash
# SSM into instance
aws ssm start-session --target <instance-id> --profile shai-sandbox-profile

# Check P2P binding
sudo ss -tlnp | grep 24567
# Expected: 0.0.0.0:24567 (not 127.0.0.1:24567)

# Check boot node string in logs
grep "Boot node configured" /var/log/near-setup.log
# Expected: ed25519:...@10.0.x.x:24567 (not 127.0.0.1)
```

### On MPC Nodes:
```bash
# Check peer status
curl -s http://127.0.0.1:3030/status | jq '{peers: .sync_info.num_peers}'
# Expected: {"peers": 1} or higher (not null)

# Check logs for connection errors
docker logs mpc-node 2>&1 | grep -i "connection refused" | tail -5
# Expected: No recent connection refused errors
```

---

## 🏁 Next Steps

Once P2P is verified working:

1. **Update deployment-state.json**
   - Mark chunk_3_3_verify_sync: "completed"
   - Document P2P fix applied

2. **Proceed to Chunk 3.4**
   - MPC Node Account Creation
   - Uses Secrets Manager keys
   - Creates on-chain accounts

3. **Continue through Chunks 3.5-3.9**
   - Contract deployment
   - Initialization
   - Domain voting
   - DKG
   - Verification

---

## 📚 References

- **GOTCHA #6.5:** NEAR Base P2P binding issue
- **GOTCHA #15.5:** Boot nodes public key matching
- **GOTCHA #15.6:** Genesis hash matching
- **GOTCHA #10:** MPC sync requirements

---

**Report Generated:** January 12, 2026  
**Next Action:** Choose deployment path and proceed

