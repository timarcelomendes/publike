-- As contas dos anúncios do Instagram (19/11/2026; Marcelo, com o quadro "De onde vêm as contas": "parece que as
-- campanhas do Instagram não apareceram aqui"). Os anúncios do Instagram e do Facebook são de clique para o WhatsApp: a
-- pessoa conversa com o atendimento e abre o site por um link dele, que levava utm_source=whatsapp&utm_campaign=
-- atendimento. A conta entrava como "Atendimento pelo WhatsApp" (ou sem campanha), e o anúncio sumia.
--
-- Agora:
--   * os links do atendimento, para quem chegou por um anúncio (o `referral` da Meta, `whatsapp_conversas.origem`),
--     levam utm_source=meta-ads&utm_campaign=ig-whatsapp (fb-whatsapp, meta-whatsapp), que conta em Anúncios pagos;
--   * aqui, também as contas de antes: a conta cujo WhatsApp (em `contatos`) tem uma conversa que veio de um anúncio,
--     começada antes da conta, conta no anúncio, quando não tinha campanha ou tinha só a do atendimento. Outra campanha
--     (o Google, um convite) continua valendo. Só a leitura muda: `privado.origens` fica como está.
--
-- Pode rodar de novo.

create or replace function public.admin_origens(p_desde timestamptz default null)
returns table(origem text, campanha boolean, contas bigint, publicaram_vaga bigint, publicaram_servico bigint,
              anuncios_no_ar bigint, primeira timestamptz, ultima timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
    with contas as (
      select u.id,
             case
               when an.rede is not null and (o.origem is null or o.origem like 'whatsapp:atendimento%')
                 then 'meta-ads:' || an.rede || '-whatsapp'
               else coalesce(o.origem, o.chegada, 'sem-registro')
             end as origem,
             (o.origem is not null or an.rede is not null) as campanha,
             u.created_at
        from auth.users u
        left join privado.origens o on o.usuario_id = u.id
        -- a conversa do WhatsApp que veio de um anúncio, começada antes da conta
        left join lateral (
          select case
                   when cv.origem->>'link' ilike '%instagram%' then 'ig'
                   when cv.origem->>'link' ilike '%facebook%' or cv.origem->>'link' ilike '%fb.%' then 'fb'
                   else 'meta'
                 end as rede
            from public.contatos ct
            join privado.whatsapp_conversas cv on cv.chave = privado.chave_do_numero(ct.whatsapp)
           where ct.perfil_id = u.id
             and ct.whatsapp is not null
             and cv.origem is not null
             and cv.criado_em <= u.created_at
           limit 1) an on true
       where p_desde is null or u.created_at >= p_desde
    )
    select c.origem,
           c.campanha,
           count(*),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = c.id and a.tipo = 'vaga')),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = c.id and a.tipo = 'servico')),
           coalesce(sum((select count(*) from public.anuncios a where a.autor_id = c.id and a.status = 'ativo')), 0)::bigint,
           min(c.created_at),
           max(c.created_at)
      from contas c
     group by c.origem, c.campanha
     order by (c.origem = 'sem-registro'), (c.origem = 'direto'), count(*) desc;
end
$$;
revoke execute on function public.admin_origens(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_origens(timestamptz) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270811120000_origem_anuncio_whatsapp');
