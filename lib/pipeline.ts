import "server-only";

// Matching / digest orchestration. Filled in at the matching + cron stage.

/**
 * Called after a participant saves the form.
 * - firstSubmission && pool now complete -> onboarding-complete batch run
 * - pool already complete (an edit)       -> re-score assessed_unpublished listings
 */
export async function onPreferencesSaved(_participantId: string, _firstSubmission: boolean): Promise<void> {}
