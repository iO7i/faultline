import { describe, expect, it } from 'vitest';
import { ids } from '../../contracts/src/index.js';
import { makeSource, type EngineeringSource, type PlantIR } from '../../plant-ir/src/index.js';
import {
  compareContracts,
  compilePlantContract,
  InMemoryPlantContractRegistry,
  type CompileInput,
} from './index.js';

const inputFor = (
  generation: 'R17' | 'R18',
  sourceStatus: 'APPROVED' | 'DRAFT' = 'APPROVED',
): CompileInput => {
  const source: EngineeringSource = makeSource({
    sourceId: ids.source('cooling-capacity'),
    revision: ids.revision(generation),
    kind: 'OPERATING_ENVELOPE',
    scope: 'Unit-RX',
    approval: { status: sourceStatus },
  });
  const ir: PlantIR = {
    plantId: ids.plant('DemoPlant-01'),
    unitId: ids.unit('Unit-RX'),
    generation: ids.generation(generation),
    nodes: [
      {
        assetId: ids.asset('FIC-101'),
        type: 'CONTROL_TARGET',
        scope: 'Unit-RX',
        sourceIds: [source.sourceId],
        generation: ids.generation(generation),
        actuatable: true,
        dimension: 'MassFlow',
      },
      {
        assetId: ids.asset('CoolingSystem-CS1'),
        type: 'EQUIPMENT',
        scope: 'Unit-RX',
        sourceIds: [source.sourceId],
        generation: ids.generation(generation),
      },
    ],
    edges: [{ from: ids.asset('CoolingSystem-CS1'), to: ids.asset('FIC-101'), kind: 'COOLING_DEPENDENCY' }],
  };
  return {
    ir,
    sources: [source],
    capabilities: [
      {
        id: ids.capability('process.feed.adjust'),
        version: '1',
        target: ids.asset('FIC-101'),
        allowedMode: 'NORMAL',
        dependencies: [ids.asset('CoolingSystem-CS1')],
      },
    ],
    constraints: [
      {
        id: 'CoolingAvailable',
        kind: 'ARGUMENT_BOUND',
        capabilityId: ids.capability('process.feed.adjust'),
        target: ids.asset('FIC-101'),
        max: { value: generation === 'R17' ? 124 : 110, unit: 'kg/s' },
        sourceId: source.sourceId,
      },
    ],
  };
};
const compiled = (generation: 'R17' | 'R18') => {
  const result = compilePlantContract(inputFor(generation));
  if (!result.ok) throw new Error('expected fixture to compile');
  return result.contract;
};

describe('Plant Contract compiler', () => {
  it('produces a deterministic immutable R17 artifact with provenance', () => {
    const left = compiled('R17');
    const right = compiled('R17');
    expect(left.digest).toBe(right.digest);
    expect(Object.isFrozen(left)).toBe(true);
    expect(left.provenanceIndex['cooling-capacity']).toContain('constraint:CoolingAvailable');
  });
  it('rejects a draft mandatory source and a dimensional mismatch', () => {
    const draft = compilePlantContract(inputFor('R17', 'DRAFT'));
    expect(draft).toMatchObject({ ok: false });
    if (!draft.ok)
      expect(draft.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        'UNAPPROVED_ENGINEERING_SOURCE',
      );

    const wrongUnit = inputFor('R17');
    const constraint = wrongUnit.constraints[0];
    if (!constraint) throw new Error('fixture is missing its constraint');
    const mismatch = compilePlantContract({
      ...wrongUnit,
      constraints: [{ ...constraint, max: { value: 124, unit: 'degC' } }],
    });
    if (!mismatch.ok)
      expect(mismatch.diagnostics.map((diagnostic) => diagnostic.code)).toContain('UNIT_MISMATCH');
    else throw new Error('expected unit mismatch');
  });
  it('rejects unresolved and non-actuatable capability targets', () => {
    const unresolvedInput = inputFor('R17');
    const capability = unresolvedInput.capabilities[0];
    if (!capability) throw new Error('fixture is missing its capability');
    const unresolved = compilePlantContract({
      ...unresolvedInput,
      capabilities: [{ ...capability, target: ids.asset('UNKNOWN-TAG') }],
    });
    if (!unresolved.ok)
      expect(unresolved.diagnostics.map((diagnostic) => diagnostic.code)).toContain('UNRESOLVED_ASSET');
    else throw new Error('expected unresolved target');

    const nonActuatableInput = inputFor('R17');
    const nonActuatable = compilePlantContract({
      ...nonActuatableInput,
      ir: {
        ...nonActuatableInput.ir,
        nodes: nonActuatableInput.ir.nodes.map((node) =>
          node.assetId === ids.asset('FIC-101') ? { ...node, actuatable: false } : node,
        ),
      },
    });
    if (!nonActuatable.ok)
      expect(nonActuatable.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        'NON_ACTUATABLE_TARGET',
      );
    else throw new Error('expected non-actuatable target');
  });
  it('retains R17 while R18 becomes current and exposes conservative impact', () => {
    const r17 = compiled('R17');
    const r18 = compiled('R18');
    const registry = new InMemoryPlantContractRegistry();
    registry.put(r17);
    registry.put(r18);
    registry.advance(r18.generation);
    expect(registry.current()?.generation).toBe(ids.generation('R18'));
    expect(registry.get(ids.generation('R17'))?.digest).toBe(r17.digest);
    const impact = compareContracts(r17, r18, [
      { permitId: 'permit-001', dependencyClosure: ['CoolingSystem-CS1', 'process.feed.adjust'] },
    ]);
    expect(impact.affected).toEqual(
      expect.arrayContaining(['constraint:CoolingAvailable', 'capability:process.feed.adjust']),
    );
    expect(impact.affectedPermits).toEqual(['permit-001']);
    expect(impact.conservative).toBe(true);
    expect(impact.coverage).toBe('COMPLETE');
    expect(impact.comparedFrom).toEqual({ generation: r17.generation, contractDigest: r17.digest });
    expect(impact.comparedTo).toEqual({ generation: r18.generation, contractDigest: r18.digest });
  });
  it('rejects duplicate source identities, unresolved topology, and incomplete constraint declarations', () => {
    const baseline = inputFor('R17');
    const source = baseline.sources[0];
    const constraint = baseline.constraints[0];
    if (!source || !constraint) throw new Error('fixture is incomplete');
    const incompleteBound = {
      id: constraint.id,
      kind: constraint.kind,
      capabilityId: constraint.capabilityId,
      target: constraint.target,
      sourceId: constraint.sourceId,
    };
    const result = compilePlantContract({
      ...baseline,
      sources: [source, source],
      ir: {
        ...baseline.ir,
        edges: [
          ...baseline.ir.edges,
          { from: ids.asset('UNKNOWN'), to: ids.asset('FIC-101'), kind: 'REQUIRED' },
        ],
      },
      constraints: [incompleteBound],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok)
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        expect.arrayContaining([
          'DUPLICATE_IDENTIFIER',
          'UNRESOLVED_ASSET',
          'INVALID_CAPABILITY_DECLARATION',
        ]),
      );
  });
  it('marks a removed engineering source as changed and traces its prior contract links', () => {
    const r17 = compiled('R17');
    const r18Input = inputFor('R18');
    const capability = r18Input.capabilities[0];
    if (!capability) throw new Error('fixture is missing capability');
    const r18Result = compilePlantContract({
      ...r18Input,
      sources: [],
      ir: { ...r18Input.ir, nodes: r18Input.ir.nodes.map((node) => ({ ...node, sourceIds: [] })) },
      constraints: [],
      capabilities: [{ ...capability, dependencies: [] }],
    });
    if (!r18Result.ok) throw new Error('expected reduced fixture to compile');
    const impact = compareContracts(r17, r18Result.contract);
    expect(impact.changed).toContain('engineering-source:cooling-capacity:REMOVED');
    expect(impact.affected).toEqual(
      expect.arrayContaining(['constraint:CoolingAvailable', 'capability:process.feed.adjust']),
    );
  });
});
