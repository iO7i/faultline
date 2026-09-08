import {
  digest,
  ids,
  type AssetId,
  type CapabilityId,
  type Diagnostic,
  type EngineeringGenerationId,
  type EngineeringSourceId,
  type PlantContractDigest,
  type PlantContractId,
} from '../../contracts/src/index.js';
import {
  findNode,
  plantIrDigest,
  unitMatchesDimension,
  type EngineeringSource,
  type PlantIR,
  type Quantity,
} from '../../plant-ir/src/index.js';

export type Constraint = {
  id: string;
  kind: 'ARGUMENT_BOUND' | 'DEPENDENCY_REQUIRED' | 'FRESHNESS';
  capabilityId: CapabilityId;
  target: AssetId;
  max?: Quantity;
  dependency?: AssetId;
  sourceId: EngineeringSourceId;
};
export type Capability = {
  id: CapabilityId;
  version: string;
  target: AssetId;
  allowedMode: 'NORMAL';
  dependencies: readonly AssetId[];
};
export type TemporalRequirement =
  { kind: 'NO_DISPATCH_AFTER'; event: 'AUTHORITY_REVOKED' } | { kind: 'UNSUPPORTED'; expression: string };
export type RuntimeMonitorDescription = { kind: 'ARGUMENT_BOUND'; constraintId: string };
export type ProvenanceIndex = Readonly<Record<string, readonly string[]>>;
export type PlantContractArtifact = {
  contractId: PlantContractId;
  generation: EngineeringGenerationId;
  digest: PlantContractDigest;
  plantIrDigest: string;
  sourceDigests: readonly string[];
  sourceRevisions: readonly { sourceId: string; revision: string; digest: string }[];
  nodeDigests: Readonly<Record<string, string>>;
  capabilities: readonly Capability[];
  constraints: readonly Constraint[];
  dependencyGraph: Readonly<Record<string, readonly string[]>>;
  provenanceIndex: ProvenanceIndex;
  runtimeMonitors: readonly RuntimeMonitorDescription[];
  compilerVersion: '0.1.0';
};
export type CompileResult =
  | { ok: true; contract: PlantContractArtifact; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };
export type CompileInput = {
  ir: PlantIR;
  sources: readonly EngineeringSource[];
  capabilities: readonly Capability[];
  constraints: readonly Constraint[];
  temporalRequirements?: readonly TemporalRequirement[];
};

const error = (
  code: Diagnostic['code'],
  message: string,
  sourceRefs: readonly string[] = [],
): Diagnostic => ({
  code,
  severity: 'ERROR',
  message,
  sourceRefs,
});
const duplicates = (values: readonly string[]) => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index)),
];
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

export function compilePlantContract(input: CompileInput): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const sourceById = new Map(input.sources.map((source) => [source.sourceId, source]));
  const capabilityById = new Map(input.capabilities.map((capability) => [capability.id, capability]));

  for (const duplicate of duplicates(input.ir.nodes.map((node) => node.assetId)))
    diagnostics.push(error('DUPLICATE_IDENTIFIER', `Duplicate Plant IR node ${duplicate}`));
  for (const duplicate of duplicates(input.sources.map((source) => source.sourceId)))
    diagnostics.push(error('DUPLICATE_IDENTIFIER', `Duplicate engineering source ${duplicate}`));
  for (const duplicate of duplicates(input.capabilities.map((capability) => capability.id)))
    diagnostics.push(error('DUPLICATE_IDENTIFIER', `Duplicate capability ${duplicate}`));
  for (const duplicate of duplicates(input.constraints.map((constraint) => constraint.id)))
    diagnostics.push(error('DUPLICATE_IDENTIFIER', `Duplicate constraint ${duplicate}`));
  for (const source of input.sources)
    if (source.approval.status !== 'APPROVED')
      diagnostics.push(
        error('UNAPPROVED_ENGINEERING_SOURCE', `Draft source ${source.sourceId}`, [source.sourceId]),
      );
  for (const node of input.ir.nodes) {
    if (node.generation !== input.ir.generation)
      diagnostics.push(
        error(
          'INCONSISTENT_GENERATION_BINDING',
          `Node ${node.assetId} is not bound to ${input.ir.generation}`,
        ),
      );
    for (const sourceId of node.sourceIds)
      if (!sourceById.has(sourceId))
        diagnostics.push(
          error('MISSING_PROVENANCE', `Node ${node.assetId} references missing source ${sourceId}`),
        );
  }
  for (const edge of input.ir.edges)
    if (!findNode(input.ir, edge.from) || !findNode(input.ir, edge.to))
      diagnostics.push(
        error('UNRESOLVED_ASSET', `Topology edge ${edge.from}->${edge.to} has an unresolved endpoint`),
      );
  for (const capability of input.capabilities) {
    const node = findNode(input.ir, capability.target);
    if (!node) {
      diagnostics.push(error('UNRESOLVED_ASSET', `Unknown target ${capability.target}`));
      continue;
    }
    if (node.type !== 'CONTROL_TARGET')
      diagnostics.push(error('INVALID_TARGET_TYPE', `Target ${capability.target} is not a control target`));
    if (!node.actuatable)
      diagnostics.push(error('NON_ACTUATABLE_TARGET', `Target ${capability.target} is not actuatable`));
    for (const dependency of capability.dependencies)
      if (!findNode(input.ir, dependency))
        diagnostics.push(
          error('UNRESOLVED_ASSET', `Capability ${capability.id} has missing dependency ${dependency}`),
        );
  }
  for (const constraint of input.constraints) {
    const capability = capabilityById.get(constraint.capabilityId);
    const target = findNode(input.ir, constraint.target);
    if (!capability)
      diagnostics.push(
        error(
          'INVALID_CAPABILITY_DECLARATION',
          `Constraint ${constraint.id} references an unknown capability`,
        ),
      );
    if (!target)
      diagnostics.push(
        error('UNRESOLVED_ASSET', `Constraint ${constraint.id} references ${constraint.target}`),
      );
    if (capability && capability.target !== constraint.target)
      diagnostics.push(
        error(
          'INVALID_CAPABILITY_DECLARATION',
          `Constraint ${constraint.id} target disagrees with its capability`,
        ),
      );
    if (!sourceById.has(constraint.sourceId))
      diagnostics.push(
        error('MISSING_PROVENANCE', `Constraint ${constraint.id} has no source`, [constraint.sourceId]),
      );
    if (constraint.max && !unitMatchesDimension(constraint.max.unit, target?.dimension))
      diagnostics.push(
        error('UNIT_MISMATCH', `Constraint ${constraint.id} unit is incompatible with ${constraint.target}`),
      );
    if (constraint.kind === 'ARGUMENT_BOUND' && !constraint.max)
      diagnostics.push(
        error('INVALID_CAPABILITY_DECLARATION', `Constraint ${constraint.id} is missing its argument bound`),
      );
    if (constraint.kind === 'DEPENDENCY_REQUIRED' && !constraint.dependency)
      diagnostics.push(
        error('INVALID_CAPABILITY_DECLARATION', `Constraint ${constraint.id} is missing its dependency`),
      );
    if (constraint.dependency && !findNode(input.ir, constraint.dependency))
      diagnostics.push(
        error(
          'UNRESOLVED_ASSET',
          `Constraint ${constraint.id} has missing dependency ${constraint.dependency}`,
        ),
      );
  }
  for (const requirement of input.temporalRequirements ?? [])
    if (requirement.kind === 'UNSUPPORTED')
      diagnostics.push(
        error('UNSUPPORTED_TEMPORAL_EXPRESSION', `Unsupported temporal expression ${requirement.expression}`),
      );
  if (diagnostics.length) return { ok: false, diagnostics };

  const capabilities = [...input.capabilities].sort((left, right) => left.id.localeCompare(right.id));
  const constraints = [...input.constraints].sort((left, right) => left.id.localeCompare(right.id));
  const sourceRevisions = input.sources
    .map((source) => ({ sourceId: source.sourceId, revision: source.revision, digest: source.digest }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const nodeDigests = Object.fromEntries(
    input.ir.nodes
      .map((node) => [node.assetId, digest(node)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const provenanceIndex = Object.fromEntries(
    input.sources
      .map((source) => {
        const nodes = input.ir.nodes
          .filter((node) => node.sourceIds.includes(source.sourceId))
          .map((node) => `node:${node.assetId}`);
        const linkedConstraints = constraints
          .filter((constraint) => constraint.sourceId === source.sourceId)
          .flatMap((constraint) => [`constraint:${constraint.id}`, `capability:${constraint.capabilityId}`]);
        return [source.sourceId, [...new Set([...nodes, ...linkedConstraints])].sort()] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const base = {
    generation: input.ir.generation,
    plantIrDigest: plantIrDigest(input.ir),
    sourceDigests: sourceRevisions.map((source) => source.digest),
    sourceRevisions,
    nodeDigests,
    capabilities,
    constraints,
    dependencyGraph: Object.fromEntries(
      capabilities.map((capability) => [capability.id, [...capability.dependencies].sort()]),
    ),
    provenanceIndex,
    runtimeMonitors: constraints
      .filter((constraint) => constraint.kind === 'ARGUMENT_BOUND')
      .map((constraint) => ({ kind: 'ARGUMENT_BOUND' as const, constraintId: constraint.id })),
    compilerVersion: '0.1.0' as const,
  };
  return {
    ok: true,
    contract: deepFreeze({
      ...base,
      contractId: ids.plantContract(`contract:${input.ir.generation}`),
      digest: digest(base) as PlantContractDigest,
    }),
    diagnostics,
  };
}

export interface PlantContractRegistry {
  put(contract: PlantContractArtifact): void;
  advance(generation: EngineeringGenerationId): void;
  current(): PlantContractArtifact | null;
  get(generation: EngineeringGenerationId): PlantContractArtifact | null;
  list(): readonly PlantContractArtifact[];
}
export class InMemoryPlantContractRegistry implements PlantContractRegistry {
  #contracts = new Map<EngineeringGenerationId, PlantContractArtifact>();
  #current: EngineeringGenerationId | null = null;
  put(contract: PlantContractArtifact) {
    const existing = this.#contracts.get(contract.generation);
    if (existing && existing.digest !== contract.digest) throw new Error('GENERATION_DIGEST_CONFLICT');
    this.#contracts.set(contract.generation, contract);
  }
  advance(generation: EngineeringGenerationId) {
    if (!this.#contracts.has(generation)) throw new Error('UNKNOWN_GENERATION');
    this.#current = generation;
  }
  current() {
    return this.#current ? (this.#contracts.get(this.#current) ?? null) : null;
  }
  get(generation: EngineeringGenerationId) {
    return this.#contracts.get(generation) ?? null;
  }
  list() {
    return [...this.#contracts.values()];
  }
}

export type PendingAuthority = { permitId: string; dependencyClosure: readonly string[] };
export type ChangeImpact = {
  comparedFrom: { generation: EngineeringGenerationId; contractDigest: PlantContractDigest };
  comparedTo: { generation: EngineeringGenerationId; contractDigest: PlantContractDigest };
  changed: readonly string[];
  affected: readonly string[];
  affectedPermits: readonly string[];
  conservative: boolean;
  coverage: 'COMPLETE' | 'UNCERTAIN';
};
export const compareContracts = (
  before: PlantContractArtifact,
  after: PlantContractArtifact,
  pending: readonly PendingAuthority[] = [],
): ChangeImpact => {
  const beforeSources = new Map(before.sourceRevisions.map((source) => [source.sourceId, source]));
  const afterSources = new Map(after.sourceRevisions.map((source) => [source.sourceId, source]));
  const changedSourceIds = [...new Set([...beforeSources.keys(), ...afterSources.keys()])].filter(
    (sourceId) => {
      const previous = beforeSources.get(sourceId);
      const current = afterSources.get(sourceId);
      return !previous || !current || previous.digest !== current.digest;
    },
  );
  const changedSources = changedSourceIds.map((sourceId) => {
    const current = afterSources.get(sourceId);
    return current
      ? `engineering-source:${sourceId}:${current.revision}`
      : `engineering-source:${sourceId}:REMOVED`;
  });
  const changedNodeIds = [
    ...new Set([...Object.keys(before.nodeDigests), ...Object.keys(after.nodeDigests)]),
  ].filter((id) => before.nodeDigests[id] !== after.nodeDigests[id]);
  const changedNodes = changedNodeIds.map((id) => `plant-ir-node:${id}`);
  const provenanceLinks = [before, after].flatMap((contract) =>
    changedSourceIds.flatMap((sourceId) => contract.provenanceIndex[sourceId] ?? []),
  );
  const affectedBySource = provenanceLinks.filter(
    (reference) => reference.startsWith('constraint:') || reference.startsWith('capability:'),
  );
  const affectedByChangedNode = [before, after]
    .flatMap((contract) => contract.capabilities)
    .filter((capability) => changedNodeIds.includes(capability.target))
    .map((capability) => `capability:${capability.id}`);
  const affected = [...new Set([...affectedBySource, ...affectedByChangedNode])].sort();
  const affectedCapabilities = affected.filter((reference) => reference.startsWith('capability:'));
  const affectedPermits = pending
    .filter(
      (permit) =>
        affectedCapabilities.some((capability) =>
          permit.dependencyClosure.includes(capability.replace('capability:', '')),
        ) ||
        changedNodes.some((node) => permit.dependencyClosure.includes(node.replace('plant-ir-node:', ''))),
    )
    .map((permit) => permit.permitId)
    .sort();
  const changed = [...changedSources, ...changedNodes].sort();
  return {
    comparedFrom: { generation: before.generation, contractDigest: before.digest },
    comparedTo: { generation: after.generation, contractDigest: after.digest },
    changed,
    affected,
    affectedPermits,
    conservative: changed.length > 0,
    coverage: 'COMPLETE',
  };
};
