import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_STUDIO_TIMEZONE } from "@/lib/timezone";

const StudioTimezoneContext = createContext<string>(DEFAULT_STUDIO_TIMEZONE);

type StudioTimezoneProviderProps = {
  value: string;
  children: ReactNode;
};

export function StudioTimezoneProvider({ value, children }: StudioTimezoneProviderProps) {
  return <StudioTimezoneContext.Provider value={value}>{children}</StudioTimezoneContext.Provider>;
}

export function useStudioTimezone(): string {
  return useContext(StudioTimezoneContext);
}
