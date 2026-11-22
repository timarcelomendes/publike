-- Quem atende a sua vaga e ainda não curtiu (22/11/2026; Marcelo: "quem pode assumir sua vaga e não curtiu seu anúncio
-- ainda"). A conta da vaga recebe um aviso quando o "Atende a vaga" (Talentos › Para a sua vaga) junta 3 pessoas novas
-- desde o último aviso daquela vaga: "3 pessoas que atendem tudo o que a sua vaga pede ainda não viram o anúncio.
-- Convide." A conta do "Atende a vaga" é a do site (src/lib/talentos-da-vaga.ts): o banco manda as vagas e os talentos,
-- o site faz a conta e pede o aviso.
--
-- Regras: a vaga no ar há 1 dia ou mais; no máximo um aviso por dia por vaga, das 8h às 20h; quem já foi avisado (aqui
-- ou um por um, pelo "Chegou um talento que combina"), quem curtiu e quem foi convidado não contam de novo; para depois de 3 avisos seguidos sem nenhum convite da vaga. Começa
-- desligado (Admin › Procuradas sem vaga, "Quem atende e não curtiu"). Pode rodar de novo.

create table if not exists privado.config_atendem (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  minimo integer not null default 3 check (minimo between 1 and 20),
  atualizado_em timestamptz not null default now()
);
insert into privado.config_atendem (id) values (true) on conflict (id) do nothing;
alter table privado.config_atendem enable row level security;
revoke all on privado.config_atendem from public, anon, authenticated;

create table if not exists privado.atendem_avisos (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  -- as pessoas novas deste aviso
  perfis uuid[] not null default '{}',
  criado_em timestamptz not null default now()
);
create index if not exists atendem_avisos_anuncio on privado.atendem_avisos (anuncio_id, criado_em desc);
alter table privado.atendem_avisos enable row level security;
revoke all on privado.atendem_avisos from public, anon, authenticated;

-- 1. O aviso novo 'atendem_a_vaga' (no grupo da semana, "Vagas e talentos"; sino, celular e e-mail) --------------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''atendem_a_vaga''') = 0 then
    if strpos(d, '''curriculo_semana''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem curriculo_semana (rode antes a 20270904120000): %', d;
    end if;
    d := replace(d, '''curriculo_semana''::text', '''curriculo_semana''::text, ''atendem_a_vaga''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''atendem_a_vaga''') = 0 then
    antes := f;
    f := replace(f, '''procura_na_regiao'', ''curriculo_semana'') then ''semana''',
                 '''procura_na_regiao'', ''curriculo_semana'', ''atendem_a_vaga'') then ''semana''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista da semana';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''atendem_a_vaga''') = 0 then
    antes := f;
    f := replace(f, '''procura_na_regiao'', ''curriculo_semana'') then',
                 '''procura_na_regiao'', ''curriculo_semana'', ''atendem_a_vaga'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''curriculo_semana'' then coalesce(new.link, ''/perfil/curriculo'')',
                 'when ''curriculo_semana'' then coalesce(new.link, ''/perfil/curriculo'')'
                 || chr(10) || '                 when ''atendem_a_vaga'' then coalesce(new.link, ''/talentos'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do curriculo_semana';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''atendem_a_vaga''') = 0 then
    if strpos(t, '''curriculo_semana''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''curriculo_semana''::text]', '''curriculo_semana''::text, ''atendem_a_vaga''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('atendem_a_vaga', 'usuarios', 63, 'Quem atende a vaga e não curtiu',
     'Para quem tem vaga no ar há 1 dia ou mais: quando juntam 3 pessoas novas que atendem tudo o que a vaga pede (Talentos › Para a sua vaga) e ainda não curtiram, no máximo um por dia por vaga. Liga em Admin › Procuradas sem vaga.',
     array['nome', 'motivo', 'link'],
     'Gente que atende a sua vaga ainda não viu o anúncio',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver e convidar')
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

-- 2. As vagas da vez: no ar há 1 dia ou mais, sem aviso nas últimas 24 horas, as que esperam há mais tempo primeiro -----

create or replace function public.servidor_atendem_vagas(p_chave text, p_limite integer default 20, p_agora boolean default false)
returns table (anuncio_id uuid, conta_id uuid, titulo text, minimo integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_atendem;
  agora_br timestamp := now() at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_atendem where id;
  if not found then
    return;
  end if;
  if not coalesce(p_agora, false) then
    if not cfg.ligado or extract(hour from agora_br) not between 8 and 19 then
      return;
    end if;
  end if;
  return query
  select a.id, a.autor_id, a.titulo, cfg.minimo
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()
     and a.criado_em < now() - interval '1 day'
     and p.tipo in ('comercio', 'empresa', 'agencia')
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and not exists (select 1 from privado.atendem_avisos v
                      where v.anuncio_id = a.id and v.criado_em > now() - interval '24 hours')
     -- 3 avisos seguidos sem nenhum convite da vaga: para
     and not ((select count(*) from privado.atendem_avisos v where v.anuncio_id = a.id) >= 3
              and not exists (select 1 from public.convites_vaga k
                               where k.anuncio_id = a.id
                                 and k.criado_em > (select min(x.criado_em) from (
                                                      select v.criado_em from privado.atendem_avisos v
                                                       where v.anuncio_id = a.id
                                                       order by v.criado_em desc limit 3) x)))
   order by (select max(v.criado_em) from privado.atendem_avisos v where v.anuncio_id = a.id) nulls first,
            a.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 20), 100));
end
$$;

-- 3. A vaga e os talentos dela (como talentos_para_vaga, com o jeito, as atividades lidas e quem já foi avisado) -------

create or replace function public.servidor_atendem_dados(p_chave text, p_anuncio uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select a.autor_id into v_autor from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  if v_autor is null then
    return null;
  end if;
  return jsonb_build_object(
    'vaga', (select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'descricao', a.descricao,
                                       'escolaridade_minima', a.escolaridade_minima, 'experiencia', a.experiencia,
                                       'cnh', a.cnh, 'cidade', a.cidade, 'bairro', a.bairro, 'jornada', a.jornada,
                                       'horario_detalhe', a.horario_detalhe, 'dia_a_dia', a.dia_a_dia)
               from public.anuncios a where a.id = p_anuncio),
    -- quem já foi avisado: por este aviso ou, um por um, pelo "Chegou um talento que combina" (20270214120000)
    'avisados', coalesce((select jsonb_agg(distinct x)
                            from (select unnest(v.perfis) as x from privado.atendem_avisos v where v.anuncio_id = p_anuncio
                                  union
                                  select t.perfil_id from privado.talentos_avisados t where t.anuncio_id = p_anuncio) q),
                         '[]'::jsonb),
    'talentos', coalesce((select jsonb_agg(jsonb_build_object(
                                   'perfil_id', p.id, 'cidade', p.cidade, 'bairro', p.bairro,
                                   'escolaridade', c.escolaridade, 'curso', c.curso, 'experiencias', c.experiencias,
                                   'cursos', c.cursos, 'cnh', c.cnh, 'disponibilidade', c.disponibilidade,
                                   'titulo', c.titulo, 'habilidades', c.habilidades, 'estudos', c.estudos,
                                   'jeito', c.jeito,
                                   'atividades', (select jsonb_build_object('resultado', l.resultado, 'trecho', l.trecho)
                                                    from privado.atividades_da_vaga l
                                                   where l.anuncio_id = p_anuncio and l.perfil_id = p.id
                                                     and l.resultado <> 'sem')))
                            from (select v.perfil_id from public.curriculo_visivel v) v
                            join public.curriculos c on c.perfil_id = v.perfil_id
                            join public.perfis p on p.id = v.perfil_id
                           where p.id <> v_autor
                             and p.tipo = 'pessoa'
                             and (p.suspenso_ate is null or p.suspenso_ate < now())
                             and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p.id)
                             and not exists (select 1 from public.convites_vaga k where k.anuncio_id = p_anuncio and k.perfil_id = p.id)
                             and not privado.ha_bloqueio(v_autor, p.id)), '[]'::jsonb)
  );
end
$$;

-- 4. O aviso: confere de novo as 24 horas, guarda quem foi avisado e põe no sino (o e-mail e o celular vêm do sino) -----

create or replace function public.servidor_atendem_avisar(p_chave text, p_anuncio uuid, p_perfis uuid[], p_texto text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(cardinality(p_perfis), 0) = 0 or char_length(coalesce(p_texto, '')) not between 10 and 600 then
    raise exception 'Aviso inválido.' using errcode = '22023';
  end if;
  select a.autor_id into v_autor from public.anuncios a
   where a.id = p_anuncio and a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now();
  if v_autor is null then
    return false;
  end if;
  -- um por dia por vaga (duas rodadas ao mesmo tempo: a segunda espera a primeira e não avisa)
  perform pg_advisory_xact_lock(hashtext('atendem:' || p_anuncio::text));
  if exists (select 1 from privado.atendem_avisos v where v.anuncio_id = p_anuncio and v.criado_em > now() - interval '24 hours') then
    return false;
  end if;
  insert into privado.atendem_avisos (anuncio_id, conta_id, perfis) values (p_anuncio, v_autor, p_perfis[1:200]);
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
  values (v_autor, 'atendem_a_vaga', p_anuncio, p_texto, '/talentos?vaga=' || p_anuncio);
  return true;
end
$$;

revoke execute on function public.servidor_atendem_vagas(text, integer, boolean), public.servidor_atendem_dados(text, uuid),
  public.servidor_atendem_avisar(text, uuid, uuid[], text) from public;
grant execute on function public.servidor_atendem_vagas(text, integer, boolean), public.servidor_atendem_dados(text, uuid),
  public.servidor_atendem_avisar(text, uuid, uuid[], text) to anon, authenticated, service_role;

-- 5. O Admin --------------------------------------------------------------------------------------------------------------

create or replace function public.admin_atendem()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_atendem;
begin
  perform privado.exigir_admin();
  select * into cfg from privado.config_atendem where id;
  return jsonb_build_object(
    'ligado', coalesce(cfg.ligado, false),
    'minimo', coalesce(cfg.minimo, 3),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('dia', v.criado_em, 'anuncio_id', v.anuncio_id,
                                                            'titulo', a.titulo, 'conta_id', v.conta_id, 'nome', p.nome,
                                                            'pessoas', cardinality(v.perfis),
                                                            'convites', (select count(*) from public.convites_vaga k
                                                                          where k.anuncio_id = v.anuncio_id
                                                                            and k.perfil_id = any (v.perfis)
                                                                            and k.criado_em > v.criado_em))
                                         order by v.criado_em desc)
                          from privado.atendem_avisos v
                          join public.anuncios a on a.id = v.anuncio_id
                          join public.perfis p on p.id = v.conta_id
                         where v.criado_em > now() - interval '30 days'), '[]'::jsonb)
  );
end
$$;

create or replace function public.admin_atendem_config(p_ligado boolean, p_minimo integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.config_atendem
     set ligado = coalesce(p_ligado, ligado),
         minimo = coalesce(least(greatest(p_minimo, 1), 20), minimo),
         atualizado_em = now()
   where id;
end
$$;
revoke execute on function public.admin_atendem(), public.admin_atendem_config(boolean, integer) from public, anon, authenticated;
grant execute on function public.admin_atendem(), public.admin_atendem_config(boolean, integer) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270908120000_atendem_a_vaga');
