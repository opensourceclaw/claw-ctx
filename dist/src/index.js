"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DRIFT_BUDGET_CONFIG = exports.DriftBudgetLinker = exports.SessionStateExtractor = exports.TASK_BUDGET_PROFILES = exports.DEFAULT_BUDGET_CONFIG = exports.QualityBasedAdjuster = exports.TaskTypeDetector = exports.SmartBudgetAllocator = exports.DEFAULT_DRIFT_CONFIG = exports.TopicModel = exports.DriftDetector = exports.createTokenCounter = exports.FallbackCounter = exports.TiktokenCounter = exports.TokenBudgetManager = exports.MockCIProvider = exports.CIInjector = exports.MockCrossDomainProvider = exports.CrossDomainInjector = exports.MockGovernanceProvider = exports.GovernanceInjector = exports.MockRLProvider = exports.RLInjector = exports.ConfidenceGate = void 0;
/**
 * claw-ctx v4.2.2 Plugin for OpenClaw
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
var token_counter_1 = require("./token-counter");
Object.defineProperty(exports, "TiktokenCounter", { enumerable: true, get: function () { return token_counter_1.TiktokenCounter; } });
Object.defineProperty(exports, "FallbackCounter", { enumerable: true, get: function () { return token_counter_1.FallbackCounter; } });
Object.defineProperty(exports, "createTokenCounter", { enumerable: true, get: function () { return token_counter_1.createTokenCounter; } });
var drift_detector_1 = require("./drift-detector");
Object.defineProperty(exports, "DriftDetector", { enumerable: true, get: function () { return drift_detector_1.DriftDetector; } });
Object.defineProperty(exports, "TopicModel", { enumerable: true, get: function () { return drift_detector_1.TopicModel; } });
Object.defineProperty(exports, "DEFAULT_DRIFT_CONFIG", { enumerable: true, get: function () { return drift_detector_1.DEFAULT_DRIFT_CONFIG; } });
var smart_budget_allocator_1 = require("./smart-budget-allocator");
Object.defineProperty(exports, "SmartBudgetAllocator", { enumerable: true, get: function () { return smart_budget_allocator_1.SmartBudgetAllocator; } });
Object.defineProperty(exports, "TaskTypeDetector", { enumerable: true, get: function () { return smart_budget_allocator_1.TaskTypeDetector; } });
Object.defineProperty(exports, "QualityBasedAdjuster", { enumerable: true, get: function () { return smart_budget_allocator_1.QualityBasedAdjuster; } });
Object.defineProperty(exports, "DEFAULT_BUDGET_CONFIG", { enumerable: true, get: function () { return smart_budget_allocator_1.DEFAULT_BUDGET_CONFIG; } });
Object.defineProperty(exports, "TASK_BUDGET_PROFILES", { enumerable: true, get: function () { return smart_budget_allocator_1.TASK_BUDGET_PROFILES; } });
var session_state_extractor_1 = require("./session-state-extractor");
Object.defineProperty(exports, "SessionStateExtractor", { enumerable: true, get: function () { return session_state_extractor_1.SessionStateExtractor; } });
var drift_budget_linker_1 = require("./drift-budget-linker");
Object.defineProperty(exports, "DriftBudgetLinker", { enumerable: true, get: function () { return drift_budget_linker_1.DriftBudgetLinker; } });
Object.defineProperty(exports, "DEFAULT_DRIFT_BUDGET_CONFIG", { enumerable: true, get: function () { return drift_budget_linker_1.DEFAULT_DRIFT_BUDGET_CONFIG; } });
const plugin = {
    id: "claw-ctx",
    name: "Claw Context Engine",
    description: "Context Engine with C2 gating, RL injection, governance signals, cross-domain injection, and CI/CD signals for OpenClaw agents",
    version: "4.7.0",
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
