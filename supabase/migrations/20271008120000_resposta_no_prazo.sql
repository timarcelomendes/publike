-- A resposta no prazo (26/11/2026; Marcelo: "Preciso alertar as empresas sobre a demora em responder, sob penalidade
-- das vagas serem suspensas, coloca em risco a credibilidade da empresa/agência e do publike.org"; escolheu "5 dias +
-- 3 de prazo", "retorno neutro" para quem esperava e "todos que publicam vaga"). Pode rodar de novo.
--
-- Em 26/11: 135 candidaturas sem resposta em vagas no ar; 51 há mais de 7 dias, em 33 vagas de umas 20 contas (só 3
-- entraram no site na última semana).
--
-- 1. Candidatura sem resposta (pendente) há 5 dias ou mais numa vaga no ar: o alerta para quem publicou (sino, celular
--    e e-mail, mesmo com os avisos desligados), com o nome de quem espera e o prazo de 3 dias: "aceite ou dispense; sem
--    resposta, a vaga será suspensa". Das 8h às 20h; um alerta por vaga a cada 3 dias, no máximo.
-- 2. O prazo venceu e ainda tem gente esperando há 5 dias ou mais: a vaga é suspensa (pausada) e quem publicou recebe o
--    aviso. Quem esperava (todas as candidaturas pendentes) recebe um retorno neutro ("a vaga saiu do ar porque quem
--    publicou não respondeu a tempo"; a candidatura continua lá) e as vagas parecidas.
-- 3. Respondeu quem esperava (nenhuma candidatura pendente há 5 dias ou mais): a vaga volta ao ar sozinha (se não
--    venceu nem foi preenchida), com o aviso. Antes disso, "Reativar" e "Renovar" explicam o que falta (o admin passa).
-- 4. O aviso da regra, uma vez, para todas as contas com vaga no ar ou pausada (sino e e-mail).

-- 1. O ciclo de cada vaga ---------------------------------------------------------------------------------------------

create table if not exists privado.vagas_demora (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  -- o último alerta e o prazo dele
  alertada_em timestamptz,
  prazo_ate timestamptz,
  -- quantas pessoas esperavam no alerta
  esperando integer,
  suspensa_em timestamptz,
  religada_em timestamptz,
  -- o ciclo fechou sem suspender (respondeu, pausou, encerrou, venceu)
  resolvida_em timestamptz
);
alter table privado.vagas_demora enable row level security;
revoke all on privado.vagas_demora from public, anon, authenticated;

comment on table privado.vagas_demora is
  'A resposta no prazo (migração 20271008120000): o alerta (5 dias sem resposta), o prazo (3 dias), a suspensão e a volta ao ar.';

-- quem espera há 5 dias ou mais numa vaga
create or replace function privado.esperando_demais(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.curtidas c
   where c.anuncio_id = p_anuncio and c.status = 'pendente' and c.criado_em < now() - interval '5 days'
$$;

-- "Ana, Bruno e mais 2" (os primeiros nomes de quem espera há mais tempo)
create or replace function privado.quem_espera_demais(p_anuncio uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select split_part(btrim(coalesce(p.nome, '')), ' ', 1) as nome, row_number() over (order by c.criado_em) as n,
           count(*) over () as total
      from public.curtidas c
      join public.perfis p on p.id = c.perfil_id
     where c.anuncio_id = p_anuncio and c.status = 'pendente' and c.criado_em < now() - interval '5 days'
  )
  select case
           when max(total) is null then null
           when max(total) = 1 then max(nome) filter (where n = 1)
           when max(total) = 2 then max(nome) filter (where n = 1) || ' e ' || max(nome) filter (where n = 2)
           when max(total) = 3 then max(nome) filter (where n = 1) || ', ' || max(nome) filter (where n = 2)
                                    || ' e ' || max(nome) filter (where n = 3)
           else max(nome) filter (where n = 1) || ', ' || max(nome) filter (where n = 2) || ' e mais '
                || (max(total) - 2)
         end
    from q
$$;

-- 2. Os avisos novos ---------------------------------------------------------------------------------------------------
--    demora_alerta, demora_suspensa e demora_religada (para quem publicou; sem grupo e como aviso de conta: chegam
--    mesmo com os avisos desligados) e vaga_suspensa (para quem esperava; no grupo do andamento)

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''demora_alerta''') = 0 then
    if strpos(d, '''quem_contratou''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem quem_contratou (rode antes a 20271006120000): %', d;
    end if;
    d := replace(d, '''quem_contratou''::text',
                 '''quem_contratou''::text, ''demora_alerta''::text, ''demora_suspensa''::text, '
                 || '''demora_religada''::text, ''vaga_suspensa''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''vaga_suspensa''') = 0 then
    antes := f;
    f := replace(f, '''quem_contratou'') then ''andamento''', '''quem_contratou'', ''vaga_suspensa'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista do andamento';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''demora_alerta''') = 0 then
    antes := f;
    f := replace(f, '''vaga_continua'', ''vaga_continua_sim'') then',
                 '''vaga_continua'', ''vaga_continua_sim'', ''demora_alerta'', ''demora_suspensa'', ''demora_religada'', '
                 || '''vaga_suspensa'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''vaga_continua_sim'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id)',
                 'when ''vaga_continua_sim'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id)'
                 || chr(10) || '                 when ''demora_alerta'' then coalesce(new.link, ''/painel/caixa?aba=responder&vaga='' || new.anuncio_id)'
                 || chr(10) || '                 when ''demora_suspensa'' then coalesce(new.link, ''/painel/caixa?aba=responder&vaga='' || new.anuncio_id)'
                 || chr(10) || '                 when ''demora_religada'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/quadro'')'
                 || chr(10) || '                 when ''vaga_suspensa'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id || ''/parecidas'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do vaga_continua_sim';
    end if;
    execute f;
  end if;

  -- o alerta e a suspensão são avisos de conta: chegam mesmo para quem desligou os e-mails
  f := pg_get_functiondef('privado.enfileirar_email(uuid, text, jsonb)'::regprocedure);
  if strpos(f, '''demora_alerta''') = 0 then
    antes := f;
    f := replace(f, 'p_modelo in (''conta_suspensa'', ''conta_banida'', ''conta_reativada'')',
                 'p_modelo in (''conta_suspensa'', ''conta_banida'', ''conta_reativada'', ''demora_alerta'', ''demora_suspensa'')');
    if f = antes then
      raise exception 'privado.enfileirar_email mudou: não achei os avisos de conta';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''demora_alerta''') = 0 then
    if strpos(t, '''quem_contratou''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''quem_contratou''::text]',
                 '''quem_contratou''::text, ''demora_alerta''::text, ''demora_suspensa''::text, '
                 || '''demora_religada''::text, ''vaga_suspensa''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('demora_alerta', 'usuarios', 68, 'Candidatos esperando: responda no prazo',
     'Para quem publicou (migração 20271008120000): candidatura sem resposta há 5 dias ou mais numa vaga no ar. O prazo de 3 dias para aceitar ou dispensar; sem resposta, a vaga é suspensa. Sai mesmo com os avisos desligados.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Responda quem espera na vaga “{{titulo}}” para ela continuar no ar',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nResponder leva um toque: aceite quem interessa ou dispense quem não serve. Quem é dispensado recebe um retorno gentil e segue procurando.\n\nPor que isso importa: quem procura emprego conta com a resposta. Candidato sem retorno tira a confiança na sua empresa e no Publike. Por isso, quando o prazo passa com gente esperando, a vaga é suspensa até a resposta.',
     'Responder agora'),
    ('demora_suspensa', 'usuarios', 69, 'Vaga suspensa por falta de resposta',
     'Para quem publicou (migração 20271008120000): o prazo de 3 dias do alerta venceu e ainda tem gente esperando há 5 dias ou mais. A vaga sai do ar até a resposta. Sai mesmo com os avisos desligados.',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” foi suspensa: tem gente esperando resposta',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nÉ só responder quem espera (aceitar ou dispensar) que a vaga volta ao ar sozinha, com os candidatos que ela já tinha.',
     'Responder e voltar ao ar'),
    ('demora_religada', 'usuarios', 70, 'Vaga de volta ao ar',
     'Para quem publicou (migração 20271008120000): respondeu quem esperava e a vaga suspensa voltou ao ar.',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” voltou ao ar',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver os candidatos'),
    ('vaga_suspensa', 'usuarios', 71, 'A vaga saiu do ar sem resposta',
     'Para quem se candidatou e esperava (migração 20271008120000): a vaga foi suspensa porque quem publicou não respondeu a tempo. A candidatura continua lá.',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” saiu do ar',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver vagas parecidas'),
    ('regra_da_resposta', 'usuarios', 72, 'A regra da resposta no prazo',
     'Uma vez, para todas as contas com vaga no ar ou pausada (migração 20271008120000): responder em até 5 dias; depois, o alerta com 3 dias de prazo; sem resposta, a vaga é suspensa.',
     array['nome', 'link'],
     '{{nome}}, uma regra nova para as suas vagas no Publike',
     E'Oi, {{nome}}.\n\nQuem se candidata a uma vaga no Publike espera uma resposta, mesmo que seja um "não". Candidato sem retorno tira a confiança na empresa que anunciou e no próprio Publike.\n\nPor isso, a partir de agora:\n\n• Responda cada candidatura em até 5 dias: aceite quem interessa ou dispense quem não serve (é um toque, e quem é dispensado recebe um retorno gentil).\n• Passou de 5 dias, o Publike avisa e dá mais 3 dias.\n• Se o prazo vencer com gente esperando, a vaga é suspensa. É só responder que ela volta ao ar sozinha.\n\nVale para todas as vagas, de empresas, comércios, agências e pessoas. Obrigado por ajudar a manter o Publike um lugar onde quem procura emprego recebe resposta.',
     'Ver quem espera resposta')
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

-- 3. A volta ao ar ----------------------------------------------------------------------------------------------------

-- a vaga suspensa sem ninguém esperando há 5 dias ou mais: volta ao ar (se não venceu nem foi preenchida) e avisa
create or replace function privado.religar_vaga_demora(p_anuncio uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d privado.vagas_demora;
  a public.anuncios;
begin
  select * into d from privado.vagas_demora x
   where x.anuncio_id = p_anuncio and x.suspensa_em is not null and x.religada_em is null and x.resolvida_em is null
   for update;
  if not found or privado.esperando_demais(p_anuncio) > 0 then
    return false;
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio;
  if a.status = 'pausado' and a.preenchida_em is null and a.expira_em > now() then
    update public.anuncios x set status = 'ativo' where x.id = p_anuncio;
    update privado.vagas_demora x set religada_em = now() where x.anuncio_id = p_anuncio;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (a.autor_id, 'demora_religada', a.id,
            left('Pronto! A vaga “' || a.titulo || '” voltou ao ar. Obrigado por responder quem esperava.', 300),
            '/painel/anuncio/' || a.id || '/quadro');
    return true;
  end if;
  -- venceu, foi preenchida ou mudou de situação: o ciclo fecha sem voltar ao ar
  update privado.vagas_demora x set resolvida_em = now() where x.anuncio_id = p_anuncio;
  return false;
end
$$;

-- respondeu (aceitou, dispensou) ou a pessoa desistiu: confere se a vaga suspensa pode voltar
create or replace function privado.curtida_religa_vaga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anuncio uuid := coalesce(new.anuncio_id, old.anuncio_id);
begin
  if exists (select 1 from privado.vagas_demora d
              where d.anuncio_id = v_anuncio and d.suspensa_em is not null and d.religada_em is null
                and d.resolvida_em is null) then
    perform privado.religar_vaga_demora(v_anuncio);
  end if;
  return null;
exception
  when others then
    raise warning 'Publike: a volta ao ar da vaga % não foi conferida (%).', v_anuncio, sqlerrm;
    return null;
end
$$;

drop trigger if exists curtidas_religa_vaga on public.curtidas;
create trigger curtidas_religa_vaga
  after update of status or delete on public.curtidas
  for each row
  execute function privado.curtida_religa_vaga();

-- "Reativar" e "Renovar" da vaga suspensa: explicam o que falta (o admin passa)
create or replace function privado.vaga_suspensa_nao_religa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if new.status = 'ativo' and old.status = 'pausado' and not privado.eh_admin()
     and exists (select 1 from privado.vagas_demora d
                  where d.anuncio_id = new.id and d.suspensa_em is not null and d.religada_em is null
                    and d.resolvida_em is null) then
    n := privado.esperando_demais(new.id);
    if n > 0 then
      raise exception '%', 'Esta vaga foi suspensa porque ' || case when n = 1 then '1 pessoa espera' else n || ' pessoas esperam' end
                           || ' resposta há mais de 5 dias. Responda quem espera (aceite ou dispense) e ela volta ao ar sozinha.'
        using errcode = 'P0001', hint = 'suspensa_demora';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists anuncios_suspensa_demora on public.anuncios;
create trigger anuncios_suspensa_demora
  before update of status on public.anuncios
  for each row when (new.tipo = 'vaga')
  execute function privado.vaga_suspensa_nao_religa();

-- 4. O robô das filas: os ciclos, os alertas e as suspensões ---------------------------------------------------------

-- `p_agora`: sem a janela das 8h às 20h (os testes)
create or replace function public.servidor_respostas_no_prazo(p_chave text, p_limite integer default 50,
                                                               p_agora boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  v_alertas integer := 0;
  v_suspensas integer := 0;
  v_resolvidas integer := 0;
  v_religadas integer := 0;
  v_avisados integer := 0;
  v_quem text;
  v_n integer;
  v_prazo timestamptz;
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  perform privado.exigir_servidor(p_chave);

  -- o ciclo aberto, sem suspender, que já não tem quem espere demais (ou a vaga saiu do ar): fecha
  update privado.vagas_demora d set resolvida_em = now()
    from public.anuncios a
   where a.id = d.anuncio_id and d.alertada_em is not null and d.suspensa_em is null and d.resolvida_em is null
     and (privado.esperando_demais(a.id) = 0 or a.status <> 'ativo' or a.preenchida_em is not null
          or a.expira_em <= now());
  get diagnostics v_resolvidas = row_count;

  -- a suspensa que voltou ao ar por outro caminho (o admin) ou saiu de vez (encerrou, venceu): fecha
  update privado.vagas_demora d set resolvida_em = now()
    from public.anuncios a
   where a.id = d.anuncio_id and d.suspensa_em is not null and d.religada_em is null and d.resolvida_em is null
     and (a.status not in ('pausado') or a.expira_em <= now() or a.preenchida_em is not null);

  -- a suspensa que já não tem quem espere demais (a resposta que o gatilho não pegou): volta ao ar
  for r in select d.anuncio_id from privado.vagas_demora d
            where d.suspensa_em is not null and d.religada_em is null and d.resolvida_em is null
              and privado.esperando_demais(d.anuncio_id) = 0
  loop
    if privado.religar_vaga_demora(r.anuncio_id) then
      v_religadas := v_religadas + 1;
    end if;
  end loop;

  -- os avisos saem das 8h às 20h
  if not coalesce(p_agora, false) and (hora < 8 or hora >= 20) then
    return jsonb_build_object('alertas', 0, 'suspensas', 0, 'resolvidas', v_resolvidas, 'religadas', v_religadas,
                              'avisados', 0);
  end if;

  -- o prazo venceu com gente esperando demais: suspende
  for r in
    select a.id, a.titulo, a.autor_id
      from privado.vagas_demora d
      join public.anuncios a on a.id = d.anuncio_id
     where d.alertada_em is not null and d.suspensa_em is null and d.resolvida_em is null
       and d.prazo_ate <= now()
       and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now()
       and privado.esperando_demais(a.id) > 0
     order by d.prazo_ate
     limit v_limite
  loop
    v_n := privado.esperando_demais(r.id);
    update public.anuncios x set status = 'pausado' where x.id = r.id;
    update privado.vagas_demora x set suspensa_em = now() where x.anuncio_id = r.id;
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.id and nt.tipo = 'demora_alerta';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, 'demora_suspensa', r.id,
            left('A vaga “' || r.titulo || '” foi suspensa: '
                 || case when v_n = 1 then '1 pessoa espera' else v_n || ' pessoas esperam' end
                 || ' resposta há mais de 5 dias. Responda quem espera (aceite ou dispense) e a vaga volta ao ar sozinha.',
                 300),
            '/painel/caixa?aba=responder&vaga=' || r.id);
    -- quem esperava (todas as candidaturas pendentes): o retorno neutro, uma vez por suspensão
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    select c.perfil_id, 'vaga_suspensa', r.id,
           left('A vaga “' || r.titulo || '” saiu do ar porque quem publicou não respondeu a tempo. A sua candidatura '
                || 'continua lá: se a resposta vier, você fica sabendo. Enquanto isso, veja vagas parecidas perto de você.',
                300),
           '/anuncio/' || r.id || '/parecidas'
      from public.curtidas c
     where c.anuncio_id = r.id and c.status = 'pendente';
    get diagnostics v_n = row_count;
    v_avisados := v_avisados + v_n;
    perform privado.registrar('vaga_suspensa_demora', 'anuncio', r.id::text, r.titulo,
                              jsonb_build_object('esperando', privado.esperando_demais(r.id)));
    v_suspensas := v_suspensas + 1;
  end loop;

  -- o alerta: gente esperando há 5 dias ou mais, sem ciclo aberto e sem alerta nos últimos 3 dias
  for r in
    select a.id, a.titulo, a.autor_id
      from public.anuncios a
      join public.perfis pf on pf.id = a.autor_id
      left join privado.vagas_demora d on d.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now()
       and (pf.suspenso_ate is null or pf.suspenso_ate <= now())
       and (d.anuncio_id is null or d.resolvida_em is not null or d.religada_em is not null)
       and coalesce(d.alertada_em, '-infinity') < now() - interval '3 days'
       and exists (select 1 from public.curtidas c
                    where c.anuncio_id = a.id and c.status = 'pendente' and c.criado_em < now() - interval '5 days')
     order by a.criado_em
     limit v_limite
  loop
    v_n := privado.esperando_demais(r.id);
    v_quem := privado.quem_espera_demais(r.id);
    v_prazo := now() + interval '3 days';
    insert into privado.vagas_demora (anuncio_id, alertada_em, prazo_ate, esperando)
    values (r.id, now(), v_prazo, v_n)
    on conflict (anuncio_id) do update
      set alertada_em = now(), prazo_ate = v_prazo, esperando = v_n, suspensa_em = null, religada_em = null,
          resolvida_em = null;
    -- um alerta por vaga no sino: o novo tira o anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.id and nt.tipo = 'demora_alerta';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, 'demora_alerta', r.id,
            left(coalesce(v_quem, 'Uma pessoa') || case when v_n = 1 then ' espera' else ' esperam' end
                 || ' resposta na vaga “' || r.titulo || '” há mais de 5 dias. Responda até '
                 || to_char(v_prazo at time zone 'America/Sao_Paulo', 'DD/MM')
                 || ' (aceite ou dispense): sem resposta, a vaga será suspensa.', 300),
            '/painel/caixa?aba=responder&vaga=' || r.id);
    v_alertas := v_alertas + 1;
  end loop;

  return jsonb_build_object('alertas', v_alertas, 'suspensas', v_suspensas, 'resolvidas', v_resolvidas,
                            'religadas', v_religadas, 'avisados', v_avisados);
end
$$;

-- 5. O painel: as vagas com alerta e as suspensas -------------------------------------------------------------------

create or replace function public.minhas_vagas_no_prazo()
returns table (anuncio_id uuid, titulo text, estado text, prazo_ate timestamptz, esperando integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo,
         case when d.suspensa_em is not null then 'suspensa' else 'alerta' end,
         d.prazo_ate,
         privado.esperando_demais(a.id)
    from privado.vagas_demora d
    join public.anuncios a on a.id = d.anuncio_id
   where a.autor_id = (select public.conta_atual())
     and d.alertada_em is not null and d.resolvida_em is null and d.religada_em is null
     and privado.esperando_demais(a.id) > 0
     and (d.suspensa_em is not null or a.status = 'ativo')
   order by d.suspensa_em desc nulls last, d.prazo_ate
$$;

-- 6. O aviso da regra, uma vez: o sino e o e-mail para quem tem vaga no ar ou pausada --------------------------------

do $$
declare
  v_texto constant text := 'Regra nova: responda quem se candidata às suas vagas em até 5 dias (aceite ou dispense). Depois disso, o Publike avisa e dá mais 3 dias; sem resposta, a vaga é suspensa até você responder.';
  v_link constant text := '/painel/caixa?aba=responder';
  total integer;
begin
  if exists (select 1 from privado.comunicados c where c.texto = v_texto) then
    return;
  end if;
  perform privado.enfileirar_email(x.id, 'regra_da_resposta', jsonb_build_object('caminho', v_link))
     from (select distinct a.autor_id as id
             from public.anuncios a
             join public.perfis p on p.id = a.autor_id
            where a.tipo = 'vaga' and a.status in ('ativo', 'pausado')
              and (p.suspenso_ate is null or p.suspenso_ate <= now())) x;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  select distinct a.autor_id, 'comunicado', v_texto, v_link
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga' and a.status in ('ativo', 'pausado')
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and not exists (select 1 from public.notificacoes n
                      where n.destinatario_id = a.autor_id and n.tipo = 'comunicado' and n.link = v_link
                        and n.texto = v_texto);
  get diagnostics total = row_count;
  insert into privado.comunicados (publico, texto, link, total) values ('quem_publica_vaga', v_texto, v_link, total);
end
$$;

-- 7. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function
  privado.esperando_demais(uuid),
  privado.quem_espera_demais(uuid),
  privado.religar_vaga_demora(uuid),
  privado.curtida_religa_vaga(),
  privado.vaga_suspensa_nao_religa()
from public, anon, authenticated;
revoke execute on function public.servidor_respostas_no_prazo(text, integer, boolean) from public;
grant execute on function public.servidor_respostas_no_prazo(text, integer, boolean) to anon, authenticated, service_role;
revoke execute on function public.minhas_vagas_no_prazo() from public, anon;
grant execute on function public.minhas_vagas_no_prazo() to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271008120000_resposta_no_prazo');
