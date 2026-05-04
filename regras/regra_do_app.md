# Regra do App — Órbita FATEC

## 1. Visão geral
O Órbita FATEC é um ecossistema de gestão institucional desenvolvido para a FATEC. O objetivo do sistema é centralizar o controle de ativos (empréstimos de equipamentos), gestão de usuários e permissões, ensalamento de salas de aula e controle de carga horária para eventos do RH. O sistema utiliza uma arquitetura baseada em módulos independentes que compartilham uma identidade visual e um núcleo de autenticação/autorização centralizado.

## 2. Estrutura de pastas
- `/` (Raiz): Contém o Hub principal (`index.html`), arquivos de configuração do Firebase, e o núcleo do layout compartilhado.
  - `layout.js` / `layout.css`: Geradores dinâmicos da interface global (Sidebar e Header).
  - `permissions.js`: Definição estática de módulos e cargos iniciais.
  - `firebase-config.js`: Credenciais de conexão com o Firebase.
  - `login.html` / `login.js`: Portal de acesso e autenticação.
- `/emprestimo`: Módulo de gestão de empréstimos de notebooks e equipamentos de T.I.
- `/usuarios`: Módulo de administração de usuários e configuração global de permissões (RBAC).
- `/ensalamento`: Módulo de visualização e gestão de ocupação de salas e laboratórios.
- `/rh/carga-horaria`: Módulo de controle de ponto e horas excedentes para eventos.
- `/img`: Ativos de imagem e logotipos.
- `/regras`: Documentação técnica e logs de alteração (Este diretório).

## 3. Fluxo de autenticação
1. **Entrada**: O usuário acessa a raiz. Se não houver sessão ativa (verificado via `onAuthStateChanged`), é redirecionado para `login.html`.
2. **Login**: Realizado via Firebase Auth (E-mail/Senha).
3. **Sessão**: Após o login, o sistema busca o documento do usuário na coleção `users` do Firestore para identificar seu cargo (`role`).
4. **Proteção de Tela**: Cada módulo utiliza um `auth-guard` (overlay de carregamento). O arquivo `layout.js` verifica se o cargo do usuário tem permissão para o módulo atual via `hasPermission()`. Se não tiver, o usuário é redirecionado de volta para o Dashboard.
5. **Logout**: O botão de sair (no Header injetado pelo `layout.js`) limpa a sessão no Firebase e redireciona para a tela de login.

## 4. Cargos e permissões
O sistema utiliza Role-Based Access Control (RBAC). Os cargos base definidos em `permissions.js` são:

- **ADM N1 (Super Admin)**: Acesso total a todos os módulos e configurações do sistema.
- **ADM N2 (Setor/Chefia)**: Acesso gerencial a Empréstimos, Usuários, Ensalamento e Carga Horária (com restrições dependendo da configuração global).
- **TI (Suporte)**: Foco em Empréstimos, Usuários (gestão técnica) e Ensalamento.
- **RH (Recursos Humanos)**: Acesso exclusivo ao Dashboard e Carga Horária.
- **Visitante**: Acesso apenas para consulta ao Dashboard (módulos básicos liberados).

*Nota: No módulo de Usuários, o ADM N1 pode ajustar granularmente as permissões de "Ver" e "Executar" para cada cargo nos diferentes módulos.*

## 5. Módulos do sistema

### Meu Espaço (Antigo Dashboard)
- **Caminho**: `/meu-espaco/index.html`, `meu-espaco.js`, `meu-espaco.css`
- **Finalidade**: Área personalizada de produtividade do usuário com notas pessoais, avisos institucionais e widgets contextuais.
- **Principais funções**: `setupNotes()` (CRUD de post-its), `setupNotices()` (avisos ADM N1), `renderWidgets()` (baseado em RBAC).
- **Dependências**: Firestore (coleções `users/{uid}/notes` e `institutionalNotices`).

### Empréstimos
- **Caminho**: `/emprestimo/index.html`, `/emprestimo/app.js`, `/emprestimo/emprestimo.css`
- **Finalidade**: Controle de retirada e devolução de equipamentos.
- **Principais funções**: Leitura de QR Code, filtros de status (Cedido, Disponível).
- **Dependências**: Firestore (coleção `items`).

### Usuários
- **Caminho**: `/usuarios/index.html`, `/usuarios/app.js`, `/usuarios/usuarios.css`
- **Finalidade**: Gestão de contas de acesso e configuração de permissões globais por cargo.
- **Principais funções**: `renderUsers()`, `setupMainTabs()`, `saveGlobalPermissions()`.
- **Dependências**: Firebase Auth (criação de contas via secondary app), Firestore (coleções `users` e `config/permissions`).

### Ensalamento
- **Caminho**: `/ensalamento/index.html`, `/ensalamento/ensalamento.js`, `/ensalamento/ensalamento.css`
- **Finalidade**: Mapa de ocupação de salas por período e curso.
- **Principais funções**: `renderOccupancyGrid()`, filtros por dia da semana.
- **Dependências**: Firestore (coleção `ensalamento`).

### Carga Horária
- **Caminho**: `/rh/carga-horaria/index.html`, `/rh/carga-horaria/carga-horaria.js`, `/rh/carga-horaria/carga-horaria.css`
- **Finalidade**: Registro de entrada/saída em eventos e cálculo de horas trabalhadas.
- **Principais funções**: Registro de timestamps, exportação de histórico.
- **Dependências**: Firestore (coleção `carga_horaria`).

## 6. Padrão visual
O sistema segue uma identidade visual institucional "Light Theme" moderna:
- **Cores Principais**:
  - Azul Marinho (`#031426`): Sidebar.
  - Azul Primário (`#0F4EB8`): Botões e destaques.
  - Laranja (`#F97316` / `#EB7025`): Acentos e alertas.
  - Fundo (`#F4F7FB`): Cor de fundo das páginas.
- **Componentes Globais**:
  - **Sidebar**: Lista de módulos permitidos e branding.
  - **Header**: Título do módulo, nível de acesso, avatar e botão de logout.
  - **Cards**: Fundo branco, bordas suaves (`12px` a `22px`), sombras sutis.
  - **Classes Globais**: `.btn-primary`, `.layout-wrapper`, `.layout-main`, `.layout-content`.

## 7. Regras de alteração
Sempre que um arquivo for criado, alterado ou removido, registrar aqui seguindo o modelo abaixo:

### [AAAA-MM-DD] Título da alteração
- Autor:
- Branch:
- Arquivos alterados:
- Tipo:
- Motivo:
- Impacto:
- Como testar:
- Como reverter:

## 8. Histórico de alterações

### [2026-05-04] Criação da documentação de regras do app
- Autor: Antigravity
- Branch: main (standard update)
- Arquivos alterados:
  - `/regras/regra_do_app.md`
- Tipo: criação
- Motivo: criar documentação técnica e registro de alterações do sistema para melhorar a manutenção e padronização.
- Impacto: Facilita a entrada de novos desenvolvedores e o controle de mudanças futuras.
- Como testar: Verificar a existência do arquivo na pasta `/regras` e validar a integridade dos links técnicos citados.
- Como reverter: Remover o diretório `/regras`.

### [2026-05-04] Criação do Meu Espaço
- Autor: Antigravity
- Branch: main (refactor)
- Arquivos criados:
  - `/meu-espaco/index.html`
  - `/meu-espaco/meu-espaco.css`
  - `/meu-espaco/meu-espaco.js`
- Arquivos alterados:
  - `index.html` (adicionado redirecionamento)
  - `login.js` (redirecionamento após login)
  - `permissions.js` (renomeado Dashboard para Meu Espaço)
  - `regras/regra_do_app.md` (documentação)
- Tipo: criação/alteração
- Motivo: substituir dashboard genérico por área personalizada do usuário focada em produtividade e avisos.
- Impacto: Melhora a utilidade da tela inicial e centraliza avisos institucionais de forma controlada.
- Como testar:
  - Logar no sistema e verificar se é levado para `/meu-espaco/index.html`.
  - Criar, editar e fixar uma nota pessoal no Quadro do Funcionário.
  - Logar como ADM N1 e criar um aviso no Quadro de Avisos.
  - Verificar se widgets de módulos aparecem corretamente conforme o cargo.
- Como reverter:
  - Restaurar redirecionamento no `login.js` e `index.html` para o hub original.
  - Reverter alterações de nome no `permissions.js`.

---
*Fim da documentação inicial.*
