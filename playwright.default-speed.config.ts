import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/default-speed',testMatch:'public.spec.ts',outputDir:'artifacts/default-speed/public',reporter:[['list']]});
