# Runbook de rollback - node-b2b-orders

## Gatilhos

- pico de 5xx acima do baseline por 10 minutos
- criacao/confirmacao de pedido falhando de forma recorrente
- erros de integracao com RabbitMQ ou pagamento

## Procedimento

1. Congelar novas promocoes
2. Identificar ultima imagem/tag estavel de API e worker
3. Reverter API e worker para a mesma versao anterior
4. Validar `/v1/healthz` e `/v1/readyz`
5. Executar fluxo minimo de pedido (create -> confirm -> paid)
6. Confirmar consumo/publicacao de eventos no RabbitMQ

## Validacao pos-rollback

- `./scripts/smoke.sh` no ambiente alvo
- sem backlog critico em filas de order/payment
- incidente atualizado com causa raiz e acao preventiva
