import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'tests/phase9-2-ui',outputDir:'artifacts/phase9-2/ui',
 reporter:[['list'],['json',{outputFile:'artifacts/phase9-2/ui-tests.json'}]],timeout:60000});
