#!/usr/bin/env node
// @flow

import {resolve, join, basename} from 'path';
import {exists, copydir, writeFile, readFile} from 'sander';
import mkdirp from 'mkdirp-then';
import chalk from 'chalk';
import args from 'args';
import execa from 'execa';
import ora from 'ora';
import {getInstallCmd} from '../utils';

const DEFAULT_CATALOG_DIR = 'catalog'

args.option(['d', 'catalog-dir'], 'Catalog directory within <app directory>', DEFAULT_CATALOG_DIR)

const cliOptions = args.parse(process.argv, {
  value: '<app directory>',
  name: 'create-catalog'
});

type Options = {
  catalogDir: string
}

const allDependencies = ['catalog@^3.0.0-rc.4', 'react', 'react-dom'];

const packageTemplate = (appName: string, catalogDir: string) => `{
  "name": "${appName}",
  "description": "",
  "dependencies": {},
  "scripts": {
    "catalog-start": "catalog start${catalogDir !== DEFAULT_CATALOG_DIR ? ` ${catalogDir}` : ''}",
    "catalog-build": "catalog build${catalogDir !== DEFAULT_CATALOG_DIR ? ` ${catalogDir}` : ''}"
  }
}`

const installPackagesCmd = (dependencies: Array<string>) => getInstallCmd() === 'yarn'
? `yarn add ${dependencies.join(' ')}`
: `npm install --save ${dependencies.join(' ')}`;

const spinner = ora();

const run = async (dir: string, {catalogDir}: Options) => {
  // const templateDir = resolve(__dirname, '..', '..', 'template');
  const catalogDirName = join(dir, catalogDir);
  const appDir = resolve(dir);
  const appName = basename(appDir);
  const catalogRootDir = resolve(catalogDirName);
  const appDirIsCwd = appDir === process.cwd();

  if (await exists(catalogRootDir)) {
    console.error(
      chalk`
  {yellow The directory "${catalogDirName}" already exists.}

  Some suggestions:

    - Maybe Catalog is already installed? Try starting it with {yellow catalog start}
    - Install Catalog in another directory using the {yellow --catalog-dir} option.
    - Delete "${catalogDirName}" and try again.

  For available options run {yellow create-catalog help}.
`);
    process.exit(1);
  }

  console.log(chalk`
  {green Setting up Catalog in} ${catalogDirName}
  `)

  await mkdirp(appDir);
  process.chdir(appDir);
  
  if (await exists(join(appDir, 'package.json'))) {
    // Already existing app

    let pkg = JSON.parse(await readFile(join(appDir, 'package.json'), {encoding: 'utf8'}));
    
    // Check for missing dependencies
    spinner.start('Checking dependencies');
    let missingDependencies = [];
    if (!pkg.dependencies) {
      missingDependencies = allDependencies;
    }
    if (!pkg.dependencies.catalog) {
      missingDependencies.push('catalog@^3.0.0-rc.4');
    }
    if (!pkg.dependencies.react) {
      missingDependencies.push('react');
    }
    if (!pkg.dependencies['react-dom']) {
      missingDependencies.push('react-dom');
    }

    // Install missing dependencies if any
    if (missingDependencies.length > 0) {
      spinner.text = `Installing ${missingDependencies.map(d => d.split('@')[0]).join(', ')}`;
      await execa.shell(installPackagesCmd(missingDependencies));
    }

    // Add catalog scripts
    if (!pkg.scripts || !pkg.scripts['catalog-start'] || !pkg.scripts['catalog-build']) {
      // Read again
      pkg = JSON.parse(await readFile(join(appDir, 'package.json'), {encoding: 'utf8'}));
      if (!pkg.scripts) {
        pkg.scripts = {}
      }
      Object.assign(pkg.scripts, {
        "catalog-start": `catalog start${catalogDir !== DEFAULT_CATALOG_DIR ? ` ${catalogDir}` : ''}`,
        "catalog-build": `catalog build${catalogDir !== DEFAULT_CATALOG_DIR ? ` ${catalogDir}` : ''}`
      });

      // Write back
      await writeFile(join(appDir, 'package.json'), JSON.stringify(pkg, null, 2));
    }

    spinner.succeed();    
  } else {
    // Fresh app
    spinner.start('Creating package.json')
    await writeFile(join(appDir, 'package.json'), packageTemplate(appName, catalogDir))
    spinner.succeed();
    
    spinner.start(`Installing ${allDependencies.map(d => d.split('@')[0]).join(', ')}`);
    await execa.shell(installPackagesCmd(allDependencies));
    spinner.succeed();
  }

  const templateDir = join(appDir, 'node_modules', 'catalog', 'dist', 'setup-template');
  if (!await exists(join(appDir, 'node_modules'))) {
    spinner.start('Installing dependencies');
    await execa.shell(`${getInstallCmd()} install`);
    spinner.succeed();
  }

  spinner.start('Creating Catalog files')
  await copydir(templateDir).to(catalogRootDir);
  spinner.succeed();
  
  if (appDirIsCwd) {
    console.log(chalk`
  {green Catalog is ready to go! 🙌}

  Run {yellow ${getInstallCmd()} run catalog-start} to get started.
`);
  } else {
    console.log(chalk`
  {green Catalog is ready to go! 🙌}

  Go to {yellow ${dir}} and run {yellow ${getInstallCmd()} run catalog-start} to get started.
`);
  }
  // Done!!
};

run(args.sub[0] || '.', cliOptions)
.catch(err => {
  spinner.fail();
  console.error(chalk.red('\n' + err.stack));
  process.exit(1);
});