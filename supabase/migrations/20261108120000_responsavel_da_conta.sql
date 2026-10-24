-- Responsável da conta (08/11/2026): empresa, comércio e agência podem pôr no perfil o nome de quem
-- responde pela conta e escolher qual nome aparece nas conversas e nos recados: o da conta ("Clínica
-- Sorriso") ou o do responsável junto com o da conta ("Ana Souza · Clínica Sorriso"). A vaga, o perfil,
-- as listas e o selo continuam com o nome da conta. Pode rodar de novo.
--   * privado.responsavel_da_conta: o nome e a escolha (fora de public.perfis: o nome de quem trabalha
--     na empresa só aparece onde a conta escolheu mostrar).
--   * meu_responsavel / salvar_meu_responsavel: o formulário do perfil (só o dono ou o admin da conta).
--   * privado.nome_nas_conversas: o nome que vai nas conversas e nos recados.
--   * recados_para (recados), conversas_por_pessoa e minhas_conexoes (conversas e conexões) e o aviso
--     "… mandou uma mensagem." usam esse nome. O resto igual a 20261103120000_recado_com_curriculo e
--     20261020180000_conversa_unica.

create table if not exists privado.responsavel_da_conta (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  responsavel text not null check (char_length(responsavel) between 2 and 60),
  mostrar boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table privado.responsavel_da_conta enable row level security;
revoke all on privado.responsavel_da_conta from public, anon, authenticated;

-- O nome nas conversas e nos recados: "Ana Souza · Clínica Sorriso" quando a conta (que não é de pessoa)
-- escolheu mostrar o responsável; senão, o nome da conta.
create or replace function privado.nome_nas_conversas(p_conta uuid, p_nome text, p_tipo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.responsavel || ' · ' || p_nome
       from privado.responsavel_da_conta r
      where r.conta_id = p_conta and r.mostrar and p_tipo <> 'pessoa'),
    p_nome)
$$;
revoke execute on function privado.nome_nas_conversas(uuid, text, text) from public, anon, authenticated;

create or replace function public.meu_responsavel()
returns table (responsavel text, mostrar boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.responsavel, r.mostrar from privado.responsavel_da_conta r where r.conta_id = (select public.conta_atual())
$$;
revoke execute on function public.meu_responsavel() from public, anon;
grant execute on function public.meu_responsavel() to authenticated;

-- Grava o responsável (vazio: apaga). Só o dono ou o admin da conta; conta de pessoa não tem.
create or replace function public.salvar_meu_responsavel(p_responsavel text, p_mostrar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_responsavel, ''), '\s+', ' ', 'g')), '');
  v_tipo text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda o responsável.' using errcode = '42501';
  end if;
  select p.tipo into v_tipo from public.perfis p where p.id = conta;
  if v_tipo is null then
    raise exception 'Complete o perfil primeiro.' using errcode = '22023';
  end if;
  if v_tipo = 'pessoa' or v_nome is null then
    delete from privado.responsavel_da_conta r where r.conta_id = conta;
    return;
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then
    raise exception 'O nome do responsável vai de 2 a 60 letras.' using errcode = '22023', hint = 'responsavel';
  end if;
  insert into privado.responsavel_da_conta (conta_id, responsavel, mostrar)
  values (conta, v_nome, coalesce(p_mostrar, false))
  on conflict (conta_id) do update
    set responsavel = excluded.responsavel, mostrar = excluded.mostrar, atualizado_em = now();
end
$$;
revoke execute on function public.salvar_meu_responsavel(text, boolean) from public, anon;
grant execute on function public.salvar_meu_responsavel(text, boolean) to authenticated;

-- Recados -----------------------------------------------------------------------------------------

create or replace function privado.recados_para(p_ids uuid[], p_lat double precision, p_lng double precision)
returns table (
  id uuid,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  texto text,
  foto text,
  cidade text,
  bairro text,
  distancia_km double precision,
  status text,
  motivo text,
  forcas integer,
  dei_forca boolean,
  meu boolean,
  quando timestamptz,
  anuncio_id uuid,
  anuncio_tipo text,
  anuncio_titulo text,
  anuncio_autor text,
  anuncio_valor numeric,
  anuncio_unidade text,
  anuncio_regime text,
  anuncio_bairro text,
  anuncio_cidade text,
  talento_id uuid,
  talento_nome text,
  talento_titulo text,
  talento_foto text,
  talento_bairro text,
  talento_cidade text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.autor_id, privado.nome_nas_conversas(p.id, p.nome, p.tipo), p.tipo, p.foto, p.verificado,
         r.texto, r.foto, r.cidade, r.bairro,
         case when p_lat is null or p_lng is null then null
              else round((extensions.st_distance(r.local,
                     extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) / 1000)::numeric, 1)::double precision
         end,
         r.status,
         case when r.autor_id = (select public.conta_atual()) then r.motivo end,
         r.forcas,
         exists (select 1 from public.recado_forcas f where f.recado_id = r.id and f.perfil_id = (select public.conta_atual())),
         r.autor_id = (select public.conta_atual()),
         coalesce(r.publicado_em, r.criado_em),
         a.id, a.tipo, a.titulo, pa.nome, a.pagamento_valor, a.pagamento_unidade, a.regime, a.bairro, a.cidade,
         pt.id, privado.nome_curto(pt.nome), ct.titulo, pt.foto, pt.bairro, pt.cidade
    from public.recados r
    join public.perfis p on p.id = r.autor_id
    -- a vaga citada só aparece enquanto está no ar
    left join public.anuncios a on a.id = r.anuncio_id and a.status = 'ativo' and a.expira_em > now()
    left join public.perfis pa on pa.id = a.autor_id
    -- o currículo compartilhado só aparece enquanto a pessoa está na aba Talentos (e sem suspensão nem bloqueio)
    left join public.perfis pt on pt.id = r.talento_id and pt.tipo = 'pessoa'
         and (pt.suspenso_ate is null or pt.suspenso_ate < now())
         and exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = pt.id)
         and ((select public.conta_atual()) is null or not privado.ha_bloqueio((select public.conta_atual()), pt.id))
    left join public.curriculos ct on ct.perfil_id = pt.id
   where r.id = any (p_ids)
$$;
revoke execute on function privado.recados_para(uuid[], double precision, double precision) from public;

-- Conversas e conexões ----------------------------------------------------------------------------

create or replace function public.minhas_conexoes(p_outro uuid default null)
returns table (
  id uuid,
  status text,
  pedi boolean,
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_cidade text,
  outro_bairro text,
  outro_na_vitrine boolean,
  mensagem text,
  criado_em timestamptz,
  respondida_em timestamptz,
  whatsapp text,
  email text,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select c.id, c.status, c.pedida_por = eu.id,
         o.id,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then privado.nome_curto(o.nome)
              else privado.nome_nas_conversas(o.id, o.nome, o.tipo) end,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then null else o.foto end,
         o.tipo, o.cidade, o.bairro,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'aceita' then ct.whatsapp end,
         case when c.status = 'aceita' then ct.email end,
         u.texto, u.criado_em, u.autor_id = eu.id,
         coalesce((select count(*)::integer from public.mensagens m
                    where m.conversa_id = d.id and m.autor_id <> eu.id and m.lida_em is null), 0)
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
    join public.perfis o on o.id = case when c.talento_id = eu.id then c.empresa_id else c.talento_id end
    left join public.contatos ct on ct.perfil_id = o.id
    left join public.conversas d
      on c.status = 'aceita'
     and d.conta_a = least(c.talento_id, c.empresa_id) and d.conta_b = greatest(c.talento_id, c.empresa_id)
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where (p_outro is null or o.id = p_outro)
     and not (c.status = 'recusada' and c.pedida_por <> eu.id)
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, o.id)
   order by coalesce(u.criado_em, c.respondida_em, c.criado_em) desc
   limit 500
$$;
revoke execute on function public.minhas_conexoes(uuid) from public, anon;
grant execute on function public.minhas_conexoes(uuid) to authenticated;

create or replace function public.conversas_por_pessoa(p_outro uuid default null)
returns table (
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_na_vitrine boolean,
  conversa_id uuid,
  conectados boolean,
  vagas jsonb,
  desde timestamptz,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id),
  ligacoes as (
    -- anúncio meu, curtido pela outra pessoa
    select c.perfil_id as outro, a.id as anuncio_id, c.perfil_id, a.titulo, a.tipo, 'publiquei'::text as papel,
           coalesce(e.etapa, 'novo') as etapa, coalesce(c.respondida_em, c.criado_em) as desde
      from eu
      join public.anuncios a on a.autor_id = eu.id
      join public.curtidas c on c.anuncio_id = a.id and c.status = 'match'
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or c.perfil_id = p_outro
    union all
    -- anúncio da outra pessoa, curtido por mim
    select a.autor_id, a.id, c.perfil_id, a.titulo, a.tipo, 'curti', coalesce(e.etapa, 'novo'),
           coalesce(c.respondida_em, c.criado_em)
      from eu
      join public.curtidas c on c.perfil_id = eu.id and c.status = 'match'
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or a.autor_id = p_outro
    union all
    -- conexão aceita
    select case when x.talento_id = eu.id then x.empresa_id else x.talento_id end, null, null, null, null,
           'conexao', null, coalesce(x.respondida_em, x.criado_em)
      from eu
      join public.conexoes x on eu.id in (x.talento_id, x.empresa_id) and x.status = 'aceita'
     where p_outro is null or p_outro in (x.talento_id, x.empresa_id)
  ),
  pessoas as (
    select l.outro,
           max(l.desde) as desde,
           bool_or(l.papel = 'conexao') as conectados,
           coalesce(jsonb_agg(jsonb_build_object(
                      'anuncio_id', l.anuncio_id, 'perfil_id', l.perfil_id, 'titulo', l.titulo, 'tipo', l.tipo,
                      'papel', l.papel, 'etapa', l.etapa, 'desde', l.desde) order by l.desde desc)
                      filter (where l.anuncio_id is not null),
                    '[]'::jsonb) as vagas
      from ligacoes l
     group by l.outro
  )
  select p.outro, privado.nome_nas_conversas(o.id, o.nome, o.tipo), o.foto, o.tipo,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         d.id, p.conectados, p.vagas, p.desde,
         u.texto, u.criado_em, u.autor_id = eu.id,
         coalesce((select count(*)::integer from public.mensagens m
                    where m.conversa_id = d.id and m.autor_id <> eu.id and m.lida_em is null), 0)
    from eu
    cross join pessoas p
    join public.perfis o on o.id = p.outro
    left join public.conversas d on d.conta_a = least(eu.id, p.outro) and d.conta_b = greatest(eu.id, p.outro)
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where p.outro <> eu.id
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, p.outro)
   order by coalesce(u.criado_em, p.desde) desc
   limit 500
$$;
revoke execute on function public.conversas_por_pessoa(uuid) from public, anon;
grant execute on function public.conversas_por_pessoa(uuid) to authenticated;

create or replace function public.enviar_mensagem_para(p_outro uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_suspenso timestamptz;
  v_nome text;
  v_tipo text;
  v_id bigint;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if v_texto = '' then
    raise exception 'Escreva a mensagem.' using errcode = '22023';
  end if;
  if char_length(v_texto) > 2000 then
    raise exception 'A mensagem passa de 2000 letras.' using errcode = '22023';
  end if;
  if p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    raise exception 'A conversa abre quando dá match ou quando a conexão é aceita.' using errcode = '42501';
  end if;
  select p.suspenso_ate into v_suspenso from public.perfis p where p.id = p_outro;
  if v_suspenso is not null and v_suspenso > now() then
    raise exception 'Não dá para mandar mensagem para esta conta.' using errcode = 'P0001';
  end if;
  -- só com match em anúncio que está com a moderação (sem conexão nem outro match): espera liberar
  if not exists (select 1 from public.conexoes x
                  where x.status = 'aceita'
                    and ((x.talento_id = eu and x.empresa_id = p_outro)
                         or (x.talento_id = p_outro and x.empresa_id = eu)))
     and not exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                      where c.status = 'match' and a.status not in ('em_analise', 'removido')
                        and ((a.autor_id = eu and c.perfil_id = p_outro)
                             or (a.autor_id = p_outro and c.perfil_id = eu))) then
    raise exception 'Este anúncio está com a moderação. A conversa volta quando ele for liberado.'
      using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('mensagem', 300, 'Você mandou muitas mensagens hoje. Tente de novo amanhã.');

  insert into public.mensagens (conversa_id, autor_id, texto)
  values (privado.conversa_da_dupla(eu, p_outro), eu, v_texto)
  returning id into v_id;

  -- aviso para a outra pessoa: um só, até ela abrir a conversa
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = p_outro and n.tipo = 'mensagem' and n.ator_id = eu and not n.lida
  ) then
    select privado.nome_nas_conversas(p.id, p.nome, p.tipo), p.tipo into v_nome, v_tipo
      from public.perfis p where p.id = eu;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (p_outro, 'mensagem', eu,
            left(coalesce(case when v_tipo = 'pessoa' then split_part(v_nome, ' ', 1) else v_nome end, 'Alguém')
                 || ' mandou uma mensagem.', 300));
  end if;
  return v_id;
end
$$;
revoke execute on function public.enviar_mensagem_para(uuid, text) from public, anon;
grant execute on function public.enviar_mensagem_para(uuid, text) to authenticated;
