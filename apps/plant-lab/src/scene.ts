import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { EQUIPMENT_IDS, type EquipmentId } from './plant/equipment.js';
import type { ScenePresentationState } from './presentation.js';

export const RENDERED_EQUIPMENT_IDS = EQUIPMENT_IDS;

type EquipmentVisual = { meshes: Mesh[]; material: StandardMaterial; rotor?: TransformNode };
type FlowClass = keyof ScenePresentationState['flowSpeed'];
type FlowMarker = { mesh: Mesh; path: readonly Vector3[]; kind: FlowClass; offset: number };
export type PlantCameraState = Readonly<{
  alpha: number;
  beta: number;
  radius: number;
  target: readonly [number, number, number];
}>;

const palette = {
  normal: new Color3(0.17, 0.43, 0.54),
  selected: new Color3(0.1, 0.78, 0.86),
  pending: new Color3(0.96, 0.62, 0.16),
  violation: new Color3(0.91, 0.2, 0.19),
  offline: new Color3(0.18, 0.23, 0.28),
};

const material = (scene: Scene, name: string, color: Color3, emissive = 0): StandardMaterial => {
  const value = new StandardMaterial(name, scene);
  value.diffuseColor = color;
  value.specularColor = new Color3(0.18, 0.18, 0.2);
  value.emissiveColor = color.scale(emissive);
  return value;
};

const makeBox = (
  scene: Scene,
  name: string,
  options: { width: number; height: number; depth: number },
  position: Vector3,
  value: StandardMaterial,
): Mesh => {
  const mesh = MeshBuilder.CreateBox(name, options, scene);
  mesh.position.copyFrom(position);
  mesh.material = value;
  return mesh;
};

const makeCylinder = (
  scene: Scene,
  name: string,
  options: { height: number; diameter: number; tessellation?: number },
  position: Vector3,
  value: StandardMaterial,
): Mesh => {
  const mesh = MeshBuilder.CreateCylinder(name, options, scene);
  mesh.position.copyFrom(position);
  mesh.material = value;
  return mesh;
};

const addSemantic = (meshes: readonly Mesh[], id: EquipmentId) => {
  for (const mesh of meshes) mesh.metadata = { equipmentId: id };
};

const lerpPath = (points: readonly Vector3[], progress: number): Vector3 => {
  if (points.length < 2) return points[0]?.clone() ?? Vector3.Zero();
  const scaled = progress * (points.length - 1);
  const start = Math.min(Math.floor(scaled), points.length - 2);
  const portion = scaled - start;
  return Vector3.Lerp(points[start] as Vector3, points[start + 1] as Vector3, portion);
};

export class PlantScene {
  readonly engine: Engine;
  readonly scene: Scene;
  #camera: ArcRotateCamera;
  #visuals = new Map<EquipmentId, EquipmentVisual>();
  #flowMarkers: FlowMarker[] = [];
  #presentation: ScenePresentationState | null = null;
  #shadows: ShadowGenerator | null = null;
  #onResize = () => this.resizeCamera();
  #onSelected: (id: EquipmentId) => void;
  #onCameraChanged: ((camera: PlantCameraState) => void) | null;
  #lastCamera = '';
  #time = 0;

  constructor(
    canvas: HTMLCanvasElement,
    onSelected: (id: EquipmentId) => void,
    onCameraChanged: ((camera: PlantCameraState) => void) | null = null,
  ) {
    this.#onSelected = onSelected;
    this.#onCameraChanged = onCameraChanged;
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.035, 0.11, 0.17, 1);
    this.#camera = this.createCamera(canvas);
    this.buildEnvironment();
    this.buildEquipment();
    this.bindPicking();
    this.scene.onBeforeRenderObservable.add(() => this.animate());
    this.scene.onAfterRenderObservable.add(() => this.reportCamera());
    window.addEventListener('resize', this.#onResize);
    this.resizeCamera();
    this.engine.runRenderLoop(() => this.scene.render());
  }

  private createCamera(canvas: HTMLCanvasElement) {
    const camera = new ArcRotateCamera('plant-lab-camera', -1.05, 1.05, 34, new Vector3(0, 0, 0), this.scene);
    camera.mode = ArcRotateCamera.ORTHOGRAPHIC_CAMERA;
    camera.lowerBetaLimit = 0.55;
    camera.upperBetaLimit = 1.35;
    camera.lowerRadiusLimit = 16;
    camera.upperRadiusLimit = 48;
    camera.wheelDeltaPercentage = 0.015;
    camera.attachControl(canvas, true);
    return camera;
  }

  private resizeCamera() {
    const aspect = this.engine.getRenderWidth() / Math.max(this.engine.getRenderHeight(), 1);
    const halfHeight = 14;
    this.#camera.orthoTop = halfHeight;
    this.#camera.orthoBottom = -halfHeight;
    this.#camera.orthoLeft = -halfHeight * aspect;
    this.#camera.orthoRight = halfHeight * aspect;
  }

  private buildEnvironment() {
    const sea = material(this.scene, 'sea-material', new Color3(0.025, 0.2, 0.31), 0.18);
    sea.alpha = 0.92;
    const shore = material(this.scene, 'shore-material', new Color3(0.48, 0.39, 0.25));
    const concrete = material(this.scene, 'concrete-material', new Color3(0.28, 0.32, 0.34));
    const asphalt = material(this.scene, 'asphalt-material', new Color3(0.075, 0.095, 0.11));
    const fence = material(this.scene, 'fence-material', new Color3(0.34, 0.42, 0.44));
    const building = material(this.scene, 'building-material', new Color3(0.13, 0.2, 0.25));
    const windowMaterial = material(this.scene, 'window-material', new Color3(0.1, 0.58, 0.67), 0.55);
    const seaMesh = MeshBuilder.CreateGround(
      'GULF-WATER',
      { width: 80, height: 70, subdivisions: 2 },
      this.scene,
    );
    seaMesh.position.set(0, -0.25, -18);
    seaMesh.material = sea;
    const shoreMesh = MeshBuilder.CreateGround('COASTLINE', { width: 65, height: 30 }, this.scene);
    shoreMesh.position.set(0, -0.18, -4);
    shoreMesh.material = shore;
    const pad = MeshBuilder.CreateGround('PROCESS-PAD', { width: 30, height: 22 }, this.scene);
    pad.position.y = -0.1;
    pad.material = concrete;
    const road = MeshBuilder.CreateGround('ACCESS-ROAD', { width: 36, height: 4 }, this.scene);
    road.position.set(0, -0.08, 12);
    road.material = asphalt;
    makeBox(
      this.scene,
      'CB-01-building',
      { width: 8, height: 4.5, depth: 4.5 },
      new Vector3(-8, 2.15, 7),
      building,
    );
    const roof = makeBox(
      this.scene,
      'CB-01-roof',
      { width: 8.5, height: 0.25, depth: 5 },
      new Vector3(-8, 4.45, 7),
      fence,
    );
    roof.rotation.z = 0.03;
    for (const x of [-10.2, -8, -5.8]) {
      makeBox(
        this.scene,
        `control-window-${x}`,
        { width: 1.1, height: 1.1, depth: 0.08 },
        new Vector3(x, 2.5, 4.72),
        windowMaterial,
      );
    }
    for (const x of [-15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15]) {
      for (const z of [-10, 10])
        makeCylinder(
          this.scene,
          `fence-post-${x}-${z}`,
          { height: 1.3, diameter: 0.09 },
          new Vector3(x, 0.55, z),
          fence,
        );
    }
    for (const z of [-7, -4, -1, 2, 5, 8]) {
      for (const x of [-15, 15])
        makeCylinder(
          this.scene,
          `fence-side-${x}-${z}`,
          { height: 1.3, diameter: 0.09 },
          new Vector3(x, 0.55, z),
          fence,
        );
    }
    for (const z of [-10, 10]) {
      const rail = makeBox(
        this.scene,
        `fence-rail-${z}`,
        { width: 30, height: 0.06, depth: 0.06 },
        new Vector3(0, 0.85, z),
        fence,
      );
      rail.position.y = 0.85;
    }
    const crate = material(this.scene, 'crate-material', new Color3(0.42, 0.25, 0.12));
    for (const [index, position] of [
      new Vector3(-12, 0.4, 4),
      new Vector3(-11, 0.4, 5.2),
      new Vector3(12, 0.4, 7),
    ].entries()) {
      makeBox(
        this.scene,
        `maintenance-crate-${index}`,
        { width: 1.1, height: 0.8, depth: 1.1 },
        position,
        crate,
      );
    }
    const sun = new DirectionalLight('late-afternoon-sun', new Vector3(-0.45, -1, 0.3), this.scene);
    sun.position = new Vector3(12, 24, -18);
    sun.intensity = 2.0;
    const hemi = new HemisphericLight('ambient-sky', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.68;
    hemi.groundColor = new Color3(0.08, 0.1, 0.12);
    this.#shadows = new ShadowGenerator(1024, sun);
    this.#shadows.useBlurExponentialShadowMap = true;
    this.#shadows.blurKernel = 18;
    this.scene.meshes.forEach((mesh) => this.#shadows?.addShadowCaster(mesh));
    const glow = new GlowLayer('restrained-accent-glow', this.scene, { blurKernelSize: 32 });
    glow.intensity = 0.25;
  }

  private buildEquipment() {
    const steel = (id: EquipmentId) => material(this.scene, `${id}-material`, palette.normal, 0.06);
    const intake = steel('IN-101');
    const rawTank = steel('TK-101');
    const pretreatment = steel('PT-101');
    const pump = steel('P-101');
    const roRack = steel('RO-101');
    const permeateTank = steel('TK-201');
    const brine = steel('BR-101');
    this.register('IN-101', this.makeIntake(intake), intake);
    this.register('TK-101', this.makeTank('TK-101', new Vector3(-7, 0, -1), rawTank), rawTank);
    this.register('PT-101', this.makePretreatment(pretreatment), pretreatment);
    this.register('P-101', this.makePump(pump), pump);
    this.register('RO-101', this.makeRoRack(roRack), roRack);
    this.register('TK-201', this.makeTank('TK-201', new Vector3(9, 0, 5), permeateTank), permeateTank);
    this.register('BR-101', this.makeBrine(brine), brine);
    const control = this.scene.getMeshByName('CB-01-building');
    const controlMaterial = control?.material;
    if (control instanceof Mesh && controlMaterial instanceof StandardMaterial)
      this.register('CB-01', { meshes: [control], material: controlMaterial }, controlMaterial);
    this.makeProcessPipes();
  }

  private register(id: EquipmentId, visual: EquipmentVisual, value: StandardMaterial) {
    const allMeshes = visual.meshes;
    addSemantic(allMeshes, id);
    allMeshes.forEach((mesh) => this.#shadows?.addShadowCaster(mesh));
    this.#visuals.set(id, { ...visual, material: value });
  }

  private makeIntake(value: StandardMaterial): EquipmentVisual {
    const meshes: Mesh[] = [];
    for (const x of [-12, -10.5, -9])
      meshes.push(
        makeCylinder(
          this.scene,
          `IN-101-screen-${x}`,
          { height: 2, diameter: 0.55 },
          new Vector3(x, 0.9, -7),
          value,
        ),
      );
    meshes.push(
      makeBox(
        this.scene,
        'IN-101-header',
        { width: 4.3, height: 0.35, depth: 0.45 },
        new Vector3(-10.5, 1.55, -6.5),
        value,
      ),
    );
    return { meshes, material: value };
  }

  private makeTank(id: EquipmentId, position: Vector3, value: StandardMaterial): EquipmentVisual {
    const body = makeCylinder(
      this.scene,
      `${id}-body`,
      { height: 3.6, diameter: 3.4, tessellation: 40 },
      new Vector3(position.x, 1.7, position.z),
      value,
    );
    const roof = makeCylinder(
      this.scene,
      `${id}-roof`,
      { height: 0.45, diameter: 3.48, tessellation: 40 },
      new Vector3(position.x, 3.65, position.z),
      value,
    );
    const ladder = makeBox(
      this.scene,
      `${id}-ladder`,
      { width: 0.22, height: 3.3, depth: 0.22 },
      new Vector3(position.x + 1.65, 1.65, position.z + 0.25),
      value,
    );
    return { meshes: [body, roof, ladder], material: value };
  }

  private makePretreatment(value: StandardMaterial): EquipmentVisual {
    const base = makeBox(
      this.scene,
      'PT-101-base',
      { width: 3.5, height: 0.35, depth: 3.1 },
      new Vector3(-2.4, 0.2, -1),
      value,
    );
    const meshes = [base];
    for (const [index, x] of [-3.25, -2.35, -1.45].entries())
      meshes.push(
        makeCylinder(
          this.scene,
          `PT-101-filter-${index}`,
          { height: 2.1, diameter: 0.65 },
          new Vector3(x, 1.25, -1),
          value,
        ),
      );
    return { meshes, material: value };
  }

  private makePump(value: StandardMaterial): EquipmentVisual {
    const base = makeBox(
      this.scene,
      'P-101-base',
      { width: 3.1, height: 0.35, depth: 2.2 },
      new Vector3(2, 0.2, -0.6),
      value,
    );
    const motor = makeCylinder(
      this.scene,
      'P-101-motor',
      { height: 1.7, diameter: 1.05 },
      new Vector3(1.25, 0.92, -0.6),
      value,
    );
    motor.rotation.z = Math.PI / 2;
    const housing = makeCylinder(
      this.scene,
      'P-101-housing',
      { height: 0.9, diameter: 1.45 },
      new Vector3(2.5, 0.72, -0.6),
      value,
    );
    housing.rotation.z = Math.PI / 2;
    const rotor = new TransformNode('P-101-rotor', this.scene);
    rotor.position.set(3.05, 0.72, -0.6);
    const wheel = makeCylinder(
      this.scene,
      'P-101-rotor-wheel',
      { height: 0.12, diameter: 1.0 },
      new Vector3(0, 0, 0),
      value,
    );
    wheel.parent = rotor;
    wheel.rotation.x = Math.PI / 2;
    return { meshes: [base, motor, housing, wheel], material: value, rotor };
  }

  private makeRoRack(value: StandardMaterial): EquipmentVisual {
    const meshes: Mesh[] = [
      makeBox(
        this.scene,
        'RO-101-frame',
        { width: 6.8, height: 0.28, depth: 4.2 },
        new Vector3(7, 0.2, -0.8),
        value,
      ),
    ];
    for (let row = 0; row < 2; row += 1) {
      for (let vessel = 0; vessel < 3; vessel += 1) {
        const tube = makeCylinder(
          this.scene,
          `RO-101-vessel-${row}-${vessel}`,
          { height: 2.65, diameter: 0.58 },
          new Vector3(5.25 + vessel * 1.7, 1 + row * 1.35, -1.65 + row * 1.7),
          value,
        );
        tube.rotation.z = Math.PI / 2;
        meshes.push(tube);
      }
    }
    meshes.push(
      makeBox(
        this.scene,
        'RO-101-feed-header',
        { width: 7.2, height: 0.32, depth: 0.32 },
        new Vector3(7, 2.65, -1.65),
        value,
      ),
    );
    return { meshes, material: value };
  }

  private makeBrine(value: StandardMaterial): EquipmentVisual {
    const stack = makeCylinder(
      this.scene,
      'BR-101-stack',
      { height: 3.5, diameter: 0.8 },
      new Vector3(10.7, 1.75, -5.5),
      value,
    );
    const cone = MeshBuilder.CreateCylinder(
      'BR-101-cap',
      { height: 0.5, diameterTop: 0.15, diameterBottom: 0.9 },
      this.scene,
    );
    cone.position.set(10.7, 3.75, -5.5);
    cone.material = value;
    return { meshes: [stack, cone], material: value };
  }

  private makeProcessPipes() {
    const pipeMaterial = material(this.scene, 'pipe-material', new Color3(0.23, 0.44, 0.49), 0.12);
    const paths: ReadonlyArray<readonly [FlowClass, readonly Vector3[]]> = [
      ['intake', [new Vector3(-10.5, 1.55, -6.5), new Vector3(-10.5, 1.55, -3), new Vector3(-7, 1.55, -2.7)]],
      ['intake', [new Vector3(-5.3, 1.55, -1), new Vector3(-4, 1.55, -1), new Vector3(-3.8, 1.55, -1)]],
      ['feed', [new Vector3(-1, 1.45, -1), new Vector3(0.2, 1.45, -0.6), new Vector3(0.5, 1.2, -0.6)]],
      [
        'feed',
        [
          new Vector3(3.2, 1.2, -0.6),
          new Vector3(4.2, 1.2, -0.6),
          new Vector3(4.2, 2.65, -1.65),
          new Vector3(5, 2.65, -1.65),
        ],
      ],
      ['permeate', [new Vector3(9.7, 1.6, -0.1), new Vector3(10.4, 1.6, 2.5), new Vector3(9, 1.6, 3.3)]],
      ['brine', [new Vector3(9.7, 1.1, -1.8), new Vector3(10.7, 1.1, -3.4), new Vector3(10.7, 1.1, -5.2)]],
    ];
    for (const [index, [kind, points]] of paths.entries()) {
      const pipe = MeshBuilder.CreateTube(
        `process-pipe-${index}`,
        { path: [...points], radius: 0.17, tessellation: 12 },
        this.scene,
      );
      pipe.material = pipeMaterial;
      for (let marker = 0; marker < 3; marker += 1) {
        const sphere = MeshBuilder.CreateSphere(
          `flow-marker-${index}-${marker}`,
          { diameter: 0.19, segments: 8 },
          this.scene,
        );
        sphere.material = material(
          this.scene,
          `flow-marker-material-${index}-${marker}`,
          new Color3(0.15, 0.9, 0.92),
          0.9,
        );
        this.#flowMarkers.push({ mesh: sphere, path: points, kind, offset: (index + marker / 3) / 3 });
      }
    }
  }

  private bindPicking() {
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERPICK) return;
      let mesh = info.pickInfo?.pickedMesh ?? null;
      while (mesh) {
        const id = mesh.metadata?.equipmentId;
        if (typeof id === 'string' && (EQUIPMENT_IDS as readonly string[]).includes(id)) {
          this.#onSelected(id as EquipmentId);
          return;
        }
        mesh = mesh.parent as Mesh | null;
      }
    });
  }

  private animate() {
    this.#time += this.engine.getDeltaTime() / 1_000;
    if (!this.#presentation) return;
    for (const marker of this.#flowMarkers) {
      const speed = this.#presentation.flowSpeed[marker.kind];
      marker.mesh.isVisible = speed > 0.005;
      marker.mesh.position.copyFrom(
        lerpPath(marker.path, (marker.offset + this.#time * (0.05 + speed * 0.38)) % 1),
      );
    }
    const pump = this.#visuals.get('P-101');
    if (pump?.rotor) pump.rotor.rotation.x += this.#presentation.pumpAnimation * 0.18;
  }

  private cameraState(): PlantCameraState {
    const target = this.#camera.target;
    return {
      alpha: this.#camera.alpha,
      beta: this.#camera.beta,
      radius: this.#camera.radius,
      target: [target.x, target.y, target.z],
    };
  }

  private reportCamera() {
    if (!this.#onCameraChanged) return;
    const state = this.cameraState();
    const serialized = JSON.stringify(state);
    if (serialized === this.#lastCamera) return;
    this.#lastCamera = serialized;
    this.#onCameraChanged(state);
  }

  update(presentation: ScenePresentationState) {
    this.#presentation = presentation;
    for (const id of EQUIPMENT_IDS) {
      const visual = this.#visuals.get(id);
      if (!visual) continue;
      const severity = presentation.equipment[id];
      const color = palette[severity];
      visual.material.diffuseColor = color;
      visual.material.emissiveColor = color.scale(
        severity === 'violation' ? 0.42 : severity === 'pending' ? 0.2 : 0.06,
      );
      for (const mesh of visual.meshes) {
        mesh.renderOutline = severity === 'selected' || severity === 'violation';
        mesh.outlineColor = severity === 'violation' ? palette.violation : palette.selected;
        mesh.outlineWidth = severity === 'violation' ? 0.12 : 0.07;
      }
    }
  }

  resetCamera() {
    this.#camera.alpha = -1.05;
    this.#camera.beta = 1.05;
    this.#camera.target.copyFromFloats(0, 0, 0);
    this.#lastCamera = '';
  }

  setCamera(camera: PlantCameraState) {
    this.#camera.alpha = camera.alpha;
    this.#camera.beta = camera.beta;
    this.#camera.radius = camera.radius;
    this.#camera.target.copyFromFloats(...camera.target);
    this.#lastCamera = JSON.stringify(this.cameraState());
  }

  focus(id: EquipmentId) {
    if (id === 'P-101') this.#camera.target.copyFromFloats(2, 0.8, -0.6);
    this.#lastCamera = '';
  }

  diagnostics() {
    return { fps: Math.round(this.engine.getFps()), meshes: this.scene.meshes.length };
  }

  dispose() {
    window.removeEventListener('resize', this.#onResize);
    this.scene.dispose();
    this.engine.dispose();
  }
}
