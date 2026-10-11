-- "O que você quer fazer no Publike?" guardado na conta.
--
-- Quem está logado responde uma vez e a resposta vale em qualquer aparelho, até
-- trocar em "Mudar". Quem não está logado responde a cada visita (fica só num
-- cookie de sessão do navegador). A resposta é só da pessoa: não aparece no perfil
-- público, por isso fica numa tabela própria, fora de `perfis`.
--
-- Rode depois de 20261011170000_negociar_de_novo.sql (pode rodar de novo sem problema).

create table if not exists privado.intencoes (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  intencao text not null
    check (intencao in ('trabalho', 'contratar_servico', 'oferecer_servico', 'contratar_pessoa')),
  atualizado_em timestamptz not null default now()
);

alter table privado.intencoes enable row level security;
revoke all on table privado.intencoes from public, anon, authenticated;

-- A resposta de quem está logado (ou null).
create or replace function public.minha_intencao()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.intencao from privado.intencoes i where i.usuario_id = (select auth.uid())
$$;

create or replace function public.salvar_intencao(p_intencao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if p_intencao is null
     or p_intencao not in ('trabalho', 'contratar_servico', 'oferecer_servico', 'contratar_pessoa') then
    raise exception 'Escolha uma das opções.' using errcode = '22023';
  end if;
  insert into privado.intencoes (usuario_id, intencao) values (usuario, p_intencao)
  on conflict (usuario_id) do update set intencao = excluded.intencao, atualizado_em = now();
end
$$;

revoke execute on function public.minha_intencao() from public, anon;
grant execute on function public.minha_intencao() to authenticated;
revoke execute on function public.salvar_intencao(text) from public, anon;
grant execute on function public.salvar_intencao(text) to authenticated;
