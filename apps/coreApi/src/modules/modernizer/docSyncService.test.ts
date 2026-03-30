import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { DocSyncService } from './docSyncService';

function createDirEntry(name: string) {
  return {
    isDirectory: () => true,
    isFile: () => false,
    name,
  };
}

function createFileEntry(name: string) {
  return {
    isDirectory: () => false,
    isFile: () => true,
    name,
  };
}

describe('DocSyncService', () => {
  let service: DocSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocSyncService();
  });

  it('extracts controller routes and renders them into markdown', () => {
    const srcDir = '/fake/project/apps/coreApi/src';
    const modulesDir = '/fake/project/apps/coreApi/src/modules';
    const usersModuleDir = '/fake/project/apps/coreApi/src/modules/users';

    vi.mocked(fs.existsSync).mockImplementation((target) => {
      if (typeof target !== 'string') {
        return false;
      }

      return [srcDir, modulesDir, usersModuleDir].includes(target);
    });

    vi.mocked(fs.readdirSync).mockImplementation((target) => {
      if (target === modulesDir) {
        return [createDirEntry('users')];
      }

      if (target === usersModuleDir) {
        return ['usersController.ts'];
      }

      return [];
    });

    vi.mocked(fs.readFileSync).mockReturnValue(`
      @Controller('users')
      export class UsersController {
        @ApiOperation({ summary: 'List users' })
        @Get()
        list() {}

        @Post('invite')
        invite() {}
      }
    `);

    const markdown = service.generateDocs('/fake/project');

    expect(markdown).toContain('**Total endpoints: 2**');
    expect(markdown).toContain('| GET | `/api/v1/users` | List users | UsersController |');
    expect(markdown).toContain(
      '| POST | `/api/v1/users/invite` | POST /users/invite | UsersController |'
    );
  });

  it('returns a fallback document when the source directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const markdown = service.generateDocs('/fake/project');

    expect(markdown).toContain('No source directory found.');
  });

  it('returns an empty table when the modules directory does not exist', () => {
    const srcDir = '/fake/project/apps/coreApi/src';
    const modulesDir = '/fake/project/apps/coreApi/src/modules';

    vi.mocked(fs.existsSync).mockImplementation((target) => {
      if (typeof target !== 'string') {
        return false;
      }

      return target === srcDir;
    });

    const markdown = service.generateDocs('/fake/project');

    expect(markdown).toContain('**Total endpoints: 0**');
    expect(vi.mocked(fs.readdirSync)).not.toHaveBeenCalledWith(modulesDir, expect.anything());
  });

  it('ignores non-directory entries in the modules folder', () => {
    const srcDir = '/fake/project/apps/coreApi/src';
    const modulesDir = '/fake/project/apps/coreApi/src/modules';

    vi.mocked(fs.existsSync).mockImplementation((target) => {
      if (typeof target !== 'string') {
        return false;
      }

      return [srcDir, modulesDir].includes(target);
    });

    vi.mocked(fs.readdirSync).mockImplementation((target) => {
      if (target === modulesDir) {
        return [createFileEntry('README.md')];
      }

      return [];
    });

    const markdown = service.generateDocs('/fake/project');

    expect(markdown).toContain('**Total endpoints: 0**');
  });

  it('sorts generated endpoints by path and method', () => {
    const srcDir = '/fake/project/apps/coreApi/src';
    const modulesDir = '/fake/project/apps/coreApi/src/modules';
    const aDir = '/fake/project/apps/coreApi/src/modules/a';
    const bDir = '/fake/project/apps/coreApi/src/modules/b';

    vi.mocked(fs.existsSync).mockImplementation((target) => {
      if (typeof target !== 'string') {
        return false;
      }

      return [srcDir, modulesDir, aDir, bDir].includes(target);
    });

    vi.mocked(fs.readdirSync).mockImplementation((target) => {
      if (target === modulesDir) return [createDirEntry('b'), createDirEntry('a')];
      if (target === aDir) return ['aController.ts'];
      if (target === bDir) return ['bController.ts'];
      return [];
    });

    vi.mocked(fs.readFileSync).mockReturnValueOnce(`
        @Controller('zeta')
        export class BController {
          @Delete()
          remove() {}
        }
      `).mockReturnValueOnce(`
        @Controller('alpha')
        export class AController {
          @Post()
          create() {}
          @Get()
          list() {}
        }
      `);

    const markdown = service.generateDocs('/fake/project');
    const alphaGetIndex = markdown.indexOf('| GET | `/api/v1/alpha` | GET /alpha | AController |');
    const alphaPostIndex = markdown.indexOf(
      '| POST | `/api/v1/alpha` | POST /alpha | AController |'
    );
    const zetaDeleteIndex = markdown.indexOf(
      '| DELETE | `/api/v1/zeta` | DELETE /zeta | BController |'
    );

    expect(alphaGetIndex).toBeGreaterThan(-1);
    expect(alphaPostIndex).toBeGreaterThan(alphaGetIndex);
    expect(zetaDeleteIndex).toBeGreaterThan(alphaPostIndex);
  });

  it('supports controllers without a prefix and preserves explicit summaries', () => {
    const srcDir = '/fake/project/apps/coreApi/src';
    const modulesDir = '/fake/project/apps/coreApi/src/modules';
    const miscDir = '/fake/project/apps/coreApi/src/modules/misc';

    vi.mocked(fs.existsSync).mockImplementation((target) => {
      if (typeof target !== 'string') {
        return false;
      }

      return [srcDir, modulesDir, miscDir].includes(target);
    });

    vi.mocked(fs.readdirSync).mockImplementation((target) => {
      if (target === modulesDir) return [createDirEntry('misc')];
      if (target === miscDir) return ['miscController.ts'];
      return [];
    });

    vi.mocked(fs.readFileSync).mockReturnValue(`
      @Controller()
      export class MiscController {
        @ApiOperation({ summary: 'Ping root' })
        @Get()
        ping() {}
      }
    `);

    const markdown = service.generateDocs('/fake/project');

    expect(markdown).toContain('| GET | `/api/v1` | Ping root | MiscController |');
  });
});
