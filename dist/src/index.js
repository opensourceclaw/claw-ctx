"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * claw-ctx v1.0.0 Plugin for OpenClaw
 * Standalone Context Engine with claw-mem integration.
 */
const engine_1 = require("./engine");
const plugin = {
    id: "claw-ctx",
    name: "Claw Context Engine",
    description: "Standalone Context Engine with memory integration for OpenClaw agents",
    version: "1.0.0",
    kind: "context-engine",
    register(api) {
        const config = {
            workspaceDir: api.pluginConfig?.workspaceDir || api.config?.workspaceDir,
            topK: api.pluginConfig?.topK ?? 10,
            debug: api.pluginConfig?.debug ?? false,
        };
        try {
            api.registerContextEngine("claw-ctx", (_ctx) => {
                return (0, engine_1.createClawContextEngine)(config, api.logger);
            });
            api.logger.info("[claw-ctx] v1.0.0 registered");
        }
        catch (e) {
            api.logger.warn("[claw-ctx] registration failed:", e);
        }
    },
};
exports.default = plugin;
