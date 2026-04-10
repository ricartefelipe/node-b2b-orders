import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { AppModule } from '../app.module';

async function main() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  app.setGlobalPrefix('v1');

  const config = new DocumentBuilder()
    .setTitle('node-b2b-orders')
    .setVersion('1.0.0')
    .addServer('http://localhost:3000', 'Local')
    .addBearerAuth()
    .build();

  const raw = SwaggerModule.createDocument(app, config) as unknown as Record<
    string,
    unknown
  >;
  const order = ['openapi', 'info', 'servers', 'paths', 'components', 'tags', 'security'];
  const document: Record<string, unknown> = {};
  for (const key of order) {
    if (key in raw) {
      document[key] = raw[key];
    }
  }
  for (const key of Object.keys(raw)) {
    if (!(key in document)) {
      document[key] = raw[key];
    }
  }
  fs.mkdirSync('docs/api', { recursive: true });
  fs.writeFileSync('docs/api/openapi.json', JSON.stringify(document, null, 2), 'utf8');
  fs.writeFileSync('docs/api/openapi.yaml', yaml.dump(document, { noRefs: true }), 'utf8');
  await app.close();
  console.warn('Exported docs/api/openapi.{json,yaml}');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
