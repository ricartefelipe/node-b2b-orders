import * as fs from 'fs';
import * as path from 'path';

import { SERVICE_VERSION } from '../../src/shared/version';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8');

describe('versão do serviço', () => {
  it('é a mesma do package.json', () => {
    expect(JSON.parse(read('package.json')).version).toBe(SERVICE_VERSION);
  });

  it('é a do contrato OpenAPI publicado', () => {
    expect(JSON.parse(read('docs/api/openapi.json')).info.version).toBe(SERVICE_VERSION);
  });

  it('é a da entrada mais recente do CHANGELOG, para a release não esquecer dela', () => {
    const latest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(read('CHANGELOG.md'));
    expect(latest).not.toBeNull();
    expect(SERVICE_VERSION).toBe(latest![1]);
  });
});
