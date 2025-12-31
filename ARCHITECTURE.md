# NEAR Localnet Orchestrator - Architecture

## Overview

The NEAR Localnet Orchestrator manages a **5-layer simulation stack** for NEAR Protocol development. Each layer builds upon the previous, creating a complete localnet environment that mirrors mainnet capabilities.

## Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 5: User Applications                              │
│ (Developer's dApps - intent-based, multi-chain apps)   │
│ Not managed by orchestrator                             │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Intents Protocol                               │
│ Repository: near-intents-simulator                      │
│ Package: @near-sandbox/near-intents-simulator           │
│                                                          │
│ Purpose: 1Click API for cross-chain swaps               │
│ • Quote generation and route optimization               │
│ • Asset registry (NEAR, ETH, BTC, USDC, etc.)          │
│ • Execution coordination                                │
│ • Production-shaped 1Click API interface                │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Chain Signatures                               │
│ Repository: cross-chain-simulator                       │
│ Package: @near-sandbox/cross-chain-simulator            │
│                                                          │
│ Purpose: Cross-chain signing primitives                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Embedded MPC Infrastructure                         │ │
│ │ • 3-8 MPC nodes (github.com/near/mpc)              │ │
│ │ • Threshold signature generation (cait-sith)       │ │
│ │ • AWS CDK deployment (infra/aws-cdk)               │ │
│ └─────────────────────────────────────────────────────┘ │
│ • v1.signer contract deployment                         │
│ • Address derivation (BTC, ETH, DOGE, etc.)            │
│ • Transaction signing via MPC                           │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 2: NEAR Services                                  │
│ Repository: near-localnet-services                      │
│ Package: @near-sandbox/near-localnet-services           │
│                                                          │
│ Purpose: Essential utility services                     │
│ • Faucet - Token distribution for test accounts         │
│ • Gas payer contracts (future)                          │
│ • Account management utilities (future)                 │
│ • Health monitoring (future)                            │
└─────────────────────────────────────────────────────────┘
                         ↑ uses
┌─────────────────────────────────────────────────────────┐
│ Layer 1: NEAR Base                                      │
│ Repository: AWSNodeRunner                               │
│                                                          │
│ Purpose: Blockchain foundation                          │
│ • NEAR Protocol node (v2.10.1)                          │
│ • RPC endpoint for transactions and queries             │
│ • VPC, security groups, EC2 infrastructure             │
│ • Block production and consensus                        │
└─────────────────────────────────────────────────────────┘
```

## Layer Details

### Layer 1: NEAR Base

| Property | Value |
|----------|-------|
| Repository | [AWSNodeRunner](https://github.com/near-sandbox/AWSNodeRunner) |
| Deployment | AWS CDK (lib/near) |
| Time | ~22 minutes |
| Cost | ~$105/month |

**Provides**:
- NEAR RPC endpoint (e.g., `http://10.0.55.70:3030`)
- VPC and networking infrastructure
- Block production for localnet

**Sufficiency Criteria**:
- Infrastructure (VPC/EC2) is running.
- NEAR Node process (`nearup`) is active.
- RPC Endpoint responds with status 200 and advancing block height.
- *Note: Creating test accounts/transactions requires Layer 2 (Faucet).*

**Used by**: All other layers

### Layer 2: NEAR Services

| Property | Value |
|----------|-------|
| Repository | [near-localnet-services](https://github.com/near-sandbox/near-localnet-services) |
| Deployment | AWS CDK (faucet/cdk) |
| Time | ~5 minutes |
| Cost | ~$5-10/month |

**Provides**:
- Faucet Lambda for token distribution
- Core system contracts deployed under `.localnet` (for mainnet/testnet parity surface area):
  - `wrap.localnet` (wNEAR)
  - `whitelist.localnet`
  - `poolv1.localnet` (staking-pool-factory)
- (Future) Gas payer contract
- (Future) Account management utilities

**Depends on**: Layer 1 (near_base)

**Implementation note (important)**:
- Core contracts are deployed **inside the VPC** using a **custom SSM Command document** to avoid private-RPC connectivity issues.
- Document name: `near-localnet-deploy-core-contracts`
- Document source: `assets/ssm-documents/near-localnet-deploy-core-contracts.yaml`

### Layer 3: Chain Signatures

| Property | Value |
|----------|-------|
| Repository | [cross-chain-simulator](https://github.com/near-sandbox/cross-chain-simulator) |
| MPC Source | Embedded from [github.com/near/mpc](https://github.com/near/mpc) |
| Deployment | Script + AWS CDK (for MPC) |
| Time | ~20 minutes |
| Cost | ~$100-150/month |

**Provides**:
- 3-8 MPC nodes for threshold signatures
- v1.signer contract on localnet
- Chain Signatures API (address derivation, signing)

**Important**: MPC infrastructure is **embedded** in this layer, not separate.

**Depends on**: Layer 2 (near_services)

### Layer 4: Intents Protocol

| Property | Value |
|----------|-------|
| Repository | [near-intents-simulator](https://github.com/near-sandbox/near-intents-simulator) |
| Package | @near-sandbox/near-intents-simulator |
| Deployment | npm install (library) |
| Time | ~5 minutes |
| Cost | $0 (library only) |

**Provides**:
- 1Click API simulation
- Quote generation for cross-chain swaps
- Route optimization (Rainbow Bridge, Uniswap, Ref Finance)
- Asset registry

**Depends on**: Layer 3 (chain_signatures)

### Layer 5: User Applications

Not managed by the orchestrator. This is where developers build their applications using the stack.

## Dependency Resolution

The orchestrator uses topological sorting to deploy layers in the correct order:

```
1. near_base       → deploys first (no dependencies)
2. near_services   → deploys after near_base
3. chain_signatures → deploys after near_services
4. intents_protocol → deploys after chain_signatures
```

## Configuration

See `config/simulators.config.yaml` for the complete configuration.

Key configuration patterns:

### Deploy All Layers
```yaml
layers:
  near_base:
    enabled: true
  near_services:
    enabled: true
  chain_signatures:
    enabled: true
  intents_protocol:
    enabled: true
```

### Use Existing NEAR Node
```yaml
layers:
  near_base:
    config:
      existing_rpc_url: "http://your-near-node:3030"
```

## Auxiliary Chain Runners (Optional)

In addition to the 5-layer NEAR stack, the orchestrator can manage auxiliary chain runners for end-to-end testing (e.g. an `ethereum_localnet` RPC). These are **supporting infrastructure**, not part of the NEAR layer model.

## Critical Note: MPC ↔ NEAR Base Sync (Localnet)

For localnet deployments, MPC nodes **must sync to the NEAR Base blockchain** (Layer 1) and watch `v1.signer` there:

- **NEAR network id**: `localnet` (used for NEAR Base)
- **MPC env**: `mpc-localnet` (controls the MPC container `start.sh` localnet behavior)
- **Genesis**: MPC nodes must use the **NEAR Base genesis** (not the embedded MPC standalone genesis)

This repository uses **S3-based genesis distribution** for MPC nodes to avoid EC2 UserData size limits and to ensure every node uses the same genesis consistently.

## Layer Outputs

Each layer exports outputs that subsequent layers can use:

| Layer | Key Outputs |
|-------|-------------|
| near_base | rpc_url, network_id, vpc_id |
| near_services | faucet_endpoint, faucet_lambda_arn |
| chain_signatures | v1_signer_contract_id, mpc_node_endpoints, chain_signatures_config |
| intents_protocol | intents_simulator_ready, supported_chains |

Outputs are referenced using interpolation syntax:
```yaml
config:
  rpc_url: "${near_base.outputs.rpc_url}"
```

## Deployment Commands

```bash
# Deploy all layers
npx near-orchestrator deploy

# Deploy specific layers
npx near-orchestrator deploy near_base near_services

# Verify layer health
npx near-orchestrator verify

# View status
npx near-orchestrator status

# Destroy all layers (reverse order)
npx near-orchestrator destroy
```

## Source of Truth

The authoritative architecture document is:
- **Main**: `/CORRECTED_ARCHITECTURE.md` (workspace root)
- **Orchestrator**: This file (`ARCHITECTURE.md`)

All repository READMEs should align with this architecture.
