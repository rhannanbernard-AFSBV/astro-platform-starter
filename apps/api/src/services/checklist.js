/**
 * Build operational crew checklist + AI audit prompts for high-risk zones.
 */

const HIGH_RISK_AUDIT_TEMPLATES = {
  default:
    'AI Audit: Capture a clear photo of this zone after cleaning. Confirm all listed tasks are complete and no soil remains on high-touch surfaces.',
  medical:
    'AI Audit (medical): Photograph sealed bio-hazard bins, disinfectant contact times if labeled, and clear floor pathways. Flag any unsecured sharps containers.',
  restroom:
    'AI Audit (restroom): Photo-verify toilets, sinks, and dispensers are disinfected and restocked. Confirm floor is dry and odor-free.',
  kitchen:
    'AI Audit (kitchen): Photograph food-contact surfaces after sanitizing. Verify trash liners replaced and grease traps/areas wiped.',
};

function pickAuditPrompt(zone) {
  const name = `${zone.room_zone} ${zone.risk_reason || ''}`.toLowerCase();
  if (/medical|clinic|bio|first-?aid|exam/.test(name)) {
    return HIGH_RISK_AUDIT_TEMPLATES.medical;
  }
  if (/restroom|toilet|lavatory|washroom/.test(name)) {
    return HIGH_RISK_AUDIT_TEMPLATES.restroom;
  }
  if (/kitchen|break.?room|pantry|cafe/.test(name)) {
    return HIGH_RISK_AUDIT_TEMPLATES.kitchen;
  }
  return HIGH_RISK_AUDIT_TEMPLATES.default;
}

/**
 * Chronological route: keep model order (already top-to-bottom / L→R) and enrich.
 * @param {Array} roomZones
 */
export function buildCrewChecklist(roomZones = []) {
  return roomZones.map((zone, index) => {
    const isHighRisk = Boolean(zone.is_high_risk);
    const tasks = [...(zone.suggested_tasks || [])];
    if (isHighRisk && !tasks.some((t) => /PPE|photo|audit/i.test(t))) {
      tasks.push('Complete AI audit photo verification before marking done');
    }
    return {
      sequence: index + 1,
      room_zone: zone.room_zone,
      tasks,
      is_high_risk: isHighRisk,
      ai_audit_prompt: isHighRisk ? pickAuditPrompt(zone) : null,
    };
  });
}
