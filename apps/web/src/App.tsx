import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { AgentCreatePage } from "./pages/AgentCreatePage";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { AgentsListPage } from "./pages/AgentsListPage";
import { RunJobsPage } from "./pages/RunJobsPage";

export function App() {
  return (
    <MantineProvider>
      <Notifications />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/agents" replace />} />
            <Route path="/agents" element={<AgentsListPage />} />
            <Route path="/agents/new" element={<AgentCreatePage />} />
            <Route path="/agents/:slug" element={<AgentDetailPage />} />
            <Route path="/run-jobs" element={<RunJobsPage />} />
            <Route path="*" element={<Navigate to="/agents" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
