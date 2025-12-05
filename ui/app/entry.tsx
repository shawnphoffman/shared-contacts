import { StartClient } from '@tanstack/start';
import { createRouter } from './router';

const router = createRouter();

function InnerApp() {
  return <StartClient router={router} />;
}

export default InnerApp;

