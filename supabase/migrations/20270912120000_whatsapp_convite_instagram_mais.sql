-- O convite do Instagram para mais gente, e a entrega das mensagens da conversa (22/11/2026; Marcelo: "faz", sobre
-- "mandar para quem recebeu vagas em qualquer momento, até 22 horas depois da última mensagem, e também para quem parou
-- no currículo"). Na 20270911120000, o convite só saía quando a última mensagem do Publike tinha link de vaga e tinha
-- menos de 6 horas: às 19h43 de 22/11 saiu para 15 pessoas, e 30 ficaram de fora. Agora:
--   - vale quem recebeu link de vaga em qualquer momento da conversa;
--   - vale até 22 horas depois da última mensagem da pessoa (a janela da Meta é de 24);
--   - a última mensagem do Publike pode ser qualquer uma; se ela pergunta alguma coisa (o currículo pelo WhatsApp, "me
--     conta o que você faz"), o convite espera 2 horas sem resposta, para não atropelar a conversa.
-- E a entrega: a resposta da Meta (entregue, lida, falhou) passa a ficar também na mensagem da conversa, como já ficava
-- nos avisos da fila. Pode rodar de novo.

alter table privado.whatsapp_conversa_mensagens add column if not exists status text;
alter table privado.whatsapp_conversa_mensagens add column if not exists status_em timestamptz;
alter table privado.whatsapp_conversa_mensagens add column if not exists status_erro text;
create index if not exists whatsapp_conversa_mensagens_wamid_idx
  on privado.whatsapp_conversa_mensagens (wamid) where wamid is not null;

-- a resposta da Meta: os avisos da fila (como antes) e as mensagens da conversa
create or replace function public.servidor_whatsapp_status(
  p_chave text, p_wamid text, p_status text, p_erro text default null, p_cobrada boolean default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fila boolean;
  v_conversa boolean;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.fila_whatsapp f
     set situacao = case
                      when p_status = 'failed' then 'falhou'
                      when p_status = 'read' then 'lida'
                      when p_status = 'delivered' and f.situacao <> 'lida' then 'entregue'
                      else f.situacao end,
         entregue_em = case when p_status in ('delivered', 'read') then coalesce(f.entregue_em, now()) else f.entregue_em end,
         lida_em = case when p_status = 'read' then coalesce(f.lida_em, now()) else f.lida_em end,
         motivo = case when p_status = 'failed' then left(coalesce(p_erro, 'a Meta não entregou'), 300) else f.motivo end,
         cobrada = coalesce(p_cobrada, f.cobrada)
   where f.wamid = p_wamid;
  v_fila := found;
  -- na conversa: a lida não volta para entregue (a Meta pode mandar fora de ordem)
  update privado.whatsapp_conversa_mensagens m
     set status = case
                    when p_status = 'failed' then 'falhou'
                    when p_status = 'read' then 'lida'
                    when p_status = 'delivered' and coalesce(m.status, '') <> 'lida' then 'entregue'
                    when p_status = 'sent' and m.status is null then 'enviada'
                    else m.status end,
         status_em = now(),
         status_erro = case when p_status = 'failed' then left(coalesce(p_erro, 'a Meta não entregou'), 300) else m.status_erro end
   where m.wamid = p_wamid and m.de <> 'pessoa';
  v_conversa := found;
  return v_fila or v_conversa;
end
$$;

-- Quem recebe o convite agora (p_marcas_ok: as marcas dos links de vaga)
create or replace function public.servidor_whatsapp_convite_instagram(p_chave text, p_marca text, p_marcas_ok text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
  v_teto integer := coalesce((select c.atendimento_teto_mes from privado.config_whatsapp c where c.id), 0);
  v_minutos integer;
begin
  perform privado.exigir_servidor(p_chave);
  select c.instagram_minutos into v_minutos from privado.config_whatsapp c
   where c.id and c.ativo and c.atendimento_ligado and c.instagram_convite;
  if v_minutos is null or v_hora < 8 or v_hora >= 21 or coalesce(p_marca, '') = ''
     or coalesce(array_length(p_marcas_ok, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  if v_teto > 0 and privado.whatsapp_respostas_do_mes() >= v_teto then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chave', x.chave, 'numero', x.numero))
      from (
        select c.chave, c.numero
          from privado.whatsapp_conversas c
          join lateral (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                         where m.chave = c.chave order by m.criado_em desc limit 1) u on true
         where c.situacao = 'robo'
           and c.perfil = 'trabalho'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           -- uma pergunta do Publike sem resposta: espera 2 horas; o resto, os minutos do Admin
           and u.criado_em < now() - case when strpos(u.texto, '?') > 0 then interval '2 hours'
                                          else make_interval(mins => v_minutos) end
           -- já recebeu link de vaga em algum momento da conversa
           and exists (select 1 from privado.whatsapp_conversa_mensagens m, unnest(p_marcas_ok) mm
                        where m.chave = c.chave and m.de = 'robo' and coalesce(mm, '') <> '' and strpos(m.texto, mm) > 0)
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and strpos(m.texto, p_marca) > 0)
         order by u.criado_em
         limit 20
      ) x), '[]'::jsonb);
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270912120000_whatsapp_convite_instagram_mais');
