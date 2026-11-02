-- Novidades do Publike escritas uma vez (pedido do Marcelo, 02/11/2026): Admin › Novidades guarda as principais
-- evoluções do Publike, e cada uma pode sair também como banner (cartão ou janela) e como recado no sino, pelos
-- botões "Fazer banner" e "Mandar no sino" (abrem os formulários de sempre já preenchidos). /novidades mostra as
-- novidades publicadas e, como antes, os banners marcados "Também em Novidades".
-- Começa com um rascunho das evoluções de outubro e novembro, todas sem publicar, para revisar no admin.
-- Pode rodar de novo sem problema. Rode depois de 20270121120000_app_so_do_publike.sql.

create table if not exists public.novidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 3 and 80),
  texto text not null check (char_length(texto) between 10 and 400),
  -- uma página do Publike (começa com uma barra só); sem link, o cartão fica sem botão
  link text check (link is null or (link ~ '^/([^/\\].*)?$' and char_length(link) <= 300 and link !~ '\s')),
  botao text check (botao is null or char_length(botao) between 2 and 30),
  -- para quem é: todos, quem procura trabalho ou serviço (pessoas) ou quem contrata (empresas)
  para text not null default 'todos' check (para in ('todos', 'pessoas', 'empresas')),
  -- o dia da novidade (o que a página mostra e por onde ordena)
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  publicada boolean not null default false,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
alter table public.novidades enable row level security;
-- sem política: só o admin (service_role) lê e grava a tabela; o site lê pela novidades_do_publike()
revoke all on table public.novidades from anon, authenticated;

-- As novidades do Publike, da mais nova para a mais antiga (as 50 últimas): as publicadas de Admin › Novidades
-- (até hoje) e os banners ligados, já começados e marcados "Também em Novidades". Ganha `para` (muda o que
-- devolve: sai e entra de novo).
drop function if exists public.novidades_do_publike();
create function public.novidades_do_publike()
returns table (
  id uuid, titulo text, texto text, botao text, acao text, link text, imagem text, quando timestamptz, para text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select n.id, n.titulo, n.texto, coalesce(n.botao, case when n.link is not null then 'Ver' end), 'link'::text,
           n.link, null::text, (n.dia + time '12:00') at time zone 'America/Sao_Paulo', n.para
      from public.novidades n
     where n.publicada and n.dia <= (now() at time zone 'America/Sao_Paulo')::date
    union all
    select b.id, b.titulo, b.texto, b.botao, b.acao, b.link, b.imagem, coalesce(b.inicio, b.criado_em),
           case b.publico when 'pessoas' then 'pessoas' when 'empresas' then 'empresas' else 'todos' end
      from public.banners b
     where b.ativo and b.em_novidades and (b.inicio is null or b.inicio <= now())
  ) t
  order by 8 desc
  limit 50
$$;
revoke execute on function public.novidades_do_publike() from public;
grant execute on function public.novidades_do_publike() to anon, authenticated;

-- O rascunho: as principais evoluções (dos commits de outubro e novembro), sem publicar.
insert into public.novidades (dia, para, titulo, texto, link, botao)
select v.dia::date, v.para, v.titulo, v.texto, v.link, v.botao
  from (values
    ('2026-11-02', 'empresas', 'Página de vagas com a sua marca',
     'Uma página só com as suas vagas, com a cor, um título e até 3 fotos da empresa. Mande o link no WhatsApp e no Instagram, com a arte pronta para os stories.',
     '/painel/links', 'Ver minha página'),
    ('2026-11-01', 'empresas', 'Plano Completo: tudo numa assinatura',
     'Triagem com IA, Teste Prático, Entrevista em vídeo e Automações juntos, por menos do que assinar cada um.',
     '/painel/assinar?recurso=completo', 'Ver o Plano Completo'),
    ('2026-11-01', 'empresas', 'Entrevista ao vivo pelo Publike',
     'Converse por vídeo com o candidato sem instalar nada. Ele escolhe o horário e recebe um lembrete na véspera.',
     '/painel/candidatos', 'Ver candidatos'),
    ('2026-10-31', 'empresas', 'Triagem com IA',
     'A IA lê os currículos sozinha e mostra quem combina mais com a vaga, junto com os talentos do Publike.',
     '/painel/copiloto', 'Conhecer a Triagem'),
    ('2026-10-31', 'empresas', 'Retorno para quem não seguiu',
     'Avise com respeito quem não vai seguir no processo, num toque. A pessoa fica sabendo e não fica esperando.',
     '/painel/candidatos', 'Ver candidatos'),
    ('2026-10-29', 'empresas', 'Publicar vaga em 5 passos',
     'Um passo por tela, com a vaga montando ao lado. Continua grátis e sem limite de candidatos.',
     '/publicar', 'Publicar vaga'),
    ('2026-10-29', 'pessoas', 'Aviso de vaga nova sem pedir',
     'Curtiu uma vaga? O Publike passa a avisar quando chegar outra da mesma área perto de você.',
     '/?tipo=vaga', 'Ver vagas'),
    ('2026-10-26', 'todos', 'App do Publike para Android',
     'O app está em teste no Google Play. Teste no seu Android por 14 dias e ajude a lançar: leva 2 minutos e é grátis.',
     '/testar-app?de=novidades', 'Testar o app'),
    ('2026-10-25', 'pessoas', 'Currículo antes de criar conta',
     'Preencha o currículo sem entrar. Depois de entrar, ele volta preenchido, e o que ficou pela metade não se perde.',
     '/perfil/curriculo', 'Fazer meu currículo'),
    ('2026-10-25', 'todos', 'Avisos no celular com o Publike fechado',
     'Ligue as notificações e receba mensagens, matches e vagas novas na hora, mesmo com o site fechado.',
     null, null),
    ('2026-10-25', 'todos', 'Mensagens num lugar só',
     'As conversas, os matches e as conexões ficam juntos em Mensagens.',
     null, null),
    ('2026-10-18', 'pessoas', 'Deu match? Converse pelo chat',
     'Fale com quem publicou a vaga pelo chat do Publike e mande o currículo em PDF na conversa. Com contato direto, a curtida já vira match.',
     '/?tipo=vaga', 'Ver vagas')
  ) as v(dia, para, titulo, texto, link, botao)
 where not exists (select 1 from public.novidades);
