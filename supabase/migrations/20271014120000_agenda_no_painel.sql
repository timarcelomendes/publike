-- A entrevista marcada pelo WhatsApp, completa no painel (27/11/2026; Marcelo: "desenvolver completa e permite gerenciar
-- no admin é perfeito"). Pode rodar de novo.
--
-- 1. A agenda também no painel de quem publicou a vaga (empresa, comércio ou agência, e a equipe dela): as funções da
--    agenda (20271013120000) aceitam a conta dona da vaga, além da equipe do Publike. A lista de todas as agendas e a
--    busca de vagas continuam só da equipe. A agenda guarda quem criou (pela equipe ou pela conta).
-- 2. O convite e os lembretes como mensagem comum para quem escreveu ao Publike nas últimas 23 horas (sem modelo, de
--    graça); sem os modelos aprovados na Meta, só essas pessoas recebem (as outras esperam).
-- 3. agenda_da_vaga: a agenda aberta da vaga (e as de antes), para o painel.

-- 1. Quem mexe na agenda ------------------------------------------------------------------------------------------

alter table privado.agendas add column if not exists criada_por uuid;
alter table privado.agendas add column if not exists pela_equipe boolean not null default true;

create or replace function privado.quem_criou_a_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.criada_por := (select public.conta_atual());
  new.pela_equipe := privado.eh_admin() or privado.equipe_publike();
  return new;
end
$$;
drop trigger if exists agendas_quem_criou on privado.agendas;
create trigger agendas_quem_criou before insert on privado.agendas
  for each row execute function privado.quem_criou_a_agenda();

-- a equipe do Publike ou a conta dona da vaga (quem está na equipe da conta age por ela: conta_atual)
create or replace function privado.exigir_agenda(p_anuncio uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if privado.eh_admin() or privado.equipe_publike() then
    return;
  end if;
  if (select public.conta_atual()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = (select public.conta_atual())) then
    raise exception 'Esta vaga não é da sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
end
$$;

create or replace function privado.exigir_agenda_da_agenda(p_agenda uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_agenda((select g.anuncio_id from privado.agendas g where g.id = p_agenda));
end
$$;

create or replace function privado.exigir_agenda_do_convite(p_convite bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_agenda((select g.anuncio_id from privado.agenda_convites c
                                   join privado.agendas g on g.id = c.agenda_id where c.id = p_convite));
end
$$;

-- as funções da agenda passam a aceitar a conta dona da vaga
do $$
declare
  f text;
  antes text;
  r record;
begin
  for r in
    select * from (values
      ('public.admin_agenda_criar(uuid, timestamp with time zone[], text, text, text, integer)', 'privado.exigir_agenda(p_anuncio)'),
      ('public.admin_agenda_horarios(uuid, timestamp with time zone[], bigint[])', 'privado.exigir_agenda_da_agenda(p_agenda)'),
      ('public.admin_agenda(uuid)', 'privado.exigir_agenda_da_agenda(p_agenda)'),
      ('public.admin_agenda_aprovar(uuid, uuid[])', 'privado.exigir_agenda_da_agenda(p_agenda)'),
      ('public.admin_agenda_encerrar(uuid)', 'privado.exigir_agenda_da_agenda(p_agenda)'),
      ('public.admin_agenda_tirar(bigint)', 'privado.exigir_agenda_do_convite(p_convite)'),
      ('public.admin_agenda_resultado(bigint, text)', 'privado.exigir_agenda_do_convite(p_convite)')
    ) as x(funcao, checagem)
  loop
    f := pg_get_functiondef(r.funcao::regprocedure);
    if strpos(f, 'perform privado.exigir_equipe_da_agenda();') > 0 then
      antes := f;
      f := replace(f, 'perform privado.exigir_equipe_da_agenda();', 'perform ' || r.checagem || ';');
      if f = antes then
        raise exception '% mudou', r.funcao;
      end if;
      execute f;
    end if;
  end loop;

  -- a lista de todas as agendas mostra quem criou (a equipe ou a conta)
  f := pg_get_functiondef('public.admin_agendas()'::regprocedure);
  if strpos(f, 'g.pela_equipe') = 0 then
    antes := f;
    f := replace(f, 'select g.id, g.criada_em, g.encerrada_em, g.formato,', 'select g.id, g.criada_em, g.encerrada_em, g.formato, g.pela_equipe,');
    if f = antes then
      raise exception 'public.admin_agendas mudou';
    end if;
    execute f;
  end if;
end
$$;

-- a agenda aberta da vaga e as de antes (o painel da vaga)
create or replace function public.agenda_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_agenda(p_anuncio);
  return jsonb_build_object(
    'aberta', (select g.id from privado.agendas g
                where g.anuncio_id = p_anuncio and g.encerrada_em is null order by g.criada_em desc limit 1),
    'antes', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'criada_em', g.criada_em,
                                                           'encerrada_em', g.encerrada_em) order by g.criada_em desc),
                              '[]'::jsonb)
                from privado.agendas g where g.anuncio_id = p_anuncio and g.encerrada_em is not null),
    'com_whatsapp', (select count(*) from public.curtidas k
                      where k.anuncio_id = p_anuncio and k.status in ('pendente', 'match')
                        and privado.numero_do_whatsapp(k.perfil_id) is not null),
    'candidatos', (select count(*) from public.curtidas k
                    where k.anuncio_id = p_anuncio and k.status in ('pendente', 'match')),
    'ao_vivo', (select privado.limite_ao_vivo(a.autor_id) > 0 from public.anuncios a where a.id = p_anuncio));
end
$$;

-- 2. O convite e os lembretes na janela de 23 horas -------------------------------------------------------------------

drop function if exists public.servidor_agenda_a_convidar(text, timestamptz, integer);
create or replace function public.servidor_agenda_a_convidar(p_chave text, p_agora timestamptz default now(),
                                                             p_limite integer default 20,
                                                             p_so_janela boolean default false)
returns table (convite_id bigint, token text, numero text, nome text, empresa text, vaga text, formato text,
               na_janela boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  g record;
  c record;
  v_livres integer;
  v_pendentes integer;
  v_vagas integer;
  v_numero text;
  v_janela boolean;
  v_total integer := 0;
  cfg privado.config_whatsapp;
  v_teste text[] := privado.whatsapp_chaves_de_teste();
begin
  perform privado.exigir_servidor(p_chave);
  update privado.agenda_convites x set situacao = 'sem_resposta'
   where (x.situacao = 'convidado' and x.convidado_em < p_agora - interval '12 hours')
      or (x.situacao = 'quer' and x.respondeu_em < p_agora - interval '24 hours')
      -- o envio que travou no meio (o servidor caiu entre marcar e mandar)
      or (x.situacao = 'enviando' and x.convidado_em < p_agora - interval '30 minutes');
  if extract(isodow from v_local) = 7 or extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    return;
  end if;
  -- o WhatsApp desligado ou o convite desligado em Admin › WhatsApp › Parâmetros: ninguém sai
  select * into cfg from privado.config_whatsapp w where w.id;
  if not found or not cfg.ativo or 'agenda_convite' = any (cfg.tipos_desligados) then
    return;
  end if;
  for g in
    select ag.id, ag.formato, ag.local, a.titulo, p.nome as empresa
      from privado.agendas ag
      join public.anuncios a on a.id = ag.anuncio_id and a.status = 'ativo'
      join public.perfis p on p.id = a.autor_id
     where ag.encerrada_em is null
     order by ag.criada_em
  loop
    select count(*) into v_livres from privado.agenda_horarios h
     where h.agenda_id = g.id and h.convite_id is null and h.quando > p_agora + interval '3 hours';
    continue when v_livres = 0;
    select count(*) into v_pendentes from privado.agenda_convites x
     where x.agenda_id = g.id and x.situacao in ('enviando', 'convidado', 'quer');
    v_vagas := ceil(v_livres * 1.5)::integer - v_pendentes;
    for c in
      select x.id, x.perfil_id, x.token, pf.nome
        from privado.agenda_convites x
        join public.perfis pf on pf.id = x.perfil_id
       where x.agenda_id = g.id and x.situacao in ('espera', 'fila')
       order by (x.situacao = 'espera') desc, x.ordem, x.id
       for update of x skip locked
    loop
      exit when v_vagas <= 0 or v_total >= p_limite;
      v_numero := privado.numero_do_whatsapp(c.perfil_id);
      if v_numero is null
         or privado.aviso_desligado(c.perfil_id, 'entrevista', 'whatsapp')
         or exists (select 1 from privado.whatsapp_permissoes w
                     where w.conta_id = c.perfil_id and 'entrevista' = any (w.tipos_desligados))
         or exists (select 1 from privado.whatsapp_conversas cv
                     where cv.chave = privado.chave_do_numero(v_numero) and cv.avisos_parados_em is not null)
         or exists (select 1 from public.perfis p2 where p2.id = c.perfil_id and p2.suspenso_ate > p_agora) then
        update privado.agenda_convites x set situacao = 'sem_whatsapp' where x.id = c.id;
        continue;
      end if;
      -- no modo de teste do WhatsApp, só os números de teste (os outros esperam na fila)
      continue when not cfg.para_todos and not (privado.chave_do_numero(v_numero) = any (v_teste));
      -- quem escreveu ao Publike nas últimas 23 horas recebe o convite como mensagem comum (sem modelo); sem o
      -- modelo aprovado, só essas pessoas saem (as outras esperam na fila)
      v_janela := exists (select 1 from privado.whatsapp_conversas cv
                           where cv.chave = privado.chave_do_numero(v_numero)
                             and cv.ultima_da_pessoa_em > p_agora - interval '23 hours');
      continue when p_so_janela and not v_janela;
      update privado.agenda_convites x set situacao = 'enviando', numero = v_numero, convidado_em = p_agora, falha = null
       where x.id = c.id;
      convite_id := c.id;
      token := c.token;
      numero := v_numero;
      nome := coalesce(nullif(split_part(btrim(coalesce(c.nome, '')), ' ', 1), ''), 'tudo bem');
      empresa := coalesce(g.empresa, 'a empresa');
      vaga := g.titulo;
      formato := privado.formato_da_agenda(g.formato, g.local);
      na_janela := v_janela;
      v_vagas := v_vagas - 1;
      v_total := v_total + 1;
      return next;
    end loop;
    exit when v_total >= p_limite;
  end loop;
end
$$;

drop function if exists public.servidor_agenda_lembretes(text, timestamptz, integer);
drop function if exists public.servidor_agenda_lembretes(text, timestamptz, integer, boolean);
create or replace function public.servidor_agenda_lembretes(p_chave text, p_agora timestamptz default now(),
                                                            p_limite integer default 40,
                                                            p_so_janela boolean default false)
returns table (convite_id bigint, tipo text, token text, numero text, nome text, empresa text, vaga text,
               quando text, formato text, como text, entrevista_id uuid, local text, na_janela boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_amanha date := (p_agora at time zone 'America/Sao_Paulo')::date + 1;
  r record;
  v_janela boolean;
  v_total integer := 0;
  cfg privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp w where w.id;
  if not found or not cfg.ativo then
    return;
  end if;
  for r in
    select x.id, x.token, x.numero, x.perfil_id, pf.nome, a.titulo, pa.nome as empresa, e.id as entrevista,
           e.quando, e.formato, e.local,
           case when (e.quando at time zone 'America/Sao_Paulo')::date = v_amanha
                     and extract(hour from v_local) >= 18 and extract(hour from v_local) < 22
                     and x.lembrete_vespera_em is null and x.marcado_em < p_agora - interval '3 hours'
                  then 'vespera'
                when e.quando between p_agora + interval '70 minutes' and p_agora + interval '150 minutes'
                     and x.lembrete_hoje_em is null and x.marcado_em < p_agora - interval '1 hour'
                  then 'hoje'
           end as tipo
      from privado.agenda_convites x
      join public.entrevistas e on e.id = x.entrevista_id
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pf on pf.id = x.perfil_id
      join public.perfis pa on pa.id = a.autor_id
     where x.situacao = 'marcado' and e.situacao in ('marcada', 'confirmada') and x.numero is not null
       and e.quando > p_agora and e.quando < p_agora + interval '2 days'
     order by e.quando
     for update of x skip locked
  loop
    continue when r.tipo is null;
    continue when ('agenda_' || r.tipo) = any (cfg.tipos_desligados);
    exit when v_total >= p_limite;
    -- na janela de 23 horas, o lembrete sai como mensagem comum; sem os modelos aprovados, só esses
    v_janela := exists (select 1 from privado.whatsapp_conversas cv
                         where cv.chave = privado.chave_do_numero(r.numero)
                           and cv.ultima_da_pessoa_em > p_agora - interval '23 hours');
    continue when p_so_janela and not v_janela;
    if r.tipo = 'vespera' then
      update privado.agenda_convites x set lembrete_vespera_em = p_agora where x.id = r.id;
    else
      update privado.agenda_convites x set lembrete_hoje_em = p_agora where x.id = r.id;
    end if;
    convite_id := r.id;
    tipo := r.tipo;
    token := r.token;
    numero := r.numero;
    nome := coalesce(nullif(split_part(btrim(coalesce(r.nome, '')), ' ', 1), ''), 'tudo bem');
    empresa := coalesce(r.empresa, 'a empresa');
    vaga := r.titulo;
    quando := privado.data_da_entrevista(r.quando);
    formato := r.formato;
    como := privado.formato_da_agenda(r.formato, r.local);
    entrevista_id := r.entrevista;
    local := r.local;
    na_janela := v_janela;
    v_total := v_total + 1;
    return next;
  end loop;
end
$$;


-- 3. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function privado.quem_criou_a_agenda() from public, anon, authenticated;
revoke execute on function privado.exigir_agenda(uuid) from public, anon, authenticated;
revoke execute on function privado.exigir_agenda_da_agenda(uuid) from public, anon, authenticated;
revoke execute on function privado.exigir_agenda_do_convite(bigint) from public, anon, authenticated;
revoke execute on function public.agenda_da_vaga(uuid) from public, anon;
grant execute on function public.agenda_da_vaga(uuid) to authenticated, service_role;
revoke execute on function public.servidor_agenda_a_convidar(text, timestamptz, integer, boolean) from public;
grant execute on function public.servidor_agenda_a_convidar(text, timestamptz, integer, boolean) to anon, authenticated, service_role;
revoke execute on function public.servidor_agenda_lembretes(text, timestamptz, integer, boolean) from public;
grant execute on function public.servidor_agenda_lembretes(text, timestamptz, integer, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271014120000_agenda_no_painel');
