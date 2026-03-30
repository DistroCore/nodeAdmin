// eslint-disable-next-line @typescript-eslint/no-require-imports
import yargs = require('yargs/yargs');
import { hideBin } from 'yargs/helpers';
import { crudCommand } from './generate';

void yargs(hideBin(process.argv))
  .scriptName('generate:crud')
  .strict()
  .demandCommand(1)
  .command(crudCommand)
  .help()
  .parseAsync();
