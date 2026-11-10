import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/default-speed',testMatch:'menu-audio.spec.ts',outputDir:'artifacts/default-speed/developer',reporter:[['list']]});
