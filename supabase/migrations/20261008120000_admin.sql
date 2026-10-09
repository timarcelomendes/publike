-- =====================================================================
-- Publike · painel de administração
--
-- Rode depois de 20261007120000_publike.sql: no Supabase, abra
-- "SQL Editor", cole este arquivo inteiro e clique em "Run" (ou use
-- supabase db push).
--
-- O que tem aqui:
--   1. Quem administra: admin (só com a chave secreta, no computador do
--      dono do site) e moderadores (com login; só anúncios e denúncias)
--   2. Suspensão e banimento de contas
--   3. Moderação: motivo para quem publicou, edição pela equipe e
--      registro do que a equipe faz
--   4. Configurações do site
--   5. E-mails do site: textos editáveis e fila de envio
--   6. IA: fila de revisão dos anúncios, decisões e resumos
--   7. Chaves do servidor (só servem para enviar e-mails e rodar a IA)
--   8. Funções do painel (admin e moderação)
--   9. Funções usadas pelo servidor do site
--  10. Ajustes nas funções que o site já usava
--  11. Permissões
--
-- Senhas e chaves (Zoho, IA, chave secreta do Supabase) NÃO ficam no
-- banco. A chave secreta do Supabase fica só no computador do admin.
-- =====================================================================


-- 1. Quem administra -------------------------------------------------------
-- Admin: quem chama o banco com a chave secreta do Supabase. Ela fica só
-- no .env.local do computador do dono do site e nunca no site publicado.
-- Nenhum login (nem o do dono) consegue chamar as funções de admin: quem
-- invadir um e-mail não vira admin.
-- Moderador: pessoa com login, na tabela "moderadores". Só anúncios e
-- denúncias.

create or replace function privado.eh_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role'
$$;

create or replace function privado.exigir_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin pode fazer isso.' using errcode = '42501';
  end if;
end
$$;

-- admin ou moderador
create or replace function privado.exigir_equipe()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or public.eh_moderador()) then
    raise exception 'Só a moderação do Publike pode fazer isso.' using errcode = '42501';
  end if;
end
$$;


-- Registro do que a equipe faz (quem, o quê, quando). autor_id vazio = admin.
create table public.registro_equipe (
  id bigint generated always as identity primary key,
  autor_id uuid references auth.users (id) on delete set null,
  acao text not null,
  alvo_tipo text not null check (alvo_tipo in ('usuario', 'anuncio', 'config', 'modelo', 'equipe', 'chave')),
  alvo_id text,
  -- nome ou título do alvo na hora: continua legível mesmo se ele for apagado
  rotulo text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index registro_equipe_data_idx on public.registro_equipe (criado_em desc);
create index registro_equipe_alvo_idx on public.registro_equipe (alvo_id, criado_em desc);

create or replace function privado.registrar(
  p_acao text,
  p_alvo_tipo text,
  p_alvo_id text,
  p_rotulo text,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.registro_equipe (autor_id, acao, alvo_tipo, alvo_id, rotulo, detalhes)
  values ((select auth.uid()), p_acao, p_alvo_tipo, p_alvo_id, left(p_rotulo, 200),
          jsonb_strip_nulls(coalesce(p_detalhes, '{}'::jsonb)))
$$;


-- 2. Suspensão e banimento -------------------------------------------------
-- Suspensa (7 ou 30 dias) ou banida (para sempre): a pessoa não entra no
-- site, os anúncios dela somem e o contato dela deixa de aparecer nos
-- matches. Quando a suspensão vence, tudo volta sozinho.

alter table public.perfis add column suspenso_ate timestamptz;
comment on column public.perfis.suspenso_ate is
  'Conta suspensa até esta data (banimento = daqui a 100 anos). Os anúncios somem enquanto isso.';

create table public.suspensoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('suspensao', 'banimento')),
  dias smallint check (dias between 1 and 3650),
  motivo text not null check (char_length(motivo) between 3 and 500),
  inicio timestamptz not null default now(),
  fim timestamptz not null,
  aplicada_por uuid references auth.users (id) on delete set null,
  encerrada_em timestamptz,
  encerrada_por uuid references auth.users (id) on delete set null,
  constraint suspensao_tem_prazo check ((tipo = 'suspensao') = (dias is not null))
);
create index suspensoes_usuario_idx on public.suspensoes (usuario_id, inicio desc);

create or replace function public.minha_conta_suspensa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.suspensoes s
     where s.usuario_id = (select auth.uid()) and s.encerrada_em is null and s.fim > now()
  )
$$;

-- Chamada nos gatilhos: conta suspensa não publica, não curte, não denuncia.
create or replace function privado.exigir_conta_ativa()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
end
$$;

-- Copia a suspensão que estiver valendo para o perfil e para o login.
create or replace function privado.aplicar_suspensao(p_usuario uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  ate timestamptz;
  anterior text := current_setting('publike.sistema', true);
begin
  select max(s.fim) into ate
    from public.suspensoes s
   where s.usuario_id = p_usuario and s.encerrada_em is null and s.fim > now();

  perform set_config('publike.sistema', 'on', true);
  update public.perfis set suspenso_ate = ate where id = p_usuario;
  perform set_config('publike.sistema', coalesce(anterior, ''), true);

  -- Bloqueia (ou libera) o login e encerra as sessões abertas.
  begin
    update auth.users set banned_until = ate where id = p_usuario;
    if ate is not null then
      delete from auth.sessions where user_id = p_usuario;
    end if;
  exception
    when insufficient_privilege then
      raise warning 'Publike: sem permissão para mudar o login (%). O resto da suspensão vale.', sqlerrm;
  end;
  return ate;
end
$$;


-- 3. Moderação ---------------------------------------------------------------

alter table public.anuncios add column nota_moderacao text check (char_length(nota_moderacao) <= 500);
comment on column public.anuncios.nota_moderacao is 'Motivo da remoção, mostrado para quem publicou.';
alter table public.anuncios add column status_anterior text
  check (status_anterior in ('ativo', 'pausado', 'encerrado', 'expirado'));
comment on column public.anuncios.status_anterior is 'Situação antes de ir para a moderação. Ao liberar, o anúncio volta para ela.';

-- A moderação pode corrigir qualquer anúncio (o gatilho guarda autor, tipo e datas).
create policy "moderação edita anúncios" on public.anuncios
  for update to authenticated
  using ((select public.eh_moderador())) with check ((select public.eh_moderador()));

-- Anúncio de conta suspensa sai das buscas.
drop policy "anúncios no ar são públicos" on public.anuncios;
create policy "anúncios no ar são públicos" on public.anuncios
  for select to anon, authenticated
  using (
    status = 'ativo' and expira_em > now()
    and not exists (select 1 from public.perfis p where p.id = autor_id and p.suspenso_ate > now())
  );

drop policy "autor exclui o próprio anúncio" on public.anuncios;
create policy "autor exclui o próprio anúncio" on public.anuncios
  for delete to authenticated
  using (
    autor_id = (select auth.uid()) and status not in ('em_analise', 'removido')
    and not (select public.minha_conta_suspensa())
  );

drop policy "desfazer curtida ainda sem resposta" on public.curtidas;
create policy "desfazer curtida ainda sem resposta" on public.curtidas
  for delete to authenticated
  using (perfil_id = (select auth.uid()) and status = 'pendente' and not (select public.minha_conta_suspensa()));

-- Fotos de perfil: conta suspensa não troca nem apaga a foto.
drop policy if exists "publike: dono envia foto" on storage.objects;
drop policy if exists "publike: dono troca foto" on storage.objects;
drop policy if exists "publike: dono apaga foto" on storage.objects;
create policy "publike: dono envia foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not (select public.minha_conta_suspensa()));
create policy "publike: dono troca foto" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not (select public.minha_conta_suspensa()));
create policy "publike: dono apaga foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not (select public.minha_conta_suspensa()));

-- Edição feita pelo admin ou pela moderação no anúncio de outra pessoa vai para o registro.
create or replace function privado.anuncio_editado_pela_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  campos text[];
begin
  if coalesce(current_setting('publike.sistema', true), '') = 'on' then
    return null;
  end if;
  if not (privado.eh_admin()
          or (usuario is not null and usuario <> new.autor_id and public.eh_moderador())) then
    return null;
  end if;
  select coalesce(array_agg(n.key order by n.key), '{}') into campos
    from jsonb_each(to_jsonb(new) - 'atualizado_em' - 'busca' - 'expira_em') n
   where n.value is distinct from (to_jsonb(old) -> n.key);
  if cardinality(campos) > 0 then
    perform privado.registrar('editar_anuncio', 'anuncio', new.id::text, new.titulo,
                              jsonb_build_object('campos', to_jsonb(campos)));
  end if;
  return null;
end
$$;

create trigger anuncios_editado_pela_equipe
  after update of titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
                  beneficios, horario, vagas, cidade, bairro, local on public.anuncios
  for each row execute function privado.anuncio_editado_pela_equipe();


-- 4. Configurações do site ---------------------------------------------------
-- Uma linha só. Nada de senha aqui: servidor de e-mail, senha do Zoho e
-- chave da IA ficam nas variáveis de ambiente do servidor do site.

create table public.config_site (
  id boolean primary key default true check (id),
  -- e-mails para quem usa o site
  emails_ativos boolean not null default true,
  remetente_nome text not null default 'Publike' check (char_length(remetente_nome) between 2 and 60),
  responder_para text check (responder_para ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  email_curtida boolean not null default true,
  email_match boolean not null default true,
  email_moderacao boolean not null default true,
  email_conta boolean not null default true,
  -- avisos para a equipe (lista vazia = ninguém recebe)
  avisos_para text[] not null default '{}' check (cardinality(avisos_para) <= 10),
  aviso_denuncia boolean not null default true,
  aviso_cadastro boolean not null default true,
  aviso_retirado boolean not null default true,
  -- IA (só funciona com a chave no servidor)
  ia_moderacao boolean not null default false,
  ia_melhorar_texto boolean not null default false,
  ia_resumo boolean not null default false,
  ia_modelo text not null default 'claude-haiku-5-5' check (ia_modelo ~ '^[a-z0-9][a-z0-9.-]{2,60}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
insert into public.config_site default values;

-- O que o site pode saber sem login.
create or replace function public.config_publica()
returns table (ia_melhorar_texto boolean, ia_modelo text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.ia_melhorar_texto, c.ia_modelo from public.config_site c
$$;


-- 5. E-mails do site --------------------------------------------------------

-- Pessoa pode desligar os avisos por e-mail no perfil.
alter table public.contatos add column receber_emails boolean not null default true;

-- Textos editáveis no admin. {{variavel}} vira o valor na hora do envio;
-- um parágrafo com variável vazia não aparece.
create table public.modelos_email (
  chave text primary key check (chave ~ '^[a-z_]{3,40}$'),
  grupo text not null check (grupo in ('usuarios', 'equipe', 'sistema')),
  ordem smallint not null default 0,
  nome text not null,
  descricao text not null,
  variaveis text[] not null default '{}',
  assunto text not null check (char_length(assunto) between 3 and 150),
  corpo text not null check (char_length(corpo) between 10 and 5000),
  botao text check (char_length(botao) between 2 and 40),
  assunto_padrao text not null,
  corpo_padrao text not null,
  botao_padrao text,
  atualizado_em timestamptz,
  atualizado_por uuid references auth.users (id) on delete set null
);

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('curtida', 'usuarios', 1, 'Curtida',
     'Quando alguém curte um anúncio da pessoa. No máximo um e-mail a cada 30 minutos.',
     array['nome', 'quem', 'titulo', 'link'],
     '{{quem}} curtiu “{{titulo}}”',
     'Oi, {{nome}}!

{{quem}} curtiu seu anúncio “{{titulo}}” no Publike.

Veja o perfil de quem curtiu. Se combinar, curta de volta: quando dá match, o WhatsApp de vocês dois aparece no painel.',
     'Ver quem curtiu'),

    ('match', 'usuarios', 2, 'Match',
     'Quando quem publicou curte a pessoa de volta.',
     array['nome', 'quem', 'titulo', 'link'],
     'Deu match em “{{titulo}}”!',
     'Oi, {{nome}}!

{{quem}} curtiu você de volta em “{{titulo}}”. Agora vocês podem conversar pelo WhatsApp.

O contato está no seu painel, em Matches.',
     'Ver o contato'),

    ('em_analise', 'usuarios', 3, 'Anúncio em análise',
     'Quando o anúncio sai do ar para a moderação olhar (três denúncias ou a IA achou suspeito).',
     array['nome', 'titulo', 'link'],
     'Seu anúncio “{{titulo}}” está em análise',
     'Oi, {{nome}}!

Seu anúncio “{{titulo}}” saiu do ar por enquanto: a moderação do Publike vai dar uma olhada nele.

Você recebe outro aviso assim que a análise terminar. Não precisa fazer nada.',
     'Ver meus anúncios'),

    ('removido', 'usuarios', 4, 'Anúncio removido',
     'Quando a moderação remove um anúncio.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Seu anúncio “{{titulo}}” foi removido',
     'Oi, {{nome}}!

Seu anúncio “{{titulo}}” foi removido pela moderação por não seguir as regras do Publike.

Motivo: {{motivo}}

Se achar que foi um engano, é só responder este e-mail.',
     'Ler as regras'),

    ('liberado', 'usuarios', 5, 'Anúncio liberado',
     'Quando a moderação analisa e libera um anúncio.',
     array['nome', 'titulo', 'link'],
     'Seu anúncio “{{titulo}}” voltou ao ar',
     'Oi, {{nome}}!

A moderação analisou “{{titulo}}” e está tudo certo: ele já voltou ao ar.

Obrigado pela paciência.',
     'Ver o anúncio'),

    ('conta_suspensa', 'usuarios', 6, 'Conta suspensa',
     'Quando a conta é suspensa por 7 ou 30 dias. Vai mesmo para quem desligou os avisos.',
     array['nome', 'ate', 'motivo'],
     'Sua conta no Publike foi suspensa',
     'Oi, {{nome}}.

Sua conta no Publike foi suspensa até {{ate}}. Até lá, seus anúncios ficam fora do ar e não dá para entrar no site.

Motivo: {{motivo}}

Se achar que foi um engano, é só responder este e-mail.',
     null),

    ('conta_banida', 'usuarios', 7, 'Conta banida',
     'Quando a conta é banida de vez. Vai mesmo para quem desligou os avisos.',
     array['nome', 'motivo'],
     'Sua conta no Publike foi encerrada',
     'Oi, {{nome}}.

Sua conta no Publike foi encerrada por não seguir as regras do site. Seus anúncios saíram do ar e não dá mais para entrar.

Motivo: {{motivo}}

Se achar que foi um engano, é só responder este e-mail.',
     null),

    ('conta_reativada', 'usuarios', 8, 'Conta reativada',
     'Quando a equipe tira a suspensão antes do prazo.',
     array['nome', 'link'],
     'Sua conta no Publike foi reativada',
     'Oi, {{nome}}!

Sua conta no Publike foi reativada. Você já pode entrar de novo, e os anúncios que ainda estavam no prazo voltaram ao ar.',
     'Entrar no Publike'),

    ('aviso_denuncia', 'equipe', 10, 'Nova denúncia',
     'Aviso para a equipe quando chega uma denúncia. No máximo um por anúncio a cada hora.',
     array['titulo', 'motivo', 'total', 'link'],
     'Nova denúncia: “{{titulo}}”',
     'Chegou uma denúncia no anúncio “{{titulo}}”.

Motivo: {{motivo}}

Denúncias abertas neste anúncio: {{total}}.',
     'Abrir as denúncias'),

    ('aviso_cadastro', 'equipe', 11, 'Novo cadastro',
     'Aviso para a equipe quando alguém cria o perfil.',
     array['nome', 'tipo', 'cidade', 'link'],
     'Novo cadastro: {{nome}}',
     '{{nome}} ({{tipo}}, {{cidade}}) acabou de criar o perfil no Publike.',
     'Ver no admin'),

    ('aviso_retirado', 'equipe', 12, 'Anúncio tirado do ar',
     'Aviso para a equipe quando um anúncio sai do ar sozinho, por denúncias ou pela IA.',
     array['titulo', 'origem', 'link'],
     'Anúncio tirado do ar: “{{titulo}}”',
     'O anúncio “{{titulo}}” saiu do ar e está esperando a moderação.

Por quê: {{origem}}',
     'Analisar agora'),

    ('teste', 'sistema', 20, 'E-mail de teste',
     'Enviado pelo botão “Enviar e-mail de teste” do admin.',
     array['quando'],
     'E-mail de teste do Publike',
     'Se você recebeu esta mensagem, o envio de e-mails do Publike está funcionando.

Enviado pelo admin em {{quando}}.',
     null)
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao);


-- Fila de envio. Os gatilhos põem os e-mails aqui; o servidor do site
-- manda pelo Zoho logo depois de cada ação e tenta de novo se falhar.
create table privado.fila_emails (
  id bigint generated always as identity primary key,
  modelo text not null references public.modelos_email (chave),
  para text not null,
  usuario_id uuid references auth.users (id) on delete cascade,   -- null: aviso para a equipe
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado')),
  tentativas smallint not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  tentar_depois timestamptz not null default now(),
  enviado_em timestamptz
);
create index fila_emails_a_enviar_idx on privado.fila_emails (tentar_depois, id) where status in ('pendente', 'enviando');
create index fila_emails_usuario_idx on privado.fila_emails (usuario_id, modelo, criado_em desc);
create index fila_emails_modelo_idx on privado.fila_emails (modelo, criado_em desc);
alter table privado.fila_emails enable row level security;

-- Primeiro nome para pessoas; nome inteiro para comércio e empresa.
create or replace function privado.nome_para_email(p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.tipo = 'pessoa' then split_part(p.nome, ' ', 1) else p.nome end
    from public.perfis p where p.id = p_usuario
$$;

-- Põe um e-mail para uma pessoa na fila, se a configuração e a pessoa deixarem.
-- Nunca atrapalha a ação principal: se der erro, só avisa no log.
create or replace function privado.enfileirar_email(p_usuario uuid, p_modelo text, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.config_site;
  destino text;
  quer boolean;
  de_conta boolean := p_modelo in ('conta_suspensa', 'conta_banida', 'conta_reativada');
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'curtida' and not cfg.email_curtida)
     or (p_modelo = 'match' and not cfg.email_match)
     or (p_modelo in ('em_analise', 'removido', 'liberado') and not cfg.email_moderacao)
     or (de_conta and not cfg.email_conta) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- no máximo um aviso de curtida a cada 30 minutos para a mesma pessoa
  if p_modelo = 'curtida' and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = 'curtida' and f.criado_em > now() - interval '30 minutes'
  ) then
    return;
  end if;
  -- só para o e-mail de login confirmado (nunca para um endereço que a pessoa só digitou)
  select nullif(btrim(u.email::text), '') into destino
    from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$$;

-- Aviso para a equipe: vai para os e-mails configurados no admin.
create or replace function privado.avisar_equipe(p_modelo text, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.config_site;
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'aviso_denuncia' and not cfg.aviso_denuncia)
     or (p_modelo = 'aviso_cadastro' and not cfg.aviso_cadastro)
     or (p_modelo = 'aviso_retirado' and not cfg.aviso_retirado) then
    return;
  end if;
  insert into privado.fila_emails (modelo, para, dados)
  select p_modelo, d.email, coalesce(p_dados, '{}'::jsonb)
    from (select distinct lower(btrim(x)) as email from unnest(cfg.avisos_para) as x) d
   where d.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
exception
  when others then
    raise warning 'Publike: aviso % não entrou na fila (%).', p_modelo, sqlerrm;
end
$$;

-- Os avisos do sino (curtida, match, moderação) também vão por e-mail.
create or replace function privado.notificacao_por_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
begin
  select a.titulo, a.nota_moderacao into v_titulo, v_nota from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_nota, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 else '/painel'
               end));
  return null;
end
$$;

create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row execute function privado.notificacao_por_email();

-- Nova denúncia: aviso para a equipe (no máximo um por anúncio a cada hora).
create or replace function privado.denuncia_para_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_abertas integer;
begin
  if exists (
    select 1 from privado.fila_emails f
     where f.modelo = 'aviso_denuncia' and f.criado_em > now() - interval '1 hour'
       and f.dados ->> 'anuncio_id' = new.anuncio_id::text
  ) then
    return null;
  end if;
  select a.titulo into v_titulo from public.anuncios a where a.id = new.anuncio_id;
  select count(*) into v_abertas from public.denuncias d where d.anuncio_id = new.anuncio_id and d.status = 'aberta';
  perform privado.avisar_equipe('aviso_denuncia', jsonb_build_object(
    'anuncio_id', new.anuncio_id,
    'titulo', coalesce(v_titulo, ''),
    'motivo', case new.motivo
                when 'cobra_taxa' then 'cobra para contratar'
                when 'golpe' then 'parece golpe'
                when 'enganoso' then 'informação falsa'
                when 'discriminacao' then 'discriminação'
                when 'ofensivo' then 'conteúdo ofensivo'
                when 'spam' then 'spam ou repetido'
                else 'outro motivo'
              end,
    'total', v_abertas::text,
    'caminho', '/admin/denuncias'));
  return null;
end
$$;

create trigger denuncias_avisar_equipe
  after insert on public.denuncias
  for each row execute function privado.denuncia_para_equipe();

-- Perfil novo: aviso para a equipe.
create or replace function privado.perfil_novo_para_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.avisar_equipe('aviso_cadastro', jsonb_build_object(
    'nome', new.nome,
    'tipo', case new.tipo when 'comercio' then 'comércio' when 'empresa' then 'empresa' else 'pessoa' end,
    'cidade', new.cidade,
    'caminho', '/admin/usuarios/' || new.id));
  return null;
end
$$;

create trigger perfis_avisar_equipe
  after insert on public.perfis
  for each row execute function privado.perfil_novo_para_equipe();


-- 6. IA -------------------------------------------------------------------
-- Com a moderação automática ligada, todo anúncio novo (ou com o texto
-- alterado) entra nesta fila. O servidor do site pede a opinião da IA e,
-- se ela achar suspeito, o anúncio sai do ar até a moderação olhar.

create table privado.fila_ia (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'revisando')),
  tentativas smallint not null default 0,
  criado_em timestamptz not null default now(),
  tentar_depois timestamptz not null default now()
);
alter table privado.fila_ia enable row level security;

create table public.moderacao_ia (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  decisao text not null check (decisao in ('aprovado', 'retido', 'erro')),
  categorias text[] not null default '{}',
  explicacao text check (char_length(explicacao) <= 1000),
  modelo text,
  criado_em timestamptz not null default now()
);
create index moderacao_ia_anuncio_idx on public.moderacao_ia (anuncio_id, criado_em desc);
create index moderacao_ia_data_idx on public.moderacao_ia (criado_em desc);

create table public.resumos_ia (
  id bigint generated always as identity primary key,
  texto text not null check (char_length(texto) between 1 and 6000),
  dias smallint not null default 7,
  modelo text,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Impressão do que a IA revisa. Muda quando qualquer um desses campos muda.
create or replace function privado.conteudo_revisado(a public.anuncios)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(chr(31), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor::text,
                       a.pagamento_unidade, a.beneficios, a.horario, a.vagas::text))
$$;

-- Qualquer mudança no texto, no valor ou na contratação volta para a IA, mesmo
-- com o anúncio pausado ou encerrado (para não passar escondido e voltar ao ar).
create or replace function privado.anuncio_para_revisao_ia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if not coalesce((select c.ia_moderacao from public.config_site c limit 1), false) then
    return null;
  end if;
  if coalesce(current_setting('publike.sistema', true), '') = 'on' then
    return null;
  end if;
  if new.status in ('em_analise', 'removido') then
    return null;
  end if;
  -- correção feita pelo admin ou pela moderação não volta para a IA
  if privado.eh_admin() or (usuario is not null and usuario <> new.autor_id and public.eh_moderador()) then
    return null;
  end if;
  if tg_op = 'UPDATE' and privado.conteudo_revisado(new) = privado.conteudo_revisado(old) then
    return null;
  end if;
  insert into privado.fila_ia (anuncio_id) values (new.id)
  on conflict (anuncio_id) do update
    set status = 'pendente', tentativas = 0, criado_em = now(), tentar_depois = now();
  return null;
exception
  when others then
    raise warning 'Publike: anúncio % não entrou na fila da IA (%).', new.id, sqlerrm;
    return null;
end
$$;

create trigger anuncios_revisao_ia
  after insert or update of titulo, descricao, categoria, regime, pagamento_valor, pagamento_unidade,
                            beneficios, horario, vagas on public.anuncios
  for each row execute function privado.anuncio_para_revisao_ia();

-- Antes de chamar a IA para melhorar um texto: confere se está ligada e o limite do dia.
create or replace function public.usar_ia_texto()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para usar a ajuda da IA.' using errcode = '42501';
  end if;
  if not coalesce((select c.ia_melhorar_texto from public.config_site c limit 1), false) then
    raise exception 'A ajuda da IA está desligada agora.' using errcode = 'P0001', hint = 'ia_desligada';
  end if;
  perform privado.exigir_conta_ativa();
  perform privado.conferir_limite('ia_texto', 20, 'Você já usou a ajuda da IA 20 vezes hoje. Tente de novo amanhã.');
end
$$;

alter table privado.limites_uso drop constraint limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao'));


-- 7. Chaves do servidor -------------------------------------------------------
-- O site publicado não guarda a chave secreta do Supabase. Para mandar os
-- e-mails e rodar a IA, ele usa uma chave do servidor, que só serve para
-- isso. O admin gera a chave no painel e o banco guarda só o hash dela.

create table privado.chaves_servidor (
  id bigint generated always as identity primary key,
  nome text not null check (char_length(nome) between 2 and 60),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  criada_em timestamptz not null default now(),
  usada_em timestamptz
);
alter table privado.chaves_servidor enable row level security;

-- Aceita o admin (chave secreta) ou uma chave do servidor válida.
create or replace function privado.exigir_servidor(p_chave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if privado.eh_admin() then
    return;
  end if;
  if p_chave is not null and char_length(p_chave) between 32 and 200 then
    select c.id into v_id from privado.chaves_servidor c
     where c.hash = encode(sha256(convert_to(p_chave, 'UTF8')), 'hex');
  end if;
  if v_id is null then
    raise exception 'Chave do servidor inválida.' using errcode = '42501';
  end if;
  update privado.chaves_servidor set usada_em = now()
   where id = v_id and (usada_em is null or usada_em < now() - interval '10 minutes');
end
$$;


-- 8. Funções do painel -----------------------------------------------------------
-- Admin: só com a chave secreta (estas funções só são liberadas para o
-- papel service_role). Moderação: login de moderador, só anúncios e denúncias.

-- Números do painel (admin).
create or replace function public.admin_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  perform privado.exigir_admin();
  select jsonb_build_object(
    'contas', (select count(*) from auth.users u),
    'contas_7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'contas_30d', (select count(*) from auth.users u where u.created_at > now() - interval '30 days'),
    'acessos_7d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days'),
    'sem_perfil', (select count(*) from auth.users u where not exists (select 1 from public.perfis p where p.id = u.id)),
    'perfis', (select jsonb_build_object(
                 'total', count(*),
                 'pessoa', count(*) filter (where p.tipo = 'pessoa'),
                 'comercio', count(*) filter (where p.tipo = 'comercio'),
                 'empresa', count(*) filter (where p.tipo = 'empresa'),
                 'verificados', count(*) filter (where p.verificado))
                 from public.perfis p),
    'anuncios', (select jsonb_build_object(
                   'total', count(*),
                   'no_ar', count(*) filter (where a.status = 'ativo' and a.expira_em > now()),
                   'vagas_no_ar', count(*) filter (where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()),
                   'servicos_no_ar', count(*) filter (where a.tipo = 'servico' and a.status = 'ativo' and a.expira_em > now()),
                   'pausados', count(*) filter (where a.status = 'pausado'),
                   'expirados', count(*) filter (where a.status = 'expirado' or (a.status = 'ativo' and a.expira_em <= now())),
                   'encerrados', count(*) filter (where a.status = 'encerrado'),
                   'em_analise', count(*) filter (where a.status = 'em_analise'),
                   'removidos', count(*) filter (where a.status = 'removido'),
                   'novos_7d', count(*) filter (where a.criado_em > now() - interval '7 days'))
                   from public.anuncios a),
    'curtidas', (select jsonb_build_object(
                   'total', count(*),
                   'novas_7d', count(*) filter (where c.criado_em > now() - interval '7 days'),
                   'matches', count(*) filter (where c.status = 'match'),
                   'matches_7d', count(*) filter (where c.status = 'match' and c.respondida_em > now() - interval '7 days'))
                   from public.curtidas c),
    'denuncias_abertas', (select count(*) from public.denuncias d where d.status = 'aberta'),
    'denuncias_7d', (select count(*) from public.denuncias d where d.criado_em > now() - interval '7 days'),
    'suspensos', (select count(distinct s.usuario_id) from public.suspensoes s
                   where s.tipo = 'suspensao' and s.encerrada_em is null and s.fim > now()),
    'banidos', (select count(distinct s.usuario_id) from public.suspensoes s
                 where s.tipo = 'banimento' and s.encerrada_em is null and s.fim > now()),
    'ia', (select jsonb_build_object(
             'revisados_7d', count(*) filter (where m.criado_em > now() - interval '7 days'),
             'retidos_7d', count(*) filter (where m.decisao = 'retido' and m.criado_em > now() - interval '7 days'),
             'na_fila', (select count(*) from privado.fila_ia))
             from public.moderacao_ia m),
    'emails', (select jsonb_build_object(
                 'enviados_7d', count(*) filter (where f.status = 'enviado' and f.enviado_em > now() - interval '7 days'),
                 'falhas_7d', count(*) filter (where f.status = 'falhou' and f.criado_em > now() - interval '7 days'),
                 'na_fila', count(*) filter (where f.status in ('pendente', 'enviando')))
                 from privado.fila_emails f),
    'por_dia', (
      select jsonb_agg(jsonb_build_object(
               'dia', d.dia, 'contas', coalesce(u.n, 0), 'anuncios', coalesce(a.n, 0), 'curtidas', coalesce(c.n, 0))
               order by d.dia)
        from (select hoje - g as dia from generate_series(0, 29) as g) d
        left join (select (u1.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
                     from auth.users u1 where u1.created_at > now() - interval '31 days' group by 1) u using (dia)
        left join (select (a1.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
                     from public.anuncios a1 where a1.criado_em > now() - interval '31 days' group by 1) a using (dia)
        left join (select (c1.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
                     from public.curtidas c1 where c1.criado_em > now() - interval '31 days' group by 1) c using (dia)),
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', t.categoria, 'n', t.n) order by t.n desc, t.categoria), '[]'::jsonb)
        from (select a.categoria, count(*) as n from public.anuncios a
               where a.status = 'ativo' and a.expira_em > now()
               group by a.categoria order by count(*) desc limit 8) t),
    'bairros', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', t.bairro, 'n', t.n) order by t.n desc, t.bairro), '[]'::jsonb)
        from (select a.bairro, count(*) as n from public.anuncios a
               where a.status = 'ativo' and a.expira_em > now()
               group by a.bairro order by count(*) desc limit 8) t)
  ) into r;
  return r;
end
$$;

-- Lista de contas (admin). Inclui quem entrou mas ainda não criou o perfil.
create or replace function public.admin_listar_usuarios(
  p_busca text default null,
  p_filtro text default 'todos',
  p_limite integer default 30,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  email text,
  telefone text,
  provedor text,
  criado_em timestamptz,
  ultimo_acesso timestamptz,
  nome text,
  tipo text,
  cidade text,
  bairro text,
  foto text,
  verificado boolean,
  whatsapp text,
  moderador boolean,
  suspenso_ate timestamptz,
  suspensao_tipo text,
  anuncios_total integer,
  anuncios_no_ar integer,
  denuncias_recebidas integer,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  termo text := nullif(btrim(coalesce(p_busca, '')), '');
  digitos text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  perform privado.exigir_admin();
  return query
  select u.id, u.email::text, nullif(u.phone::text, ''),
         coalesce(u.raw_app_meta_data ->> 'provider',
                  case when coalesce(u.phone::text, '') <> '' then 'phone' else 'email' end),
         u.created_at, u.last_sign_in_at,
         p.nome, p.tipo, p.cidade, p.bairro, p.foto, coalesce(p.verificado, false), ct.whatsapp,
         (mo.perfil_id is not null), s.fim, s.tipo,
         coalesce(an.total, 0)::integer, coalesce(an.no_ar, 0)::integer, coalesce(dn.total, 0)::integer,
         count(*) over ()
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join public.contatos ct on ct.perfil_id = u.id
    left join public.moderadores mo on mo.perfil_id = u.id
    left join lateral (
      select s1.fim, s1.tipo from public.suspensoes s1
       where s1.usuario_id = u.id and s1.encerrada_em is null and s1.fim > now()
       order by s1.fim desc limit 1
    ) s on true
    left join lateral (
      select count(*) as total, count(*) filter (where a.status = 'ativo' and a.expira_em > now()) as no_ar
        from public.anuncios a where a.autor_id = u.id
    ) an on true
    left join lateral (
      select count(*) as total
        from public.denuncias d join public.anuncios a2 on a2.id = d.anuncio_id
       where a2.autor_id = u.id
    ) dn on true
   where (termo is null
          or public.sem_acento(coalesce(p.nome, '')) ilike '%' || public.sem_acento(termo) || '%'
          or u.email::text ilike '%' || termo || '%'
          or (char_length(digitos) >= 4
              and (coalesce(ct.whatsapp, '') like '%' || digitos || '%' or coalesce(u.phone::text, '') like '%' || digitos || '%')))
     and case coalesce(p_filtro, 'todos')
           when 'suspensos' then s.tipo = 'suspensao'
           when 'banidos' then s.tipo = 'banimento'
           when 'moderadores' then mo.perfil_id is not null
           when 'sem_perfil' then p.id is null
           when 'verificados' then coalesce(p.verificado, false)
           else true
         end
   order by u.created_at desc
   limit least(greatest(coalesce(p_limite, 30), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end
$$;

-- Ficha de uma conta (admin).
create or replace function public.admin_usuario(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform privado.exigir_admin();
  select jsonb_build_object(
    'id', u.id,
    'email', u.email::text,
    'telefone', nullif(u.phone::text, ''),
    'provedor', coalesce(u.raw_app_meta_data ->> 'provider',
                         case when coalesce(u.phone::text, '') <> '' then 'phone' else 'email' end),
    'provedores', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'criado_em', u.created_at,
    'ultimo_acesso', u.last_sign_in_at,
    'login_bloqueado_ate', u.banned_until,
    'perfil', case when p.id is null then null else jsonb_build_object(
                'nome', p.nome, 'tipo', p.tipo, 'foto', p.foto, 'cidade', p.cidade, 'bairro', p.bairro,
                'sobre', p.sobre, 'servicos', to_jsonb(p.servicos), 'verificado', p.verificado,
                'criado_em', p.criado_em) end,
    'contato', jsonb_build_object('whatsapp', ct.whatsapp, 'email', ct.email,
                                  'receber_emails', coalesce(ct.receber_emails, true)),
    'moderador', (mo.perfil_id is not null),
    'suspensao', (
      select jsonb_build_object('id', s.id, 'tipo', s.tipo, 'dias', s.dias, 'motivo', s.motivo,
                                'inicio', s.inicio, 'fim', s.fim)
        from public.suspensoes s
       where s.usuario_id = u.id and s.encerrada_em is null and s.fim > now()
       order by s.fim desc limit 1),
    'historico', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'tipo', s.tipo, 'dias', s.dias, 'motivo', s.motivo, 'inicio', s.inicio, 'fim', s.fim,
               'encerrada_em', s.encerrada_em, 'aplicada_por', pa.nome, 'encerrada_por', pe.nome)
               order by s.inicio desc), '[]'::jsonb)
        from public.suspensoes s
        left join public.perfis pa on pa.id = s.aplicada_por
        left join public.perfis pe on pe.id = s.encerrada_por
       where s.usuario_id = u.id),
    'numeros', jsonb_build_object(
      'anuncios', (select count(*) from public.anuncios a where a.autor_id = u.id),
      'no_ar', (select count(*) from public.anuncios a where a.autor_id = u.id and a.status = 'ativo' and a.expira_em > now()),
      'curtidas_feitas', (select count(*) from public.curtidas c where c.perfil_id = u.id),
      'curtidas_recebidas', (select count(*) from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                              where a.autor_id = u.id),
      'matches', (select count(*) from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                   where c.status = 'match' and (c.perfil_id = u.id or a.autor_id = u.id)),
      'denuncias_recebidas', (select count(*) from public.denuncias d join public.anuncios a on a.id = d.anuncio_id
                               where a.autor_id = u.id),
      'denuncias_procedentes', (select count(*) from public.denuncias d join public.anuncios a on a.id = d.anuncio_id
                                 where a.autor_id = u.id and d.status = 'procedente'),
      'denuncias_feitas', (select count(*) from public.denuncias d where d.autor_id = u.id))
  ) into r
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join public.contatos ct on ct.perfil_id = u.id
    left join public.moderadores mo on mo.perfil_id = u.id
   where u.id = p_id;
  return r;
end
$$;

-- Lista de anúncios (equipe). Status "expirado" já considera a data.
create or replace function public.admin_listar_anuncios(
  p_busca text default null,
  p_status text default 'todos',
  p_tipo text default null,
  p_autor uuid default null,
  p_limite integer default 30,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  cidade text,
  bairro text,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  expira_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_suspenso boolean,
  curtidas integer,
  matches integer,
  denuncias_abertas integer,
  ia_decisao text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  termo text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  perform privado.exigir_equipe();
  return query
  with base as (
    select a.id, a.tipo, a.titulo, a.categoria, a.regime, a.cidade, a.bairro, a.criado_em, a.atualizado_em,
           a.expira_em, a.autor_id,
           case when a.status = 'ativo' and a.expira_em <= now() then 'expirado' else a.status end as situacao
      from public.anuncios a
     where (p_autor is null or a.autor_id = p_autor)
       and (p_tipo is null or a.tipo = p_tipo)
       and (termo is null
            or a.id::text = lower(termo)
            or a.busca @@ websearch_to_tsquery('portuguese'::regconfig, public.sem_acento(termo))
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(termo) || '%')
  )
  select b.id, b.tipo, b.titulo, b.categoria, b.regime, b.cidade, b.bairro, b.situacao,
         b.criado_em, b.atualizado_em, b.expira_em,
         p.id, p.nome, coalesce(p.suspenso_ate > now(), false),
         coalesce(cu.total, 0)::integer, coalesce(cu.matches, 0)::integer, coalesce(de.abertas, 0)::integer,
         ia.decisao,
         count(*) over ()
    from base b
    join public.perfis p on p.id = b.autor_id
    left join lateral (
      select count(*) as total, count(*) filter (where c.status = 'match') as matches
        from public.curtidas c where c.anuncio_id = b.id
    ) cu on true
    left join lateral (
      select count(*) as abertas from public.denuncias d where d.anuncio_id = b.id and d.status = 'aberta'
    ) de on true
    left join lateral (
      select m.decisao from public.moderacao_ia m where m.anuncio_id = b.id order by m.criado_em desc, m.id desc limit 1
    ) ia on true
   where case coalesce(p_status, 'todos')
           when 'todos' then true
           when 'denunciados' then coalesce(de.abertas, 0) > 0
           when 'retidos_ia' then b.situacao = 'em_analise' and ia.decisao = 'retido'
           else b.situacao = p_status
         end
   order by b.criado_em desc
   limit least(greatest(coalesce(p_limite, 30), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end
$$;

-- O que a equipe precisa saber de um anúncio: denúncias, IA, histórico.
create or replace function public.admin_anuncio(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
  admin boolean := privado.eh_admin();
begin
  perform privado.exigir_equipe();
  select jsonb_build_object(
    'id', a.id,
    'status', case when a.status = 'ativo' and a.expira_em <= now() then 'expirado' else a.status end,
    'nota_moderacao', a.nota_moderacao,
    'autor', jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'tipo', p.tipo, 'foto', p.foto, 'verificado', p.verificado,
      'suspenso_ate', case when p.suspenso_ate > now() then p.suspenso_ate end,
      'email', case when admin then (select u.email::text from auth.users u where u.id = p.id) end,
      'anuncios', (select count(*) from public.anuncios a2 where a2.autor_id = p.id),
      'removidos', (select count(*) from public.anuncios a2 where a2.autor_id = p.id and a2.status = 'removido')),
    'curtidas', (select count(*) from public.curtidas c where c.anuncio_id = a.id),
    'matches', (select count(*) from public.curtidas c where c.anuncio_id = a.id and c.status = 'match'),
    'denuncias', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'motivo', d.motivo, 'detalhes', d.detalhes, 'status', d.status,
               'criado_em', d.criado_em, 'quem', pd.nome) order by d.criado_em desc), '[]'::jsonb)
        from public.denuncias d left join public.perfis pd on pd.id = d.autor_id
       where d.anuncio_id = a.id),
    'ia', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'decisao', m.decisao, 'categorias', to_jsonb(m.categorias), 'explicacao', m.explicacao,
               'modelo', m.modelo, 'criado_em', m.criado_em) order by m.criado_em desc, m.id desc), '[]'::jsonb)
        from public.moderacao_ia m where m.anuncio_id = a.id),
    'registro', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'acao', g.acao, 'detalhes', g.detalhes, 'criado_em', g.criado_em, 'quem', pg.nome)
               order by g.criado_em desc), '[]'::jsonb)
        from public.registro_equipe g left join public.perfis pg on pg.id = g.autor_id
       where g.alvo_tipo = 'anuncio' and g.alvo_id = a.id::text)
  ) into r
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.id = p_id;
  return r;
end
$$;

-- Apaga de vez (spam, por exemplo). Só admin. Curtidas e denúncias vão junto.
create or replace function public.admin_excluir_anuncio(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_autor uuid;
begin
  perform privado.exigir_admin();
  select a.titulo, a.autor_id into v_titulo, v_autor from public.anuncios a where a.id = p_id;
  if not found then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  delete from public.anuncios where id = p_id;
  perform privado.registrar('excluir_anuncio', 'anuncio', p_id::text, v_titulo,
                            jsonb_build_object('motivo', nullif(btrim(coalesce(p_motivo, '')), ''), 'autor', v_autor));
end
$$;

-- Suspende (p_dias = 7, 30...) ou bane de vez (p_dias = null). Só admin.
create or replace function public.admin_suspender(p_usuario uuid, p_dias integer, p_motivo text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  motivo text := btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
  ate timestamptz;
  rotulo text;
begin
  perform privado.exigir_admin();
  if exists (select 1 from public.moderadores m where m.perfil_id = p_usuario) then
    raise exception 'Essa pessoa é moderadora. Tire ela da moderação antes de suspender.' using errcode = 'P0001';
  end if;
  if char_length(motivo) < 3 then
    raise exception 'Escreva o motivo (a pessoa recebe por e-mail).' using errcode = 'P0001';
  end if;
  if char_length(motivo) > 500 then
    raise exception 'Use no máximo 500 letras no motivo.' using errcode = 'P0001';
  end if;
  if p_dias is not null and p_dias not between 1 and 3650 then
    raise exception 'Prazo inválido.' using errcode = '22023';
  end if;
  select coalesce(p.nome, u.email::text, u.phone::text) into rotulo
    from auth.users u left join public.perfis p on p.id = u.id
   where u.id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;

  ate := case when p_dias is null then now() + interval '100 years' else now() + make_interval(days => p_dias) end;

  -- a nova decisão substitui a que estava valendo
  update public.suspensoes set encerrada_em = now(), encerrada_por = eu
   where usuario_id = p_usuario and encerrada_em is null and fim > now();
  insert into public.suspensoes (usuario_id, tipo, dias, motivo, fim, aplicada_por)
  values (p_usuario, case when p_dias is null then 'banimento' else 'suspensao' end, p_dias, motivo, ate, eu);

  perform privado.aplicar_suspensao(p_usuario);
  perform privado.registrar(case when p_dias is null then 'banir' else 'suspender' end, 'usuario', p_usuario::text, rotulo,
                            jsonb_build_object('dias', p_dias, 'motivo', motivo));
  perform privado.enfileirar_email(p_usuario,
    case when p_dias is null then 'conta_banida' else 'conta_suspensa' end,
    jsonb_build_object('motivo', motivo,
                       'ate', to_char(ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')));
  return ate;
end
$$;

-- Tira a suspensão (ou o banimento) antes do prazo. Só admin.
create or replace function public.admin_reativar(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  rotulo text;
begin
  perform privado.exigir_admin();
  select coalesce(p.nome, u.email::text, u.phone::text) into rotulo
    from auth.users u left join public.perfis p on p.id = u.id
   where u.id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  update public.suspensoes set encerrada_em = now(), encerrada_por = eu
   where usuario_id = p_usuario and encerrada_em is null and fim > now();
  if not found then
    raise exception 'Esta conta não está suspensa.' using errcode = 'P0001';
  end if;
  perform privado.aplicar_suspensao(p_usuario);
  perform privado.registrar('reativar', 'usuario', p_usuario::text, rotulo, '{}'::jsonb);
  perform privado.enfileirar_email(p_usuario, 'conta_reativada', jsonb_build_object('caminho', '/entrar'));
end
$$;

-- Selo de verificado. Só admin.
create or replace function public.admin_verificar(p_usuario uuid, p_verificado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rotulo text;
begin
  perform privado.exigir_admin();
  perform set_config('publike.sistema', 'on', true);
  update public.perfis set verificado = coalesce(p_verificado, false) where id = p_usuario
  returning nome into rotulo;
  perform set_config('publike.sistema', '', true);
  if rotulo is null then
    raise exception 'Essa conta ainda não tem perfil.' using errcode = 'P0001';
  end if;
  perform privado.registrar(case when p_verificado then 'verificar' else 'tirar_verificado' end,
                            'usuario', p_usuario::text, rotulo, '{}'::jsonb);
end
$$;

-- Apaga a conta e tudo que é dela (pedido de LGPD, por exemplo). Só admin.
-- A foto do perfil é apagada antes, pelo servidor do site.
create or replace function public.admin_excluir_conta(p_usuario uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rotulo text;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform privado.exigir_admin();
  if exists (select 1 from public.moderadores m where m.perfil_id = p_usuario) then
    raise exception 'Essa pessoa é moderadora. Tire ela da moderação antes.' using errcode = 'P0001';
  end if;
  if motivo is null or char_length(motivo) < 3 then
    raise exception 'Escreva o motivo (fica no registro da equipe).' using errcode = 'P0001';
  end if;
  select coalesce(p.nome, u.email::text, u.phone::text) into rotulo
    from auth.users u left join public.perfis p on p.id = u.id
   where u.id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  delete from auth.users where id = p_usuario;
  perform privado.registrar('excluir_conta', 'usuario', p_usuario::text, rotulo, jsonb_build_object('motivo', motivo));
end
$$;

-- Moderadores: lista, adicionar por e-mail, tirar. Só admin.
create or replace function public.admin_listar_moderadores()
returns table (perfil_id uuid, email text, nome text, foto text, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select m.perfil_id, u.email::text, p.nome, p.foto, m.criado_em
    from public.moderadores m
    join public.perfis p on p.id = m.perfil_id
    join auth.users u on u.id = m.perfil_id
   order by m.criado_em;
end
$$;

create or replace function public.admin_adicionar_moderador(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo uuid;
  rotulo text;
begin
  perform privado.exigir_admin();
  select u.id into alvo from auth.users u where lower(u.email::text) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if alvo is null then
    raise exception 'Ninguém entrou no Publike com esse e-mail ainda. Peça para a pessoa entrar no site uma vez.'
      using errcode = 'P0001';
  end if;
  select p.nome into rotulo from public.perfis p where p.id = alvo;
  if rotulo is null then
    raise exception 'Essa pessoa ainda não criou o perfil. Peça para ela completar o perfil no site.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.suspensoes s
              where s.usuario_id = alvo and s.encerrada_em is null and s.fim > now()) then
    raise exception 'Esta conta está suspensa. Reative antes de pôr na moderação.' using errcode = 'P0001';
  end if;
  insert into public.moderadores (perfil_id) values (alvo) on conflict (perfil_id) do nothing;
  perform privado.registrar('adicionar_moderador', 'equipe', alvo::text, rotulo, '{}'::jsonb);
  return alvo;
end
$$;

create or replace function public.admin_remover_moderador(p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rotulo text;
begin
  perform privado.exigir_admin();
  delete from public.moderadores where perfil_id = p_perfil;
  if not found then
    raise exception 'Essa pessoa não está na moderação.' using errcode = 'P0001';
  end if;
  select p.nome into rotulo from public.perfis p where p.id = p_perfil;
  perform privado.registrar('remover_moderador', 'equipe', p_perfil::text, rotulo, '{}'::jsonb);
end
$$;

-- Configurações (admin). As senhas não passam por aqui.
create or replace function public.admin_config()
returns setof public.config_site
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query select * from public.config_site;
end
$$;

create or replace function public.admin_salvar_config_emails(
  p_emails_ativos boolean,
  p_remetente_nome text,
  p_responder_para text,
  p_email_curtida boolean,
  p_email_match boolean,
  p_email_moderacao boolean,
  p_email_conta boolean,
  p_avisos_para text[],
  p_aviso_denuncia boolean,
  p_aviso_cadastro boolean,
  p_aviso_retirado boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lista text[];
  responder text := nullif(lower(btrim(coalesce(p_responder_para, ''))), '');
begin
  perform privado.exigir_admin();
  select coalesce(array_agg(distinct lower(btrim(x))), '{}') into lista
    from unnest(coalesce(p_avisos_para, '{}')) as x
   where btrim(x) <> '';
  if exists (select 1 from unnest(lista) as x where x !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Confira os e-mails que recebem os avisos da equipe.' using errcode = 'P0001';
  end if;
  if cardinality(lista) > 10 then
    raise exception 'Coloque no máximo 10 e-mails para os avisos.' using errcode = 'P0001';
  end if;
  if responder is not null and responder !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Confira o e-mail de resposta.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_remetente_nome, ''))) not between 2 and 60 then
    raise exception 'O nome do remetente precisa ter entre 2 e 60 letras.' using errcode = 'P0001';
  end if;
  update public.config_site
     set emails_ativos = coalesce(p_emails_ativos, true),
         remetente_nome = btrim(p_remetente_nome),
         responder_para = responder,
         email_curtida = coalesce(p_email_curtida, true),
         email_match = coalesce(p_email_match, true),
         email_moderacao = coalesce(p_email_moderacao, true),
         email_conta = coalesce(p_email_conta, true),
         avisos_para = lista,
         aviso_denuncia = coalesce(p_aviso_denuncia, true),
         aviso_cadastro = coalesce(p_aviso_cadastro, true),
         aviso_retirado = coalesce(p_aviso_retirado, true),
         atualizado_em = now(),
         atualizado_por = (select auth.uid());
  perform privado.registrar('salvar_config', 'config', 'emails', 'E-mails', '{}'::jsonb);
end
$$;

create or replace function public.admin_salvar_config_ia(
  p_moderacao boolean,
  p_melhorar_texto boolean,
  p_resumo boolean,
  p_modelo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if coalesce(p_modelo, '') !~ '^[a-z0-9][a-z0-9.-]{2,60}$' then
    raise exception 'Modelo inválido.' using errcode = '22023';
  end if;
  update public.config_site
     set ia_moderacao = coalesce(p_moderacao, false),
         ia_melhorar_texto = coalesce(p_melhorar_texto, false),
         ia_resumo = coalesce(p_resumo, false),
         ia_modelo = p_modelo,
         atualizado_em = now(),
         atualizado_por = (select auth.uid());
  perform privado.registrar('salvar_config', 'config', 'ia', 'IA',
                            jsonb_build_object('moderacao', p_moderacao, 'melhorar_texto', p_melhorar_texto,
                                               'resumo', p_resumo, 'modelo', p_modelo));
end
$$;

-- Textos dos e-mails (admin).
create or replace function public.admin_modelos_email()
returns table (
  chave text,
  grupo text,
  nome text,
  descricao text,
  variaveis text[],
  assunto text,
  corpo text,
  botao text,
  alterado boolean,
  atualizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select m.chave, m.grupo, m.nome, m.descricao, m.variaveis, m.assunto, m.corpo, m.botao,
         (m.assunto <> m.assunto_padrao or m.corpo <> m.corpo_padrao or m.botao is distinct from m.botao_padrao),
         m.atualizado_em
    from public.modelos_email m
   order by m.ordem, m.chave;
end
$$;

create or replace function public.admin_salvar_modelo_email(p_chave text, p_assunto text, p_corpo text, p_botao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  permitidas text[];
  desconhecida text;
  v_assunto text := btrim(coalesce(p_assunto, ''));
  v_corpo text := btrim(replace(coalesce(p_corpo, ''), E'\r\n', E'\n'));
  v_botao text := nullif(btrim(coalesce(p_botao, '')), '');
begin
  perform privado.exigir_admin();
  select m.variaveis into permitidas from public.modelos_email m where m.chave = p_chave for update;
  if not found then
    raise exception 'Modelo de e-mail não encontrado.' using errcode = 'P0002';
  end if;
  select v[1] into desconhecida
    from regexp_matches(v_assunto || ' ' || v_corpo, '\{\{\s*([^}]*?)\s*\}\}', 'g') as v
   where not (v[1] = any (permitidas))
   limit 1;
  if desconhecida is not null then
    raise exception 'A variável {{%}} não existe neste e-mail. Use: %.', desconhecida,
      (select string_agg('{{' || x || '}}', ', ') from unnest(permitidas) as x)
      using errcode = 'P0001';
  end if;
  if char_length(v_assunto) not between 3 and 150 then
    raise exception 'O assunto precisa ter entre 3 e 150 letras.' using errcode = 'P0001';
  end if;
  if char_length(v_corpo) not between 10 and 5000 then
    raise exception 'O texto precisa ter entre 10 e 5000 letras.' using errcode = 'P0001';
  end if;
  if v_botao is not null and char_length(v_botao) not between 2 and 40 then
    raise exception 'O texto do botão precisa ter entre 2 e 40 letras.' using errcode = 'P0001';
  end if;
  update public.modelos_email
     set assunto = v_assunto, corpo = v_corpo, botao = v_botao,
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where chave = p_chave;
  perform privado.registrar('salvar_modelo', 'modelo', p_chave, p_chave, '{}'::jsonb);
end
$$;

create or replace function public.admin_restaurar_modelo_email(p_chave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update public.modelos_email
     set assunto = assunto_padrao, corpo = corpo_padrao, botao = botao_padrao,
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where chave = p_chave;
  if not found then
    raise exception 'Modelo de e-mail não encontrado.' using errcode = 'P0002';
  end if;
  perform privado.registrar('restaurar_modelo', 'modelo', p_chave, p_chave, '{}'::jsonb);
end
$$;

-- Últimos e-mails da fila (admin), para conferir se estão saindo.
create or replace function public.admin_fila_emails(p_limite integer default 30)
returns table (
  id bigint,
  modelo text,
  para text,
  status text,
  tentativas smallint,
  erro text,
  criado_em timestamptz,
  enviado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select f.id, f.modelo, f.para, f.status, f.tentativas, f.erro, f.criado_em, f.enviado_em
    from privado.fila_emails f
   order by f.id desc
   limit least(greatest(coalesce(p_limite, 30), 1), 200);
end
$$;

-- Põe de novo na fila os e-mails que falharam (depois de arrumar o Zoho, por exemplo).
create or replace function public.admin_reenviar_emails()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  perform privado.exigir_admin();
  update privado.fila_emails
     set status = 'pendente', tentativas = 0, erro = null, tentar_depois = now(), criado_em = now()
   where status = 'falhou' and criado_em > now() - interval '7 days';
  get diagnostics total = row_count;
  return total;
end
$$;

-- E-mail de teste (admin).
create or replace function public.admin_email_teste(p_para text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  destino text := lower(btrim(coalesce(p_para, '')));
  novo bigint;
begin
  perform privado.exigir_admin();
  if destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Confira o e-mail que vai receber o teste.' using errcode = 'P0001';
  end if;
  insert into privado.fila_emails (modelo, para, dados)
  values ('teste', destino,
          jsonb_build_object('quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')))
  returning id into novo;
  return novo;
end
$$;

create or replace function public.admin_status_email(p_id bigint)
returns table (status text, erro text, enviado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query select f.status, f.erro, f.enviado_em from privado.fila_emails f where f.id = p_id;
end
$$;

-- Últimas decisões da IA (admin).
create or replace function public.admin_decisoes_ia(p_limite integer default 30)
returns table (
  id bigint,
  anuncio_id uuid,
  titulo text,
  status text,
  decisao text,
  categorias text[],
  explicacao text,
  modelo text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select m.id, m.anuncio_id, a.titulo, a.status, m.decisao, m.categorias, m.explicacao, m.modelo, m.criado_em
    from public.moderacao_ia m
    join public.anuncios a on a.id = m.anuncio_id
   order by m.criado_em desc
   limit least(greatest(coalesce(p_limite, 30), 1), 200);
end
$$;

-- Dados da semana para a IA escrever o resumo do painel (admin).
create or replace function public.admin_dados_para_resumo(p_dias integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dias integer := least(greatest(coalesce(p_dias, 7), 1), 90);
  desde timestamptz;
  antes timestamptz;
  r jsonb;
begin
  perform privado.exigir_admin();
  desde := now() - make_interval(days => dias);
  antes := desde - make_interval(days => dias);
  select jsonb_build_object(
    'periodo_dias', dias,
    'contas_novas', (select count(*) from auth.users u where u.created_at > desde),
    'contas_novas_periodo_anterior', (select count(*) from auth.users u where u.created_at > antes and u.created_at <= desde),
    'perfis_novos_por_tipo', (select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) from (
        select p.tipo, count(*) as n from public.perfis p where p.criado_em > desde group by p.tipo) t),
    'anuncios_novos', (select count(*) from public.anuncios a where a.criado_em > desde),
    'anuncios_novos_periodo_anterior', (select count(*) from public.anuncios a where a.criado_em > antes and a.criado_em <= desde),
    'anuncios_no_ar', (select count(*) from public.anuncios a where a.status = 'ativo' and a.expira_em > now()),
    'anuncios_novos_por_categoria', (select coalesce(jsonb_object_agg(t.categoria, t.n), '{}'::jsonb) from (
        select a.categoria, count(*) as n from public.anuncios a where a.criado_em > desde group by a.categoria) t),
    'anuncios_novos_por_regime', (select coalesce(jsonb_object_agg(t.regime, t.n), '{}'::jsonb) from (
        select coalesce(a.regime, 'servico') as regime, count(*) as n from public.anuncios a
         where a.criado_em > desde group by 1) t),
    'bairros_mais_ativos', (select coalesce(jsonb_agg(t.bairro), '[]'::jsonb) from (
        select a.bairro from public.anuncios a where a.criado_em > desde
         group by a.bairro order by count(*) desc limit 6) t),
    'curtidas', (select count(*) from public.curtidas c where c.criado_em > desde),
    'curtidas_periodo_anterior', (select count(*) from public.curtidas c where c.criado_em > antes and c.criado_em <= desde),
    'matches', (select count(*) from public.curtidas c where c.status = 'match' and c.respondida_em > desde),
    'anuncios_sem_curtida_ha_7_dias', (select count(*) from public.anuncios a
        where a.status = 'ativo' and a.expira_em > now() and a.criado_em < now() - interval '7 days'
          and not exists (select 1 from public.curtidas c where c.anuncio_id = a.id)),
    'denuncias_por_motivo', (select coalesce(jsonb_object_agg(t.motivo, t.n), '{}'::jsonb) from (
        select d.motivo, count(*) as n from public.denuncias d where d.criado_em > desde group by d.motivo) t),
    'denuncias_abertas', (select count(*) from public.denuncias d where d.status = 'aberta'),
    'anuncios_removidos', (select count(*) from public.registro_equipe g
        where g.acao = 'remover_anuncio' and g.criado_em > desde),
    'ia_retidos', (select coalesce(jsonb_agg(jsonb_build_object('titulo', a.titulo, 'categorias', to_jsonb(m.categorias))), '[]'::jsonb)
        from public.moderacao_ia m join public.anuncios a on a.id = m.anuncio_id
       where m.decisao = 'retido' and m.criado_em > desde),
    'suspensoes', (select coalesce(jsonb_agg(jsonb_build_object('tipo', s.tipo, 'dias', s.dias, 'motivo', s.motivo)), '[]'::jsonb)
        from public.suspensoes s where s.inicio > desde),
    'titulos_recentes', (select coalesce(jsonb_agg(t.titulo), '[]'::jsonb) from (
        select a.titulo from public.anuncios a where a.criado_em > desde order by a.criado_em desc limit 30) t),
    'emails_com_falha', (select count(*) from privado.fila_emails f where f.status = 'falhou' and f.criado_em > desde)
  ) into r;
  return r;
end
$$;

create or replace function public.admin_salvar_resumo(p_texto text, p_dias integer, p_modelo text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo bigint;
begin
  perform privado.exigir_admin();
  insert into public.resumos_ia (texto, dias, modelo, criado_por)
  values (left(btrim(p_texto), 6000), least(greatest(coalesce(p_dias, 7), 1), 90), p_modelo, (select auth.uid()))
  returning id into novo;
  delete from public.resumos_ia where id not in (select r.id from public.resumos_ia r order by r.criado_em desc limit 30);
  return novo;
end
$$;

create or replace function public.admin_ultimo_resumo()
returns table (id bigint, texto text, dias smallint, modelo text, criado_em timestamptz, criado_por text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select r.id, r.texto, r.dias, r.modelo, r.criado_em, coalesce(p.nome, 'Admin')
    from public.resumos_ia r left join public.perfis p on p.id = r.criado_por
   order by r.criado_em desc limit 1;
end
$$;

-- O que a equipe fez (admin).
create or replace function public.admin_registro(p_limite integer default 50, p_alvo text default null)
returns table (
  id bigint,
  quem text,
  acao text,
  alvo_tipo text,
  alvo_id text,
  rotulo text,
  detalhes jsonb,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select g.id, coalesce(p.nome, u.email::text, 'Admin'), g.acao, g.alvo_tipo, g.alvo_id, g.rotulo, g.detalhes, g.criado_em
    from public.registro_equipe g
    left join public.perfis p on p.id = g.autor_id
    left join auth.users u on u.id = g.autor_id
   where p_alvo is null or g.alvo_id = p_alvo
   order by g.criado_em desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
end
$$;


-- Chaves do servidor (admin). A chave é gerada no computador do admin; aqui chega só o hash.
create or replace function public.admin_listar_chaves_servidor()
returns table (id bigint, nome text, criada_em timestamptz, usada_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query select c.id, c.nome, c.criada_em, c.usada_em from privado.chaves_servidor c order by c.criada_em;
end
$$;

create or replace function public.admin_criar_chave_servidor(p_nome text, p_hash text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  nova bigint;
begin
  perform privado.exigir_admin();
  if char_length(v_nome) not between 2 and 60 then
    raise exception 'Dê um nome para a chave (por exemplo: Render).' using errcode = 'P0001';
  end if;
  if coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Chave inválida.' using errcode = '22023';
  end if;
  if (select count(*) from privado.chaves_servidor) >= 10 then
    raise exception 'Já existem 10 chaves. Apague as que não usa mais.' using errcode = 'P0001';
  end if;
  insert into privado.chaves_servidor (nome, hash) values (v_nome, p_hash) returning id into nova;
  perform privado.registrar('criar_chave', 'chave', nova::text, v_nome, '{}'::jsonb);
  return nova;
end
$$;

create or replace function public.admin_apagar_chave_servidor(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  perform privado.exigir_admin();
  delete from privado.chaves_servidor c where c.id = p_id returning c.nome into v_nome;
  if v_nome is null then
    raise exception 'Chave não encontrada.' using errcode = 'P0002';
  end if;
  perform privado.registrar('apagar_chave', 'chave', p_id::text, v_nome, '{}'::jsonb);
end
$$;


-- 9. Funções usadas pelo servidor do site ------------------------------------
-- Pedem a chave do servidor (ou a chave secreta do admin).

-- Pega e-mails para enviar (e marca como "enviando" para ninguém pegar junto).
-- p_so_teste: o servidor que não sabe o endereço público do site (o admin no
-- seu computador, sem PUBLIKE_URL_PUBLICA) só manda o e-mail de teste.
create or replace function public.servidor_pegar_emails(p_chave text, p_limite integer default 10, p_so_teste boolean default false)
returns table (
  id bigint,
  modelo text,
  grupo text,
  para text,
  dados jsonb,
  assunto text,
  corpo text,
  botao text,
  remetente_nome text,
  responder_para text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- envio que travou três vezes sem confirmação: desiste (melhor do que mandar repetido)
  update privado.fila_emails f
     set status = 'falhou', erro = coalesce(f.erro, 'O envio não foi confirmado.')
   where f.status = 'enviando' and f.tentar_depois <= now() and f.tentativas >= 3;
  -- aviso que ficou dias parado na fila não serve mais
  update privado.fila_emails f
     set status = 'cancelado', erro = 'Ficou mais de 3 dias na fila sem sair.'
   where f.status = 'pendente' and f.criado_em < now() - interval '3 days';

  return query
  with escolhidos as (
    select f.id from privado.fila_emails f
     where f.tentar_depois <= now() and (f.status = 'pendente' or (f.status = 'enviando' and f.tentativas < 3))
       and (not coalesce(p_so_teste, false) or f.modelo = 'teste')
     order by f.id
     limit least(greatest(coalesce(p_limite, 10), 1), 50)
     for update skip locked
  ), marcados as (
    update privado.fila_emails f
       set status = 'enviando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '15 minutes'
      from escolhidos e
     where f.id = e.id
    returning f.id, f.modelo, f.para, f.dados
  )
  select m.id, m.modelo, me.grupo, m.para, m.dados, me.assunto, me.corpo, me.botao,
         c.remetente_nome, c.responder_para
    from marcados m
    join public.modelos_email me on me.chave = m.modelo
    cross join public.config_site c
   order by m.id;
end
$$;

create or replace function public.servidor_marcar_email(p_chave text, p_id bigint, p_ok boolean, p_erro text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.fila_emails
     set status = case when p_ok then 'enviado' when tentativas >= 3 then 'falhou' else 'pendente' end,
         enviado_em = case when p_ok then now() end,
         erro = case when p_ok then null else left(coalesce(p_erro, 'erro desconhecido'), 500) end,
         tentar_depois = case when p_ok then tentar_depois else now() + tentativas * interval '5 minutes' end
   where id = p_id and status = 'enviando';
end
$$;

-- Pega anúncios para a IA revisar. "versao" é a impressão do conteúdo enviado:
-- se o anúncio mudar enquanto a IA pensa, a resposta antiga é ignorada.
create or replace function public.servidor_pegar_revisoes_ia(p_chave text, p_limite integer default 5)
returns table (
  anuncio_id uuid,
  versao text,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  autor_tipo text,
  modelo text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- revisões que travaram três vezes: ficam registradas como erro (e aparecem para a moderação)
  with esgotadas as (
    delete from privado.fila_ia f
     where f.status = 'revisando' and f.tentar_depois <= now() and f.tentativas >= 3
    returning f.anuncio_id
  )
  insert into public.moderacao_ia (anuncio_id, decisao, explicacao)
  select e.anuncio_id, 'erro', 'A revisão não terminou depois de três tentativas.' from esgotadas e;

  return query
  with escolhidos as (
    select f.anuncio_id from privado.fila_ia f
     where f.tentar_depois <= now() and (f.status = 'pendente' or f.tentativas < 3)
     order by f.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update privado.fila_ia f
       set status = 'revisando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '5 minutes'
      from escolhidos e
     where f.anuncio_id = e.anuncio_id
    returning f.anuncio_id
  )
  select a.id, privado.conteudo_revisado(a), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor,
         a.pagamento_unidade, a.beneficios, a.horario, a.vagas, a.cidade, a.bairro, p.tipo, c.ia_modelo
    from marcados m
    join public.anuncios a on a.id = m.anuncio_id
    join public.perfis p on p.id = a.autor_id
    cross join public.config_site c;
end
$$;

-- Resultado da IA: 'aprovado', 'retido' (sai do ar até a moderação olhar) ou 'erro'.
create or replace function public.servidor_resultado_ia(
  p_chave text,
  p_anuncio uuid,
  p_versao text,
  p_decisao text,
  p_categorias text[] default '{}',
  p_explicacao text default null,
  p_modelo text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila privado.fila_ia;
  anuncio public.anuncios;
  categorias text[];
  anterior text;
begin
  perform privado.exigir_servidor(p_chave);
  if p_decisao not in ('aprovado', 'retido', 'erro') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into fila from privado.fila_ia f where f.anuncio_id = p_anuncio for update;
  if not found then
    return 'ignorado';
  end if;
  select * into anuncio from public.anuncios a where a.id = p_anuncio for update;
  if not found then
    delete from privado.fila_ia where anuncio_id = p_anuncio;
    return 'ignorado';
  end if;
  -- o anúncio mudou enquanto a IA pensava: revisa de novo a versão nova
  if privado.conteudo_revisado(anuncio) is distinct from p_versao then
    update privado.fila_ia set status = 'pendente', tentativas = 0, tentar_depois = now() where anuncio_id = p_anuncio;
    return 'desatualizado';
  end if;
  if p_decisao = 'erro' and fila.tentativas < 3 then
    update privado.fila_ia
       set status = 'pendente', tentar_depois = now() + fila.tentativas * interval '5 minutes'
     where anuncio_id = p_anuncio;
    return 'tentar_de_novo';
  end if;
  select coalesce(array_agg(distinct c), '{}') into categorias
    from (select c from unnest(coalesce(p_categorias, '{}')) as c where c ~ '^[a-z_]{2,40}$' limit 8) t;
  delete from privado.fila_ia where anuncio_id = p_anuncio;
  insert into public.moderacao_ia (anuncio_id, decisao, categorias, explicacao, modelo)
  values (p_anuncio, p_decisao, categorias, left(p_explicacao, 1000), left(p_modelo, 80));
  if p_decisao = 'retido' then
    -- sai do ar mesmo se estiver pausado, encerrado ou vencido: só volta pela moderação
    anterior := current_setting('publike.sistema', true);
    perform set_config('publike.sistema', 'on', true);
    perform set_config('publike.origem', 'ia', true);
    update public.anuncios set status = 'em_analise' where id = p_anuncio and status not in ('em_analise', 'removido');
    perform set_config('publike.origem', '', true);
    perform set_config('publike.sistema', coalesce(anterior, ''), true);
  end if;
  return p_decisao;
end
$$;


-- 10. Ajustes nas funções que o site já usava -----------------------------

-- Links e endereços de site também ficam de fora (eles já eram contra as
-- regras). Assim ninguém põe "confirme em site-falso.com" num nome que vai
-- para o assunto de um e-mail do Publike.
-- texto_livre (descrição, sobre, benefícios, horário): ".Com palavra" é frase
-- grudada ("no centro.Com carteira"), não site. Nome, título, bairro e
-- mensagem não têm essa folga: "pix-premiado.Com" num nome é bloqueado.
create or replace function public.tem_contato(texto text, texto_livre boolean)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with t as (
    -- faixas de ano ("2026-2027") não são telefone
    select regexp_replace(coalesce(texto, ''), '(19|20)[0-9]{2} ?[-/] ?(19|20)[0-9]{2}', '', 'g') as v
  ), d as (
    -- para achar site: gov.br é do governo (ninguém registra nome lá)
    select v, regexp_replace(
                case when texto_livre then regexp_replace(v, '([a-z])\.(Com\s+[a-zà-ú])', '\1. \2', 'g') else v end,
                '\mgov\.br\M', 'gov br', 'gi') as s
      from t
  )
  select v ~ '(\(?[0-9]{2}\)?[ .-]?)?9?[0-9]{4}[ .-]?[0-9]{4}'
      or v ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or v ~* '(wa\.me|whatsapp\.com|api\.whatsapp)'
      or v ~* '(https?://|www\.)'
      or s ~* '\m[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|br|io|app|xyz|info|site|online|store|shop|link|ly|biz|tv|top|vip|club|dev)\M'
    from d
$$;

create or replace function public.tem_contato(texto text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.tem_contato(texto, false)
$$;

-- Gatilho do perfil: conta suspensa não edita; o selo de verificado e a
-- suspensão só mudam pelas funções do admin.
create or replace function public.perfis_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
begin
  if not sistema and new.id = (select auth.uid()) then
    perform privado.exigir_conta_ativa();
  end if;
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.bairro := nullif(btrim(regexp_replace(coalesce(new.bairro, ''), '\s+', ' ', 'g')), '');
  new.sobre := nullif(btrim(coalesce(new.sobre, '')), '');
  new.servicos := coalesce(
    (select array_agg(distinct s order by s)
       from (select btrim(x) as s from unnest(new.servicos) as x) t
      where char_length(s) between 2 and 40),
    '{}'
  );
  new.atualizado_em := now();
  if new.foto is not null and split_part(new.foto, '/', 1) <> new.id::text then
    raise exception 'Envie a foto de novo.' using errcode = 'P0001', hint = 'foto_invalida';
  end if;
  -- Confere o texto só quando ele muda: um perfil antigo não trava a
  -- suspensão nem outras mudanças feitas pelo sistema.
  if (tg_op = 'INSERT' or new.nome is distinct from old.nome or new.sobre is distinct from old.sobre
      or new.bairro is distinct from old.bairro or new.cidade is distinct from old.cidade
      or new.servicos is distinct from old.servicos)
     and (public.tem_contato(new.nome) or public.tem_contato(new.sobre, true) or public.tem_contato(new.bairro)
          or public.tem_contato(new.cidade) or public.tem_contato(array_to_string(new.servicos, ' '))) then
    raise exception 'Tire o telefone, e-mail ou link do perfil. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    if not sistema then
      new.verificado := old.verificado;
      new.suspenso_ate := old.suspenso_ate;
    end if;
  elsif not sistema then
    new.verificado := false;
    new.suspenso_ate := null;
  end if;
  return new;
end
$$;

create or replace function public.contatos_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  digitos text := regexp_replace(coalesce(new.whatsapp, ''), '[^0-9]', '', 'g');
begin
  if new.perfil_id = (select auth.uid()) and coalesce(current_setting('publike.sistema', true), '') <> 'on' then
    perform privado.exigir_conta_ativa();
  end if;
  if digitos = '' then
    new.whatsapp := null;
  elsif char_length(digitos) in (10, 11) then
    new.whatsapp := '55' || digitos;   -- veio sem o +55
  else
    new.whatsapp := digitos;
  end if;
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.atualizado_em := now();
  return new;
end
$$;

create or replace function public.anuncios_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  moderador boolean := public.eh_moderador();
  -- ligado só dentro de funções do próprio banco (denúncias automáticas, IA)
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
  lat double precision;
  lng double precision;
begin
  new.titulo := btrim(regexp_replace(new.titulo, '\s+', ' ', 'g'));
  new.bairro := btrim(regexp_replace(new.bairro, '\s+', ' ', 'g'));
  new.descricao := btrim(new.descricao);
  new.beneficios := nullif(btrim(coalesce(new.beneficios, '')), '');
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');

  -- Confere o texto só quando ele muda: um anúncio antigo não trava a
  -- moderação, a IA nem o vencimento automático.
  if (tg_op = 'INSERT' or new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao
      or new.beneficios is distinct from old.beneficios or new.horario is distinct from old.horario
      or new.bairro is distinct from old.bairro or new.cidade is distinct from old.cidade)
     and (public.tem_contato(new.titulo) or public.tem_contato(new.descricao, true)
          or public.tem_contato(new.beneficios, true) or public.tem_contato(new.horario, true)
          or public.tem_contato(new.bairro) or public.tem_contato(new.cidade)) then
    raise exception 'Tire o telefone, e-mail ou link do texto. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  -- Guarda só a região (grade de ~500 m). O endereço exato nunca é salvo.
  new.local := extensions.st_snaptogrid(new.local::extensions.geometry, 0.005)::extensions.geography;
  lat := extensions.st_y(new.local::extensions.geometry);
  lng := extensions.st_x(new.local::extensions.geometry);
  if lat not between -17.5 and -15.9 or lng not between -50.3 and -48.4 then
    raise exception 'Por enquanto o Publike funciona em Goiânia e região. Marque um ponto dentro da região metropolitana.'
      using errcode = 'P0001', hint = 'fora_da_regiao';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'ativo';
    new.nota_moderacao := null;
    new.status_anterior := null;
    new.criado_em := now();
    new.atualizado_em := now();
    new.expira_em := now() + interval '30 days';
    if usuario is not null then
      perform privado.exigir_conta_ativa();
      if not exists (
        select 1 from public.contatos c
         where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
      ) then
        raise exception 'Complete seu perfil com um WhatsApp antes de publicar.'
          using errcode = 'P0001', hint = 'perfil_incompleto';
      end if;
      perform privado.conferir_ativos(new.id);
      perform privado.conferir_limite('anuncio', 10, 'Você chegou ao limite de 10 publicações por dia. Tente de novo amanhã.');
    end if;
  else
    new.id := old.id;
    new.autor_id := old.autor_id;
    new.tipo := old.tipo;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
    -- a moderação muda a situação do anúncio só pelos botões (moderar_anuncio)
    if usuario is not null and moderador and not sistema and usuario <> old.autor_id
       and new.status is distinct from old.status then
      raise exception 'Mude a situação do anúncio pelos botões da moderação.' using errcode = 'P0001';
    end if;
    -- regras de quem publicou (valem também para o moderador no próprio anúncio)
    if usuario is not null and not sistema and (not moderador or usuario = old.autor_id) then
      perform privado.exigir_conta_ativa();
      if old.status in ('em_analise', 'removido') then
        raise exception 'Este anúncio está com a moderação e não pode ser alterado agora.'
          using errcode = 'P0001', hint = 'com_moderacao';
      end if;
      if new.status is distinct from old.status and new.status not in ('ativo', 'pausado', 'encerrado') then
        raise exception 'Mudança de status não permitida.' using errcode = '42501';
      end if;
      new.nota_moderacao := old.nota_moderacao;
      -- cada mudança no texto passa de novo pela IA: um limite por dia evita abuso
      if privado.conteudo_revisado(new) <> privado.conteudo_revisado(old) then
        perform privado.conferir_limite('edicao', 40, 'Você editou anúncios muitas vezes hoje. Tente de novo amanhã.');
      end if;
      -- voltar ao ar (de encerrado ou expirado) conta no limite de 20 no ar
      if new.status in ('ativo', 'pausado') and old.status not in ('ativo', 'pausado') then
        perform privado.conferir_ativos(new.id);
      end if;
    end if;
    -- guarda a situação de antes da moderação: ao liberar, o anúncio volta para ela
    if new.status in ('em_analise', 'removido') then
      new.status_anterior := case when old.status in ('em_analise', 'removido') then old.status_anterior else old.status end;
    else
      new.status_anterior := null;
    end if;
    -- voltar ao ar renova o prazo de 30 dias
    if new.status = 'ativo' and old.status is distinct from 'ativo' then
      new.expira_em := now() + interval '30 days';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.curtidas_antes_de_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  new.status := 'pendente';
  new.criado_em := now();
  new.respondida_em := null;
  new.mensagem := nullif(btrim(coalesce(new.mensagem, '')), '');
  if public.tem_contato(new.mensagem) then
    raise exception 'Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if usuario is not null then
    perform privado.exigir_conta_ativa();
    if not exists (
      select 1 from public.contatos c
       where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
    ) then
      raise exception 'Complete seu perfil com um WhatsApp antes de curtir.'
        using errcode = 'P0001', hint = 'perfil_incompleto';
    end if;
    perform privado.conferir_limite('curtida', 60, 'Você curtiu bastante coisa hoje. Tente de novo amanhã.');
  end if;
  return new;
end
$$;

create or replace function public.denuncias_antes_de_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  new.status := 'aberta';
  new.criado_em := now();
  new.detalhes := nullif(btrim(coalesce(new.detalhes, '')), '');
  if usuario is not null then
    perform privado.exigir_conta_ativa();
    perform privado.conferir_limite('denuncia', 10, 'Você já enviou muitas denúncias hoje. A moderação vai analisar as que chegaram.');
  end if;
  return new;
end
$$;

-- Avisos de moderação: o texto muda quando foi a IA que tirou do ar, e a
-- equipe recebe um e-mail quando um anúncio sai do ar sozinho.
create or replace function public.notificar_moderacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pela_ia boolean := coalesce(current_setting('publike.origem', true), '') = 'ia';
begin
  if new.status is distinct from old.status then
    if new.status = 'em_analise' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'em_analise', new.id,
              case when pela_ia
                   then 'Seu anúncio “' || new.titulo || '” saiu do ar por enquanto: a moderação vai dar uma olhada. Você recebe um aviso quando terminar.'
                   else 'Seu anúncio “' || new.titulo || '” recebeu denúncias e saiu do ar até a moderação analisar.'
              end);
      perform privado.avisar_equipe('aviso_retirado', jsonb_build_object(
        'titulo', new.titulo,
        'origem', case when pela_ia
                       then 'a moderação automática (IA) achou o anúncio suspeito.'
                       else 'o anúncio recebeu denúncias de três pessoas diferentes.'
                  end,
        'caminho', '/admin/denuncias'));
    elsif new.status = 'removido' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'removido', new.id,
              'Seu anúncio “' || new.titulo || '” foi removido por não seguir as regras do Publike.'
              || coalesce(' Motivo: ' || new.nota_moderacao, ''));
    elsif new.status = 'ativo' and old.status in ('em_analise', 'removido') then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (new.autor_id, 'liberado', new.id,
              'Seu anúncio “' || new.titulo || '” foi liberado pela moderação e voltou ao ar.');
    end if;
  end if;
  return null;
end
$$;

-- Decisão da moderação: 'remover' (com motivo para quem publicou) ou 'liberar'.
drop function public.moderar_anuncio(uuid, text);
create function public.moderar_anuncio(p_anuncio uuid, p_decisao text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nota text := nullif(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), '');
  v_titulo text;
  v_autor uuid;
  ultima_ia text;
  anterior text := current_setting('publike.sistema', true);
begin
  perform privado.exigir_equipe();
  if char_length(nota) > 500 then
    raise exception 'Use no máximo 500 letras no motivo.' using errcode = 'P0001';
  end if;
  select a.titulo, a.autor_id into v_titulo, v_autor from public.anuncios a where a.id = p_anuncio;
  if not found then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  if v_autor = (select auth.uid()) and not privado.eh_admin() then
    raise exception 'Você não pode moderar o próprio anúncio.' using errcode = 'P0001';
  end if;
  if p_decisao not in ('remover', 'liberar') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  perform set_config('publike.sistema', 'on', true);
  if p_decisao = 'remover' then
    update public.anuncios set status = 'removido', nota_moderacao = nota where id = p_anuncio;
    update public.denuncias set status = 'procedente' where anuncio_id = p_anuncio and status = 'aberta';
  else
    -- volta para a situação de antes (pausado continua pausado; o resto volta ao ar)
    update public.anuncios
       set status = case when status_anterior in ('pausado', 'encerrado', 'expirado') then status_anterior else 'ativo' end,
           nota_moderacao = null
     where id = p_anuncio and status in ('em_analise', 'removido');
    update public.denuncias set status = 'improcedente' where anuncio_id = p_anuncio and status = 'aberta';
    -- liberado por uma pessoa: registra para sair da fila (se a IA tinha retido ou falhado)
    select m.decisao into ultima_ia from public.moderacao_ia m
     where m.anuncio_id = p_anuncio order by m.criado_em desc, m.id desc limit 1;
    if ultima_ia in ('retido', 'erro') then
      insert into public.moderacao_ia (anuncio_id, decisao, explicacao, modelo)
      values (p_anuncio, 'aprovado', 'Liberado pela moderação.', 'moderação');
    end if;
  end if;
  perform set_config('publike.sistema', coalesce(anterior, ''), true);
  perform privado.registrar(case when p_decisao = 'remover' then 'remover_anuncio' else 'liberar_anuncio' end,
                            'anuncio', p_anuncio::text, v_titulo, jsonb_build_object('nota', nota));
end
$$;

-- Fila da moderação: denúncias abertas e anúncios que a IA reteve.
drop function public.fila_moderacao();
create function public.fila_moderacao()
returns table (
  anuncio_id uuid,
  titulo text,
  tipo text,
  status text,
  cidade text,
  bairro text,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  denuncias_abertas integer,
  motivos text[],
  detalhes text[],
  ia_retido boolean,
  ia_falhou boolean,
  ia_categorias text[],
  ia_explicacao text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    select a.id, a.titulo, a.tipo, a.status, a.cidade, a.bairro, a.criado_em,
           p.id, p.nome,
           count(d.id)::integer,
           coalesce(array_agg(distinct d.motivo) filter (where d.motivo is not null), '{}'),
           coalesce((array_agg(d.detalhes order by d.criado_em desc)
                      filter (where d.detalhes is not null))[1:5], '{}'),
           coalesce(ia.decisao = 'retido', false),
           coalesce(ia.decisao = 'erro', false),
           coalesce(ia.categorias, '{}'),
           ia.explicacao
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id
      left join public.denuncias d on d.anuncio_id = a.id and d.status = 'aberta'
      left join lateral (
        select m.decisao, m.categorias, m.explicacao from public.moderacao_ia m
         where m.anuncio_id = a.id order by m.criado_em desc, m.id desc limit 1
      ) ia on true
     where a.status = 'em_analise' or d.id is not null
        or (ia.decisao = 'erro' and a.status in ('ativo', 'pausado'))
     group by a.id, p.id, ia.decisao, ia.categorias, ia.explicacao
     order by (a.status = 'em_analise') desc, count(d.id) desc, max(d.criado_em) desc nulls last, a.criado_em desc;
end
$$;

-- Busca: anúncio de conta suspensa some, até para a equipe.
create or replace function public.buscar_anuncios(
  p_lat double precision default -16.6806,
  p_lng double precision default -49.2563,
  p_raio_km double precision default 25,
  p_tipo text default null,
  p_categoria text default null,
  p_regime text default null,
  p_texto text default null,
  p_ordem text default 'perto',
  p_limite integer default 60
)
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  distancia_km double precision,
  criado_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_verificado boolean,
  minha_curtida text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as ponto
  ),
  termo as (
    select nullif(btrim(coalesce(p_texto, '')), '') as texto
  ),
  consulta as (
    select t.texto,
           case when t.texto is null then null
                else websearch_to_tsquery('portuguese'::regconfig, public.sem_acento(t.texto)) end as tsq
      from termo t
  )
  select a.id, a.tipo, a.titulo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         round((st_distance(a.local, ref.ponto) / 1000)::numeric, 1)::double precision,
         a.criado_em, p.id, p.nome, p.tipo, p.verificado,
         c.status
    from public.anuncios a
    cross join ref
    cross join consulta q
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.status = 'ativo'
     and a.expira_em > now()
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and st_dwithin(a.local, ref.ponto, least(greatest(p_raio_km, 1), 100) * 1000)
     and (p_tipo is null or a.tipo = p_tipo)
     and (p_categoria is null or a.categoria = p_categoria)
     and (p_regime is null or a.regime = p_regime)
     and (q.texto is null
          or a.busca @@ q.tsq
          or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(q.texto) || '%')
   order by
     case when p_ordem = 'recentes' then a.criado_em end desc nulls last,
     st_distance(a.local, ref.ponto),
     a.criado_em desc
   limit least(greatest(p_limite, 1), 200)
$$;

-- Quem curtiu um anúncio meu: conta suspensa não aparece.
create or replace function public.interessados(p_anuncio uuid)
returns table (
  perfil_id uuid,
  nome text,
  tipo text,
  foto text,
  cidade text,
  bairro text,
  sobre text,
  servicos text[],
  verificado boolean,
  membro_desde timestamptz,
  mensagem text,
  status text,
  curtido_em timestamptz,
  whatsapp text,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, p.sobre, p.servicos,
         p.verificado, p.criado_em, c.mensagem, c.status, c.criado_em,
         case when c.status = 'match' and a.status not in ('em_analise', 'removido') then ct.whatsapp end,
         case when c.status = 'match' and a.status not in ('em_analise', 'removido') then ct.email end
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = c.perfil_id
    left join public.contatos ct on ct.perfil_id = p.id
   where c.anuncio_id = p_anuncio
     and a.autor_id = (select auth.uid())
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and not (select public.minha_conta_suspensa())
   order by (c.status = 'match') desc, (c.status = 'pendente') desc, c.criado_em desc
$$;

-- O que eu curti: anúncio de conta suspensa não aparece.
create or replace function public.minhas_curtidas()
returns table (
  anuncio_id uuid,
  titulo text,
  tipo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  anuncio_status text,
  expira_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  status text,
  mensagem text,
  curtido_em timestamptz,
  respondida_em timestamptz,
  autor_whatsapp text,
  autor_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, a.tipo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro,
         case when a.status = 'ativo' and a.expira_em <= now() then 'expirado' else a.status end,
         a.expira_em, p.id, p.nome, p.tipo, p.foto,
         c.status, c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'match' and a.status <> 'em_analise' then ct.whatsapp end,
         case when c.status = 'match' and a.status <> 'em_analise' then ct.email end
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = a.autor_id
    left join public.contatos ct on ct.perfil_id = p.id
   where c.perfil_id = (select auth.uid())
     and a.status <> 'removido'
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and not (select public.minha_conta_suspensa())
   order by c.criado_em desc
$$;

-- Matches: conta suspensa não aparece (e o contato dela não é entregue).
create or replace function public.meus_matches()
returns table (
  anuncio_id uuid,
  anuncio_titulo text,
  anuncio_tipo text,
  papel text,
  outro_id uuid,
  outro_nome text,
  outro_tipo text,
  outro_foto text,
  outro_cidade text,
  outro_bairro text,
  outro_whatsapp text,
  outro_email text,
  match_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select a.id, a.titulo, a.tipo, 'publiquei'::text,
           p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, ct.whatsapp, ct.email,
           coalesce(c.respondida_em, c.criado_em) as quando
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = c.perfil_id
      left join public.contatos ct on ct.perfil_id = p.id
     where c.status = 'match' and a.autor_id = (select auth.uid())
       and a.status not in ('em_analise', 'removido')
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
    union all
    select a.id, a.titulo, a.tipo, 'curti'::text,
           p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, ct.whatsapp, ct.email,
           coalesce(c.respondida_em, c.criado_em) as quando
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = a.autor_id
      left join public.contatos ct on ct.perfil_id = p.id
     where c.status = 'match' and c.perfil_id = (select auth.uid())
       and a.status not in ('em_analise', 'removido')
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
  ) m
  where not (select public.minha_conta_suspensa())
  order by m.quando desc
$$;

create or replace function public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
  situacao text;
begin
  perform privado.exigir_conta_ativa();
  if p_decisao not in ('match', 'dispensada', 'pendente') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis p where p.id = p_perfil and p.suspenso_ate > now()) then
    raise exception 'Essa pessoa está com a conta suspensa.' using errcode = 'P0001';
  end if;
  select c.status, a.status into atual, situacao
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select auth.uid())
     for update of c;
  if not found then
    raise exception 'Curtida não encontrada.' using errcode = 'P0002';
  end if;
  if situacao in ('em_analise', 'removido') then
    raise exception 'Este anúncio está com a moderação. Responda depois que ele for liberado.'
      using errcode = 'P0001', hint = 'com_moderacao';
  end if;
  if atual = 'match' then
    raise exception 'Este match já aconteceu e não pode ser desfeito.' using errcode = 'P0001', hint = 'match_feito';
  end if;
  update public.curtidas
     set status = p_decisao,
         respondida_em = case when p_decisao = 'pendente' then null else now() end
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
end
$$;

create or replace function public.renovar_anuncio(p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova_data timestamptz;
begin
  perform privado.exigir_conta_ativa();
  update public.anuncios
     set status = 'ativo', expira_em = now() + interval '30 days'
   where id = p_id
     and autor_id = (select auth.uid())
     and status in ('ativo', 'pausado', 'encerrado', 'expirado')
  returning expira_em into nova_data;
  if nova_data is null then
    raise exception 'Não foi possível renovar este anúncio.' using errcode = 'P0001';
  end if;
  return nova_data;
end
$$;

create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para excluí-la.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  delete from auth.users where id = usuario;
end
$$;

-- Salva perfil e contato juntos (agora com a opção de receber avisos por e-mail).
drop function public.salvar_perfil(text, text, text, text, text, text[], text, text, text);
create function public.salvar_perfil(
  p_nome text,
  p_tipo text,
  p_cidade text,
  p_bairro text,
  p_sobre text,
  p_servicos text[],
  p_foto text,
  p_whatsapp text,
  p_email text,
  p_receber_emails boolean default true
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para salvar o perfil.' using errcode = '42501';
  end if;
  insert into public.perfis as p (id, nome, tipo, cidade, bairro, sobre, servicos, foto)
  values (usuario, p_nome, p_tipo, p_cidade, p_bairro, p_sobre, coalesce(p_servicos, '{}'), p_foto)
  on conflict (id) do update
     set nome = excluded.nome, tipo = excluded.tipo, cidade = excluded.cidade,
         bairro = excluded.bairro, sobre = excluded.sobre, servicos = excluded.servicos,
         foto = excluded.foto;
  insert into public.contatos as c (perfil_id, whatsapp, email, receber_emails)
  values (usuario, p_whatsapp, p_email, coalesce(p_receber_emails, true))
  on conflict (perfil_id) do update
     set whatsapp = excluded.whatsapp, email = excluded.email, receber_emails = excluded.receber_emails;
end
$$;

-- Limpeza diária: também arruma a fila de e-mails e as suspensões vencidas.
create or replace function public.expirar_anuncios()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  perform set_config('publike.sistema', 'on', true);
  update public.anuncios set status = 'expirado' where status = 'ativo' and expira_em <= now();
  get diagnostics total = row_count;
  update public.perfis set suspenso_ate = null where suspenso_ate <= now();
  delete from public.notificacoes where criado_em < now() - interval '90 days';
  delete from privado.limites_uso where criado_em < now() - interval '2 days';
  delete from privado.fila_emails
   where (status in ('enviado', 'cancelado') and criado_em < now() - interval '30 days')
      or (status = 'falhou' and criado_em < now() - interval '90 days');
  return total;
end
$$;


-- 11. Permissões --------------------------------------------------------------

alter table public.registro_equipe enable row level security;
alter table public.suspensoes enable row level security;
alter table public.config_site enable row level security;
alter table public.modelos_email enable row level security;
alter table public.moderacao_ia enable row level security;
alter table public.resumos_ia enable row level security;

-- Sem regras de RLS: ninguém lê ou escreve essas tabelas direto pela API,
-- só pelas funções acima (que conferem quem está chamando).
revoke all on public.registro_equipe, public.suspensoes, public.config_site,
  public.modelos_email, public.moderacao_ia, public.resumos_ia from anon, authenticated;
revoke all on privado.fila_emails, privado.fila_ia, privado.chaves_servidor from public, anon, authenticated;

-- Coluna nova do contato
grant insert (receber_emails), update (receber_emails) on public.contatos to authenticated;

-- Funções internas: só os gatilhos e as funções do banco usam.
revoke execute on function
  privado.eh_admin(),
  privado.exigir_admin(),
  privado.exigir_equipe(),
  privado.exigir_servidor(text),
  privado.conteudo_revisado(public.anuncios),
  privado.registrar(text, text, text, text, jsonb),
  privado.exigir_conta_ativa(),
  privado.aplicar_suspensao(uuid),
  privado.anuncio_editado_pela_equipe(),
  privado.nome_para_email(uuid),
  privado.enfileirar_email(uuid, text, jsonb),
  privado.avisar_equipe(text, jsonb),
  privado.notificacao_por_email(),
  privado.denuncia_para_equipe(),
  privado.perfil_novo_para_equipe(),
  privado.anuncio_para_revisao_ia()
from public;
-- Os gatilhos de perfil, contato, anúncio e curtida rodam como quem está logado.
revoke execute on function privado.conteudo_revisado(public.anuncios) from public;
grant execute on function privado.exigir_conta_ativa(), privado.eh_admin(), privado.conteudo_revisado(public.anuncios)
  to authenticated;
-- O admin (chave secreta) corrige anúncios: os gatilhos rodam com o papel dele.
grant usage on schema privado to service_role;
grant execute on function privado.exigir_conta_ativa(), privado.eh_admin(), privado.conteudo_revisado(public.anuncios)
  to service_role;

-- Funções do admin: só com a chave secreta (papel service_role).
revoke execute on function
  public.admin_resumo(),
  public.admin_listar_usuarios(text, text, integer, integer),
  public.admin_usuario(uuid),
  public.admin_excluir_anuncio(uuid, text),
  public.admin_suspender(uuid, integer, text),
  public.admin_reativar(uuid),
  public.admin_verificar(uuid, boolean),
  public.admin_excluir_conta(uuid, text),
  public.admin_listar_moderadores(),
  public.admin_adicionar_moderador(text),
  public.admin_remover_moderador(uuid),
  public.admin_config(),
  public.admin_salvar_config_emails(boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean),
  public.admin_salvar_config_ia(boolean, boolean, boolean, text),
  public.admin_modelos_email(),
  public.admin_salvar_modelo_email(text, text, text, text),
  public.admin_restaurar_modelo_email(text),
  public.admin_fila_emails(integer),
  public.admin_reenviar_emails(),
  public.admin_email_teste(text),
  public.admin_status_email(bigint),
  public.admin_decisoes_ia(integer),
  public.admin_dados_para_resumo(integer),
  public.admin_salvar_resumo(text, integer, text),
  public.admin_ultimo_resumo(),
  public.admin_registro(integer, text),
  public.admin_listar_chaves_servidor(),
  public.admin_criar_chave_servidor(text, text),
  public.admin_apagar_chave_servidor(bigint)
from public, anon, authenticated;

grant execute on function
  public.admin_resumo(),
  public.admin_listar_usuarios(text, text, integer, integer),
  public.admin_usuario(uuid),
  public.admin_excluir_anuncio(uuid, text),
  public.admin_suspender(uuid, integer, text),
  public.admin_reativar(uuid),
  public.admin_verificar(uuid, boolean),
  public.admin_excluir_conta(uuid, text),
  public.admin_listar_moderadores(),
  public.admin_adicionar_moderador(text),
  public.admin_remover_moderador(uuid),
  public.admin_config(),
  public.admin_salvar_config_emails(boolean, text, text, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean),
  public.admin_salvar_config_ia(boolean, boolean, boolean, text),
  public.admin_modelos_email(),
  public.admin_salvar_modelo_email(text, text, text, text),
  public.admin_restaurar_modelo_email(text),
  public.admin_fila_emails(integer),
  public.admin_reenviar_emails(),
  public.admin_email_teste(text),
  public.admin_status_email(bigint),
  public.admin_decisoes_ia(integer),
  public.admin_dados_para_resumo(integer),
  public.admin_salvar_resumo(text, integer, text),
  public.admin_ultimo_resumo(),
  public.admin_registro(integer, text),
  public.admin_listar_chaves_servidor(),
  public.admin_criar_chave_servidor(text, text),
  public.admin_apagar_chave_servidor(bigint)
to service_role;

-- Funções da moderação (moderador com login ou admin) e de quem está logado.
revoke execute on function
  public.admin_listar_anuncios(text, text, text, uuid, integer, integer),
  public.admin_anuncio(uuid),
  public.moderar_anuncio(uuid, text, text),
  public.fila_moderacao(),
  public.minha_conta_suspensa(),
  public.usar_ia_texto(),
  public.salvar_perfil(text, text, text, text, text, text[], text, text, text, boolean)
from public, anon;

grant execute on function
  public.admin_listar_anuncios(text, text, text, uuid, integer, integer),
  public.admin_anuncio(uuid),
  public.moderar_anuncio(uuid, text, text),
  public.fila_moderacao()
to authenticated, service_role;

grant execute on function
  public.minha_conta_suspensa(),
  public.usar_ia_texto(),
  public.salvar_perfil(text, text, text, text, text, text[], text, text, text, boolean)
to authenticated;

-- Sem login: só o que o site precisa para montar as páginas.
grant execute on function public.config_publica() to anon, authenticated;

-- Servidor do site: conferem a chave do servidor por dentro.
grant execute on function
  public.servidor_pegar_emails(text, integer, boolean),
  public.servidor_marcar_email(text, bigint, boolean, text),
  public.servidor_pegar_revisoes_ia(text, integer),
  public.servidor_resultado_ia(text, uuid, text, text, text[], text, text)
to anon, authenticated, service_role;
