/**
 * Core TypeScript interfaces for the NEAR Simulators Orchestrator
 */

export interface LayerConfig {
  enabled: boolean;
  depends_on?: string[];
  source: {
    repo_url: string;
    branch: string;
    cdk_path?: string;
    script_path?: string;
  };
  config: Record<string, any>;
}

export interface GlobalConfig {
  aws_profile: string;
  aws_region: string;
  aws_account: string;
  workspace_root: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  continue_on_error: boolean;
}

export interface SimulatorsConfig {
  global: GlobalConfig;
  layers: Record<string, LayerConfig>;
}

export interface LayerOutput {
  layer_name: string;
  deployed: boolean;
  outputs: Record<string, string>;
  timestamp: string;
}

export interface DeploymentState {
  layers: Record<string, LayerOutput>;
  timestamp: string;
  version: string;
}

export interface VerifyResult {
  skip: boolean;
  reason?: string;
  existingOutput?: LayerOutput;
}

export interface DeployResult {
  success: boolean;
  stacks?: string[];
  error?: string;
  duration?: number;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  response_time?: number;
  error?: string;
}

export interface CloudFormationOutput {
  OutputKey: string;
  OutputValue: string;
  Description?: string;
  ExportName?: string;
}

export interface CloudFormationStack {
  StackName: string;
  StackStatus: string;
  Outputs?: CloudFormationOutput[];
  LastUpdatedTime?: string;
}
