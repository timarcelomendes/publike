-- O convite do pacote (18/11/2026, claude/plano-ritmo-do-pacote.md). Sobre o preço dos pacotes, o Marcelo disse "Mas 5
-- candidatos é pouco em 30 dias" e escolheu "Mais ritmo antes de vender"; para ligar no piloto, "Pode ligar às 8h".
--
-- Com o pacote de candidatos no ar, o Publike convida para a vaga quem tem currículo em Talentos e combina com ela
-- (a conta do site, 70% ou mais, feita pelo robô das filas em src/lib/servidor/convite-do-pacote.ts), do mais perto
-- para o mais longe. O convite é o de hoje (sino, celular e e-mail), com as proteções de hoje: no máximo 2 convites
-- automáticos por pessoa por semana, as regras do convite (privado.motivo_sem_convite) e "Não quero convites
-- automáticos". A curtida de quem foi convidado, depois do convite e com o pacote no ar, conta no pacote, com a origem
-- 'convite'. Até `convite_max` pessoas por pacote, só das 8h às 21h, uma rodada a cada 15 minutos. Nasce desligado
-- (Admin › Impulsos). Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists convite_ligado boolean not null default false,
  add column if not exists convite_max smallint not null default 30,
  add column if not exists convite_rodou_em timestamptz,
  -- as horas em que o convite sai (o horário de Brasília): das 8h às 21h, como o WhatsApp
  add column if not exists convite_hora_inicio smallint not null default 8,
  add column if not exists convite_hora_fim smallint not null default 21;
alter table privado.config_impulso drop constraint if exists config_impulso_convite_max_check;
alter table privado.config_impulso add constraint config_impulso_convite_max_check check (convite_max between 0 and 200);
alter table privado.config_impulso drop constraint if exists config_impulso_convite_horas_check;
alter table privado.config_impulso add constraint config_impulso_convite_horas_check
  check (convite_hora_inicio between 0 and 23 and convite_hora_fim between 1 and 24 and convite_hora_inicio < convite_hora_fim);

-- quem o pacote convidou
create table if not exists privado.impulso_convites (
  impulso_id uuid not null references privado.impulsos(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (impulso_id, perfil_id)
);
create index if not exists impulso_convites_perfil on privado.impulso_convites (perfil_id);
alter table privado.impulso_convites enable row level security;
revoke all on privado.impulso_convites from public, anon, authenticated;

-- a curtida que veio do convite
alter table privado.impulso_curtidas drop constraint if exists impulso_curtidas_origem_check;
alter table privado.impulso_curtidas add constraint impulso_curtidas_origem_check
  check (origem in ('google', 'quadro', 'link', 'lista', 'convite'));

-- ------------------------------------------------------------------ o robô

-- os pacotes no ar que ainda convidam (vazio fora das 8h às 21h, com a chave desligada ou antes de 15 minutos da
-- última rodada; a rodada fica marcada aqui, para duas voltas do robô não convidarem juntas)
create or replace function public.servidor_pacotes_para_convidar(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_hora integer := extract(hour from (now() at time zone 'America/Sao_Paulo'))::integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if not coalesce(c.convite_ligado, false) or coalesce(c.convite_max, 0) <= 0
     or v_hora < c.convite_hora_inicio or v_hora >= c.convite_hora_fim then
    return '[]'::jsonb;
  end if;
  update privado.config_impulso set convite_rodou_em = now()
   where id and (convite_rodou_em is null or convite_rodou_em < now() - interval '15 minutes');
  if not found then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'impulso_id', x.id, 'conta_id', x.conta_id, 'restam', c.convite_max - x.ja,
             'vaga', jsonb_build_object(
               'id', a.id, 'titulo', a.titulo, 'descricao', a.descricao,
               'escolaridade_minima', a.escolaridade_minima, 'experiencia', a.experiencia, 'cnh', a.cnh,
               'cidade', a.cidade, 'bairro', a.bairro, 'jornada', a.jornada,
               'horario_detalhe', a.horario_detalhe, 'horario', a.horario))
           order by x.aprovado_em)
      from (select i.*, (select count(*) from privado.impulso_convites ic where ic.impulso_id = i.id)::integer as ja
              from privado.impulsos i
             where i.produto = 'candidatos' and i.situacao = 'no_ar' and not i.pausar
               and (i.ate is null or i.ate > now())) x
      join public.anuncios a on a.id = x.anuncio_id
     where x.ja < c.convite_max
       and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now()
       and a.local is not null), '[]'::jsonb);
end
$$;

-- quem pode receber o convite do pacote: Talentos (quem deixou as empresas encontrarem), pelas regras do convite, sem
-- quem desligou os automáticos ou já recebeu 2 na semana, com a distância do centro do bairro do perfil até a vaga
-- (null: o bairro não está nos centros conhecidos). A conta do % e o raio ficam com o robô.
create or replace function public.servidor_talentos_para_o_pacote(p_chave text, p_impulso uuid)
returns table (perfil_id uuid, nome text, cidade text, bairro text, curriculo jsonb, km numeric)
language plpgsql
-- volatile: privado.exigir_servidor grava, e o PostgREST roda as stable só para leitura
volatile
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  a public.anuncios;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos x where x.id = p_impulso and x.produto = 'candidatos' and x.situacao = 'no_ar';
  select * into a from public.anuncios x where x.id = i.anuncio_id and x.local is not null;
  if i.id is null or a.id is null then
    return;
  end if;
  return query
  select p.id, privado.nome_curto(p.nome), p.cidade, p.bairro, to_jsonb(cv),
         case when b.lat is null then null
              else round((extensions.st_distance(
                     extensions.st_setsrid(extensions.st_makepoint(b.lng, b.lat), 4326)::extensions.geography,
                     a.local) / 1000)::numeric, 1) end
    from public.curriculo_na_vitrine v
    join public.perfis p on p.id = v.perfil_id
    join public.curriculos cv on cv.perfil_id = p.id
    left join privado.centros_dos_bairros b
      on b.cidade = lower(public.sem_acento(p.cidade)) and b.bairro = privado.bairro_comparavel(p.bairro)
   where p.tipo = 'pessoa' and not coalesce(p.suspenso_ate > now(), false) and p.id <> i.conta_id
     and not exists (select 1 from privado.sem_convite_automatico s where s.perfil_id = p.id)
     and (select count(*) from public.convites_vaga w
           where w.perfil_id = p.id and w.automatico and w.criado_em > now() - interval '7 days') < 2
     and privado.motivo_sem_convite(i.conta_id, a.id, a.cidade, p.id) is null
   order by 6 nulls last
   limit 500;
end
$$;

-- convida uma pessoa pelo pacote: confere tudo de novo e manda o convite de hoje (sino, celular e e-mail), na voz do
-- Publike, sem o nome da empresa (a vaga pode ser confidencial). Não gasta o limite de convites do dia da conta: quem
-- convida é o Publike.
create or replace function public.servidor_convidar_pelo_pacote(p_chave text, p_impulso uuid, p_perfil uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  i privado.impulsos;
  a public.anuncios;
  v_hora integer := extract(hour from (now() at time zone 'America/Sao_Paulo'))::integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if not coalesce(c.convite_ligado, false) or v_hora < c.convite_hora_inicio or v_hora >= c.convite_hora_fim then
    return false;
  end if;
  select * into i from privado.impulsos x
   where x.id = p_impulso and x.produto = 'candidatos' and x.situacao = 'no_ar' and not x.pausar
     and (x.ate is null or x.ate > now());
  select * into a from public.anuncios x
   where x.id = i.anuncio_id and x.tipo = 'vaga' and x.status = 'ativo' and x.preenchida_em is null
     and x.expira_em > now();
  if i.id is null or a.id is null or p_perfil = i.conta_id then
    return false;
  end if;
  -- um pacote de cada vez (o máximo do pacote) e uma pessoa de cada vez (os 2 da semana somam empresas e pacotes)
  perform pg_advisory_xact_lock(hashtext('publike:convite_pacote:' || i.id::text));
  perform pg_advisory_xact_lock(hashtext('publike:convite_auto:' || p_perfil::text));
  if (select count(*) from privado.impulso_convites ic where ic.impulso_id = i.id) >= c.convite_max then
    return false;
  end if;
  if not exists (select 1 from public.curriculo_na_vitrine v where v.perfil_id = p_perfil)
     or exists (select 1 from privado.sem_convite_automatico s where s.perfil_id = p_perfil) then
    return false;
  end if;
  if (select count(*) from public.convites_vaga w
       where w.perfil_id = p_perfil and w.automatico and w.criado_em > now() - interval '7 days') >= 2 then
    return false;
  end if;
  if privado.motivo_sem_convite(i.conta_id, a.id, a.cidade, p_perfil) is not null then
    return false;
  end if;
  insert into public.convites_vaga (anuncio_id, perfil_id, recado, automatico) values (a.id, p_perfil, null, true);
  insert into privado.impulso_convites (impulso_id, perfil_id) values (i.id, p_perfil) on conflict do nothing;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'convite', a.id, i.conta_id,
          left('O Publike separou para você uma vaga perto, que combina com o seu currículo: “' || a.titulo
               || '”. Veja os detalhes e, se tiver interesse, curta a vaga.', 300));
  return true;
end
$$;

-- ------------------------------------------------------------------ a curtida conta no pacote

-- quem o pacote convidou curte a vaga: conta no pacote (uma vez por pessoa, como a do quadro), e a curtida que completa
-- o pacote o termina na hora. Nunca segura a curtida: se der erro, só avisa no registro.
create or replace function privado.curtida_pelo_convite_do_pacote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  i privado.impulsos;
begin
  begin
    select ic.impulso_id into v_id
      from privado.impulso_convites ic
      join privado.impulsos x on x.id = ic.impulso_id
     where x.anuncio_id = new.anuncio_id and ic.perfil_id = new.perfil_id
       and x.produto = 'candidatos' and x.situacao = 'no_ar' and ic.criado_em <= now()
     order by x.criado_em desc
     limit 1;
    if v_id is null then
      return null;
    end if;
    insert into privado.impulso_curtidas (impulso_id, perfil_id, origem)
    values (v_id, new.perfil_id, 'convite') on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return null;
    end if;
    insert into privado.impulso_dias (impulso_id, dia, curtidas) values (v_id, v_dia, 1)
    on conflict (impulso_id, dia) do update set curtidas = privado.impulso_dias.curtidas + 1;
    select * into i from privado.impulsos where id = v_id;
    if privado.pacote_entregues(i.id) >= i.alvo then
      perform privado.pacote_terminar(i.id, 'Chegaram os candidatos do pacote.', true);
    end if;
  exception when others then
    raise warning 'Publike: a curtida do convite do pacote não contou (%).', sqlerrm;
  end;
  return null;
end
$$;

drop trigger if exists curtidas_zzzzz_convite_do_pacote on public.curtidas;
create trigger curtidas_zzzzz_convite_do_pacote after insert on public.curtidas
  for each row execute function privado.curtida_pelo_convite_do_pacote();

-- ------------------------------------------------------------------ o Admin e o cliente

-- Admin › Impulsos: a chave, o máximo e cada pacote no ar com quantos o Publike convidou e quantos curtiram
create or replace function public.admin_convite_do_pacote()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
begin
  perform privado.exigir_impulsos_admin();
  select * into c from privado.config_impulso where id;
  return jsonb_build_object(
    'ligado', coalesce(c.convite_ligado, false),
    'maximo', coalesce(c.convite_max, 30),
    'rodou_em', c.convite_rodou_em,
    'hora_inicio', c.convite_hora_inicio,
    'hora_fim', c.convite_hora_fim,
    'pacotes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'impulso_id', i.id, 'titulo', i.titulo, 'no_ar', i.situacao = 'no_ar',
               'cliente', (select p.nome from public.perfis p where p.id = i.conta_id),
               'alvo', i.alvo, 'entregues', privado.pacote_entregues(i.id),
               'convidados', (select count(*) from privado.impulso_convites ic where ic.impulso_id = i.id),
               'curtiram', (select count(*) from privado.impulso_curtidas k
                             join public.curtidas cu on cu.anuncio_id = i.anuncio_id and cu.perfil_id = k.perfil_id
                            where k.impulso_id = i.id and k.origem = 'convite'))
             order by i.situacao <> 'no_ar', i.aprovado_em)
        from privado.impulsos i
       -- os no ar e, para o resultado do piloto, os que terminaram nos últimos 30 dias depois de convidar alguém
       where i.produto = 'candidatos'
         and (i.situacao = 'no_ar'
              or (i.encerrado_em > now() - interval '30 days'
                  and exists (select 1 from privado.impulso_convites ic where ic.impulso_id = i.id)))), '[]'::jsonb));
end
$$;

create or replace function public.admin_salvar_convite_do_pacote(p_ligado boolean, p_maximo integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_impulsos_admin();
  if p_maximo is not null and (p_maximo < 0 or p_maximo > 200) then
    raise exception 'O máximo por pacote vai de 0 a 200 pessoas.' using errcode = '22023';
  end if;
  update privado.config_impulso
     set convite_ligado = coalesce(p_ligado, convite_ligado),
         convite_max = coalesce(p_maximo, convite_max)::smallint,
         -- ligar agora já pode rodar na próxima volta do robô
         convite_rodou_em = case when coalesce(p_ligado, false) and not convite_ligado then null else convite_rodou_em end
   where id;
end
$$;

-- a página do impulso da vaga (quem contrata): quantos o Publike convidou e quantos curtiram, em cada pacote da vaga
create or replace function public.convites_do_meu_pacote(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  return jsonb_build_object(
    'ligado', coalesce((select c.convite_ligado from privado.config_impulso c where c.id), false),
    'pacotes', coalesce((
      select jsonb_object_agg(i.id, jsonb_build_object(
               'convidados', (select count(*) from privado.impulso_convites ic where ic.impulso_id = i.id),
               'curtiram', (select count(*) from privado.impulso_curtidas k
                             join public.curtidas cu on cu.anuncio_id = i.anuncio_id and cu.perfil_id = k.perfil_id
                            where k.impulso_id = i.id and k.origem = 'convite')))
        from privado.impulsos i
       where i.anuncio_id = p_anuncio and i.conta_id = conta and i.produto = 'candidatos'), '{}'::jsonb));
end
$$;

-- como as outras: as do robô com a chave do servidor (privado.exigir_servidor confere); as do Admin, para a equipe
revoke execute on function public.servidor_pacotes_para_convidar(text), public.servidor_talentos_para_o_pacote(text, uuid),
  public.servidor_convidar_pelo_pacote(text, uuid, uuid), public.admin_convite_do_pacote(),
  public.admin_salvar_convite_do_pacote(boolean, integer), public.convites_do_meu_pacote(uuid) from public;
grant execute on function public.servidor_pacotes_para_convidar(text), public.servidor_talentos_para_o_pacote(text, uuid),
  public.servidor_convidar_pelo_pacote(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_convite_do_pacote(), public.admin_salvar_convite_do_pacote(boolean, integer)
  to authenticated, service_role;
grant execute on function public.convites_do_meu_pacote(uuid) to authenticated;
revoke execute on function privado.curtida_pelo_convite_do_pacote() from public;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270717120000_convite_do_pacote');
