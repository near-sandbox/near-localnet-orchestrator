# Layer 1 + 2 Parity Checklist (System Contracts + Services Surface Area)

This document defines **our parity goal** for Layer 1 (NEAR Base) + Layer 2 (NEAR Services):

> Match the **system contracts + developer-facing service surface area** that developers expect on NEAR **mainnet/testnet**, adapted for **localnet constraints** (private RPC, no public wallet/explorer by default).

It is intentionally explicit about what is **DONE** vs **NOT DONE**.

## Definitions

- **Parity (for this project)**: the set of contracts + services that enable a typical NEAR dApp workflow without “special localnet hacks”.
- **Localnet constraint**: the NEAR RPC endpoint is VPC-only; external access is via SSM port-forwarding or in-VPC services.

## Scope & prioritization (important)

Not everything listed as “parity” is a **blocker** for our next milestone.

- **P0 (blocker for moving to Layer 3 / Chain Signatures)**: localnet account namespace works + Layer 2 can reliably create accounts and deploy the minimal contracts we actually use.
- **P1 (developer tooling / UX, nice-to-have)**: wallet UI, explorer UI, helper-like flows. Useful, but not required to run localnet or deploy Chain Signatures.
- **P2 (ecosystem/system-contract parity, nice-to-have unless a dependency emerges)**: multisig/lockup/social/linkdrop, etc. These exist on NEAR networks, but are only “required” here if a higher layer (e.g., MPC/Chain Signatures) actually depends on them.

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
    - Evidence (testnet + mainnet endpoints exist and expect **POST**):
      - Testnet: `https://helper.testnet.near.org/account` (GET returns `405 Allow: POST`)
      - Mainnet: `https://helper.mainnet.near.org/account` (GET returns `405 Allow: POST`)
      - Also commonly referenced: `https://helper.nearprotocol.com/account` (GET returns `405 Allow: POST`)
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

- **Multisig contract**: ❌ NOT DONE  
  Used in many operational and DAO workflows.
  - Priority: **P2** (nice-to-have unless a dependency emerges).  
    Today, our Layer 3 (Chain Signatures / MPC) deployment path deploys `v1.signer` and does **not** reference multisig/lockup contracts.
  - Evidence (official contract source code):
    - `near/core-contracts`: `multisig/` ([repo](https://github.com/near/core-contracts/tree/master/multisig))
  - Evidence (on-chain deployments we verified via public RPC):
    - Testnet has contract code at `multisig.testnet` (non-default `code_hash`):
      - Explorer: `https://explorer.testnet.near.org/accounts/multisig.testnet`
    - Mainnet: `multisig.near` exists but currently has **no contract code** (default `code_hash = 111…`):
      - Explorer: `https://explorer.near.org/accounts/multisig.near`
  - Note: We should not assume a “canonical multisig contract account id” on mainnet; we need to define what parity means here (contract availability vs a specific well-known account).

- **Lockup contract**: ❌ NOT DONE  
  Common in vesting + distribution workflows.
  - Priority: **P2** (nice-to-have for localnet; not a current blocker for Chain Signatures).
  - Evidence (official contract source code):
    - `near/core-contracts`: `lockup/` ([repo](https://github.com/near/core-contracts/tree/master/lockup))
  - Evidence (on-chain deployments we verified via public RPC):
    - Mainnet has contract code at `lockup.near` (non-default `code_hash`):
      - Explorer: `https://explorer.near.org/accounts/lockup.near`
    - Testnet: `lockup.testnet` exists but currently has **no contract code** (default `code_hash = 111…`):
      - Explorer: `https://explorer.testnet.near.org/accounts/lockup.testnet`
  - Note: Like multisig, testnet may not use a single canonical lockup account; we should define what we require for parity.
- **Social DB contract (NEAR Social)**: ❌ NOT DONE  
  Used by ecosystem apps; testnet/mainnet have well-known accounts.
- Priority: **P2** (ecosystem feature; not required for localnet + Chain Signatures).
- Evidence (on-chain deployments we verified via public RPC):
  - Mainnet: `social.near` (contract code present)
    - Explorer: `https://explorer.near.org/accounts/social.near`
  - Testnet: `v1.social08.testnet` (contract code present)
    - Explorer: `https://explorer.testnet.near.org/accounts/v1.social08.testnet`
- **Linkdrop / linkdrop-like flows**: ❌ NOT DONE  
  Often used in onboarding and “create account + claim” flows.
- Priority: **P2** (onboarding UX; not required for localnet + Chain Signatures).
- Evidence (on-chain deployments we verified via public RPC):
  - Mainnet: `linkdrop.near` (contract code present)
    - Explorer: `https://explorer.near.org/accounts/linkdrop.near`
  - Testnet: `linkdrop.testnet` (contract code present)
    - Explorer: `https://explorer.testnet.near.org/accounts/linkdrop.testnet`
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
  - Priority: **P1** (developer tooling; not required for localnet correctness).
  - Evidence (canonical wallets):
    - Mainnet: `https://app.mynearwallet.com`
    - Testnet: `https://testnet.mynearwallet.com`
- **Explorer** (tx/account viewing): ❌ NOT DONE  
  Options: lightweight explorer, or integrate an indexer + UI.
  - Priority: **P1** (developer tooling; not required for localnet correctness).
  - Evidence (canonical explorers):
    - Mainnet: `https://explorer.near.org`
    - Testnet: `https://explorer.testnet.near.org`
- **Helper service equivalent** (account creation / linkdrop flows): ❌ NOT DONE
- **Indexer API / archival access**: ❌ NOT DONE  
  Not required for a typical localnet (you can query RPC directly); can be added later for UX / historical queries.
  - Priority: **P1/P2 (low)** for localnet.
  - Evidence (public archival RPC endpoints exist):
    - Mainnet: `https://archival-rpc.mainnet.near.org`
    - Testnet: `https://archival-rpc.testnet.near.org`
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
   - lockup, multisig, etc. (only if we decide they’re required for our higher-layer workflows)
3. **Add a helper-like service** for account creation and onboarding flows.
4. **Add a wallet and explorer story** (even if dev-only / minimal).
5. **Optionally add indexer support** (or an alternative API surface) for apps that require historical queries.


