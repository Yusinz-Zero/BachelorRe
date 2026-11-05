import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout";
import { PlayPage } from "./pages/Play";
import { ComponentsPage } from "./pages/Components";
import { PatchesPage } from "./pages/Patches";
import { SavePage } from "./pages/Save";
import { LogsPage } from "./pages/Logs";
import { SettingsPage } from "./pages/Settings";
import { CreditsPage } from "./pages/Credits";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<PlayPage />} />
          <Route path="/components" element={<ComponentsPage />} />
          <Route path="/patches" element={<PatchesPage />} />
          <Route path="/save" element={<SavePage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/credits" element={<CreditsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
