-- =====================================================================
-- Agências: os clientes (as empresas para quem a agência seleciona)
--
-- Em "Clientes", no painel, a agência cadastra cada empresa: nome, CNPJ,
-- endereço, quem é o contato lá dentro e anotações. Tudo isso fica só com a
-- agência; na vaga aparece só o nome (ou "Empresa confidencial").
--   * Ao publicar, a agência escolhe o cliente: o nome e o endereço já vêm.
--   * A vaga guarda o cliente (anuncios.cliente_id). Vaga confidencial também:
--     o público não vê o nome, mas a agência sabe de quem é.
--   * Trocar o nome do cliente troca o nome nas vagas dele.
--   * As vagas de agência que já existem viram clientes, pelo nome da empresa.
--
-- Rode depois de 20261019150000_vaga_preenchida_e_prazo.sql.
-- =====================================================================


-- 1. Os clientes --------------------------------------------------------------------

create table if not exists public.clientes_agencia (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 80),
  cnpj text check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  -- as vagas deste cliente já vêm marcadas como "Empresa confidencial"
  confidencial boolean not null default false,
  -- o endereço, para as vagas já virem com o lugar
  cidade text check (char_length(cidade) <= 60),
  bairro text check (char_length(bairro) <= 80),
  cep text check (cep ~ '^[0-9]{8}$'),
  endereco text check (char_length(endereco) <= 120),
  lat double precision,
  lng double precision,
  -- o contato lá dentro (só a agência vê)
  responsavel text check (char_length(responsavel) <= 80),
  telefone text check (telefone ~ '^[0-9]{10,13}$'),
  email text check (char_length(email) <= 120 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  nota text check (char_length(nota) <= 1000),
  -- arquivado: some da lista ao publicar, mas as vagas antigas continuam ligadas
  arquivado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint clientes_agencia_ponto check ((lat is null) = (lng is null))
);
comment on table public.clientes_agencia is 'Clientes das agências de emprego. Só a agência vê; na vaga aparece só o nome.';

create unique index if not exists clientes_agencia_nome_idx on public.clientes_agencia (agencia_id, lower(nome));

alter table public.clientes_agencia enable row level security;
revoke all on public.clientes_agencia from anon, authenticated;
grant select, delete on public.clientes_agencia to authenticated;
grant insert (nome, cnpj, confidencial, cidade, bairro, cep, endereco, lat, lng, responsavel, telefone, email, nota),
      update (nome, cnpj, confidencial, cidade, bairro, cep, endereco, lat, lng, responsavel, telefone, email, nota,
              arquivado_em)
  on public.clientes_agencia to authenticated;
grant select, insert, update, delete on public.clientes_agencia to service_role;

drop policy if exists "cada agência vê e mexe nos seus clientes" on public.clientes_agencia;
create policy "cada agência vê e mexe nos seus clientes" on public.clientes_agencia
  for all to authenticated
  using (agencia_id = (select auth.uid()))
  with check (agencia_id = (select auth.uid()));

-- Arruma o que foi escrito e confere: só agência cadastra, até 500 clientes por conta.
create or replace function public.clientes_agencia_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.agencia_id := old.agencia_id;
    new.criado_em := old.criado_em;
  else
    new.criado_em := now();
  end if;
  new.atualizado_em := now();

  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  if char_length(new.nome) < 2 then
    raise exception 'Escreva o nome da empresa.' using errcode = 'P0001', hint = 'nome';
  end if;
  if public.tem_contato(new.nome) then
    raise exception 'Tire o telefone, e-mail ou link do nome da empresa.' using errcode = 'P0001', hint = 'nome';
  end if;
  new.cnpj := nullif(upper(regexp_replace(coalesce(new.cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '');
  if new.cnpj is not null and not public.cnpj_valido(new.cnpj) then
    raise exception 'Confira o CNPJ: algum número ou letra não bate.' using errcode = 'P0001', hint = 'cnpj';
  end if;
  new.cidade := nullif(btrim(coalesce(new.cidade, '')), '');
  new.bairro := nullif(btrim(regexp_replace(coalesce(new.bairro, ''), '\s+', ' ', 'g')), '');
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '[^0-9]', '', 'g'), '');
  new.endereco := nullif(btrim(regexp_replace(coalesce(new.endereco, ''), '\s+', ' ', 'g')), '');
  new.responsavel := nullif(btrim(regexp_replace(coalesce(new.responsavel, ''), '\s+', ' ', 'g')), '');
  new.telefone := nullif(regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g'), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.nota := nullif(btrim(coalesce(new.nota, '')), '');
  -- o ponto só vale em Goiânia e região (como o das vagas)
  if new.lat is null or new.lng is null
     or new.lat not between -17.5 and -15.9 or new.lng not between -50.3 and -48.4 then
    new.lat := null;
    new.lng := null;
  end if;

  if tg_op = 'INSERT' and usuario is not null then
    perform privado.exigir_conta_ativa();
    if not exists (select 1 from public.perfis p where p.id = new.agencia_id and p.tipo = 'agencia') then
      raise exception 'Só agência de emprego ou RH cadastra clientes. Mude o tipo da conta no perfil.'
        using errcode = 'P0001', hint = 'so_agencia';
    end if;
    perform pg_advisory_xact_lock(hashtext('publike:clientes:' || new.agencia_id::text));
    if (select count(*) from public.clientes_agencia c where c.agencia_id = new.agencia_id) >= 500 then
      raise exception 'Você chegou a 500 clientes. Exclua os que não usa mais para cadastrar outros.'
        using errcode = 'P0001', hint = 'limite_clientes';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists clientes_agencia_antes_de_salvar on public.clientes_agencia;
create trigger clientes_agencia_antes_de_salvar
  before insert or update on public.clientes_agencia
  for each row execute function public.clientes_agencia_antes_de_salvar();


-- 2. A vaga guarda o cliente ----------------------------------------------------------

alter table public.anuncios
  add column if not exists cliente_id uuid references public.clientes_agencia (id) on delete set null;
create index if not exists anuncios_cliente_idx on public.anuncios (cliente_id) where cliente_id is not null;
grant insert (cliente_id), update (cliente_id) on public.anuncios to authenticated;

-- Roda antes de anuncios_contratante (ordem alfabética dos gatilhos): confere que o
-- cliente é da agência que publica e, se a vaga não é confidencial, põe o nome dele.
create or replace function public.anuncios_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.clientes_agencia;
begin
  if new.cliente_id is null then
    return new;
  end if;
  if new.tipo <> 'vaga'
     or not exists (select 1 from public.perfis p where p.id = new.autor_id and p.tipo = 'agencia') then
    new.cliente_id := null;
    return new;
  end if;
  select * into c from public.clientes_agencia ca where ca.id = new.cliente_id;
  if c.id is null or c.agencia_id <> new.autor_id then
    raise exception 'Escolha um cliente da sua lista.' using errcode = 'P0001', hint = 'cliente';
  end if;
  -- vaga nova, cliente trocado ou vaga sem nome: o nome é o do cliente
  if not coalesce(new.contratante_confidencial, false)
     and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id
          or nullif(btrim(coalesce(new.contratante, '')), '') is null) then
    new.contratante := c.nome;
  end if;
  return new;
end
$$;
revoke execute on function public.anuncios_cliente() from public;

drop trigger if exists anuncios_cliente on public.anuncios;
create trigger anuncios_cliente
  before insert or update on public.anuncios
  for each row execute function public.anuncios_cliente();

-- Trocou o nome do cliente: as vagas dele (as que mostram o nome) trocam junto.
create or replace function privado.cliente_renomeado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  anterior text := current_setting('publike.sistema', true);
begin
  if new.nome is distinct from old.nome then
    -- não conta no limite de edições do dia (a IA revisa o nome novo, se estiver ligada)
    perform set_config('publike.sistema', 'on', true);
    update public.anuncios a
       set contratante = new.nome
     where a.cliente_id = new.id and a.autor_id = new.agencia_id and a.tipo = 'vaga'
       and not a.contratante_confidencial and a.contratante is distinct from new.nome
       and a.status not in ('em_analise', 'removido');
    perform set_config('publike.sistema', coalesce(anterior, ''), true);
  end if;
  return null;
end
$$;
revoke execute on function privado.cliente_renomeado() from public;

drop trigger if exists clientes_agencia_renomeado on public.clientes_agencia;
create trigger clientes_agencia_renomeado
  after update of nome on public.clientes_agencia
  for each row execute function privado.cliente_renomeado();


-- 3. Publicar para uma empresa nova já guarda o cliente ------------------------------

-- O cliente com este nome (o mesmo, sem diferença de maiúsculas); se não houver, cria.
-- Um cliente arquivado volta para a lista.
create or replace function public.garantir_cliente(p_nome text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if usuario is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select c.id into v_id
    from public.clientes_agencia c
   where c.agencia_id = usuario and lower(c.nome) = lower(v_nome);
  if v_id is null then
    insert into public.clientes_agencia (nome) values (v_nome) returning id into v_id;
  else
    update public.clientes_agencia set arquivado_em = null where id = v_id and arquivado_em is not null;
  end if;
  return v_id;
end
$$;
revoke execute on function public.garantir_cliente(text) from public, anon;
grant execute on function public.garantir_cliente(text) to authenticated;


-- 4. As vagas de agência que já existem viram clientes -------------------------------
-- (o endereço vem da vaga mais nova de cada empresa, quando ela tem o endereço exato)

insert into public.clientes_agencia (agencia_id, nome, cidade, bairro, cep, endereco, lat, lng)
select distinct on (a.autor_id, lower(a.contratante))
       a.autor_id, a.contratante, a.cidade, a.bairro,
       case when a.local_exato then a.cep end,
       case when a.local_exato then a.endereco end,
       case when a.local_exato then extensions.st_y(a.local::extensions.geometry) end,
       case when a.local_exato then extensions.st_x(a.local::extensions.geometry) end
  from public.anuncios a
  join public.perfis p on p.id = a.autor_id and p.tipo = 'agencia'
 where a.tipo = 'vaga' and a.contratante is not null
 order by a.autor_id, lower(a.contratante), a.criado_em desc
on conflict do nothing;

update public.anuncios a
   set cliente_id = c.id
  from public.clientes_agencia c
 where c.agencia_id = a.autor_id and lower(c.nome) = lower(a.contratante)
   and a.tipo = 'vaga' and a.cliente_id is null;

notify pgrst, 'reload schema';
