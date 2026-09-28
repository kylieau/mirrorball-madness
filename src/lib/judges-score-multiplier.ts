// judges_score_multiplier is not part of the Season Clock lock. It stays
// editable through draft setup (not_started and in_progress), including
// after the Grand Finale deadline, so start_draft can still auto-calibrate
// and a commissioner can still override it. It locks once the draft is
// complete. reset_draft returns draft_status to not_started, which lifts it.

export function judgesScoreMultiplierLocked(draftStatus: string): boolean {
  return draftStatus === "completed";
}

export function judgesScoreMultiplierHelp(draftStatus: string): string {
  if (judgesScoreMultiplierLocked(draftStatus)) {
    return "Locked — the draft is complete, so this multiplier can't change.";
  }
  if (draftStatus === "in_progress") {
    return "You can still change this until the draft is complete.";
  }
  return "Auto-calibrated to your roster size once the draft starts, unless you change it here first.";
}
