-- O vencimento com um toque (26/11/2026; Marcelo, com o "Torneiro mecânico" da Hidraulica Brasil, que venceu sem
-- ninguém perguntar se foi preenchida: "o anunciante foi alertado, perguntado se a vaga foi preenchida, se deseja
-- prorrogar?" e "qual é a solução?"). Pode rodar de novo.
--
-- Antes: os avisos do vencimento (2 dias antes, no dia e 7 dias depois) só tinham "Renovar a vaga", que pede para
-- entrar; a conta da Hidraulica não entra desde 19/10. E quem esperava numa vaga vencida não recebia nada.
--
-- 1. Cada vaga ganha um link de um toque, sem entrar (`/vaga-vence/<código>`). Os três avisos levam a ele, e o e-mail
--    traz os três botões: "Prorrogar por 30 dias", "Já preenchi" e "Não preciso mais". Abrir não responde nada: a
--    resposta é o toque na página (o leitor de e-mail que abre os links sozinho não conta).
-- 2. Prorrogar: a vaga volta ao ar pelo prazo de sempre (e conta como "continua aberta"). Já preenchi: tira do ar,
--    avisa quem esperava e, se alguém foi aceito, leva ao "Quem você contratou?" com os nomes. Não preciso mais:
--    encerra e avisa quem esperava (o aviso novo vaga_encerrada).
-- 3. Sete dias depois de vencer, sem prorrogar nem preencher: quem ainda esperava (candidatura sem resposta, ou aceita
--    sem chegar a Contratado ou Não seguiu) recebe o retorno, uma vez: a vaga saiu do ar sem retorno de quem publicou.

-- 1. O link de cada vaga ----------------------------------------------------------------------------------------------

create table if not exists privado.vencimento_links (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  token text not null unique,
  resposta text check (resposta in ('prorrogar', 'preenchi', 'encerrar')),
  respondida_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table privado.vencimento_links enable row level security;
revoke all on privado.vencimento_links from public, anon, authenticated;

comment on table privado.vencimento_links is
  'O vencimento com um toque (migração 20271010120000): o link sem entrar de cada vaga, para prorrogar, contar que preencheu ou encerrar.';

create or replace function privado.link_do_vencimento(p_anuncio uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  insert into privado.vencimento_links (anuncio_id, token)
  values (p_anuncio, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (anuncio_id) do nothing;
  select l.token into v_token from privado.vencimento_links l where l.anuncio_id = p_anuncio;
  return '/vaga-vence/' || v_token;
end
$$;

-- 2. O aviso novo para quem esperava: vaga_encerrada -----------------------------------------------------------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''vaga_encerrada''') = 0 then
    if strpos(d, '''vaga_suspensa''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem vaga_suspensa (rode antes a 20271008120000): %', d;
    end if;
    d := replace(d, '''vaga_suspensa''::text', '''vaga_suspensa''::text, ''vaga_encerrada''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''vaga_encerrada''') = 0 then
    antes := f;
    f := replace(f, '''vaga_suspensa'') then ''andamento''', '''vaga_suspensa'', ''vaga_encerrada'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei o vaga_suspensa no andamento';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''vaga_encerrada''') = 0 then
    antes := f;
    f := replace(f, '''demora_religada'', ''vaga_suspensa'') then',
                 '''demora_religada'', ''vaga_suspensa'', ''vaga_encerrada'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''vaga_suspensa'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id || ''/parecidas'')',
                 'when ''vaga_suspensa'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id || ''/parecidas'')'
                 || chr(10) || '                 when ''vaga_encerrada'' then coalesce(new.link, ''/anuncio/'' || new.anuncio_id || ''/parecidas'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do vaga_suspensa';
    end if;
    -- os três botões do vencimento no e-mail (o link de um toque está no aviso)
    antes := f;
    f := replace(f, '|| case when v_entrevista is null then ''{}''::jsonb else jsonb_build_object(''entrevista'', v_entrevista) end);',
                 '|| case when v_entrevista is null then ''{}''::jsonb else jsonb_build_object(''entrevista'', v_entrevista) end'
                 || chr(10) || '    -- o vencimento com um toque (migração 20271010120000): os três botões'
                 || chr(10) || '    || case when new.tipo in (''vaga_vence'', ''vaga_venceu'') and new.link like ''/vaga-vence/%'''
                 || chr(10) || '            then jsonb_build_object(''opcoes'', jsonb_build_array('
                 || chr(10) || '                   jsonb_build_object(''rotulo'', ''Prorrogar por 30 dias'', ''caminho'', new.link || ''?r=prorrogar''),'
                 || chr(10) || '                   jsonb_build_object(''rotulo'', ''Já preenchi'', ''caminho'', new.link || ''?r=preenchi'', ''tom'', ''secundario''),'
                 || chr(10) || '                   jsonb_build_object(''rotulo'', ''Não preciso mais'', ''caminho'', new.link || ''?r=encerrar'', ''tom'', ''secundario'')))'
                 || chr(10) || '            else ''{}''::jsonb end);');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o fim dos dados';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''vaga_encerrada''') = 0 then
    if strpos(t, '''vaga_suspensa''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''vaga_suspensa''::text]', '''vaga_suspensa''::text, ''vaga_encerrada''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('vaga_encerrada', 'usuarios', 73, 'A vaga foi encerrada',
     'Para quem se candidatou e esperava (migração 20271010120000): quem publicou encerrou a vaga ("Não preciso mais"), ou ela venceu há 7 dias sem retorno.',
     array['nome', 'titulo', 'motivo', 'link'],
     'A vaga “{{titulo}}” foi encerrada',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver vagas parecidas')
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

-- os e-mails do vencimento: o texto do botão principal e o que os três botões fazem
update public.modelos_email m
   set corpo = E'Oi, {{nome}}.\n\n{{motivo}}\n\nResponda com um toque, sem precisar entrar:\n• Prorrogar por 30 dias: a vaga volta (ou continua) no ar.\n• Já preenchi: a vaga sai do ar, quem esperava recebe o retorno e você conta quem contratou.\n• Não preciso mais: a vaga é encerrada e quem esperava recebe o retorno.',
       corpo_padrao = E'Oi, {{nome}}.\n\n{{motivo}}\n\nResponda com um toque, sem precisar entrar:\n• Prorrogar por 30 dias: a vaga volta (ou continua) no ar.\n• Já preenchi: a vaga sai do ar, quem esperava recebe o retorno e você conta quem contratou.\n• Não preciso mais: a vaga é encerrada e quem esperava recebe o retorno.',
       botao = case when m.botao = m.botao_padrao then 'Responder' else m.botao end,
       botao_padrao = 'Responder'
 where m.chave in ('vaga_vence', 'vaga_venceu') and m.corpo = m.corpo_padrao;

-- 3. O robô do vencimento: o link de um toque e o retorno de quem esperava -------------------------------------------

create or replace function public.servidor_avisar_vencimentos(p_chave text, p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  n integer := 0;
  v_texto text;
  v_tipo text;
  v_link text;
begin
  perform privado.exigir_servidor(p_chave);
  -- das 8h às 20h (quem venceu de madrugada recebe de manhã)
  if hora < 8 or hora >= 20 then
    return 0;
  end if;
  for r in
    with base as (
      select a.id, a.titulo, a.autor_id, a.expira_em,
             case
               when a.status = 'ativo' and a.expira_em > now() and a.expira_em <= now() + interval '2 days'
                    and a.expira_em - a.criado_em > interval '4 days' then 'antes'
               when a.status in ('ativo', 'expirado') and a.expira_em <= now()
                    and a.expira_em > now() - interval '2 days' then 'no_dia'
               when a.status in ('ativo', 'expirado') and a.expira_em <= now() - interval '7 days'
                    and a.expira_em > now() - interval '14 days' then 'depois'
             end as etapa
        from public.anuncios a
        join public.perfis p on p.id = a.autor_id
       where a.tipo = 'vaga'
         and a.status in ('ativo', 'expirado')
         and a.preenchida_em is null
         and a.expira_em between now() - interval '14 days' and now() + interval '2 days'
         and (p.suspenso_ate is null or p.suspenso_ate <= now())
    )
    select b.* from base b
     where b.etapa is not null
       and not exists (select 1 from privado.avisos_de_vencimento x
                        where x.anuncio_id = b.id and x.etapa = b.etapa and x.expira_em = b.expira_em)
       -- já publicou de novo uma vaga igual: nada a lembrar
       and not exists (select 1 from public.anuncios o
                        where o.autor_id = b.autor_id and o.id <> b.id and o.tipo = 'vaga'
                          and o.status in ('ativo', 'pausado', 'em_analise') and o.expira_em > now()
                          and lower(btrim(o.titulo)) = lower(btrim(b.titulo)))
     order by b.expira_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    v_link := privado.link_do_vencimento(r.id);
    if r.etapa = 'antes' then
      v_tipo := 'vaga_vence';
      v_texto := 'Sua vaga “' || r.titulo || '” sai do ar em '
                 || to_char(r.expira_em at time zone 'America/Sao_Paulo', 'DD/MM')
                 || '. Ainda está contratando? Prorrogue, conte que já preencheu ou encerre, com um toque.';
    elsif r.etapa = 'no_dia' then
      v_tipo := 'vaga_venceu';
      v_texto := 'Sua vaga “' || r.titulo || '” saiu do ar: o prazo acabou. Ainda precisa de gente? '
                 || 'Prorrogue com um toque. Se já preencheu, conte para quem esperava receber o retorno.';
    else
      v_tipo := 'vaga_venceu';
      v_texto := 'Sua vaga “' || r.titulo || '” está fora do ar desde '
                 || to_char(r.expira_em at time zone 'America/Sao_Paulo', 'DD/MM') || '. Se ainda está contratando, '
                 || 'prorrogue com um toque. Se já preencheu ou não precisa mais, conte: quem esperava recebe o retorno.';
      -- sete dias depois de vencer: quem ainda esperava recebe o retorno, uma vez
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
      select c.perfil_id, 'vaga_encerrada', r.id,
             left('A vaga “' || r.titulo || '” saiu do ar (o prazo acabou) sem retorno de quem publicou. Obrigado pelo '
                  || 'interesse! Veja vagas parecidas perto de você.', 300),
             '/anuncio/' || r.id || '/parecidas'
        from public.curtidas c
        left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
       where c.anuncio_id = r.id and c.status in ('pendente', 'match')
         and coalesce(e.etapa, 'novo') not in ('contratado', 'nao_seguiu')
         and not exists (select 1 from public.notificacoes x
                          where x.destinatario_id = c.perfil_id and x.anuncio_id = r.id
                            and x.tipo in ('vaga_encerrada', 'vaga_preenchida', 'dispensada'));
    end if;
    -- um aviso de vencimento por vaga no sino: o novo tira o anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.id and nt.tipo in ('vaga_vence', 'vaga_venceu');
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, v_tipo, r.id, v_texto, v_link);
    insert into privado.avisos_de_vencimento (anuncio_id, etapa, expira_em) values (r.id, r.etapa, r.expira_em)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- 4. A página do link: o que mostrar e a resposta --------------------------------------------------------------------

create or replace function public.vencimento_pelo_link(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'anuncio_id', a.id,
    'titulo', a.titulo,
    'empresa', p.nome,
    'empresa_foto', p.foto,
    'status', a.status,
    'expira_em', a.expira_em,
    'no_ar', a.status = 'ativo' and a.expira_em > now(),
    'preenchida', a.preenchida_em is not null,
    'removida', a.status = 'removido',
    'suspensa', exists (select 1 from privado.vagas_demora d
                         where d.anuncio_id = a.id and d.suspensa_em is not null and d.religada_em is null
                           and d.resolvida_em is null),
    'resposta', l.resposta,
    'respondida_em', l.respondida_em,
    'esperando', (select count(*) from public.curtidas c
                   left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
                   where c.anuncio_id = a.id and c.status in ('pendente', 'match')
                     and coalesce(e.etapa, 'novo') not in ('contratado', 'nao_seguiu')),
    'aceitos', (select count(*) from public.curtidas c
                 where c.anuncio_id = a.id and c.status = 'match' and c.perfil_id <> a.autor_id),
    'prazo_dias', extract(day from public.prazo_no_ar(a.tipo))::integer)
    from privado.vencimento_links l
    join public.anuncios a on a.id = l.anuncio_id
    join public.perfis p on p.id = a.autor_id
   where l.token = p_token and length(p_token) = 64
$$;

create or replace function public.responder_vencimento_pelo_link(p_token text, p_resposta text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l privado.vencimento_links;
  a public.anuncios;
  v_avisados integer := 0;
  v_expira timestamptz;
  v_quem_contratou text;
begin
  if p_resposta is null or p_resposta not in ('prorrogar', 'preenchi', 'encerrar') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  select * into l from privado.vencimento_links x where x.token = p_token and length(p_token) = 64;
  if not found then
    raise exception 'Este link não vale. Confira se abriu o link inteiro do e-mail.' using errcode = 'P0002';
  end if;
  select * into a from public.anuncios x where x.id = l.anuncio_id for update;
  if a.status in ('em_analise', 'removido') then
    raise exception 'Esta vaga está com a moderação do Publike. Responda depois que ela for liberada.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfis p where p.id = a.autor_id and p.suspenso_ate > now()) then
    raise exception 'A conta está suspensa.' using errcode = 'P0001';
  end if;

  if p_resposta = 'prorrogar' then
    if a.preenchida_em is not null then
      raise exception 'Esta vaga está marcada como preenchida. Para reabrir, publique de novo ou desmarque no painel.'
        using errcode = 'P0001';
    end if;
    if a.status not in ('ativo', 'expirado', 'encerrado') then
      raise exception 'Esta vaga está pausada. Para prorrogar, entre no Publike e reative pelo painel.'
        using errcode = 'P0001';
    end if;
    -- a vaga suspensa por falta de retorno não volta por aqui (o gatilho explica o que falta)
    update public.anuncios x set status = 'ativo', expira_em = now() + public.prazo_no_ar(x.tipo)
     where x.id = a.id
    returning x.expira_em into v_expira;
    -- prorrogar também confirma que a vaga continua aberta
    insert into privado.vagas_continua (anuncio_id, confirmada_em) values (a.id, now())
    on conflict (anuncio_id) do update set confirmada_em = now();
  elsif p_resposta = 'preenchi' then
    if a.preenchida_em is null then
      v_avisados := privado.marcar_preenchida_por(a.autor_id, a.id);
    end if;
    -- com alguém aceito: o "Quem você contratou?" com os nomes
    if exists (select 1 from public.curtidas c where c.anuncio_id = a.id and c.status = 'match' and c.perfil_id <> a.autor_id)
       and not exists (select 1 from privado.quem_contratou h where h.anuncio_id = a.id) then
      insert into privado.perguntas_quem_contratou (anuncio_id, autor_id, token)
      values (a.id, a.autor_id, encode(extensions.gen_random_bytes(32), 'hex'))
      on conflict (anuncio_id) do nothing;
      select '/quem-contratou/' || q.token into v_quem_contratou
        from privado.perguntas_quem_contratou q where q.anuncio_id = a.id;
    end if;
  else
    if a.status <> 'encerrado' then
      update public.anuncios x set status = 'encerrado' where x.id = a.id;
    end if;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    select c.perfil_id, 'vaga_encerrada', a.id, a.autor_id,
           left('A vaga “' || a.titulo || '” foi encerrada por quem publicou. Obrigado pelo interesse! '
                || 'Veja vagas parecidas perto de você.', 300),
           '/anuncio/' || a.id || '/parecidas'
      from public.curtidas c
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.anuncio_id = a.id and c.status in ('pendente', 'match')
       and coalesce(e.etapa, 'novo') not in ('contratado', 'nao_seguiu')
       and not exists (select 1 from public.notificacoes x
                        where x.destinatario_id = c.perfil_id and x.anuncio_id = a.id
                          and x.tipo in ('vaga_encerrada', 'vaga_preenchida', 'dispensada'));
    get diagnostics v_avisados = row_count;
  end if;

  update privado.vencimento_links x set resposta = p_resposta, respondida_em = now() where x.anuncio_id = a.id;
  -- o aviso do vencimento sai do sino: já respondeu
  delete from public.notificacoes nt
   where nt.destinatario_id = a.autor_id and nt.anuncio_id = a.id and nt.tipo in ('vaga_vence', 'vaga_venceu');
  return jsonb_build_object('resposta', p_resposta, 'expira_em', v_expira, 'avisados', v_avisados,
                            'quem_contratou', v_quem_contratou);
end
$$;

-- os avisos de vencimento que já estão no sino levam ao link de um toque
update public.notificacoes n
   set link = privado.link_do_vencimento(n.anuncio_id)
 where n.tipo in ('vaga_vence', 'vaga_venceu') and n.anuncio_id is not null
   and coalesce(n.link, '') not like '/vaga-vence/%'
   and exists (select 1 from public.anuncios a where a.id = n.anuncio_id and a.preenchida_em is null
                 and a.status in ('ativo', 'expirado'));

-- 5. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function privado.link_do_vencimento(uuid) from public, anon, authenticated;
revoke execute on function public.vencimento_pelo_link(text) from public;
grant execute on function public.vencimento_pelo_link(text) to anon, authenticated;
revoke execute on function public.responder_vencimento_pelo_link(text, text) from public;
grant execute on function public.responder_vencimento_pelo_link(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271010120000_vencimento_com_um_toque');
