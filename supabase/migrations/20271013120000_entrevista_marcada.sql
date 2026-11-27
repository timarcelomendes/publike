-- A entrevista marcada pelo WhatsApp, fase 1: o candidato pela conversa (27/11/2026; claude/plano-entrevista-marcada.md;
-- Marcelo: "Concordo, quero" e "Sim, execute"). Pode rodar de novo.
--
-- A equipe monta a agenda da vaga (Admin › Entrevistas, também no site no ar para a equipe publike.org): os horários
-- que a empresa passou, o formato (presencial, telefone, link de vídeo ou vídeo pelo Publike) e a fila de quem chamar,
-- aprovada candidato por candidato (só quem se candidatou à vaga). O robô das filas convida pelo WhatsApp em ondas
-- (pelo modelo de utilidade `publike_convite_entrevista`, com [Quero marcar] [Não tenho interesse]): o toque abre a
-- janela de 24 horas e a lista dos horários livres vem na conversa. O horário escolhido vira a entrevista de sempre
-- (public.entrevistas, confirmada) e o aceite (match) da candidatura. Na véspera e umas 2 horas antes, o lembrete com
-- botões ([Confirmo] [Não vou mais] [Trocar horário]; [Tudo certo] [Não vou mais]; no vídeo pelo Publike, [Entrar na
-- sala]). O horário que alguém solta volta para a agenda, e a próxima onda chama mais gente.
--
-- 1. As tabelas (privado): agendas, agenda_horarios, agenda_convites
-- 2. O que a equipe usa: admin_agenda_vagas, admin_agenda_criar, admin_agenda_horarios, admin_agendas,
--    admin_agenda, admin_agenda_aprovar, admin_agenda_tirar, admin_agenda_resultado, admin_agenda_encerrar
-- 3. O robô das filas: servidor_agenda_a_convidar, servidor_agenda_lembretes, servidor_agenda_enviada
-- 4. A conversa: servidor_agenda_resposta (sim, nao, horario, remarcar, cancelar, conf, ok)
-- 5. O lembrete de sempre na véspera (servidor_lembretes_entrevista) não vai ao candidato da agenda: ele recebe o
--    lembrete com botões; quem contrata continua recebendo o dele.

-- 1. As tabelas -----------------------------------------------------------------------------------------------------

create table if not exists privado.agendas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  formato text not null check (formato in ('presencial', 'telefone', 'video', 'publike')),
  local text check (char_length(local) <= 300),
  obs text check (char_length(obs) <= 500),
  duracao_min smallint not null default 30 check (duracao_min between 10 and 240),
  criada_em timestamptz not null default now(),
  encerrada_em timestamptz
);
create index if not exists agendas_anuncio_idx on privado.agendas (anuncio_id);
alter table privado.agendas enable row level security;
revoke all on privado.agendas from public, anon, authenticated;

create table if not exists privado.agenda_horarios (
  id bigint generated always as identity primary key,
  agenda_id uuid not null references privado.agendas (id) on delete cascade,
  quando timestamptz not null,
  convite_id bigint,
  unique (agenda_id, quando)
);
alter table privado.agenda_horarios enable row level security;
revoke all on privado.agenda_horarios from public, anon, authenticated;

create table if not exists privado.agenda_convites (
  id bigint generated always as identity primary key,
  agenda_id uuid not null references privado.agendas (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  -- o código dos botões (g:sim:<token>, g:h:<horário>:<token>…)
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  ordem integer not null default 0,
  -- fila: aprovado, esperando a vez · enviando · convidado · quer (tocou em Quero marcar) · marcado · espera (quis,
  -- mas não havia horário) · recusou · desistiu (cancelou a marcada) · sem_resposta · sem_whatsapp · falhou · encerrado
  situacao text not null default 'fila'
    check (situacao in ('fila', 'enviando', 'convidado', 'quer', 'marcado', 'espera', 'recusou', 'desistiu',
                        'sem_resposta', 'sem_whatsapp', 'falhou', 'encerrado')),
  numero text,
  horario_id bigint references privado.agenda_horarios (id) on delete set null,
  entrevista_id uuid references public.entrevistas (id) on delete set null,
  convidado_em timestamptz,
  respondeu_em timestamptz,
  marcado_em timestamptz,
  lembrete_vespera_em timestamptz,
  confirmou_vespera_em timestamptz,
  lembrete_hoje_em timestamptz,
  confirmou_hoje_em timestamptz,
  falha text check (char_length(falha) <= 300),
  criado_em timestamptz not null default now(),
  unique (agenda_id, perfil_id)
);
create index if not exists agenda_convites_entrevista_idx on privado.agenda_convites (entrevista_id)
  where entrevista_id is not null;
create index if not exists agenda_convites_situacao_idx on privado.agenda_convites (agenda_id, situacao, ordem);
alter table privado.agenda_convites enable row level security;
revoke all on privado.agenda_convites from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_horarios_convite_fk') then
    alter table privado.agenda_horarios add constraint agenda_horarios_convite_fk
      foreign key (convite_id) references privado.agenda_convites (id) on delete set null;
  end if;
end
$$;
create unique index if not exists agenda_horarios_convite_idx on privado.agenda_horarios (convite_id)
  where convite_id is not null;

-- 2. Pedaços que as funções usam ------------------------------------------------------------------------------------

-- como a entrevista acontece, para as mensagens: "presencial, na Rua 10, 250" · "por telefone" · …
create or replace function privado.formato_da_agenda(p_formato text, p_local text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_formato
           when 'presencial' then 'presencial' || coalesce(', na ' || nullif(btrim(p_local), ''), '')
           when 'telefone' then 'por telefone (a empresa liga para este número)'
           when 'video' then 'por vídeo' || coalesce(', pelo link ' || nullif(btrim(p_local), ''), '')
           else 'por vídeo pelo Publike'
         end
$$;

-- os horários livres da agenda (os 10 primeiros, a partir de 2 horas depois de agora): [{id, rotulo, quando}]
create or replace function privado.agenda_livres(p_agenda uuid, p_agora timestamptz, p_menos bigint default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'quando', h.quando,
                                               'rotulo', initcap(left(privado.data_da_entrevista(h.quando), 1))
                                                         || substr(privado.data_da_entrevista(h.quando), 2))
                            order by h.quando), '[]'::jsonb)
    from (select x.id, x.quando
            from privado.agenda_horarios x
           where x.agenda_id = p_agenda and x.convite_id is null and x.quando > p_agora + interval '2 hours'
             and x.id is distinct from p_menos
           order by x.quando
           limit 10) h
$$;

-- a equipe do Publike (o admin no computador do dono ou a equipe publike.org no site no ar)
create or replace function privado.exigir_equipe_da_agenda()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
end
$$;

-- 3. O que a equipe usa ---------------------------------------------------------------------------------------------

-- as vagas no ar com candidatos, para montar a agenda (a busca pelo título ou pelo nome de quem publicou)
create or replace function public.admin_agenda_vagas(p_busca text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  perform privado.exigir_equipe_da_agenda();
  return (
    select coalesce(jsonb_agg(x order by x.candidatos desc, x.criado_em desc), '[]'::jsonb)
      from (select a.id, a.titulo, p.nome as empresa, a.bairro, a.cidade, a.criado_em,
                   nullif(btrim(a.endereco), '') as endereco,
                   (select count(*) from public.curtidas c where c.anuncio_id = a.id and c.status in ('pendente', 'match'))
                     as candidatos,
                   exists (select 1 from privado.agendas g where g.anuncio_id = a.id and g.encerrada_em is null)
                     as com_agenda
              from public.anuncios a
              join public.perfis p on p.id = a.autor_id
             where a.tipo = 'vaga' and a.status = 'ativo'
               and (v_busca is null or a.titulo ilike '%' || v_busca || '%' or p.nome ilike '%' || v_busca || '%')
             order by (select count(*) from public.curtidas c where c.anuncio_id = a.id and c.status in ('pendente', 'match')) desc,
                      a.criado_em desc
             limit 40) x
  );
end
$$;

-- a agenda nova: os horários (até 60, no futuro), o formato e o lugar
create or replace function public.admin_agenda_criar(p_anuncio uuid, p_horarios timestamptz[], p_formato text,
                                                     p_local text default null, p_obs text default null,
                                                     p_duracao integer default 30)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_local text := nullif(btrim(coalesce(p_local, '')), '');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_id uuid;
  v_horarios timestamptz[];
begin
  perform privado.exigir_equipe_da_agenda();
  select a.autor_id into v_autor from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga' and a.status = 'ativo';
  if v_autor is null then
    raise exception 'A vaga não está no ar.' using errcode = 'P0001';
  end if;
  if p_formato not in ('presencial', 'telefone', 'video', 'publike') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
  end if;
  if p_formato = 'presencial' and v_local is null then
    raise exception 'Diga o endereço da entrevista.' using errcode = '22023';
  end if;
  if p_formato = 'video' and (v_local is null or v_local !~* '^https://') then
    raise exception 'Cole o link da chamada de vídeo (começa com https://).' using errcode = '22023';
  end if;
  if p_formato = 'publike' then
    if privado.limite_ao_vivo(v_autor) = 0 then
      raise exception 'Esta conta não tem a entrevista ao vivo pelo Publike. Escolha presencial, telefone ou link de vídeo.'
        using errcode = 'P0001';
    end if;
    v_local := null;
  end if;
  if char_length(v_local) > 300 or char_length(v_obs) > 500 then
    raise exception 'O texto ficou longo demais.' using errcode = '22023';
  end if;
  select array_agg(distinct h order by h) into v_horarios
    from unnest(coalesce(p_horarios, '{}')) h
   where h > now() + interval '1 hour' and h < now() + interval '60 days';
  if coalesce(cardinality(v_horarios), 0) = 0 then
    raise exception 'Ponha pelo menos um horário daqui a mais de 1 hora.' using errcode = '22023';
  end if;
  if cardinality(v_horarios) > 60 then
    raise exception 'São horários demais (até 60 por agenda).' using errcode = '22023';
  end if;
  insert into privado.agendas (anuncio_id, formato, local, obs, duracao_min)
  values (p_anuncio, p_formato, v_local, v_obs, greatest(10, least(240, coalesce(p_duracao, 30))))
  returning id into v_id;
  insert into privado.agenda_horarios (agenda_id, quando)
  select v_id, h from unnest(v_horarios) h
  on conflict do nothing;
  return v_id;
end
$$;

-- pôr mais horários ou tirar os livres
create or replace function public.admin_agenda_horarios(p_agenda uuid, p_mais timestamptz[] default null,
                                                        p_tirar bigint[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_equipe_da_agenda();
  if not exists (select 1 from privado.agendas g where g.id = p_agenda and g.encerrada_em is null) then
    raise exception 'A agenda está encerrada.' using errcode = 'P0001';
  end if;
  delete from privado.agenda_horarios h
   where h.agenda_id = p_agenda and h.id = any (coalesce(p_tirar, '{}')) and h.convite_id is null;
  insert into privado.agenda_horarios (agenda_id, quando)
  select p_agenda, h from unnest(coalesce(p_mais, '{}')) h
   where h > now() + interval '1 hour' and h < now() + interval '60 days'
  on conflict do nothing;
  select count(*) into n from privado.agenda_horarios h where h.agenda_id = p_agenda;
  if n > 80 then
    raise exception 'São horários demais (até 80 por agenda).' using errcode = '22023';
  end if;
  return n;
end
$$;

-- as agendas, as abertas primeiro, com os números de cada uma
create or replace function public.admin_agendas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe_da_agenda();
  return (
    select coalesce(jsonb_agg(x order by x.aberta desc, x.criada_em desc), '[]'::jsonb)
      from (select g.id, g.criada_em, g.encerrada_em, g.formato, g.encerrada_em is null as aberta,
                   a.id as anuncio_id, a.titulo as vaga, p.nome as empresa,
                   (select count(*) from privado.agenda_horarios h where h.agenda_id = g.id) as horarios,
                   (select count(*) from privado.agenda_horarios h
                     where h.agenda_id = g.id and h.convite_id is null and h.quando > now()) as livres,
                   (select min(h.quando) from privado.agenda_horarios h where h.agenda_id = g.id and h.quando > now())
                     as proximo,
                   (select jsonb_object_agg(s.situacao, s.n)
                      from (select c.situacao, count(*) n from privado.agenda_convites c
                             where c.agenda_id = g.id group by 1) s) as convites,
                   (select count(*) from privado.agenda_convites c
                      join public.entrevistas e on e.id = c.entrevista_id
                     where c.agenda_id = g.id and e.situacao = 'realizada') as vieram,
                   (select count(*) from privado.agenda_convites c
                      join public.entrevistas e on e.id = c.entrevista_id
                     where c.agenda_id = g.id and e.situacao = 'faltou') as faltaram
              from privado.agendas g
              join public.anuncios a on a.id = g.anuncio_id
              join public.perfis p on p.id = a.autor_id
             order by g.encerrada_em is null desc, g.criada_em desc
             limit 60) x
  );
end
$$;

-- uma agenda: os horários, quem foi chamado e os candidatos da vaga que ainda não estão na fila
create or replace function public.admin_agenda(p_agenda uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g privado.agendas;
  a public.anuncios;
begin
  perform privado.exigir_equipe_da_agenda();
  select * into g from privado.agendas x where x.id = p_agenda;
  if not found then
    return null;
  end if;
  select * into a from public.anuncios x where x.id = g.anuncio_id;
  return jsonb_build_object(
    'id', g.id,
    'formato', g.formato,
    'local', g.local,
    'obs', g.obs,
    'duracao_min', g.duracao_min,
    'criada_em', g.criada_em,
    'encerrada_em', g.encerrada_em,
    'anuncio_id', a.id,
    'vaga', a.titulo,
    'empresa', (select p.nome from public.perfis p where p.id = a.autor_id),
    'horarios', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', h.id, 'quando', h.quando, 'convite_id', h.convite_id,
                          'nome', (select pf.nome from privado.agenda_convites c join public.perfis pf on pf.id = c.perfil_id
                                    where c.id = h.convite_id))
                        order by h.quando), '[]'::jsonb)
                   from privado.agenda_horarios h where h.agenda_id = g.id),
    'convites', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', c.id, 'perfil_id', c.perfil_id, 'nome', pf.nome, 'bairro', pf.bairro, 'cidade', pf.cidade,
                          'situacao', c.situacao, 'ordem', c.ordem, 'final', right(c.numero, 4),
                          'convidado_em', c.convidado_em, 'respondeu_em', c.respondeu_em, 'marcado_em', c.marcado_em,
                          'quando', (select h.quando from privado.agenda_horarios h where h.id = c.horario_id),
                          'entrevista', (select e.situacao from public.entrevistas e where e.id = c.entrevista_id),
                          'entrevista_quando', (select e.quando from public.entrevistas e where e.id = c.entrevista_id),
                          'confirmou_vespera_em', c.confirmou_vespera_em, 'confirmou_hoje_em', c.confirmou_hoje_em,
                          'lembrete_vespera_em', c.lembrete_vespera_em, 'lembrete_hoje_em', c.lembrete_hoje_em,
                          'falha', c.falha)
                        order by c.ordem, c.id), '[]'::jsonb)
                   from privado.agenda_convites c join public.perfis pf on pf.id = c.perfil_id
                  where c.agenda_id = g.id),
    'candidatos', (select coalesce(jsonb_agg(jsonb_build_object(
                            'perfil_id', k.perfil_id, 'nome', pf.nome, 'bairro', pf.bairro, 'cidade', pf.cidade,
                            'status', k.status, 'desde', k.criado_em,
                            'whatsapp', privado.numero_do_whatsapp(k.perfil_id) is not null,
                            'teste', (select jsonb_build_object('pontos', t.pontos, 'maximo', t.maximo)
                                        from privado.avaliacoes_pedidas t
                                       where t.anuncio_id = k.anuncio_id and t.perfil_id = k.perfil_id
                                         and t.feita_em is not null
                                       order by t.feita_em desc limit 1))
                          order by k.criado_em), '[]'::jsonb)
                     from public.curtidas k join public.perfis pf on pf.id = k.perfil_id
                    where k.anuncio_id = g.anuncio_id and k.status in ('pendente', 'match')
                      and not exists (select 1 from privado.agenda_convites c
                                       where c.agenda_id = g.id and c.perfil_id = k.perfil_id))
  );
end
$$;

-- aprovar quem chamar (só quem se candidatou à vaga): entram no fim da fila, na ordem dada
create or replace function public.admin_agenda_aprovar(p_agenda uuid, p_perfis uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g privado.agendas;
  v_ordem integer;
  n integer := 0;
  v_perfil uuid;
begin
  perform privado.exigir_equipe_da_agenda();
  select * into g from privado.agendas x where x.id = p_agenda and x.encerrada_em is null;
  if not found then
    raise exception 'A agenda está encerrada.' using errcode = 'P0001';
  end if;
  select coalesce(max(c.ordem), 0) into v_ordem from privado.agenda_convites c where c.agenda_id = p_agenda;
  foreach v_perfil in array coalesce(p_perfis, '{}') loop
    if exists (select 1 from public.curtidas k
                where k.anuncio_id = g.anuncio_id and k.perfil_id = v_perfil and k.status in ('pendente', 'match')) then
      v_ordem := v_ordem + 1;
      insert into privado.agenda_convites (agenda_id, perfil_id, ordem)
      values (p_agenda, v_perfil, v_ordem)
      on conflict (agenda_id, perfil_id) do nothing;
      if found then
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end
$$;

-- tirar da fila quem ainda não foi chamado
create or replace function public.admin_agenda_tirar(p_convite bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe_da_agenda();
  delete from privado.agenda_convites c where c.id = p_convite and c.situacao in ('fila', 'sem_whatsapp', 'falhou');
  return found;
end
$$;

-- o resultado da entrevista, do que a empresa contou: realizada ou faltou (ou de volta a confirmada)
create or replace function public.admin_agenda_resultado(p_convite bigint, p_resultado text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entrevista uuid;
begin
  perform privado.exigir_equipe_da_agenda();
  if p_resultado not in ('realizada', 'faltou', 'confirmada') then
    raise exception 'Resultado inválido.' using errcode = '22023';
  end if;
  select c.entrevista_id into v_entrevista from privado.agenda_convites c where c.id = p_convite and c.situacao = 'marcado';
  if v_entrevista is null then
    raise exception 'Esta pessoa não tem entrevista marcada.' using errcode = 'P0001';
  end if;
  update public.entrevistas e set situacao = p_resultado, atualizado_em = now()
   where e.id = v_entrevista and e.situacao in ('marcada', 'confirmada', 'realizada', 'faltou');
  return found;
end
$$;

-- encerrar a agenda: quem estava na fila ou ainda não escolheu sai (as marcadas continuam)
create or replace function public.admin_agenda_encerrar(p_agenda uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe_da_agenda();
  update privado.agendas g set encerrada_em = now() where g.id = p_agenda and g.encerrada_em is null;
  if not found then
    return false;
  end if;
  update privado.agenda_convites c set situacao = 'encerrado'
   where c.agenda_id = p_agenda and c.situacao in ('fila', 'enviando', 'convidado', 'quer', 'espera');
  return true;
end
$$;

-- 4. O robô das filas -------------------------------------------------------------------------------------------------

-- quem convidar agora: por agenda aberta com horário livre, até 1,5 pessoa "pendente" (convidada ou escolhendo) por
-- horário livre; primeiro quem quis e ficou sem horário, depois a fila. Das 8h às 20h, de segunda a sábado (em Goiânia).
-- Antes, quem não respondeu o convite em 12 horas (ou não escolheu em 24) sai da conta.
create or replace function public.servidor_agenda_a_convidar(p_chave text, p_agora timestamptz default now(),
                                                             p_limite integer default 20)
returns table (convite_id bigint, token text, numero text, nome text, empresa text, vaga text, formato text)
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
      update privado.agenda_convites x set situacao = 'enviando', numero = v_numero, convidado_em = p_agora, falha = null
       where x.id = c.id;
      convite_id := c.id;
      token := c.token;
      numero := v_numero;
      nome := coalesce(nullif(split_part(btrim(coalesce(c.nome, '')), ' ', 1), ''), 'tudo bem');
      empresa := coalesce(g.empresa, 'a empresa');
      vaga := g.titulo;
      formato := privado.formato_da_agenda(g.formato, g.local);
      v_vagas := v_vagas - 1;
      v_total := v_total + 1;
      return next;
    end loop;
    exit when v_total >= p_limite;
  end loop;
end
$$;

-- os lembretes da hora: na véspera, das 18h às 22h (quem marcou há mais de 3 horas), e umas 2 horas antes (de 70 a
-- 150 minutos antes; quem marcou há mais de 1 hora). Cada um uma vez (fica anotado ao sair desta função).
drop function if exists public.servidor_agenda_lembretes(text, timestamptz, integer);
create or replace function public.servidor_agenda_lembretes(p_chave text, p_agora timestamptz default now(),
                                                            p_limite integer default 40)
returns table (convite_id bigint, tipo text, token text, numero text, nome text, empresa text, vaga text,
               quando text, formato text, como text, entrevista_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_amanha date := (p_agora at time zone 'America/Sao_Paulo')::date + 1;
  r record;
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
    v_total := v_total + 1;
    return next;
  end loop;
end
$$;

-- o que saiu (ou não) pelo WhatsApp: o convite muda de situação e a mensagem fica na conversa da pessoa
create or replace function public.servidor_agenda_enviada(p_chave text, p_convite bigint, p_tipo text, p_wamid text,
                                                          p_falhou text, p_texto text, p_numero text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.agenda_convites;
  v_chave text;
  v_numero text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.agenda_convites x where x.id = p_convite;
  if not found then
    return;
  end if;
  if p_tipo = 'convite' then
    update privado.agenda_convites x
       set situacao = case when p_falhou is null then 'convidado' else 'falhou' end,
           falha = left(p_falhou, 300),
           numero = coalesce(nullif(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), ''), x.numero)
     where x.id = c.id and x.situacao = 'enviando';
  elsif p_falhou is not null then
    update privado.agenda_convites x set falha = left(p_falhou, 300) where x.id = c.id;
  end if;
  if p_falhou is not null or btrim(coalesce(p_texto, '')) = '' then
    return;
  end if;
  v_numero := coalesce(nullif(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), ''), c.numero);
  v_chave := privado.chave_do_numero(v_numero);
  insert into privado.whatsapp_conversas (chave, numero, nome, perfil)
  values (v_chave, v_numero, (select p.nome from public.perfis p where p.id = c.perfil_id), 'trabalho')
  on conflict (chave) do nothing;
  insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
  values (v_chave, 'robo', left(btrim(p_texto), 4000), left(p_wamid, 200));
  update privado.whatsapp_conversas w set ultima_em = now() where w.chave = v_chave;
end
$$;

-- 5. A conversa -------------------------------------------------------------------------------------------------------

-- o toque da pessoa num botão da agenda. p_acao: sim (Quero marcar) · nao (Não tenho interesse) · horario (a linha da
-- lista, com p_horario) · remarcar (Trocar horário) · cancelar (Não vou mais) · conf (Confirmo, na véspera) · ok (Tudo
-- certo, no dia). Devolve a situação para a resposta: escolher (com os horarios) · sem_horario · marcado · ocupado ·
-- sem_outro · recusou · cancelado · confirmado · confirmado_hoje · encerrada · sem_candidatura · erro · nao_achou
create or replace function public.servidor_agenda_resposta(p_chave text, p_conversa text, p_acao text, p_token text,
                                                           p_horario bigint default null,
                                                           p_agora timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.agenda_convites;
  g privado.agendas;
  a public.anuncios;
  h privado.agenda_horarios;
  e public.entrevistas;
  v_empresa text;
  v_nome text;
  v_status text;
  v_livres jsonb;
  v_entrevista uuid;
  v_remarcou boolean := false;
  v_base jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('situacao', 'nao_achou');
  end if;
  select * into c from privado.agenda_convites x where x.token = p_token for update;
  if not found or privado.chave_do_numero(coalesce(c.numero, '')) <> privado.chave_do_numero(coalesce(p_conversa, '')) then
    return jsonb_build_object('situacao', 'nao_achou');
  end if;
  select * into g from privado.agendas x where x.id = c.agenda_id;
  select * into a from public.anuncios x where x.id = g.anuncio_id;
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  select p.nome into v_nome from public.perfis p where p.id = c.perfil_id;
  if c.entrevista_id is not null then
    select * into e from public.entrevistas x where x.id = c.entrevista_id;
  end if;
  v_base := jsonb_build_object('empresa', coalesce(v_empresa, 'a empresa'), 'vaga', a.titulo,
                               'formato', g.formato, 'local', g.local, 'obs', g.obs,
                               'como', privado.formato_da_agenda(g.formato, g.local),
                               'quando', case when c.situacao = 'marcado' and e.id is not null
                                              then privado.data_da_entrevista(e.quando) end,
                               'entrevista_id', c.entrevista_id);

  -- os lembretes: só para quem está marcado
  if p_acao in ('conf', 'ok') then
    if c.situacao <> 'marcado' or e.id is null or e.situacao not in ('marcada', 'confirmada') then
      return v_base || jsonb_build_object('situacao', 'nao_achou');
    end if;
    if p_acao = 'conf' then
      update privado.agenda_convites x set confirmou_vespera_em = coalesce(x.confirmou_vespera_em, p_agora) where x.id = c.id;
      return v_base || jsonb_build_object('situacao', 'confirmado');
    end if;
    update privado.agenda_convites x set confirmou_hoje_em = coalesce(x.confirmou_hoje_em, p_agora) where x.id = c.id;
    return v_base || jsonb_build_object('situacao', 'confirmado_hoje');
  end if;

  -- não vai mais: solta o horário (a próxima onda chama outra pessoa) e avisa quem contrata
  if p_acao = 'cancelar' or (p_acao = 'nao' and c.situacao = 'marcado') then
    if c.situacao = 'marcado' then
      update privado.agenda_horarios x set convite_id = null where x.id = c.horario_id and x.convite_id = c.id;
      update privado.agenda_convites x set situacao = 'desistiu', horario_id = null, respondeu_em = p_agora where x.id = c.id;
      if e.id is not null and e.situacao in ('marcada', 'confirmada', 'remarcar') then
        update public.entrevistas x set situacao = 'cancelada', atualizado_em = now() where x.id = e.id;
        insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, link, texto)
        values (a.autor_id, 'entrevista_resposta', a.id, c.perfil_id,
                '/painel/anuncio/' || a.id || '/quadro?candidato=' || c.perfil_id,
                left(coalesce(split_part(v_nome, ' ', 1), 'O candidato') || ' avisou pelo WhatsApp do Publike que não vai à entrevista de “'
                     || a.titulo || '” (' || privado.data_da_entrevista(e.quando) || '). O horário voltou para a agenda.', 300));
      end if;
      return v_base || jsonb_build_object('situacao', 'cancelado');
    end if;
    update privado.agenda_convites x set situacao = 'recusou', respondeu_em = p_agora
     where x.id = c.id and x.situacao in ('convidado', 'quer', 'espera', 'sem_resposta', 'enviando');
    return v_base || jsonb_build_object('situacao', 'recusou');
  end if;

  if p_acao = 'nao' then
    update privado.agenda_convites x set situacao = 'recusou', respondeu_em = p_agora
     where x.id = c.id and x.situacao in ('convidado', 'quer', 'espera', 'sem_resposta', 'enviando');
    return v_base || jsonb_build_object('situacao', 'recusou');
  end if;

  if g.encerrada_em is not null and c.situacao <> 'marcado' then
    return v_base || jsonb_build_object('situacao', 'encerrada');
  end if;

  -- quero marcar: a lista dos horários livres (ou a espera, sem horário)
  if p_acao = 'sim' then
    if c.situacao = 'marcado' then
      return v_base || jsonb_build_object('situacao', 'ja_marcado');
    end if;
    v_livres := privado.agenda_livres(g.id, p_agora);
    if jsonb_array_length(v_livres) = 0 then
      update privado.agenda_convites x set situacao = 'espera', respondeu_em = p_agora where x.id = c.id;
      return v_base || jsonb_build_object('situacao', 'sem_horario');
    end if;
    update privado.agenda_convites x set situacao = 'quer', respondeu_em = p_agora where x.id = c.id;
    return v_base || jsonb_build_object('situacao', 'escolher', 'horarios', v_livres);
  end if;

  -- trocar o horário: a lista sem o de agora (sem outro livre, fica o de agora)
  if p_acao = 'remarcar' then
    if c.situacao <> 'marcado' then
      v_livres := privado.agenda_livres(g.id, p_agora);
      if jsonb_array_length(v_livres) = 0 then
        return v_base || jsonb_build_object('situacao', 'sem_horario');
      end if;
      update privado.agenda_convites x set situacao = 'quer', respondeu_em = p_agora where x.id = c.id;
      return v_base || jsonb_build_object('situacao', 'escolher', 'horarios', v_livres);
    end if;
    v_livres := privado.agenda_livres(g.id, p_agora, c.horario_id);
    if jsonb_array_length(v_livres) = 0 then
      return v_base || jsonb_build_object('situacao', 'sem_outro');
    end if;
    return v_base || jsonb_build_object('situacao', 'escolher', 'horarios', v_livres, 'trocando', true);
  end if;

  if p_acao <> 'horario' then
    return jsonb_build_object('situacao', 'nao_achou');
  end if;

  -- o horário escolhido
  if c.situacao not in ('convidado', 'quer', 'espera', 'sem_resposta', 'marcado', 'enviando') then
    return v_base || jsonb_build_object('situacao', 'nao_achou');
  end if;
  select * into h from privado.agenda_horarios x where x.id = p_horario and x.agenda_id = g.id for update;
  if not found or h.quando <= p_agora + interval '1 hour' or (h.convite_id is not null and h.convite_id <> c.id) then
    return v_base || jsonb_build_object('situacao', 'ocupado', 'horarios', privado.agenda_livres(g.id, p_agora, c.horario_id));
  end if;
  if h.convite_id = c.id and c.situacao = 'marcado' then
    return v_base || jsonb_build_object('situacao', 'marcado', 'quando', privado.data_da_entrevista(h.quando));
  end if;
  select k.status into v_status from public.curtidas k where k.anuncio_id = a.id and k.perfil_id = c.perfil_id;
  if v_status is null or v_status not in ('pendente', 'match') then
    return v_base || jsonb_build_object('situacao', 'sem_candidatura');
  end if;
  begin
    -- o horário de antes (na troca) volta para a agenda
    if c.horario_id is not null and c.horario_id <> h.id then
      update privado.agenda_horarios x set convite_id = null where x.id = c.horario_id and x.convite_id = c.id;
      v_remarcou := true;
    end if;
    update privado.agenda_horarios x set convite_id = c.id where x.id = h.id;
    -- a candidatura aceita (o match): a entrevista vem depois do aceite. O WhatsApp do aceite não sai (a confirmação da
    -- entrevista já diz tudo); o sino e o e-mail ficam
    if v_status = 'pendente' then
      update public.curtidas k
         set status = 'match', aceita_em = null, respondida_em = now(),
             desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
       where k.anuncio_id = a.id and k.perfil_id = c.perfil_id;
      delete from privado.fila_whatsapp f
       where f.conta_id = c.perfil_id and f.anuncio_id = a.id and f.tipo = 'match' and f.situacao = 'pendente'
         and f.criado_em >= now() - interval '1 minute';
    end if;
    if e.id is not null and e.situacao in ('marcada', 'confirmada', 'remarcar') then
      update public.entrevistas x
         set quando = h.quando, formato = g.formato, local = g.local, obs = g.obs, duracao_min = g.duracao_min,
             opcoes = null, situacao = 'confirmada', atualizado_em = now()
       where x.id = e.id
      returning x.id into v_entrevista;
      v_remarcou := true;
    else
      insert into public.entrevistas (anuncio_id, perfil_id, quando, formato, local, obs, duracao_min, situacao)
      values (a.id, c.perfil_id, h.quando, g.formato, g.local, g.obs, g.duracao_min, 'confirmada')
      returning id into v_entrevista;
    end if;
    insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
    values (a.id, c.perfil_id, 'entrevista')
    on conflict (anuncio_id, perfil_id) do update
      set etapa = 'entrevista',
          atualizado_em = case when public.etapas_candidatos.etapa <> 'entrevista' then now()
                               else public.etapas_candidatos.atualizado_em end;
    update privado.agenda_convites x
       set situacao = 'marcado', horario_id = h.id, entrevista_id = v_entrevista, marcado_em = p_agora,
           respondeu_em = p_agora, lembrete_vespera_em = null, confirmou_vespera_em = null,
           lembrete_hoje_em = null, confirmou_hoje_em = null
     where x.id = c.id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, link, texto)
    values (a.autor_id, 'entrevista_resposta', a.id, c.perfil_id,
            '/painel/anuncio/' || a.id || '/quadro?candidato=' || c.perfil_id,
            left(coalesce(split_part(v_nome, ' ', 1), 'O candidato')
                 || case when v_remarcou then ' trocou o horário da entrevista de “' else ' marcou a entrevista de “' end
                 || a.titulo || '” pelo WhatsApp do Publike: ' || privado.data_da_entrevista(h.quando) || '.', 300));
  exception when others then
    return v_base || jsonb_build_object('situacao', 'erro', 'mensagem', left(sqlerrm, 300));
  end;
  return v_base || jsonb_build_object('situacao', 'marcado', 'quando', privado.data_da_entrevista(h.quando),
                                      'entrevista_id', v_entrevista, 'remarcou', v_remarcou);
end
$$;

-- 6. O lembrete de sempre na véspera: o candidato da agenda recebe o dele, com botões ----------------------------------

do $$
declare
  f text;
  antes text;
  v_de text := E'    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, link, texto)\n    values (r.perfil_id, ''entrevista_lembrete''';
  v_fim text := E'else '', por telefone'' end || ''.'', 300));';
begin
  f := pg_get_functiondef('public.servidor_lembretes_entrevista(text, timestamp with time zone)'::regprocedure);
  if strpos(f, 'privado.agenda_convites') = 0 then
    if (length(f) - length(replace(f, v_de, ''))) / length(v_de) <> 1
       or (length(f) - length(replace(f, v_fim, ''))) / length(v_fim) <> 1 then
      raise exception 'public.servidor_lembretes_entrevista mudou: não achei o lembrete do candidato';
    end if;
    antes := f;
    f := replace(f, v_de, E'    -- o candidato da agenda (migração 20271013120000) recebe o lembrete com botões\n'
                          || E'    if not exists (select 1 from privado.agenda_convites ac where ac.entrevista_id = r.id) then\n'
                          || v_de);
    f := replace(f, v_fim, v_fim || E'\n    end if;');
    if f = antes then
      raise exception 'public.servidor_lembretes_entrevista: a troca não pegou';
    end if;
    execute f;
  end if;
end
$$;

-- 7. A tela no site no ar (Admin › Quem vê cada tela) e as permissões ----------------------------------------------

insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/entrevistas', true)
on conflict (rota) do nothing;

revoke execute on function privado.formato_da_agenda(text, text) from public, anon, authenticated;
revoke execute on function privado.agenda_livres(uuid, timestamptz, bigint) from public, anon, authenticated;
revoke execute on function privado.exigir_equipe_da_agenda() from public, anon, authenticated;

revoke execute on function public.admin_agenda_vagas(text) from public, anon;
revoke execute on function public.admin_agenda_criar(uuid, timestamptz[], text, text, text, integer) from public, anon;
revoke execute on function public.admin_agenda_horarios(uuid, timestamptz[], bigint[]) from public, anon;
revoke execute on function public.admin_agendas() from public, anon;
revoke execute on function public.admin_agenda(uuid) from public, anon;
revoke execute on function public.admin_agenda_aprovar(uuid, uuid[]) from public, anon;
revoke execute on function public.admin_agenda_tirar(bigint) from public, anon;
revoke execute on function public.admin_agenda_resultado(bigint, text) from public, anon;
revoke execute on function public.admin_agenda_encerrar(uuid) from public, anon;
grant execute on function public.admin_agenda_vagas(text) to authenticated, service_role;
grant execute on function public.admin_agenda_criar(uuid, timestamptz[], text, text, text, integer) to authenticated, service_role;
grant execute on function public.admin_agenda_horarios(uuid, timestamptz[], bigint[]) to authenticated, service_role;
grant execute on function public.admin_agendas() to authenticated, service_role;
grant execute on function public.admin_agenda(uuid) to authenticated, service_role;
grant execute on function public.admin_agenda_aprovar(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_agenda_tirar(bigint) to authenticated, service_role;
grant execute on function public.admin_agenda_resultado(bigint, text) to authenticated, service_role;
grant execute on function public.admin_agenda_encerrar(uuid) to authenticated, service_role;

revoke execute on function public.servidor_agenda_a_convidar(text, timestamptz, integer) from public;
revoke execute on function public.servidor_agenda_lembretes(text, timestamptz, integer) from public;
revoke execute on function public.servidor_agenda_enviada(text, bigint, text, text, text, text, text) from public;
revoke execute on function public.servidor_agenda_resposta(text, text, text, text, bigint, timestamptz) from public;
grant execute on function public.servidor_agenda_a_convidar(text, timestamptz, integer) to anon, authenticated, service_role;
grant execute on function public.servidor_agenda_lembretes(text, timestamptz, integer) to anon, authenticated, service_role;
grant execute on function public.servidor_agenda_enviada(text, bigint, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.servidor_agenda_resposta(text, text, text, text, bigint, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271013120000_entrevista_marcada');
