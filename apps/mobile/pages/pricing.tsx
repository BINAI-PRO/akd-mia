import { useEffect } from "react";
import { useRouter } from "next/router";

export default function LegacyPricingRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/plans");
  }, [router]);

  return null;
}
