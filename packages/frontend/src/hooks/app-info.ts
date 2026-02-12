import { useEffect, useMemo, useState } from "react";
import packageJson from "../../../../apps/home-assistant-matter-hub/package.json";

export interface AppInfo {
  name: string;
  version: string;
}

export function useAppInfo(): AppInfo {
  const [version, setVersion] = useState(__APP_VERSION__);

  useEffect(() => {
    fetch("api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.version) {
          setVersion(data.version);
        }
      })
      .catch(() => {});
  }, []);

  return useMemo(() => ({ name: packageJson.name, version }), [version]);
}
