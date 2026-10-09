-- =====================================================================
-- CNPJ também para comércio e empresa
--
-- Agência continua com CNPJ obrigatório. Comércio e empresa podem informar o
-- CNPJ (opcional); o site busca os dados públicos na BrasilAPI para preencher
-- o perfil. Pessoa não guarda CNPJ.
-- O selo de verificado só cai com a troca de CNPJ quando a conta é agência
-- (é o CNPJ que libera os limites maiores).
--
-- Rode depois de 20261009250000_agencias.sql.
-- =====================================================================

create or replace function public.perfis_verificar_agencia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
begin
  new.cnpj := nullif(upper(regexp_replace(coalesce(new.cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '');
  if new.tipo = 'pessoa' then
    new.cnpj := null;
  elsif new.tipo = 'agencia' and new.cnpj is null then
    raise exception 'Confira o CNPJ da agência.' using errcode = 'P0001', hint = 'cnpj';
  elsif new.cnpj is not null and not public.cnpj_valido(new.cnpj) then
    raise exception 'Confira o CNPJ.' using errcode = 'P0001', hint = 'cnpj';
  end if;
  -- o selo de agência verificada vale para aquele CNPJ
  if tg_op = 'UPDATE' and not sistema and new.verificado
     and ((new.tipo = 'agencia') is distinct from (old.tipo = 'agencia')
          or (new.tipo = 'agencia' and new.cnpj is distinct from old.cnpj)) then
    new.verificado := false;
  end if;
  return new;
end
$$;

comment on column public.perfis.cnpj is
  'Agência (obrigatório), comércio e empresa (opcional). Público: quem usa o site pode conferir na Receita.';
