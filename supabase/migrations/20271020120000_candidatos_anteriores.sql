-- Seus candidatos anteriores (claude/plano-concentrar-contratacoes.md, parte 2; 28/11/2026, Marcelo: "Pode fazer tudo").
-- O "Chamar de novo" (migração 20270305120000) mostrava só quem chegou ao aceite. Agora mostra também, com o
-- histórico, quem a empresa dispensou e quem ficou sem resposta: a empresa decide quem convidar. Fica de fora quem foi
-- dispensado porque faltou, quem desfez o match, quem está no banco de reserva, quem foi contratado, quem bloqueou ou
-- foi bloqueado e quem não deixa o currículo visível em Talentos. Ordem: finalista, entrevista, aceito, dispensado e
-- sem resposta; em cada um, o mais recente primeiro.

create or replace function public.candidatos_de_antes(p_anuncio uuid)
returns table (perfil_id uuid, nome text, foto text, cidade text, bairro text, vaga text, ate_onde text,
               candidatou_em timestamptz, convidado boolean, whatsapp text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  so_chat boolean;
begin
  select a.contato_por = 'chat' into so_chat
    from public.anuncios a where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga';
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
  with antes as (
    select c.perfil_id, a.titulo, c.criado_em as curtido_em, a.contato_por, c.status,
           case when c.status = 'dispensada' then 'dispensado'
                when c.status = 'pendente' and c.aceita_em is null then 'sem_resposta'
                when exists (select 1 from public.finalistas f where f.anuncio_id = c.anuncio_id and f.perfil_id = c.perfil_id) then 'finalista'
                when e.etapa = 'entrevista' or exists (select 1 from public.entrevistas x where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id) then 'entrevista'
                else 'match' end as ate_onde
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where a.autor_id = eu and a.tipo = 'vaga' and a.id <> p_anuncio
       and c.status in ('match', 'pendente', 'dispensada')
       and not (c.status = 'dispensada' and coalesce(c.motivo_saida, '') = 'faltou')
       and c.criado_em > now() - interval '6 months'
       and coalesce(e.etapa, 'novo') <> 'contratado'
  ),
  melhor as (
    select distinct on (x.perfil_id) x.*
      from antes x
     order by x.perfil_id,
              case x.ate_onde when 'finalista' then 0 when 'entrevista' then 1 when 'match' then 2
                              when 'dispensado' then 3 else 4 end,
              x.curtido_em desc
  )
  select m.perfil_id, p.nome, p.foto, p.cidade, p.bairro, m.titulo, m.ate_onde, m.curtido_em,
         exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = m.perfil_id),
         -- o WhatsApp só de quem deu match (o contato que a empresa já tinha), fora do "só pelo chat"
         case when not so_chat and m.contato_por <> 'chat' and m.status = 'match' then ct.whatsapp end
    from melhor m
    join public.perfis p on p.id = m.perfil_id
    join public.curriculo_visivel v on v.perfil_id = m.perfil_id
    left join public.contatos ct on ct.perfil_id = m.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and not privado.ha_bloqueio(eu, m.perfil_id)
     and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = m.perfil_id)
     -- quem já foi contratado por esta conta em outra vaga
     and not exists (select 1 from public.etapas_candidatos ec join public.anuncios aa on aa.id = ec.anuncio_id
                      where aa.autor_id = eu and ec.perfil_id = m.perfil_id and ec.etapa = 'contratado')
   order by case m.ate_onde when 'finalista' then 0 when 'entrevista' then 1 when 'match' then 2
                            when 'dispensado' then 3 else 4 end,
            m.curtido_em desc
   limit 50;
end
$$;
revoke all on function public.candidatos_de_antes(uuid) from public, anon;
grant execute on function public.candidatos_de_antes(uuid) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271020120000_candidatos_anteriores');
