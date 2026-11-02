-- A página de carreiras personalizada (claude/plano-pagina-de-vagas.md, parte 3; pedido do usuário, 01/11/2026):
-- a empresa, o comércio ou a agência que já publicou mais de 10 vagas (as encerradas contam) ou que tem uma
-- assinatura paga valendo (os dias grátis não contam) escolhe a cor da marca, uma capa, o "Por que trabalhar aqui"
-- (até 600 letras), até 6 benefícios em destaque e um endereço curto (publike.org/v/apelido).
-- Quem lê a página não lê a tabela: lê por pagina_de_vagas_publica(), que só devolve a personalização enquanto a
-- conta está liberada (a assinatura que acabou não deixa a página com a cor e a capa). Grava só a própria conta
-- (o dono ou o admin da agência), por salvar_pagina_de_vagas(), que confere a liberação. A equipe também libera
-- sem prazo uma conta em Admin › Usuários (admin_liberar_pagina_de_vagas).
-- A capa fica no Storage público das fotos (avatars/<id-de-quem-enviou>/capa/<número>.jpg).
-- Pode rodar de novo. Rode depois de 20270116120000_plano_completo.sql.

-- 1. A tabela ----------------------------------------------------------------------------------------------------
create table if not exists public.paginas_de_vagas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  cor text check (cor is null or cor ~ '^#[0-9a-f]{6}$'),
  capa text check (capa is null or capa ~ '^[0-9a-f-]{36}/capa/[0-9]{10,16}\.jpg$'),
  texto text check (texto is null or char_length(texto) <= 600),
  beneficios text[] not null default '{}' check (cardinality(beneficios) <= 6),
  apelido text unique check (apelido is null or apelido ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'),
  atualizada_em timestamptz not null default now()
);

alter table public.paginas_de_vagas enable row level security;
revoke all on public.paginas_de_vagas from anon, authenticated;
-- a própria conta lê a sua (o painel); o resto, pelas funções abaixo
drop policy if exists "a conta lê a sua página" on public.paginas_de_vagas;
create policy "a conta lê a sua página" on public.paginas_de_vagas
  for select to authenticated
  using (conta_id = (select public.conta_atual()));
grant select on public.paginas_de_vagas to authenticated;

-- 2. Quem está liberado -------------------------------------------------------------------------------------------
-- Mais de 10 vagas publicadas (no ar, pausada, encerrada, vencida; a removida pela moderação não conta) ou uma cobrança paga que ainda vale
-- (como em recalcular_recurso_pago: o período pago e mais 3 dias), ou liberada pela equipe (cortesia). Os dias grátis
-- (privado.experimentos) não contam.
create or replace function privado.vagas_publicadas(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.anuncios a
   where a.autor_id = p_conta and a.tipo = 'vaga' and a.status <> 'removido'
$$;

-- Liberada pela equipe (Admin › Usuários › conta › Página de carreiras), sem prazo ou até `ate`.
create table if not exists privado.paginas_de_vagas_cortesia (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberada_em timestamptz not null default now(),
  ate timestamptz,
  motivo text check (motivo is null or char_length(motivo) <= 200)
);
revoke all on privado.paginas_de_vagas_cortesia from public, anon, authenticated;

create or replace function privado.pagina_de_vagas_liberada(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = p_conta and p.tipo <> 'pessoa')
     and (privado.vagas_publicadas(p_conta) > 10
          or exists (select 1 from privado.paginas_de_vagas_cortesia x
                      where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
          or exists (select 1 from privado.cobrancas c
                      where c.conta_id = p_conta and c.situacao = 'paga'
                        and c.periodo_ate + interval '3 days' >= now()))
$$;

-- 3. Ler ----------------------------------------------------------------------------------------------------------
-- Para o painel: se está liberada, quantas vagas já publicou e o que já escolheu.
create or replace function public.minha_pagina_de_vagas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'liberada', privado.pagina_de_vagas_liberada((select public.conta_atual())),
    'vagas_publicadas', privado.vagas_publicadas((select public.conta_atual())),
    'pode_editar', (select public.papel_na_conta()) in ('dono', 'admin'),
    'pagina', (select to_jsonb(p) - 'conta_id' from public.paginas_de_vagas p
                where p.conta_id = (select public.conta_atual()))
  )
$$;

-- Para a página pública, o quadro do site e as imagens: a personalização, só enquanto a conta está liberada.
create or replace function public.pagina_de_vagas_publica(p_conta uuid)
returns table (cor text, capa text, texto text, beneficios text[], apelido text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.cor, p.capa, p.texto, p.beneficios, p.apelido
    from public.paginas_de_vagas p
   where p.conta_id = p_conta and privado.pagina_de_vagas_liberada(p_conta)
$$;

-- O endereço curto (publike.org/v/apelido): a conta, só enquanto está liberada.
create or replace function public.conta_do_apelido(p_apelido text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.conta_id
    from public.paginas_de_vagas p
   where p.apelido = lower(p_apelido) and privado.pagina_de_vagas_liberada(p.conta_id)
$$;

-- 4. Gravar -------------------------------------------------------------------------------------------------------
create or replace function public.salvar_pagina_de_vagas(
  p_cor text, p_capa text, p_texto text, p_beneficios text[], p_apelido text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_apelido text := nullif(lower(btrim(coalesce(p_apelido, ''))), '');
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_beneficios text[];
  v_capa_antes text;
begin
  if v_conta is null then
    raise exception 'Entre na sua conta.' using errcode = 'P0001', hint = 'sem_login';
  end if;
  perform privado.exigir_conta_ativa();
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda a página de vagas.' using errcode = 'P0001', hint = 'sem_papel';
  end if;
  if not privado.pagina_de_vagas_liberada(v_conta) then
    raise exception 'A página personalizada libera com mais de 10 vagas publicadas ou com uma assinatura.'
      using errcode = 'P0001', hint = 'nao_liberada';
  end if;
  if p_cor is not null and p_cor !~ '^#[0-9a-f]{6}$' then
    raise exception 'Escolha uma cor da lista.' using errcode = 'P0001', hint = 'cor';
  end if;
  select p.capa into v_capa_antes from public.paginas_de_vagas p where p.conta_id = v_conta;
  -- capa nova: só da pasta de quem está enviando (a de antes pode continuar)
  if p_capa is not null and p_capa is distinct from v_capa_antes
     and (p_capa !~ '^[0-9a-f-]{36}/capa/[0-9]{10,16}\.jpg$' or split_part(p_capa, '/', 1) <> (select auth.uid())::text) then
    raise exception 'Envie a capa de novo.' using errcode = 'P0001', hint = 'capa';
  end if;
  if v_texto is not null and char_length(v_texto) > 600 then
    raise exception 'O texto passa de 600 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  select coalesce(array_agg(b order by o), '{}') into v_beneficios
    from (select btrim(x) as b, min(o) as o
            from unnest(coalesce(p_beneficios, '{}')) with ordinality as t(x, o)
           where btrim(x) <> ''
           group by btrim(x)) s;
  if cardinality(v_beneficios) > 6 then
    raise exception 'Escolha até 6 benefícios.' using errcode = 'P0001', hint = 'beneficios';
  end if;
  if exists (select 1 from unnest(v_beneficios) b where char_length(b) > 60) then
    raise exception 'Cada benefício com até 60 letras.' using errcode = 'P0001', hint = 'beneficios';
  end if;
  if v_apelido is not null then
    if v_apelido !~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$' or v_apelido like '%--%' then
      raise exception 'O endereço usa de 3 a 30 letras sem acento, números e hífen.' using errcode = 'P0001', hint = 'apelido';
    end if;
    if v_apelido in ('admin', 'api', 'ajuda', 'app', 'contato', 'equipe', 'login', 'painel', 'publike', 'suporte',
                     'vaga', 'vagas', 'emprego', 'empregos', 'entrar', 'sair', 'teste', 'www') then
      raise exception 'Esse endereço é reservado. Escolha outro.' using errcode = 'P0001', hint = 'apelido_em_uso';
    end if;
    if exists (select 1 from public.paginas_de_vagas p where p.apelido = v_apelido and p.conta_id <> v_conta) then
      raise exception 'Esse endereço já é de outra conta. Escolha outro.' using errcode = 'P0001', hint = 'apelido_em_uso';
    end if;
  end if;

  insert into public.paginas_de_vagas as p (conta_id, cor, capa, texto, beneficios, apelido, atualizada_em)
  values (v_conta, p_cor, p_capa, v_texto, v_beneficios, v_apelido, now())
  on conflict (conta_id) do update
    set cor = excluded.cor, capa = excluded.capa, texto = excluded.texto, beneficios = excluded.beneficios,
        apelido = excluded.apelido, atualizada_em = now();
exception
  when unique_violation then
    raise exception 'Esse endereço já é de outra conta. Escolha outro.' using errcode = 'P0001', hint = 'apelido_em_uso';
end
$$;

-- 5. Admin: liberar sem prazo (ou tirar) e ver a situação da conta ---------------------------------------------
create or replace function public.admin_pagina_de_vagas(p_conta uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'liberada', privado.pagina_de_vagas_liberada(p_conta),
    'pela_equipe', exists (select 1 from privado.paginas_de_vagas_cortesia x
                            where x.conta_id = p_conta and (x.ate is null or x.ate > now())),
    'vagas_publicadas', privado.vagas_publicadas(p_conta),
    'apelido', (select p.apelido from public.paginas_de_vagas p where p.conta_id = p_conta)
  )
$$;

create or replace function public.admin_liberar_pagina_de_vagas(p_conta uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_liberar then
    if not exists (select 1 from public.perfis p where p.id = p_conta and p.tipo <> 'pessoa') then
      raise exception 'Só conta de empresa, comércio ou agência tem página de carreiras.' using errcode = 'P0001';
    end if;
    insert into privado.paginas_de_vagas_cortesia (conta_id, motivo) values (p_conta, 'Admin')
    on conflict (conta_id) do update set ate = null, liberada_em = now();
  else
    delete from privado.paginas_de_vagas_cortesia where conta_id = p_conta;
  end if;
end
$$;

revoke all on function public.admin_pagina_de_vagas(uuid), public.admin_liberar_pagina_de_vagas(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_pagina_de_vagas(uuid), public.admin_liberar_pagina_de_vagas(uuid, boolean)
  to service_role;

-- 6. Permissões ---------------------------------------------------------------------------------------------------
revoke all on function privado.vagas_publicadas(uuid), privado.pagina_de_vagas_liberada(uuid) from public, anon, authenticated;
revoke all on function public.minha_pagina_de_vagas(), public.salvar_pagina_de_vagas(text, text, text, text[], text)
  from public, anon;
grant execute on function public.minha_pagina_de_vagas(), public.salvar_pagina_de_vagas(text, text, text, text[], text)
  to authenticated;
revoke all on function public.pagina_de_vagas_publica(uuid), public.conta_do_apelido(text) from public;
grant execute on function public.pagina_de_vagas_publica(uuid), public.conta_do_apelido(text) to anon, authenticated;
