import base from './playwright.config.mjs';
export default {...base,testDir:'./tests/live-browser',workers:1};
