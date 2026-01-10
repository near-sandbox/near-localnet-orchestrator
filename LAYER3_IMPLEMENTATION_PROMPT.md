# Layer 3 Progressive Deployment - Implementation Prompt

**Use this prompt to start a new chat for Layer 3 deployment implementation.**

---

## Prompt for Next Chat

```
I need to deploy the complete NEAR Localnet Simulator stack (Layers 1, 2, and 3), with Layer 3 using a progressive, chunk-by-chunk approach.

**Current Status:**
- ✅ AWS account is clean and verified (no existing infrastructure)
- ⬜ Layer 1 (NEAR Base) NOT deployed yet - Known to work
- ⬜ Layer 2 (NEAR Services/Faucet) NOT deployed yet - Known to work
- ⬜ Layer 3 (Chain Signatures with MPC) NOT deployed yet - Needs progressive approach

**Deployment Plan:**

**PHASE 1: Deploy Known-Working Layers (~25-35 minutes)**

Step 1: Deploy Layer 1 (NEAR Base)
- Deploy via AWSNodeRunner or orchestrator
- Verify RPC is responding
- Document: NEAR_INSTANCE, NEAR_PRIVATE_IP, node_key, chain_id
- ✅ Report status and wait for confirmation

Step 2: Deploy Layer 2 (NEAR Services/Faucet)
- Deploy faucet Lambda
- Verify faucet endpoint is operational
- Document: FAUCET_ENDPOINT
- ✅ Report status and wait for confirmation

**PHASE 2: Progressive Layer 3 Deployment (~40-50 minutes)**

Follow detailed plan: @near-localnet-orchestrator/docs/LAYER3_PROGRESSIVE_DEPLOYMENT.md

Deploy Layer 3 in 11 progressive chunks (3.0 through 3.10). After EACH chunk:
1. Run verification commands from the plan doc
2. Check all success criteria
3. Report status to me with results
4. WAIT for my confirmation before proceeding to next chunk

**Critical Architecture Constraints:**
- Use AWS profile: shai-sandbox-profile
- **GENESIS FIRST:** Collect genesis data from Layer 1 BEFORE deploying MPC infrastructure (Chunks 3.1 → 3.2)
- **KEY MATCHING:** Verify Secrets Manager ↔ on-chain key matching before domain voting
- Never hardcode AWS values (discover dynamically from CloudFormation)
- MPC nodes MUST be deployed in same VPC as Layer 1

**History - Why Progressive Approach:**
Layer 3 has been failing repeatedly over 2 weeks due to:
- ❌ Deploying MPC infrastructure before collecting genesis data → NOW FIXED (Chunk 3.1 comes before 3.2)
- ❌ Key mismatches between Secrets Manager and on-chain accounts → NOW VERIFIED (multiple checkpoints)
- ❌ Genesis/boot_nodes mismatches causing MPC nodes to show 0 peers → NOW PREVENTED (genesis-first approach)
- ❌ Various issues documented in NEAR_LOCALNET_LESSONS_LEARNED.md gotchas #10-15.9

**Timing Expectations:**
- Layer 1 deployment: ~20-25 minutes
- Layer 2 deployment: ~5-10 minutes  
- Layer 3 chunks 3.0-3.7: ~20-30 minutes
- Layer 3 chunk 3.8 (DKG): ~10 minutes (ONE-TIME initial setup)
- Layer 3 chunks 3.9-3.10: ~5-10 minutes
- **Total:** ~60-80 minutes for complete stack

**After deployment:** Chain Signatures signing will be FAST (~2-3 seconds per signature, matching mainnet NEAR + IOTEX behavior). The 10-minute wait only happens ONCE during initial DKG.

**Goal:**
Complete Layers 1, 2, and all 11 Layer 3 chunks successfully. End state:
- ✅ NEAR Base RPC responding
- ✅ Faucet operational
- ✅ MPC nodes synced with 1+ peers
- ✅ v1.signer contract in "Running" state
- ✅ Address derivation: instant
- ✅ Transaction signing: ~2-3 seconds
- ✅ Cross-chain demo working

**Let's start with PHASE 1: Deploy Layers 1 & 2**

Please:
1. Deploy Layer 1 (NEAR Base) first
2. Verify Layer 1 health (RPC responding, blocks > 0, document node_key and chain_id)
3. Report Layer 1 status and wait for my confirmation
4. Deploy Layer 2 (NEAR Services/Faucet)
5. Verify Layer 2 health (faucet endpoint working)
6. Report Layer 2 status and wait for my confirmation
7. Then we'll proceed to PHASE 2: Layer 3 progressive deployment starting with Chunk 3.0
```

---

## Pre-Flight Checklist

Before starting the new chat, ensure you have:

### Required Information
- [ ] NEAR Base stack name: `near-localnet-infrastructure`
- [ ] NEAR Services stack name: `near-localnet-faucet-v6`
- [ ] AWS Profile: `shai-sandbox-profile`
- [ ] AWS Region: `us-east-1`

### Prerequisites Confirmed
- [x] AWS credentials valid (confirmed clean account ✅)
- [x] No existing infrastructure (clean slate ✅)
- [ ] Ready to deploy Layer 1 (NEAR Base) - ~20-25 minutes
- [ ] Ready to deploy Layer 2 (NEAR Services) - ~5-10 minutes
- [ ] Ready to deploy Layer 3 progressively - ~40-50 minutes

### Documents Ready
- [ ] Progressive deployment guide: `docs/LAYER3_PROGRESSIVE_DEPLOYMENT.md`
- [ ] Lessons learned: `docs/lessons-learned/NEAR_LOCALNET_LESSONS_LEARNED.md`
- [ ] Cursor rules updated with layer3-progressive-deployment.mdc

---

## Your Current Plan is EXCELLENT ✅

The document you have (`LAYER3_PROGRESSIVE_DEPLOYMENT.md`) is ready to use as the implementation plan. It has:

✅ **Clear Structure:**
- 11 well-defined chunks
- Each chunk is independently verifiable
- Logical progression through Layer 3

✅ **Actionable Commands:**
- Copy-paste verification commands
- No guesswork needed
- Dynamic value discovery (no hardcoding)

✅ **Safety Gates:**
- Success criteria for each chunk
- Blocker identification
- Check-in points before proceeding

✅ **Error Prevention:**
- References to relevant gotchas
- Common failure modes documented
- Resolution strategies included

✅ **Tracking Mechanism:**
- Deployment worksheet table
- Document errors/concerns
- Build audit trail

**You do NOT need a separate plan.** The document itself IS the plan.

---

## If Layers 1 & 2 Already Deployed

If you already have Layers 1 & 2 running, modify the prompt:

**Change:**
```
**Current Status:**
- ✅ AWS account is clean and verified
- ⬜ Layer 1 (NEAR Base) NOT deployed yet
```

**To:**
```
**Current Status:**
- ✅ AWS account is clean and verified
- ✅ Layer 1 (NEAR Base) ALREADY DEPLOYED
  - Instance: i-xxxxx
  - Private IP: 10.0.x.x
  - RPC responding: YES
- ✅ Layer 2 (NEAR Services) ALREADY DEPLOYED
  - Faucet endpoint: https://xxx.execute-api...
- ⬜ Layer 3 NOT deployed yet

**Approach:**
Skip Phase 1 (Layers 1 & 2 already operational). Start directly with Layer 3 Chunk 3.0: Prerequisites Validation.
```

This way the agent will skip deployment and just verify Layers 1 & 2 health before proceeding to Layer 3 chunks.

---

## Execution Strategy for New Chat

### Phase 1: Context Setting (First Message)
- Provide the prompt above
- Agent reads the plan document
- Agent understands the chunk-by-chunk approach

### Phase 2: Iterative Execution (Chunks 3.0-3.10)
For each chunk:
1. **Agent executes** verification/deployment commands
2. **Agent reports** results against success criteria
3. **Agent waits** for your confirmation
4. **You provide feedback:**
   - ✅ "Proceed to next chunk" OR
   - ⚠️ "Issue found: [description]" OR
   - 🛑 "Stop, need to fix [problem]"
5. **Agent proceeds** only after confirmation

### Phase 3: Completion (After Chunk 3.9/3.10)
- Update tracking worksheet with final status
- Document any deviations from plan
- Confirm Chain Signatures working (fast signing)
- Celebrate! 🎉

---

## Expected Chat Flow Example

**You:**
> [Paste prompt from above]

**Agent:**
> I understand. We'll deploy in 2 phases:
> - Phase 1: Layers 1 & 2 (known to work)
> - Phase 2: Layer 3 progressive (11 chunks with verification gates)
> 
> Starting Phase 1: Deploying Layer 1 (NEAR Base)...
> [Deploys via CDK]
> [Verifies RPC health]
> 
> **Layer 1 Status:** COMPLETE ✅
> - RPC URL: http://10.0.5.132:3030
> - Instance: i-xxxxx
> - Block height: 12345
> - Chain ID: test-chain-abc123
> - Node Key: ed25519:xxxxx
> 
> Ready to deploy Layer 2? Please confirm.

**You:**
> Confirmed. Deploy Layer 2.

**Agent:**
> Deploying Layer 2 (NEAR Services/Faucet)...
> [Deploys faucet Lambda]
> [Verifies endpoint]
> 
> **Layer 2 Status:** COMPLETE ✅
> - Faucet endpoint: https://xxx.execute-api.us-east-1.amazonaws.com/prod
> 
> **Phase 1 Complete!** Both Layers 1 & 2 are operational.
> 
> Ready to start Phase 2: Layer 3 Progressive Deployment (Chunk 3.0)?

**You:**
> Yes, proceed to Layer 3 Chunk 3.0

**Agent:**
> Starting Chunk 3.0: Prerequisites Validation...
> [Runs verification commands]
> 
> **Chunk 3.0 Status:** COMPLETE ✅
> - Layer 1 healthy
> - Layer 2 healthy
> - localnet account verified
> 
> Ready for Chunk 3.1 (Collect Genesis Data)? Please confirm.

**You:**
> Confirmed. Proceed to 3.1

**Agent:**
> Collecting genesis data from NEAR Base...
> [Executes collection commands]
> [Reports results]
> Ready for Chunk 3.2? Please confirm.

... (continues for all 11 Layer 3 chunks)

---

## Modifications You Might Want

### Option 1: Run Multiple Chunks in Sequence (Faster)
If you trust certain chunks can be batched:
```
"Execute Chunks 3.0, 3.1, 3.2 together, then report. Stop before 3.3."
```

### Option 2: Dry Run First
Before actually deploying:
```
"Do a dry run through all 11 chunks. Report what WOULD be done without executing. Then I'll approve full execution."
```

### Option 3: Skip to Specific Chunk
If some chunks already complete:
```
"Chunks 3.0-3.2 are already complete. Start from Chunk 3.3: Verify MPC Sync."
```

---

## Tracking Worksheet Template

Copy this to a separate file or notion doc to track progress:

```markdown
# Complete Stack Deployment Tracking - [DATE]

## Phase 1: Foundation Layers

| Layer | Status | Start Time | Duration | Errors/Concerns | Resolution |
|-------|--------|------------|----------|----------------|------------|
| Layer 1: NEAR Base | ⬜ | | | | |
| Layer 2: NEAR Services | ⬜ | | | | |

## Phase 2: Layer 3 Progressive Chunks

| Chunk | Status | Start Time | Duration | Errors/Concerns | Resolution |
|-------|--------|------------|----------|----------------|------------|
| 3.0: Prerequisites | ⬜ | | | | |
| 3.1: Collect Genesis | ⬜ | | | | |
| 3.2: Deploy MPC Infra | ⬜ | | | | |
| 3.3: Verify MPC Sync | ⬜ | | | | |
| 3.4: MPC Accounts | ⬜ | | | | |
| 3.5: Contract Deploy | ⬜ | | | | |
| 3.6: Contract Init | ⬜ | | | | |
| 3.7: Domain Voting | ⬜ | | | | |
| 3.8: DKG | ⬜ | | | | |
| 3.9: Verification | ⬜ | | | | |
| 3.10: Demo | ⬜ | | | | |

## Environment Variables Collected

### Phase 1: Layers 1 & 2
```bash
# Layer 1 (NEAR Base)
export NEAR_INSTANCE=
export NEAR_PRIVATE_IP=
export NEAR_NODE_KEY=
export NEAR_CHAIN_ID=
export NEAR_VPC_ID=

# Layer 2 (NEAR Services)
export FAUCET_ENDPOINT=
export FAUCET_LAMBDA_ARN=
```

### Phase 2: Layer 3
```bash
# From Chunk 3.1
export NEAR_BOOT_NODES=
export GENESIS_FILE=/tmp/near-layer3-genesis/genesis.json
export GENESIS_HASH=

# From Chunk 3.2
export MPC_NODE_0=
export MPC_NODE_1=
export MPC_NODE_2=

# For orchestrator
export MASTER_ACCOUNT_PRIVATE_KEY=  # From SSM /near-localnet/localnet-account-key
```

## Key Observations

### What Worked Well
-

### What Failed
-

### Gotchas Encountered
-

### Resolutions Applied
-

## Final Status

- [ ] Layer 3 deployment complete
- [ ] All chunks verified
- [ ] Chain Signatures working (fast signing confirmed)
- [ ] Ready for Layer 4
```

---

## Success Definition

**PHASE 1 SUCCESS (Layers 1 & 2):**
1. ✅ Layer 1 deployed: NEAR RPC responding, blocks > 0
2. ✅ Layer 2 deployed: Faucet endpoint operational
3. ✅ localnet master account exists with keys
4. ✅ All infrastructure IDs documented (instance IDs, IPs, keys)

**PHASE 2 SUCCESS (Layer 3):**
1. ✅ All chunks 3.0-3.9 marked complete in worksheet (3.10 optional)
2. ✅ MPC nodes synced with 1+ peers
3. ✅ Contract state: "Running"
4. ✅ Address derivation: Instant response
5. ✅ Transaction signing: ~2-3 seconds (NOT 10 minutes!)
6. ✅ No "No such domain" errors
7. ✅ No key mismatch errors
8. ✅ Tracking worksheet completed with all resolutions documented

**COMPLETE STACK SUCCESS:**
- ✅ NEAR Base RPC responding at private IP
- ✅ Faucet Lambda operational
- ✅ MPC nodes synced and healthy
- ✅ v1.signer contract in "Running" state
- ✅ Bitcoin/Ethereum address derivation returns instantly
- ✅ Signing requests complete in ~2-3 seconds (matching mainnet behavior)
- ✅ MPC node logs show active participation
- ✅ No repeated failures requiring redeployment

---

## Ready to Start?

**Your plan is solid!** The `LAYER3_PROGRESSIVE_DEPLOYMENT.md` document has everything you need.

**To begin:**
1. Copy the prompt from the "Prompt for Next Chat" section above
2. Customize if Layers 1 & 2 are already deployed (see "If Layers 1 & 2 Already Deployed" section)
3. Start a new chat
4. Paste the prompt
5. Let the agent work through:
   - **Phase 1:** Deploy & verify Layers 1 & 2 (if needed)
   - **Phase 2:** Progressive Layer 3 deployment (11 chunks with check-ins)
6. Use the tracking worksheet to monitor progress

---

## 📝 Summary

### ✅ What's Ready
- **Cursor Rules:** Updated with layer3-progressive-deployment.mdc
- **Implementation Plan:** LAYER3_PROGRESSIVE_DEPLOYMENT.md (11 chunks)
- **Implementation Prompt:** This document (ready to copy/paste)
- **Tracking Worksheet:** Template included above

### ✅ Key Improvements
- **Genesis-First Order:** Chunks 3.1 → 3.2 prevents sync failures
- **Two-Phase Approach:** Deploy known-working layers first, then progressive Layer 3
- **Check-In Gates:** Verify each chunk before proceeding
- **Timing Clarity:** 10-min DKG is ONE-TIME; signing is fast (~2-3 sec) afterwards

### 🚀 You're Ready!
Your plan is solid and complete. The progressive approach should finally break the "1 step forward, 2 steps back" cycle by:
- Deploying with correct genesis order
- Verifying each component before moving forward
- Documenting issues for resolution
- Preventing key mismatches

**Good luck with the deployment!** 🎯
