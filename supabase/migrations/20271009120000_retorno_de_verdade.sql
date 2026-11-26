-- O retorno de verdade (26/11/2026; Marcelo, sobre a resposta no prazo da migração 20271008120000: "o match não é
-- retorno"; escolheu, para as vagas de contato direto, "a pessoa disse 'Ainda não'"). Pode rodar de novo.
--
-- Quem espera o retorno há 5 dias ou mais (o que dá o alerta e, vencido o prazo, a suspensão):
--   - a candidatura sem resposta (pendente) desde a candidatura;
--   - aceita pelo Publike (vaga sem contato direto) e nenhum retorno da empresa (aceitar não zera o relógio: os 5 dias
--     contam da candidatura, para todos);
--   - na vaga de contato direto (a conversa é no WhatsApp, fora do Publike): só quando a própria pessoa respondeu
--     "Ainda não" à pergunta "A empresa te respondeu?" e não veio retorno pelo Publike.
-- Retorno da empresa: mensagem (não automática) para a pessoa, o toque no WhatsApp, telefone ou e-mail dela no
-- painel (privado.historico_etapas 'contato:%'), a entrevista marcada ou a etapa Entrevista, Contratado ou Não seguiu.
-- Aceitar sozinho e mover para Em análise não contam. Dispensar tira da espera (a pessoa recebe o retorno).
--
-- Os textos passam a dizer "o seu retorno" (e não "aceite ou dispense"), o link leva ao quadro da vaga e os avisos
-- já mandados no sino ganham o texto novo.

-- 1. A empresa deu retorno a esta pessoa nesta vaga? ------------------------------------------------------------------

create or replace function privado.empresa_deu_retorno(p_anuncio uuid, p_autor uuid, p_perfil uuid, p_desde timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.mensagens m
                  where m.autor_id <> p_perfil and not m.automatica
                    and ((m.anuncio_id = p_anuncio and m.perfil_id = p_perfil)
                         or (m.conversa_id in (select cv.id from public.conversas cv
                                                where (cv.conta_a = p_autor and cv.conta_b = p_perfil)
                                                   or (cv.conta_b = p_autor and cv.conta_a = p_perfil))
                             and m.criado_em >= p_desde)))
      or exists (select 1 from privado.historico_etapas h
                  where h.anuncio_id = p_anuncio and h.perfil_id = p_perfil and h.o_que like 'contato:%')
      or exists (select 1 from public.entrevistas e where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil)
      or exists (select 1 from public.etapas_candidatos ec
                  where ec.anuncio_id = p_anuncio and ec.perfil_id = p_perfil
                    and ec.etapa in ('entrevista', 'contratado', 'nao_seguiu'))
$$;

-- 2. Quem espera o retorno há 5 dias ou mais numa vaga (e desde quando) ----------------------------------------------

create or replace function privado.esperando_retorno(p_anuncio uuid)
returns table (perfil_id uuid, desde timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- os 5 dias contam da candidatura, para todos: aceitar não zera o relógio
  select c.perfil_id, c.criado_em
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.criado_em < now() - interval '5 days'
     and (
       c.status = 'pendente'
       or (c.status = 'match'
           and (not a.contato_direto
                or exists (select 1 from privado.te_respondeu tr
                            where tr.anuncio_id = c.anuncio_id and tr.perfil_id = c.perfil_id
                              and tr.resposta = 'ainda_nao'))
           and not privado.empresa_deu_retorno(c.anuncio_id, a.autor_id, c.perfil_id, c.criado_em))
     )
$$;

create or replace function privado.esperando_demais(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from privado.esperando_retorno(p_anuncio)
$$;

-- "Ana, Bruno e mais 2" (quem espera há mais tempo primeiro)
create or replace function privado.quem_espera_demais(p_anuncio uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select split_part(btrim(coalesce(p.nome, '')), ' ', 1) as nome, row_number() over (order by e.desde) as n,
           count(*) over () as total
      from privado.esperando_retorno(p_anuncio) e
      join public.perfis p on p.id = e.perfil_id
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

-- 3. O "Reativar" da vaga suspensa: o texto do retorno -------------------------------------------------------------------

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
                           || ' o seu retorno há mais de 5 dias. Dê o retorno a cada uma (dispense, ou fale com quem você aceitou: '
                           || 'mensagem, ligação ou entrevista) e a vaga volta ao ar sozinha.'
        using errcode = 'P0001', hint = 'suspensa_demora';
    end if;
  end if;
  return new;
end
$$;

-- 4. O e-mail leva ao quadro da vaga --------------------------------------------------------------------------------------

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, 'when ''demora_alerta'' then coalesce(new.link, ''/painel/caixa') > 0 then
    antes := f;
    f := replace(f, 'when ''demora_alerta'' then coalesce(new.link, ''/painel/caixa?aba=responder&vaga='' || new.anuncio_id)',
                 'when ''demora_alerta'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/quadro'')');
    f := replace(f, 'when ''demora_suspensa'' then coalesce(new.link, ''/painel/caixa?aba=responder&vaga='' || new.anuncio_id)',
                 'when ''demora_suspensa'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/quadro'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do demora_alerta';
    end if;
    execute f;
  end if;
end
$$;

-- os textos dos e-mails (os que a equipe não mudou)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('demora_alerta', 'usuarios', 68, 'Candidatos esperando: dê o retorno no prazo',
     'Para quem publicou (migrações 20271008120000 e 20271009120000): alguém espera o retorno há 5 dias ou mais numa vaga no ar (sem resposta, ou aceito e sem contato depois). O prazo de 3 dias; sem retorno, a vaga é suspensa. Sai mesmo com os avisos desligados.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Dê o retorno a quem espera na vaga “{{titulo}}” para ela continuar no ar',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nO que conta como retorno:\n• dispensar quem não serve (a pessoa recebe uma mensagem gentil e segue procurando);\n• para quem você aceitou: mandar mensagem pelo Publike, tocar no WhatsApp ou no telefone da pessoa, marcar a entrevista ou mover para Contratado ou Não seguiu.\n\nSó aceitar não é retorno: a pessoa continua esperando uma palavra sua.\n\nPor que isso importa: quem procura emprego conta com a resposta. Candidato sem retorno tira a confiança na sua empresa e no Publike. Por isso, quando o prazo passa com gente esperando, a vaga é suspensa até o retorno.',
     'Dar o retorno agora'),
    ('demora_suspensa', 'usuarios', 69, 'Vaga suspensa por falta de retorno',
     'Para quem publicou (migrações 20271008120000 e 20271009120000): o prazo de 3 dias do alerta venceu e ainda tem gente esperando o retorno há 5 dias ou mais. A vaga sai do ar até o retorno. Sai mesmo com os avisos desligados.',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” foi suspensa: tem gente esperando o seu retorno',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nDispense quem não serve ou fale com quem você aceitou (mensagem pelo Publike, WhatsApp ou telefone pelo painel, entrevista): a vaga volta ao ar sozinha, com os candidatos que ela já tinha.',
     'Dar o retorno')
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

-- 5. O robô: quem espera o retorno, os textos novos e o quadro da vaga ------------------------------------------------

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
                 || ' o seu retorno há mais de 5 dias. Dê o retorno a cada uma (dispense, ou fale com quem aceitou: '
                 || 'mensagem, ligação ou entrevista) e a vaga volta ao ar sozinha.', 300),
            '/painel/anuncio/' || r.id || '/quadro');
    -- quem esperava (as candidaturas pendentes e quem espera o retorno depois do aceite): o retorno neutro, uma vez por
    -- suspensão
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    select c.perfil_id, 'vaga_suspensa', r.id,
           left('A vaga “' || r.titulo || '” saiu do ar porque quem publicou não respondeu a tempo. A sua candidatura '
                || 'continua lá: se a resposta vier, você fica sabendo. Enquanto isso, veja vagas parecidas perto de você.',
                300),
           '/anuncio/' || r.id || '/parecidas'
      from public.curtidas c
     where c.anuncio_id = r.id
       and (c.status = 'pendente'
            or c.perfil_id in (select e.perfil_id from privado.esperando_retorno(r.id) e));
    get diagnostics v_n = row_count;
    v_avisados := v_avisados + v_n;
    perform privado.registrar('vaga_suspensa_demora', 'anuncio', r.id::text, r.titulo,
                              jsonb_build_object('esperando', privado.esperando_demais(r.id)));
    v_suspensas := v_suspensas + 1;
  end loop;

  -- o alerta: gente esperando o retorno há 5 dias ou mais, sem ciclo aberto e sem alerta nos últimos 3 dias
  for r in
    select a.id, a.titulo, a.autor_id
      from public.anuncios a
      join public.perfis pf on pf.id = a.autor_id
      left join privado.vagas_demora d on d.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now()
       and (pf.suspenso_ate is null or pf.suspenso_ate <= now())
       and (d.anuncio_id is null or d.resolvida_em is not null or d.religada_em is not null)
       and coalesce(d.alertada_em, '-infinity') < now() - interval '3 days'
       and privado.esperando_demais(a.id) > 0
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
                 || ' o seu retorno na vaga “' || r.titulo || '” há mais de 5 dias. Até '
                 || to_char(v_prazo at time zone 'America/Sao_Paulo', 'DD/MM')
                 || ', dispense quem não serve ou fale com quem aceitou (mensagem, ligação ou entrevista): sem retorno, '
                 || 'a vaga será suspensa.', 300),
            '/painel/anuncio/' || r.id || '/quadro');
    v_alertas := v_alertas + 1;
  end loop;

  return jsonb_build_object('alertas', v_alertas, 'suspensas', v_suspensas, 'resolvidas', v_resolvidas,
                            'religadas', v_religadas, 'avisados', v_avisados);
end
$$;

-- 6. Os avisos que já estão no sino ganham o texto novo ------------------------------------------------------------------

-- o alerta de cada vaga com o ciclo aberto: o texto de agora (quem espera e o prazo de antes)
update public.notificacoes n
   set texto = left(coalesce(privado.quem_espera_demais(a.id), 'Uma pessoa')
                    || case when privado.esperando_demais(a.id) = 1 then ' espera' else ' esperam' end
                    || ' o seu retorno na vaga “' || a.titulo || '” há mais de 5 dias. Até '
                    || to_char(d.prazo_ate at time zone 'America/Sao_Paulo', 'DD/MM')
                    || ', dispense quem não serve ou fale com quem aceitou (mensagem, ligação ou entrevista): sem retorno, '
                    || 'a vaga será suspensa.', 300),
       link = '/painel/anuncio/' || a.id || '/quadro'
  from privado.vagas_demora d
  join public.anuncios a on a.id = d.anuncio_id
 where n.tipo = 'demora_alerta' and n.anuncio_id = d.anuncio_id
   and d.resolvida_em is null and d.suspensa_em is null and privado.esperando_demais(a.id) > 0;

-- o aviso da regra (migração 20271008120000) dizia "aceite ou dispense"
update public.notificacoes n
   set texto = 'Regra nova: dê retorno a quem se candidata às suas vagas em até 5 dias. Dispense quem não serve ou fale com quem você aceitou (mensagem, ligação ou entrevista); só aceitar não é retorno. Passou disso, o Publike avisa e dá mais 3 dias; sem retorno, a vaga é suspensa.'
 where n.tipo = 'comunicado' and n.link = '/painel/caixa?aba=responder'
   and n.texto like 'Regra nova: responda quem se candidata%';

-- 7. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function
  privado.empresa_deu_retorno(uuid, uuid, uuid, timestamptz),
  privado.esperando_retorno(uuid),
  privado.esperando_demais(uuid),
  privado.quem_espera_demais(uuid),
  privado.vaga_suspensa_nao_religa()
from public, anon, authenticated;
revoke execute on function public.servidor_respostas_no_prazo(text, integer, boolean) from public;
grant execute on function public.servidor_respostas_no_prazo(text, integer, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271009120000_retorno_de_verdade');
