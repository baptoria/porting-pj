import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,use:{...base.use,baseURL:'http://localhost:4173/porting-pj/ed4-dev/'},testDir:'tests/default-speed',testMatch:'menu-audio.spec.ts',outputDir:'artifacts/default-speed/developer',reporter:[['list']]});
