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
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  fs.mkdirSync('docs/api', { recursive: true });
  fs.writeFileSync('docs/api/openapi.json', JSON.stringify(document, null, 2), 'utf8');
  fs.writeFileSync('docs/api/openapi.yaml', yaml.dump(document, { noRefs: true }), 'utf8');
  await app.close();
  process.stdout.write('Exported docs/api/openapi.{json,yaml}\n');
}

main().catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
