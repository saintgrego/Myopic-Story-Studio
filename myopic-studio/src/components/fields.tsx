import React from 'react';

const FLAG = '[?]';

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[auto,1fr] items-center gap-3 py-1.5">
      <span className="text-xs text-zinc-400 whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 ring-1 ring-zinc-700 outline-none focus:ring-indigo-500';

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isFlagged = value === FLAG;
  return (
    <Row label={label}>
      <input
        className={inputClass}
        type="text"
        value={isFlagged ? '' : value}
        placeholder={isFlagged ? FLAG : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Row>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number | '[?]';
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const isFlagged = value === FLAG;
  return (
    <Row label={label}>
      <input
        className={inputClass}
        type="number"
        value={isFlagged ? '' : value}
        placeholder={isFlagged ? FLAG : undefined}
        min={min}
        max={max}
        step={step ?? 'any'}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </Row>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  allowFlag = true,
}: {
  label: string;
  value: T | '[?]';
  options: readonly T[];
  onChange: (v: T) => void;
  allowFlag?: boolean;
}) {
  return (
    <Row label={label}>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {allowFlag && <option value={FLAG}>{FLAG}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function CheckboxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-indigo-500"
      />
    </Row>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isFlagged = value === FLAG;
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888';
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-8 shrink-0 cursor-pointer rounded bg-zinc-900 ring-1 ring-zinc-700"
        />
        <input
          className={inputClass}
          type="text"
          value={isFlagged ? '' : value}
          placeholder={isFlagged ? FLAG : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Row>
  );
}

export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-800 p-4">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}
