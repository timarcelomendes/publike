-- Quem viu seu perfil (22/10/2026), como no LinkedIn. Pode rodar de novo sem problema.
--
--   * Abrir o perfil (/perfil/[id]), a página do talento (/talentos/[id]) ou a ficha do candidato na
--     Caixa conta como visita. O registro sai do navegador, depois que a página abre (prefetch de link
--     e robôs não contam), pela função public.registrar_visita.
--   * Uma linha por visitante, por perfil, por dia; quem não entrou vira só número. Não contam: a
--     própria conta, a agência e a equipe dela, conta suspensa e par bloqueado. Guarda 90 dias.
--   * Avisos só no sino: empresa, comércio ou agência que vê o perfil ou o currículo de uma pessoa
--     (visita: no máximo 1 da mesma empresa por semana e 3 por pessoa por dia); empresa que abre a
--     candidatura (visita, uma vez por candidatura); o resto vira o resumo do dia (visitas_do_dia, uma
--     linha por dia, atualizada no lugar). Cada visitante gera no máximo 30 avisos por dia.
--   * "Navegar sem aparecer" (só pessoa): quem visita aparece como "preferiu não aparecer" e, em troca,
--     não vê o nome das pessoas que a visitaram (as empresas sempre aparecem).
--   * Aviso de lançamento no sino para cada conta (visitas_novidade).
--
-- Rode depois de 20261030120000_curriculo_publico.sql.

-- 1. As tabelas ---------------------------------------------------------------------------------

create table if not exists privado.visitas_perfil (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  visitante_id uuid not null references public.perfis (id) on delete cascade,
  -- o dia em Goiânia
  dia date not null,
  -- onde viu (fica o mais forte do dia: candidatura > talento > perfil)
  onde text not null check (onde in ('perfil', 'talento', 'candidatura')),
  anuncio_id uuid references public.anuncios (id) on delete set null,
  vezes integer not null default 1,
  primeira timestamptz not null default now(),
  ultima timestamptz not null default now(),
  -- quem visitou estava com "Navegar sem aparecer" ligado
  escondido boolean not null default false,
  -- esta visita já gerou um aviso próprio (não entra no resumo do dia)
  avisou boolean not null default false,
  primary key (perfil_id, visitante_id, dia)
);
create index if not exists visitas_perfil_ultima_idx on privado.visitas_perfil (perfil_id, ultima desc);
create index if not exists visitas_perfil_visitante_idx on privado.visitas_perfil (visitante_id, dia);
comment on table privado.visitas_perfil is 'Quem viu cada perfil (uma linha por visitante por dia, 90 dias).';

create table if not exists privado.visitas_anonimas (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  dia date not null,
  vezes integer not null default 1,
  primary key (perfil_id, dia)
);
comment on table privado.visitas_anonimas is 'Visitas de quem não entrou, só o número por dia.';

create table if not exists privado.visitas_opcoes (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  -- avisar no sino quando alguém ver o perfil
  avisar boolean not null default true,
  -- navegar sem aparecer (só pessoa)
  sem_aparecer boolean not null default false,
  -- a última vez que abriu "Quem viu seu perfil"
  vistas_em timestamptz
);
comment on table privado.visitas_opcoes is 'As opções de "Quem viu seu perfil" de cada conta.';

create table if not exists privado.candidaturas_vistas (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  vista_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
comment on table privado.candidaturas_vistas is 'A empresa abriu a candidatura (a ficha na Caixa): a pessoa vê "Vista pela empresa".';

revoke all on privado.visitas_perfil, privado.visitas_anonimas, privado.visitas_opcoes, privado.candidaturas_vistas
  from public, anon, authenticated;


-- 2. Os avisos no sino (só no sino) -------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade'));

drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade'))
  execute function privado.notificacao_por_email();


-- 3. Registrar a visita -------------------------------------------------------------------------

-- O nome da página da conta no resumo do dia.
create or replace function privado.pagina_da_conta(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
           when 'pessoa' then 'Seu perfil'
           when 'comercio' then 'A página do seu comércio'
           when 'agencia' then 'A página da sua agência'
           else 'A página da sua empresa'
         end
$$;

create or replace function public.registrar_visita(p_perfil uuid, p_onde text, p_anuncio uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select public.conta_atual());
  v_pessoa uuid := (select auth.uid());
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio timestamptz := (v_hoje::timestamp at time zone 'America/Sao_Paulo');
  v_dono public.perfis%rowtype;
  v_visitante public.perfis%rowtype;
  v_escondido boolean := false;
  v_avisar boolean;
  v_linha privado.visitas_perfil%rowtype;
  v_titulo text;
  v_texto text;
  v_aviso bigint;
  v_n integer;
  v_avisou boolean := false;
begin
  if p_perfil is null or p_onde is null or p_onde not in ('perfil', 'talento', 'candidatura') then
    return;
  end if;
  select * into v_dono from public.perfis p where p.id = p_perfil;
  if not found or coalesce(v_dono.suspenso_ate > now(), false) then
    return;
  end if;

  -- de vez em quando, o que passou de 90 dias sai
  if random() < 0.02 then
    delete from privado.visitas_perfil v where v.dia < v_hoje - 90;
    delete from privado.visitas_anonimas a where a.dia < v_hoje - 90;
  end if;

  -- quem não entrou: só o número
  if v_eu is null then
    if p_onde <> 'candidatura' then
      insert into privado.visitas_anonimas as a (perfil_id, dia) values (p_perfil, v_hoje)
      on conflict (perfil_id, dia) do update set vezes = a.vezes + 1;
    end if;
    return;
  end if;

  -- a própria conta, a agência e a equipe dela
  if v_eu = p_perfil or v_pessoa = p_perfil then
    return;
  end if;
  if exists (select 1 from public.equipe_agencia e
              where (e.agencia_id = v_eu and e.membro_id = p_perfil)
                 or (e.agencia_id = p_perfil and e.membro_id = v_pessoa)) then
    return;
  end if;
  select * into v_visitante from public.perfis p where p.id = v_eu;
  if not found or coalesce(v_visitante.suspenso_ate > now(), false) then
    return;
  end if;
  if privado.ha_bloqueio(v_eu, p_perfil) then
    return;
  end if;

  -- a candidatura: só quem publicou a vaga, e a pessoa curtiu essa vaga
  if p_onde = 'candidatura' then
    select a.titulo into v_titulo
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
     where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = v_eu;
    if not found then
      return;
    end if;
  else
    p_anuncio := null;
  end if;

  -- no máximo 500 perfis por visitante por dia
  if not exists (select 1 from privado.visitas_perfil v
                  where v.perfil_id = p_perfil and v.visitante_id = v_eu and v.dia = v_hoje)
     and (select count(*) from privado.visitas_perfil v where v.visitante_id = v_eu and v.dia = v_hoje) >= 500 then
    return;
  end if;

  if v_visitante.tipo = 'pessoa' then
    select o.sem_aparecer into v_escondido from privado.visitas_opcoes o where o.conta_id = v_eu;
    v_escondido := coalesce(v_escondido, false);
  end if;

  insert into privado.visitas_perfil as v (perfil_id, visitante_id, dia, onde, anuncio_id, escondido)
  values (p_perfil, v_eu, v_hoje, p_onde, p_anuncio, v_escondido)
  on conflict (perfil_id, visitante_id, dia) do update
    set vezes = v.vezes + 1,
        ultima = now(),
        escondido = excluded.escondido,
        onde = case when array_position(array['perfil', 'talento', 'candidatura'], excluded.onde)
                         > array_position(array['perfil', 'talento', 'candidatura'], v.onde)
                    then excluded.onde else v.onde end,
        anuncio_id = coalesce(excluded.anuncio_id, v.anuncio_id)
  returning * into v_linha;

  select o.avisar into v_avisar from privado.visitas_opcoes o where o.conta_id = p_perfil;
  v_avisar := coalesce(v_avisar, true);

  -- cada visitante gera no máximo 30 avisos por dia
  select count(*) into v_n from privado.visitas_perfil v
   where v.visitante_id = v_eu and v.dia = v_hoje and v.avisou;
  if v_n >= 30 and not v_linha.avisou then
    v_avisar := false;
  end if;

  -- a empresa abriu a candidatura: uma vez por candidatura
  if p_onde = 'candidatura' then
    insert into privado.candidaturas_vistas (anuncio_id, perfil_id) values (p_anuncio, p_perfil)
    on conflict do nothing;
    if found and v_avisar then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (p_perfil, 'visita', p_anuncio, v_eu,
              format('%s viu sua candidatura para %s.', v_visitante.nome, v_titulo));
      v_avisou := true;
    end if;
  -- empresa, comércio ou agência viu o perfil ou o currículo de uma pessoa
  elsif v_visitante.tipo <> 'pessoa' and v_dono.tipo = 'pessoa' and v_avisar and not v_linha.avisou
        and not exists (select 1 from public.notificacoes n
                         where n.destinatario_id = p_perfil and n.tipo = 'visita' and n.ator_id = v_eu
                           and n.anuncio_id is null and n.criado_em > now() - interval '7 days')
        and (select count(*) from public.notificacoes n
              where n.destinatario_id = p_perfil and n.tipo = 'visita' and n.anuncio_id is null
                and n.criado_em >= v_inicio) < 3 then
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (p_perfil, 'visita', v_eu,
            format('%s viu seu %s.', v_visitante.nome, case when p_onde = 'talento' then 'currículo' else 'perfil' end));
    v_avisou := true;
  end if;

  if v_avisou then
    update privado.visitas_perfil v set avisou = true
     where v.perfil_id = p_perfil and v.visitante_id = v_eu and v.dia = v_hoje;
    return;
  end if;

  -- o resto: o resumo do dia (uma linha por dia; a primeira visita do visitante no dia conta)
  if v_avisar and v_linha.vezes = 1 and not v_linha.avisou then
    select count(*) into v_n from privado.visitas_perfil v
     where v.perfil_id = p_perfil and v.dia = v_hoje and not v.avisou;
    v_texto := format('%s teve %s hoje. Toque para ver quem foi.', privado.pagina_da_conta(v_dono.tipo),
                      case when v_n = 1 then '1 visita' else v_n || ' visitas' end);
    select n.id into v_aviso from public.notificacoes n
     where n.destinatario_id = p_perfil and n.tipo = 'visitas_do_dia' and n.criado_em >= v_inicio
     order by n.criado_em desc limit 1;
    if v_aviso is null then
      insert into public.notificacoes (destinatario_id, tipo, texto) values (p_perfil, 'visitas_do_dia', v_texto);
    else
      update public.notificacoes n set texto = v_texto where n.id = v_aviso;
    end if;
  end if;
end
$$;

revoke execute on function public.registrar_visita(uuid, text, uuid) from public;
grant execute on function public.registrar_visita(uuid, text, uuid) to anon, authenticated;
revoke execute on function privado.pagina_da_conta(text) from public, anon, authenticated;


-- 4. Quem viu (para a dona) -----------------------------------------------------------------------

-- Os visitantes dos últimos p_dias, do mais recente para o mais antigo. Quem navegou sem aparecer
-- vem sem nome (visitante_id null). Com "Navegar sem aparecer" ligado, a conta também não vê o nome
-- das pessoas (as empresas sempre aparecem).
create or replace function public.quem_viu_meu_perfil(p_dias integer default 30)
returns table (
  visitante_id uuid,
  nome text,
  tipo text,
  foto text,
  cidade text,
  bairro text,
  verificado boolean,
  titulo text,
  curriculo_aberto boolean,
  onde text,
  anuncio_id uuid,
  anuncio_titulo text,
  ultima timestamptz,
  vezes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select (select public.conta_atual()) as id,
           coalesce((select o.sem_aparecer from privado.visitas_opcoes o
                      where o.conta_id = (select public.conta_atual())), false) as sem_aparecer
  ),
  ultimas as (
    select distinct on (v.visitante_id)
           v.visitante_id, v.onde, v.anuncio_id, v.ultima, v.escondido,
           (sum(v.vezes) over (partition by v.visitante_id))::integer as vezes
      from privado.visitas_perfil v, eu
     where v.perfil_id = eu.id
       and v.dia >= (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 30), 1), 90)
     order by v.visitante_id, v.ultima desc
  )
  select case when mostra then p.id end,
         case when mostra then p.nome end,
         case when mostra then p.tipo else 'pessoa' end,
         case when mostra then p.foto end,
         case when mostra then p.cidade end,
         case when mostra then p.bairro end,
         case when mostra then p.verificado else false end,
         case when mostra and p.tipo = 'pessoa' and cv.perfil_id is not null then c.titulo end,
         mostra and p.tipo = 'pessoa' and cv.perfil_id is not null,
         u.onde,
         u.anuncio_id,
         a.titulo,
         u.ultima,
         u.vezes
    from ultimas u
    cross join eu
    join public.perfis p on p.id = u.visitante_id
    left join public.curriculo_visivel cv on cv.perfil_id = p.id
    left join public.curriculos c on c.perfil_id = p.id
    left join public.anuncios a on a.id = u.anuncio_id
    cross join lateral (
      select (p.tipo <> 'pessoa' or (not u.escondido and not eu.sem_aparecer)) as mostra
    ) m
   where eu.id is not null
     and not coalesce(p.suspenso_ate > now(), false)
     and not privado.ha_bloqueio(eu.id, p.id)
   order by u.ultima desc
   limit 300
$$;

-- Os números: visitantes nos últimos 7 dias, nos 7 de antes, os novos desde a última vez que a conta
-- abriu a página, e as visitas de quem não entrou (30 dias).
create or replace function public.resumo_das_visitas()
returns table (semana integer, semana_passada integer, novas integer, anonimas integer)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select (select public.conta_atual()) as id,
           (now() at time zone 'America/Sao_Paulo')::date as hoje,
           (select o.vistas_em from privado.visitas_opcoes o where o.conta_id = (select public.conta_atual())) as vistas_em
  )
  select
    (select count(distinct v.visitante_id) from privado.visitas_perfil v
      where v.perfil_id = eu.id and v.dia > eu.hoje - 7)::integer,
    (select count(distinct v.visitante_id) from privado.visitas_perfil v
      where v.perfil_id = eu.id and v.dia <= eu.hoje - 7 and v.dia > eu.hoje - 14)::integer,
    (select count(distinct v.visitante_id) from privado.visitas_perfil v
      where v.perfil_id = eu.id and v.dia > eu.hoje - 30
        and (eu.vistas_em is null or v.ultima > eu.vistas_em))::integer,
    (select coalesce(sum(a.vezes), 0) from privado.visitas_anonimas a
      where a.perfil_id = eu.id and a.dia > eu.hoje - 30)::integer
    from eu
   where eu.id is not null
$$;

-- Abriu a página: as visitas deixam de ser novas.
create or replace function public.marcar_visitas_vistas()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into privado.visitas_opcoes as o (conta_id, vistas_em)
  select public.conta_atual(), now() where public.conta_atual() is not null
  on conflict (conta_id) do update set vistas_em = now()
$$;

create or replace function public.minhas_opcoes_de_visitas()
returns table (avisar boolean, sem_aparecer boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.avisar, true), coalesce(o.sem_aparecer, false)
    from (select public.conta_atual() as id) eu
    left join privado.visitas_opcoes o on o.conta_id = eu.id
   where eu.id is not null
$$;

create or replace function public.mudar_opcoes_de_visitas(p_avisar boolean, p_sem_aparecer boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select public.conta_atual());
  v_pessoa boolean;
begin
  if v_eu is null then
    raise exception 'Entre para mudar as opções.';
  end if;
  select p.tipo = 'pessoa' into v_pessoa from public.perfis p where p.id = v_eu;
  insert into privado.visitas_opcoes as o (conta_id, avisar, sem_aparecer)
  values (v_eu, coalesce(p_avisar, true), coalesce(p_sem_aparecer, false) and coalesce(v_pessoa, false))
  on conflict (conta_id) do update
    set avisar = excluded.avisar, sem_aparecer = excluded.sem_aparecer;
end
$$;

-- As minhas candidaturas que a empresa já abriu.
create or replace function public.minhas_candidaturas_vistas()
returns table (anuncio_id uuid, vista_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.anuncio_id, v.vista_em from privado.candidaturas_vistas v
   where v.perfil_id = (select public.conta_atual())
$$;

revoke execute on function public.quem_viu_meu_perfil(integer), public.resumo_das_visitas(),
  public.marcar_visitas_vistas(), public.minhas_opcoes_de_visitas(), public.mudar_opcoes_de_visitas(boolean, boolean),
  public.minhas_candidaturas_vistas() from public, anon;
grant execute on function public.quem_viu_meu_perfil(integer), public.resumo_das_visitas(),
  public.marcar_visitas_vistas(), public.minhas_opcoes_de_visitas(), public.mudar_opcoes_de_visitas(boolean, boolean),
  public.minhas_candidaturas_vistas() to authenticated;


-- 5. O aviso de lançamento ----------------------------------------------------------------------
-- Uma vez por conta (rodar de novo não repete).

insert into public.notificacoes (destinatario_id, tipo, texto)
select p.id,
       'visitas_novidade',
       case when p.tipo = 'pessoa'
            then 'Novidade: agora você vê quem viu seu perfil. Quem você visita também fica sabendo. Prefere não aparecer? Toque aqui e ligue Navegar sem aparecer.'
            else 'Novidade: veja quem viu a página da sua conta. Quando você abre um perfil, um currículo ou uma candidatura, a pessoa fica sabendo.'
       end
  from public.perfis p
 where not coalesce(p.suspenso_ate > now(), false)
   and not exists (select 1 from public.notificacoes n where n.destinatario_id = p.id and n.tipo = 'visitas_novidade');

notify pgrst, 'reload schema';
