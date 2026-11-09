import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-4-ui',outputDir:'artifacts/phase9-4/ui',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-4/ui-tests.json'}]],timeout:60000});
