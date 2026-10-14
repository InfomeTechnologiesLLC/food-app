const profileFields = ["_id", "email", "plan", "preferences", "body", "training", "usage", "scheduleRevision", "onboarded", "createdAt", "updatedAt"] as const;

export function serializeAdminUser(user: Record<string, unknown>) {
  return Object.fromEntries(profileFields.filter((field) => field in user).map((field) => [field, user[field]]));
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bcryptPasswordFits(password: string) {
  return Buffer.byteLength(password, "utf8") <= 72;
}
