import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-3-ui',outputDir:'artifacts/phase9-3/ui',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-3/ui-tests.json'}]],timeout:60000});
