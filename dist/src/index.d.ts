export { ConfidenceGate, type ConfidenceMode, type ConfidenceReport } from "./confidence_gate";
export { RLInjector, MockRLProvider, type RLExperience, type RLProvider } from "./rl_injector";
export { GovernanceInjector, MockGovernanceProvider, type GovernanceSignal, type GovernanceProvider, type GovernanceLayer } from "./governance_injector";
export { CrossDomainInjector, MockCrossDomainProvider, type InjectedSignal, type CrossDomainProvider } from "./cross_domain_injector";
export { CIInjector, MockCIProvider, type CISignal, type CIProvider } from "./ci_injector";
export { TokenBudgetManager, type BudgetAllocation, type BudgetConfig, type BudgetResult } from "./token_budget_manager";
declare const plugin: {
    id: string;
    name: string;
    description: string;
    version: string;
    kind: string;
    register(api: any): void;
};
export default plugin;
