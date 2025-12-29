/**
 * AWS CDK deployment manager
 */
import { Logger } from '../utils/Logger';
export interface CdkDeployOptions {
    profile?: string;
    region?: string;
    stacks?: string[];
    context?: Record<string, string>;
    timeout?: number;
    requireApproval?: 'never' | 'any-change' | 'broadening';
}
export interface CdkDeployResult {
    success: boolean;
    deployedStacks: string[];
    outputs?: Record<string, any>;
    error?: string;
    duration: number;
}
export declare class CdkManager {
    private logger;
    private executor;
    constructor(logger?: Logger);
    /**
     * Deploy CDK stacks
     */
    deploy(cdkPath: string, options?: CdkDeployOptions): Promise<CdkDeployResult>;
    /**
     * Destroy CDK stacks
     */
    destroy(cdkPath: string, options?: {
        profile?: string;
        region?: string;
        stacks?: string[];
        force?: boolean;
    }): Promise<{
        success: boolean;
        destroyedStacks: string[];
        error?: string;
        duration: number;
    }>;
    /**
     * Synthesize CDK stacks (validate CloudFormation templates)
     */
    synth(cdkPath: string, options?: {
        profile?: string;
        region?: string;
        stacks?: string[];
        context?: Record<string, string>;
    }): Promise<{
        success: boolean;
        error?: string;
        duration: number;
    }>;
    /**
     * Bootstrap CDK environment if needed
     */
    bootstrap(cdkPath: string, options?: {
        profile?: string;
        region?: string;
        account?: string;
    }): Promise<{
        success: boolean;
        error?: string;
        duration: number;
    }>;
}
//# sourceMappingURL=CdkManager.d.ts.map