import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  CHARACTER_CATEGORIES, type CharacterCategory, type CharacterFact
} from "./memory-client";

type Props = {
  facts: CharacterFact[];
  onAdd: (category: CharacterCategory, label: string, value: string) => Promise<void>;
  onEdit: (id: number, category: CharacterCategory, label: string, value: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

function CategorySelect({ value, onChange }: {
  value: CharacterCategory; onChange: (value: CharacterCategory) => void;
}) {
  return <select aria-label="Character detail category" value={value}
    onChange={event => onChange(event.target.value as CharacterCategory)}>
    {CHARACTER_CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
  </select>;
}

function characterDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString();
}

/** Mikan's explicit self-identity editor, kept separate from user memories. */
export function CharacterCanonTab({ facts, onAdd, onEdit, onDelete }: Props) {
  const [category, setCategory] = useState<CharacterCategory>("favorites");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState<CharacterCategory>("favorites");
  const [editLabel, setEditLabel] = useState("");
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(operation: () => Promise<void>) {
    if (working) return;
    setWorking(true);
    setError(null);
    try { await operation(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setWorking(false); }
  }

  return <>
    <p className="memory-explainer">
      These are <strong>Mikan's own</strong> established preferences, hobbies, and traits,
      not yours. Add them manually for now. They remain consistent across new chats
      and personality presets.
    </p>
    {error && <div className="memory-error" role="alert">{error}</div>}
    <form className="memory-add character-form" onSubmit={event => {
      event.preventDefault();
      if (!label.trim() || !value.trim()) return;
      void run(async () => {
        await onAdd(category, label, value);
        setLabel("");
        setValue("");
      });
    }}>
      <CategorySelect value={category} onChange={setCategory}/>
      <label className="character-field">Detail
        <input value={label} onChange={event => setLabel(event.target.value)}
          maxLength={80} placeholder="e.g. Favorite music" required/>
      </label>
      <label className="character-field">Mikan's answer
        <textarea value={value} onChange={event => setValue(event.target.value)}
          maxLength={500} rows={2} placeholder="e.g. Melodic metal and synthwave" required/>
      </label>
      <button className="save-button" type="submit"
        disabled={working || !label.trim() || !value.trim()}><Plus size={15}/> Add to Mikan's canon</button>
    </form>
    {!facts.length && <p className="memory-empty">
      Nothing established yet. For example, add Favorite color = Orange.
      Mikan can then recall it, even after restarting.
    </p>}
    {facts.map(fact => <article className="memory-item character-item" key={fact.id}>
      {editId === fact.id ? <>
        <div className="character-form character-edit">
          <CategorySelect value={editCategory} onChange={setEditCategory}/>
          <label className="character-field">Detail
            <input value={editLabel} maxLength={80} onChange={event => setEditLabel(event.target.value)}/>
          </label>
          <label className="character-field">Mikan's answer
            <textarea value={editValue} maxLength={500} rows={2} onChange={event => setEditValue(event.target.value)}/>
          </label>
        </div>
        <div className="memory-actions">
          <button type="button" disabled={working || !editLabel.trim() || !editValue.trim()}
            onClick={() => void run(async () => {
              await onEdit(fact.id, editCategory, editLabel, editValue);
              setEditId(null);
            })}><Check size={14}/> Save</button>
          <button type="button" disabled={working} onClick={() => setEditId(null)}><X size={14}/> Cancel</button>
        </div>
      </> : <>
        <div className="character-item-header">
          <strong>{fact.label}</strong>
          <span>{CHARACTER_CATEGORIES.find(cat => cat.id === fact.category)?.label ?? fact.category}</span>
        </div>
        <p>{fact.value}</p>
        <div className="memory-actions">
          <small>#{fact.id} · {characterDate(fact.updatedAt)}</small>
          <button type="button" disabled={working} onClick={() => {
            setEditId(fact.id);
            setEditCategory(fact.category);
            setEditLabel(fact.label);
            setEditValue(fact.value);
            setConfirmDelete(null);
          }}>Edit</button>
          {confirmDelete === fact.id ? <>
            <button type="button" disabled={working} className="memory-danger"
              onClick={() => void run(async () => { await onDelete(fact.id); setConfirmDelete(null); })}>
              Confirm delete
            </button>
            <button type="button" disabled={working} onClick={() => setConfirmDelete(null)}>Cancel</button>
          </> : <button type="button" disabled={working} onClick={() => setConfirmDelete(fact.id)}>
            <Trash2 size={13}/> Delete
          </button>}
        </div>
      </>}
    </article>)}
  </>;
}
