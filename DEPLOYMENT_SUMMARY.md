## NEAR Localnet Simulator - Deployment Summary (Evergreen)

This file intentionally **does not** hardcode instance IDs, IPs, chain IDs, or one-off fixes. Those details rot quickly.

Use the orchestrator + CloudFormation outputs to inspect the *current* deployment.

### What “healthy” looks like

- **Layer 1 (NEAR Base)**: RPC responds, block height increases
- **Layer 2 (NEAR Services)**: faucet invocations succeed
- **Layer 3 (Chain Signatures / MPC)**:
  - MPC nodes run the `mpc-node` container
  - MPC embedded NEAR node **syncs to NEAR Base** (same `chain_id`, catches up in height)
  - MPC nodes watch `v1.signer` **on NEAR Base**
  - For localnet, MPC nodes use:
    - **NEAR network id**: `localnet`
    - **MPC env**: `mpc-localnet`
    - **Genesis**: NEAR Base genesis (distributed via S3, not embedded)

### Check status via orchestrator

```bash
cd near-localnet-orchestrator
npx near-orchestrator status
```

### Check stack outputs (AWS CLI)

```bash
# NEAR Base outputs
aws cloudformation describe-stacks \
  --stack-name near-localnet-sync \
  --profile shai-sandbox-profile \
  --query "Stacks[0].Outputs"
```

### MPC sanity checks (on an MPC instance via SSM)

Run these from your machine (replace `{mpc-instance-id}`):

```bash
aws ssm start-session --target {mpc-instance-id} --profile shai-sandbox-profile
```

Then on the instance:

```bash
docker ps --filter name=mpc-node
docker logs mpc-node --tail 50

# Embedded NEAR node status inside MPC container (localhost on the instance)
curl -s http://localhost:3030/status
```

### Cleanup

```bash
cd near-localnet-orchestrator
npx near-orchestrator destroy
```

