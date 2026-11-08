-- A vaga em mais sites (08/11/2026; claude/plano-painel-feed-indicacao-documentos.md, parte 2). Pode rodar de novo.
--
-- 1. perfis.vagas_em_outros_sites: a empresa deixa (ou não) as vagas dela irem para o arquivo /feed/vagas.xml, que
--    os sites de vagas (Jooble, Talent.com, Careerjet…) leem. Ligado por padrão; desligado, a vaga fica só no
--    Publike e no Google.
-- 2. public.vagas_para_o_feed: as vagas no ar de quem deixa, só o que já é público na página da vaga (sem contato,
--    sem endereço exato). Lido pelo servidor, sem login.

alter table public.perfis add column if not exists vagas_em_outros_sites boolean not null default true;
grant update (vagas_em_outros_sites) on public.perfis to authenticated;

create or replace function public.vagas_para_o_feed(p_limite integer default 2000)
returns table (id uuid, titulo text, descricao text, categoria text, regime text, jornada text,
               pagamento_valor numeric, pagamento_ate numeric, pagamento_unidade text, cidade text, bairro text,
               empresa text, criado_em timestamptz, atualizado_em timestamptz, expira_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, a.descricao, a.categoria, a.regime, a.jornada, a.pagamento_valor, a.pagamento_ate,
         a.pagamento_unidade, a.cidade, a.bairro,
         -- vaga de agência: a empresa que contrata, ou "Empresa confidencial"; senão, quem publicou
         case when a.contratante_confidencial then 'Empresa confidencial' else coalesce(a.contratante, p.nome) end,
         a.criado_em, a.atualizado_em, a.expira_em
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
     and p.vagas_em_outros_sites
     and (p.suspenso_ate is null or p.suspenso_ate < now())
   order by a.criado_em desc
   limit least(greatest(coalesce(p_limite, 2000), 1), 5000)
$$;
revoke execute on function public.vagas_para_o_feed(integer) from public;
grant execute on function public.vagas_para_o_feed(integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
