-- Mais gente com currículo (12/11/2026, claude/plano-mais-curriculos.md). Pedido do Marcelo, com o print de
-- Admin › Usuários cheio de "Sem currículo": "muita gente sem currículo, preciso melhorar esse indicador".
--
-- 1. O lembrete que sai sozinho: quem procura trabalho e está sem currículo recebe o e-mail e o aviso no sino
--    2 horas depois de criar a conta e, se continuar sem, mais uma vez 3 dias depois (no máximo 2, das 8h às 20h).
--    Se curtiu uma vaga, o texto cita a vaga e quem publicou. É um convite do Publike: vale a opção "Convites do
--    Publike" de Preferências › Avisos (só e-mail, como os outros convites) e tem o "parar de receber".
--    Começa pelas contas da última semana; as mais antigas continuam com o convite de Admin › E-mails.
-- 2. Os números do admin: em Admin › Usuários, o que cada pessoa sem currículo fez (curtidas, matches, lembretes);
--    na aba Cadastro do Painel, de cada semana de contas novas, quantas fizeram o currículo em até 7 dias.
-- Pode rodar de novo.

-- 1a. Quem já recebeu o lembrete -----------------------------------------------------------------------------------
create table if not exists privado.lembretes_curriculo (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  vezes smallint not null default 0 check (vezes between 0 and 2),
  ultimo_em timestamptz,
  -- a vaga citada no último lembrete (sem vaga curtida, null)
  anuncio_id uuid references public.anuncios (id) on delete set null
);
alter table privado.lembretes_curriculo enable row level security;

-- 1b. O e-mail (o texto fica em Admin › E-mails, para mudar) -------------------------------------------------------
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('lembrete_curriculo', 'usuarios', 23, 'Lembrete: fazer o currículo',
     'Para quem procura trabalho e está sem currículo: 2 horas depois de criar a conta e, se continuar sem, 3 dias depois (no máximo 2). Se a pessoa curtiu uma vaga, cita a vaga.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Falta o seu currículo no Publike',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nDá para fazer em uns 3 minutos, do jeito mais fácil para você:\n\n• Contar falando: você conta o que já fez, e o Publike preenche.\n• Mandar a foto do currículo de papel.\n• Mandar o PDF do currículo.\n\nCom o currículo salvo, as empresas da região também acham você na aba Talentos.',
     'Fazer meu currículo')
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

-- 1c. O lembrete é um convite do Publike: a mesma função de 20270322120000_conquistas.sql, com 'lembrete_curriculo'
-- no grupo "convites" (a opção de Preferências › Avisos e o "parar de receber")
CREATE OR REPLACE FUNCTION privado.grupo_do_aviso(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao',
                    'comentario', 'comentario_resposta', 'conquista_pergunta', 'conquista_confirmar', 'conquista_parabens') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo', 'indicacao') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar', 'resumo_vagas') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine', 'lembrete_curriculo') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$function$;

-- 1d. O lembrete (a tarefa das filas, a cada 5 minutos) ------------------------------------------------------------
create or replace function privado.lembrar_curriculos(p_agora timestamptz default now(), p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from p_agora at time zone 'America/Sao_Paulo');
  c record;
  v_anuncio uuid;
  v_titulo text;
  v_empresa text;
  v_motivo text;
  v_aviso text;
  v_caminho text;
  n integer := 0;
begin
  -- de madrugada e à noite, nada (fica para a próxima rodada das 8h)
  if v_hora < 8 or v_hora >= 20 then
    return 0;
  end if;

  for c in
    select p.id, coalesce(l.vezes, 0) as vezes
      from public.perfis p
      left join privado.modos_da_conta m on m.conta_id = p.id
      left join privado.lembretes_curriculo l on l.perfil_id = p.id
     where p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate <= p_agora)
       and (m.modos is null or 'trabalhar' = any (m.modos))
       and not exists (select 1 from public.curriculos cv where cv.perfil_id = p.id)
       -- a equipe fica de fora
       and not exists (select 1 from public.moderadores mo where mo.perfil_id = p.id)
       and not exists (select 1 from privado.painel_no_site ps where ps.usuario_id = p.id)
       and (
         -- o primeiro: 2 horas depois da conta criada (só as contas da última semana)
         (coalesce(l.vezes, 0) = 0 and p.criado_em between p_agora - interval '7 days' and p_agora - interval '2 hours')
         -- o segundo: 3 dias depois do primeiro, se continua sem currículo
         or (l.vezes = 1 and l.ultimo_em < p_agora - interval '3 days' and p.criado_em > p_agora - interval '30 days')
       )
     order by p.criado_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    -- a vaga mais recente que a pessoa curtiu e que ainda espera a resposta (ou já deu match)
    v_anuncio := null;
    v_titulo := null;
    v_empresa := null;
    select a.id, a.titulo,
           case when a.contratante_confidencial then 'a empresa'
                else coalesce(nullif(btrim(a.contratante), ''), pa.nome, 'a empresa') end
      into v_anuncio, v_titulo, v_empresa
      from public.curtidas cu
      join public.anuncios a on a.id = cu.anuncio_id and a.tipo = 'vaga'
      left join public.perfis pa on pa.id = a.autor_id
     where cu.perfil_id = c.id and cu.status in ('pendente', 'match')
     order by cu.criado_em desc
     limit 1;

    if v_anuncio is not null then
      v_motivo := case when c.vezes = 0
                       then 'Você se candidatou a “' || v_titulo || '”. Sem currículo, ' || v_empresa
                            || ' vê só o seu nome e a sua foto.'
                       else 'Você se candidatou a “' || v_titulo || '” e ainda está sem currículo: ' || v_empresa
                            || ' vê só o seu nome e a sua foto.' end;
      v_aviso := 'Falta o seu currículo: sem ele, ' || v_empresa || ' vê só o seu nome em “' || v_titulo
                 || '”. Leva uns 3 minutos.';
      -- depois de salvar, a página do currículo volta para a vaga
      v_caminho := '/perfil/curriculo?next=%2Fanuncio%2F' || v_anuncio;
    else
      v_motivo := 'Você criou a sua conta no Publike, mas ainda está sem currículo. Sem ele, as empresas não acham '
                  || 'você na aba Talentos, e quem recebe a sua candidatura vê só o seu nome.';
      v_aviso := 'Falta o seu currículo: sem ele, as empresas não acham você. Leva uns 3 minutos.';
      v_caminho := '/perfil/curriculo';
    end if;

    -- no sino, um convite do currículo de cada vez: o novo tira o anterior (e o do convite de Admin › E-mails)
    delete from public.notificacoes nt where nt.destinatario_id = c.id and nt.tipo = 'convite_curriculo';
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (c.id, 'convite_curriculo', v_anuncio, v_aviso, v_caminho);
    -- o e-mail (o do sino não manda e-mail: os convites ficam fora do gatilho dos e-mails)
    perform privado.enfileirar_email(c.id, 'lembrete_curriculo', jsonb_build_object(
      'motivo', v_motivo,
      'titulo', coalesce(v_titulo, ''),
      'quem', coalesce(v_empresa, ''),
      'caminho', v_caminho));

    insert into privado.lembretes_curriculo (perfil_id, vezes, ultimo_em, anuncio_id)
    values (c.id, c.vezes + 1, p_agora, v_anuncio)
    on conflict (perfil_id) do update
      set vezes = excluded.vezes, ultimo_em = excluded.ultimo_em, anuncio_id = excluded.anuncio_id;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function privado.lembrar_curriculos(timestamptz, integer) from public, anon, authenticated;

create or replace function public.servidor_lembrar_curriculos(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.lembrar_curriculos();
end
$$;
revoke execute on function public.servidor_lembrar_curriculos(text) from public;
grant execute on function public.servidor_lembrar_curriculos(text) to anon, authenticated, service_role;

-- 2a. Admin › Usuários: o que cada pessoa da página fez (as vagas que curtiu, os matches e os lembretes) ------------
create or replace function public.admin_curriculo_das_contas(p_ids uuid[])
returns table (perfil_id uuid, curtidas integer, matches integer, lembretes integer, lembrete_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select x.id,
         (select count(*)::integer from public.curtidas cu
            join public.anuncios a on a.id = cu.anuncio_id and a.tipo = 'vaga'
           where cu.perfil_id = x.id),
         (select count(*)::integer from public.curtidas cu
            join public.anuncios a on a.id = cu.anuncio_id and a.tipo = 'vaga'
           where cu.perfil_id = x.id and cu.status = 'match'),
         coalesce(l.vezes, 0)::integer,
         l.ultimo_em
    from (select distinct u.id from unnest(coalesce(p_ids, '{}'::uuid[])) as u (id) limit 200) x
    left join privado.lembretes_curriculo l on l.perfil_id = x.id;
end
$$;
revoke execute on function public.admin_curriculo_das_contas(uuid[]) from public, anon;
grant execute on function public.admin_curriculo_das_contas(uuid[]) to authenticated, service_role;

-- 2b. Painel › Cadastro: de cada semana de contas novas de quem procura trabalho, quantas fizeram o currículo -------
create or replace function public.admin_curriculos_por_semana(p_semanas integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atual date := date_trunc('week', v_hoje)::date;
  v_inicio date := date_trunc('week', v_hoje)::date - (least(greatest(coalesce(p_semanas, 8), 2), 26) - 1) * 7;
begin
  perform privado.exigir_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'semana', s.semana,
             'pessoas', x.pessoas,
             'em_7_dias', x.em_7_dias,
             'com_curriculo', x.com_curriculo,
             'lembradas', x.lembradas,
             -- os 7 dias de todas as contas da semana já passaram: o número não muda mais
             'fechada', s.semana + 14 <= v_hoje
           ) order by s.semana desc)
      from (select g::date as semana from generate_series(v_inicio::timestamp, v_atual::timestamp, interval '1 week') g) s
      cross join lateral (
        select count(*)::integer as pessoas,
               count(*) filter (where cv.criado_em <= p.criado_em + interval '7 days')::integer as em_7_dias,
               count(cv.perfil_id)::integer as com_curriculo,
               count(l.perfil_id)::integer as lembradas
          from public.perfis p
          left join privado.modos_da_conta m on m.conta_id = p.id
          left join public.curriculos cv on cv.perfil_id = p.id
          left join privado.lembretes_curriculo l on l.perfil_id = p.id
         where p.tipo = 'pessoa'
           and (m.modos is null or 'trabalhar' = any (m.modos))
           and p.criado_em >= (s.semana::timestamp at time zone 'America/Sao_Paulo')
           and p.criado_em < ((s.semana + 7)::timestamp at time zone 'America/Sao_Paulo')
           and not exists (select 1 from public.moderadores mo where mo.perfil_id = p.id)
           and not exists (select 1 from privado.painel_no_site ps where ps.usuario_id = p.id)
      ) x
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.admin_curriculos_por_semana(integer) from public, anon;
grant execute on function public.admin_curriculos_por_semana(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
