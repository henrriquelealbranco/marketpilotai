# Catálogos autorizados — Fase 2

O sistema importa conteúdo enviado pelo operador. Não consulta sites, não faz scraping e não presume APIs públicas de fornecedores. URLs são referências de origem; nunca são acessadas por esta importação.

## Preparar um arquivo

Limites: 512 KiB de texto UTF-8 decodificado e 500 produtos por lote. A interface permite escolher UTF-8 ou Windows-1252 antes da validação. UTF-16 e arquivos compactados não são aceitos. A importação exige marcar a declaração de autorização de uso da fonte.

| Campo         | Obrigatório | Formato                                                              |
| ------------- | ----------- | -------------------------------------------------------------------- |
| sku           | Sim         | Texto de 1–80 caracteres; zeros iniciais preservados                 |
| name          | Sim         | Nome de 2–160 caracteres                                             |
| cost          | Sim         | Valor positivo como `19,90` ou `19.90`, até 999999,99                |
| stock         | Sim         | Inteiro não negativo, até 10000000                                   |
| category      | Não         | Até 80 caracteres; padrão `Sem categoria`                            |
| shipping_days | Não         | Inteiro de 0–365; padrão 2 dias                                      |
| shipping_cost | Não         | Valor não negativo; padrão 0                                         |
| source_url    | Não         | URL HTTP/HTTPS com até 1000 caracteres, usada apenas como referência |

O SKU é único por fornecedor no workspace e diferencia maiúsculas de minúsculas. Cabeçalhos CSV não diferenciam maiúsculas. Os cabeçalhos são os nomes da tabela, sem campos extras. Um SKU repetido no mesmo arquivo invalida o lote inteiro. Valores monetários não aceitam separadores de milhar ou notação científica.

## CSV

Separadores aceitos: vírgula ou ponto e vírgula, detectados no cabeçalho. Campos entre aspas são interpretados pelo `csv-parse`; BOM UTF-8 é removido. Linhas vazias são ignoradas.

```csv
sku;name;cost;stock;category;shipping_days;shipping_cost;source_url
EXEMPLO-001;Produto fictício de exemplo;19,90;10;Casa;2;5,00;
```

O modelo para download contém um produto fictício. Substitua os valores por dados da fonte autorizada antes de importar para uma conta real.

## XML

Formato canônico, sem atributos, DTD, entidades personalizadas ou namespaces:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <product>
    <sku>EXEMPLO-001</sku>
    <name>Produto fictício de exemplo</name>
    <cost>19.90</cost>
    <stock>10</stock>
    <category>Casa</category>
    <shipping_days>2</shipping_days>
    <shipping_cost>5.00</shipping_cost>
  </product>
</catalog>
```

Elementos aninhados nos campos ou campos repetidos são rejeitados. O parser desabilita processamento de entidades; a leitura bloqueia DTD/ENTITY e profundidade maior que três antes da conversão. As entidades de texto `amp`, `lt`, `gt`, `quot` e `apos` são decodificadas como texto, que a interface renderiza com escape.

## Prévia, gravação e histórico

1. Selecionar um fornecedor ativo, arquivo, codificação e autorização.
2. Validar a prévia. Essa chamada não grava produtos.
3. Corrigir todos os erros indicados antes da importação.
4. Confirmar o lote. Novos SKUs criam produtos; SKUs existentes atualizam os dados desse fornecedor.

Não há exclusão implícita: produtos ausentes no arquivo permanecem no catálogo. Produtos arquivados precisam ser reativados explicitamente antes de uma importação que contenha seu SKU. Fornecedores arquivados não aceitam novos produtos ou importações.

O arquivo original não é armazenado. O banco registra hash SHA-256 do conteúdo e formato, fornecedor, nome do arquivo, responsável, data e contagens. Reenviar o mesmo conteúdo para o mesmo fornecedor retorna a importação anterior e não repete alterações. Conteúdo diferente com os mesmos valores gera uma importação sem alterações, sem duplicar snapshots.

Produtos, snapshots, importação e auditoria são gravados em transação serializável. Erro em qualquer etapa desfaz o lote. Edições manuais usam versão do registro para bloquear sobreposição de alterações. Históricos apresentam os últimos 100 snapshots por produto; a API de importações oferece paginação.

## API

- `GET/POST /v1/suppliers`, `GET/PUT /v1/suppliers/:id`, `PATCH /v1/suppliers/:id/archive`.
- `GET/POST /v1/products`, `GET/PUT /v1/products/:id`, `PATCH /v1/products/:id/archive`.
- `POST /v1/catalog/preview`, `POST /v1/catalog/import`, `GET /v1/catalog/imports`, `GET /v1/catalog/summary`.
- Listas: `q`, `status=ACTIVE|ARCHIVED|ALL`, `page`, `pageSize` até 100; produtos e importações aceitam `supplierId`.
- ADMIN/OPERATOR podem alterar; VIEWER consulta. O workspace sempre vem da sessão, não do corpo da solicitação.
- `/v1/demo/catalog/preview` apenas valida texto limitado, sem banco ou serviços externos. Aplicação da demonstração ocorre na memória do navegador.

## CNPJ e fontes técnicas

A validação opcional aceita o CNPJ numérico e o formato alfanumérico, com dígitos verificadores calculados localmente. Não verifica existência, situação cadastral ou autorização comercial. Algoritmo de caracteres ASCII menos 48 e exemplo alfanumérico seguem a [especificação da Receita Federal](https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=76192).

Parsing baseado em [csv-parse Sync](https://csv.js.org/parse/api/sync/) e [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), com restrições adicionais deste projeto. Não foram conectadas APIs de Dogama, Dropi ou outro fornecedor.
