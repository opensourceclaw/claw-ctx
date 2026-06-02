"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBudgetManager = exports.MockCIProvider = exports.CIInjector = exports.MockCrossDomainProvider = exports.CrossDomainInjector = exports.MockGovernanceProvider = exports.GovernanceInjector = exports.MockRLProvider = exports.RLInjector = exports.ConfidenceGate = void 0;
/**
 * claw-ctx v3.0.0 Plugin for OpenClaw
 * Standalone Context Engine with claw-mem integration,
 * C2 confidence gating, RL experience injection, governance signal pass-through,
 * and cross-domain signal injection.
 */
const engine_1 = require("./engine");
var confidence_gate_1 = require("./confidence_gate");
Object.defineProperty(exports, "ConfidenceGate", { enumerable: true, get: function () { return confidence_gate_1.ConfidenceGate; } });
var rl_injector_1 = require("./rl_injector");
Object.defineProperty(exports, "RLInjector", { enumerable: true, get: function () { return rl_injector_1.RLInjector; } });
Object.defineProperty(exports, "MockRLProvider", { enumerable: true, get: function () { return rl_injector_1.MockRLProvider; } });
var governance_injector_1 = require("./governance_injector");
Object.defineProperty(exports, "GovernanceInjector", { enumerable: true, get: function () { return governance_injector_1.GovernanceInjector; } });
Object.defineProperty(exports, "MockGovernanceProvider", { enumerable: true, get: function () { return governance_injector_1.MockGovernanceProvider; } });
var cross_domain_injector_1 = require("./cross_domain_injector");
Object.defineProperty(exports, "CrossDomainInjector", { enumerable: true, get: function () { return cross_domain_injector_1.CrossDomainInjector; } });
Object.defineProperty(exports, "MockCrossDomainProvider", { enumerable: true, get: function () { return cross_domain_injector_1.MockCrossDomainProvider; } });
var ci_injector_1 = require("./ci_injector");
Object.defineProperty(exports, "CIInjector", { enumerable: true, get: function () { return ci_injector_1.CIInjector; } });
Object.defineProperty(exports, "MockCIProvider", { enumerable: true, get: function () { return ci_injector_1.MockCIProvider; } });
var token_budget_manager_1 = require("./token_budget_manager");
Object.defineProperty(exports, "TokenBudgetManager", { enumerable: true, get: function () { return token_budget_manager_1.TokenBudgetManager; } });
const plugin = {
    id: "claw-ctx",
    name: "Claw Context Engine",
    description: "Context Engine with C2 gating, RL injection, governance signals, cross-domain injection, and CI/CD signals for OpenClaw agents",
    version: "4.0.0",
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
