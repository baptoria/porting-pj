import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-8l',outputDir:'artifacts/phase9-8l/browser',timeout:90000,reporter:[['list']]});
