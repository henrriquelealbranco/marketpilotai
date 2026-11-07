# Identidade oficial — MarketPilot AI

A referência principal é [o styleboard enviado pelo usuário](brand/styleboard.png), incorporado em 07/11/2026. Ela substitui a direção azul inicialmente planejada. A arquitetura e as funcionalidades foram preservadas.

## Tokens oficiais

| Token              | Valor   | Uso                      |
| ------------------ | ------- | ------------------------ |
| --brand-primary    | #7C3AED | Ações e marca            |
| --brand-secondary  | #A855F7 | Gráficos e detalhes      |
| --brand-highlight  | #C084FC | Destaques no tema escuro |
| --brand-background | #0B0B12 | Fundo principal          |
| --brand-surface    | #181825 | Cards e painéis          |
| --brand-text       | #F5F5FA | Texto principal          |

Os tokens globais ficam em apps/web/src/app/globals.css. Os tokens semânticos --background, --surface, --foreground, --accent e --chart-* permitem tema claro consistente sem alterar a paleta da marca. Verde, âmbar e rosa são exclusivos de estado e sempre acompanhados de texto.

## Tipografia e hierarquia

Inter Variable empacotada por @fontsource-variable/inter; sem chamadas a fontes externas. Títulos com peso 550–650 e espaçamento discreto. Números financeiros usam algarismos tabulares. Texto explicativo preserva contraste nos dois temas. Foco visível e reduced-motion obrigatórios.

## Marca vetorial

O símbolo M usa uma trajetória contínua com pontas arredondadas e gradiente roxo/lilás, inspirado na referência. Não é um recorte da imagem nem uma reprodução tipográfica em pixels.

- apps/web/public/brand/logo-dark.svg: sidebar, login e futura landing em fundo escuro.
- apps/web/public/brand/logo-light.svg: fundo claro.
- apps/web/public/brand/mark.svg e mark-white.svg: símbolo isolado e versão monocromática.
- apps/web/public/brand/favicon.svg: favicon; também disponível pela convenção app/icon.svg.
- apps/web/public/brand/app-icon.svg: ícone da aplicação e manifest.
- components/logo.tsx: componente responsivo compartilhado com o mesmo símbolo.

Os wordmarks SVG usam Inter/Arial via texto escalável. A aplicação empacota Inter; ao usar os arquivos fora da aplicação, instale Inter para manter a tipografia. scripts/create-brand-assets.mjs reproduz os ativos.

## Componentes e operação

Sidebar escura, ativo roxo, bordas discretas, superfícies em camadas e iluminação sutil. Gráficos usam roxo secundário e lilás; receitas/custos não dependem apenas da cor para serem distinguidos. Botões e dialogs seguem primitives no padrão shadcn/ui com CVA, Slot e Radix.

AI Operations Center apresenta agentes planejados, progresso não iniciado e workflow estático. Painéis de feed, decisões e aprovações só recebem eventos reais quando suas integrações forem implementadas. Não há animação de execução sem processamento verdadeiro.

Layout responsivo: sidebar recolhível, drawer móvel e conteúdo em colunas que se reorganizam. A demonstração mantém identificação visível em todas as páginas. A landing completa fica na Fase 6 e reutilizará estes ativos e tokens.

## Relatórios

A API incorpora Inter Regular em TTF nos PDFs, com a licença SIL OFL no diretório de fontes. A instância deriva do Inter local da web; não depende de uma requisição de fonte externa. Claro/escuro usam os tokens correspondentes para manter contraste; capturas atuais estão em `docs/screenshots`.
