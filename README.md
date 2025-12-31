# NEAR Localnet Orchestrator

A TypeScript-based master orchestrator for managing layered NEAR Protocol simulation infrastructure deployments. This tool enables a "lego-block" approach to deploying complex multi-service NEAR ecosystems with intelligent health checking and dependency management.

> **Current work**: Resume from `docs/CHECKPOINT_2025-12-31T03-45Z.md`. Archived docs are in `docs/archive/2025-12-30-node0-to-localnet/`.

## 🎯 Overview

The orchestrator manages a **5-layer simulation stack** that can be deployed independently or together:

| Layer | Name | Repository | Purpose |
|-------|------|------------|---------|
| **1** | NEAR Base | AWSNodeRunner | NEAR Protocol RPC node infrastructure |
| **2** | NEAR Services | near-localnet-services | Faucet, utilities, and helper services |
| **3** | Chain Signatures | cross-chain-simulator | MPC infrastructure + Chain Signatures API |
| **4** | Intents Protocol | near-intents-simulator | 1Click API for cross-chain swaps |
| **5** | User Applications | (your app) | dApps built on the stack |

Each layer can either be deployed from scratch or connect to existing infrastructure, making it perfect for development, testing, and production scenarios.

> **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed layer descriptions and dependencies.

### Optional: Auxiliary Chain Runners

The orchestrator can also manage **auxiliary, non-NEAR chain runners** (for end-to-end tests), such as an `ethereum_localnet` deployment. These are **not part of the 5-layer NEAR stack**; they are supporting infrastructure for cross-chain testing.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- Git

### Installation

```bash
# Clone the orchestrator
git clone <orchestrator-repo-url>
cd near-localnet-orchestrator

# Install dependencies
npm install

# Build the project
npm run build
```

### Basic Usage

```bash
# Deploy all enabled layers
npx near-orchestrator deploy

# Deploy specific layers
npx near-orchestrator deploy near_base near_services chain_signatures

# Check layer health without deploying
npx near-orchestrator verify

# Destroy deployed infrastructure
npx near-orchestrator destroy

# View deployment status
npx near-orchestrator status
```

## ⚙️ Configuration

The orchestrator uses a YAML configuration file (`config/simulators.config.yaml`) to define the deployment topology:

```yaml
global:
  aws_profile: "shai-sandbox-profile"
  aws_region: "us-east-1"
  aws_account: "311843862895"
  workspace_root: "./workspace"
  log_level: "info"
  continue_on_error: false

layers:
  # Layer 1: NEAR Base - Blockchain foundation
  near_base:
    enabled: true
    depends_on: []
    source:
      repo_url: "https://github.com/near-sandbox/AWSNodeRunner"
      branch: "main"
      cdk_path: "lib/near"
    config:
      existing_rpc_url: null  # e.g., "http://1.2.3.4:3030"
      instance_type: "m7a.2xlarge"
      near_version: "2.10.1"
      network_id: "localnet"

  # Layer 2: NEAR Services - Faucet and utilities
  near_services:
    enabled: true
    depends_on: ["near_base"]
    source:
      repo_url: "https://github.com/near-sandbox/near-localnet-services"
      branch: "main"
      cdk_path: "faucet/cdk"
    config:
      deploy_faucet: true
      master_account_id: "node0"

  # Layer 3: Chain Signatures - MPC infrastructure + signing API
  chain_signatures:
    enabled: true
    depends_on: ["near_services"]
    source:
      repo_url: "https://github.com/near-sandbox/cross-chain-simulator"
      branch: "main"
      script_path: "scripts/start-localnet.sh"
    config:
      # MPC configuration (embedded in this layer)
      mpc_node_count: 3
      mpc_contract_id: "v1.signer.node0"
      mpc_docker_image: "nearone/mpc-node:3.1.0"
      auto_generate_keys: true
      # Chain Signatures configuration
      deploy_v1_signer_contract: true
      initialize_mpc: true

  # Layer 4: Intents Protocol - 1Click API simulation
  intents_protocol:
    enabled: true
    depends_on: ["chain_signatures"]
    source:
      repo_url: "https://github.com/near-sandbox/near-intents-simulator"
      branch: "main"
      script_path: "scripts/deploy-intents.ts"
    config:
      mode: "simulator"
```

### Configuration Options

#### Global Settings

- `aws_profile`: AWS CLI profile name
- `aws_region`: AWS region for deployments
- `aws_account`: AWS account ID
- `workspace_root`: Directory for cloned repositories
- `log_level`: Logging verbosity (`debug`, `info`, `warn`, `error`)
- `continue_on_error`: Continue deployment if a layer fails

#### Layer Configuration

Each layer supports:

- `enabled`: Whether to include this layer in operations
- `depends_on`: Array of layer names this layer depends on
- `source`: Repository and deployment information
  - `repo_url`: Git repository URL
  - `branch`: Git branch to use
  - `cdk_path`: Relative path to CDK infrastructure (for CDK-based layers)
  - `script_path`: Relative path to deployment script (for script-based layers)
- `config`: Layer-specific configuration options

### Using Existing Infrastructure

To connect to existing infrastructure instead of deploying:

```yaml
layers:
  near_base:
    config:
      existing_rpc_url: "http://your-existing-near-node:3030"

  chain_signatures:
    config:
      existing_mpc_nodes:
        - "http://mpc-node-1:3030"
        - "http://mpc-node-2:3030"
        - "http://mpc-node-3:3030"
```

## 📋 Commands

### Deploy

Deploy simulation layers in dependency order:

```bash
# Deploy all enabled layers (1 → 2 → 3 → 4)
npx near-orchestrator deploy

# Deploy specific layers
npx near-orchestrator deploy near_base near_services chain_signatures

# Force deployment even if layers appear healthy
npx near-orchestrator deploy --force

# Dry run (validate configuration without deploying)
npx near-orchestrator deploy --dry-run
```

### Verify

Check the health of layers without deploying:

```bash
# Verify all enabled layers
npx near-orchestrator verify

# Verify specific layers
npx near-orchestrator verify near_base near_services chain_signatures
```

### Destroy

Remove deployed infrastructure:

```bash
# Destroy all deployed layers (reverse dependency order)
npx near-orchestrator destroy

# Destroy specific layers
npx near-orchestrator destroy near_base

# Force destruction without confirmation
npx near-orchestrator destroy --force
```

### Status

View current deployment status:

```bash
npx near-orchestrator status
```

Example output:
```
📊 Deployment Status
Last updated: 2024-12-22T10:30:00.000Z

✅ Layer 1: near_base (Deployed)
   rpc_url: http://10.0.55.70:3030
   network_id: localnet

✅ Layer 2: near_services (Deployed)
   faucet_endpoint: https://xxx.lambda-url.us-east-1.on.aws

✅ Layer 3: chain_signatures (Deployed)
   mpc_node_count: 3
   contract_id: v1.signer.node0

✅ Layer 4: intents_protocol (Deployed)
   mode: simulator
   supported_chains: [near, ethereum, bitcoin]
```

### List

Show available layers:

```bash
npx near-orchestrator list
```

## 🔧 Advanced Usage

### Custom Configuration File

Use a custom configuration file:

```bash
npx near-orchestrator --config /path/to/custom/config.yaml deploy
```

### Environment Variables

Override configuration with environment variables:

```bash
export AWS_PROFILE=my-profile
export AWS_REGION=us-west-2
npx near-orchestrator deploy
```

### Logging

Control logging verbosity:

```bash
# Debug logging
npx near-orchestrator --log-level debug deploy

# Quiet logging
npx near-orchestrator --log-level error deploy
```

### Continue on Error

Continue deployment even if individual layers fail:

```bash
npx near-orchestrator --continue-on-error deploy
```

## 🏗️ Architecture

The orchestrator follows a layered architecture:

1. **Configuration Layer**: YAML-based configuration with validation
2. **Orchestration Layer**: Dependency resolution and execution flow
3. **Layer Abstraction**: Standardized interface for different deployment types
4. **Utility Layer**: Git management, AWS operations, health checking

### Layer Types

- **CDK Layers**: Use AWS CDK for infrastructure deployment (NEAR Base, NEAR Services)
- **Script Layers**: Execute custom deployment scripts (Chain Signatures, Intents Protocol)
- **Health-Checked Layers**: Can verify existing infrastructure instead of deploying

### Layer Dependencies

```
Layer 1: near_base       (foundation - no dependencies)
    ↓
Layer 2: near_services   (depends on near_base)
    ↓
Layer 3: chain_signatures (depends on near_services, includes MPC)
    ↓
Layer 4: intents_protocol (depends on chain_signatures)
    ↓
Layer 5: user_applications (depends on intents_protocol)
```

### Dependency Resolution

Layers are deployed in dependency order using topological sorting. The orchestrator:

1. Parses `depends_on` relationships
2. Validates no circular dependencies exist
3. Executes layers in the correct order
4. Passes outputs between dependent layers

## 🐛 Troubleshooting

### Common Issues

#### AWS Credentials

```
Error: Unable to locate credentials
```

**Solution**: Configure AWS CLI credentials:
```bash
aws configure --profile your-profile
```

#### Repository Access

```
Error: Repository clone failed
```

**Solution**: Ensure repository URLs are accessible and credentials are configured for private repositories.

#### CDK Deployment Failures

```
Error: CDK deployment failed
```

**Solution**: Check CloudFormation events in AWS Console and review deployment logs in the `logs/` directory.

#### Health Check Failures

```
Error: Layer verification failed
```

**Solution**: Check network connectivity and ensure services are running on expected ports.

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
npx near-orchestrator --log-level debug deploy
```

### Logs

All operations are logged to:
- Console (based on log level)
- `logs/orchestrator.log` (all logs)
- `logs/orchestrator-error.log` (errors only)

## 🔒 Security

- AWS credentials are handled via AWS CLI profiles
- No sensitive data is stored in configuration files
- Repository access uses standard Git authentication
- All infrastructure follows AWS security best practices

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

### Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build project
npm run build

# Run in development mode
npm run dev
```

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review logs in the `logs/` directory
3. Open an issue on GitHub
4. Check AWS service status for infrastructure-related issues
