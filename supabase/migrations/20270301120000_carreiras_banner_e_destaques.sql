-- Página de carreiras: o banner com a chamada e as vagas em destaque (07/11/2026, olhando a página de vagas da
-- Recrutamento Micheli na Selecty; claude/plano-pagina-de-vagas.md, parte 4). A chamada é a frase grande por cima
-- das fotos ("Construa uma carreira que você ama!") com uma linha embaixo; os destaques são até 3 vagas da conta
-- que ficam no alto da página. Grava por uma função à parte (o salvar de antes continua igual). Pode rodar de novo.
-- Rode depois de 20270228120000_trilha_da_vaga.sql.

alter table public.paginas_de_vagas add column if not exists chamada text;
alter table public.paginas_de_vagas add column if not exists subchamada text;
alter table public.paginas_de_vagas add column if not exists destaques uuid[] not null default '{}';
alter table public.paginas_de_vagas drop constraint if exists paginas_de_vagas_chamada_check;
alter table public.paginas_de_vagas add constraint paginas_de_vagas_chamada_check
  check (chamada is null or char_length(chamada) between 3 and 90);
alter table public.paginas_de_vagas drop constraint if exists paginas_de_vagas_subchamada_check;
alter table public.paginas_de_vagas add constraint paginas_de_vagas_subchamada_check
  check (subchamada is null or char_length(subchamada) <= 160);
alter table public.paginas_de_vagas drop constraint if exists paginas_de_vagas_destaques_check;
alter table public.paginas_de_vagas add constraint paginas_de_vagas_destaques_check check (cardinality(destaques) <= 3);

-- a leitura pública ganha a chamada e os destaques (muda o que devolve: sai e entra de novo)
drop function if exists public.pagina_de_vagas_publica(uuid);
create function public.pagina_de_vagas_publica(p_conta uuid)
returns table (cor text, capa text, texto text, beneficios text[], apelido text, titulo text, fotos text[],
               chamada text, subchamada text, destaques uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.cor, p.capa, p.texto, p.beneficios, p.apelido, p.titulo, p.fotos, p.chamada, p.subchamada, p.destaques
    from public.paginas_de_vagas p
   where p.conta_id = p_conta and privado.pagina_de_vagas_liberada(p_conta)
$$;
revoke all on function public.pagina_de_vagas_publica(uuid) from public;
grant execute on function public.pagina_de_vagas_publica(uuid) to anon, authenticated;

-- gravar a chamada e os destaques (as mesmas conferências do salvar: login, conta ativa, papel e liberação)
create or replace function public.salvar_banner_e_destaques(p_chamada text, p_subchamada text, p_destaques uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_chamada text := nullif(btrim(coalesce(p_chamada, '')), '');
  v_sub text := nullif(btrim(coalesce(p_subchamada, '')), '');
  v_destaques uuid[];
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
  if v_chamada is not null and char_length(v_chamada) not between 3 and 90 then
    raise exception 'A chamada vai de 3 a 90 letras.' using errcode = 'P0001', hint = 'chamada';
  end if;
  if v_sub is not null and char_length(v_sub) > 160 then
    raise exception 'A linha de baixo vai até 160 letras.' using errcode = 'P0001', hint = 'subchamada';
  end if;
  -- só vagas da própria conta, sem repetir, na ordem escolhida
  select coalesce(array_agg(d order by o), '{}') into v_destaques
    from (select x as d, min(o) as o from unnest(coalesce(p_destaques, '{}')) with ordinality as t(x, o)
           where x is not null group by x) s
   where exists (select 1 from public.anuncios a where a.id = s.d and a.autor_id = v_conta and a.tipo = 'vaga');
  if cardinality(v_destaques) > 3 then
    raise exception 'Escolha até 3 vagas em destaque.' using errcode = 'P0001', hint = 'destaques';
  end if;

  insert into public.paginas_de_vagas as p (conta_id, chamada, subchamada, destaques, atualizada_em)
  values (v_conta, v_chamada, v_sub, v_destaques, now())
  on conflict (conta_id) do update
    set chamada = excluded.chamada, subchamada = excluded.subchamada, destaques = excluded.destaques,
        atualizada_em = now();
end
$$;
revoke all on function public.salvar_banner_e_destaques(text, text, uuid[]) from public, anon;
grant execute on function public.salvar_banner_e_destaques(text, text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
