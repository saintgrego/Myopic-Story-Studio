import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { useSceneStore } from '../store/sceneStore';
import {
  cameraAimPoint,
  cameraPosition,
  num,
  verticalHalfExtent,
} from '../lib/framing';
import { FALLBACK_F_STOP, FALLBACK_FOCAL_LENGTH_MM, focusRange } from '../lib/dof';
import type { Environment, Flagged, MeshRef, SceneFile, Vec3 } from '../types/scene';
import { characterColor, propColor } from '../palette';
import POSES from '../poses.json';
import PROPS from '../props.json';

// Full-frame-equivalent sensor width used to derive FOV from a real-world focal length.
const SENSOR_WIDTH_MM = 36;

// Library proxies (poses + props) are OURS, so the palette owns their colour at
// render time and the baked-in generator colour is only a fallback. Anything
// else pointing at a .glb is a deliberate user attachment and keeps its own
// materials untouched — same principle as the panel's replace-custom-mesh
// confirm (PRD §11 v1.4).
const LIBRARY_PATHS = new Set<string>([...POSES, ...PROPS].map((entry) => entry.path));

function aspectRatioToNumber(ar: string): number {
  switch (ar) {
    case '16:9':
      return 16 / 9;
    case '2.39:1':
      return 2.39;
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1;
    default:
      return 16 / 9;
  }
}

// Real lens math: horizontal FOV from focal length + sensor width, then vertical FOV
// from horizontal FOV + aspect ratio (three.js PerspectiveCamera.fov is vertical, in degrees).
function focalLengthToVerticalFov(focalLengthMm: number, aspect: number): number {
  const horizontal = 2 * Math.atan(SENSOR_WIDTH_MM / (2 * focalLengthMm));
  const vertical = 2 * Math.atan(Math.tan(horizontal / 2) / aspect);
  return THREE.MathUtils.radToDeg(vertical);
}

// Scenes saved before environment.setting existed fall back to sniffing locationName.
function isExterior(environment: Environment): boolean {
  if (environment.setting === 'Exterior') return true;
  if (environment.setting === 'Interior') return false;
  const loc = environment.locationName === '[?]' ? '' : environment.locationName;
  return !/\b(interior|indoors?|inside|room|office|apartment|corridor|hallway)\b/i.test(loc);
}

// Gel tints (PRD v1.6). Absent, flagged, or malformed all resolve to white,
// which is the no-op tint — that is what keeps every pre-v1.6 `.myo` rendering
// exactly as it did, with no migration.
function gelColor(value: Flagged<string> | undefined): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) return '#ffffff';
  return value;
}

// Fog: distant blocking reads as distant, and the ground plane's far edge
// dissolves instead of ending in a hard line against the sky (or the void).

// FogExp2 visibility ≈ exp(-(density * distance)²). At 0.015 an object 10 units
// out is untouched (~98%) while the ground's far corners (~85) are gone — which
// is what a clear day should do to a blocking view. Same loose weather
// vocabulary the sky's turbidity switch reads, but graded: "mist" and "thick
// fog" are very different blocking conditions.
function fogDensityForWeather(weather: string): number {
  if (/thick|dense|heavy/i.test(weather) && /fog|mist|smog/i.test(weather)) return 0.1;
  if (/fog|smog/i.test(weather)) return 0.06;
  if (/haze|hazy|mist|smoke/i.test(weather)) return 0.035;
  if (/overcast|cloud|rain|storm|snow/i.test(weather)) return 0.025;
  return 0.015;
}

// Fog colour is scene-referred — it goes through ACES like everything else —
// while the hex values below are the display-referred colours we want on screen,
// so each needs a boost to land there. Both were tuned by sampling rendered
// pixels (gl.readPixels on the live canvas), not derived: ACES is non-linear
// enough that the arithmetic misleads, especially in the darks.
//
// Exterior: fog at full strength should match the *radiance* of the sky at the
// horizon (measured ~0.78 linear pre-tone-map). Matching radiance rather than
// on-screen colour is what makes partial fog read as thin haze. Retune by
// comparing the ground's far edge against the sky just above it — with this the
// two land within ~10 luma of each other.
const FOG_EXPOSURE_BOOST = 1.6;
// Interior: the void background is painted by gl.clearColor and never
// tone-mapped, so the fog has to be pre-brightened to *render* as 0x18181b.
const INTERIOR_FOG_BOOST = 1.1;
// Interiors want the ground's far edge gone entirely rather than graded — this
// saturates by ~60 units while leaving a set 6–10 units from camera untouched.
const INTERIOR_FOG_DENSITY = 0.03;

function fogColorForScene(
  environment: Environment,
  keyLightColor: string,
  sunElevationDeg: number,
): THREE.Color {
  // Interiors have no sky, so fade into the same void the background paints.
  if (!isExterior(environment)) return new THREE.Color(0x18181b).multiplyScalar(INTERIOR_FOG_BOOST);

  const weather = environment.weather === '[?]' ? '' : environment.weather;
  const keyColor = new THREE.Color(keyLightColor);
  const color = new THREE.Color(0xb9c9d6); // pale daylight horizon
  if (environment.timeOfDay === 'Night') {
    color.set(0x0b0f18).lerp(keyColor, 0.15);
  } else {
    // The lower the sun, the more the horizon takes the key light's colour.
    // This is what makes a sunset scene's haze read warm instead of blue.
    const warmth = THREE.MathUtils.clamp((20 - sunElevationDeg) / 20, 0, 1);
    color.lerp(keyColor, 0.65 * warmth);
    // Turbid air washes out toward flat grey — matches turbidity 16 above.
    if (/overcast|cloud|fog|mist|rain|storm/i.test(weather)) {
      color.lerp(new THREE.Color(0xc8cccf), 0.4);
    }
  }
  return color.multiplyScalar(FOG_EXPOSURE_BOOST);
}

function sphericalDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );
}

function buildPrimitiveGeometry(shape: string, dims: number[]): THREE.BufferGeometry {
  switch (shape) {
    case 'box':
      return new THREE.BoxGeometry(dims[0] ?? 1, dims[1] ?? 1, dims[2] ?? 1);
    case 'sphere':
      return new THREE.SphereGeometry(dims[0] ?? 0.5, 24, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(dims[0] ?? 0.5, dims[1] ?? 0.5, dims[2] ?? 1, 24);
    case 'cone':
      return new THREE.ConeGeometry(dims[0] ?? 0.5, dims[1] ?? 1, 24);
    case 'capsule':
    default: {
      const radius = dims[0] ?? 0.4;
      const height = dims[1] ?? 1.8;
      return new THREE.CapsuleGeometry(radius, Math.max(height - 2 * radius, 0.01), 4, 12);
    }
  }
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    // Lines (the focus-plane markers) hold geometry/material too, not just meshes.
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

// Central architectural requirement (PRD section 4): mesh is either a primitive OR a glTF
// path, and both must be equally first-class. This switches on `mesh.kind` — the ONLY place
// in the renderer that needs to know the difference.
function buildObject(mesh: MeshRef, color: number, onGltfError: (path: string) => void): THREE.Object3D {
  if (mesh.kind === 'gltf') {
    const group = new THREE.Group();
    const tint = LIBRARY_PATHS.has(mesh.path);
    new GLTFLoader().load(
      mesh.path,
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (tint) {
              // Dispose what the loader built before dropping it — nothing else
              // holds a reference, and disposeObject3D will only ever see the
              // replacement.
              const old = child.material;
              (Array.isArray(old) ? old : [old]).forEach((m) => m.dispose());
              child.material = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.85,
                metalness: 0.05,
              });
            }
          }
        });
        group.add(gltf.scene);
      },
      undefined,
      () => {
        onGltfError(mesh.path);
        const fallback = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.5, 0.5),
          new THREE.MeshBasicMaterial({ color: 0xff2255, wireframe: true }),
        );
        fallback.position.y = 0.25;
        group.add(fallback);
      },
    );
    return group;
  }
  const geometry = buildPrimitiveGeometry(mesh.shape, mesh.dimensions);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
  const meshObj = new THREE.Mesh(geometry, material);
  meshObj.castShadow = true;
  meshObj.receiveShadow = true;
  meshObj.position.y = verticalHalfExtent(mesh.shape, mesh.dimensions);
  const group = new THREE.Group();
  group.add(meshObj);
  return group;
}

// PRD §11 v1.3: unfilled indicators only — these are lines on the ground showing where
// the near and far limits of focus cross the shot. Nothing here changes how a pixel is
// shaded; rendered blur stays out of scope.
const FOCUS_MARKER_COLOR = 0x5fd3b0;
// The ground plane is 120x120, so past its half-width there is nothing to draw on and a
// far limit that distant reads as "effectively infinity" anyway.
const FOCUS_MARKER_MAX_DISTANCE = 60;

function buildFocusPlaneMarkers(scene: SceneFile, camPos: Vec3, aim: Vec3): THREE.Line[] {
  const focal = num(scene.camera.focalLength, FALLBACK_FOCAL_LENGTH_MM);
  const range = focusRange(
    focal,
    num(scene.camera.depthOfField, FALLBACK_F_STOP),
    Math.hypot(aim.x - camPos.x, aim.y - camPos.y, aim.z - camPos.z),
  );
  if (!range) return [];

  const origin = new THREE.Vector3(camPos.x, camPos.y, camPos.z);
  const dir = new THREE.Vector3(aim.x, aim.y, aim.z).sub(origin);
  if (dir.lengthSq() === 0) return [];
  dir.normalize();

  // The focus plane is perpendicular to the view axis; its intersection with the ground
  // is the line we draw. `right` runs along that intersection, and `inPlaneUp` is the
  // steepest direction within the plane — used to walk from the plane's centre to y = 0.
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-8) return []; // camera straight down: no useful ground line
  right.normalize();
  const inPlaneUp = new THREE.Vector3().crossVectors(right, dir).normalize();
  if (Math.abs(inPlaneUp.y) < 1e-6) return [];

  const lines: THREE.Line[] = [];
  for (const [distance, opacity] of [
    [range.near, 0.9],
    [range.far, 0.45],
  ] as const) {
    if (!Number.isFinite(distance) || distance <= 0 || distance > FOCUS_MARKER_MAX_DISTANCE) {
      continue;
    }
    const centre = origin.clone().addScaledVector(dir, distance);
    const onGround = centre.clone().addScaledVector(inPlaneUp, -centre.y / inPlaneUp.y);
    onGround.y = 0.02; // above the ground plane and grid so it doesn't z-fight
    // Span roughly the frame's width at this distance, so the marker shows where the
    // focus band crosses the shot instead of being an arbitrary length.
    const halfWidth = THREE.MathUtils.clamp((distance * SENSOR_WIDTH_MM) / focal / 2, 0.75, 30);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      onGround.clone().addScaledVector(right, -halfWidth),
      onGround.clone().addScaledVector(right, halfWidth),
    ]);
    lines.push(
      new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: FOCUS_MARKER_COLOR, transparent: true, opacity }),
      ),
    );
  }
  return lines;
}

type ViewMode = 'free' | 'camera';

export default function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(new THREE.Scene());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const contentGroupRef = useRef(new THREE.Group());
  const cameraHelperRef = useRef<THREE.CameraHelper | null>(null);
  const viewModeRef = useRef<ViewMode>('free');

  const scene = useSceneStore((s) => s.scene);
  const [viewMode, setViewMode] = useState<ViewMode>('free');
  const [gltfWarning, setGltfWarning] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Mount-once: renderer, both cameras, orbit controls, floor grid, render loop.
  useEffect(() => {
    const threeScene = sceneRef.current;
    threeScene.background = new THREE.Color(0x18181b);

    const orbitCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    orbitCamera.position.set(4, 3.5, 6);
    orbitCameraRef.current = orbitCamera;

    const sceneCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    sceneCameraRef.current = sceneCamera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The Sky shader emits HDR-range values; without filmic tone mapping the
    // whole dome clips to white.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    renderer.shadowMap.enabled = true;
    // PCFShadowMap (not PCFSoftShadowMap): shadow.radius is a no-op under
    // PCFSoftShadowMap, and radius is what shadowSoftness drives.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;
    canvasWrapRef.current?.appendChild(renderer.domElement);

    const controls = new OrbitControls(orbitCamera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // 120×120 keeps the ground's corners (half-diagonal ~85) inside the sky box
    // (±90) — pieces poking outside it would z-fight with the depthWrite-false sky.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x1f1f23, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01; // just below the grid so the two don't z-fight
    ground.receiveShadow = true;
    threeScene.add(ground);

    const grid = new THREE.GridHelper(20, 20, 0x3f3f46, 0x27272a);
    threeScene.add(grid);
    const contentGroup = contentGroupRef.current;
    threeScene.add(contentGroup);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const mode = viewModeRef.current;
      controls.enabled = mode === 'free';
      if (mode === 'free') controls.update();
      cameraHelperRef.current?.update();
      renderer.render(threeScene, mode === 'camera' ? sceneCamera : orbitCamera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      threeScene.fog = null; // the Scene object outlives this effect (it's a ref)
      controls.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      disposeObject3D(contentGroup);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Track container size so camera-view letterboxing has something to fit within.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Rebuild characters/props/lights/camera-helper whenever scene data changes.
  useEffect(() => {
    const contentGroup = contentGroupRef.current;
    disposeObject3D(contentGroup);
    contentGroup.clear();
    if (cameraHelperRef.current) {
      sceneRef.current.remove(cameraHelperRef.current);
      cameraHelperRef.current = null;
    }
    if (!scene) {
      sceneRef.current.fog = null;
      return;
    }

    const { lighting } = scene;
    const azimuth = num(lighting.keyLightAzimuth, 45);
    const elevation = num(lighting.keyLightElevation, 45);
    const keyColor = lighting.keyLightColor === '[?]' ? '#ffffff' : lighting.keyLightColor;

    const keyLight = new THREE.DirectionalLight(new THREE.Color(keyColor), 1.8);
    keyLight.position.copy(sphericalDirection(azimuth, elevation).multiplyScalar(10));
    keyLight.position.y = Math.max(keyLight.position.y, 0.5);
    keyLight.lookAt(0, 1, 0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 40;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 1 + num(lighting.shadowSoftness, 0.5) * 7;
    contentGroup.add(keyLight);

    // Fill is the ambient term, so its gel tints everything the key does not
    // reach — i.e. the shadow side. White (the default) is identical to the
    // 0xffffff this carried before v1.6.
    contentGroup.add(
      new THREE.AmbientLight(
        new THREE.Color(gelColor(lighting.fillColor)),
        num(lighting.fillIntensity, 0.3),
      ),
    );

    if (isExterior(scene.environment)) {
      const sky = new Sky();
      // Must exceed the ground's half-diagonal but stay under the cameras' far
      // plane (200), or the sky disappears in camera view.
      sky.scale.setScalar(180);
      // At Night the sun sits below the horizon: dark sky with a faint horizon
      // glow, while the key light stays wherever the scene put it (moon, etc.).
      const sunElevation = scene.environment.timeOfDay === 'Night' ? -8 : elevation;
      const uniforms = sky.material.uniforms;
      uniforms.sunPosition.value.copy(sphericalDirection(azimuth, sunElevation));
      const weather = scene.environment.weather === '[?]' ? '' : scene.environment.weather;
      uniforms.turbidity.value = /overcast|cloud|fog|mist|rain|storm/i.test(weather) ? 16 : 8;
      uniforms.rayleigh.value = 2;
      uniforms.mieCoefficient.value = 0.005;
      uniforms.mieDirectionalG.value = 0.8;
      contentGroup.add(sky);
    }

    // Fog lives on the scene, not the content group, so it is set (and cleared)
    // here rather than disposed with the rest of the rebuilt content.
    sceneRef.current.fog = new THREE.FogExp2(
      fogColorForScene(scene.environment, keyColor, elevation),
      isExterior(scene.environment)
        ? fogDensityForWeather(
            scene.environment.weather === '[?]' ? '' : scene.environment.weather,
          )
        : INTERIOR_FOG_DENSITY,
    );

    if (lighting.rimLight) {
      const rimLightObj = new THREE.DirectionalLight(
        new THREE.Color(gelColor(lighting.rimColor)),
        num(lighting.rimIntensity, 0.5),
      );
      rimLightObj.position.copy(sphericalDirection(azimuth + 180, elevation).multiplyScalar(10));
      rimLightObj.position.y = Math.max(rimLightObj.position.y, 0.5);
      rimLightObj.lookAt(0, 1, 0);
      contentGroup.add(rimLightObj);
    }

    // Palette index is the object's position in the scene array, NOT a filtered
    // index — hiding a character must not re-colour the ones after it.
    for (const [i, char] of scene.characters.entries()) {
      if (!char.visible) continue;
      const group = buildObject(char.mesh, characterColor(i), (path) =>
        setGltfWarning(`Could not load glTF for ${char.id}: ${path}`),
      );
      group.position.set(num(char.position.x, 0), num(char.position.y, 0), num(char.position.z, 0));
      group.rotation.set(
        THREE.MathUtils.degToRad(char.rotation.x),
        THREE.MathUtils.degToRad(char.rotation.y),
        THREE.MathUtils.degToRad(char.rotation.z),
      );
      group.scale.setScalar(char.scale || 1);
      contentGroup.add(group);
    }

    for (const [i, prop] of scene.props.entries()) {
      if (!prop.visible) continue;
      const group = buildObject(prop.mesh, propColor(i), (path) =>
        setGltfWarning(`Could not load glTF for ${prop.id}: ${path}`),
      );
      group.position.set(num(prop.position.x, 0), num(prop.position.y, 0), num(prop.position.z, 0));
      group.rotation.set(
        THREE.MathUtils.degToRad(prop.rotation.x),
        THREE.MathUtils.degToRad(prop.rotation.y),
        THREE.MathUtils.degToRad(prop.rotation.z),
      );
      group.scale.set(prop.scale.x || 1, prop.scale.y || 1, prop.scale.z || 1);
      contentGroup.add(group);
    }

    const sceneCamera = sceneCameraRef.current!;
    const aspect = aspectRatioToNumber(scene.camera.aspectRatio === '[?]' ? '16:9' : scene.camera.aspectRatio);
    sceneCamera.fov = focalLengthToVerticalFov(num(scene.camera.focalLength, 50), aspect);
    sceneCamera.aspect = aspect;
    const camPos = cameraPosition(scene);
    sceneCamera.position.set(camPos.x, camPos.y, camPos.z);
    const aim = cameraAimPoint(scene);
    sceneCamera.lookAt(aim.x, aim.y, aim.z);
    sceneCamera.updateProjectionMatrix();

    const helper = new THREE.CameraHelper(sceneCamera);
    cameraHelperRef.current = helper;
    sceneRef.current.add(helper);

    for (const line of buildFocusPlaneMarkers(scene, camPos, aim)) contentGroup.add(line);
  }, [scene]);

  // Resize renderer to fill the container in free view, or letterbox to the shot's
  // aspect ratio in camera view.
  useEffect(() => {
    const renderer = rendererRef.current;
    const orbitCamera = orbitCameraRef.current;
    const sceneCamera = sceneCameraRef.current;
    const wrap = canvasWrapRef.current;
    if (!renderer || !orbitCamera || !sceneCamera || !wrap) return;
    const { width, height } = containerSize;
    if (width === 0 || height === 0) return;

    let renderWidth = width;
    let renderHeight = height;

    if (viewMode === 'camera' && scene) {
      const targetAspect = aspectRatioToNumber(
        scene.camera.aspectRatio === '[?]' ? '16:9' : scene.camera.aspectRatio,
      );
      const containerAspect = width / height;
      if (containerAspect > targetAspect) {
        renderHeight = height;
        renderWidth = height * targetAspect;
      } else {
        renderWidth = width;
        renderHeight = width / targetAspect;
      }
    }

    wrap.style.width = `${renderWidth}px`;
    wrap.style.height = `${renderHeight}px`;
    renderer.setSize(renderWidth, renderHeight);
    orbitCamera.aspect = renderWidth / renderHeight;
    orbitCamera.updateProjectionMatrix();

    if (scene) {
      const aspect = aspectRatioToNumber(
        scene.camera.aspectRatio === '[?]' ? '16:9' : scene.camera.aspectRatio,
      );
      sceneCamera.aspect = aspect;
      sceneCamera.fov = focalLengthToVerticalFov(num(scene.camera.focalLength, 50), aspect);
      sceneCamera.updateProjectionMatrix();
    }
  }, [containerSize, viewMode, scene]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-dashed border-zinc-700 bg-black"
    >
      <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
        <button
          onClick={() => setViewMode(viewMode === 'free' ? 'camera' : 'free')}
          className="rounded bg-zinc-800/90 px-3 py-1 text-xs font-semibold text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700"
        >
          {viewMode === 'free' ? 'View: Free' : 'View: Camera'}
        </button>
        {viewMode === 'camera' && scene && (
          <span className="rounded bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-400 ring-1 ring-zinc-700">
            {num(scene.camera.focalLength, 50)}mm · {scene.camera.aspectRatio}
          </span>
        )}
      </div>
      {gltfWarning && (
        <div className="absolute bottom-2 left-2 right-2 z-10 rounded bg-red-950/80 px-2 py-1 text-[11px] text-red-300 ring-1 ring-red-800">
          {gltfWarning}
        </div>
      )}
      <div className="flex h-full w-full items-center justify-center">
        <div ref={canvasWrapRef} />
      </div>
      {!scene && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
          Parse a prompt or load a scene to see the viewport.
        </div>
      )}
    </div>
  );
}
