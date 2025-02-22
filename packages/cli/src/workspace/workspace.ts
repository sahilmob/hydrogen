import {join} from 'path';
import {writeFile, readFile, pathExists} from 'fs-extra';
import {promisify} from 'util';
import childProcess from 'child_process';
import {formatFile, merge} from '../utilities';

const exec = promisify(childProcess.exec);

interface DependencyOptions {
  dev?: boolean;
  version?: string;
}

interface Dependencies {
  dependencies: {
    [key: string]: string;
  };
  devDependencies: {
    [key: string]: string;
  };
}

interface Config {
  typescript?: boolean;
  componentsDirectory: string;
}

const DEFAULT_CONFIG = {
  componentsDirectory: './src/components',
};

export class Workspace {
  dependencies = new Map<string, DependencyOptions>();
  config: Config;
  _name?: string;
  _root: string;

  constructor({root, ...config}: Partial<Config> & {root: string}) {
    this._root = root;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  async commit() {
    await this.gitInit();

    const additionalScripts: Record<string, string> = {};
    const additionalConfigs: Record<string, string> = {};

    const dependencies = Array.from(
      this.dependencies.entries()
    ).reduce<Dependencies>(
      (acc, [name, {dev, version}]) => {
        if (dev) {
          acc.devDependencies[name] = version || 'latest';
        } else {
          acc.dependencies[name] = version || 'latest';
        }
        return acc;
      },
      {dependencies: {}, devDependencies: {}}
    );

    const baseScripts = {
      dev: 'vite',
      build: 'yarn build:client && yarn build:server',
      'build:client': 'vite build --outDir dist/client --manifest',
      'build:server':
        'vite build --outDir dist/server --ssr src/entry-server.jsx',
    };

    const linters = [
      this.dependencies.has('eslint') &&
        'eslint --no-error-on-unmatched-pattern --ext .js,.ts,.jsx,.tsx src',
      this.dependencies.has('stylelint') &&
        'stylelint ./src/**/*.{css,sass,scss}',
    ].filter((script) => script);

    if (linters.length) {
      additionalScripts['lint'] = linters.join(' && ');
    }

    if (this.dependencies.has('@shopify/prettier-config')) {
      additionalConfigs['prettier'] = '@shopify/prettier-config';
    }

    const existingPackageJson = (await pathExists(
      join(this.root(), 'package.json')
    ))
      ? JSON.parse(
          await readFile(join(this.root(), 'package.json'), {encoding: 'utf8'})
        )
      : {};

    const packageJson = JSON.stringify(
      merge(
        {
          name: this.name(),

          scripts: {
            ...baseScripts,
            ...additionalScripts,
          },
          ...dependencies,
          ...additionalConfigs,
        },
        existingPackageJson
      ),
      null,
      2
    );

    await writeFile(join(this.root(), 'package.json'), packageJson);
  }

  get packageManager() {
    return /yarn/.test(process.env.npm_execpath || '') ? 'yarn' : 'npm';
  }

  get isTypeScript() {
    return this.config.typescript || this.hasFile('tsconfig.json');
  }

  get componentsDirectory() {
    return this.config.componentsDirectory;
  }

  hasFile(path: string) {
    return pathExists(path);
  }

  name(name?: string) {
    if (name) {
      this._name = name;
      this._root = join(this._root, this._name);
    }

    return this._name || ``;
  }

  root() {
    return this._root;
  }

  install(dependency: string, options: DependencyOptions = {}) {
    if (this.dependencies.has(dependency)) {
      return;
    }

    this.dependencies.set(dependency, options);
  }

  async gitInit() {
    await exec(`git init`, {cwd: this._root});
    // TODO: Change the branch name to main and commit files
    await writeFile(
      join(this._root, '.gitignore'),
      formatFile(`
      node_modules
      .DS_Store
      dist
      dist-ssr
      *.local
      `)
    );
  }
}
