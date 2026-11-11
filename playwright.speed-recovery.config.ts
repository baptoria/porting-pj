import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/speed-recovery',timeout:90000,outputDir:'artifacts/phase9-8r-hf1/browser-'+(process.env.ED4_TEST_PUBLIC?'public':'developer'),reporter:[['list']]});
