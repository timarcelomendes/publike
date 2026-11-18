-- O WhatsApp na linha do tempo das curtidas (18/11/2026). Pedido do Marcelo: "Quero saber aqui quando a empresa ou o
-- candidato recebeu WhatsApp pela a api"; escolheu Admin › WhatsApp (a lista das últimas mensagens, que já tinha os
-- dados) e "exibir também na tela de curtidas, na linha do tempo" (claude/plano-whatsapp-oficial.md).
--
-- admin_whatsapp_das_curtidas: os avisos do WhatsApp de cada curtida dos anúncios, para quem publicou ('empresa') e
-- para quem curtiu ('pessoa'), com a hora em que saíram, chegaram no celular e foram lidos. Nunca o número. Só a equipe
-- do Publike, como em Admin › WhatsApp (a moderação de fora não vê). Que curtida cada aviso conta:
--   * para quem curtiu: os avisos dele sobre o anúncio (o convite do pacote, o match, o retorno, as perguntas, a
--     entrevista, a mensagem do chat);
--   * para quem publicou: os avisos do anúncio sobre quem curtiu (a candidatura nova, "ainda espera o retorno",
--     "começou a trabalhar?", a mensagem do chat). A candidatura nova junta as da mesma vaga numa mensagem só: as que
--     entraram juntas (`junto`) são as próximas curtidas da vaga enquanto a mensagem esperava para sair, até `quantos`
--     (só entra junto quem curtiu com ela na fila). O lembrete "pessoas esperam a sua resposta" conta as curtidas que
--     ele lembrou (privado.lembretes_curtida, gravadas na mesma hora).
-- Pode rodar de novo.

-- a fila por anúncio (a linha do tempo lê pelos anúncios das curtidas)
create index if not exists fila_whatsapp_anuncio_idx on privado.fila_whatsapp (anuncio_id)
  where anuncio_id is not null;

create or replace function public.admin_whatsapp_das_curtidas(p_anuncios uuid[])
returns table (id bigint, anuncio_id uuid, perfil_id uuid, lado text, tipo text, situacao text, quantos integer,
               junto boolean, criado_em timestamptz, enviar_depois_de timestamptz, enviando_em timestamptz,
               enviada_em timestamptz, entregue_em timestamptz, lida_em timestamptz, resposta text,
               respondida_em timestamptz, motivo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê o WhatsApp.' using errcode = '42501';
  end if;
  return query
  with c as (
    select cu.anuncio_id, cu.perfil_id, cu.criado_em, a.autor_id
      from public.curtidas cu
      join public.anuncios a on a.id = cu.anuncio_id
     where cu.anuncio_id = any ((coalesce(p_anuncios, '{}'))[1:1000])
  ), f as (
    select w.*
      from privado.fila_whatsapp w
     where w.anuncio_id = any ((coalesce(p_anuncios, '{}'))[1:1000])
  ), ligadas as (
    -- para quem curtiu: os avisos dele sobre o anúncio
    select f.id as fila_id, c.anuncio_id as anuncio, c.perfil_id as perfil, 'pessoa'::text as para, false as juntou
      from f
      join c on c.anuncio_id = f.anuncio_id and c.perfil_id = f.conta_id
    union all
    -- para quem publicou, sobre quem curtiu (o lembrete conta pelas curtidas que lembrou, logo abaixo)
    select f.id, c.anuncio_id, c.perfil_id, 'empresa', false
      from f
      join c on c.anuncio_id = f.anuncio_id and c.autor_id = f.conta_id and c.perfil_id = f.ator_id
     where f.tipo <> 'lembrete_curtida'
    union all
    -- a candidatura nova que juntou outras: as próximas curtidas da vaga enquanto ela esperava para sair
    select f.id, x.anuncio_id, x.perfil_id, 'empresa', true
      from f
      cross join lateral (
        select c.anuncio_id, c.perfil_id
          from c
         where c.anuncio_id = f.anuncio_id and c.autor_id = f.conta_id
           and c.perfil_id is distinct from f.ator_id
           and c.criado_em >= f.criado_em
           and c.criado_em < coalesce(f.enviando_em, 'infinity'::timestamptz)
         order by c.criado_em
         limit greatest(f.quantos - 1, 0)) x
     where f.tipo = 'curtida' and f.quantos > 1
    union all
    -- o lembrete de quem espera resposta: as curtidas que ele lembrou
    select f.id, c.anuncio_id, c.perfil_id, 'empresa', false
      from f
      join c on c.anuncio_id = f.anuncio_id and c.autor_id = f.conta_id
     where f.tipo = 'lembrete_curtida'
       and exists (select 1 from privado.lembretes_curtida lc
                    where lc.anuncio_id = c.anuncio_id and lc.perfil_id = c.perfil_id and lc.etapa in ('24h', '72h')
                      and lc.enviado_em between f.criado_em - interval '1 minute' and f.criado_em + interval '1 minute')
  )
  select f.id, l.anuncio, l.perfil, l.para, f.tipo, f.situacao, f.quantos, l.juntou, f.criado_em, f.enviar_depois_de,
         f.enviando_em, f.enviada_em, f.entregue_em, f.lida_em, f.resposta, f.respondida_em, f.motivo
    from ligadas l
    join f on f.id = l.fila_id
   order by l.anuncio, l.perfil, f.criado_em;
end
$$;
revoke execute on function public.admin_whatsapp_das_curtidas(uuid[]) from public, anon;
grant execute on function public.admin_whatsapp_das_curtidas(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270719120000_whatsapp_na_linha_do_tempo');
