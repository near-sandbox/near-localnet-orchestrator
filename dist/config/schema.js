"use strict";
/**
 * Zod schemas for configuration validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulatorsConfigSchema = void 0;
exports.validateConfig = validateConfig;
exports.validateConfigSafe = validateConfigSafe;
const zod_1 = require("zod");
// Layer source configuration
const LayerSourceSchema = zod_1.z.object({
    repo_url: zod_1.z.string().url(),
    branch: zod_1.z.string().default('main'),
    cdk_path: zod_1.z.string().optional(),
    script_path: zod_1.z.string().optional(),
}).refine((data) => data.cdk_path || data.script_path, {
    message: 'Either cdk_path or script_path must be provided',
});
// Individual layer configuration
const LayerConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    depends_on: zod_1.z.array(zod_1.z.string()).optional(),
    source: LayerSourceSchema,
    config: zod_1.z.record(zod_1.z.any()),
});
// Global configuration
const GlobalConfigSchema = zod_1.z.object({
    aws_profile: zod_1.z.string(),
    aws_region: zod_1.z.string().default('us-east-1'),
    aws_account: zod_1.z.string(),
    workspace_root: zod_1.z.string().default('./workspace'),
    log_level: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    continue_on_error: zod_1.z.boolean().default(false),
});
// Main configuration schema
exports.SimulatorsConfigSchema = zod_1.z.object({
    global: GlobalConfigSchema,
    layers: zod_1.z.record(LayerConfigSchema),
});
// Validation helper functions
function validateConfig(config) {
    return exports.SimulatorsConfigSchema.parse(config);
}
function validateConfigSafe(config) {
    const result = exports.SimulatorsConfigSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    else {
        return { success: false, error: result.error };
    }
}
//# sourceMappingURL=schema.js.map