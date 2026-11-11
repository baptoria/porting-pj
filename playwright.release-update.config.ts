import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/release-update',timeout:180000,outputDir:'artifacts/phase9-8r/update',reporter:[['list']],use:{...base.use,baseURL:'http://localhost:4176'},webServer:{command:'node scripts/serve-release-test.mjs',url:'http://localhost:4176/porting-pj/ed4/',reuseExistingServer:false}});
