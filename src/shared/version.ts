/**
 * Versão do serviço, em um único lugar: Swagger (`/docs`), contrato exportado, `/v1/ai/docs` e o atributo
 * `service.version` dos traços leem daqui. As releases 1.4.1 a 1.4.7 abriram a entrada no CHANGELOG sem mudar
 * a versão, e a API seguiu anunciando 1.0.0; `test/unit/version.spec.ts` prende esta constante ao
 * `package.json`, ao `docs/api/openapi.json` e à entrada mais recente do CHANGELOG, então a release falha na CI
 * se esquecer dela.
 */
export const SERVICE_VERSION = '1.4.9';
