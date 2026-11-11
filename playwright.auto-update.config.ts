import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/auto-update',timeout:120000,outputDir:'artifacts/phase9-8r-hf2/browser',reporter:[['list']],use:{...base.use,baseURL:'http://localhost:4177'},webServer:{command:'node scripts/serve-auto-update-test.mjs',url:'http://localhost:4177/porting-pj/ed4/',reuseExistingServer:false}});
