import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './ui/ThemeProvider.js';
import { I18nProvider } from './ui/I18nProvider.js';
import { Landing } from './routes/Landing.js';
import { Host } from './routes/Host.js';
import { Join } from './routes/Join.js';
import { Projection } from './routes/Projection.js';

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/host/*" element={<Host />} />
            <Route path="/join" element={<Join />} />
            <Route path="/projection" element={<Projection />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}
