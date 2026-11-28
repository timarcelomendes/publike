-- O mês no Publike (claude/plano-concentrar-contratacoes.md, parte 4; 28/11/2026, Marcelo: "Pode fazer tudo"). Uma vez
-- por mês, na primeira terça (das 10h às 18h de Brasília), cada conta que contrata e publicou vaga nos últimos 6 meses
-- recebe um aviso só, no sino, no celular e no e-mail:
--   1. o ganho do mês passado (os candidatos, os aceitos, as entrevistas marcadas e quem foi para Contratado);
--   2. o "Contratou alguém pelo Publike?", que leva às vagas para marcar Contratado (a pergunta da pesquisa);
--   3. o radar: quantas pessoas com currículo visível há na cidade das vagas (só a partir de 3, sem nome);
--   4. o chamado: "Precisa de gente? Publique a vaga".
-- Fica no grupo da semana (Preferências e o "parar de receber" do rodapé). Começa desligado: liga no Admin (ou pelo
-- SQL, privado.config_mes_no_publike). O modelo do WhatsApp (marketing, cerca de R$ 0,32 por mensagem) fica para
-- depois do OK do Marcelo.

create table if not exists privado.config_mes_no_publike (
  id boolean primary key default true check (id),
  ligado boolean not null default false
);
insert into privado.config_mes_no_publike (id) values (true) on conflict (id) do nothing;
alter table privado.config_mes_no_publike enable row level security;
revoke all on privado.config_mes_no_publike from public, anon, authenticated;

-- quem já recebeu o aviso do mês (um por conta por mês)
create table if not exists privado.meses_avisados (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  mes date not null,
  candidatos integer not null default 0,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, mes)
);
alter table privado.meses_avisados enable row level security;
revoke all on privado.meses_avisados from public, anon, authenticated;

-- O aviso novo 'mes_no_publike' (grupo da semana; sino, celular e e-mail) -------------------------------------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''mes_no_publike''') = 0 then
    if strpos(d, '''curriculo_semana''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem curriculo_semana: %', d;
    end if;
    d := replace(d, '''curriculo_semana''::text', '''curriculo_semana''::text, ''mes_no_publike''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''mes_no_publike''') = 0 then
    antes := f;
    f := replace(f, '''curriculo_semana'', ''atendem_a_vaga'') then ''semana''',
                 '''curriculo_semana'', ''atendem_a_vaga'', ''mes_no_publike'') then ''semana''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista da semana';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''mes_no_publike''') = 0 then
    antes := f;
    f := replace(f, '''procura_na_regiao'', ''curriculo_semana'',', '''procura_na_regiao'', ''curriculo_semana'', ''mes_no_publike'',');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''curriculo_semana'' then coalesce(new.link, ''/perfil/curriculo'')',
                 'when ''curriculo_semana'' then coalesce(new.link, ''/perfil/curriculo'')'
                 || chr(10) || '                 when ''mes_no_publike'' then coalesce(new.link, ''/painel/anuncios'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do curriculo_semana';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''mes_no_publike''') = 0 then
    if strpos(t, '''curriculo_semana''::text') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''curriculo_semana''::text', '''curriculo_semana''::text, ''mes_no_publike''::text');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('mes_no_publike', 'usuarios', 67, 'O mês no Publike',
     'Para quem contrata e publicou vaga nos últimos 6 meses, na primeira terça do mês: os candidatos, os aceitos, as entrevistas e os contratados do mês passado, a pergunta "Contratou alguém pelo Publike?" e quantas pessoas com currículo há na cidade das vagas. Começa desligado.',
     array['nome', 'motivo', 'link'],
     'O seu mês no Publike',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Abrir minhas vagas')
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

-- "a, b e c"
create or replace function privado.lista_com_e(p_partes text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(cardinality(p_partes), 0) = 0 then ''
    when cardinality(p_partes) = 1 then p_partes[1]
    else array_to_string(p_partes[1:cardinality(p_partes) - 1], ', ') || ' e ' || p_partes[cardinality(p_partes)]
  end
$$;

-- Quem recebe e o texto de cada um (do mês passado, em Brasília) ------------------------------------------------------

create or replace function privado.mes_no_publike_destinatarios(p_mes date)
returns table (perfil_id uuid, candidatos integer, texto text)
language sql
stable
security definer
set search_path = ''
as $$
  with contas as (
    select p.id, p.tipo
      from public.perfis p
     where p.tipo in ('empresa', 'comercio', 'agencia')
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and exists (select 1 from public.anuncios a
                    where a.autor_id = p.id and a.tipo = 'vaga' and a.criado_em > now() - interval '6 months')
       and not exists (select 1 from privado.meses_avisados m where m.perfil_id = p.id and m.mes = p_mes)
  ),
  periodo as (
    select (p_mes::timestamp at time zone 'America/Sao_Paulo') as de,
           ((p_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo') as ate
  ),
  numeros as (
    select c.id,
           (select count(*) from public.curtidas k join public.anuncios a on a.id = k.anuncio_id, periodo
             where a.autor_id = c.id and k.status <> 'reserva'
               and k.criado_em >= periodo.de and k.criado_em < periodo.ate)::integer as candidatos,
           (select count(*) from public.curtidas k join public.anuncios a on a.id = k.anuncio_id, periodo
             where a.autor_id = c.id and k.status = 'match'
               and k.criado_em >= periodo.de and k.criado_em < periodo.ate)::integer as aceitos,
           (select count(*) from public.entrevistas e join public.anuncios a on a.id = e.anuncio_id, periodo
             where a.autor_id = c.id and e.criado_em >= periodo.de and e.criado_em < periodo.ate)::integer as entrevistas,
           (select count(*) from public.etapas_candidatos e join public.anuncios a on a.id = e.anuncio_id, periodo
             where a.autor_id = c.id and e.etapa = 'contratado'
               and e.atualizado_em >= periodo.de and e.atualizado_em < periodo.ate)::integer as contratados,
           -- a cidade das vagas: a da vaga mais recente
           (select a.cidade from public.anuncios a
             where a.autor_id = c.id and a.tipo = 'vaga' order by a.criado_em desc limit 1) as cidade
      from contas c
  ),
  com_radar as (
    select n.*,
           (select count(*) from public.curriculo_visivel v join public.perfis p on p.id = v.perfil_id
             where n.cidade is not null and p.cidade = n.cidade
               and (p.suspenso_ate is null or p.suspenso_ate < now()))::integer as na_cidade,
           to_char(p_mes, 'MM') as mm
      from numeros n
  )
  select r.id, r.candidatos,
         left(
           case
             when r.candidatos > 0 then
               'Em ' || (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro',
                               'outubro','novembro','dezembro'])[r.mm::integer] || ', '
               || privado.lista_com_e(array_remove(array[
                    'suas vagas receberam ' || r.candidatos || case when r.candidatos = 1 then ' candidato' else ' candidatos' end,
                    case when r.aceitos > 0 then 'você aceitou ' || r.aceitos end,
                    case when r.entrevistas > 0 then 'marcou ' || r.entrevistas
                         || case when r.entrevistas = 1 then ' entrevista' else ' entrevistas' end end,
                    case when r.contratados > 0 then 'pôs ' || r.contratados || ' em Contratados' end], null))
               || '. '
               || case when r.contratados = 0
                       then 'Contratou alguém pelo Publike? Marque a pessoa como Contratado na vaga: ela ganha a conquista no perfil e a sua empresa, o selo "Contratou pelo Publike". '
                       else 'Obrigado por contar quem você contratou. ' end
             else 'No mês passado, nenhum candidato chegou às suas vagas pelo Publike. '
           end
           || case when r.na_cidade >= 3
                   then 'Hoje, ' || r.na_cidade || ' pessoas com currículo em ' || r.cidade
                        || ' deixam as empresas encontrá-las em Talentos. '
                   else '' end
           || 'Precisa de gente? Publique a vaga grátis: os candidatos chegam aqui, e o Publike responde por você.',
           500)
    from com_radar r
$$;
revoke all on function privado.mes_no_publike_destinatarios(date) from public, anon, authenticated;

-- O robô das filas: na primeira terça do mês, das 10h às 18h, até p_limite contas por rodada. `p_agora`: o "Mandar
-- agora" (passa por cima do dia, da hora e do desligado).
create or replace function public.servidor_avisar_mes_no_publike(p_chave text, p_limite integer default 100, p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  agora_br timestamp := now() at time zone 'America/Sao_Paulo';
  v_mes date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date;
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  if not coalesce(p_agora, false) then
    if not coalesce((select c.ligado from privado.config_mes_no_publike c where c.id), false) then
      return 0;
    end if;
    -- a primeira terça: terça (isodow 2) nos dias 1 a 7
    if extract(isodow from agora_br) <> 2 or extract(day from agora_br) > 7
       or extract(hour from agora_br) not between 10 and 17 then
      return 0;
    end if;
  end if;
  for r in
    select d.* from privado.mes_no_publike_destinatarios(v_mes) d
     limit greatest(1, least(coalesce(p_limite, 100), 300))
  loop
    insert into privado.meses_avisados (perfil_id, mes, candidatos) values (r.perfil_id, v_mes, r.candidatos)
    on conflict do nothing;
    continue when not found;
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.perfil_id, 'mes_no_publike', r.texto, '/painel/anuncios');
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_avisar_mes_no_publike(text, integer, boolean) from public;
grant execute on function public.servidor_avisar_mes_no_publike(text, integer, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271019120000_mes_no_publike');
