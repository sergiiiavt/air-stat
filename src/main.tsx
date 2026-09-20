import React from 'react';
import ReactDOM from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './theme.css';
import App from './App';
import ProgressPage from './ProgressPage';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const RootPage = pathname === '/progress' ? ProgressPage : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>,
);
