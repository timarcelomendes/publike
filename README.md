# Publike

**Vagas, bicos e serviços perto de você. De graça.**

Site do Publike, um mural de oportunidades de Goiânia e região: quem precisa publica, quem faz curte, e quando os dois se curtem (match) o WhatsApp aparece.

Feito com Next.js 16, Supabase (Postgres com PostGIS, login, fotos e tempo real) e MapLibre com mapas do OpenFreeMap.

---

## O que já funciona

- **Busca por perto**: mapa e lista, filtros (vaga ou serviço, categoria, contratação, distância, ordem) e "Perto de mim".
- **Publicar** vaga (CLT, temporário, diária, bico, estágio, PJ) ou serviço, com a região marcada no mapa. O endereço exato nunca é salvo: o ponto vira uma área de uns 500 m.
- **Curtir e dar match**: quem trabalha curte (com mensagem opcional), quem publicou curte de volta, e o WhatsApp dos dois aparece só aí.
- **Painel**: meus anúncios (pausar, encerrar, renovar, editar, excluir), quem curtiu, minhas curtidas e matches, mais o sino de avisos em tempo real.
- **Login sem senha**: e-mail (link mágico), Google, Facebook, LinkedIn e celular (SMS). Só o e-mail vem ligado; os outros você ativa quando quiser.
- **Perfil** com foto, "o que eu faço" e contato privado, e um **perfil público**.
- **Segurança**:
  - denúncias e moderação: 3 denúncias de pessoas diferentes tiram o anúncio do ar;
  - limites contra abuso: 10 anúncios por dia, 20 no ar, 60 curtidas por dia;
  - telefone, e-mail ou link do WhatsApp no texto são bloqueados.
- **LGPD**: página de privacidade e regras; excluir a conta apaga tudo na hora.
- **Google e celular**:
  - as vagas aparecem no Google for Jobs (dados estruturados), com sitemap e imagem de compartilhamento;
  - dá para instalar como app (PWA).
- **Modo demonstração**: sem o Supabase configurado, o site abre com anúncios de exemplo.

---

## 1. Rodar agora, em modo demonstração

Você precisa do **Node.js 20.9 ou mais novo** (recomendado: 22 LTS). No Mac: `brew install node`, ou baixe em [nodejs.org](https://nodejs.org).

```bash
cd ~/Developer/publike
npm install
npm run dev
```

Abra **http://localhost:3000**. Uma faixa amarela avisa que é o modo demonstração. Os anúncios são de exemplo e nada é salvo.

---

## 2. Criar o banco no Supabase (plano grátis)

1. Crie uma conta em [supabase.com](https://supabase.com) e um **New project**:
   - Região: **South America (São Paulo)**.
   - Guarde a senha do banco num lugar seguro.
2. No menu lateral, abra **SQL Editor**:
   - Cole o arquivo `supabase/migrations/20261007120000_publike.sql` inteiro.
   - Clique em **Run** e espere o "Success".
   - Isso cria as tabelas, as regras de segurança, a busca por distância, o espaço das fotos e a limpeza diária.
3. No topo do painel, clique em **Connect**. Copie a **Project URL** e a **Publishable key** (`sb_publishable_…`). Se o projeto só mostrar a chave `anon` antiga, ela também serve.
4. Na pasta do projeto, copie `.env.example` para um arquivo novo chamado `.env.local` e preencha:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

5. Pare o `npm run dev` (Ctrl+C) e rode de novo. A faixa amarela some e o site passa a usar o seu banco.

> O plano grátis pausa o projeto depois de uma semana sem uso. Para religar, é só entrar no painel. Para o lançamento, passe para o **Pro (US$ 25/mês)**: ele não pausa e tem backup diário.

---

## 3. Login

### E-mail (já funciona)

1. Em **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: adicione `http://localhost:3000/**` e, quando o site estiver no ar, `https://SEU-DOMINIO/**`.
2. Os modelos de e-mail (**Authentication → Emails**) só podem ser editados depois de configurar um SMTP próprio (veja a nota abaixo). Até lá, os e-mails saem no modelo padrão do Supabase, em inglês, e funcionam do mesmo jeito. Com o SMTP pronto, traduza os modelos **Magic link** e **Confirm signup**. Sugestão:

   ```html
   <h2>Seu link para entrar no Publike</h2>
   <p>Toque no botão abaixo para entrar. O link vale por 1 hora e funciona uma vez só.</p>
   <p><a href="{{ .ConfirmationURL }}">Entrar no Publike</a></p>
   <p>Se não foi você quem pediu, é só ignorar este e-mail.</p>
   ```

   Assuntos sugeridos: "Seu link para entrar no Publike" e "Confirme seu e-mail no Publike".

> O link precisa ser aberto **no mesmo navegador** em que a pessoa pediu.
>
> O envio de e-mail que vem com o Supabase é bem limitado (poucos e-mails por hora) e serve para testar. Antes de lançar, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**. Resend e Brevo, por exemplo, têm faixas gratuitas.

### Google, Facebook e LinkedIn (grátis)

Os três seguem o mesmo roteiro: criar um "app" na empresa, colar o ID e a chave dele no Supabase e ligar o botão no `.env.local`. O endereço de volta é o mesmo para os três:

```
https://SEU-PROJETO.supabase.co/auth/v1/callback
```

Ele aparece no Supabase em **Authentication → Sign In / Providers**, dentro de cada provedor, como **Callback URL**.

**Google**

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto e configure a **tela de consentimento OAuth**: nome Publike, e-mail de suporte e o link da política de privacidade (`https://SEU-DOMINIO/privacidade`).
2. Em **Credenciais → Criar credencial → ID do cliente OAuth**, escolha **Aplicativo da Web** e cole o endereço de volta em **URIs de redirecionamento autorizados**.
3. No Supabase, em **Authentication → Sign In / Providers → Google**, ative e cole o **Client ID** e o **Client Secret**.
4. No `.env.local`: `NEXT_PUBLIC_LOGIN_GOOGLE=true`.

**Facebook**

1. Em [developers.facebook.com](https://developers.facebook.com), vá em **Meus apps → Criar app** e escolha o caso de uso **Autenticar e solicitar dados de usuários com o Login do Facebook**.
2. Em **Login do Facebook → Configurações**, cole o endereço de volta em **URIs de redirecionamento do OAuth válidos** e salve.
3. Em **Casos de uso → Autenticação e criação de conta → Editar**, confira se `public_profile` e `email` estão lá. Sem o `email`, o login falha.
4. Em **Configurações do app → Básico**, copie o **ID do app** e a **Chave secreta do app**. Preencha também: URL da política de privacidade (`https://SEU-DOMINIO/privacidade`), URL de exclusão de dados (`https://SEU-DOMINIO/privacidade#apagar-dados`), ícone (o `publike-icone-app-1024.png` do kit da logo) e categoria.
5. No Supabase, em **Facebook**, ative e cole o ID do app (Client ID) e a chave secreta (Client Secret).
6. No `.env.local`: `NEXT_PUBLIC_LOGIN_FACEBOOK=true`.

> O app nasce em **modo de desenvolvimento**: só quem tem uma função no app (você e os testadores em **Funções do app**) consegue entrar. Para liberar para todo mundo, publique o app (modo **Ativo**). A Meta pode pedir uma análise da permissão `email`, que costuma levar de 1 a 5 dias úteis.

**LinkedIn**

1. Em [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps), clique em **Create app**. O LinkedIn pede uma **página** ligada ao app; se ainda não tiver, crie a página do Publike na hora.
2. Na aba **Products**, peça **Sign In with LinkedIn using OpenID Connect** (a liberação é imediata).
3. Na aba **Auth**, copie o **Client ID** e o **Client Secret** e cole o endereço de volta em **Authorized redirect URLs for your app**.
4. No Supabase, use o provedor **LinkedIn (OIDC)**: ative e cole o Client ID e o Client Secret.
5. No `.env.local`: `NEXT_PUBLIC_LOGIN_LINKEDIN=true`.

Depois de mudar o `.env.local`, pare o `npm run dev` (Ctrl+C) e rode de novo. O botão de cada rede só aparece quando a variável dela está `true` **e** o provedor está ativo no Supabase (o site confere sozinho, a cada poucos minutos).

> **Uma conta só.** Se a pessoa entra com o Google e depois pelo link mágico do mesmo e-mail, o Supabase junta as duas formas na mesma conta. No primeiro acesso, o nome da rede social já vem preenchido no perfil; a foto, não (a pessoa escolhe a dela).
>
> **Logos nos botões.** As marcas exigem o logo oficial, sem alteração. Baixe nas páginas de marca do [Google](https://developers.google.com/identity/branding-guidelines), do [Facebook](https://about.meta.com/brand/resources/facebook/logo/) e do [LinkedIn](https://brand.linkedin.com/downloads) e salve em `public/marcas/` como `google.svg`, `facebook.svg` e `linkedin.svg` (PNG também serve). Com o arquivo lá, o logo aparece sozinho no botão; sem ele, o botão mostra só o texto.

### Celular por SMS (pago por mensagem)

1. Em **Authentication → Sign In / Providers → Phone**, ative e escolha o provedor: Twilio, Twilio Verify, MessageBird, Vonage ou Textlocal. Cada SMS tem custo. Para provedores brasileiros, o Supabase aceita um "Send SMS Hook".
2. Para testar sem gastar, cadastre números de teste com código fixo, por exemplo `5562999999999=123456`. Apague esses números antes de lançar.
3. No `.env.local`, ligue `NEXT_PUBLIC_LOGIN_CELULAR=true` e reinicie.

---

## 4. Virar moderador

Entre no site e complete seu perfil. Depois, no **SQL Editor** do Supabase, troque o e-mail e rode:

```sql
insert into moderadores (perfil_id)
select id from auth.users where email = 'seu@email.com';
```

Se você entrou pelo celular, use `where phone = '5562999999999'`. Pronto: o item **Moderação** aparece no menu da sua conta.

---

## 5. Colocar no ar

**Render (Web Service Starter, US$ 7/mês)**

1. Envie o projeto para um repositório no GitHub e crie um **Web Service** no Render ligado a ele:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
2. Em **Environment**, crie as mesmas variáveis do `.env.local`, com `NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO`. As variáveis `NEXT_PUBLIC_…` entram no site na hora do build: depois de mudar uma delas, faça um novo deploy.
3. No Supabase, troque a **Site URL** pelo domínio e adicione `https://SEU-DOMINIO/**` nas Redirect URLs. Se usa Google, Facebook ou LinkedIn, confira também o domínio e os links de privacidade nos apps de cada um.

> A Vercel também serve, mas o plano grátis dela (Hobby) é só para uso não comercial. O Pro custa US$ 20/mês.

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Abre o site em http://localhost:3000 e atualiza sozinho enquanto você edita |
| `npm run build` | Gera a versão de produção (também confere os tipos) |
| `npm run start` | Roda a versão de produção |
| `npm run lint` | Procura problemas no código |
| `npm run typecheck` | Confere os tipos do TypeScript |

---

## Como o projeto está organizado

```
supabase/migrations/   o banco inteiro: tabelas, regras de segurança (RLS), funções e gatilhos
src/proxy.ts           renova a sessão e protege as páginas que exigem login
src/app/               as páginas (cada pasta é um endereço do site)
  page.tsx               início: busca com mapa e lista
  anuncio/[id]/          página do anúncio e denúncia
  publicar/              publicar vaga ou serviço
  painel/                meus anúncios, quem curtiu, curtidas, matches, editar
  perfil/                meu perfil e perfil público
  entrar/, auth/         login (e-mail, Google, Facebook, LinkedIn, celular)
  moderacao/             fila de denúncias
  como-funciona/, privacidade/
src/components/        peças da interface (cards, mapa, formulários, botões)
src/lib/
  dados.ts               leituras do banco (e os dados de exemplo no modo demonstração)
  acoes/                 o que muda dados: publicar, curtir, responder, denunciar…
  constantes.ts          categorias, tipos de contratação, cidades e bairros sugeridos
  validacao.ts           regras dos formulários
  login-social.ts        Google, Facebook e LinkedIn: nomes, provedores do Supabase e quais estão ligados
  supabase/              conexão com o Supabase e tipos do banco
src/app/globals.css    cores, fontes e estilos do Design System
public/logo/           a logo em SVG
public/marcas/         (você cria) logos oficiais do Google, Facebook e LinkedIn para os botões de login
```

**Design System.** As cores (terra, ipê, cerrado, like), as fontes (Bricolage Grotesque e Figtree) e os componentes seguem o Design System do Publike. Os tokens ficam em `src/app/globals.css`.

**Mudar o banco.** Crie um novo arquivo em `supabase/migrations/` com as mudanças e rode no SQL Editor (ou use `npx supabase db push`). Depois atualize os tipos em `src/lib/supabase/tipos-banco.ts`. Dá para gerar automaticamente com:

```bash
npx supabase gen types typescript --project-id SEU_ID > src/lib/supabase/tipos-banco.ts
```

**Regras importantes do banco**

- O contato (WhatsApp e e-mail) fica numa tabela que só o dono lê. Ele só sai pelas funções de match.
- O local do anúncio é arredondado para uma grade de ~500 m antes de ser salvo, e só vale dentro da região metropolitana.
- Anúncio fica 30 dias no ar. A limpeza diária usa o `pg_cron`; se ele não estiver ativo, os vencidos somem da busca do mesmo jeito.

---

## Antes de lançar

- [ ] Supabase no plano Pro e SMTP próprio para os e-mails
- [ ] Modelos de e-mail traduzidos
- [ ] Domínio próprio no Render e no Supabase (Site URL e Redirect URLs)
- [ ] `NEXT_PUBLIC_CONTATO_EMAIL` preenchido (aparece na página de privacidade)
- [ ] Textos de privacidade e regras revisados por um advogado
- [ ] Números de teste do SMS removidos
- [ ] Apps do Google, Facebook e LinkedIn publicados (fora do modo de teste), com os logos oficiais em `public/marcas/`
- [ ] Você cadastrado como moderador
