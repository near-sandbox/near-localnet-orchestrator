/**
 * Zod schemas for configuration validation
 */
import { z } from 'zod';
declare const LayerSourceSchema: z.ZodEffects<z.ZodObject<{
    repo_url: z.ZodString;
    branch: z.ZodDefault<z.ZodString>;
    cdk_path: z.ZodOptional<z.ZodString>;
    script_path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    repo_url: string;
    branch: string;
    cdk_path?: string | undefined;
    script_path?: string | undefined;
}, {
    repo_url: string;
    branch?: string | undefined;
    cdk_path?: string | undefined;
    script_path?: string | undefined;
}>, {
    repo_url: string;
    branch: string;
    cdk_path?: string | undefined;
    script_path?: string | undefined;
}, {
    repo_url: string;
    branch?: string | undefined;
    cdk_path?: string | undefined;
    script_path?: string | undefined;
}>;
declare const LayerConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    source: z.ZodEffects<z.ZodObject<{
        repo_url: z.ZodString;
        branch: z.ZodDefault<z.ZodString>;
        cdk_path: z.ZodOptional<z.ZodString>;
        script_path: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repo_url: string;
        branch: string;
        cdk_path?: string | undefined;
        script_path?: string | undefined;
    }, {
        repo_url: string;
        branch?: string | undefined;
        cdk_path?: string | undefined;
        script_path?: string | undefined;
    }>, {
        repo_url: string;
        branch: string;
        cdk_path?: string | undefined;
        script_path?: string | undefined;
    }, {
        repo_url: string;
        branch?: string | undefined;
        cdk_path?: string | undefined;
        script_path?: string | undefined;
    }>;
    config: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    source: {
        repo_url: string;
        branch: string;
        cdk_path?: string | undefined;
        script_path?: string | undefined;
    };
    config: Record<string, any>;
    depends_on?: string[] | undefined;
}, {
    source: {
        repo_url: string;
        branch?: string | undefined;
        cdk_path?: string | undefined;
        script_path?: string | undefined;
    };
    config: Record<string, any>;
    enabled?: boolean | undefined;
    depends_on?: string[] | undefined;
}>;
declare const GlobalConfigSchema: z.ZodObject<{
    aws_profile: z.ZodString;
    aws_region: z.ZodDefault<z.ZodString>;
    aws_account: z.ZodString;
    workspace_root: z.ZodDefault<z.ZodString>;
    log_level: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
    continue_on_error: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    aws_profile: string;
    aws_region: string;
    aws_account: string;
    workspace_root: string;
    log_level: "debug" | "info" | "warn" | "error";
    continue_on_error: boolean;
}, {
    aws_profile: string;
    aws_account: string;
    aws_region?: string | undefined;
    workspace_root?: string | undefined;
    log_level?: "debug" | "info" | "warn" | "error" | undefined;
    continue_on_error?: boolean | undefined;
}>;
export declare const SimulatorsConfigSchema: z.ZodObject<{
    global: z.ZodObject<{
        aws_profile: z.ZodString;
        aws_region: z.ZodDefault<z.ZodString>;
        aws_account: z.ZodString;
        workspace_root: z.ZodDefault<z.ZodString>;
        log_level: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
        continue_on_error: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        aws_profile: string;
        aws_region: string;
        aws_account: string;
        workspace_root: string;
        log_level: "debug" | "info" | "warn" | "error";
        continue_on_error: boolean;
    }, {
        aws_profile: string;
        aws_account: string;
        aws_region?: string | undefined;
        workspace_root?: string | undefined;
        log_level?: "debug" | "info" | "warn" | "error" | undefined;
        continue_on_error?: boolean | undefined;
    }>;
    layers: z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        source: z.ZodEffects<z.ZodObject<{
            repo_url: z.ZodString;
            branch: z.ZodDefault<z.ZodString>;
            cdk_path: z.ZodOptional<z.ZodString>;
            script_path: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            repo_url: string;
            branch: string;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        }, {
            repo_url: string;
            branch?: string | undefined;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        }>, {
            repo_url: string;
            branch: string;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        }, {
            repo_url: string;
            branch?: string | undefined;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        }>;
        config: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        source: {
            repo_url: string;
            branch: string;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        };
        config: Record<string, any>;
        depends_on?: string[] | undefined;
    }, {
        source: {
            repo_url: string;
            branch?: string | undefined;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        };
        config: Record<string, any>;
        enabled?: boolean | undefined;
        depends_on?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    global: {
        aws_profile: string;
        aws_region: string;
        aws_account: string;
        workspace_root: string;
        log_level: "debug" | "info" | "warn" | "error";
        continue_on_error: boolean;
    };
    layers: Record<string, {
        enabled: boolean;
        source: {
            repo_url: string;
            branch: string;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        };
        config: Record<string, any>;
        depends_on?: string[] | undefined;
    }>;
}, {
    global: {
        aws_profile: string;
        aws_account: string;
        aws_region?: string | undefined;
        workspace_root?: string | undefined;
        log_level?: "debug" | "info" | "warn" | "error" | undefined;
        continue_on_error?: boolean | undefined;
    };
    layers: Record<string, {
        source: {
            repo_url: string;
            branch?: string | undefined;
            cdk_path?: string | undefined;
            script_path?: string | undefined;
        };
        config: Record<string, any>;
        enabled?: boolean | undefined;
        depends_on?: string[] | undefined;
    }>;
}>;
export type LayerSource = z.infer<typeof LayerSourceSchema>;
export type LayerConfig = z.infer<typeof LayerConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type SimulatorsConfig = z.infer<typeof SimulatorsConfigSchema>;
export declare function validateConfig(config: unknown): SimulatorsConfig;
export declare function validateConfigSafe(config: unknown): {
    success: boolean;
    data?: SimulatorsConfig;
    error?: z.ZodError;
};
export {};
//# sourceMappingURL=schema.d.ts.map