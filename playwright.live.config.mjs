import base from './playwright.config.mjs';
const deployedURL = process.env.KIOSK_DEPLOYMENT_URL;
export default {
  ...base,
  testDir: './tests/live-browser',
  workers: 1,
  ...(deployedURL && {use: {...base.use, baseURL: deployedURL}, webServer: undefined})
};
