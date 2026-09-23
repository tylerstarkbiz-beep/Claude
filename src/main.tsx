import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { DEMO } from './env';
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
import { Team } from './pages/Team';
import { Profitability } from './pages/Profitability';
import { RequirePerm } from './components/ui';
import { DailyLogDetail, DailyLogs } from './pages/DailyLogs';
import { Timesheets } from './pages/Timesheets';
import { Invoices } from './pages/Invoices';
import { InvoiceDetailPage } from './pages/InvoiceDetail';
import { PublicInvoicePage } from './pages/PublicInvoice';
import { TechShell } from './tech/TechShell';
import { TechHome } from './tech/TechHome';
import { TechDay } from './tech/TechDay';
import { TechJob } from './tech/TechJob';

// The demo runs inside a sandboxed frame where the URL can't carry routes.
const Router = DEMO ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <Router>
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
            <Route path="automations" element={<RequirePerm perm="manage_settings"><Automations /></RequirePerm>} />
            <Route path="daily" element={<DailyLogs />} />
            <Route path="daily/:userId/:date" element={<DailyLogDetail />} />
            <Route path="timesheets" element={<Timesheets />} />
            <Route path="invoices" element={<RequirePerm perm="view_financials"><Invoices /></RequirePerm>} />
            <Route path="invoices/:id" element={<RequirePerm perm="view_financials"><InvoiceDetailPage /></RequirePerm>} />
            <Route path="profitability" element={<RequirePerm perm="view_financials"><Profitability /></RequirePerm>} />
            <Route path="team" element={<RequirePerm perm="manage_team"><Team /></RequirePerm>} />
            <Route path="settings" element={<RequirePerm perm="manage_settings"><SettingsPage /></RequirePerm>} />
            <Route path="*" element={<div className="text-slate-500">Page not found.</div>} />
          </Route>
          <Route path="tech" element={<TechShell />}>
            <Route index element={<TechHome />} />
            <Route path="day" element={<TechDay />} />
            <Route path="jobs/:id" element={<TechJob />} />
          </Route>
          <Route path="pay/:token" element={<PublicInvoicePage />} />
        </Routes>
      </Router>
    </AppProvider>
  </StrictMode>,
);

// Offline shell + "Add to Home Screen" support for the tech app.
if ('serviceWorker' in navigator && import.meta.env.PROD && !DEMO) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
