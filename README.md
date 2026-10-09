# Publike

**Trabalho perto de casa. De graça.**

Site do Publike, uma ferramenta do povo para gerar emprego em Goiânia e região: quem procura acha vaga, diária ou freelance perto de casa (com a distância e o tempo de ônibus), e empresas de qualquer tamanho, do MEI à indústria, acham profissionais que moram perto. Quem precisa publica, quem faz curte, e quando os dois se curtem (match) o WhatsApp aparece. A missão está em `/missao`.

Feito com Next.js 16, Supabase (Postgres com PostGIS, login, fotos e tempo real) e MapLibre com mapas do OpenFreeMap.

---

## O que já funciona

- **Busca por perto**: mapa e lista, filtros (vaga ou serviço, categoria, contratação, distância, ordem) e "Perto de mim".
- **Publicar** vaga (CLT, temporário, diária, freelance, estágio, PJ) ou serviço. Na vaga, o CEP e o número levam o pino até a porta (BrasilAPI ou ViaCEP para o endereço, OpenStreetMap/Nominatim para o ponto) e preenchem cidade e bairro; a pessoa confere no mapa. Comércio, empresa e agência mostram o endereço na vaga, com o ponto exato e o link "Como chegar de ônibus". Vaga de pessoa física e de empresa confidencial guardam só uma área de uns 500 m, sem endereço. A próxima vaga já vem com o último endereço. Para testes, `VIACEP_URL` e `NOMINATIM_URL` trocam os endereços.
- **CEP de casa** em "Onde você mora?": o servidor acha o ponto do CEP (sem número) e guarda só uma grade de ~300 m (tabela `casas`, que só a própria pessoa lê; sem conta, fica num cookie). Com ele, a busca vai do mais perto ao mais longe a partir de casa, cada vaga mostra o tempo estimado de ônibus (ou a pé), e dá para filtrar "Até 30 min de ônibus". O tempo é uma estimativa pela distância (`src/lib/deslocamento.ts`), sem serviço pago de rotas.
- **Curtir e dar match**: quem trabalha curte (com mensagem opcional), quem publicou curte de volta, e o WhatsApp dos dois aparece só aí.
- **Desfazer match**: qualquer lado desiste com motivo e justificativa obrigatórios, e responde se toparia negociar em outro momento. O contato some para os dois; a outra pessoa vê o motivo, a equipe vê a justificativa na ficha da pessoa (e recebe aviso quando o motivo é comportamento). "Sim" deixa curtir e dar match de novo; "Não" bloqueia os dois de curtir os anúncios um do outro.
- **Painel**: meus anúncios (pausar, encerrar, renovar, editar, excluir), quem curtiu, minhas curtidas e matches, mais o sino de avisos em tempo real.
- **Login sem senha**: e-mail (link mágico), Google, Facebook, LinkedIn e celular (SMS). Só o e-mail vem ligado; os outros você ativa quando quiser.
- **Perfil** com foto, "o que eu faço" e contato privado, e um **perfil público**.
- **Agências de emprego e RH**: conta do tipo "Agência / RH", com CNPJ (aceita o CNPJ com letras). Cada vaga diz a empresa contratante ou "Empresa confidencial", e o CNPJ aparece no perfil e nas vagas com o link para conferir na Receita. A equipe confere o CNPJ e dá o selo de verificado (Admin > Usuários > "Agências a verificar"); verificada, a agência pode ter 200 vagas no ar e publicar 50 por dia. Trocar o CNPJ tira o selo. Comércio e empresa também podem informar o CNPJ (opcional). Com o número completo, o site busca os dados públicos na [BrasilAPI](https://brasilapi.com.br) (razão social, nome fantasia, situação, atividade, município e bairro) e oferece preencher o perfil; CNPJ baixado, inapto ou suspenso não é aceito. A ficha da conta no admin mostra os mesmos dados para a equipe comparar. Sem chave e sem custo; para testes, `BRASILAPI_URL` troca o endereço.
- **Descobrir** (`/descobrir`): as vagas uma de cada vez, em cartões para deslizar (direita curte, esquerda passa, para cima salva; também pelos botões e pelas setas do teclado). Cada cartão mostra quanto a vaga combina com a pessoa (de 1 a 99%) e por quê: perto de casa, a área do que ela faz, o horário, CNH, estudo. As regras não custam nada; com a ajuda da IA ligada (Admin > IA, "Ajuda da IA para quem usa o site"), a IA lê o "O que você procura?" e o currículo e afina a ordem (até 12 consultas por pessoa por dia, guardadas por 6 horas). Abas "No seu bairro" (bairro, região e cidade de quem procura), "Em alta" (curtidas e salvas da semana) e "Salvas"; a estrela de salvar também fica na página da vaga. Vaga passada some por 30 dias.
- **Currículo** para vagas CLT, estágio e temporárias: estudos, experiências, cursos, CNH, disponibilidade e PDF opcional (Storage privado). Só vê quem anunciou uma vaga que a pessoa curtiu; a vaga pode marcar "Pedir currículo", e aí só dá match com quem preencheu o currículo.
- **Admin** (só no seu computador): números do site, contas (suspender por 7 ou 30 dias, banir, reativar, selo de verificado), anúncios (corrigir, remover com motivo, apagar), denúncias, e-mails do site com textos editáveis, IA, moderadores e chaves.
- **E-mails do site** pelo Zoho: curtida, match, moderação e conta para quem usa o site; nova denúncia, novo cadastro e anúncio tirado do ar para a equipe.
- **IA (OpenAI)**: revisa cada anúncio novo e tira do ar o que parece golpe, cobrança, discriminação ou trabalho infantil; botão "Melhorar texto" ao publicar; resumo da semana no admin.
- **Segurança**:
  - denúncias e moderação: 3 denúncias de pessoas diferentes tiram o anúncio do ar;
  - limites contra abuso: 10 anúncios por dia, 20 no ar, 60 curtidas por dia (agência verificada: 50 por dia e 200 no ar);
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
4. Para a janela do Google mostrar o Publike, e não o endereço do Supabase: no mesmo ID do cliente, em **Origens JavaScript autorizadas**, adicione `http://localhost:3000`, `http://localhost` e o endereço do site (`https://SEU-DOMINIO`). Copie o **ID do cliente** para o `.env.local` em `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Com ele, o site usa o botão oficial do Google e o login acontece no próprio Publike.
5. No `.env.local`: `NEXT_PUBLIC_LOGIN_GOOGLE=true`.

**Facebook**

1. Em [developers.facebook.com](https://developers.facebook.com), vá em **Meus apps → Criar app** e escolha o caso de uso **Autenticar e solicitar dados de usuários com o Login do Facebook**.
2. Em **Login do Facebook → Configurações**, cole o endereço de volta em **URIs de redirecionamento do OAuth válidos** e salve.
3. Em **Casos de uso → Autenticação e criação de conta → Editar**, confira se `public_profile` e `email` estão lá. Sem o `email`, o login falha.
4. Em **Configurações do app → Básico**, copie o **ID do app** e a **Chave secreta do app**. Preencha também: URL da política de privacidade (`https://SEU-DOMINIO/privacidade`), URL de exclusão de dados (`https://SEU-DOMINIO/apagar-dados`; o Facebook abre o link para conferir, então só aceita depois que o site estiver no ar), ícone de 1024 × 1024 com **fundo transparente** (o Facebook recusa fundo branco) e categoria.
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
> **Logos nos botões.** As marcas exigem o logo oficial, sem alteração. Os três já estão em `public/marcas/` (`google.png`, `facebook.png` e `linkedin.png`), tirados das páginas de marca do [Google](https://developers.google.com/identity/branding-guidelines), do [Facebook](https://www.meta.com/brand/resources/facebook/logo/) e do [LinkedIn](https://brand.linkedin.com/downloads) e só reduzidos de tamanho. O botão do Google usa o logo do próprio Google; o `google.png` aparece só no botão reserva, quando o script do Google não carrega. Para trocar um logo, salve o novo arquivo com o mesmo nome (SVG também serve).

### Proteção contra robôs (Cloudflare Turnstile, grátis)

Sem ela, um robô pode pedir milhares de links de acesso: gasta os créditos do Zoho e suja a reputação do domínio (os e-mails passam a cair no spam). O site já está pronto; falta ligar, **nesta ordem** (ligar no Supabase antes do site deixa ninguém entrar por e-mail):

1. No [Cloudflare](https://dash.cloudflare.com/) (conta grátis), abra **Turnstile → Add widget**. Nome: `Publike`. Hostnames: `publike.org` e `localhost` (o site no seu computador usa o mesmo Supabase). Modo: **Managed**. Guarde a **Site key** (pública) e a **Secret key** (secreta).
2. Ponha a Site key em `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, no `.env.local` e na Vercel (Production). Faça um deploy e confira que o login por e-mail continua funcionando.
3. No Supabase, em **Authentication → Attack Protection**, ligue **Enable Captcha protection**, escolha **Turnstile by Cloudflare** e cole a Secret key. Salve.
4. Teste de novo pedir o link de acesso no publike.org e no `localhost`.

O que muda para quem usa: quase nada. A verificação fica invisível e só mostra uma caixinha quando o Cloudflare desconfia. Ela vale para o link por e-mail e o código por SMS; Google, Facebook e LinkedIn não passam por ela (o próprio provedor já confere). Se der problema, desligue no Supabase (passo 3) e o login volta ao normal na hora.

### Celular por SMS (pago por mensagem)

1. Em **Authentication → Sign In / Providers → Phone**, ative e escolha o provedor: Twilio, Twilio Verify, MessageBird, Vonage ou Textlocal. Cada SMS tem custo. Para provedores brasileiros, o Supabase aceita um "Send SMS Hook".
2. Para testar sem gastar, cadastre números de teste com código fixo, por exemplo `5562999999999=123456`. Apague esses números antes de lançar.
3. No `.env.local`, ligue `NEXT_PUBLIC_LOGIN_CELULAR=true` e reinicie.

---

## 4. Admin, e-mails e IA

### 4.1 Rodar a migração do admin

No **SQL Editor** do Supabase, cole `supabase/migrations/20261008120000_admin.sql` inteiro e clique em **Run**. Ela cria a suspensão de contas, a fila de e-mails, os textos dos e-mails, a moderação por IA e as funções do admin.

Depois, do mesmo jeito, rode `supabase/migrations/20261009120000_prioridade_local.sql`. Ela faz a busca mostrar primeiro os anúncios do bairro de quem procura, depois os da região (em Goiânia) e os da cidade. A pessoa escolhe onde mora em "Onde você mora?", na busca; quem tem conta já usa o bairro do perfil. As regiões de Goiânia ficam em `src/lib/regioes.ts`.

Por último, rode `supabase/migrations/20261009150000_servicos.sql`. Ela transforma "serviço" em oferta: o profissional monta a vitrine em **Meu painel > Meus serviços** (o que faz, preço ou "a combinar", fotos de trabalhos e onde atende), e cada serviço aparece separado na busca. Quem precisa contratar toca em "Quero contratar"; o profissional aceita e dá match. Ela também cria a pasta de fotos `trabalhos` no Storage. Os anúncios de serviço antigos (pedidos, do tempo de teste) são apagados.

Depois, rode `supabase/migrations/20261009180000_avaliacoes.sql`. Ela cria as avaliações: só avalia quem deu match com o serviço, com nota de 1 a 5 e comentário opcional; a média aparece a partir de 3 avaliações e o profissional responde uma vez. Com a moderação por IA ligada, todo comentário e toda resposta passam por ela antes de aparecer: texto com ofensa, ameaça, discriminação ou dados pessoais fica retido, quem escreveu leva uma advertência e o texto vai para **Admin > Denúncias > Avaliações**. De lá, a equipe publica ou remove; suspender ou banir continua na ficha da pessoa.

Por fim, rode `supabase/migrations/20261009200000_curriculos.sql`. Ela cria o currículo (tabela `curriculos` e a pasta privada `curriculos` no Storage, só PDF, até 5 MB) e a opção "Pedir currículo" na vaga. Quem vê: a própria pessoa e quem anunciou uma vaga que ela curtiu, enquanto a curtida existir. O PDF abre por link temporário de uma hora.

Depois, `supabase/migrations/20261009210000_config_where.sql`: corrige o **Salvar configurações** de E-mails e de IA no admin (o Supabase barra `UPDATE` sem `WHERE` pela API).

E `supabase/migrations/20261009230000_desfazer_match.sql`: o "Desfazer match", com motivo e justificativa (a justificativa só a equipe vê, em Admin > Usuários > ficha da pessoa). Depois dela, `20261009240000_negociar_depois.sql` (a pergunta "toparia negociar em outro momento?" e a regra de que vaga que pede currículo só dá match com quem preencheu).

Por último, `supabase/migrations/20261009250000_agencias.sql`: a conta de agência de emprego / RH, com CNPJ, a empresa contratante na vaga e os limites maiores para agência verificada. Rode **antes** de publicar o código novo: o site passa a ler a coluna `cnpj` e a chamar `salvar_perfil` com o CNPJ. O código antigo continua funcionando com o banco novo. Depois, `20261009260000_cnpj_empresas.sql` deixa comércio e empresa informarem o CNPJ, e `20261009270000_descobrir.sql` cria o Descobrir (salvas, vagas passadas, "O que você procura?" e o limite da IA). Por fim, `20261009280000_enderecos.sql`: endereço (CEP + número) nas vagas de comércio, empresa e agência, o CEP de casa (`casas`) e a busca do mais perto ao mais longe a partir de casa. Rode **antes** de publicar o código novo.

### 4.2 Abrir o admin (só no seu computador)

O admin não tem login: ele só existe no seu computador, com o site rodando em `npm run dev`. No site publicado, `/admin` não abre para ninguém além dos moderadores (veja 4.6).

1. No Supabase, em **Project Settings → API Keys → Secret keys**, crie uma chave secreta chamada `admin-mac` e copie.
2. No `.env.local` do seu computador, acrescente:

   ```bash
   PUBLIKE_ADMIN=1
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

3. Pare o `npm run dev` (Ctrl+C) e rode de novo. No terminal aparece:

   ```
   Admin do Publike (abra neste computador):
     http://localhost:3000/admin/entrar?chave=...
   ```

4. Abra esse link no navegador. Ele guarda um cookie que vale 30 dias neste navegador; depois disso, é só abrir **http://localhost:3000/admin** (o link **Admin** também aparece no topo do site). Se o cookie sumir ou vencer, o admin pede para abrir o link do terminal de novo.

Como fica protegido:

- As funções de admin do banco só aceitam a chave secreta. Nenhum login consegue chamá-las, nem o seu: quem invadir um e-mail não vira admin.
- O `npm run dev` só aceita conexões do próprio computador (ninguém na mesma rede Wi-Fi abre). Para testar o site no celular pela rede, use `npm run dev:rede`, que desliga o admin.
- O admin só liga em modo de desenvolvimento, com endereço local (localhost ou 127.0.0.1) e com o cookie do link do terminal. O link é feito a partir da chave secreta: se você trocar a chave, o link muda e o cookie antigo para de valer.
- **Nunca** coloque `SUPABASE_SECRET_KEY` ou `PUBLIKE_ADMIN` na hospedagem, nem mande a chave por chat ou e-mail. Se ela vazar, apague no Supabase e crie outra.

### 4.3 E-mails do site pelo Zoho CPaaS

Os e-mails saem pelo **Zoho CPaaS** (o antigo ZeptoMail), feito para e-mails automáticos. O domínio `publike.org` já está verificado lá: a chave DKIM (`8123133._domainkey`) e o CNAME de devolução (`bounce-zem`) estão no DNS. Em **Validação do cliente**, no menu da esquerda, responda o questionário: o Zoho revisa a conta para liberar todo o envio.

Usuário e senha ficam em **Agents → publike → SMTP/API**. O usuário é sempre `emailapikey`; a senha é a do Agent (botão de copiar ao lado de **Palavra-passe 1**).

- **Link de login (link mágico):** sai pelo Supabase. Em **Authentication → Emails → SMTP Settings**: servidor `smtp.zeptomail.com`, porta `465`, usuário `emailapikey`, a senha do Agent, remetente `nao-responda@publike.org` e nome `Publike`.
- **Avisos do site** (curtida, match, moderação, conta e avisos da equipe): saem pelo próprio site, com as mesmas credenciais:

```bash
SMTP_SERVIDOR=smtp.zeptomail.com
SMTP_PORTA=465
SMTP_USUARIO=emailapikey
SMTP_SENHA=...                            # a senha do Agent
SMTP_REMETENTE=nao-responda@publike.org   # quem aparece como remetente
```

Coloque no `.env.local` e, no site publicado, nas variáveis de ambiente da hospedagem. Depois, no admin, em **E-mails**:

- escolha quem recebe os avisos da equipe e clique em **Salvar configurações**;
- use **Enviar teste** para conferir. Se o Zoho recusar, confira a senha do Agent e se o remetente é do domínio verificado.

Os textos de cada e-mail são editados no próprio admin, com prévia. Quem não quiser os avisos desmarca a opção no perfil (avisos de suspensão da conta vão mesmo assim). Os avisos só vão para o e-mail de login confirmado da pessoa (quem entra só pelo celular não recebe e-mail).

Os links dos e-mails usam o endereço do site no ar. No seu computador o site é `localhost`, que não abre no celular de ninguém; por isso, enquanto você não disser o endereço público, o admin daqui só manda o e-mail de teste, e os avisos para as pessoas esperam o site publicado mandar (aviso parado há mais de 3 dias é cancelado). Quando o site estiver no ar, acrescente no `.env.local`:

```bash
PUBLIKE_URL_PUBLICA=https://publike.org   # o endereço do site no ar
```

No site publicado não precisa: lá o `NEXT_PUBLIC_SITE_URL` já é o endereço público (https).

### 4.4 Chave do servidor (para o site publicado)

O site publicado não guarda a chave secreta do Supabase. Para mandar os e-mails e rodar a IA, ele usa uma **chave do servidor**, que só serve para isso: não abre o admin nem lê os dados das pessoas.

1. No admin, em **Chaves**, dê um nome (por exemplo, `Vercel`) e clique em **Gerar chave**. Ela aparece uma vez só; o banco guarda só uma impressão dela.
2. Na hospedagem, crie a variável `PUBLIKE_CHAVE_SERVIDOR` com a chave e publique de novo.

No seu computador ela não é necessária: o site local usa a chave secreta.

### 4.5 IA (OpenAI)

1. Em [platform.openai.com](https://platform.openai.com), crie a conta, ponha créditos (em **Billing**) e, em **API keys**, crie uma chave.
2. Coloque `OPENAI_API_KEY=...` no `.env.local` e na hospedagem.
3. No admin, em **IA**, ligue o que quiser: moderação automática, botão "Melhorar texto" e resumo no painel. O modelo padrão é o GPT-6 Luna, o mais barato.

Custo aproximado com o GPT-6 Luna (US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de saída, em outubro de 2026): US$ 0,15 para revisar mil anúncios e US$ 0,35 para mil pedidos de "Melhorar texto". O GPT-6.1 Sol escreve melhor e custa de 20 a 40 vezes mais (ele raciocina antes de responder).

O site pede à OpenAI para não guardar o texto dos anúncios (`store: false`) e manda só o texto, nunca o contato de ninguém.

Anúncio que a IA acha suspeito sai do ar e vai para **Denúncias**, com o motivo. Quem publicou recebe um aviso de que o anúncio está em análise; você decide se remove (com o motivo, que vai para a pessoa) ou libera.

### 4.6 Moderadores

No admin, em **Moderadores**, ponha o e-mail de quem vai ajudar. A pessoa precisa já ter entrado no site e criado o perfil. Moderadores entram com o login deles, em **Moderação** no menu da conta, e veem só **Denúncias** e **Anúncios**: corrigem, removem com motivo e liberam. Contas, e-mails, IA e chaves ficam só com você.

---

## 5. Colocar no ar

**Vercel, com o servidor em São Paulo** (o mesmo lugar do banco no Supabase). O plano grátis (Hobby) é só para uso não comercial; o Pro custa US$ 20/mês.

1. Envie o projeto para o GitHub. Na Vercel, em **Add New → Project**, importe o repositório. Ela reconhece o Next.js sozinha; não mude os comandos.
2. Em **Environment Variables**, crie as mesmas variáveis do `.env.local`, com `NEXT_PUBLIC_SITE_URL=https://publike.org`, **menos** `SUPABASE_SECRET_KEY`, `PUBLIKE_ADMIN` e `PUBLIKE_URL_PUBLICA` (essas ficam só no seu computador). Acrescente `PUBLIKE_CHAVE_SERVIDOR` (veja 4.4). Marque senhas e chaves como **Sensitive**. As variáveis `NEXT_PUBLIC_…` entram no site na hora do build: depois de mudar uma delas, publique de novo (**Deployments → Redeploy**).
3. A região do servidor vem do `vercel.json` (`gru1`, São Paulo). Cada push na branch `main` publica o site de novo.
4. Em **Settings → Domains**, adicione `publike.org` (o `www` passa a levar para ele). No DNS do domínio (GoDaddy), troque o registro **A** de `@` e o **CNAME** de `www` pelos valores que a Vercel mostrar. Não mexa nos registros de e-mail (MX e TXT).
5. No Supabase, em **Authentication → URL Configuration**, troque a **Site URL** por `https://publike.org` e adicione `https://publike.org/**` nas Redirect URLs (deixe o `http://localhost:3000/**`, que é do seu computador).
6. Nos apps de login: no Google, `https://publike.org` entra em **Origens JavaScript autorizadas** (sem isso, o botão do Google falha no site publicado); no Facebook, o domínio entra em **Domínios do app**, junto com a URL de exclusão de dados (`/apagar-dados`). Depois, tire os dois do modo de teste.

**E-mail do domínio.** Os e-mails saem pelo Zoho CPaaS com o endereço `nao-responda@publike.org` (veja 4.3). Para não caírem no spam, o DNS precisa ter os dois registros que o Zoho CPaaS pede ao verificar o domínio: a chave DKIM (TXT em `8123133._domainkey`) e o CNAME de devolução (`bounce-zem`). Os dois já estão lá; não apague.

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Abre o site em http://localhost:3000 e atualiza sozinho enquanto você edita. Só aceita conexões do próprio computador; com `PUBLIKE_ADMIN=1`, abre o admin em /admin |
| `npm run dev:rede` | Igual, mas aceita conexões da rede (para testar no celular). O admin fica desligado |
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
  admin/                 admin (só no seu computador) e moderação (moderadores com login)
  como-funciona/, privacidade/
src/components/        peças da interface (cards, mapa, formulários, botões)
src/lib/
  dados.ts               leituras do banco (e os dados de exemplo no modo demonstração)
  acoes/                 o que muda dados: publicar, curtir, responder, denunciar…
  constantes.ts          categorias, tipos de contratação, cidades e bairros sugeridos
  validacao.ts           regras dos formulários
  login-social.ts        Google, Facebook e LinkedIn: nomes, provedores do Supabase e quais estão ligados
  admin/                 leituras e textos do admin
  email/                 monta os e-mails a partir dos textos editados no admin
  ia/                    conversa com a OpenAI: moderação, melhorar texto, resumo
  servidor/              variáveis do servidor e filas de e-mails e da IA
  supabase/              conexão com o Supabase (com login, pública e a do admin) e tipos do banco
src/app/globals.css    cores, fontes e estilos do Design System
public/logo/           a logo em SVG (li meio a meio, escura, preta, branca e animada); no site, o componente Logo desenha a versão animada
public/marcas/         logos oficiais do Google, Facebook e LinkedIn para os botões de login
```

**Design System.** As cores (terra, ipê, cerrado, like), as fontes (Bricolage Grotesque e Figtree) e os componentes seguem o Design System do Publike. Os tokens ficam em `src/app/globals.css`.

**Mudar o banco.** Crie um novo arquivo em `supabase/migrations/` com as mudanças e rode no SQL Editor (ou use `npx supabase db push`). Depois atualize os tipos em `src/lib/supabase/tipos-banco.ts`. Dá para gerar automaticamente com:

```bash
npx supabase gen types typescript --project-id SEU_ID > src/lib/supabase/tipos-banco.ts
```

**Regras importantes do banco**

- O contato (WhatsApp e e-mail) fica numa tabela que só o dono lê. Ele só sai pelas funções de match.
- O local do anúncio é arredondado para uma grade de ~500 m antes de ser salvo (menos o de comércio, empresa e agência com endereço, que é público), e só vale dentro da região metropolitana. O CEP de casa vira uma grade de ~300 m e só a própria pessoa lê.
- Anúncio fica 30 dias no ar. A limpeza diária usa o `pg_cron`; se ele não estiver ativo, os vencidos somem da busca do mesmo jeito.
- Conta suspensa ou banida não entra, não publica nem curte; os anúncios dela somem e o contato dela sai dos matches. Quando a suspensão vence, tudo volta sozinho.
- E-mails e revisões da IA entram em filas no banco (pelos gatilhos) e o site esvazia as filas logo depois de cada ação, tentando de novo quando falha.
- Tudo o que o admin e os moderadores fazem fica no registro da equipe.

---

## Antes de lançar

- [ ] Supabase no plano Pro e SMTP próprio para os e-mails
- [ ] Migrações do admin, da prioridade por bairro e dos serviços rodadas (`20261008120000_admin.sql`, `20261009120000_prioridade_local.sql` `20261009150000_servicos.sql`, `20261009180000_avaliacoes.sql`, `20261009200000_curriculos.sql`, `20261009210000_config_where.sql`, `20261009230000_desfazer_match.sql`, `20261009240000_negociar_depois.sql`, `20261009250000_agencias.sql`, `20261009260000_cnpj_empresas.sql`, `20261009270000_descobrir.sql` e `20261009280000_enderecos.sql`)
- [ ] Zoho no servidor (`SMTP_…`), e-mail de teste chegando e "quem recebe os avisos" preenchido
- [ ] `PUBLIKE_CHAVE_SERVIDOR` na hospedagem (e `SUPABASE_SECRET_KEY` só no seu computador)
- [ ] IA ligada no admin, se for usar, com créditos na OpenAI
- [ ] Verificação em duas etapas no seu e-mail, no Supabase, no GitHub e na hospedagem
- [ ] Modelos de e-mail traduzidos
- [ ] Domínio próprio na Vercel e no Supabase (Site URL e Redirect URLs)
- [ ] Domínio verificado no Zoho CPaaS (DKIM e CNAME de devolução no DNS) e o questionário de **Validação do cliente** enviado
- [ ] `NEXT_PUBLIC_CONTATO_EMAIL` preenchido (aparece na página de privacidade)
- [ ] Textos de privacidade e regras revisados por um advogado
- [ ] Números de teste do SMS removidos
- [ ] Proteção contra robôs ligada (Turnstile: site key na Vercel, secret key no Supabase, nessa ordem)
- [ ] Apps do Google, Facebook e LinkedIn publicados (fora do modo de teste); no Facebook, preencher a URL de exclusão de dados (`/apagar-dados`) depois que o site estiver no ar
