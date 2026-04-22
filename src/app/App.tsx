import { useMemo } from "react";
import { AppletHostAdapter } from "../core/host";
import { EMFieldsConductorsCanvas } from "../applets/em_fields_conductors/EMFieldsConductorsCanvas";

export function App(): JSX.Element {
  const host: AppletHostAdapter = useMemo(
    () => ({
      onClose: () => {},
      readReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }),
    []
  );

  return (
    <div className="app-shell">
      <main>
        <section className="modal card">
          <EMFieldsConductorsCanvas host={host} />
        </section>
      </main>
    </div>
  );
}
