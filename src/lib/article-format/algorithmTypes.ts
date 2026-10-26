export type AlgorithmFile = { path: string; sha256?: string };
export type AlgorithmComponent = {
  id: string; version: string; scripts: AlgorithmFile[]; license: AlgorithmFile;
  capabilities: { transform: boolean; validators: string[] };
};
export type AlgorithmManifest = { schemaVersion: 1 | 2; components: AlgorithmComponent[] };
export type AlgorithmPackage = {
  manifest: AlgorithmManifest;
  files: Record<string, string>;
  fingerprint: string;
};
