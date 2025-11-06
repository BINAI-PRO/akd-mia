import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STUDIO_TIMEZONE } from "@/lib/timezone";
import {
  DEFAULT_PHONE_COUNTRY,
  type StudioPhoneCountry,
} from "@/lib/studio-settings-shared";

type StudioSettingsContextValue = {
  timezone: string;
  phoneCountry: StudioPhoneCountry;
};

const StudioSettingsContext = createContext<StudioSettingsContextValue>({
  timezone: DEFAULT_STUDIO_TIMEZONE,
  phoneCountry: DEFAULT_PHONE_COUNTRY,
});

type StudioSettingsProviderProps = {
  value: StudioSettingsContextValue;
  children: ReactNode;
};

export function StudioSettingsProvider({ value, children }: StudioSettingsProviderProps) {
  return <StudioSettingsContext.Provider value={value}>{children}</StudioSettingsContext.Provider>;
}

export function useStudioSettings(): StudioSettingsContextValue {
  return useContext(StudioSettingsContext);
}

export function useStudioTimezone(): string {
  return useStudioSettings().timezone;
}

export function useStudioPhoneCountry(): StudioPhoneCountry {
  return useStudioSettings().phoneCountry;
}
