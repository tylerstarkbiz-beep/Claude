import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { AppProvider } from './store';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MyWork } from './pages/MyWork';
import { Jobs } from './pages/Jobs';
import { JobDetailPage } from './pages/JobDetail';
import { Schedule } from './pages/Schedule';
import { Clients } from './pages/Clients';
import { ClientDetailPage } from './pages/ClientDetail';
import { BoardPage } from './pages/Board';
import { Automations } from './pages/Automations';
import { SettingsPage } from './pages/Settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="my-work" element={<MyWork />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="boards/:id" element={<BoardPage />} />
            <Route path="automations" element={<Automations />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="text-slate-500">Page not found.</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  </StrictMode>,
);
