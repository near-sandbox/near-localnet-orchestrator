# Layer 1 + 2 Parity Checklist (System Contracts + Services Surface Area)

This document defines **our parity goal** for Layer 1 (NEAR Base) + Layer 2 (NEAR Services):

> Match the **system contracts + developer-facing service surface area** that developers expect on NEAR **mainnet/testnet**, adapted for **localnet constraints** (private RPC, no public wallet/explorer by default).

It is intentionally explicit about what is **DONE** vs **NOT DONE**.

## Definitions

- **Parity (for this project)**: the set of contracts + services that enable a typical NEAR dApp workflow without “special localnet hacks”.
- **Localnet constraint**: the NEAR RPC endpoint is VPC-only; external access is via SSM port-forwarding or in-VPC services.

## Current status (high-level)

- **Layer 1**: ✅ Deployed NEAR node + deterministic `.localnet` registrar/root account support.
- **Layer 2**: ✅ Faucet works + ✅ core contracts deployed under `.localnet` via an SSM Command document.

See the latest verification checkpoint:
- `docs/CHECKPOINT_2025-12-31T03-45Z.md`

---

## A) Account namespaces and registrar-like behavior

- **`localnet` root account exists in genesis**: ✅ DONE  
  Enables `.localnet` accounts like `alice.localnet`.
- **Create `.localnet` accounts via a supported mechanism**:
  - **Faucet Lambda createAccount**: ✅ DONE (works for `alice.localnet`)
  - **“Helper-like” account creator service (HTTP)**: ❌ NOT DONE  
    (mainnet/testnet have helper-style flows; localnet should expose an equivalent for dev UX)
- **Deterministic / documented key management**:
  - Root account key stored in SSM: ✅ DONE (`/near-localnet/localnet-account-key`)
  - Rotation story / multi-env separation: ❌ NOT DONE (policy + tooling)

## B) Core “system contracts” developers expect

Source of truth for the code we deploy from:
- `near/core-contracts` (we currently deploy from this repo inside the VPC)

### Currently deployed under `.localnet`

- **wNEAR** (`wrap.localnet`): ✅ DONE  
  Deployed + initialized.
- **staking-pool-factory** (`poolv1.localnet`): ✅ DONE  
  Deployed + initialized.
- **staking pool whitelist** (`whitelist.localnet`): ✅ DONE  
  Deployed + initialized.

### Important system contracts still missing (from mainnet/testnet expectations)

The following are **not yet deployed/verified in localnet** (but are commonly present/used on NEAR networks):

- **Multisig / multisig-factory**: ❌ NOT DONE  
  Used in many operational and DAO workflows.
- **Lockup / lockup-factory**: ❌ NOT DONE  
  Common in vesting + distribution workflows.
- **Social DB contract (NEAR Social)**: ❌ NOT DONE  
  Used by ecosystem apps; testnet/mainnet have well-known accounts.
- **Linkdrop / linkdrop-like flows**: ❌ NOT DONE  
  Often used in onboarding and “create account + claim” flows.
- **Any other “well-known” ecosystem system accounts** (explicitly enumerated): ❌ NOT DONE  
  We need an authoritative list for “what we consider required for parity”.

## C) Developer-facing services that typically exist on mainnet/testnet

### Present in our Layer 2

- **Faucet**: ✅ DONE (Lambda)  
  Can send tokens and create accounts.
- **Core-contract deploy mechanism**: ✅ DONE  
  Implemented as:
  - Custom SSM Command document: `near-localnet-deploy-core-contracts`
  - Uses `near-cli-rs` non-interactive commands

### Missing services for parity

- **Wallet UX** (myNEARWallet style) for localnet: ❌ NOT DONE  
  Options: host a localnet wallet UI with custom RPC, or provide a dev-only flow.
- **Explorer** (tx/account viewing): ❌ NOT DONE  
  Options: lightweight explorer, or integrate an indexer + UI.
- **Helper service equivalent** (account creation / linkdrop flows): ❌ NOT DONE
- **Indexer API / archival access**: ❌ NOT DONE  
  Needed for many apps; localnet can run a simplified indexer.
- **Relayer / meta-tx relayer** (where applicable): ❌ NOT DONE

## D) Operational parity (still within Layers 1–2)

- **Health checks**:
  - RPC `/status` from inside VPC: ✅ DONE
  - Layer 2 “core contracts exist” check as part of deploy: ✅ DONE (via SSM doc)
- **Repeatable bootstrap**:
  - Fresh Layer 1 deploy produces `.localnet` root + SSM keys: ✅ DONE
  - Fresh Layer 2 deploy produces faucet + system contracts: ✅ DONE
- **Observability (dashboards/alarms)**:
  - Layer 1 basic CloudWatch dashboard exists: ✅ DONE (sync stack)
  - Layer 2 monitoring/alerts: ❌ NOT DONE (define what we need)

---

## What “100% parity” would mean next (explicit TODO list)

To reach “system contracts + services surface area parity” we still need to:

1. **Define the required system accounts/contracts list** (canonical list for our project).
2. **Deploy/verify additional core contracts** beyond wNEAR/whitelist/poolv1:
   - lockup, multisig, etc.
3. **Add a helper-like service** for account creation and onboarding flows.
4. **Add a wallet and explorer story** (even if dev-only / minimal).
5. **Add indexer support** (or an alternative API surface) for apps that require historical queries.


