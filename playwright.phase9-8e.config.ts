import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8e',outputDir:'artifacts/phase9-8e/browser',reporter:[['list'],['json',{outputFile:'artifacts/phase9-8e/tests.json'}]],use:{...base.use,baseURL:'http://localhost:4174/porting-pj/ed4/'},webServer:{command:'node scripts/serve-phase9-8e-test.mjs',url:'http://localhost:4174/porting-pj/ed4/',reuseExistingServer:false}});
