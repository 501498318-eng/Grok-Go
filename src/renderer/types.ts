import type { ProviderProfile } from "../shared/types";

export type BusyAction = "validate" | "apply" | "restore" | null;
export type ProfileUpdater = <K extends keyof ProviderProfile>(
  key: K,
  value: ProviderProfile[K],
) => void;
