-- O atendimento pelo WhatsApp, melhor (19/11/2026, de madrugada; claude/plano-whatsapp-atendimento.md). Pedido do
-- Marcelo: "Melhore tudo que for possível nessa funcionalidade, vou dormir".
--
--   * servidor_whatsapp_conversa_saida: o e-mail para a equipe leva as últimas 6 mensagens da conversa (antes, só a
--     última da pessoa), sem os botões entre colchetes. A janela grátis do anúncio só abre com uma resposta de verdade
--     (o "silêncio" da IA, que só guarda o que a pessoa quer, não abre).
--   * O modelo 'aviso_whatsapp_conversa' diz "As últimas mensagens" (só troca o texto que a equipe não mudou).
--   * admin_whatsapp_conversas: no resumo, as contas criadas pelos links do atendimento em 7 e 30 dias (a origem
--     'whatsapp:atendimento' de privado.origens, que os links do atendimento levam no utm); na lista, a última
--     mensagem sem os botões entre colchetes.
-- Pode rodar de novo.

-- 1. A resposta do Publike e o aviso à equipe -------------------------------------------------------------------------

create or replace function public.servidor_whatsapp_conversa_saida(
  p_chave text, p_conversa text, p_texto text, p_wamid text default null, p_perfil text default null,
  p_equipe boolean default false, p_motivo text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cv privado.whatsapp_conversas;
  v_respondeu boolean := btrim(coalesce(p_texto, '')) <> '';
  v_conversa text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cv from privado.whatsapp_conversas c where c.chave = p_conversa;
  if not found then
    return;
  end if;
  if v_respondeu then
    insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
    values (p_conversa, 'robo', left(btrim(p_texto), 4000), left(p_wamid, 200));
  end if;
  update privado.whatsapp_conversas c
     set perfil = case when p_perfil in ('trabalho', 'contratar') then p_perfil else c.perfil end,
         -- a primeira resposta depois do anúncio abre a janela grátis (até 7 dias)
         gratis_ate = case when v_respondeu and c.gratis_ate is null and c.origem_em > now() - interval '24 hours'
                           then now() + interval '7 days' else c.gratis_ate end,
         situacao = case when p_equipe then 'equipe' else c.situacao end,
         equipe_desde = case when p_equipe and c.situacao <> 'equipe' then now() else c.equipe_desde end,
         ultima_em = case when v_respondeu or p_equipe then now() else c.ultima_em end
   where c.chave = p_conversa;

  if p_equipe and (cv.equipe_avisada_em is null or cv.equipe_avisada_em < now() - interval '6 hours') then
    -- as últimas 6 mensagens, da mais antiga para a mais nova, sem os botões entre colchetes
    select left(string_agg(
             case x.de when 'pessoa' then coalesce(cv.nome, 'Pessoa') when 'equipe' then 'Equipe' else 'Publike' end
             || ': ' || left(regexp_replace(x.texto, '\s*\[Bot(ão|ões):[^\]]*\]\s*$', ''), 600),
             E'\n\n' order by x.criado_em, x.id), 4000)
      into v_conversa
      from (select m.id, m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
             where m.chave = p_conversa order by m.criado_em desc, m.id desc limit 6) x;
    update privado.whatsapp_conversas c set equipe_avisada_em = now() where c.chave = p_conversa;
    perform privado.avisar_equipe('aviso_whatsapp_conversa', jsonb_build_object(
      'quem', coalesce(cv.nome, 'Uma pessoa') || ' (final ' || right(cv.numero, 4) || ')',
      'motivo', coalesce(nullif(btrim(p_motivo), ''), 'a IA passou a conversa'),
      'mensagem', coalesce(v_conversa, '(sem texto)'),
      'caminho', '/admin/whatsapp?aba=conversas&c=' || p_conversa));
  end if;
end
$$;

revoke execute on function public.servidor_whatsapp_conversa_saida(text, text, text, text, text, boolean, text) from public;
grant execute on function public.servidor_whatsapp_conversa_saida(text, text, text, text, text, boolean, text)
  to anon, authenticated, service_role;

-- 2. O texto do e-mail (só troca o que a equipe não mudou) ------------------------------------------------------------

update public.modelos_email m
   set corpo = case when m.corpo = m.corpo_padrao then v.corpo else m.corpo end,
       corpo_padrao = v.corpo
  from (values (
    E'{{quem}} está conversando com o Publike pelo WhatsApp e precisa de alguém da equipe ({{motivo}}).\n\n'
      || E'As últimas mensagens:\n\n{{mensagem}}\n\nResponda em Admin › WhatsApp › Conversas. O atendimento automático '
      || 'fica quieto nesta conversa até a equipe devolver, ou por 24 horas sem resposta da equipe.'
  )) as v(corpo)
 where m.chave = 'aviso_whatsapp_conversa';

-- 3. Admin › WhatsApp › Conversas: as contas criadas pelo atendimento ------------------------------------------------
-- (a mesma função de 20270801120000; o resumo ganha contas_7_dias e contas_30_dias)

create or replace function public.admin_whatsapp_conversas(p_filtro text default 'todas')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ligado', coalesce((select c.atendimento_ligado from privado.config_whatsapp c where c.id), false),
    'por_dia', coalesce((select c.atendimento_por_dia from privado.config_whatsapp c where c.id), 30),
    'resumo', (select jsonb_build_object(
                 'conversas_7_dias', count(*) filter (where c.criado_em > now() - interval '7 days'),
                 'de_anuncio_7_dias', count(*) filter (where c.criado_em > now() - interval '7 days'
                                                         and c.origem is not null),
                 'com_a_equipe', count(*) filter (where c.situacao = 'equipe'),
                 'trabalho', count(*) filter (where c.perfil = 'trabalho'),
                 'contratar', count(*) filter (where c.perfil = 'contratar'),
                 'respostas_robo_7_dias', (select count(*) from privado.whatsapp_conversa_mensagens m
                                            where m.de = 'robo' and m.criado_em > now() - interval '7 days'),
                 'gratis_agora', count(*) filter (where c.gratis_ate > now()),
                 -- as contas criadas depois de abrir um link do atendimento (utm_source=whatsapp, utm_campaign=atendimento)
                 'contas_7_dias', (select count(*) from privado.origens o
                                    where o.origem like 'whatsapp:atendimento%'
                                      and o.criado_em > now() - interval '7 days'),
                 'contas_30_dias', (select count(*) from privado.origens o
                                     where o.origem like 'whatsapp:atendimento%'
                                       and o.criado_em > now() - interval '30 days'))
                 from privado.whatsapp_conversas c),
    'lista', coalesce((
      select jsonb_agg(x order by x->>'ultima_em' desc)
        from (select jsonb_build_object(
                       'chave', c.chave,
                       'nome', c.nome,
                       'final', right(c.numero, 4),
                       'perfil', c.perfil,
                       'situacao', c.situacao,
                       'origem', c.origem,
                       'gratis_ate', c.gratis_ate,
                       'janela_aberta', c.ultima_da_pessoa_em > now() - interval '24 hours',
                       'ultima_em', c.ultima_em,
                       'nao_vista', c.vista_em is null,
                       'conta', (select jsonb_build_object('id', k.id, 'nome', k.nome, 'tipo', k.tipo)
                                   from privado.conta_do_numero_whatsapp(c.chave) k),
                       -- a última mensagem, sem os botões entre colchetes do fim
                       'ultima', (select jsonb_build_object('de', m.de, 'texto', left(regexp_replace(m.texto,
                                           '\s*\[Bot(ão|ões):[^\]]*\]\s*$', ''), 160))
                                    from privado.whatsapp_conversa_mensagens m
                                   where m.chave = c.chave order by m.criado_em desc, m.id desc limit 1)) as x
                from privado.whatsapp_conversas c
               where case coalesce(p_filtro, 'todas')
                       when 'equipe' then c.situacao = 'equipe'
                       when 'anuncio' then c.origem is not null
                       when 'trabalho' then c.perfil = 'trabalho'
                       when 'contratar' then c.perfil = 'contratar'
                       else true end
               order by c.ultima_em desc
               limit 100) l), '[]'::jsonb));
end
$$;

revoke execute on function public.admin_whatsapp_conversas(text) from public, anon;
grant execute on function public.admin_whatsapp_conversas(text) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270805120000_whatsapp_atendimento_melhor');
