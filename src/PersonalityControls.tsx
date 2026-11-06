import { Shuffle } from "lucide-react";
import {
  PERSONALITY_PRESETS, PERSONALITY_TRAITS, matchingPreset, randomPersonality,
  type Personality
} from "./personality";

type UpdatePersonality = (personality: Personality) => void;

export function PersonalityPresets({ value, onChange }: { value: Personality; onChange: UpdatePersonality }) {
  const active = matchingPreset(value)?.id;
  return <div className="preset-section">
    <div className="preset-heading">
      <strong>Quick presets</strong>
      <span>{active ? PERSONALITY_PRESETS.find(p => p.id === active)?.name : "Custom mix"}</span>
    </div>
    <div className="preset-grid">
      {PERSONALITY_PRESETS.map(preset => <button type="button" key={preset.id}
        className={active === preset.id ? "preset-button active" : "preset-button"}
        aria-pressed={active === preset.id}
        title={preset.description}
        onClick={() => onChange({ ...preset.values })}>
        <strong>{preset.name}</strong>
        <small>{preset.description}</small>
      </button>)}
    </div>
    <button type="button" className="randomize-button"
      title="Generate random personality slider values"
      onClick={() => onChange(randomPersonality())}>
      <Shuffle size={15}/> Randomize personality
    </button>
  </div>;
}

export function PersonalitySliders({ value, onChange }: { value: Personality; onChange: UpdatePersonality }) {
  return <div className="personality-slider-group">
    {PERSONALITY_TRAITS.map(trait => <div key={trait.key} className="setting-field personality-field">
      <label className="personality-label" htmlFor={`personality-${trait.key}`}>
        <span>{trait.label}</span>
        <output>{value[trait.key]}%</output>
      </label>
      <input id={`personality-${trait.key}`} type="range" min="0" max="100" step="5"
        value={value[trait.key]}
        onChange={event => onChange({ ...value, [trait.key]: Number(event.target.value) })}/>
      <div className="personality-extremes"><span>{trait.low}</span><span>{trait.high}</span></div>
    </div>)}
  </div>;
}
