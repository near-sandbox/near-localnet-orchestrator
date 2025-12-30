# Morning Runbook: Verify Layer 1 + 2 `.localnet` Naming and Finalize

This is the single doc to start from tomorrow.

## What changed (branch: `feature/node0-to-localnet-naming`)

- **Layer 1 (`AWSNodeRunner`)**: Localnet now includes a `localnet` root account in `genesis.json`, so we can create `alice.localnet`.
- **Layer 2 (`near-localnet-services`)**: Faucet now uses **only** the `localnet` account key from SSM.
- **Core contracts (`near/core-contracts`)**: Deployment targets `wrap.localnet`, `whitelist.localnet`, `poolv1.localnet`.

## Last night’s state

- A “full nuke” was executed in the sandbox account/region (`us-east-1`) and the last remaining stack (`near-localnet-common`) was confirmed deleted.
- A bootstrap bug was found: **Ubuntu 24.04 didn’t have an `awscli` apt candidate**, causing UserData to fail. This was fixed by installing AWS CLI via `pip3`.

## 0) Prereqs

- AWS profile: `shai-sandbox-profile`
- Region: `us-east-1`
- All three repos checked out on: `feature/node0-to-localnet-naming`
  - `AWSNodeRunner`
  - `near-localnet-services`
  - `near-localnet-orchestrator`

## 1) Sanity: confirm account is clean

```bash
aws cloudformation describe-stacks \
  --query "Stacks[?StackStatus!='DELETE_COMPLETE'].[StackName,StackStatus]" \
  --output table \
  --profile shai-sandbox-profile
```

## 2) Deploy Layer 1 (NEAR Base)

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-orchestrator
npm run build
npx near-orchestrator deploy near_base
```

### 2a) Confirm localnet key exists in SSM (critical)

```bash
aws ssm get-parameter \
  --name "/near-localnet/localnet-account-key" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --profile shai-sandbox-profile
```

Expected: a value like `ed25519:...` (not `null`, not “ParameterNotFound”).

If missing, pull the setup log from the instance:

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='nearinstanceid'].OutputValue" \
  --output text \
  --profile shai-sandbox-profile)

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["sudo tail -200 /var/log/near-setup.log"]' \
  --profile shai-sandbox-profile
```

## 3) Deploy Layer 2 (NEAR Services + Faucet)

```bash
cd /Users/Shai.Perednik/Documents/code_workspace/near_mobile/near-localnet-orchestrator
npx near-orchestrator deploy near_services
```

## 4) Verify: create `alice.localnet` via Faucet

### 4a) Get the Faucet URL

```bash
aws cloudformation describe-stacks \
  --stack-name near-localnet-faucet-v2 \
  --query "Stacks[0].Outputs" \
  --output table \
  --profile shai-sandbox-profile
```

Find the Function URL output (or use `npx near-orchestrator status` if it prints it).

### 4b) Create the account

Generate a keypair locally (any tooling is fine). Then:

```bash
curl -sS -X POST "https://YOUR_FAUCET_FUNCTION_URL/" \
  -H "Content-Type: application/json" \
  -d '{
    "mode":"createAccount",
    "accountId":"alice.localnet",
    "publicKey":"ed25519:REPLACE_ME",
    "amount":"10"
  }'
```

Expected: `success: true` and a `txHash`.

## 5) Verify: account exists on-chain (RPC is private)

Because the NEAR RPC is VPC-only, the easiest verification is via SSM port-forward:

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name near-localnet-infrastructure \
  --query "Stacks[0].Outputs[?OutputKey=='nearinstanceid'].OutputValue" \
  --output text \
  --profile shai-sandbox-profile)

aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3030"],"localPortNumber":["3030"]}' \
  --profile shai-sandbox-profile
```

Then in another terminal:

```bash
curl -sS http://127.0.0.1:3030 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"alice.localnet"}}'
```

## 6) (Optional) Verify core contracts namespace

After core contracts are deployed, verify:
- `wrap.localnet`
- `whitelist.localnet`
- `poolv1.localnet`

## 7) If everything works: merge + push (finalize Layer 1 & 2)

Goal: confirm `.localnet` works and then merge `feature/node0-to-localnet-naming` into `main` in:
- `AWSNodeRunner`
- `near-localnet-services`
- `near-localnet-orchestrator`

Recommended: open PRs in GitHub and merge there, then pull `main` locally.


