# Code Changes Staging Document

> **Purpose:** This document captures code changes identified during the lessons learned review that should be addressed in a future work session.

---

## 1. Update MPC Docker Image Version to 3.2.0

**Issue:** Multiple files reference `nearone/mpc-node:3.1.0` but the latest stable release is `3.2.0` (released December 18, 2025).

### Files to Update:

#### near-localnet-orchestrator/config/simulators.config.yaml
**Line 127:**
```yaml
# FROM:
mpc_docker_image: "nearone/mpc-node:3.1.0"

# TO:
mpc_docker_image: "nearone/mpc-node:3.2.0"
```

#### near-localnet-orchestrator/src/layers/ChainSignaturesLayer.ts
**Line 436:**
```typescript
// FROM:
MPC_DOCKER_IMAGE: mpcConfig.mpc_docker_image || 'nearone/mpc-node:3.1.0',

// TO:
MPC_DOCKER_IMAGE: mpcConfig.mpc_docker_image || 'nearone/mpc-node:3.2.0',
```

#### near-localnet-orchestrator/README.md
**Line 122 (if exists):**
```yaml
# FROM:
mpc_docker_image: "nearone/mpc-node:3.1.0"

# TO:
mpc_docker_image: "nearone/mpc-node:3.2.0"
```

#### cross-chain-simulator/mpc-repo/infra/aws-cdk/lib/mpc-network.ts
**Line 86:**
```typescript
// FROM:
: "docker.io/nearone/mpc-node:3.1.0";

// TO:
: "docker.io/nearone/mpc-node:3.2.0";
```

#### cross-chain-simulator/mpc-repo/infra/aws-cdk/README.md
**Line 43:**
```markdown
- FROM: `mpc.dockerImage` (default: `nearone/mpc-node:3.1.0`)
- TO: `mpc.dockerImage` (default: `nearone/mpc-node:3.2.0`)
```

---

## 2. Improve MPC Observability (Future Enhancement)

**Issue:** Current monitoring for MPC key generation is limited. When stuck, it's hard to diagnose.

### Proposed Improvements:

1. **Add CloudWatch metrics for MPC node sync status**
   - Block height comparison between MPC and NEAR Base
   - Peer count
   - Contract state transitions

2. **Better logging during key generation**
   - Poll contract state during setup
   - Log clear status messages
   - Timeout detection with helpful error messages

3. **Health check enhancements**
   - Return detailed status from `/health` endpoint
   - Include sync status, peer count, last block

### Files to Consider:
- `cross-chain-simulator/src/localnet/mpc-setup.ts` - Add contract state polling
- `near-localnet-orchestrator/src/layers/ChainSignaturesLayer.ts` - Add better diagnostics

---

## 3. Clean Up Legacy `.node0` References

**Issue:** Some files still reference `.node0` pattern which was used in earlier iterations. We standardized on `.localnet`.

### Files with Legacy References:

#### cross-chain-simulator/manual-add-domains-via-ssh.sh
```bash
# Line 15 - FROM:
CONTRACT_ID="v1.signer.node0"

# Should be deleted or updated if still needed:
CONTRACT_ID="v1.signer.localnet"
```

**Note:** This script may be deprecated. Review if still needed.

---

## 4. Verify config.local.json is Correct

**Already Correct:**
- `cross-chain-simulator/mpc-repo/infra/aws-cdk/config.local.json` uses `3.2.0` ✅
- `cross-chain-simulator/mpc-repo/infra/aws-cdk/config.local.json` uses `v1.signer.localnet` ✅

No changes needed for this file.

---

## Priority Order

1. **High Priority:** MPC Docker Image version update (affects deployments)
2. **Medium Priority:** Clean up legacy `.node0` references (prevents confusion)
3. **Low Priority:** Observability improvements (future enhancement)

---

## 5. FIXED: Pre-Existing Bug in mpc-network.ts

**Issue Discovered During Build:** The file `cross-chain-simulator/cross-chain-simulator/mpc-repo/infra/aws-cdk/lib/mpc-network.ts` had two issues:

1. **Duplicated Script Block (lines 712-839)**: Accidental copy of the reset script outside the heredoc - **DELETED**
2. **Unescaped Template Variables**: Bash variables like `${IMAGE_URI}` inside the heredoc were being interpreted as TypeScript template interpolations - **ESCAPED with backslash**

**Status:** ✅ FIXED - mpc-repo CDK now compiles successfully

---

## How to Apply These Changes

```bash
# After reviewing and agreeing with changes:

# 1. Update MPC image versions
# Edit the files listed above

# 2. Rebuild TypeScript
cd /near-localnet-orchestrator
npm run build

cd /cross-chain-simulator/mpc-repo/infra/aws-cdk
npm run build

# 3. Test deployment
# (Follow standard deployment procedure)
```

---

*Last Updated: January 2026*
