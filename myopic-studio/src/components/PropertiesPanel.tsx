import React from 'react';
import { characterIndex, PathSegment, propIndex, useSceneStore } from '../store/sceneStore';
import type {
  AspectRatio,
  CameraAngle,
  CameraMovement,
  LightingScheme,
  MeshRef,
  MoodPreset,
  PrimitiveShape,
  Setting,
  ShotType,
  TimeOfDay,
} from '../types/scene';
import {
  CheckboxField,
  ColorField,
  inputClass,
  NumberField,
  PanelSection,
  Row,
  SelectField,
  TextField,
} from './fields';
import POSES from '../poses.json';
import PROPS from '../props.json';

const SETTING: Setting[] = ['Interior', 'Exterior'];
const TIME_OF_DAY: TimeOfDay[] = ['Dawn', 'Morning', 'Midday', 'Dusk', 'Night'];
const LIGHTING_SCHEME: LightingScheme[] = ['Natural', 'Studio', 'Dramatic', 'Practical'];
const MOOD_PRESET: MoodPreset[] = ['Noir', 'Golden Hour', 'Overcast', 'Neon Night', 'High Key', 'Neutral'];
const SHOT_TYPE: ShotType[] = ['ECU', 'CU', 'MCU', 'MS', 'MLS', 'LS', 'ELS'];
const CAMERA_ANGLE: CameraAngle[] = ['Eye Level', 'Low', 'High', 'Dutch', "Bird's Eye", "Worm's Eye"];
const CAMERA_MOVEMENT: CameraMovement[] = ['Static', 'Pan', 'Tilt', 'Dolly', 'Crane', 'Handheld'];
const ASPECT_RATIO: AspectRatio[] = ['16:9', '2.39:1', '4:3', '1:1'];
const PRIMITIVE_SHAPE: PrimitiveShape[] = ['capsule', 'box', 'sphere', 'cylinder', 'cone'];

const DIMENSION_LABELS: Record<PrimitiveShape, string[]> = {
  capsule: ['radius', 'height'],
  box: ['width', 'height', 'depth'],
  sphere: ['radius'],
  cylinder: ['radiusTop', 'radiusBottom', 'height'],
  cone: ['radius', 'height'],
};

const DEFAULT_DIMENSIONS: Record<PrimitiveShape, number[]> = {
  capsule: [0.4, 1.8],
  box: [1, 1, 1],
  sphere: [0.5],
  cylinder: [0.5, 0.5, 1],
  cone: [0.5, 1],
};

type LibraryEntry = { name: string; path: string };

// UI sugar over the mesh reference (PRD section 11, v1.2 for poses, v1.3 for
// props): the mesh IS the pose / IS the object type, so selecting an entry
// rewrites the object's mesh to that entry's glTF path. There is no `pose` field
// and no `propType` field anywhere in the scene model — one control, two
// libraries, because they are the same idea applied to characters and to props.
function MeshLibrarySelector({
  label,
  library,
  fallbackLabel,
  fallback,
  path,
  mesh,
}: {
  label: string;
  library: readonly LibraryEntry[];
  fallbackLabel: string;
  fallback: MeshRef;
  path: PathSegment[];
  mesh: MeshRef;
}) {
  const setField = useSceneStore((s) => s.setField);

  const current = mesh.kind === 'gltf' ? library.find((e) => e.path === mesh.path) : undefined;
  const isCustomGltf = mesh.kind === 'gltf' && !current;
  const value = current ? current.name : isCustomGltf ? 'custom' : 'none';

  return (
    <Row label={label}>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === value || next === 'custom') return;
          // A custom glTF is a deliberate user attachment — confirm before replacing it.
          if (
            isCustomGltf &&
            !window.confirm(
              `Replace custom mesh "${mesh.kind === 'gltf' ? mesh.path : ''}" with a ${label.toLowerCase()}?`,
            )
          ) {
            return;
          }
          if (next === 'none') {
            setField(path, fallback);
          } else {
            const entry = library.find((p) => p.name === next);
            if (entry) setField(path, { kind: 'gltf', path: entry.path });
          }
        }}
      >
        <option value="none">{fallbackLabel}</option>
        {library.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
        {isCustomGltf && <option value="custom">(custom glTF)</option>}
      </select>
    </Row>
  );
}

function MeshEditor({ path, mesh }: { path: PathSegment[]; mesh: MeshRef }) {
  const setField = useSceneStore((s) => s.setField);

  if (mesh.kind === 'gltf') {
    return <TextField label="glTF Path" value={mesh.path} onChange={(v) => setField([...path, 'path'], v)} />;
  }

  return (
    <>
      <SelectField
        label="Shape"
        value={mesh.shape}
        options={PRIMITIVE_SHAPE}
        allowFlag={false}
        onChange={(shape) => setField(path, { kind: 'primitive', shape, dimensions: DEFAULT_DIMENSIONS[shape] })}
      />
      {DIMENSION_LABELS[mesh.shape].map((dimLabel, i) => (
        <NumberField
          key={dimLabel}
          label={`Dim: ${dimLabel}`}
          value={mesh.dimensions[i] ?? 0}
          step={0.1}
          min={0.01}
          onChange={(v) => {
            const next = [...mesh.dimensions];
            next[i] = v;
            setField([...path, 'dimensions'], next);
          }}
        />
      ))}
    </>
  );
}

export default function PropertiesPanel() {
  const scene = useSceneStore((s) => s.scene);
  const selection = useSceneStore((s) => s.selection);
  const setField = useSceneStore((s) => s.setField);

  if (!scene || !selection) {
    return (
      <div className="p-4 text-xs text-zinc-600">
        Select an object in the hierarchy to edit its parameters.
      </div>
    );
  }

  if (selection.kind === 'scene') {
    return (
      <PanelSection title="Scene">
        <TextField label="Title" value={scene.title} onChange={(v) => setField(['title'], v)} />
        <TextField
          label="Notes"
          value={scene.storyboardNotes}
          onChange={(v) => setField(['storyboardNotes'], v)}
        />
        <div className="mt-3 text-xs text-zinc-500">
          <div className="mb-1 font-semibold text-zinc-400">Original prompt (read-only)</div>
          <div className="rounded bg-zinc-900 p-2 text-zinc-400">{scene.prompt}</div>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === 'environment') {
    const { environment } = scene;
    return (
      <PanelSection title="Environment">
        <TextField
          label="Location"
          value={environment.locationName}
          onChange={(v) => setField(['environment', 'locationName'], v)}
        />
        <SelectField
          label="Setting"
          value={environment.setting ?? '[?]'}
          options={SETTING}
          onChange={(v) => setField(['environment', 'setting'], v)}
        />
        <SelectField
          label="Time of Day"
          value={environment.timeOfDay}
          options={TIME_OF_DAY}
          onChange={(v) => setField(['environment', 'timeOfDay'], v)}
        />
        <TextField
          label="Weather"
          value={environment.weather}
          onChange={(v) => setField(['environment', 'weather'], v)}
        />
      </PanelSection>
    );
  }

  if (selection.kind === 'lighting') {
    const { lighting } = scene;
    return (
      <PanelSection title="Lighting">
        <SelectField
          label="Scheme"
          value={lighting.scheme}
          options={LIGHTING_SCHEME}
          onChange={(v) => setField(['lighting', 'scheme'], v)}
        />
        <SelectField
          label="Mood Preset"
          value={lighting.moodPreset}
          options={MOOD_PRESET}
          onChange={(v) => setField(['lighting', 'moodPreset'], v)}
        />
        <NumberField
          label="Key Azimuth"
          value={lighting.keyLightAzimuth}
          min={0}
          max={360}
          onChange={(v) => setField(['lighting', 'keyLightAzimuth'], v)}
        />
        <NumberField
          label="Key Elevation"
          value={lighting.keyLightElevation}
          min={0}
          max={90}
          onChange={(v) => setField(['lighting', 'keyLightElevation'], v)}
        />
        <ColorField
          label="Key Color"
          value={lighting.keyLightColor}
          onChange={(v) => setField(['lighting', 'keyLightColor'], v)}
        />
        <NumberField
          label="Fill Intensity"
          value={lighting.fillIntensity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setField(['lighting', 'fillIntensity'], v)}
        />
        <CheckboxField
          label="Rim Light"
          value={lighting.rimLight}
          onChange={(v) => setField(['lighting', 'rimLight'], v)}
        />
        <NumberField
          label="Rim Intensity"
          value={lighting.rimIntensity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setField(['lighting', 'rimIntensity'], v)}
        />
        <NumberField
          label="Shadow Softness"
          value={lighting.shadowSoftness}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setField(['lighting', 'shadowSoftness'], v)}
        />
      </PanelSection>
    );
  }

  if (selection.kind === 'camera') {
    const { camera, characters } = scene;
    return (
      <PanelSection title="Camera">
        <SelectField
          label="Shot Type"
          value={camera.shotType}
          options={SHOT_TYPE}
          onChange={(v) => setField(['camera', 'shotType'], v)}
        />
        <SelectField
          label="Angle"
          value={camera.angle}
          options={CAMERA_ANGLE}
          onChange={(v) => setField(['camera', 'angle'], v)}
        />
        <NumberField
          label="Focal Length (mm)"
          value={camera.focalLength}
          min={1}
          onChange={(v) => setField(['camera', 'focalLength'], v)}
        />
        <NumberField
          label="Depth of Field (f-stop)"
          value={camera.depthOfField}
          min={0.5}
          step={0.1}
          onChange={(v) => setField(['camera', 'depthOfField'], v)}
        />
        <Row label="Focus Subject">
          <select
            className={inputClass}
            value={camera.focusSubjectId ?? ''}
            onChange={(e) => setField(['camera', 'focusSubjectId'], e.target.value || null)}
          >
            <option value="">(none)</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        </Row>
        <NumberField
          label="Position X"
          value={camera.position.x}
          step={0.1}
          onChange={(v) => setField(['camera', 'position', 'x'], v)}
        />
        <NumberField
          label="Position Y"
          value={camera.position.y}
          step={0.1}
          onChange={(v) => setField(['camera', 'position', 'y'], v)}
        />
        <NumberField
          label="Position Z"
          value={camera.position.z}
          step={0.1}
          onChange={(v) => setField(['camera', 'position', 'z'], v)}
        />
        <SelectField
          label="Movement"
          value={camera.movement}
          options={CAMERA_MOVEMENT}
          onChange={(v) => setField(['camera', 'movement'], v)}
        />
        <SelectField
          label="Aspect Ratio"
          value={camera.aspectRatio}
          options={ASPECT_RATIO}
          onChange={(v) => setField(['camera', 'aspectRatio'], v)}
        />
      </PanelSection>
    );
  }

  if (selection.kind === 'character') {
    const idx = characterIndex(scene, selection.id);
    const char = scene.characters[idx];
    if (!char) return null;
    const path: PathSegment[] = ['characters', idx];
    return (
      <PanelSection title={`Character — ${char.id}`}>
        <TextField label="Name" value={char.figureName} onChange={(v) => setField([...path, 'figureName'], v)} />
        <NumberField label="Position X" value={char.position.x} step={0.1} onChange={(v) => setField([...path, 'position', 'x'], v)} />
        <NumberField label="Position Y" value={char.position.y} step={0.1} onChange={(v) => setField([...path, 'position', 'y'], v)} />
        <NumberField label="Position Z" value={char.position.z} step={0.1} onChange={(v) => setField([...path, 'position', 'z'], v)} />
        <NumberField label="Rotation X" value={char.rotation.x} step={1} onChange={(v) => setField([...path, 'rotation', 'x'], v)} />
        <NumberField label="Rotation Y" value={char.rotation.y} step={1} onChange={(v) => setField([...path, 'rotation', 'y'], v)} />
        <NumberField label="Rotation Z" value={char.rotation.z} step={1} onChange={(v) => setField([...path, 'rotation', 'z'], v)} />
        <NumberField label="Scale" value={char.scale} step={0.05} min={0.01} onChange={(v) => setField([...path, 'scale'], v)} />
        <CheckboxField label="Visible" value={char.visible} onChange={(v) => setField([...path, 'visible'], v)} />
        <MeshLibrarySelector
          label="Pose"
          library={POSES}
          fallbackLabel="(none — capsule)"
          fallback={{ kind: 'primitive', shape: 'capsule', dimensions: DEFAULT_DIMENSIONS.capsule }}
          path={[...path, 'mesh']}
          mesh={char.mesh}
        />
        <MeshEditor path={[...path, 'mesh']} mesh={char.mesh} />
      </PanelSection>
    );
  }

  if (selection.kind === 'prop') {
    const idx = propIndex(scene, selection.id);
    const prop = scene.props[idx];
    if (!prop) return null;
    const path: PathSegment[] = ['props', idx];
    return (
      <PanelSection title={`Prop — ${prop.id}`}>
        <TextField label="Name" value={prop.propName} onChange={(v) => setField([...path, 'propName'], v)} />
        <NumberField label="Position X" value={prop.position.x} step={0.1} onChange={(v) => setField([...path, 'position', 'x'], v)} />
        <NumberField label="Position Y" value={prop.position.y} step={0.1} onChange={(v) => setField([...path, 'position', 'y'], v)} />
        <NumberField label="Position Z" value={prop.position.z} step={0.1} onChange={(v) => setField([...path, 'position', 'z'], v)} />
        <NumberField label="Rotation X" value={prop.rotation.x} step={1} onChange={(v) => setField([...path, 'rotation', 'x'], v)} />
        <NumberField label="Rotation Y" value={prop.rotation.y} step={1} onChange={(v) => setField([...path, 'rotation', 'y'], v)} />
        <NumberField label="Rotation Z" value={prop.rotation.z} step={1} onChange={(v) => setField([...path, 'rotation', 'z'], v)} />
        <NumberField label="Scale X" value={prop.scale.x} step={0.05} min={0.01} onChange={(v) => setField([...path, 'scale', 'x'], v)} />
        <NumberField label="Scale Y" value={prop.scale.y} step={0.05} min={0.01} onChange={(v) => setField([...path, 'scale', 'y'], v)} />
        <NumberField label="Scale Z" value={prop.scale.z} step={0.05} min={0.01} onChange={(v) => setField([...path, 'scale', 'z'], v)} />
        <CheckboxField label="Visible" value={prop.visible} onChange={(v) => setField([...path, 'visible'], v)} />
        <MeshLibrarySelector
          label="Proxy"
          library={PROPS}
          fallbackLabel="(none — primitive)"
          fallback={{ kind: 'primitive', shape: 'box', dimensions: DEFAULT_DIMENSIONS.box }}
          path={[...path, 'mesh']}
          mesh={prop.mesh}
        />
        <MeshEditor path={[...path, 'mesh']} mesh={prop.mesh} />
      </PanelSection>
    );
  }

  return null;
}
