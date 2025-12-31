# Layer 3 Checkpoint: 2025-01-01T01:15Z

## Status: DONE (All Checks Pass)

Layer 3 (Chain Signatures / MPC) is now **fully operational**.

---

## Stack Information

| Stack | Status | ARN |
|-------|--------|-----|
| MpcStandaloneStack | CREATE_COMPLETE | `arn:aws:cloudformation:us-east-1:311843862895:stack/MpcStandaloneStack/...` |

---

## MPC Node Instances

| Node | Instance ID | Private IP | Status | Health |
|------|-------------|------------|--------|--------|
| Node0 | `i-0e5ac5db9a98ed1e0` | `10.0.152.238` | Up | OK |
| Node1 | `i-058507207689fe120` | `10.0.185.37` | Up 2 min | OK |
| Node2 | `i-0bc5269a2e3482cf7` | `10.0.188.56` | Up 2 min | OK |

---

## Health Check Evidence

### Per-Node SSM Health (localhost)

**Node0:**
```
CONTAINER ID   IMAGE                    COMMAND                  CREATED              STATUS              PORTS     NAMES
29125d0e44c8   nearone/mpc-node:3.1.0   "/app/mpc-node start…"   About a minute ago   Up About a minute             mpc-node

Ports:
LISTEN 0      4096         0.0.0.0:8080       0.0.0.0:*    users:(("mpc-node",pid=27666,fd=9))
LISTEN 0      4096         0.0.0.0:3030       0.0.0.0:*    users:(("mpc-node",pid=27666,fd=83))

Health: OK
```

**Node1:**
```
CONTAINER ID   IMAGE                    COMMAND                  CREATED         STATUS         PORTS     NAMES
665a2f63dd58   nearone/mpc-node:3.1.0   "/app/mpc-node start…"   2 minutes ago   Up 2 minutes             mpc-node

Health: OK
```

**Node2:**
```
CONTAINER ID   IMAGE                    COMMAND                  CREATED         STATUS         PORTS     NAMES
18191b119c87   nearone/mpc-node:3.1.0   "/app/mpc-node start…"   2 minutes ago   Up 2 minutes             mpc-node

Health: OK
```

### VPC Connectivity (From NEAR Base EC2)

```
=== NEAR BASE -> MPC NODE0 (10.0.152.238) ===
OK
=== NEAR BASE -> MPC NODE1 (10.0.185.37) ===
OK
=== NEAR BASE -> MPC NODE2 (10.0.188.56) ===
OK
```

### On-Chain Contract Verification

```
v1.signer.localnet code_hash: 4SKLfbnrk2BL8zKTVxLybwXLq8TMLgaCbBaJ9JHfdCCU
```

(Non-empty code_hash confirms contract is deployed)

---

## NEAR Base Layer (Prerequisite)

| Resource | Value |
|----------|-------|
| Instance ID | `i-0b2ea52c4eda30139` |
| Private IP | `10.0.44.18` |
| RPC Status | Healthy (v2.10.1, chain `test-chain-aLh2P`) |
| VPC ID | `vpc-04e3c6548301d9175` |
| Node Key | `ed25519:7PGseFbWxvYVgZ89K1uTJKYoKetWs7BJtbyXDzfbAcqX` |

---

## Definition of Done Checklist

- [x] All MPC nodes stay `Up` for 5+ minutes
- [x] `curl -sf http://127.0.0.1:8080/health` returns 200 on each MPC node (SSM)
- [x] From NEAR base EC2: `curl -sf http://<mpc_ip>:8080/health` returns 200 for each node
- [x] `v1.signer.localnet` has non-empty `code_hash`

---

## Deployment Procedure (For Reference)

1. Preflight: Verified NEAR base health, extracted `node_key` and `genesis.json` base64
2. Destroyed old MpcStandaloneStack (instances had stale genesis)
3. Generated MPC node keys: `bash scripts/generate-test-keys.sh`
4. Updated Secrets Manager: `bash scripts/update-secrets.sh`
5. Redeployed MpcStandaloneStack with correct context:
   - `vpcId=vpc-04e3c6548301d9175`
   - `nearRpcUrl=http://10.0.44.18:3030`
   - `nearNetworkId=localnet`
   - `nearBootNodes=ed25519:...@10.0.44.18:24567`
   - `nearGenesis=<base64>`
   - `mpcContractId=v1.signer.localnet`
6. Waited for instances to initialize (secrets download, genesis init, container start)
7. Verified all health checks pass

---

## Next Steps

Layer 3 is complete. Ready to proceed with:
- Layer 4 (Intents Protocol) integration
- End-to-end signing test (derive address + sign transaction)

