/**
 * Lifts that need coaching before they belong in a plan: Olympic pulls and
 * their derivatives, pistol squats, muscle-ups, handstand work, the push
 * press, the Turkish get-up, kipping. A beginner's candidate pool excludes
 * them (`getCandidatesForGenerator({ excludeTechnical })`) and the coach
 * check flags them if one gets through. Shared by both so the rule has one
 * home; keep it free of imports.
 */
export const TECHNICAL_LIFT_NAME =
  /\b(snatch|power clean|hang clean|clean and jerk|clean & jerk|jerk|pistol squat|muscle-?up|handstand|push press|turkish get-?up|kipping|overhead squat)\b/i;
