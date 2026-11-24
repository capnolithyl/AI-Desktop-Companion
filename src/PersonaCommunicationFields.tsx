import type { CompanionProfile } from "./companion-profile";
type VoiceFields=Pick<CompanionProfile,"systemPrompt"|"communication">;
/** Same controls in the native and NAS control centers. */
export function PersonaCommunicationFields({value,onChange}:{value:VoiceFields;onChange:(patch:Partial<VoiceFields>)=>void}) {
 return <section className="control-form-section" aria-label="Conversation and communication">          <label className="setting-field">System/persona prompt
            <textarea rows={9} value={value.systemPrompt}
              onChange={event => onChange({systemPrompt:event.target.value})}/>
            <small>Core personality instructions. Presets and sliders live in the separate Personality panel.</small>
          </label>
          <div className="settings-section-title">Communication preferences</div>
          <p className="settings-note">These instructions apply to every reply, even when personal memory retrieval doesn't find the relevant preference.</p>
          <label className="setting-field">How Mikan addresses you
            <select value={value.communication.addressMode}
              onChange={event => onChange({communication:{...value.communication,addressMode:event.target.value as typeof value.communication.addressMode}})}>
              <option value="endearments">Endearments and nicknames, not my first name</option>
              <option value="neutral">No names or nicknames</option>
              <option value="first-name">First name is okay</option>
            </select>
          </label>
          {value.communication.addressMode === "endearments" && <label className="setting-field">Preferred endearments
            <input value={value.communication.endearments} maxLength={240}
              placeholder="honey, sweetheart, darling"
              onChange={event => onChange({communication:{...value.communication,endearments:event.target.value}})}/>
            <small>Separate suggestions with commas. Mikan doesn't need to use one in every reply.</small>
          </label>}
          <label className="setting-field">Reply length
            <select value={value.communication.replyLength}
              onChange={event => onChange({communication:{...value.communication,replyLength:event.target.value as typeof value.communication.replyLength}})}>
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed when useful</option>
            </select>
          </label>
          <label className="setting-field">Follow-up questions
            <select value={value.communication.followUps}
              onChange={event => onChange({communication:{...value.communication,followUps:event.target.value as typeof value.communication.followUps}})}>
              <option value="necessary">Only when useful</option>
              <option value="natural">Conversational</option>
            </select>
          </label>
          <label className="setting-field">Other communication preferences
            <textarea rows={3} maxLength={1000} value={value.communication.customGuidance}
              placeholder="Optional instructions about how Mikan talks to you..."
              onChange={event => onChange({communication:{...value.communication,customGuidance:event.target.value}})}/>
            <small>These are behavioral preferences, not memories of facts about you.</small>
          </label>
          
</section>;
}
