# AuditOps — melhorias implementadas

## Funcionalidades incluídas

- **Visão geral:** indicação visível de demonstração versus planilha processada, origem do arquivo, datas e explicação dos indicadores; atalhos para relatórios e histórico.
- **Setores:** ranking original preservado; “Ver produtos” agora abre uma janela modal sobreposta, sem expandir o conteúdo abaixo da tabela.
- **Colaboradores:** ranking original, participação no total de leituras atribuídas, “Ver leituras” em janela modal e exportação do ranking.
- **Corredores:** ranking original limitado aos 15 locais, participação sobre as pendências e “Ver produtos” em janela modal por local.
- **Tabelas de produtos e detalhes:** pesquisa, ordenação por cabeçalho, paginação configurável e exportação CSV do conjunto filtrado.
- **Atualizar dados:** prévia da aba reconhecida, contagem de linhas com conteúdo, contagem automática de códigos únicos na coluna `Código`, cabeçalhos, primeiras linhas e avisos de campos ausentes antes de processar.
- **Relatórios:** itens críticos em escopo Geral ou por classe/setor e relatório de colaboradores separado. O layout de impressão/PDF foi redesenhado com identidade visual, metadados, resumo executivo, KPIs, tabelas com cabeçalhos repetidos e hierarquia de leitura mais clara; os metadados adicionais dos produtos ficam agrupados junto ao nome para reduzir a quantidade de colunas.
- **Histórico:** instantâneos locais de até oito processamentos, remoção individual ou limpeza completa, restauração e comparação de KPIs e setores.
- **Desempenho:** a prévia reutiliza o workbook já lido para que a confirmação não precise ler e interpretar o arquivo Excel uma segunda vez; as tabelas grandes usam paginação.
- **Acessibilidade:** botões de ordenação navegáveis pelo teclado, alvos amplos, janelas modais com título/descrição acessíveis, fechamento por Escape e clique no fundo, e respeito à preferência de movimento reduzido já configurada no tema.
- **Fluxo de leituras:** reconhece a segunda coluna duplicada `Auditado em` (normalmente `Auditado em_1` no SheetJS) e converte horários numéricos do Excel em `HH:mm:ss`; agrupa por minuto e mostra leituras com horário, minutos ativos, pico e horário de pico. Quando não há dados válidos, mostra uma mensagem de diagnóstico em vez de um gráfico vazio.
- **Ranking de leituras:** matrícula e nome aparecem em múltiplas linhas, com área reservada suficiente para evitar cortes; o total de leituras é exibido no fim de cada barra. Em telas estreitas, o gráfico permite rolagem horizontal para manter os rótulos legíveis.

## Lógica preservada

Os cálculos e os critérios existentes não foram reescritos: parcial = não lidos ÷ SKU, categorias de situação, seleção de abas, ranking de setores, ordenação e limites originais de 30 produtos no ranking de alto estoque e 15 corredores permanecem. A única ampliação de `AuditResult` é a retenção complementar das linhas de origem para detalhamento, histórico e exportação; os indicadores continuam calculados como antes.

A correção do fluxo afeta somente a leitura/normalização do campo de horário e a visualização por minuto; não altera SKU, pendências, parcial nem a contagem original do ranking de colaboradores.

## Notas de uso

- O histórico é local ao navegador e não sincroniza automaticamente entre usuários ou computadores. O limite pode ficar abaixo de oito se o armazenamento do navegador for insuficiente.
- Para dados antigos sem as linhas de origem complementares, os detalhes ficam limitados ao que já havia sido salvo. Reimporte a planilha para habilitar o detalhamento completo.
- Para obter PDF, use **Relatórios → Gerar PDF** e selecione **Salvar como PDF** na janela de impressão do navegador.
- A primeira carga com dados simulados mostra o marcador **DEMONSTRAÇÃO**. Confirme que a origem é uma planilha real antes de usar os números para tomar decisões operacionais.

## Validação

Os arquivos TS/TSX foram transpilados com o compilador TypeScript global sem erros de sintaxe. O motor e a normalização foram validados isoladamente em tempo de execução: cabeçalho duplicado normalizado, horário numérico convertido, leituras agrupadas por minuto e horário legível nos detalhes. A planilha enviada contém 9.495 registros com usuário e horário reconhecidos, distribuídos em 380 minutos ativos após essa correção. A instalação das dependências não foi possível porque não estão no cache local; portanto, `npm test` e `npm run build` ainda precisam ser executados no ambiente de desenvolvimento após `npm install`.

## Referências de interface

- IBM Carbon, [Data Table — acessibilidade](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/accessibility): ordenação por teclado e interação com linhas.
- Carbon Design System, [Data Table — uso](https://v10.carbondesignsystem.com/components/data-table/usage/): pesquisa, paginação e ferramentas de tabela.
- W3C, [WCAG 2.2](https://www.w3.org/WAI/WCAG22/understanding/): alvos de interação e acessibilidade.

## Visão geral — detalhamento por cartão (10/10/2026)

- Os indicadores da Visão geral passaram a ser acessíveis como controles clicáveis por mouse e teclado, com indicação da ação disponível.
- SKU da base abre uma janela com a distribuição por classe raiz, códigos únicos por setor, total de linhas, participação da classe e acesso à lista de produtos de cada setor. O total base agora é calculado automaticamente a partir dos códigos únicos não vazios da coluna `Código` da planilha.
- Parcial, Não lidos, Lidos com estoque, Lidos sem estoque, Etiquetas desatualizadas e Lidos não pertence abrem janelas com os registros individuais que correspondem à situação reconhecida na planilha.
- Colaboradores ativos navega para a categoria Colaboradores.
- Os filtros das janelas são apenas para consulta; nenhuma regra de cálculo do motor foi alterada. Para auditorias salvas sem registros individuais, as janelas explicam que é necessário reimportar a planilha para reconstruir o detalhe.
- No tipo de auditoria Etiqueta, a métrica existente de "Lidos com estoque" continua calculada pela fórmula legado `SKU da base - Não lidos`. A janela lista as linhas identificadas explicitamente pela situação da planilha e informa essa diferença quando pertinente, sem alterar o KPI.

### Validação desta revisão

- Parse/transpilação sintática: 93 arquivos TypeScript/TSX sem erros de sintaxe.
- Testes isolados em runtime para os filtros de cartões (Presença e Etiqueta) e para a distribuição SKU por setor: aprovados.
- `npm test` e `npm run build` não puderam ser executados neste ambiente porque a pasta `node_modules` não está instalada (`vitest: not found` e `vite: not found`). Execute `npm install`, `npm test` e `npm run build` no computador de desenvolvimento antes de publicar.

## Comparação histórica e filtros globais inteligentes (12/10/2026)

- **Comparação entre auditorias:** o Histórico permite escolher uma auditoria base e outra de comparação, visualizar variação absoluta dos principais indicadores, comparar pendências por setor, leituras por colaborador e pendências por corredor/local, e exportar o comparativo para CSV. A tela alerta quando os tipos de auditoria não coincidem; os valores principais continuam sendo os instantâneos originais. Para corredores, o histórico respeita o limite de até 15 locais armazenados em cada instantâneo.
- **Filtros globais:** o cabeçalho disponibiliza busca textual mais seletores por setor/classe raiz, corredor/local, colaborador e situação. A combinação de filtros é aplicada aos rankings detalhados, gráficos de leituras, listas e modais, produtos relacionados, relatórios, comparações históricas detalhadas e exportações compatíveis.
- **Separação entre números oficiais e recortes:** os KPIs principais da auditoria permanecem inalterados e são identificados como totais originais; rankings e consultas explicam quando representam apenas o recorte filtrado. A origem dos dados e as fórmulas do motor não são modificadas.
- **Exportações com contexto:** CSVs e relatórios incluem os filtros ativos, quando aplicável, para registrar o escopo da consulta.
- **Testes adicionados:** `src/test/global-filters.test.ts` cobre filtros combinados, busca sem distinção de acentos, agrupamentos por setor/colaborador/corredor, reconstrução do fluxo e ausência de mutação dos registros de origem.

### Validação desta revisão

- A transpilação sintática TypeScript/TSX dos 96 arquivos passou sem erros.
- Testes isolados de runtime para filtros combinados, pesquisa sem acentos, agrupamentos filtrados e fluxo de leituras passaram.
- `npm test` e `npm run build` precisam ser executados após instalar as dependências no computador de desenvolvimento; este ambiente não tem `node_modules` instalado, portanto não confirma o build integral do aplicativo.


## Quantidade de SKU automática (13/10/2026)

- Ao selecionar uma planilha, a prévia mostra tanto o total de registros com conteúdo quanto o total de códigos de produto únicos na coluna `Código`.
- O campo de SKU é somente leitura; não precisa mais ser preenchido manualmente.
- O processamento recalcula o total de códigos únicos a partir das linhas efetivas do arquivo antes de calcular os indicadores, para não depender somente do valor exibido na prévia. Linhas sem código são ignoradas e códigos repetidos contam como um SKU.
- A planilha enviada para esta alteração possui 12.867 registros preenchidos e 12.301 códigos únicos.
- Foram adicionados testes unitários para códigos repetidos, valores vazios e ausência de códigos. Os arquivos TypeScript/TSX alterados passaram pela transpilação sintática. O build e a suíte completa ainda precisam ser executados no ambiente de desenvolvimento com as dependências instaladas.


## Exportações em PDF e Excel

- A navegação tem uma seção **Relatórios → Exportações**.
- A tela exporta o ranking de colaboradores ou as categorias SKU da base, Parcial, Não lidos, Lidos com estoque, Lidos sem estoque, Etiquetas desatualizadas (na auditoria Etiqueta) e Lidos não pertence.
- O PDF usa um modelo de impressão A4 em paisagem com marca, metadados da origem, filtros aplicados, indicadores e tabela detalhada. O navegador permite salvar a impressão como PDF.
- O Excel é gerado como `.xlsx` com duas abas: **Resumo** e **Detalhamento**. A aba detalhada tem cabeçalhos em português, larguras de coluna ajustadas e filtro automático.
- Para exportações de SKU da base, cada código não vazio aparece uma vez, preservando a primeira ocorrência.
- Os filtros globais e o setor selecionado são registrados no relatório e aplicados ao conjunto detalhado. O valor original dos cartões não é recalculado por filtros, preservando o comportamento da Visão geral.


## Comparação automática e segurança do histórico

- Nova aba **Comparação** em Análise de Auditorias. Seleciona a auditoria atual dentro dos filtros e sugere automaticamente a execução anterior da mesma categoria, consultando todo o histórico SQL mesmo quando a anterior fica fora do intervalo principal. Permite selecionar outra execução da mesma categoria como referência.
- Compara SKUs, pendências/não lidos, itens lidos com/sem estoque, itens não pertencentes, colaboradores ativos, percentual pendente e, em auditorias Etiqueta, etiquetas desatualizadas. Mostra diferença absoluta, variação relativa quando a base permite e mudanças por setor e usuário.
- Nova categoria **Segurança e recuperação** no menu. Permite listar e baixar backups SQLite e restaurar uma cópia depois da verificação de integridade e confirmação explícita.
- O backup é criado como snapshot consistente através de `VACUUM INTO`; antes de cada restauração, o sistema cria automaticamente uma cópia preventiva do banco atual. A restauração substitui, em uma transação, as tabelas de agenda, execuções e detalhes.
- Os arquivos ficam em `data/backups/`, que foi adicionada ao `.gitignore` para evitar empacotar backups operacionais junto com o código. Recomendação: baixar cópias periódicas para outro disco/local seguro.


## Perfil pessoal na seção Sobre

- A página **Sobre** foi reformulada como apresentação de Douglas dos Santos Freitas (MasterSabre), com a imagem de perfil fornecida, biografia profissional e projetos práticos.
- Foram adicionados links externos para GitHub, LinkedIn e WhatsApp.
- As tecnologias foram agrupadas por desenvolvimento web, dados/automação e infraestrutura/suporte, incluindo apenas tecnologias presentes nos projetos e ambientes mencionados.
- A apresentação destaca experiência com suporte de TI de varejo, automação GETIS/RUB e WhatsApp, plataforma AuditOps, monitoramento de impressoras e laboratório doméstico.
- O conteúdo é responsivo e mantém o tema e os componentes visuais já usados pelo AuditOps.


## Login, acessos personalizados e proteção de sessão

- O primeiro acesso cria a conta **master** com senha inicial de uso único entregue ao administrador; a troca de senha é obrigatória. O cadastro de outras contas só é permitido em **Acessos e usuários**, para o usuário mestre.
- Permissões explícitas por área: Visão geral, Setores, Colaboradores, Corredores, Calendário semanal, Análise de Auditorias, Exportações e Sobre. A navegação oculta áreas sem autorização e o servidor valida páginas e APIs, negando acesso por URL direta.
- Todos os usuários autorizados consultam o último processamento compartilhado do banco SQLite; os resultados não dependem do armazenamento local do navegador. Usuários sem permissão de áreas com dados não recebem o instantâneo do painel.
- Senhas são armazenadas por hash scrypt com salt aleatório. Sessões usam token aleatório em cookie HttpOnly/SameSite=Lax, expiração por inatividade configurável em 15, 20, 25 ou 30 minutos, e limite absoluto de 8 horas.
- Cinco falhas de senha em 15 minutos bloqueiam a conta por 15 minutos; a limitação complementar por IP só usa cabeçalhos de proxy quando `AUDITOPS_TRUST_PROXY=1`. O mestre pode desbloquear a conta, bloquear/reabilitar usuários e redefinir senha temporária, exigindo nova troca pelo usuário. Eventos de autenticação e administração são registrados no banco.
- A base continua em `data/auditops.sqlite` por padrão (personalizável com `AUDITOPS_DB_PATH`). Ela contém dados de auditoria e tabelas de autenticação; mantenha os backups fora do servidor além das cópias locais.
- SQLite recebe `busy_timeout` de 5 segundos para reduzir falhas temporárias quando operações de autenticação e gravações de auditoria acessam o mesmo arquivo simultaneamente.

### Credenciais de primeiro acesso

- Usuário mestre inicial: `5520991`
- Senha inicial: entregue ao administrador responsável pela instalação. Troque imediatamente no primeiro login; usuários adicionais devem ser cadastrados em **Acessos e usuários**.

### Validação desta revisão

- Transpilação sintática de 112 arquivos `.ts`/`.tsx`: sem erros.
- Testes de integração com SQLite em arquivo temporário: bootstrap do mestre, troca de senha obrigatória, cadastro de perfil com permissões específicas, bloqueio de endpoint não autorizado, leitura autenticada dos dados compartilhados, timeout em 15 minutos, bloqueio após cinco senhas erradas e desbloqueio administrativo: aprovados.
- A compilação de produção, lint e suíte completa ainda precisam ser executados após a instalação das dependências no ambiente de desenvolvimento.


## Login ampliado, presença de usuários e autenticador OTP

- A tela de login foi ampliada, não pré-preenche o usuário e utiliza transições de entrada/saída e animação discreta do logotipo (respeitando `prefers-reduced-motion`).
- A categoria `Minha conta` está disponível para qualquer usuário autenticado, mesmo que seu perfil tenha acesso a zero áreas de dados. Nela é possível configurar TOTP por QR gerado localmente, validar a configuração, desativar mediante senha + segundo fator e salvar códigos de recuperação de uso único.
- Usuários com autenticador ativo precisam apresentar TOTP ou um código de recuperação no login. O desafio dura cinco minutos e aceita no máximo cinco tentativas. O backend impede replay de códigos TOTP e o uso repetido de códigos de recuperação.
- Segredos TOTP são cifrados com AES-256-GCM. A chave criptográfica fica fora do SQLite em `data/auditops-otp-encryption.key` (ou no caminho definido por `AUDITOPS_OTP_KEY_PATH`); proteja e faça cópia segura desta chave junto com backups confiáveis. Perder a chave impede decifrar os autenticadores já cadastrados. Também é possível fornecer `AUDITOPS_OTP_ENCRYPTION_KEY` como 64 caracteres hexadecimais num ambiente gerenciado.
- A lista `Usuários cadastrados` exibe presença `Online`/`Offline` e estado `OTP ativo`/`OTP desativado`, atualizados automaticamente. A presença é separada do timestamp de atividade para não prorrogar o timeout de inatividade.
- A presença online significa sessão ativa e heartbeat recebido nos últimos 90 segundos; a aplicação continua a expirar sessões por inatividade no servidor.
- Novas colunas e tabelas OTP são migradas automaticamente ao abrir uma base já existente; usuários e permissões não são recriados.

## Revisão de segurança, dependências e testes (13/10/2026)

- Removidas todas as integrações, telemetrias e configurações do editor externo anterior, deixando a configuração do Vite independente.
- Vite foi configurado com os plugins TanStack Start, Nitro e React nativos; o pacote utiliza `@vitejs/plugin-react` 6, compatível com Vite 8, e `.npmrc` ativa `legacy-peer-deps` para evitar a resolução de peers que quebrava a instalação anterior.
- A dependência SheetJS é instalada pelo tarball oficial `xlsx` 0.20.3 em `cdn.sheetjs.com`, em substituição à versão 0.18.5 do registro npm.
- O script `pretest` executa o build antes de Vitest. O build cria a árvore automática `src/routeTree.gen.ts` e roda `tsc --noEmit` antes dos testes de roteamento.
- As proteções do servidor incluem rejeição de origens externas para métodos de mutação, cabeçalhos de segurança, CSP configurável em produção, respostas sensíveis sem cache e mensagens de erro genéricas ao cliente. Detalhes internos ficam no log do servidor.
- O corpo das requisições é limitado no servidor, planilhas acima de 50 MB são recusadas no cliente, textos são saneados antes de persistir, e os campos exportados para CSV são protegidos contra fórmulas de planilha.
- Banco, backups e chave OTP recebem permissões restritas do sistema operacional. Arquivos `.env` reais são ignorados pelo `.gitignore`, mantendo `.env.example` distribuível.
- A validação estática desta revisão transpilou 115 arquivos TypeScript/TSX sem erros de sintaxe. A checagem estrita isolada de `src/server.ts`, `auth-api.ts`, `audit-api.ts` e dependências locais passou sem erros.
- A instalação integral não foi concluída neste ambiente: o acesso ao registro npm falhou/expirou e não havia pacotes em cache. Por isso `npm test`, `npm run build`, lint, Prettier e a validação no navegador seguem pendentes e devem ser executados em uma máquina com acesso ao registro e à CDN oficial do SheetJS.


### Migração do usuário mestre para matrícula

- O login mestre inicial agora utiliza a matrícula `5520991`; não há senha fixa no código-fonte.
- Em uma instalação nova, uma senha aleatória de 20 caracteres é exibida uma única vez no terminal, e a troca é obrigatória.
- Se o banco já tiver a conta mestre antiga `master`, ela é migrada para a matrícula e recebe uma senha inicial nova, com todas as sessões encerradas.
- Se já houver uma conta comum com usuário `5520991`, ela é promovida a mestre (mantendo sua identidade e configuração OTP) e a antiga conta mestre é renomeada e desativada, preservando o histórico de eventos.
- A senha inicial jamais é gravada nos arquivos do ZIP; `AUDITOPS_MASTER_PASSWORD` pode ser usada em provisionamentos controlados.
