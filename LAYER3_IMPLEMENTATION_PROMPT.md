# Layer 3 Progressive Deployment - Implementation Prompt

**Use this prompt to start a new chat for Layer 3 deployment implementation.**

---

## Prompt for Next Chat

```
I need to deploy Layer 3 (Chain Signatures with MPC) using a progressive, chunk-by-chunk approach.

**Primary Plan Document:**
@near-localnet-orchestrator/docs/LAYER3_PROGRESSIVE_DEPLOYMENT.md

**Current Status:**
- ✅ AWS account is clean and verified
- ✅ Layer 1 (NEAR Base) deployed: <FILL IN STATUS>
- ✅ Layer 2 (NEAR Services/Faucet) deployed: <FILL IN STATUS>
- ⬜ Layer 3 (Chain Signatures) NOT deployed yet

**Approach:**
We will deploy Layer 3 in 11 progressive chunks (3.0 through 3.10). After EACH chunk:
1. You will run the verification commands
2. Check all success criteria
3. Report status to me
4. Wait for my confirmation before proceeding to next chunk

**Critical Constraints:**
- Genesis data MUST be collected BEFORE deploying MPC infrastructure (Chunks 3.1 → 3.2)
- Key matching is CRITICAL between Secrets Manager and on-chain (verified in multiple chunks)
- Use AWS profile: shai-sandbox-profile
- Never hardcode AWS values (discover dynamically)

**History:**
Layer 3 has been failing repeatedly over 2 weeks due to:
- Deploying MPC before collecting genesis (now fixed in chunk order)
- Key mismatches between Secrets Manager and on-chain accounts
- Genesis/boot_nodes mismatches causing 0 peers
- Various issues documented in NEAR_LOCALNET_LESSONS_LEARNED.md

**Goal:**
Complete all 11 chunks successfully, with full tracking in the deployment worksheet. End state is a working Chain Signatures system where:
- Address derivation is instant
- Transaction signing takes ~2-3 seconds (not 10 minutes!)
- Cross-chain demo completes successfully

**Let's start with Chunk 3.0: Prerequisites Validation**

Please:
1. Read the plan document to understand all 11 chunks
2. Execute Chunk 3.0 verification commands
3. Report results and success criteria
4. Wait for my confirmation before proceeding to Chunk 3.1
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
- [ ] AWS credentials valid (tested earlier - ✅)
- [ ] Layer 1 deployed or ready to deploy
- [ ] Layer 2 deployed or ready to deploy
- [ ] No existing MPC infrastructure (clean slate)

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
> I've read the progressive deployment plan. Starting with Chunk 3.0: Prerequisites Validation.
> 
> Running verification commands...
> [Output of commands]
> 
> **Success Criteria Check:**
> - ✅ near-localnet-infrastructure: CREATE_COMPLETE
> - ✅ NEAR RPC responding: block height 12345
> - ✅ Faucet deployed: CREATE_COMPLETE
> - ✅ localnet account exists with keys
> 
> **Chunk 3.0 Status:** COMPLETE ✅
> 
> Ready to proceed to Chunk 3.1 (Collect Genesis Data)? Please confirm.

**You:**
> Confirmed. Proceed to 3.1

**Agent:**
> Starting Chunk 3.1: Collect Genesis Data from NEAR Base...
> [Executes collection commands]
> [Reports results]
> Ready for Chunk 3.2? Please confirm.

... (continues for all 11 chunks)

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
# Layer 3 Deployment Tracking - [DATE]

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

```bash
export NEAR_INSTANCE=
export NEAR_PRIVATE_IP=
export NEAR_NODE_KEY=
export NEAR_CHAIN_ID=
export NEAR_BOOT_NODES=
export MPC_NODE_0=
export MPC_NODE_1=
export MPC_NODE_2=
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

**Layer 3 is COMPLETE when:**
1. ✅ All chunks 3.0-3.9 marked complete in worksheet (3.10 optional)
2. ✅ MPC nodes synced with 1+ peers
3. ✅ Contract state: "Running"
4. ✅ Address derivation: Instant response
5. ✅ Transaction signing: ~2-3 seconds
6. ✅ No "No such domain" errors
7. ✅ No key mismatch errors
8. ✅ Tracking worksheet completed with all resolutions documented

**You'll know it's working when:**
- Bitcoin/Ethereum address derivation returns instantly
- Signing requests complete in seconds (not minutes!)
- MPC node logs show active participation
- No repeated failures requiring redeployment

---

## Ready to Start?

**Your plan is solid!** The `LAYER3_PROGRESSIVE_DEPLOYMENT.md` document has everything you need.

**To begin:**
1. Copy the prompt from the "Prompt for Next Chat" section above
2. Start a new chat
3. Paste the prompt
4. Let the agent work through chunks with check-ins
5. Use the tracking worksheet to monitor progress

Good luck! This progressive approach should finally break the "1 step forward, 2 steps back" cycle. 🚀
