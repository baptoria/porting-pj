import {defineConfig} from '@playwright/test';
import base from './playwright.phase9-8e.config';
export default defineConfig({...base,testDir:'tests/phase9-8m-update',outputDir:'artifacts/phase9-8m/update-browser',reporter:[['list']]});
