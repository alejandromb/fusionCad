import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { MotorStarterCalculator } from './tools/MotorStarterCalculator';
import './index.css';

const path = window.location.pathname;
const isMotorStarterCalculator = path === '/tools/motor-starter-calculator' || path === '/tools/motor-starter-calculator/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMotorStarterCalculator ? <MotorStarterCalculator /> : <App />}
  </React.StrictMode>,
);
