-- Colocações da agência (19/10/2026). Pode rodar de novo sem problema.
-- Quando a agência contrata alguém para o cliente, ela registra a colocação: o dia em que a
-- pessoa começou, a taxa cobrada do cliente (e se já recebeu) e a garantia de reposição (em
-- dias). Se a pessoa sai antes do fim da garantia, a agência marca a saída: é reposição.
-- Só a agência vê (nada disso aparece para o candidato nem na vaga).

create table if not exists public.colocacoes (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  inicio date not null,
  taxa numeric(12, 2) check (taxa is null or (taxa >= 0 and taxa <= 10000000)),
  paga boolean not null default false,
  garantia_dias smallint not null default 90 check (garantia_dias between 0 and 365),
  -- saiu antes do fim da garantia: a agência repõe
  saiu_em date,
  nota text check (nota is null or char_length(nota) <= 500),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade,
  check (saiu_em is null or saiu_em >= inicio)
);
alter table public.colocacoes enable row level security;
revoke all on public.colocacoes from anon, authenticated;
grant select on public.colocacoes to authenticated;
grant select, insert, update, delete on public.colocacoes to service_role;

drop policy if exists "quem publicou vê as colocações" on public.colocacoes;
create policy "quem publicou vê as colocações" on public.colocacoes
  for select to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));

-- Registra (ou atualiza) a colocação de quem deu match numa vaga da conta.
create or replace function public.salvar_colocacao(
  p_anuncio uuid,
  p_perfil uuid,
  p_inicio date,
  p_taxa numeric default null,
  p_paga boolean default false,
  p_garantia_dias integer default 90,
  p_saiu_em date default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_status text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select c.status into v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = eu and a.tipo = 'vaga';
  if v_status is null then
    raise exception 'Essa pessoa não se candidatou a uma vaga sua.' using errcode = '42501';
  end if;
  if v_status <> 'match' then
    raise exception 'A colocação é de quem deu match e foi contratado.' using errcode = 'P0001';
  end if;
  if p_inicio is null or p_inicio < date '2000-01-01' or p_inicio > current_date + 365 then
    raise exception 'Confira o dia em que a pessoa começou.' using errcode = '22023', hint = 'inicio';
  end if;
  if p_taxa is not null and (p_taxa < 0 or p_taxa > 10000000) then
    raise exception 'Confira o valor da taxa.' using errcode = '22023', hint = 'taxa';
  end if;
  if p_garantia_dias is null or p_garantia_dias < 0 or p_garantia_dias > 365 then
    raise exception 'A garantia vai de 0 a 365 dias.' using errcode = '22023', hint = 'garantia';
  end if;
  if p_saiu_em is not null and p_saiu_em < p_inicio then
    raise exception 'A saída vem depois do começo.' using errcode = '22023', hint = 'saiu_em';
  end if;
  if char_length(v_nota) > 500 then
    raise exception 'A anotação passa de 500 letras.' using errcode = '22023', hint = 'nota';
  end if;
  insert into public.colocacoes as k (anuncio_id, perfil_id, inicio, taxa, paga, garantia_dias, saiu_em, nota)
  values (p_anuncio, p_perfil, p_inicio, round(p_taxa, 2), coalesce(p_paga, false), p_garantia_dias, p_saiu_em, v_nota)
  on conflict (anuncio_id, perfil_id) do update
    set inicio = excluded.inicio,
        taxa = excluded.taxa,
        paga = excluded.paga,
        garantia_dias = excluded.garantia_dias,
        saiu_em = excluded.saiu_em,
        nota = excluded.nota,
        atualizado_em = now();
end
$$;

create or replace function public.apagar_colocacao(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  delete from public.colocacoes k
   using public.anuncios a
   where a.id = k.anuncio_id and a.autor_id = (select auth.uid())
     and k.anuncio_id = p_anuncio and k.perfil_id = p_perfil;
end
$$;

revoke execute on function public.salvar_colocacao(uuid, uuid, date, numeric, boolean, integer, date, text),
                          public.apagar_colocacao(uuid, uuid) from public, anon;
grant execute on function public.salvar_colocacao(uuid, uuid, date, numeric, boolean, integer, date, text),
                          public.apagar_colocacao(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
