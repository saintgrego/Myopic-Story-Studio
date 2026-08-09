import React from 'react';
import { PathSegment, useSceneStore } from '../store/sceneStore';
import type { Flagged } from '../types/scene';
import {
  DEFAULT_KELVIN,
  DEFAULT_LIGHT_COLOR,
  GELS,
  MAX_KELVIN,
  MIN_KELVIN,
  NO_GEL,
  gelledColor,
} from '../lib/lighting';
import { ColorField, inputClass, Row } from './fields';

/**
 * One control for every light colour in the scene (PRD §11 v1.6): key, fill, and rim
 * all bind the same component to a different path, the way `MeshEditor` serves both
 * characters and props. Adding a fourth light would be one more `<KelvinGelControl>`.
 *
 * Temperature and gel are *generators*, not stored state — the scene model holds one
 * hex per light and nothing else. Kelvin and gel choice live in component state and
 * are not persisted: two different (temperature, gel) pairs can produce the same hex,
 * and storing them would create a second source of truth for a light's colour, which
 * is the same trap PRD §11 v1.2 rejected for poses. The swatch is always the truth;
 * the sliders write into it.
 *
 * Consequence worth knowing: the sliders do not back-derive from a hex, so after
 * loading a scene (or typing a hex by hand) they read as their own last position
 * rather than as the field's value. Moving either one overwrites the field with the
 * generated colour.
 */
export default function KelvinGelControl({
  label,
  path,
  value,
}: {
  label: string;
  path: PathSegment[];
  value: Flagged<string> | undefined;
}) {
  const setField = useSceneStore((s) => s.setField);
  const [kelvin, setKelvin] = React.useState(DEFAULT_KELVIN);
  const [gelHex, setGelHex] = React.useState(NO_GEL.hex);
  const [strength, setStrength] = React.useState(1);

  const write = (k: number, gel: string, cut: number) => {
    setKelvin(k);
    setGelHex(gel);
    setStrength(cut);
    setField(path, gelledColor(k, gel, cut));
  };

  const gelSelected = GELS.some((g) => g.hex === gelHex) ? gelHex : NO_GEL.hex;

  return (
    <div className="border-t border-zinc-800 pt-1.5 first:border-t-0">
      <ColorField
        label={label}
        value={value ?? DEFAULT_LIGHT_COLOR}
        onChange={(v) => setField(path, v)}
      />
      <Row label="↳ Temp (K)">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={MIN_KELVIN}
            max={MAX_KELVIN}
            step={100}
            value={kelvin}
            onChange={(e) => write(e.target.valueAsNumber, gelHex, strength)}
            className="w-full accent-indigo-500"
          />
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-400">
            {kelvin}K
          </span>
        </div>
      </Row>
      <Row label="↳ Gel">
        <select
          className={inputClass}
          value={gelSelected}
          onChange={(e) => write(kelvin, e.target.value, strength)}
        >
          {GELS.map((gel) => (
            <option key={gel.name} value={gel.hex}>
              {gel.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="↳ Gel Cut">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => write(kelvin, gelHex, e.target.valueAsNumber)}
            className="w-full accent-indigo-500"
          />
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-400">
            {Math.round(strength * 100)}%
          </span>
        </div>
      </Row>
    </div>
  );
}
