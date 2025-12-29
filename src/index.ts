#!/usr/bin/env node

/**
 * NEAR Simulators Orchestrator CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Orchestrator } from './Orchestrator';
import { Logger } from './utils/Logger';

const program = new Command();

program
  .name('near-orchestrator')
  .description('Master orchestrator for NEAR Protocol simulation layers')
  .version('1.0.0');

// Global options
program
  .option('-c, --config <path>', 'path to configuration file', 'config/simulators.config.yaml')
  .option('-l, --log-level <level>', 'log level (debug, info, warn, error)', 'info')
  .option('--dry-run', 'run in dry-run mode (no actual deployments)', false)
  .option('--continue-on-error', 'continue execution even if a layer fails', false);

// Deploy command
program
  .command('deploy')
  .description('deploy simulation layers')
  .argument('[layers...]', 'specific layers to deploy (default: all enabled)')
  .option('-f, --force', 'force deployment even if layers are healthy', false)
  .action(async (layers: string[], options: any) => {
    const globalOptions = program.opts();
    await runCommand('deploy', { layers, ...options, ...globalOptions });
  });

// Verify command
program
  .command('verify')
  .description('verify layer health without deploying')
  .argument('[layers...]', 'specific layers to verify (default: all enabled)')
  .action(async (layers: string[]) => {
    const globalOptions = program.opts();
    await runCommand('verify', { layers, ...globalOptions });
  });

// Destroy command
program
  .command('destroy')
  .description('destroy deployed layers')
  .argument('[layers...]', 'specific layers to destroy (default: all deployed)')
  .option('-f, --force', 'force destruction without confirmation', false)
  .action(async (layers: string[], options: any) => {
    const globalOptions = program.opts();

    // Safety check for destroy
    if (!options.force && !globalOptions.dryRun) {
      console.log(chalk.yellow('⚠️  WARNING: This will destroy deployed infrastructure!'));
      console.log(chalk.yellow('   This action cannot be undone.'));

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.red('   Are you sure? Type "yes" to continue: '), resolve);
      });

      rl.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log(chalk.blue('ℹ️  Destroy cancelled'));
        process.exit(0);
      }
    }

    await runCommand('destroy', { layers, ...options, ...globalOptions });
  });

// Status command
program
  .command('status')
  .description('show current deployment status')
  .action(async () => {
    const globalOptions = program.opts();
    await runCommand('status', globalOptions);
  });

// List command
program
  .command('list')
  .description('list available layers')
  .action(async () => {
    const globalOptions = program.opts();
    await runCommand('list', globalOptions);
  });

// Main command execution
async function runCommand(command: string, options: any): Promise<void> {
  const logger = new Logger('CLI');

  try {
    // Validate log level
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(options.logLevel)) {
      throw new Error(`Invalid log level: ${options.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
    }

    // Create orchestrator
    const orchestrator = new Orchestrator({
      configPath: options.config,
      logLevel: options.logLevel,
      dryRun: options.dryRun,
      continueOnError: options.continueOnError,
      awsProfile: 'shai-sandbox-profile', // TODO: Make configurable
      awsRegion: 'us-east-1', // TODO: Make configurable
    });

    // Initialize
    await orchestrator.initialize();

    // Execute command
    switch (command) {
      case 'deploy':
        await handleDeploy(orchestrator, options);
        break;

      case 'verify':
        await handleVerify(orchestrator, options);
        break;

      case 'destroy':
        await handleDestroy(orchestrator, options);
        break;

      case 'status':
        await handleStatus(orchestrator);
        break;

      case 'list':
        await handleList(orchestrator);
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

  } catch (error: any) {
    logger.error('Command execution failed', error);

    console.log('');
    console.log(chalk.red('❌ Error:'), error.message);

    if (options.logLevel === 'debug' && error.stack) {
      console.log('');
      console.log(chalk.gray('Stack trace:'));
      console.log(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}

// Command handlers
async function handleDeploy(orchestrator: Orchestrator, options: any): Promise<void> {
  const { layers, force } = options;

  console.log(chalk.blue('🚀 Starting deployment...'));
  console.log('');

  if (layers && layers.length > 0) {
    console.log(chalk.cyan(`📋 Target layers: ${layers.join(', ')}`));
  } else {
    console.log(chalk.cyan('📋 Target: all enabled layers'));
  }

  if (options.dryRun) {
    console.log(chalk.yellow('🔍 Running in dry-run mode'));
  }

  console.log('');

  const result = await orchestrator.run(layers);

  console.log('');

  if (result.success) {
    console.log(chalk.green('✅ Deployment completed successfully!'));

    // Show summary
    const status = orchestrator.getStatus();
    const deployedLayers = Object.entries(status.layers)
      .filter(([, output]) => output.deployed)
      .map(([name]) => name);

    if (deployedLayers.length > 0) {
      console.log('');
      console.log(chalk.blue('📦 Deployed layers:'));
      deployedLayers.forEach(layer => {
        console.log(chalk.green(`   ✓ ${layer}`));
      });
    }

  } else {
    console.log(chalk.red(`❌ Deployment failed: ${result.error}`));
    process.exit(1);
  }
}

async function handleVerify(orchestrator: Orchestrator, options: any): Promise<void> {
  const { layers } = options;

  console.log(chalk.blue('🔍 Verifying layers...'));
  console.log('');

  const result = await orchestrator.verify(layers);

  console.log('');

  if (result.success) {
    const healthyLayers = Object.entries(result.results)
      .filter(([, verifyResult]) => verifyResult.skip)
      .map(([name]) => name);

    const unhealthyLayers = Object.entries(result.results)
      .filter(([, verifyResult]) => !verifyResult.skip)
      .map(([name]) => name);

    if (healthyLayers.length > 0) {
      console.log(chalk.green('✅ Healthy layers:'));
      healthyLayers.forEach(layer => {
        const reason = result.results[layer].reason || 'Already available';
        console.log(chalk.green(`   ✓ ${layer} (${reason})`));
      });
    }

    if (unhealthyLayers.length > 0) {
      console.log('');
      console.log(chalk.yellow('⚠️  Layers requiring deployment:'));
      unhealthyLayers.forEach(layer => {
        console.log(chalk.yellow(`   • ${layer}`));
      });
    }

    if (healthyLayers.length > 0 && unhealthyLayers.length === 0) {
      console.log('');
      console.log(chalk.green('🎉 All layers are healthy - no deployment needed!'));
    }

  } else {
    console.log(chalk.red('❌ Verification failed'));
    process.exit(1);
  }
}

async function handleDestroy(orchestrator: Orchestrator, options: any): Promise<void> {
  const { layers } = options;

  console.log(chalk.blue('🗑️  Starting destruction...'));
  console.log('');

  if (layers && layers.length > 0) {
    console.log(chalk.cyan(`📋 Target layers: ${layers.join(', ')}`));
  } else {
    console.log(chalk.cyan('📋 Target: all deployed layers'));
  }

  if (options.dryRun) {
    console.log(chalk.yellow('🔍 Running in dry-run mode'));
  }

  console.log('');

  const result = await orchestrator.destroy(layers);

  console.log('');

  if (result.success) {
    console.log(chalk.green('✅ Destruction completed successfully!'));
  } else {
    console.log(chalk.red(`❌ Destruction failed: ${result.error}`));
    process.exit(1);
  }
}

async function handleStatus(orchestrator: Orchestrator): Promise<void> {
  const status = orchestrator.getStatus();

  // Layer number mapping
  const layerNumbers: Record<string, number> = {
    near_base: 1,
    near_services: 2,
    chain_signatures: 3,
    intents_protocol: 4,
  };

  console.log(chalk.blue('📊 Deployment Status'));
  console.log(chalk.gray(`Last updated: ${status.timestamp}`));
  console.log('');

  if (Object.keys(status.layers).length === 0) {
    console.log(chalk.yellow('ℹ️  No layers deployed'));
    return;
  }

  for (const [layerName, output] of Object.entries(status.layers)) {
    const statusIcon = output.deployed ? chalk.green('✅') : chalk.blue('⏭️');
    const statusText = output.deployed ? 'Deployed' : 'Skipped';
    const layerNum = layerNumbers[layerName] || '?';

    console.log(`${statusIcon} Layer ${layerNum}: ${chalk.bold(layerName)} (${statusText})`);

    // Show key outputs
    const importantOutputs = ['rpc_url', 'network_id', 'mpc_node_count', 'v1_signer_contract_id', 'faucet_endpoint', 'mode'];
    const outputsToShow = Object.entries(output.outputs)
      .filter(([key]) => importantOutputs.includes(key))
      .slice(0, 4); // Limit to 4 most important

    if (outputsToShow.length > 0) {
      outputsToShow.forEach(([key, value]) => {
        console.log(chalk.gray(`   ${key}: ${value}`));
      });
    }

    console.log('');
  }
}

async function handleList(orchestrator: Orchestrator): Promise<void> {
  // 5-layer architecture
  console.log(chalk.blue('📋 Available Layers'));
  console.log('');
  console.log(chalk.gray('5-layer stack: near_base → near_services → chain_signatures → intents_protocol → user_apps'));
  console.log('');

  const layers = [
    {
      layer: 1,
      name: 'near_base',
      description: 'NEAR Protocol RPC node (Layer 1: blockchain foundation)',
      repo: 'AWSNodeRunner',
    },
    {
      layer: 2,
      name: 'near_services',
      description: 'Faucet and utility services (Layer 2: essential services)',
      repo: 'near-localnet-services',
    },
    {
      layer: 3,
      name: 'chain_signatures',
      description: 'Chain Signatures + embedded MPC infrastructure (Layer 3)',
      repo: 'cross-chain-simulator',
    },
    {
      layer: 4,
      name: 'intents_protocol',
      description: 'NEAR Intents (1Click API) simulator (Layer 4)',
      repo: 'near-intents-simulator',
    },
  ];

  layers.forEach(layer => {
    console.log(`${chalk.cyan(`Layer ${layer.layer}: ${layer.name}`)}`);
    console.log(`   ${layer.description}`);
    console.log(chalk.gray(`   Repository: ${layer.repo}`));
    console.log('');
  });

  console.log(chalk.gray('Layer 5 (user_apps) is your application - not managed by orchestrator'));
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Promise Rejection:'), reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error);
  process.exit(1);
});

// Parse command line arguments
program.parse();
