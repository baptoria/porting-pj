import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8o',outputDir:'artifacts/phase9-8o/browser',reporter:[['list']]});
