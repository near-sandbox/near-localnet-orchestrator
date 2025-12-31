## Layer 3 checkpoint (Chain Signatures) — 2025-12-31T15:00Z

This is a **state checkpoint** for Layer 3 (Chain Signatures / MPC) in the 5-layer NEAR localnet simulator stack.

### Executive summary

- **Orchestrator deploy status**: ✅ **Succeeded** (Layers 1–3 plan executed; Layer 3 completed).
- **On-chain state**: ✅ `signer.localnet`, `v1.signer.localnet`, and `mpc-node-*.localnet` exist; `v1.signer.localnet` has deployed code.
- **MPC node EC2 runtime**: ❌ **Not healthy** — containers are in restart loops; `:8080/health` not reachable on nodes.

### Evidence (high-signal)

- **Orchestrator success timestamp**: `2025-12-31T14:46:20.802Z`
- **NEAR Base**:
  - InstanceId: `i-0b2ea52c4eda30139`
  - Private IP: `10.0.44.18`
  - Local port-forward status check example: `http://127.0.0.1:3030/status`
- **MPC stack**: `MpcStandaloneStack` (CREATE_COMPLETE)
  - Node 0: `i-08f5949d331daed70` / `10.0.170.92` / `mpc-node-0.localnet`
  - Node 1: `i-00b05bb6574febb77` / `10.0.138.22` / `mpc-node-1.localnet`
  - Node 2: `i-01ebbcdd77381bd6c` / `10.0.154.241` / `mpc-node-2.localnet`
- **Contract deployed**:
  - `v1.signer.localnet` `code_hash` is **NOT** the empty hash (`111...`), e.g. `4SKLfbnrk2BL8zKTVxLybwXLq8TMLgaCbBaJ9JHfdCCU`
- **Secrets**:
  - `mpc-node-0-mpc_account_sk` is **not** placeholder (starts with `ed25519:`)

### Checklist (DONE / NOT DONE)

#### DONE

- **Layer 1 (NEAR Base)**
  - ✅ NEAR RPC reachable (via VPC / SSM port-forward)
  - ✅ Localnet root account exists via genesis patch (`localnet`)
  - ✅ Localnet private key stored in SSM (`/near-localnet/localnet-account-key`)

- **Layer 2 (NEAR Services)**
  - ✅ Core contracts can deploy via SSM document (wrap/whitelist/poolv1 under `.localnet`)
  - ✅ Faucet stack deploy mechanism works (but stack lifecycle is currently volatile due to rollback behavior; see NOT DONE)

- **Layer 3 (Chain Signatures)**
  - ✅ `MpcStandaloneStack` exists and outputs `.localnet` node accounts
  - ✅ Secrets Manager values are populated (not placeholders)
  - ✅ On-chain accounts exist:
    - ✅ `signer.localnet`
    - ✅ `v1.signer.localnet`
    - ✅ `mpc-node-0.localnet`, `mpc-node-1.localnet`, `mpc-node-2.localnet`
  - ✅ `v1.signer.localnet` contract deployed (non-empty `code_hash`)
  - ✅ Contract init executed (3 participants, threshold=2)
  - ✅ Domain vote attempted and treated as idempotent (protocol may no longer be “Running”)

#### NOT DONE / BROKEN (blocks “real signing”)

- **MPC node HTTP health**
  - ❌ Containers are restarting on all 3 MPC nodes
  - ❌ `curl http://127.0.0.1:8080/health` on each MPC instance fails (connection refused)
  - ❌ `curl http://{private-ip}:8080/health` from within VPC fails

- **Root cause hypotheses (needs confirmation + fix)**
  - ❌ MPC node bootstrap / UserData is misconfiguring runtime (restart loop)
  - ❌ MPC node registration / discovery in Cloud Map likely misconfigured (previous evidence of missing `servicediscovery:ListServices`)
  - ❌ MPC node boot-node config may be stale (previous evidence of an old NEAR Base peer IP in boot nodes)

- **Orchestrator rollback behavior (operational hazard)**
  - ❌ If Layer 3 fails mid-run, the orchestrator may destroy Layer 2 stacks (faucet), which triggers slow Lambda VPC ENI deletions and “stack-name bump” churn.

### Next actions (recommended order)

1. Fix MPC node instance bootstrap so containers stay up (address restart loop).
2. Re-validate node-local `:8080/health` via SSM on each MPC instance.
3. Re-enable non-skip MPC health checks (or run health checks from NEAR base EC2 inside VPC).
4. Run an end-to-end signing test (derive + sign) once nodes are healthy and keygen completes.


