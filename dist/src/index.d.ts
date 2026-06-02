declare const plugin: {
    id: string;
    name: string;
    description: string;
    version: string;
    kind: string;
    register(api: any): void;
};
export default plugin;
