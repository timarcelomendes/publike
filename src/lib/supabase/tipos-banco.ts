// Tipos do banco, no formato que o `supabase gen types typescript` gera.
// Se mudar a migração, atualize aqui ou gere de novo com a CLI do Supabase:
//   npx supabase gen types typescript --project-id SEU_ID > src/lib/supabase/tipos-banco.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type SemTabela = { [_ in never]: never };

export type Database = {
  public: {
    Tables: {
      entrevistas: {
        Row: {
          id: string;
          anuncio_id: string;
          perfil_id: string;
          quando: string;
          duracao_min: number;
          formato: string;
          local: string | null;
          obs: string | null;
          situacao: string;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      modelos_mensagem: {
        Row: { id: string; autor_id: string; nome: string; texto: string; criado_em: string };
        Insert: { nome: string; texto: string };
        Update: { nome?: string; texto?: string };
        Relationships: [];
      };
      /** finalistas que a agência mostra ao cliente pelo link (só quem publicou a vaga lê) */
      finalistas: {
        Row: {
          id: string;
          anuncio_id: string;
          perfil_id: string;
          parecer: string | null;
          decisao: string | null;
          comentario: string | null;
          quem: string | null;
          decidido_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      /** colocações da agência: o começo, a taxa e a garantia (só quem publicou a vaga lê) */
      colocacoes: {
        Row: {
          anuncio_id: string;
          perfil_id: string;
          inicio: string;
          taxa: number | null;
          paga: boolean;
          garantia_dias: number;
          saiu_em: string | null;
          nota: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      /** candidato de fora: o convite pelo link (só quem convidou lê) */
      convites_candidato: {
        Row: {
          id: string;
          token: string;
          anuncio_id: string;
          autor_id: string;
          nome: string;
          curriculo: Json | null;
          criado_em: string;
          expira_em: string;
          cancelado_em: string | null;
          recusado_em: string | null;
          perfil_id: string | null;
          aceito_em: string | null;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      /** equipe da agência: quem age pela agência, com o próprio login */
      equipe_agencia: {
        Row: { agencia_id: string; membro_id: string; papel: string; criado_em: string; convidado_por: string | null };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      convites_equipe: {
        Row: {
          id: string;
          token: string;
          agencia_id: string;
          papel: string;
          nome: string | null;
          criado_por: string | null;
          criado_em: string;
          expira_em: string;
          cancelado_em: string | null;
          aceito_por: string | null;
          aceito_em: string | null;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      atividades_equipe: {
        Row: {
          id: number;
          agencia_id: string;
          membro_id: string | null;
          anuncio_id: string | null;
          perfil_id: string | null;
          texto: string;
          criado_em: string;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      conexoes: {
        Row: {
          id: string;
          talento_id: string;
          empresa_id: string;
          pedida_por: string;
          status: string;
          mensagem: string | null;
          criado_em: string;
          respondida_em: string | null;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      links_finalistas: {
        Row: {
          anuncio_id: string;
          token: string;
          criado_em: string;
          expira_em: string;
          aberto_em: string | null;
          aberturas: number;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      anuncio_visitas: {
        Row: { anuncio_id: string; total: number; atualizado_em: string };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      vaga_triagem: {
        Row: { anuncio_id: string; criterios: Json; atualizado_em: string };
        Insert: { anuncio_id: string; criterios: Json; atualizado_em?: string };
        Update: { criterios?: Json; atualizado_em?: string };
        Relationships: [];
      };
      /** clientes das agências (só a agência vê; na vaga aparece só o nome) */
      clientes_agencia: {
        Row: {
          id: string;
          agencia_id: string;
          nome: string;
          cnpj: string | null;
          confidencial: boolean;
          cidade: string | null;
          bairro: string | null;
          cep: string | null;
          endereco: string | null;
          lat: number | null;
          lng: number | null;
          responsavel: string | null;
          telefone: string | null;
          email: string | null;
          nota: string | null;
          arquivado_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          nome: string;
          cnpj?: string | null;
          confidencial?: boolean;
          cidade?: string | null;
          bairro?: string | null;
          cep?: string | null;
          endereco?: string | null;
          lat?: number | null;
          lng?: number | null;
          responsavel?: string | null;
          telefone?: string | null;
          email?: string | null;
          nota?: string | null;
        };
        Update: {
          nome?: string;
          cnpj?: string | null;
          confidencial?: boolean;
          cidade?: string | null;
          bairro?: string | null;
          cep?: string | null;
          endereco?: string | null;
          lat?: number | null;
          lng?: number | null;
          responsavel?: string | null;
          telefone?: string | null;
          email?: string | null;
          nota?: string | null;
          arquivado_em?: string | null;
        };
        Relationships: [];
      };
      perfis: {
        Row: {
          id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          servicos: string[];
          verificado: boolean;
          criado_em: string;
          atualizado_em: string;
          /** conta suspensa até esta data (banimento = daqui a 100 anos) */
          suspenso_ate: string | null;
          /** só agências: 14 caracteres, sem pontuação (aceita o CNPJ com letras) */
          cnpj: string | null;
        };
        Insert: {
          id: string;
          nome: string;
          tipo?: string;
          foto?: string | null;
          cidade?: string;
          bairro?: string | null;
          sobre?: string | null;
          servicos?: string[];
          cnpj?: string | null;
        };
        Update: {
          nome?: string;
          tipo?: string;
          foto?: string | null;
          cidade?: string;
          bairro?: string | null;
          sobre?: string | null;
          servicos?: string[];
          cnpj?: string | null;
        };
        Relationships: [];
      };
      contatos: {
        Row: {
          perfil_id: string;
          whatsapp: string | null;
          email: string | null;
          receber_emails: boolean;
          atualizado_em: string;
        };
        Insert: {
          perfil_id: string;
          whatsapp?: string | null;
          email?: string | null;
          receber_emails?: boolean;
        };
        Update: {
          whatsapp?: string | null;
          email?: string | null;
          receber_emails?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "contatos_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: true;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      /** "Eu recomendo": só aparece no perfil depois que a pessoa aprova (oculta e decidida) */
      recomendacoes: {
        Row: {
          id: number;
          profissional_id: string;
          autor_id: string;
          relacao: string;
          texto: string;
          oculta: boolean;
          decidida: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Record<PropertyKey, never>;
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      seguindo: {
        Row: {
          id: number;
          perfil_id: string;
          alvo_perfil: string | null;
          cidade: string | null;
          bairro: string | null;
          bairro_chave: string | null;
          criado_em: string;
        };
        Insert: Record<PropertyKey, never>;
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      /** "Me avise de vagas assim": cada busca com aviso de vaga nova */
      buscas_salvas: {
        Row: {
          id: number;
          perfil_id: string;
          texto: string | null;
          categoria: string | null;
          regime: string | null;
          turno: string | null;
          lat: number;
          lng: number;
          raio_km: number;
          rotulo: string;
          caminho: string;
          criado_em: string;
        };
        Insert: Record<PropertyKey, never>;
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      salvas: {
        Row: { perfil_id: string; anuncio_id: string; criado_em: string };
        Insert: { anuncio_id: string };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      dispensas: {
        Row: { perfil_id: string; anuncio_id: string; criado_em: string };
        Insert: { anuncio_id: string };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      /** CEP de casa de quem procura: só a própria pessoa lê; ponto arredondado (~300 m) */
      casas: {
        Row: { perfil_id: string; cep: string; cidade: string; bairro: string; local: unknown; atualizado_em: string };
        Insert: { cep: string; cidade: string; bairro?: string; local: string };
        Update: { cep?: string; cidade?: string; bairro?: string; local?: string };
        Relationships: [];
      };
      preferencias: {
        Row: {
          perfil_id: string;
          procuro: string | null;
          atualizado_em: string;
          home_vista_em: string | null;
          home_marca_em: string | null;
          home_aba: string | null;
          fundo: string;
          fundo_arquivo: string | null;
        };
        Insert: {
          procuro?: string | null;
          home_vista_em?: string | null;
          home_marca_em?: string | null;
          home_aba?: string | null;
          fundo?: string;
          fundo_arquivo?: string | null;
        };
        Update: {
          procuro?: string | null;
          home_vista_em?: string | null;
          home_marca_em?: string | null;
          home_aba?: string | null;
          fundo?: string;
          fundo_arquivo?: string | null;
        };
        Relationships: [];
      };
      moderadores: {
        Row: { perfil_id: string; criado_em: string };
        Insert: { perfil_id: string };
        Update: { perfil_id?: string };
        Relationships: [];
      };
      anuncios: {
        Row: {
          id: string;
          autor_id: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          local: unknown;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          busca: unknown;
          nota_moderacao: string | null;
          oficio: string | null;
          fotos: string[];
          atende: string[];
          pede_curriculo: boolean;
          contato_direto: boolean;
          preenchida_em: string | null;
          prazo_dias: number | null;
          /** vaga de agência: a empresa que contrata (null se confidencial) */
          contratante: string | null;
          contratante_confidencial: boolean;
          /** vaga de agência: o cliente (clientes_agencia), também na confidencial */
          cliente_id: string | null;
          /** CEP e endereço (só comércio, empresa e agência; senão null) */
          cep: string | null;
          endereco: string | null;
          /** o ponto é o endereço exato (senão é uma área de ~500 m) */
          local_exato: boolean;
          /** vaga: fim da faixa salarial (o começo é pagamento_valor) */
          pagamento_ate: number | null;
          /** vaga: paga comissão além do valor */
          comissao: boolean;
          /** vaga: benefícios marcados (BENEFICIOS); os outros ficam em beneficios */
          beneficios_lista: string[];
          escolaridade_minima: string | null;
          /** sem = aceita sem experiência; null = não informado */
          experiencia: string | null;
          cnh: string | null;
          jornada: string | null;
          modelo: string | null;
          /** tambem = também para PCD; exclusiva = só PCD */
          pcd: string | null;
          perguntas: Json;
          beneficios_extras: string[];
          horario_detalhe: Json | null;
          /** ganhos a mais junto do valor: [{ nome, detalhe }] */
          ganhos_extras: Json;
        };
        Insert: {
          /** quem publica (padrão: quem está logado; o admin informa ao publicar em nome da conta) */
          autor_id?: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime?: string | null;
          pagamento_valor?: number | null;
          pagamento_unidade?: string | null;
          beneficios?: string | null;
          horario?: string | null;
          vagas?: number;
          cidade: string;
          bairro: string;
          /** EWKT, por exemplo: SRID=4326;POINT(-49.25 -16.68) */
          local: string;
          oficio?: string | null;
          fotos?: string[];
          atende?: string[];
          pede_curriculo?: boolean;
          contato_direto?: boolean;
          prazo_dias?: number | null;
          preenchida_em?: string | null;
          contratante?: string | null;
          contratante_confidencial?: boolean;
          cliente_id?: string | null;
          cep?: string | null;
          endereco?: string | null;
          /** vaga: fim da faixa salarial (o começo é pagamento_valor) */
          pagamento_ate?: number | null;
          /** vaga: paga comissão além do valor */
          comissao?: boolean;
          /** vaga: benefícios marcados (BENEFICIOS); os outros ficam em beneficios */
          beneficios_lista?: string[];
          escolaridade_minima?: string | null;
          /** sem = aceita sem experiência; null = não informado */
          experiencia?: string | null;
          cnh?: string | null;
          jornada?: string | null;
          modelo?: string | null;
          /** tambem = também para PCD; exclusiva = só PCD */
          pcd?: string | null;
          perguntas?: Json;
          beneficios_extras?: string[];
          horario_detalhe?: Json | null;
          ganhos_extras?: Json;
        };
        Update: {
          titulo?: string;
          descricao?: string;
          categoria?: string;
          regime?: string | null;
          pagamento_valor?: number | null;
          pagamento_unidade?: string | null;
          beneficios?: string | null;
          horario?: string | null;
          vagas?: number;
          cidade?: string;
          bairro?: string;
          local?: string;
          status?: string;
          oficio?: string | null;
          fotos?: string[];
          atende?: string[];
          pede_curriculo?: boolean;
          contato_direto?: boolean;
          prazo_dias?: number | null;
          preenchida_em?: string | null;
          contratante?: string | null;
          contratante_confidencial?: boolean;
          cliente_id?: string | null;
          cep?: string | null;
          endereco?: string | null;
          /** vaga: fim da faixa salarial (o começo é pagamento_valor) */
          pagamento_ate?: number | null;
          /** vaga: paga comissão além do valor */
          comissao?: boolean;
          /** vaga: benefícios marcados (BENEFICIOS); os outros ficam em beneficios */
          beneficios_lista?: string[];
          escolaridade_minima?: string | null;
          /** sem = aceita sem experiência; null = não informado */
          experiencia?: string | null;
          cnh?: string | null;
          jornada?: string | null;
          modelo?: string | null;
          /** tambem = também para PCD; exclusiva = só PCD */
          pcd?: string | null;
          perguntas?: Json;
          beneficios_extras?: string[];
          horario_detalhe?: Json | null;
          ganhos_extras?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "anuncios_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      resumos_candidato: {
        Row: {
          anuncio_id: string;
          perfil_id: string;
          curriculo_em: string;
          conteudo: Json;
          modelo: string;
          criado_em: string;
        };
        Insert: {
          anuncio_id: string;
          perfil_id: string;
          curriculo_em: string;
          conteudo: Json;
          modelo: string;
          criado_em?: string;
        };
        Update: { curriculo_em?: string; conteudo?: Json; modelo?: string; criado_em?: string };
        Relationships: [];
      };
      curriculo_visivel: {
        Row: { perfil_id: string; desde: string };
        Insert: { perfil_id: string };
        Update: SemTabela;
        Relationships: [];
      };
      /** quem aparece na aba Talentos da busca (só o resumo, aberto) */
      curriculo_na_vitrine: {
        Row: { perfil_id: string; desde: string };
        Insert: { perfil_id: string };
        Update: SemTabela;
        Relationships: [];
      };
      convites_vaga: {
        Row: { anuncio_id: string; perfil_id: string; criado_em: string };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      curriculos: {
        Row: {
          perfil_id: string;
          escolaridade: string | null;
          curso: string | null;
          experiencias: Json;
          cursos: string[];
          cnh: string | null;
          disponibilidade: string[];
          arquivo: string | null;
          /** o que a pessoa faz ("Auxiliar de cozinha") e as habilidades: a vitrine de Talentos */
          titulo: string | null;
          habilidades: string[];
          /** outros estudos: [{ nivel, curso }] */
          estudos: Json;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          perfil_id: string;
          escolaridade?: string | null;
          curso?: string | null;
          experiencias?: Json;
          cursos?: string[];
          cnh?: string | null;
          disponibilidade?: string[];
          arquivo?: string | null;
          titulo?: string | null;
          habilidades?: string[];
          estudos?: Json;
        };
        Update: {
          escolaridade?: string | null;
          curso?: string | null;
          experiencias?: Json;
          cursos?: string[];
          cnh?: string | null;
          disponibilidade?: string[];
          arquivo?: string | null;
          titulo?: string | null;
          habilidades?: string[];
          estudos?: Json;
        };
        Relationships: [];
      };
      curtidas: {
        Row: {
          anuncio_id: string;
          perfil_id: string;
          mensagem: string | null;
          status: string;
          criado_em: string;
          respondida_em: string | null;
          desfeito_por: string | null;
          desfeito_motivo: string | null;
          desfeito_em: string | null;
          desfeito_futuro: boolean | null;
          respostas: Json;
          aceita_em: string | null;
        };
        Insert: {
          anuncio_id: string;
          mensagem?: string | null;
          respostas?: Json;
        };
        Update: SemTabela;
        Relationships: [
          {
            foreignKeyName: "curtidas_anuncio_id_fkey";
            columns: ["anuncio_id"];
            isOneToOne: false;
            referencedRelation: "anuncios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curtidas_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      denuncias: {
        Row: {
          id: number;
          anuncio_id: string;
          autor_id: string | null;
          motivo: string;
          detalhes: string | null;
          status: string;
          criado_em: string;
        };
        Insert: {
          anuncio_id: string;
          motivo: string;
          detalhes?: string | null;
        };
        Update: SemTabela;
        Relationships: [];
      };
      config_site: {
        Row: {
          id: boolean;
          emails_ativos: boolean;
          remetente_nome: string;
          responder_para: string | null;
          email_curtida: boolean;
          email_match: boolean;
          email_moderacao: boolean;
          email_conta: boolean;
          /** e-mail de boas-vindas para quem cria a conta */
          email_boas_vindas: boolean;
          avisos_para: string[];
          aviso_denuncia: boolean;
          aviso_cadastro: boolean;
          aviso_retirado: boolean;
          /** aviso para a equipe quando publicar vaga ou salvar currículo falha (sem a migração: undefined) */
          aviso_falha?: boolean;
          ia_moderacao: boolean;
          ia_melhorar_texto: boolean;
          ia_resumo: boolean;
          ia_modelo: string;
          /** a IA procura notícias sobre trabalho (rascunhos para o admin aprovar) */
          ia_noticias?: boolean;
          noticias_ultima_busca?: string | null;
          noticias_ultimo_erro?: string | null;
          email_logo: boolean;
          email_logo_url: string | null;
          chat_ativo: boolean;
          atualizado_em: string;
          atualizado_por: string | null;
        };
        Insert: SemTabela;
        Update: { ia_noticias?: boolean };
        Relationships: [];
      };
      notificacoes: {
        Row: {
          id: number;
          destinatario_id: string;
          tipo: string;
          anuncio_id: string | null;
          texto: string;
          lida: boolean;
          criado_em: string;
          ator_id: string | null;
          /** o recado do aviso (Força, no ar, não publicado) */
          recado_id: string | null;
        };
        Insert: SemTabela;
        Update: { lida?: boolean };
        Relationships: [];
      };
      /** a conversa de duas contas (só pelas funções) */
      conversas: {
        Row: {
          id: string;
          conta_a: string;
          conta_b: string;
          criado_em: string;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      mensagens: {
        Row: {
          id: number;
          /** a conversa da dupla (uma por pessoa) */
          conversa_id: string | null;
          /** a vaga de onde a mensagem veio (null: mandada direto na conversa) */
          anuncio_id: string | null;
          perfil_id: string | null;
          autor_id: string;
          texto: string;
          criado_em: string;
          lida_em: string | null;
          anexo: string | null;
          anexo_nome: string | null;
        };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      /** convites às empresas (só o admin, com service_role) */
      /** acesso pelo link (WhatsApp): só o admin (service_role) cria; a página usa as funções */
      acessos_conta: {
        Row: {
          token: string;
          perfil_id: string;
          criado_em: string;
          expira_em: string;
          usado_em: string | null;
          email: string | null;
        };
        Insert: { token: string; perfil_id: string };
        Update: SemTabela;
        Relationships: [];
      };
      convites: {
        Row: {
          id: string;
          nome: string;
          tipo: string;
          vagas: string[];
          whatsapp: string[];
          telefones: string[];
          email: string | null;
          observacao: string | null;
          status: string;
          nota: string | null;
          enviada_em: string | null;
          usuario_id: string | null;
          criado_em: string;
          atualizado_em: string;
          token: string;
          rascunho: Json | null;
          origem: string | null;
          aceite_em: string | null;
          anuncio_id: string | null;
        };
        Insert: {
          nome: string;
          tipo?: string;
          vagas?: string[];
          whatsapp?: string[];
          telefones?: string[];
          email?: string | null;
          observacao?: string | null;
          rascunho?: Json | null;
          origem?: string | null;
        };
        Update: {
          status?: string;
          nota?: string | null;
          enviada_em?: string | null;
          usuario_id?: string | null;
          anuncio_id?: string | null;
          aceite_em?: string | null;
        };
        Relationships: [];
      };
      /** notícias: o site lê só as aprovadas que já chegaram no horário (RLS) */
      noticias: {
        Row: {
          id: string;
          slug: string;
          titulo: string;
          resumo: string;
          corpo: string;
          pratico: string | null;
          tema: string;
          cidade: string | null;
          fonte_nome: string;
          fonte_url: string;
          fonte_data: string | null;
          status: string;
          publicar_em: string | null;
          criado_em: string;
          atualizado_em: string;
          foto_url: string | null;
          foto_autor: string | null;
          foto_autor_url: string | null;
          foto_link: string | null;
          foto_alt: string | null;
          foto_fonte: string | null;
          foto_licenca: string | null;
          foto_licenca_url: string | null;
        };
        Insert: SemTabela;
        Update: {
          titulo?: string;
          resumo?: string;
          corpo?: string;
          pratico?: string | null;
          tema?: string;
          cidade?: string | null;
          status?: string;
          publicar_em?: string | null;
        };
        Relationships: [];
      };
      banners: {
        Row: {
          id: string;
          titulo: string;
          texto: string | null;
          botao: string;
          acao: string;
          link: string | null;
          publico: string;
          repetir_dias: number | null;
          ativo: boolean;
          inicio: string | null;
          fim: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          titulo: string;
          texto?: string | null;
          botao: string;
          acao: string;
          link?: string | null;
          publico?: string;
          repetir_dias?: number | null;
          ativo?: boolean;
          inicio?: string | null;
          fim?: string | null;
        };
        Update: {
          titulo?: string;
          texto?: string | null;
          botao?: string;
          acao?: string;
          link?: string | null;
          publico?: string;
          repetir_dias?: number | null;
          ativo?: boolean;
          inicio?: string | null;
          fim?: string | null;
        };
        Relationships: [];
      };
      banners_vistos: {
        Row: { banner_id: string; pessoa_id: string; visto_em: string; clicou: boolean };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
      banner_numeros: {
        Row: { banner_id: string; dia: string; vistos: number; cliques: number; fechados: number };
        Insert: SemTabela;
        Update: SemTabela;
        Relationships: [];
      };
    };
    Views: SemTabela;
    Functions: {
      buscar_anuncios: {
        Args: {
          p_lat?: number;
          p_lng?: number;
          p_raio_km?: number;
          p_tipo?: string | null;
          p_categoria?: string | null;
          p_regime?: string | null;
          p_texto?: string | null;
          p_ordem?: string;
          p_limite?: number;
          p_cidade?: string | null;
          p_bairro?: string | null;
          p_bairros_regiao?: string[] | null;
          p_regiao?: string | null;
          p_por_distancia?: boolean;
        };
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          distancia_km: number;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_verificado: boolean;
          minha_curtida: string | null;
          /** 0 = no bairro de quem busca, 1 = na região (ou atende a região), 2 = na cidade, 3 = o resto */
          prioridade: number;
          oficio: string | null;
          /** primeira foto de trabalho (serviço) */
          foto: string | null;
          /** média das avaliações publicadas do profissional (só serviço) */
          autor_nota: number | null;
          autor_avaliacoes: number;
          /** vaga: fim da faixa salarial */
          pagamento_ate: number | null;
          comissao: boolean;
        }[];
      };
      obter_anuncio: {
        Args: { p_id: string };
        Returns: {
          id: string;
          autor_id: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          autor_verificado: boolean;
          autor_desde: string;
          minha_curtida: string | null;
          minha_mensagem: string | null;
          oficio: string | null;
          fotos: string[];
          atende: string[];
          pede_curriculo: boolean;
          contratante: string | null;
          contratante_confidencial: boolean;
          /** CNPJ de quem publicou, quando é agência */
          autor_cnpj: string | null;
          cep: string | null;
          endereco: string | null;
          local_exato: boolean;
          /** vaga: fim da faixa salarial (o começo é pagamento_valor) */
          pagamento_ate: number | null;
          /** vaga: paga comissão além do valor */
          comissao: boolean;
          /** vaga: benefícios marcados (BENEFICIOS); os outros ficam em beneficios */
          beneficios_lista: string[];
          escolaridade_minima: string | null;
          /** sem = aceita sem experiência; null = não informado */
          experiencia: string | null;
          cnh: string | null;
          jornada: string | null;
          modelo: string | null;
          /** tambem = também para PCD; exclusiva = só PCD */
          pcd: string | null;
          perguntas: Json;
          beneficios_extras: string[];
          horario_detalhe: Json | null;
          minhas_respostas: Json | null;
          contato_direto: boolean;
          preenchida_em: string | null;
          prazo_dias: number | null;
          ganhos_extras: Json;
        }[];
      };
      meus_anuncios: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          status: string;
          criado_em: string;
          expira_em: string;
          curtidas_total: number;
          curtidas_novas: number;
          matches: number;
        }[];
      };
      interessados: {
        Args: { p_anuncio: string };
        Returns: {
          perfil_id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          servicos: string[];
          verificado: boolean;
          membro_desde: string;
          mensagem: string | null;
          status: string;
          curtido_em: string;
          whatsapp: string | null;
          email: string | null;
        }[];
      };
      etapas_dos_candidatos: {
        Args: { p_anuncio: string };
        Returns: { perfil_id: string; etapa: string; nota: string | null; atualizado_em: string }[];
      };
      bloquear_pessoa: {
        Args: { p_outro: string; p_bloquear: boolean };
        Returns: undefined;
      };
      minha_intencao: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      salvar_intencao: {
        Args: { p_intencao: string };
        Returns: undefined;
      };
      curtidas_das_vagas: {
        Args: { p_ids: string[] };
        Returns: { anuncio_id: string; curtidas: number | null; ultima: string }[];
      };
      meus_modos: {
        Args: Record<PropertyKey, never>;
        Returns: string[] | null;
      };
      salvar_meus_modos: {
        Args: { p_modos: string[] };
        Returns: string[];
      };
      admin_mandar_mensagem_equipe: {
        Args: { p_conta: string; p_assunto: string; p_texto: string; p_email: boolean };
        Returns: { id: number; email_id: number | null };
      };
      admin_mensagens_equipe: {
        Args: { p_conta: string };
        Returns: {
          id: number;
          assunto: string;
          texto: string;
          por_email: boolean;
          criado_em: string;
          lida_em: string | null;
        }[];
      };
      minhas_mensagens_equipe: {
        Args: Record<PropertyKey, never>;
        Returns: { id: number; assunto: string; texto: string; criado_em: string; lida_em: string | null }[];
      };
      ler_mensagens_equipe: { Args: Record<PropertyKey, never>; Returns: undefined };
      registrar_motivo_encerramento: {
        Args: { p_anuncio: string; p_motivo: string; p_detalhe?: string | null };
        Returns: undefined;
      };
      admin_motivos_encerramento: {
        Args: { p_dias?: number };
        Returns: { tipo: string; motivo: string; total: number; ultimo: string }[];
      };
      meu_responsavel: {
        Args: Record<PropertyKey, never>;
        Returns: { responsavel: string; mostrar: boolean }[];
      };
      salvar_meu_responsavel: {
        Args: { p_responsavel: string; p_mostrar: boolean };
        Returns: undefined;
      };
      meus_bloqueios: {
        Args: Record<PropertyKey, never>;
        Returns: { outro_id: string; eu_bloqueei: boolean; me_bloqueou: boolean }[];
      };
      seguir_perfil: { Args: { p_perfil: string }; Returns: undefined };
      contar_banner: { Args: { p_banner: string; p_evento: string }; Returns: undefined };
      marcar_banner_visto: { Args: { p_banner: string; p_clicou?: boolean }; Returns: undefined };
      registrar_visita: { Args: { p_perfil: string; p_onde: string; p_anuncio?: string | null }; Returns: undefined };
      quem_viu_meu_perfil: {
        Args: { p_dias?: number };
        Returns: {
          visitante_id: string | null;
          nome: string | null;
          tipo: string;
          foto: string | null;
          cidade: string | null;
          bairro: string | null;
          verificado: boolean;
          titulo: string | null;
          curriculo_aberto: boolean;
          onde: string;
          anuncio_id: string | null;
          anuncio_titulo: string | null;
          ultima: string;
          vezes: number;
        }[];
      };
      resumo_das_visitas: {
        Args: Record<PropertyKey, never>;
        Returns: { semana: number; semana_passada: number; novas: number; anonimas: number }[];
      };
      marcar_visitas_vistas: { Args: Record<PropertyKey, never>; Returns: undefined };
      minhas_opcoes_de_visitas: {
        Args: Record<PropertyKey, never>;
        Returns: { avisar: boolean; sem_aparecer: boolean }[];
      };
      mudar_opcoes_de_visitas: { Args: { p_avisar: boolean; p_sem_aparecer: boolean }; Returns: undefined };
      minhas_candidaturas_vistas: {
        Args: Record<PropertyKey, never>;
        Returns: { anuncio_id: string; vista_em: string }[];
      };
      salvar_busca: {
        Args: {
          p_texto: string | null;
          p_categoria: string | null;
          p_regime: string | null;
          p_turno: string | null;
          p_lat: number;
          p_lng: number;
          p_raio_km: number;
          p_rotulo: string;
          p_caminho: string;
        };
        Returns: number;
      };
      /** a parte das curtidas que cada um responde (0 a 1) e a mediana em horas; só com 5 curtidas ou mais */
      resposta_de_quem_publica: {
        Args: { p_autores: string[] };
        Returns: { autor_id: string; taxa: number; horas: number | null }[];
      };
      seguir_bairro: { Args: { p_cidade: string; p_bairro: string }; Returns: undefined };
      recomendar: { Args: { p_profissional: string; p_relacao: string; p_texto: string }; Returns: undefined };
      mostrar_recomendacao: { Args: { p_id: number; p_mostrar: boolean }; Returns: undefined };
      recomendacoes_do_perfil: {
        Args: { p_perfil: string };
        Returns: {
          id: number;
          autor_id: string;
          autor_nome: string;
          autor_foto: string | null;
          relacao: string;
          texto: string;
          oculta: boolean;
          decidida: boolean;
          criado_em: string;
        }[];
      };
      registrar_aceite: { Args: { p_versao: string }; Returns: undefined };
      /** quem está logado ainda não aceitou esta versão das regras (conta criada pela equipe) */
      aceite_pendente: { Args: { p_versao: string }; Returns: boolean };
      servidor_noticias_contexto: { Args: { p_chave: string }; Returns: Json };
      servidor_salvar_noticias: { Args: { p_chave: string; p_itens: Json; p_erro?: string | null }; Returns: number };
      servidor_fotos_noticias: { Args: { p_chave: string; p_fotos: Json }; Returns: number };
      servidor_guardar_foto_noticia: {
        Args: { p_chave: string; p_id: string; p_tipo: string; p_dados: string };
        Returns: undefined;
      };
      foto_noticia: { Args: { p_id: string }; Returns: { tipo: string; dados: string }[] };
      convite_do_token: {
        Args: { p_token: string };
        Returns: { nome: string; tipo: string; rascunho: Json | null; status: string }[];
      };
      marcar_vaga_preenchida: { Args: { p_id: string; p_preenchida: boolean }; Returns: number };
      aceitar_convite: { Args: { p_token: string; p_anuncio: string }; Returns: boolean };
      acesso_do_link: { Args: { p_token: string }; Returns: { nome: string; vaga: string | null; situacao: string }[] };
      vincular_email_do_link: { Args: { p_token: string; p_email: string }; Returns: string };
      recusar_convite: { Args: { p_token: string }; Returns: boolean };
      /** conta nova que veio pela página de serviços: as boas-vindas viram as de prestador */
      quero_oferecer_servicos: { Args: Record<string, never>; Returns: undefined };
      registrar_origem: { Args: { p_origem: string }; Returns: undefined };
      ponto_conhecido: {
        Args: { p_cep: string; p_numero: string };
        Returns: { lat: number; lng: number; vezes: number }[];
      };
      admin_origens: {
        Args: { p_desde?: string };
        Returns: {
          origem: string;
          contas: number;
          publicaram_vaga: number;
          publicaram_servico: number;
          anuncios_no_ar: number;
          primeira: string;
          ultima: string;
        }[];
      };
      autorizar_contratacao_publica: {
        Args: { p_anuncio: string; p_perfil: string; p_sim: boolean };
        Returns: undefined;
      };
      minhas_contratacoes_publicas: {
        Args: Record<PropertyKey, never>;
        Returns: { anuncio_id: string; perfil_id: string; ok_empresa: boolean; ok_pessoa: boolean }[];
      };
      contratacoes_recentes: {
        Args: { p_empresa?: string | null; p_pessoa?: string | null; p_limite?: number };
        Returns: {
          anuncio_id: string;
          titulo: string;
          pessoa_id: string;
          pessoa_nome: string;
          empresa_id: string;
          empresa_nome: string;
          bairro: string | null;
          cidade: string;
          publicado_em: string;
        }[];
      };
      minhas_etapas: {
        Args: Record<PropertyKey, never>;
        Returns: { anuncio_id: string; etapa: string; atualizado_em: string }[];
      };
      enviar_mensagem: {
        Args: { p_anuncio: string; p_perfil: string; p_texto: string };
        Returns: number;
      };
      enviar_curriculo_na_conversa: {
        Args: { p_anuncio: string; p_arquivo: string; p_nome: string };
        Returns: number;
      };
      marcar_conversa_lida: {
        Args: { p_anuncio: string; p_perfil: string };
        Returns: undefined;
      };
      minhas_conversas: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          perfil_id: string;
          anuncio_titulo: string;
          anuncio_tipo: string;
          papel: string;
          outro_id: string;
          outro_nome: string;
          outro_foto: string | null;
          etapa: string;
          ultima_texto: string | null;
          ultima_em: string | null;
          ultima_minha: boolean | null;
          nao_lidas: number;
          match_em: string | null;
        }[];
      };
      meus_candidatos: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          anuncio_titulo: string;
          anuncio_status: string;
          perfil_id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          verificado: boolean;
          mensagem: string | null;
          status: string;
          curtido_em: string;
          whatsapp: string | null;
          email: string | null;
          tem_curriculo: boolean;
          etapa: string;
          nota: string | null;
          etapa_em: string | null;
        }[];
      };
      salvar_etapa_candidato: {
        Args: { p_anuncio: string; p_perfil: string; p_etapa: string; p_nota: string | null };
        Returns: undefined;
      };
      curriculos_dos_interessados: {
        Args: { p_anuncio: string };
        Returns: {
          perfil_id: string;
          escolaridade: string | null;
          curso: string | null;
          experiencias: Json;
          cursos: string[];
          cnh: string | null;
          disponibilidade: string[];
          arquivo: string | null;
          atualizado_em: string;
          titulo: string | null;
          habilidades: string[];
          estudos: Json;
        }[];
      };
      desfazer_match: {
        Args: { p_anuncio: string; p_perfil: string; p_motivo: string; p_justificativa: string; p_futuro: boolean };
        Returns: undefined;
      };
      curtir_de_novo: {
        Args: { p_anuncio: string; p_mensagem?: string | null };
        Returns: undefined;
      };
      admin_matches_desfeitos: {
        Args: { p_perfil: string };
        Returns: {
          id: number;
          anuncio_id: string | null;
          titulo: string;
          tipo_anuncio: string;
          fez: boolean;
          outro_id: string | null;
          outro_nome: string | null;
          motivo: string;
          justificativa: string;
          futuro: boolean;
          match_em: string | null;
          criado_em: string;
        }[];
      };
      pode_ver_curriculo: {
        Args: { p_perfil: string };
        Returns: boolean;
      };
      minhas_curtidas: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          titulo: string;
          tipo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          anuncio_status: string;
          expira_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          status: string;
          mensagem: string | null;
          curtido_em: string;
          respondida_em: string | null;
          autor_whatsapp: string | null;
          autor_email: string | null;
        }[];
      };
      meus_matches: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          anuncio_titulo: string;
          anuncio_tipo: string;
          papel: string;
          outro_id: string;
          outro_nome: string;
          outro_tipo: string;
          outro_foto: string | null;
          outro_cidade: string;
          outro_bairro: string | null;
          outro_whatsapp: string | null;
          outro_email: string | null;
          match_em: string;
        }[];
      };
      marcar_entrevista: {
        Args: {
          p_anuncio: string;
          p_perfil: string;
          p_quando: string;
          p_formato: string;
          p_local?: string | null;
          p_obs?: string | null;
          p_duracao?: number;
        };
        Returns: string;
      };
      mudar_entrevista: { Args: { p_id: string; p_situacao: string }; Returns: undefined };
      responder_entrevista: { Args: { p_id: string; p_resposta: string }; Returns: undefined };
      contar_visita: { Args: { p_anuncio: string }; Returns: undefined };
      contar_acesso: { Args: { p_ip: string; p_navegador: string }; Returns: undefined };
      contar_abertura: { Args: { p_anuncio: string; p_ip: string; p_navegador: string }; Returns: undefined };
      adicionar_finalistas: { Args: { p_anuncio: string; p_perfis: string[] }; Returns: number };
      tirar_finalista: { Args: { p_anuncio: string; p_perfil: string }; Returns: undefined };
      salvar_parecer_finalista: {
        Args: { p_anuncio: string; p_perfil: string; p_parecer: string };
        Returns: undefined;
      };
      link_dos_finalistas: {
        Args: { p_anuncio: string; p_acao?: string };
        Returns: { token: string; expira_em: string }[];
      };
      finalistas_do_link: { Args: { p_token: string }; Returns: Json };
      salvar_colocacao: {
        Args: {
          p_anuncio: string;
          p_perfil: string;
          p_inicio: string;
          p_taxa?: number | null;
          p_paga?: boolean;
          p_garantia_dias?: number;
          p_saiu_em?: string | null;
          p_nota?: string | null;
        };
        Returns: undefined;
      };
      apagar_colocacao: { Args: { p_anuncio: string; p_perfil: string }; Returns: undefined };
      criar_convite_candidato: {
        Args: { p_anuncio: string; p_nome: string; p_curriculo?: Json | null };
        Returns: { id: string; token: string; expira_em: string }[];
      };
      cancelar_convite_candidato: { Args: { p_id: string }; Returns: undefined };
      convite_candidato_do_token: { Args: { p_token: string }; Returns: Json };
      aceitar_convite_candidato: { Args: { p_token: string; p_respostas?: Json }; Returns: string };
      recusar_convite_candidato: { Args: { p_token: string }; Returns: string };
      curriculo_do_convite: { Args: { p_token: string }; Returns: Json };
      conta_atual: { Args: Record<PropertyKey, never>; Returns: string };
      papel_na_conta: { Args: Record<PropertyKey, never>; Returns: string };
      criar_convite_equipe: {
        Args: { p_papel: string; p_nome?: string | null };
        Returns: { id: string; token: string; expira_em: string }[];
      };
      cancelar_convite_equipe: { Args: { p_id: string }; Returns: undefined };
      convite_equipe_do_token: { Args: { p_token: string }; Returns: Json };
      aceitar_convite_equipe: { Args: { p_token: string }; Returns: string };
      escolher_conta: { Args: { p_conta: string | null }; Returns: undefined };
      mudar_papel_equipe: { Args: { p_membro: string; p_papel: string }; Returns: undefined };
      tirar_da_equipe: { Args: { p_membro: string }; Returns: undefined };
      sair_da_equipe: { Args: { p_agencia: string }; Returns: undefined };
      minhas_contas: {
        Args: Record<PropertyKey, never>;
        Returns: { conta_id: string; nome: string; foto: string | null; tipo: string; papel: string; atual: boolean }[];
      };
      equipe_da_conta: {
        Args: Record<PropertyKey, never>;
        Returns: {
          membro_id: string;
          nome: string;
          foto: string | null;
          papel: string;
          desde: string;
          ultima_atividade: string | null;
          sou_eu: boolean;
        }[];
      };
      atividades_da_equipe: {
        Args: { p_limite?: number };
        Returns: {
          id: number;
          criado_em: string;
          membro_id: string | null;
          quem: string;
          texto: string;
          anuncio_id: string | null;
          perfil_id: string | null;
        }[];
      };
      /** recados (só pelas funções) */
      escrever_recado: {
        Args: {
          p_texto: string;
          p_foto?: string | null;
          p_anuncio?: string | null;
          p_lat?: number | null;
          p_lng?: number | null;
          p_cidade?: string | null;
          p_bairro?: string | null;
          p_talento?: string | null;
        };
        Returns: { id: string; status: string }[];
      };
      apagar_recado: { Args: { p_recado: string }; Returns: string | null };
      editar_recado: { Args: { p_recado: string; p_texto: string }; Returns: { status: string }[] };
      dar_forca: { Args: { p_recado: string }; Returns: { forcas: number; dei: boolean }[] };
      denunciar_recado: {
        Args: { p_recado: string; p_motivo: string; p_detalhes?: string | null };
        Returns: undefined;
      };
      linha_recados: {
        Args: { p_lat: number; p_lng: number; p_raio_km?: number; p_limite?: number };
        Returns: {
          id: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          autor_verificado: boolean;
          texto: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          distancia_km: number | null;
          status: string;
          motivo: string | null;
          forcas: number;
          dei_forca: boolean;
          meu: boolean | null;
          quando: string;
          anuncio_id: string | null;
          anuncio_tipo: string | null;
          anuncio_titulo: string | null;
          anuncio_autor: string | null;
          anuncio_valor: number | null;
          anuncio_unidade: string | null;
          anuncio_regime: string | null;
          anuncio_bairro: string | null;
          anuncio_cidade: string | null;
          talento_id: string | null;
          talento_nome: string | null;
          talento_titulo: string | null;
          talento_foto: string | null;
          talento_bairro: string | null;
          talento_cidade: string | null;
          seguindo: boolean;
        }[];
      };
      recados_do_perfil: {
        Args: { p_perfil: string; p_limite?: number };
        Returns: {
          id: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          autor_verificado: boolean;
          texto: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          distancia_km: number | null;
          status: string;
          motivo: string | null;
          forcas: number;
          dei_forca: boolean;
          meu: boolean | null;
          quando: string;
          anuncio_id: string | null;
          anuncio_tipo: string | null;
          anuncio_titulo: string | null;
          anuncio_autor: string | null;
          anuncio_valor: number | null;
          anuncio_unidade: string | null;
          anuncio_regime: string | null;
          anuncio_bairro: string | null;
          anuncio_cidade: string | null;
          talento_id: string | null;
          talento_nome: string | null;
          talento_titulo: string | null;
          talento_foto: string | null;
          talento_bairro: string | null;
          talento_cidade: string | null;
        }[];
      };
      recado: {
        Args: { p_id: string };
        Returns: {
          id: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          autor_verificado: boolean;
          texto: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          distancia_km: number | null;
          status: string;
          motivo: string | null;
          forcas: number;
          dei_forca: boolean;
          meu: boolean | null;
          quando: string;
          anuncio_id: string | null;
          anuncio_tipo: string | null;
          anuncio_titulo: string | null;
          anuncio_autor: string | null;
          anuncio_valor: number | null;
          anuncio_unidade: string | null;
          anuncio_regime: string | null;
          anuncio_bairro: string | null;
          anuncio_cidade: string | null;
          talento_id: string | null;
          talento_nome: string | null;
          talento_titulo: string | null;
          talento_foto: string | null;
          talento_bairro: string | null;
          talento_cidade: string | null;
        }[];
      };
      servidor_pegar_recados_ia: {
        Args: { p_chave: string; p_limite?: number };
        Returns: { recado_id: string; versao: string; texto: string; citado: string | null; modelo: string }[];
      };
      servidor_resultado_recado: {
        Args: {
          p_chave: string;
          p_recado: string;
          p_versao: string;
          p_decisao: string;
          p_categorias?: string[];
          p_explicacao?: string | null;
          p_modelo?: string | null;
        };
        Returns: string;
      };
      fila_recados: {
        Args: Record<PropertyKey, never>;
        Returns: {
          recado_id: string;
          situacao: string;
          texto: string;
          foto: string | null;
          status: string;
          autor_id: string;
          autor_nome: string;
          cidade: string;
          bairro: string | null;
          anuncio_titulo: string | null;
          denuncias_abertas: number;
          motivos: string[];
          detalhes: string[];
          ia_categorias: string[];
          ia_explicacao: string | null;
          criado_em: string;
        }[];
      };
      moderar_recado: {
        Args: { p_recado: string; p_decisao: string; p_nota?: string | null };
        Returns: undefined;
      };
      pedir_conexao: {
        Args: { p_com: string; p_mensagem?: string | null };
        Returns: { id: string; status: string }[];
      };
      responder_conexao: {
        Args: { p_conexao: string; p_aceitar: boolean };
        Returns: undefined;
      };
      desfazer_conexao: {
        Args: { p_conexao: string };
        Returns: undefined;
      };
      minhas_conexoes: {
        Args: { p_outro?: string | null };
        Returns: {
          id: string;
          status: string;
          pedi: boolean;
          outro_id: string;
          outro_nome: string;
          outro_foto: string | null;
          outro_tipo: string;
          outro_cidade: string;
          outro_bairro: string | null;
          outro_na_vitrine: boolean;
          mensagem: string | null;
          criado_em: string;
          respondida_em: string | null;
          whatsapp: string | null;
          email: string | null;
          ultima_texto: string | null;
          ultima_em: string | null;
          ultima_minha: boolean | null;
          nao_lidas: number;
        }[];
      };
      conversas_por_pessoa: {
        Args: { p_outro?: string | null };
        Returns: {
          outro_id: string;
          outro_nome: string;
          outro_foto: string | null;
          outro_tipo: string;
          outro_na_vitrine: boolean;
          conversa_id: string | null;
          conectados: boolean;
          vagas: Json;
          desde: string | null;
          ultima_texto: string | null;
          ultima_em: string | null;
          ultima_minha: boolean | null;
          nao_lidas: number;
        }[];
      };
      abrir_conversa_com: {
        Args: { p_outro: string };
        Returns: string | null;
      };
      enviar_mensagem_para: {
        Args: { p_outro: string; p_texto: string };
        Returns: number;
      };
      marcar_conversa_lida_com: {
        Args: { p_outro: string };
        Returns: undefined;
      };
      estado_conexoes: {
        Args: { p_outros: string[] };
        Returns: { outro_id: string; conexao_id: string; status: string; pedi: boolean }[];
      };
      responder_finalista: {
        Args: {
          p_token: string;
          p_id: string;
          p_decisao: string | null;
          p_comentario?: string | null;
          p_quem?: string | null;
        };
        Returns: string;
      };
      responder_perguntas: {
        Args: { p_anuncio: string; p_respostas: Json };
        Returns: undefined;
      };
      responder_curtida: {
        Args: { p_anuncio: string; p_perfil: string; p_decisao: string };
        Returns: string;
      };
      renovar_anuncio: {
        Args: { p_id: string };
        Returns: string;
      };
      meus_servicos: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          oficio: string | null;
          categoria: string;
          titulo: string;
          descricao: string;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          fotos: string[];
          atende: string[];
          horario: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          status: string;
          expira_em: string;
        }[];
      };
      avaliar: {
        Args: { p_anuncio: string; p_nota: number; p_comentario?: string | null };
        /** "publicada" ou "pendente" (esperando a IA) */
        Returns: string;
      };
      responder_avaliacao: {
        Args: { p_avaliacao: number; p_resposta: string };
        Returns: string;
      };
      denunciar_avaliacao: {
        Args: { p_avaliacao: number; p_motivo: string };
        Returns: undefined;
      };
      avaliacoes_publicas: {
        Args: { p_profissional: string; p_limite?: number };
        Returns: {
          id: number;
          nota: number;
          comentario: string | null;
          titulo_servico: string;
          anuncio_id: string | null;
          criado_em: string;
          autor_nome: string;
          autor_foto: string | null;
          resposta: string | null;
          respondida_em: string | null;
        }[];
      };
      minhas_avaliacoes_recebidas: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: number;
          nota: number;
          comentario: string | null;
          titulo_servico: string;
          anuncio_id: string | null;
          criado_em: string;
          autor_nome: string;
          autor_foto: string | null;
          resposta: string | null;
          resposta_status: string | null;
          denunciada: boolean;
        }[];
      };
      minha_avaliacao: {
        Args: { p_anuncio: string };
        Returns: { id: number; nota: number; comentario: string | null; status: string; criado_em: string }[];
      };
      nota_do_profissional: {
        Args: { p_profissional: string };
        Returns: { media: number | null; total: number }[];
      };
      fila_avaliacoes: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avaliacao_id: number;
          parte: string;
          situacao: string;
          texto: string | null;
          nota: number;
          titulo_servico: string;
          anuncio_id: string | null;
          escritor_id: string;
          escritor_nome: string;
          escritor_advertencias: number;
          profissional_id: string;
          profissional_nome: string;
          ia_categorias: string[];
          ia_explicacao: string | null;
          motivo_denuncia: string | null;
          criado_em: string;
        }[];
      };
      moderar_avaliacao: {
        Args: { p_avaliacao: number; p_parte: string; p_decisao: string };
        Returns: undefined;
      };
      admin_advertencias: {
        Args: { p_usuario: string };
        Returns: { id: number; origem: string; motivo: string; avaliacao_id: number | null; criado_em: string }[];
      };
      servidor_pegar_avaliacoes_ia: {
        Args: { p_chave: string; p_limite?: number };
        Returns: {
          avaliacao_id: number;
          parte: string;
          versao: string;
          texto: string | null;
          nota: number;
          titulo_servico: string;
          modelo: string;
        }[];
      };
      servidor_resultado_avaliacao: {
        Args: {
          p_chave: string;
          p_avaliacao: number;
          p_parte: string;
          p_versao: string;
          p_decisao: string;
          p_categorias?: string[];
          p_explicacao?: string | null;
          p_modelo?: string | null;
        };
        Returns: string;
      };
      salvar_meus_servicos: {
        Args: {
          p_servicos: {
            id?: string;
            oficio: string | null;
            categoria: string;
            titulo: string;
            descricao: string;
            pagamento_valor: number | null;
            pagamento_unidade: string | null;
            fotos: string[];
          }[];
          p_cidade: string;
          p_bairro: string;
          p_lat: number;
          p_lng: number;
          p_atende: string[];
          p_horario: string | null;
        };
        Returns: number;
      };
      salvar_perfil: {
        Args: {
          p_nome: string;
          p_tipo: string;
          p_cidade: string;
          p_bairro: string | null;
          p_sobre: string | null;
          p_servicos: string[];
          p_foto: string | null;
          p_whatsapp: string | null;
          p_email: string | null;
          p_receber_emails?: boolean;
          /** só agências; aceita com ou sem pontuação */
          p_cnpj?: string | null;
        };
        Returns: undefined;
      };
      vagas_para_descobrir: {
        Args: { p_limite?: number };
        Returns: {
          id: string;
          titulo: string;
          /** até 600 letras */
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_verificado: boolean;
          contratante: string | null;
          contratante_confidencial: boolean;
          pede_curriculo: boolean;
          curtidas_7d: number;
          salvas_7d: number;
          minha_curtida: string | null;
          salva: boolean;
          dispensada: boolean;
        }[];
      };
      usar_ia_indicacoes: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      minha_casa: {
        Args: Record<PropertyKey, never>;
        Returns: { cep: string; cidade: string; bairro: string; lat: number; lng: number }[];
      };
      garantir_cliente: { Args: { p_nome: string }; Returns: string };
      meu_ultimo_endereco: {
        Args: Record<PropertyKey, never>;
        Returns: {
          cep: string | null;
          endereco: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
        }[];
      };
      cnpj_valido: {
        Args: { p_cnpj: string };
        Returns: boolean;
      };
      excluir_minha_conta: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      fila_moderacao: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          titulo: string;
          tipo: string;
          status: string;
          cidade: string;
          bairro: string;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          denuncias_abertas: number;
          motivos: string[];
          detalhes: string[];
          ia_retido: boolean;
          ia_falhou: boolean;
          ia_categorias: string[];
          ia_explicacao: string | null;
        }[];
      };
      moderar_anuncio: {
        Args: { p_anuncio: string; p_decisao: string; p_nota?: string | null };
        Returns: undefined;
      };
      eh_moderador: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      config_publica: {
        Args: Record<PropertyKey, never>;
        Returns: { ia_melhorar_texto: boolean; ia_modelo: string }[];
      };
      logo_emails: {
        Args: Record<PropertyKey, never>;
        Returns: { mostrar: boolean; url: string | null }[];
      };
      enviar_sugestao: {
        Args: { p_tipo: string; p_texto: string; p_pagina: string | null; p_email: string | null };
        Returns: number;
      };
      assistente_ligado: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      servidor_usar_assistente: {
        Args: { p_chave: string; p_quem: string; p_limite: number };
        Returns: boolean;
      };
      minha_conta_suspensa: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      usar_ia_resumo: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      talentos_para_vaga: {
        Args: { p_anuncio: string };
        Returns: {
          perfil_id: string;
          nome: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          escolaridade: string | null;
          curso: string | null;
          experiencias: Json;
          cursos: string[];
          cnh: string | null;
          disponibilidade: string[];
          atualizado_em: string;
          convidado: boolean;
          titulo: string | null;
          habilidades: string[];
          estudos: Json;
        }[];
      };
      convidar_para_vaga: {
        Args: { p_anuncio: string; p_perfil: string };
        Returns: undefined;
      };
      /** a aba Talentos (aberta): só o resumo de quem está na vitrine */
      buscar_talentos: {
        Args: {
          p_texto?: string | null;
          p_cidade?: string | null;
          p_bairro?: string | null;
          p_limite?: number;
          p_deslocamento?: number;
        };
        Returns: {
          perfil_id: string;
          nome: string;
          cidade: string;
          bairro: string | null;
          titulo: string | null;
          habilidades: string[];
          cursos: string[];
          escolaridade: string | null;
          cnh: string | null;
          disponibilidade: string[];
          cargos: string[];
          meses_experiencia: number;
          atualizado_em: string;
          total: number;
        }[];
      };
      talento_resumo: {
        Args: { p_perfil: string };
        Returns: {
          perfil_id: string;
          nome: string;
          cidade: string;
          bairro: string | null;
          titulo: string | null;
          habilidades: string[];
          cursos: string[];
          escolaridade: string | null;
          curso: string | null;
          cnh: string | null;
          disponibilidade: string[];
          cargos: string[];
          meses_experiencia: number;
          atualizado_em: string;
          estudos: Json;
        }[];
      };
      /** o currículo completo: só empresa, comércio e agência que entraram */
      talento_completo: {
        Args: { p_perfil: string };
        Returns: {
          perfil_id: string;
          nome: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          titulo: string | null;
          habilidades: string[];
          escolaridade: string | null;
          curso: string | null;
          experiencias: Json;
          cursos: string[];
          cnh: string | null;
          disponibilidade: string[];
          atualizado_em: string;
          estudos: Json;
        }[];
      };
      usar_ia_texto: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };

      // ---------------------------------------------------- painel (admin e moderação)
      admin_resumo: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_saude: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_acessos_site: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_listar_usuarios: {
        Args: { p_busca?: string | null; p_filtro?: string; p_limite?: number; p_deslocamento?: number };
        Returns: {
          id: string;
          email: string | null;
          telefone: string | null;
          provedor: string;
          criado_em: string;
          ultimo_acesso: string | null;
          nome: string | null;
          tipo: string | null;
          cidade: string | null;
          bairro: string | null;
          foto: string | null;
          verificado: boolean;
          whatsapp: string | null;
          moderador: boolean;
          suspenso_ate: string | null;
          suspensao_tipo: string | null;
          anuncios_total: number;
          anuncios_no_ar: number;
          denuncias_recebidas: number;
          total: number;
        }[];
      };
      admin_usuario: {
        Args: { p_id: string };
        Returns: Json;
      };
      admin_listar_anuncios: {
        Args: {
          p_busca?: string | null;
          p_status?: string;
          p_tipo?: string | null;
          p_autor?: string | null;
          p_limite?: number;
          p_deslocamento?: number;
        };
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          cidade: string;
          bairro: string;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          autor_id: string;
          autor_nome: string;
          autor_suspenso: boolean;
          curtidas: number;
          matches: number;
          denuncias_abertas: number;
          ia_decisao: string | null;
          total: number;
        }[];
      };
      admin_anuncio: {
        Args: { p_id: string };
        Returns: Json;
      };
      admin_excluir_anuncio: {
        Args: { p_id: string; p_motivo?: string | null };
        Returns: undefined;
      };
      admin_suspender: {
        Args: { p_usuario: string; p_dias: number | null; p_motivo: string };
        Returns: string;
      };
      admin_reativar: {
        Args: { p_usuario: string };
        Returns: undefined;
      };
      admin_verificar: {
        Args: { p_usuario: string; p_verificado: boolean };
        Returns: undefined;
      };
      admin_excluir_conta: {
        Args: { p_usuario: string; p_motivo: string };
        Returns: undefined;
      };
      admin_listar_moderadores: {
        Args: Record<PropertyKey, never>;
        Returns: { perfil_id: string; email: string | null; nome: string; foto: string | null; criado_em: string }[];
      };
      admin_adicionar_moderador: {
        Args: { p_email: string };
        Returns: string;
      };
      admin_remover_moderador: {
        Args: { p_perfil: string };
        Returns: undefined;
      };
      admin_config: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["config_site"]["Row"][];
      };
      admin_salvar_logo_emails: {
        Args: { p_mostrar: boolean; p_url: string | null };
        Returns: undefined;
      };
      admin_listar_sugestoes: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: number;
          tipo: string;
          texto: string;
          pagina: string | null;
          email: string | null;
          autor_id: string | null;
          autor_nome: string | null;
          autor_email: string | null;
          status: string;
          posicao: number;
          nota: string | null;
          criado_em: string;
          atualizado_em: string;
        }[];
      };
      admin_mover_sugestao: {
        Args: { p_id: number; p_status: string; p_posicao: number };
        Returns: undefined;
      };
      admin_anotar_sugestao: {
        Args: { p_id: number; p_nota: string | null };
        Returns: undefined;
      };
      admin_apagar_sugestao: {
        Args: { p_id: number };
        Returns: undefined;
      };
      admin_salvar_config_assistente: {
        Args: { p_ativo: boolean };
        Returns: undefined;
      };
      admin_salvar_config_emails: {
        Args: {
          p_emails_ativos: boolean;
          p_remetente_nome: string;
          p_responder_para: string | null;
          p_email_curtida: boolean;
          p_email_match: boolean;
          p_email_moderacao: boolean;
          p_email_conta: boolean;
          p_avisos_para: string[];
          p_aviso_denuncia: boolean;
          p_aviso_cadastro: boolean;
          p_aviso_retirado: boolean;
          p_email_boas_vindas?: boolean;
          p_aviso_falha?: boolean;
        };
        Returns: undefined;
      };
      admin_listar_falhas: {
        Args: { p_limite?: number };
        Returns: {
          id: number;
          onde: string;
          etapa: string;
          mensagem: string;
          detalhe: string | null;
          codigo: string | null;
          campos: string[];
          pagina: string | null;
          navegador: string | null;
          conta_id: string | null;
          conta_nome: string | null;
          conta_tipo: string | null;
          avisado: boolean;
          criado_em: string;
        }[];
      };
      registrar_falha_cadastro: {
        Args: {
          p_onde: string;
          p_etapa: string;
          p_mensagem: string;
          p_detalhe?: string;
          p_codigo?: string;
          p_campos?: string[];
          p_pagina?: string;
          p_navegador?: string;
        };
        Returns: undefined;
      };
      admin_salvar_config_ia: {
        Args: { p_moderacao: boolean; p_melhorar_texto: boolean; p_resumo: boolean; p_modelo: string };
        Returns: undefined;
      };
      admin_modelos_email: {
        Args: Record<PropertyKey, never>;
        Returns: {
          chave: string;
          grupo: string;
          nome: string;
          descricao: string;
          variaveis: string[];
          assunto: string;
          corpo: string;
          botao: string | null;
          alterado: boolean;
          atualizado_em: string | null;
        }[];
      };
      admin_salvar_modelo_email: {
        Args: { p_chave: string; p_assunto: string; p_corpo: string; p_botao: string | null };
        Returns: undefined;
      };
      admin_restaurar_modelo_email: {
        Args: { p_chave: string };
        Returns: undefined;
      };
      admin_fila_emails: {
        Args: { p_limite?: number };
        Returns: {
          id: number;
          modelo: string;
          para: string;
          status: string;
          tentativas: number;
          erro: string | null;
          criado_em: string;
          enviado_em: string | null;
        }[];
      };
      admin_reenviar_emails: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      admin_email_teste: {
        Args: { p_para: string };
        Returns: number;
      };
      /** manda um modelo de e-mail para a conta, na hora (devolve o id na fila) */
      admin_enviar_email: {
        Args: { p_usuario: string; p_modelo: string; p_dados?: Record<string, string> };
        Returns: number;
      };
      /** boas-vindas para quem se cadastrou, não publicou e ainda não recebeu (devolve quantos) */
      admin_boas_vindas_pendentes: { Args: Record<PropertyKey, never>; Returns: number };
      /** convites por e-mail: quantas contas recebem agora e quantas já receberam, por convite */
      admin_convites_por_email: {
        Args: Record<PropertyKey, never>;
        Returns: { modelo: string; recebem: number; ja_receberam: number }[];
      };
      /** põe o convite na fila para quem ainda pode receber (devolve quantos) */
      admin_enviar_convite_email: { Args: { p_modelo: string }; Returns: number };
      /** o convite no sino, para quem não tem e-mail: quantos recebem agora e quantos já receberam */
      admin_avisos_de_convite: {
        Args: Record<PropertyKey, never>;
        Returns: { modelo: string; recebem: number; ja_receberam: number }[];
      };
      /** põe o convite no sino de quem não tem e-mail e ainda não recebeu (devolve quantos) */
      admin_enviar_aviso_convite: { Args: { p_modelo: string }; Returns: number };
      /** o convite para a conta desse e-mail, mesmo fora do grupo (devolve o id na fila) */
      admin_convite_email_teste: { Args: { p_modelo: string; p_email: string }; Returns: number };
      /** os serviços da conta, como ela vê em "Meus serviços" (admin) */
      admin_servicos_de: {
        Args: { p_usuario: string };
        Returns: Database["public"]["Functions"]["meus_servicos"]["Returns"];
      };
      /** salva a vitrine da conta com as regras de salvar_meus_servicos (admin) */
      admin_salvar_servicos_de: {
        Args: {
          p_usuario: string;
          p_servicos: Database["public"]["Functions"]["salvar_meus_servicos"]["Args"]["p_servicos"];
          p_cidade: string;
          p_bairro: string;
          p_lat: number;
          p_lng: number;
          p_atende: string[];
          p_horario: string | null;
        };
        Returns: number;
      };
      admin_emails_do_usuario: {
        Args: { p_usuario: string; p_limite?: number };
        Returns: {
          id: number;
          modelo: string;
          para: string;
          status: string;
          tentativas: number;
          erro: string | null;
          criado_em: string;
          enviado_em: string | null;
        }[];
      };
      admin_status_email: {
        Args: { p_id: number };
        Returns: { status: string; erro: string | null; enviado_em: string | null }[];
      };
      admin_decisoes_ia: {
        Args: { p_limite?: number };
        Returns: {
          id: number;
          anuncio_id: string;
          titulo: string;
          status: string;
          decisao: string;
          categorias: string[];
          explicacao: string | null;
          modelo: string | null;
          criado_em: string;
        }[];
      };
      admin_dados_para_resumo: {
        Args: { p_dias?: number };
        Returns: Json;
      };
      admin_salvar_resumo: {
        Args: { p_texto: string; p_dias: number; p_modelo: string | null };
        Returns: number;
      };
      admin_ultimo_resumo: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: number;
          texto: string;
          dias: number;
          modelo: string | null;
          criado_em: string;
          criado_por: string;
        }[];
      };
      admin_registro: {
        Args: { p_limite?: number; p_alvo?: string | null };
        Returns: {
          id: number;
          quem: string;
          acao: string;
          alvo_tipo: string;
          alvo_id: string | null;
          rotulo: string | null;
          detalhes: Json;
          criado_em: string;
        }[];
      };
      admin_listar_chaves_servidor: {
        Args: Record<PropertyKey, never>;
        Returns: { id: number; nome: string; criada_em: string; usada_em: string | null }[];
      };
      admin_criar_chave_servidor: {
        Args: { p_nome: string; p_hash: string };
        Returns: number;
      };
      admin_apagar_chave_servidor: {
        Args: { p_id: number };
        Returns: undefined;
      };

      // ---------------------------------------------------- servidor do site (chave do servidor)
      servidor_pegar_emails: {
        Args: { p_chave: string; p_limite?: number; p_so_teste?: boolean };
        Returns: {
          id: number;
          modelo: string;
          grupo: string;
          para: string;
          dados: Json;
          assunto: string;
          corpo: string;
          botao: string | null;
          remetente_nome: string;
          responder_para: string | null;
        }[];
      };
      servidor_marcar_email: {
        Args: { p_chave: string; p_id: number; p_ok: boolean; p_erro?: string | null };
        Returns: undefined;
      };
      servidor_pegar_revisoes_ia: {
        Args: { p_chave: string; p_limite?: number };
        Returns: {
          anuncio_id: string;
          versao: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          autor_tipo: string;
          modelo: string;
          oficio: string | null;
          fotos: string[];
          contratante: string | null;
          contratante_confidencial: boolean;
          ganhos_extras: Json;
        }[];
      };
      servidor_resultado_ia: {
        Args: {
          p_chave: string;
          p_anuncio: string;
          p_versao: string;
          p_decisao: string;
          p_categorias?: string[];
          p_explicacao?: string | null;
          p_modelo?: string | null;
        };
        Returns: string;
      };
    };
    Enums: SemTabela;
    CompositeTypes: SemTabela;
  };
};
