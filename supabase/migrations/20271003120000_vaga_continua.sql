-- A vaga ainda está aberta? (25/11/2026; Marcelo, com a Organiza Inventory: 28 dias no ar e 38 curtidas, "Vagas
-- antigas e com várias curtidas, ter uma maneira de questionar a empresa, se a vaga ainda está disponível"; escolheu
-- "os dois" e "desce na lista"). Pode rodar de novo.
--
-- 1. O Publike pergunta sozinho a quem publicou (no sino, no celular, por e-mail e pelo WhatsApp, com os botões "Sim,
--    continua" e "Já preenchi"): a vaga no ar há 14 dias ou mais desde a última confirmação, com 10 curtidas ou mais,
--    ou quando alguém perguntou. No máximo uma pergunta a cada 7 dias por vaga, das 8h às 20h, e nunca nos 2 dias antes
--    de vencer (lá o aviso do vencimento já pergunta).
-- 2. Quem procura pergunta pelo botão "Ainda está aberta?" (na vaga no ar há 14 dias ou mais desde a última
--    confirmação). A resposta volta para quem perguntou: "continua aberta" (aviso vaga_continua_sim) ou "preenchida"
--    (o aviso vaga_preenchida, para quem não curtiu; quem curtiu já recebe).
-- 3. A resposta: "Sim, continua" confirma; renovar a vaga também (o prazo andou para a frente). "Já preenchi" marca a
--    vaga como preenchida.
-- 4. Sem resposta em 3 dias: a vaga continua no ar, mas mostra "A empresa não confirmou se continua aberta" e desce em
--    "Mais relevantes" (os pontos caem para um quarto) e na linha do tempo (src/lib/relevancia.ts).

-- 1. A situação de cada vaga e os pedidos de quem procura ----------------------------------------------------------------

create table if not exists privado.vagas_continua (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  -- a última pergunta a quem publicou
  perguntada_em timestamptz,
  -- a última confirmação ("Sim, continua" ou a renovação)
  confirmada_em timestamptz,
  resposta text check (resposta in ('continua', 'preenchida')),
  respondida_em timestamptz
);
alter table privado.vagas_continua enable row level security;
revoke all on privado.vagas_continua from public, anon, authenticated;

create table if not exists privado.pedidos_continua (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  -- a resposta já voltou para esta pessoa
  avisado_em timestamptz,
  primary key (anuncio_id, perfil_id)
);
create index if not exists pedidos_continua_pendentes on privado.pedidos_continua (anuncio_id) where avisado_em is null;
alter table privado.pedidos_continua enable row level security;
revoke all on privado.pedidos_continua from public, anon, authenticated;

-- o limite de perguntas por dia de cada pessoa (privado.conferir_limite)
do $$
declare
  d text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'privado.limites_uso'::regclass and c.conname = 'limites_uso_acao_check';
  if strpos(d, '''pergunta_continua''') = 0 then
    if strpos(d, '''comentario_edicao''::text') = 0 then
      raise exception 'limites_uso_acao_check mudou: %', d;
    end if;
    d := replace(d, '''comentario_edicao''::text', '''comentario_edicao''::text, ''pergunta_continua''::text');
    alter table privado.limites_uso drop constraint limites_uso_acao_check;
    execute 'alter table privado.limites_uso add constraint limites_uso_acao_check ' || d;
  end if;
end
$$;

-- 2. Os avisos novos: 'vaga_continua' (para quem publicou) e 'vaga_continua_sim' (para quem perguntou), no grupo do
--    andamento, no sino, no celular e por e-mail --------------------------------------------------------------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''vaga_continua''') = 0 then
    if strpos(d, '''atendem_a_vaga''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem atendem_a_vaga (rode antes a 20270908120000): %', d;
    end if;
    d := replace(d, '''atendem_a_vaga''::text',
                 '''atendem_a_vaga''::text, ''vaga_continua''::text, ''vaga_continua_sim''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''vaga_continua''') = 0 then
    antes := f;
    f := replace(f, '''rota_pergunta'', ''interesse_local'') then ''andamento''',
                 '''rota_pergunta'', ''interesse_local'', ''vaga_continua'', ''vaga_continua_sim'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista do andamento';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''vaga_continua''') = 0 then
    antes := f;
    f := replace(f, '''curriculo_semana'', ''atendem_a_vaga'') then',
                 '''curriculo_semana'', ''atendem_a_vaga'', ''vaga_continua'', ''vaga_continua_sim'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''atendem_a_vaga'' then coalesce(new.link, ''/talentos'')',
                 'when ''atendem_a_vaga'' then coalesce(new.link, ''/talentos'')'
                 || chr(10) || '                 when ''vaga_continua'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/continua'')'
                 || chr(10) || '                 when ''vaga_continua_sim'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id)');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do atendem_a_vaga';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''vaga_continua''') = 0 then
    if strpos(t, '''atendem_a_vaga''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''atendem_a_vaga''::text]',
                 '''atendem_a_vaga''::text, ''vaga_continua''::text, ''vaga_continua_sim''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('vaga_continua', 'usuarios', 64, 'A vaga ainda está aberta?',
     'Para quem publicou: a vaga no ar há 14 dias ou mais com 10 curtidas ou mais, ou quando alguém perguntou pelo botão "Ainda está aberta?". No máximo uma vez a cada 7 dias por vaga.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Sua vaga “{{titulo}}” ainda está aberta?',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Responder'),
    ('vaga_continua_sim', 'usuarios', 65, 'A vaga continua aberta',
     'Para quem perguntou "Ainda está aberta?": a empresa confirmou que a vaga continua (ou renovou).',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” continua aberta',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver a vaga')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

-- 3. A resposta volta para quem perguntou --------------------------------------------------------------------------------

create or replace function privado.avisar_quem_perguntou(p_anuncio uuid, p_resposta text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  n integer := 0;
begin
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio;
  if v_titulo is null then
    return 0;
  end if;
  if p_resposta = 'continua' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    select p.perfil_id, 'vaga_continua_sim', p_anuncio,
           left('Boa notícia: a empresa confirmou que a vaga “' || v_titulo || '” continua aberta.', 300),
           '/anuncio/' || p_anuncio
      from privado.pedidos_continua p
     where p.anuncio_id = p_anuncio and p.avisado_em is null;
  else
    -- quem curtiu e esperava já recebe o aviso da vaga preenchida (marcar_vaga_preenchida)
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
    select p.perfil_id, 'vaga_preenchida', p_anuncio,
           left('A vaga “' || v_titulo || '” foi preenchida. Obrigado pelo interesse! Veja outras vagas perto de você.', 300)
      from privado.pedidos_continua p
     where p.anuncio_id = p_anuncio and p.avisado_em is null
       and not exists (select 1 from public.curtidas c
                        where c.anuncio_id = p_anuncio and c.perfil_id = p.perfil_id
                          and c.status in ('pendente', 'match'));
  end if;
  get diagnostics n = row_count;
  update privado.pedidos_continua p set avisado_em = now() where p.anuncio_id = p_anuncio and p.avisado_em is null;
  return n;
end
$$;

-- "Sim, continua": pelo site (confirmar_vaga_continua) e pelo botão do WhatsApp (responder_vaga_continua_por)
create or replace function privado.confirmar_continua_por(p_conta uuid, p_anuncio uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
begin
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = p_conta and x.tipo = 'vaga' for update;
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  if a.preenchida_em is not null or a.status <> 'ativo' or a.expira_em <= now() then
    raise exception 'Esta vaga já foi preenchida ou saiu do ar.' using errcode = '22023';
  end if;
  insert into privado.vagas_continua (anuncio_id, confirmada_em, resposta, respondida_em)
  values (a.id, now(), 'continua', now())
  on conflict (anuncio_id) do update set confirmada_em = now(), resposta = 'continua', respondida_em = now();
  return privado.avisar_quem_perguntou(a.id, 'continua');
end
$$;

-- "Já preenchi" pelo WhatsApp: o mesmo de marcar_vaga_preenchida, pela conta do aviso
create or replace function privado.marcar_preenchida_por(p_conta uuid, p_anuncio uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  n integer := 0;
begin
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = p_conta and x.tipo = 'vaga' for update;
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  if a.preenchida_em is not null or a.status in ('em_analise', 'removido') then
    raise exception 'Esta vaga já foi preenchida ou está com a moderação.' using errcode = '22023';
  end if;
  update public.anuncios x set preenchida_em = now() where x.id = a.id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  select c.perfil_id, 'vaga_preenchida', a.id, p_conta,
         left('A vaga “' || a.titulo || '” foi preenchida. Obrigado pelo interesse! Veja outras vagas perto de você.', 300)
    from public.curtidas c
    left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
   where c.anuncio_id = a.id
     and c.status in ('pendente', 'match')
     and coalesce(e.etapa, 'novo') <> 'contratado';
  get diagnostics n = row_count;
  return n;
end
$$;

-- o botão do WhatsApp: a resposta para quem publicou
create or replace function privado.responder_vaga_continua_por(p_conta uuid, p_anuncio uuid, p_resposta text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_resposta = 'sim' then
    n := privado.confirmar_continua_por(p_conta, p_anuncio);
    return 'Obrigado! A vaga continua no ar'
           || case when n = 1 then ', e quem perguntou recebe o aviso.'
                   when n > 1 then ', e as ' || n || ' pessoas que perguntaram recebem o aviso.'
                   else '.' end;
  elsif p_resposta = 'preenchi' then
    perform privado.marcar_preenchida_por(p_conta, p_anuncio);
    return 'Obrigado por contar! A vaga ficou como preenchida, e quem esperava recebe o aviso. Para publicar outra: '
           || 'https://publike.org/publicar';
  end if;
  raise exception 'Resposta inválida.' using errcode = '22023';
end
$$;

-- a vaga preenchida avisa quem perguntou; a renovada (o prazo andou para a frente, no ar) conta como "continua"
create or replace function privado.vaga_continua_ao_mudar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.preenchida_em is null and new.preenchida_em is not null then
    update privado.vagas_continua vc set resposta = 'preenchida', respondida_em = now() where vc.anuncio_id = new.id;
    perform privado.avisar_quem_perguntou(new.id, 'preenchida');
  elsif new.status = 'ativo' and new.preenchida_em is null and new.expira_em > old.expira_em + interval '1 day' then
    insert into privado.vagas_continua (anuncio_id, confirmada_em, resposta, respondida_em)
    values (new.id, now(), 'continua', now())
    on conflict (anuncio_id) do update set confirmada_em = now(), resposta = 'continua', respondida_em = now();
    perform privado.avisar_quem_perguntou(new.id, 'continua');
  end if;
  return new;
exception
  when others then
    raise warning 'Publike: a confirmação da vaga % não foi registrada (%).', new.id, sqlerrm;
    return new;
end
$$;

drop trigger if exists anuncios_vaga_continua on public.anuncios;
create trigger anuncios_vaga_continua
  after update of expira_em, preenchida_em on public.anuncios
  for each row when (new.tipo = 'vaga')
  execute function privado.vaga_continua_ao_mudar();

-- 4. Sem resposta em 3 dias: o mesmo critério para o cartão e para a ordem -------------------------------------------

create or replace function privado.vaga_sem_resposta(p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.vagas_continua vc
                  where vc.anuncio_id = p_anuncio
                    and vc.perguntada_em < now() - interval '3 days'
                    and vc.perguntada_em > coalesce(vc.confirmada_em, '-infinity'))
$$;

-- "Mais relevantes": a vaga sem resposta desce (os pontos caem para um quarto)
create or replace function privado.pontos_do_anuncio(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (pontos / case when privado.vaga_sem_resposta(p_anuncio) then 4 else 1 end)::integer
    from (select (select count(*) from public.curtidas c
                   where c.anuncio_id = p_anuncio and c.criado_em > now() - interval '30 days')::integer * 5
               + (select count(*) from privado.aberturas_anuncio b
                   where b.anuncio_id = p_anuncio
                     and b.dia > (now() at time zone 'America/Sao_Paulo')::date - 30)::integer as pontos) x
$$;

-- 5. O cartão e a página da vaga: a situação de cada vaga (para quem vê) ------------------------------------------------
--    confirmada (nos últimos 7 dias), aguardando (perguntamos há menos de 3 dias), sem_resposta, pode_perguntar (no ar
--    há 14 dias ou mais desde a última confirmação) ou null; `pedi`: quem vê perguntou e ainda não teve a resposta

create or replace function public.confirmacao_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, estado text, confirmada_em timestamptz, pedi boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select a.id, a.criado_em, vc.perguntada_em, vc.confirmada_em
      from public.anuncios a
      left join privado.vagas_continua vc on vc.anuncio_id = a.id
     where a.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:200])
       and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now()
  )
  select v.id,
         case
           when v.confirmada_em > now() - interval '7 days' then 'confirmada'
           when v.perguntada_em > coalesce(v.confirmada_em, '-infinity') and v.perguntada_em >= now() - interval '3 days'
             then 'aguardando'
           when v.perguntada_em > coalesce(v.confirmada_em, '-infinity') then 'sem_resposta'
           when greatest(v.criado_em, coalesce(v.confirmada_em, '-infinity')) < now() - interval '14 days'
             then 'pode_perguntar'
         end,
         v.confirmada_em,
         exists (select 1 from privado.pedidos_continua p
                  where p.anuncio_id = v.id and p.perfil_id = (select public.conta_atual())
                    and p.avisado_em is null)
    from v
$$;

-- 6. "Ainda está aberta?" de quem procura ----------------------------------------------------------------------------

create or replace function public.perguntar_se_vaga_continua(p_anuncio uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select public.conta_atual());
  a public.anuncios;
  vc privado.vagas_continua;
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into a from public.anuncios x where x.id = p_anuncio;
  if not found or a.tipo <> 'vaga' or a.status <> 'ativo' or a.preenchida_em is not null or a.expira_em <= now() then
    raise exception 'Esta vaga não está mais no ar.' using errcode = 'P0002';
  end if;
  if a.autor_id = v_eu then
    raise exception 'Esta vaga é sua.' using errcode = '22023';
  end if;
  select * into vc from privado.vagas_continua x where x.anuncio_id = a.id;
  if vc.confirmada_em > now() - interval '7 days' then
    return 'confirmada';
  end if;
  if greatest(a.criado_em, coalesce(vc.confirmada_em, '-infinity')) >= now() - interval '14 days' then
    raise exception 'Esta vaga é recente: dá para se candidatar direto.' using errcode = '22023';
  end if;
  -- já perguntou e espera a resposta: nada muda
  if exists (select 1 from privado.pedidos_continua p
              where p.anuncio_id = a.id and p.perfil_id = v_eu and p.avisado_em is null) then
    return 'perguntado';
  end if;
  perform privado.conferir_limite('pergunta_continua', 20, 'Você perguntou de muitas vagas hoje. Tente de novo amanhã.');
  insert into privado.pedidos_continua (anuncio_id, perfil_id) values (a.id, v_eu)
  on conflict (anuncio_id, perfil_id) do update set criado_em = now(), avisado_em = null;
  return 'perguntado';
end
$$;

-- 7. "Sim, continua" no site ------------------------------------------------------------------------------------------

create or replace function public.confirmar_vaga_continua(p_anuncio uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select public.conta_atual());
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  return privado.confirmar_continua_por(v_eu, p_anuncio);
end
$$;

-- a página da pergunta: os números da vaga (só para quem publicou)
create or replace function public.situacao_da_vaga_continua(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select public.conta_atual());
  a public.anuncios;
  vc privado.vagas_continua;
begin
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = v_eu and x.tipo = 'vaga';
  if not found then
    return null;
  end if;
  select * into vc from privado.vagas_continua x where x.anuncio_id = a.id;
  return jsonb_build_object(
    'curtidas', (select count(*) from public.curtidas c where c.anuncio_id = a.id),
    'pedidos', (select count(*) from privado.pedidos_continua p where p.anuncio_id = a.id and p.avisado_em is null),
    'confirmada_em', vc.confirmada_em,
    'perguntada_em', vc.perguntada_em);
end
$$;

-- 8. O robô das filas: a pergunta para quem publicou -------------------------------------------------------------------

-- `p_agora`: sem a janela das 8h às 20h (os testes)
create or replace function public.servidor_perguntar_se_continua(p_chave text, p_limite integer default 50,
                                                                 p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  n integer := 0;
  v_dias integer;
  v_texto text;
begin
  perform privado.exigir_servidor(p_chave);
  -- das 8h às 20h
  if not coalesce(p_agora, false) and (hora < 8 or hora >= 20) then
    return 0;
  end if;
  for r in
    select a.id, a.titulo, a.autor_id, a.criado_em,
           (select count(*) from public.curtidas c where c.anuncio_id = a.id)::integer as curtidas,
           (select count(*) from privado.pedidos_continua p
             where p.anuncio_id = a.id and p.avisado_em is null)::integer as pedidos
      from public.anuncios a
      join public.perfis pf on pf.id = a.autor_id
      left join privado.vagas_continua vc on vc.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
       -- nos 2 dias antes de vencer, o aviso do vencimento já pergunta
       and a.expira_em > now() + interval '2 days'
       and (pf.suspenso_ate is null or pf.suspenso_ate <= now())
       -- no máximo uma pergunta a cada 7 dias por vaga
       and coalesce(vc.perguntada_em, '-infinity') < now() - interval '7 days'
       and (
         (greatest(a.criado_em, coalesce(vc.confirmada_em, '-infinity')) < now() - interval '14 days'
          and (select count(*) from public.curtidas c where c.anuncio_id = a.id) >= 10)
         or exists (select 1 from privado.pedidos_continua p
                     where p.anuncio_id = a.id and p.avisado_em is null
                       and p.criado_em > coalesce(vc.perguntada_em, '-infinity'))
       )
     order by a.criado_em
     limit least(greatest(coalesce(p_limite, 50), 1), 200)
  loop
    v_dias := greatest(((now() at time zone 'America/Sao_Paulo')::date
                        - (r.criado_em at time zone 'America/Sao_Paulo')::date), 1);
    v_texto := 'Sua vaga “' || r.titulo || '” está no ar há ' || v_dias || ' dias'
               || case when r.curtidas = 1 then ' e tem 1 candidatura'
                       when r.curtidas > 1 then ' e tem ' || r.curtidas || ' candidaturas' else '' end
               || '. Ela ainda está aberta? Confirme em um toque, ou conte se já preencheu.'
               || case when r.pedidos = 1 then ' Uma pessoa perguntou.'
                       when r.pedidos > 1 then ' ' || r.pedidos || ' pessoas perguntaram.' else '' end;
    -- uma pergunta por vaga no sino: a nova tira a anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.id and nt.tipo = 'vaga_continua';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, 'vaga_continua', r.id, left(v_texto, 300), '/painel/anuncio/' || r.id || '/continua');
    insert into privado.vagas_continua (anuncio_id, perguntada_em) values (r.id, now())
    on conflict (anuncio_id) do update set perguntada_em = now();
    n := n + 1;
  end loop;
  return n;
end
$$;

-- 9. O botão do WhatsApp ("v:<id>:sim" e "v:<id>:preenchi"), na mesma função dos outros botões de pergunta ------------

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('public.servidor_whatsapp_recebida(text, text, text, text, text)'::regprocedure);
  if strpos(f, '''vaga_continua''') = 0 then
    antes := f;
    f := replace(f, '''^[rce]:[0-9]{1,18}:[a-z_]{2,20}$''', '''^[rcev]:[0-9]{1,18}:[a-z_]{2,20}$''');
    if f = antes then
      raise exception 'servidor_whatsapp_recebida mudou: não achei o formato dos botões de pergunta';
    end if;
    antes := f;
    f := replace(f,
      '      else' || chr(10) || '        return jsonb_build_object(''acao'', ''desconhecida'', ''texto'','
        || chr(10) || '          ''Não entendemos a resposta.',
      '      elsif v_partes[1] = ''v'' and f.tipo = ''vaga_continua'' and v_resposta in (''sim'', ''preenchi'') then'
        || chr(10) || '        v_volta := privado.responder_vaga_continua_por(f.conta_id, f.anuncio_id, v_resposta);'
        || chr(10) || '      else' || chr(10) || '        return jsonb_build_object(''acao'', ''desconhecida'', ''texto'','
        || chr(10) || '          ''Não entendemos a resposta.');
    if f = antes then
      raise exception 'servidor_whatsapp_recebida mudou: não achei o fim dos botões de pergunta';
    end if;
    execute f;
  end if;
end
$$;

-- 10. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function
  privado.avisar_quem_perguntou(uuid, text),
  privado.confirmar_continua_por(uuid, uuid),
  privado.marcar_preenchida_por(uuid, uuid),
  privado.responder_vaga_continua_por(uuid, uuid, text),
  privado.vaga_continua_ao_mudar()
from public, anon, authenticated;
revoke execute on function privado.vaga_sem_resposta(uuid) from public;
grant execute on function privado.vaga_sem_resposta(uuid) to anon, authenticated;

revoke execute on function
  public.confirmacao_das_vagas(uuid[]),
  public.perguntar_se_vaga_continua(uuid),
  public.confirmar_vaga_continua(uuid),
  public.situacao_da_vaga_continua(uuid),
  public.servidor_perguntar_se_continua(text, integer, boolean)
from public;
grant execute on function public.confirmacao_das_vagas(uuid[]) to anon, authenticated;
revoke execute on function
  public.perguntar_se_vaga_continua(uuid),
  public.confirmar_vaga_continua(uuid),
  public.situacao_da_vaga_continua(uuid)
from anon;
grant execute on function
  public.perguntar_se_vaga_continua(uuid),
  public.confirmar_vaga_continua(uuid),
  public.situacao_da_vaga_continua(uuid)
to authenticated;
grant execute on function public.servidor_perguntar_se_continua(text, integer, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271003120000_vaga_continua');
