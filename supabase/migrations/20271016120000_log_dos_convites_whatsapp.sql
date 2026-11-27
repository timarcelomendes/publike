-- O registro do envio dos convites pelo WhatsApp do Publike em Admin › Convites (27/11/2026; Marcelo: "onde vejo o
-- log/eventos de envio?"): a situação do modelo na Meta (sem ele aprovado, nada sai e os prontos esperam) e os
-- últimos envios, com a falha ou o que a Meta disse da mensagem (enviada, entregue, lida, erro).

create or replace function public.admin_convites_whatsapp(p_ligado boolean default null, p_por_dia integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_convites_whatsapp;
begin
  perform privado.exigir_admin();
  if p_ligado is not null or p_por_dia is not null then
    update privado.config_convites_whatsapp x
       set ligado = coalesce(p_ligado, x.ligado),
           por_dia = coalesce(least(greatest(p_por_dia, 1), 2000), x.por_dia),
           atualizado_em = now()
     where x.id;
    perform privado.registrar('convites_whatsapp', 'config', 'convites_whatsapp',
                              case when p_ligado then 'ligou' when p_ligado = false then 'desligou' else 'teto' end,
                              jsonb_build_object('ligado', p_ligado, 'por_dia', p_por_dia));
  end if;
  select * into cfg from privado.config_convites_whatsapp x where x.id;
  return jsonb_build_object(
    'ligado', cfg.ligado,
    'por_dia', cfg.por_dia,
    'hoje', (select count(*) from privado.convites_whatsapp_envios e
              where e.falhou is null
                and e.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'total', (select count(*) from privado.convites_whatsapp_envios e where e.falhou is null),
    'contas', (select count(*) from privado.convites_whatsapp_envios e join public.convites c on c.id = e.convite_id
                where e.falhou is null and c.usuario_id is not null),
    'prontos', (select count(*) from public.convites c
                 where c.status = 'a_enviar' and c.usuario_id is null and c.tipo in ('empresa', 'agencia')
                   and coalesce(c.origem, '') in ('imagem', 'arquivo', 'indicacao')
                   and cardinality(c.whatsapp) > 0 and c.rascunho is not null
                   and not exists (select 1 from privado.convites_whatsapp_envios e where e.convite_id = c.id)),
    'indicados', (select count(*) from public.convites c where c.origem = 'indicacao'),
    'indicados_semana', (select count(*) from public.convites c where c.origem = 'indicacao'
                          and c.criado_em > now() - interval '7 days'),
    -- o modelo na Meta (APPROVED, PENDING, REJECTED...; null: ainda não foi cadastrado)
    'modelo', (select w.modelos -> 'publike_convite_vaga_pronta' ->> 'status' from privado.config_whatsapp w limit 1),
    -- o horário: das 9h às 18h, de segunda a sábado (o mesmo de servidor_convites_para_whatsapp)
    'no_horario', extract(isodow from now() at time zone 'America/Sao_Paulo') <> 7
                  and extract(hour from now() at time zone 'America/Sao_Paulo') between 9 and 17,
    -- as mudanças do envio (ligou, desligou, o teto), as 10 últimas
    'mudancas', (select coalesce(jsonb_agg(x order by x.em desc), '[]'::jsonb) from (
                   select r.criado_em as em, r.rotulo as acao, r.detalhes as dados
                     from public.registro_equipe r
                    where r.acao = 'convites_whatsapp'
                    order by r.criado_em desc limit 10) x),
    -- os últimos envios, com o que a Meta disse da mensagem
    'ultimos', (select coalesce(jsonb_agg(x order by x.em desc), '[]'::jsonb) from (
                  select e.criado_em as em, c.id as convite, c.nome, c.usuario_id is not null as virou_conta,
                         coalesce(nullif(btrim(c.rascunho ->> 'titulo'), ''), c.vagas[1]) as vaga,
                         right(e.numero, 4) as final, e.falhou,
                         m.status, m.status_em, m.status_erro
                    from privado.convites_whatsapp_envios e
                    join public.convites c on c.id = e.convite_id
                    left join lateral (select y.status, y.status_em, y.status_erro
                                         from privado.whatsapp_conversa_mensagens y
                                        where e.wamid is not null and y.wamid = e.wamid limit 1) m on true
                   order by e.criado_em desc limit 30) x));
end
$$;

select privado.migracao_aplicada('20271016120000_log_dos_convites_whatsapp');
