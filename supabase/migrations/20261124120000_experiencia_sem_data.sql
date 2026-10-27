-- Currículo (27/10/2026): as datas da experiência ficam opcionais. Quem enviou um PDF sem as datas (ou não
-- lembra o mês) salva assim mesmo; o currículo mostra o cargo e o lugar sem o período, e o % de match não
-- conta o tempo dessa experiência. Com data, continua o formato "AAAA-MM". Experiência nova guarda "atual"
-- (true/false); nas antigas, sem "atual", fim vazio quer dizer "trabalha aqui". Pode rodar de novo.

create or replace function public.curriculos_antes_de_salvar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  junto text := '';
begin
  if new.perfil_id = (select auth.uid()) and coalesce(current_setting('publike.sistema', true), '') <> 'on' then
    perform privado.exigir_conta_ativa();
  end if;
  new.curso := nullif(btrim(regexp_replace(coalesce(new.curso, ''), '\s+', ' ', 'g')), '');
  new.cursos := coalesce(
    (select array_agg(c order by primeira)
       from (select btrim(c) as c, min(n) as primeira
               from unnest(coalesce(new.cursos, '{}')) with ordinality as t(c, n)
              where char_length(btrim(coalesce(c, ''))) between 2 and 80
              group by btrim(c)) u),
    '{}');
  new.disponibilidade := coalesce((select array_agg(distinct d) from unnest(new.disponibilidade) d), '{}');
  if new.arquivo is not null and split_part(new.arquivo, '/', 1) <> new.perfil_id::text then
    raise exception 'Envie o PDF de novo.' using errcode = 'P0001', hint = 'arquivo_invalido';
  end if;

  for e in select value from jsonb_array_elements(new.experiencias) loop
    if jsonb_typeof(e) <> 'object'
       or char_length(btrim(coalesce(e ->> 'cargo', ''))) not between 2 and 80
       or char_length(btrim(coalesce(e ->> 'onde', ''))) > 80
       or char_length(coalesce(e ->> 'descricao', '')) > 300
       or (coalesce(e ->> 'inicio', '') <> '' and e ->> 'inicio' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$')
       or (coalesce(e ->> 'fim', '') <> '' and e ->> 'fim' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$')
       or (e ? 'atual' and jsonb_typeof(e -> 'atual') <> 'boolean') then
      raise exception 'Confira as experiências.' using errcode = 'P0001', hint = 'experiencia_invalida';
    end if;
    junto := junto || ' ' || coalesce(e ->> 'cargo', '') || ' ' || coalesce(e ->> 'onde', '') || ' ' || coalesce(e ->> 'descricao', '');
  end loop;

  if public.tem_contato(junto, true) or public.tem_contato(new.curso)
     or public.tem_contato(array_to_string(new.cursos, ' '), true) then
    raise exception 'Tire o telefone, e-mail ou link do currículo. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;

  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
    new.perfil_id := old.perfil_id;
  else
    new.criado_em := now();
  end if;
  return new;
end
$$;

-- Quantos meses de experiência (aba Talentos e perfil): o trabalho atual conta até hoje; o que acabou sem o
-- mês de saída, ou sem o de entrada, não conta tempo. Nas antigas (sem "atual"), fim vazio é o atual.
create or replace function privado.meses_de_experiencia(p_experiencias jsonb)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(greatest(0,
           (split_part(f.fim, '-', 1)::int * 12 + split_part(f.fim, '-', 2)::int)
           - (split_part(f.inicio, '-', 1)::int * 12 + split_part(f.inicio, '-', 2)::int) + 1)), 0)::int
    from (select e ->> 'inicio' as inicio,
                 case when e ->> 'fim' ~ '^[0-9]{4}-[0-9]{2}$' then e ->> 'fim'
                      when coalesce((e ->> 'atual')::boolean, true) then to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
                 end as fim
            from jsonb_array_elements(coalesce(p_experiencias, '[]'::jsonb)) e
           where e ->> 'inicio' ~ '^[0-9]{4}-[0-9]{2}$'
             and jsonb_typeof(coalesce(e -> 'atual', 'null'::jsonb)) in ('boolean', 'null')) f
   where f.fim is not null
$$;

revoke execute on function privado.meses_de_experiencia(jsonb) from public;
