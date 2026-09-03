/**
 * ADAPTED STUB — replaces OmniRoute "@/lib/services/registry" for the
 * NineRouter executor. OryphemRouter has no supervisor process manager, so
 * getSupervisor() always returns null → the executor reports "9router is not
 * running" (503) rather than attempting a direct forward.
 */
export function getSupervisor(_name) {
  return null;
}

export function listSupervisors() {
  return [];
}
