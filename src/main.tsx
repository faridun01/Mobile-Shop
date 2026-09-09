import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent text/content extraction through the browser UI. This covers keyboard
// shortcuts, the context menu, dragging, and long-press selection on touch devices.
const preventContentCopy = (event: Event) => event.preventDefault();

for (const eventName of ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(eventName, preventContentCopy);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
