-- Crescimento: as empresas que voltam a publicar (03/11/2026, claude/plano-crescimento-empresas.md). Pode rodar de novo.
--
-- Parte 1 · "Volte a contratar". Os talentos da semana (20261119120000) só vão para quem tem vaga no ar: a empresa
-- que ficou sem vaga não recebia nada. Agora, na mesma segunda às 9h, a conta de empresa, comércio ou agência sem
-- vaga no ar, com vaga que saiu do ar nos últimos 6 meses (e a mais recente há 14 dias ou mais), recebe os
-- talentos da aba Talentos que combinam com as vagas de antes, com o "Publicar de novo" (/publicar?copiar=<vaga>).
-- No máximo um aviso a cada 4 semanas, e para depois de 3 avisos sem publicar. Só sai com 3 talentos ou mais (a
-- conta é do site, em src/lib/servidor/combinam.ts). Fica DESLIGADO até o admin ligar (Admin › E-mails › Toda
-- semana). Vai no grupo "semana" (quem desligou os talentos da semana em Avisos não recebe).
--   * config_site.reativar_empresas: liga e desliga (admin_ligar_reativar).
--   * privado.combinam_enviados ganha o tipo 'talentos_reativar' (nunca repete talento).
--   * servidor_reativar_situacao e servidor_reativar_empresas: o servidor do site (com a chave do servidor).
--   * servidor_combinam_registrar aceita o tipo novo (e guarda a vaga de antes na notificação).
--   * notificacoes.tipo ganha 'talentos_reativar' (o e-mail sai direto, com a lista).
--
-- Parte 2 · O resumo da vaga no aviso de segunda. Os talentos da semana passam a levar uma linha por vaga no ar
-- ("Atendente de loja: 23 visitas, 4 curtidas, 2 esperando resposta"). Sem talento novo, mas com movimento na
-- vaga (curtida ou visita nos últimos 7 dias), sai só o resumo (modelo de e-mail 'resumo_vagas'), e o aviso leva
-- ao quadro da vaga.
--   * servidor_resumo_das_vagas: os números das vagas no ar de cada conta.
--   * servidor_combinam_registrar: com p_dados.so_resumo = '1', manda o resumo sem talentos.
--   * o modelo 'talentos_semana' ganha a variável {{resumo}} (o parágrafo some quando vazio).
--
-- Parte 3 · Admin › Vagas paradas: sem banco (o admin lê as tabelas com a chave de serviço).
--
-- Parte 4 · Os números que faltam no Admin › Métricas (admin_metricas_crescimento): as vagas com 3 candidatos
-- em 48 h, as empresas que publicaram de novo em 60 dias e as que voltaram depois do "Volte a contratar".

alter table public.config_site add column if not exists reativar_empresas boolean not null default false;

alter table privado.combinam_enviados drop constraint if exists combinam_enviados_tipo_check;
alter table privado.combinam_enviados add constraint combinam_enviados_tipo_check
  check (tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar'));

-- O tipo novo no sino (a lista de 20270111120000_mais_automacoes, mais ele)
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe',
                  'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia',
                  'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento',
                  'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                  'talentos_reativar'));

-- o grupo: o mesmo dos talentos da semana (a de 20270111120000, com ele)
create or replace function privado.grupo_do_aviso(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar', 'resumo_vagas') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$$;

-- o e-mail sai direto, com a lista: fora do gatilho (a lista de 20261204120000_avaliacoes, mais ele)
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana',
                         'comunicado', 'noticias_do_dia', 'teste_pedido', 'teste_feito', 'talentos_reativar'))
  execute function privado.notificacao_por_email();

-- e no celular também (a lista de 20270111120000, mais ele)
drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito',
                     'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete',
                     'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                     'talentos_reativar'))
  execute function privado.notificacao_para_celular();

-- O modelo do e-mail (o admin edita em Admin › E-mails)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values
  ('talentos_reativar', 'usuarios', 93, 'Volte a contratar',
   'Para empresa, comércio e agência sem vaga no ar (a última saiu há 14 dias ou mais, nos últimos 6 meses): currículos da aba Talentos que combinam com as vagas de antes, com o botão para publicar de novo. Só com 3 ou mais; no máximo a cada 4 semanas e até 3 vezes sem publicar.',
   array['nome', 'quantas', 'lista', 'vaga'],
   '{{quantas}} com a sua vaga de {{vaga}}',
   E'Oi, {{nome}}.\n\nSua vaga de {{vaga}} saiu do ar, mas o Publike continua recebendo currículos. Estes combinam com ela:\n\n{{lista}}\n\nPublique de novo em um minuto: a vaga abre preenchida, é só conferir. É grátis e sem limite de candidatos.',
   'Publicar de novo',
   '{{quantas}} com a sua vaga de {{vaga}}',
   E'Oi, {{nome}}.\n\nSua vaga de {{vaga}} saiu do ar, mas o Publike continua recebendo currículos. Estes combinam com ela:\n\n{{lista}}\n\nPublique de novo em um minuto: a vaga abre preenchida, é só conferir. É grátis e sem limite de candidatos.',
   'Publicar de novo')
on conflict (chave) do nothing;

-- Admin: liga e desliga
create or replace function public.admin_ligar_reativar(p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update public.config_site set reativar_empresas = coalesce(p_ligado, false), atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
end
$$;
revoke execute on function public.admin_ligar_reativar(boolean) from public, anon;
grant execute on function public.admin_ligar_reativar(boolean) to authenticated, service_role;

-- Ligado ou não (a hora de mandar é a mesma dos talentos da semana: servidor_combinam_situacao)
create or replace function public.servidor_reativar_situacao(p_chave text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select c.reativar_empresas from public.config_site c limit 1), false);
end
$$;

-- As contas para o "Volte a contratar", com as vagas de antes (a mais recente primeiro, até 5) e quem já foi
-- visto (curtiu uma vaga da conta, é conexão ou já foi mandado). Uma vaga saiu do ar quando foi preenchida,
-- encerrada, venceu ou expirou; a hora: a do preenchimento, a do vencimento ou a da última mudança.
create or replace function public.servidor_reativar_empresas(p_chave text, p_semana date, p_limite integer default 50)
returns table (perfil_id uuid, vagas jsonb, ja uuid[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  with saidas as (
    select a.*,
           case when a.preenchida_em is not null then a.preenchida_em
                when a.expira_em <= now() then a.expira_em
                else a.atualizado_em end as saiu_em
      from public.anuncios a
     where a.tipo = 'vaga' and a.status not in ('em_analise', 'removido', 'pausado')
       and (a.status in ('encerrado', 'expirado') or a.preenchida_em is not null or a.expira_em <= now())
  ), contas as (
    select p.id, max(s.saiu_em) as ultima
      from public.perfis p
      join saidas s on s.autor_id = p.id
     where p.tipo in ('empresa', 'comercio', 'agencia') and not coalesce(p.suspenso_ate > now(), false)
     group by p.id
  )
  select c.id,
         (select jsonb_agg(jsonb_build_object(
                   'id', v.id, 'titulo', v.titulo, 'descricao', v.descricao,
                   'escolaridade_minima', v.escolaridade_minima, 'experiencia', v.experiencia, 'cnh', v.cnh,
                   'cidade', v.cidade, 'bairro', v.bairro, 'jornada', v.jornada,
                   'horario_detalhe', v.horario_detalhe, 'horario', v.horario) order by v.saiu_em desc)
            from (select * from saidas s where s.autor_id = c.id and s.saiu_em > now() - interval '180 days'
                   order by s.saiu_em desc limit 5) v),
         array(select cu.perfil_id from public.curtidas cu join public.anuncios a on a.id = cu.anuncio_id
                where a.autor_id = c.id
               union select x.talento_id from public.conexoes x where x.empresa_id = c.id
               union select unnest(e.ids) from privado.combinam_enviados e
                      where e.conta_id = c.id and e.tipo in ('talentos_semana', 'talentos_reativar'))
    from contas c
   where c.ultima > now() - interval '180 days'
     and c.ultima <= now() - interval '14 days'
     -- sem vaga no ar, pausada ou esperando a moderação
     and not exists (select 1 from public.anuncios a
                      where a.autor_id = c.id and a.tipo = 'vaga' and a.preenchida_em is null
                        and a.status in ('ativo', 'pausado', 'em_analise') and a.expira_em > now())
     -- nada nesta semana (nem a conta vista sem talento bom)
     and not exists (select 1 from privado.combinam_enviados e
                      where e.semana = p_semana and e.conta_id = c.id and e.tipo = 'talentos_reativar')
     -- um aviso a cada 4 semanas
     and not exists (select 1 from privado.combinam_enviados e
                      where e.conta_id = c.id and e.tipo = 'talentos_reativar' and cardinality(e.ids) > 0
                        and e.criado_em > now() - interval '28 days')
     -- e até 3 seguidos sem publicar (conta a partir da vaga mais nova da conta)
     and (select count(*) from privado.combinam_enviados e
           where e.conta_id = c.id and e.tipo = 'talentos_reativar' and cardinality(e.ids) > 0
             and e.criado_em > (select max(a.criado_em) from public.anuncios a
                                 where a.autor_id = c.id and a.tipo = 'vaga')) < 3
   order by c.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
end
$$;

-- Registrar o envio (a de 20261119120000, com o tipo novo: a notificação leva a vaga de antes, para o sino e o
-- celular abrirem o "Publicar de novo" dela)
create or replace function public.servidor_combinam_registrar(
  p_chave text, p_semana date, p_conta uuid, p_tipo text, p_ids uuid[], p_texto text, p_dados jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
  v_vaga uuid;
begin
  perform privado.exigir_servidor(p_chave);
  if p_tipo not in ('vagas_semana', 'talentos_semana', 'talentos_reativar') then
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;
  insert into privado.combinam_enviados (semana, conta_id, tipo, ids)
  values (p_semana, p_conta, p_tipo, v_ids)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  -- sem talento novo, a empresa com vaga no ar e com movimento recebe só o resumo (parte 2): o aviso leva ao
  -- quadro da vaga e o e-mail é o 'resumo_vagas'
  if cardinality(v_ids) = 0 then
    if p_tipo <> 'talentos_semana' or coalesce(p_dados ->> 'so_resumo', '') <> '1' then
      return false;
    end if;
    select a.id into v_vaga from public.anuncios a
     where a.id = nullif(p_dados ->> 'vaga_id', '')::uuid and a.autor_id = p_conta;
    insert into public.notificacoes (destinatario_id, tipo, texto, anuncio_id)
    values (p_conta, p_tipo, left(coalesce(p_texto, ''), 300), v_vaga);
    perform privado.enfileirar_email(p_conta, 'resumo_vagas', coalesce(p_dados, '{}'::jsonb));
    return true;
  end if;
  if p_tipo = 'talentos_reativar' then
    select a.id into v_vaga from public.anuncios a
     where a.id = nullif(p_dados ->> 'vaga_id', '')::uuid and a.autor_id = p_conta;
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto, anuncio_id)
  values (p_conta, p_tipo, left(coalesce(p_texto, ''), 300), v_vaga);
  perform privado.enfileirar_email(p_conta, p_tipo, coalesce(p_dados, '{}'::jsonb));
  return true;
end
$$;

-- Parte 2: os números das vagas no ar de cada conta (as visitas desde a publicação, as curtidas, quem espera
-- resposta e se teve movimento nos últimos 7 dias: curtida nova ou visita)
create or replace function public.servidor_resumo_das_vagas(p_chave text, p_contas uuid[])
returns table (conta_id uuid, anuncio_id uuid, titulo text, visitas integer, curtidas integer, esperando integer,
               movimento boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select a.autor_id, a.id, a.titulo,
         coalesce(v.total, 0),
         (select count(*)::integer from public.curtidas c where c.anuncio_id = a.id),
         (select count(*)::integer from public.curtidas c where c.anuncio_id = a.id and c.status = 'pendente'),
         (coalesce(v.atualizado_em > now() - interval '7 days', false)
          or exists (select 1 from public.curtidas c where c.anuncio_id = a.id and c.criado_em > now() - interval '7 days'))
    from public.anuncios a
    left join public.anuncio_visitas v on v.anuncio_id = a.id
   where a.autor_id = any (coalesce(p_contas, '{}')) and a.tipo = 'vaga' and a.status = 'ativo'
     and a.preenchida_em is null and a.expira_em > now()
   order by a.autor_id, a.criado_em desc;
end
$$;

-- o modelo do resumo sozinho (sem talento novo) e o {{resumo}} nos talentos da semana
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values
  ('resumo_vagas', 'usuarios', 94, 'Resumo das suas vagas',
   'Toda segunda, para quem tem vaga no ar com movimento na semana (curtida ou visita) e nenhum talento novo que combine: os números de cada vaga e quem espera resposta.',
   array['nome', 'resumo', 'destaque'],
   'Suas vagas esta semana: {{destaque}}',
   E'Oi, {{nome}}.\n\nComo estão as suas vagas no Publike:\n\n{{resumo}}\n\nResponda quem curtiu: aceitar libera o WhatsApp dos dois, e quem responde rápido sobe na lista das vagas.',
   'Abrir a vaga',
   'Suas vagas esta semana: {{destaque}}',
   E'Oi, {{nome}}.\n\nComo estão as suas vagas no Publike:\n\n{{resumo}}\n\nResponda quem curtiu: aceitar libera o WhatsApp dos dois, e quem responde rápido sobe na lista das vagas.',
   'Abrir a vaga')
on conflict (chave) do nothing;

-- o resumo nos talentos da semana: só troca o texto que ainda é o padrão (o que o admin mudou fica)
update public.modelos_email
   set variaveis = array['nome', 'quantas', 'lista', 'resumo'],
       corpo = case when corpo = corpo_padrao
                    then E'Oi, {{nome}}.\n\nNa aba Talentos, estes currículos combinam com as suas vagas:\n\n{{lista}}\n\nAbra o currículo e convide para a vaga. É grátis.\n\nSuas vagas no ar:\n{{resumo}}'
                    else corpo end,
       corpo_padrao = E'Oi, {{nome}}.\n\nNa aba Talentos, estes currículos combinam com as suas vagas:\n\n{{lista}}\n\nAbra o currículo e convide para a vaga. É grátis.\n\nSuas vagas no ar:\n{{resumo}}'
 where chave = 'talentos_semana' and not ('resumo' = any (variaveis));

-- Parte 4: os números do crescimento (Admin › Métricas › Liquidez)
--   * vagas_48h: as vagas publicadas de 3 a 32 dias atrás (já tiveram as 48 h), e quantas tiveram 1 e 3 ou mais
--     candidatos nas primeiras 48 h;
--   * publicaram_de_novo: das contas de empresa, comércio e agência que publicaram de 60 a 150 dias atrás, quantas
--     publicaram outra vaga em até 60 dias depois da primeira desse período (no mesmo dia não conta);
--   * reativar: os "Volte a contratar" dos últimos 90 dias, e depois de quantos a conta publicou em até 14 dias.
create or replace function public.admin_metricas_crescimento()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with vagas as (
    select a.id, a.criado_em,
           (select count(*) from public.curtidas c
             where c.anuncio_id = a.id and c.criado_em <= a.criado_em + interval '48 hours') as em_48h
      from public.anuncios a
     where a.tipo = 'vaga' and a.status <> 'removido'
       and a.criado_em between now() - interval '32 days' and now() - interval '3 days'
  ), primeiras as (
    select a.autor_id, min(a.criado_em) as primeira
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id and p.tipo in ('empresa', 'comercio', 'agencia')
     where a.tipo = 'vaga' and a.status <> 'removido'
       and a.criado_em between now() - interval '150 days' and now() - interval '60 days'
     group by a.autor_id
  ), avisos as (
    select e.conta_id, e.criado_em
      from privado.combinam_enviados e
     where e.tipo = 'talentos_reativar' and cardinality(e.ids) > 0 and e.criado_em > now() - interval '90 days'
  )
  select jsonb_build_object(
    'vagas_48h', (select count(*) from vagas),
    'com_1_48h', (select count(*) from vagas where em_48h >= 1),
    'com_3_48h', (select count(*) from vagas where em_48h >= 3),
    'contas_base', (select count(*) from primeiras),
    'publicaram_de_novo', (select count(*) from primeiras x
                            where exists (select 1 from public.anuncios a
                                           where a.autor_id = x.autor_id and a.tipo = 'vaga' and a.status <> 'removido'
                                             and a.criado_em > x.primeira + interval '1 day'
                                             and a.criado_em <= x.primeira + interval '60 days')),
    'reativar_avisos', (select count(*) from avisos),
    'reativar_voltaram', (select count(*) from avisos v
                           where exists (select 1 from public.anuncios a
                                          where a.autor_id = v.conta_id and a.tipo = 'vaga'
                                            and a.criado_em > v.criado_em and a.criado_em <= v.criado_em + interval '14 days'))
  )
$$;
revoke execute on function public.admin_metricas_crescimento() from public, anon, authenticated;
grant execute on function public.admin_metricas_crescimento() to service_role;

revoke execute on function public.servidor_resumo_das_vagas(text, uuid[]) from public;
grant execute on function public.servidor_resumo_das_vagas(text, uuid[]) to anon, authenticated, service_role;

revoke execute on function public.servidor_reativar_situacao(text), public.servidor_reativar_empresas(text, date, integer),
  public.servidor_combinam_registrar(text, date, uuid, text, uuid[], text, jsonb) from public;
grant execute on function public.servidor_reativar_situacao(text), public.servidor_reativar_empresas(text, date, integer),
  public.servidor_combinam_registrar(text, date, uuid, text, uuid[], text, jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
