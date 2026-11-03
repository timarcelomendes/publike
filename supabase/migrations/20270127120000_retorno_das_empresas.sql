-- Admin › Retorno: quem deu retorno aos candidatos. Para cada empresa (quem publica vagas), quantas candidaturas
-- recebeu, quantas viu, quantas respondeu (aceitou, dispensou, mudou de etapa ou mandou mensagem), quantas estão
-- sem resposta (e há mais de 3 dias), quantas tiveram contato depois (mensagem no Publike ou o WhatsApp aberto) e o
-- tempo até responder. E, de uma empresa, cada candidatura. Só o admin (service_role). Pode rodar de novo.
--
-- O WhatsApp e o telefone abrem fora do Publike: até agora não ficava registro. registrar_contato_candidato guarda
-- que a empresa tocou no botão (no histórico da candidatura, "contato:whatsapp"), uma vez por hora no máximo. Não é
-- prova de que conversaram, mas é o sinal mais perto disso.

create or replace function public.registrar_contato_candidato(p_anuncio uuid, p_perfil uuid, p_canal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_canal is null or p_canal not in ('whatsapp', 'telefone', 'email') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  -- só quem publicou a vaga (ou a equipe dela) e só de quem se candidatou
  if not exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                  where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil
                    and a.autor_id = public.conta_atual()) then
    return;
  end if;
  if exists (select 1 from privado.historico_etapas h
              where h.anuncio_id = p_anuncio and h.perfil_id = p_perfil
                and h.o_que = 'contato:' || p_canal and h.em > now() - interval '1 hour') then
    return;
  end if;
  insert into privado.historico_etapas (anuncio_id, perfil_id, o_que) values (p_anuncio, p_perfil, 'contato:' || p_canal);
end
$$;
revoke execute on function public.registrar_contato_candidato(uuid, uuid, text) from public, anon;
grant execute on function public.registrar_contato_candidato(uuid, uuid, text) to authenticated;

-- cada candidatura a vaga, com o que a empresa fez (a base das duas consultas do admin)
create or replace function privado.retorno_das_candidaturas(p_desde timestamptz, p_conta uuid)
returns table (
  anuncio_id uuid,
  perfil_id uuid,
  autor_id uuid,
  status text,
  etapa text,
  criado_em timestamptz,
  respondida_em timestamptz,
  vista_em timestamptz,
  mensagens bigint,
  ultima_mensagem timestamptz,
  contato_em timestamptz,
  avisada boolean,
  respondida boolean,
  com_contato boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select cu.anuncio_id, cu.perfil_id, a.autor_id, cu.status, cu.criado_em, cu.respondida_em
      from public.curtidas cu
      join public.anuncios a on a.id = cu.anuncio_id
     where a.tipo = 'vaga'
       and (p_desde is null or cu.criado_em >= p_desde)
       and (p_conta is null or a.autor_id = p_conta)
  ), x as (
    select c.*,
           (select e.etapa from public.etapas_candidatos e
             where e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id) as etapa,
           (select v.vista_em from privado.candidaturas_vistas v
             where v.anuncio_id = c.anuncio_id and v.perfil_id = c.perfil_id) as vista_em,
           -- as mensagens da empresa (ou da equipe dela) para a pessoa: na conversa da vaga ou na conversa direta
           (select count(*) from public.mensagens m
             where m.autor_id <> c.perfil_id
               and ((m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id)
                    or (m.conversa_id in (select cv.id from public.conversas cv
                                           where (cv.conta_a = c.autor_id and cv.conta_b = c.perfil_id)
                                              or (cv.conta_b = c.autor_id and cv.conta_a = c.perfil_id))
                        and m.criado_em >= c.criado_em))) as mensagens,
           (select max(m.criado_em) from public.mensagens m
             where m.autor_id <> c.perfil_id
               and ((m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id)
                    or (m.conversa_id in (select cv.id from public.conversas cv
                                           where (cv.conta_a = c.autor_id and cv.conta_b = c.perfil_id)
                                              or (cv.conta_b = c.autor_id and cv.conta_a = c.perfil_id))
                        and m.criado_em >= c.criado_em))) as ultima_mensagem,
           (select min(h.em) from privado.historico_etapas h
             where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id and h.o_que like 'contato:%') as contato_em,
           -- a pessoa recebeu o aviso do match, da etapa ou da dispensa (o retorno automático)
           exists (select 1 from public.notificacoes n
                    where n.destinatario_id = c.perfil_id and n.anuncio_id = c.anuncio_id
                      and n.tipo in ('match', 'dispensada', 'etapa', 'entrevista', 'contratacao')) as avisada
      from c
  )
  select x.anuncio_id, x.perfil_id, x.autor_id, x.status, x.etapa, x.criado_em, x.respondida_em, x.vista_em,
         x.mensagens, x.ultima_mensagem, x.contato_em, x.avisada,
         (x.status <> 'pendente' or coalesce(x.etapa, 'novo') <> 'novo' or x.mensagens > 0) as respondida,
         (x.mensagens > 0 or x.contato_em is not null) as com_contato
    from x
$$;
revoke execute on function privado.retorno_das_candidaturas(timestamptz, uuid) from public, anon, authenticated;

-- por empresa: as que mais deixam gente sem resposta primeiro
create or replace function public.admin_retorno_empresas(p_desde timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select * from privado.retorno_das_candidaturas(p_desde, null)),
  e as (
    select r.autor_id,
           count(*) as candidaturas,
           count(*) filter (where r.vista_em is not null) as vistas,
           count(*) filter (where r.respondida) as respondidas,
           count(*) filter (where r.status in ('match', 'desfeito')) as aceitas,
           count(*) filter (where r.status = 'dispensada' or r.etapa = 'nao_seguiu') as dispensadas,
           count(*) filter (where not r.respondida) as sem_resposta,
           count(*) filter (where not r.respondida and r.criado_em < now() - interval '3 days') as atrasadas,
           count(*) filter (where r.com_contato) as com_contato,
           count(*) filter (where r.status in ('match', 'desfeito') and not r.com_contato) as aceitas_sem_contato,
           percentile_cont(0.5) within group (
             order by extract(epoch from (r.respondida_em - r.criado_em)) / 3600.0)
             filter (where r.respondida_em >= r.criado_em) as horas_resposta,
           max(greatest(r.respondida_em, r.ultima_mensagem, r.contato_em)) as ultima_acao
      from r
     group by r.autor_id
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object(
                'candidaturas', coalesce(sum(e.candidaturas), 0),
                'respondidas', coalesce(sum(e.respondidas), 0),
                'sem_resposta', coalesce(sum(e.sem_resposta), 0),
                'atrasadas', coalesce(sum(e.atrasadas), 0),
                'com_contato', coalesce(sum(e.com_contato), 0),
                'aceitas', coalesce(sum(e.aceitas), 0),
                'aceitas_sem_contato', coalesce(sum(e.aceitas_sem_contato), 0),
                'empresas', count(*)) from e),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object(
                  'conta_id', e.autor_id, 'nome', p.nome, 'tipo', p.tipo,
                  'candidaturas', e.candidaturas, 'vistas', e.vistas, 'respondidas', e.respondidas,
                  'aceitas', e.aceitas, 'dispensadas', e.dispensadas, 'sem_resposta', e.sem_resposta,
                  'atrasadas', e.atrasadas, 'com_contato', e.com_contato,
                  'aceitas_sem_contato', e.aceitas_sem_contato,
                  'horas_resposta', round(e.horas_resposta::numeric, 1), 'ultima_acao', e.ultima_acao)
                  order by e.atrasadas desc, (e.respondidas::numeric / greatest(e.candidaturas, 1)), e.candidaturas desc)
                  from e join public.perfis p on p.id = e.autor_id), '[]'::jsonb)
  )
$$;

-- de uma empresa: cada candidatura, a mais nova primeiro (até 300)
create or replace function public.admin_retorno_da_empresa(p_conta uuid, p_desde timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'anuncio_id', r.anuncio_id, 'vaga', a.titulo, 'perfil_id', r.perfil_id, 'nome', p.nome,
           'status', r.status, 'etapa', r.etapa, 'criado_em', r.criado_em, 'respondida_em', r.respondida_em,
           'vista_em', r.vista_em, 'mensagens', r.mensagens, 'ultima_mensagem', r.ultima_mensagem,
           'contato_em', r.contato_em, 'avisada', r.avisada, 'respondida', r.respondida,
           'com_contato', r.com_contato)
           order by r.criado_em desc), '[]'::jsonb)
    from (select * from privado.retorno_das_candidaturas(p_desde, p_conta) order by criado_em desc limit 300) r
    join public.anuncios a on a.id = r.anuncio_id
    left join public.perfis p on p.id = r.perfil_id
$$;

revoke execute on function public.admin_retorno_empresas(timestamptz), public.admin_retorno_da_empresa(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_retorno_empresas(timestamptz), public.admin_retorno_da_empresa(uuid, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
