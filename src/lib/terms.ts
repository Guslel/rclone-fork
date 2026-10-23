// Plain-Portuguese explanations of rclone concepts, shown in <Hint>s.

export const TERMS = {
  remote: {
    title: "Conta (remote)",
    text: "É o nome que o rclone dá a uma nuvem já conectada, como um Google Drive. Os caminhos ficam no formato conta:pasta/arquivo.",
  },
  copy: {
    title: "Copiar",
    text: "Envia para o destino os arquivos novos ou alterados. Nunca apaga nada no destino.",
  },
  sync: {
    title: "Sincronizar",
    text: "Deixa o destino idêntico à origem. Arquivos que existem só no destino são apagados. A origem não é alterada.",
  },
  move: {
    title: "Mover",
    text: "Copia para o destino e depois apaga os arquivos da origem.",
  },
  bisync: {
    title: "Sincronização nos dois sentidos (bisync)",
    text: "Mudanças de qualquer lado são levadas para o outro. Na primeira vez é preciso uma sincronização inicial completa (resync).",
  },
  dryRun: {
    title: "Prévia (dry-run)",
    text: "O rclone simula a operação e conta o que faria, sem mexer em nenhum arquivo.",
  },
  mount: {
    title: "Montar como disco",
    text: "A nuvem aparece como uma pasta comum do computador. Os arquivos são baixados quando você abre e enviados quando salva. A pasta some quando o rclone é encerrado.",
  },
  cacheMode: {
    title: "Cache de arquivos",
    text: "Controla o que o rclone guarda no computador enquanto a nuvem está montada. “Escrita” é o recomendado: permite editar arquivos normalmente com pouco uso de disco.",
  },
  bwlimit: {
    title: "Limite de banda",
    text: "Velocidade máxima que o rclone usa para enviar e baixar. Útil para não travar a internet da casa.",
  },
  publicLink: {
    title: "Link público",
    text: "Cria um link para compartilhar o arquivo com quem não tem acesso à sua conta. Nem todo serviço suporta.",
  },
  purge: {
    title: "Apagar pasta inteira",
    text: "Apaga a pasta e tudo o que há dentro dela, de uma vez.",
  },
  cleanup: {
    title: "Esvaziar lixeira",
    text: "Apaga de vez os arquivos que estão na lixeira da nuvem. Não dá para desfazer.",
  },
  checks: {
    title: "Verificados",
    text: "Arquivos que o rclone comparou e já estavam iguais nos dois lados, por isso não foram enviados de novo.",
  },
  job: {
    title: "Tarefa",
    text: "Toda operação longa vira uma tarefa no rclone. Ela continua rodando mesmo se você fechar esta aba, enquanto o rclone estiver aberto.",
  },
  quota: {
    title: "Espaço",
    text: "Quanto a nuvem informa de espaço total e usado. Alguns serviços não informam.",
  },
  exclude: {
    title: "Ignorar arquivos",
    text: "Padrões de arquivos que não devem ser transferidos, um por linha. Ex.: *.tmp ignora arquivos .tmp; .git/** ignora a pasta .git.",
  },
} as const;

export type TermKey = keyof typeof TERMS;

// ---------- Remote setup questions ----------
// rclone asks its configuration questions in English. These cover the ones
// people meet most; anything else falls back to rclone's own text.

type QuestionText = { title: string; help: string };

export const QUESTIONS: Record<string, QuestionText> = {
  client_id: {
    title: "Client ID (opcional)",
    help: "Identificação de um aplicativo seu no serviço. Deixe em branco para usar o do rclone. Ter o seu evita limites de uso compartilhados.",
  },
  client_secret: {
    title: "Client secret (opcional)",
    help: "A senha que acompanha o Client ID. Deixe em branco se deixou o Client ID em branco.",
  },
  scope: {
    title: "Nível de acesso",
    help: "O que o rclone poderá fazer na conta. “drive” (acesso total) é o mais comum.",
  },
  service_account_file: {
    title: "Arquivo de conta de serviço (opcional)",
    help: "Só para contas de empresa que usam conta de serviço. Deixe em branco.",
  },
  config_is_local: {
    title: "Fazer login pelo navegador deste computador?",
    help: "Responda Sim: o navegador vai abrir na página de login do serviço. Depois de autorizar, volte para esta aba.",
  },
  config_shared_client_id: {
    title: "Continuar com o acesso compartilhado do rclone?",
    help: "O acesso compartilhado que o rclone usa no Google será desativado ao longo de 2026. Sim: funciona agora, mas talvez você precise reconectar depois. Não: você informa um Client ID próprio (rclone.org/drive/#making-your-own-client-id).",
  },
  config_change_team_drive: {
    title: "Usar um Drive compartilhado?",
    help: "Responda Não para usar o seu “Meu Drive”. Sim só se quiser um Drive compartilhado de equipe.",
  },
  config_team_drive: {
    title: "Configurar como Drive compartilhado?",
    help: "Responda Não para usar o seu “Meu Drive”.",
  },
  config_fs_advanced: {
    title: "Ver opções avançadas?",
    help: "Responda Não. As opções avançadas raramente são necessárias.",
  },
  config_type: {
    title: "Tipo de conta",
    help: "Escolha onde estão os arquivos que você quer acessar.",
  },
  config_driveid: {
    title: "Qual drive usar?",
    help: "Escolha o drive da lista. Normalmente é o primeiro.",
  },
  config_driveid_fixed: {
    title: "Qual drive usar?",
    help: "Escolha o drive da lista. Normalmente é o primeiro.",
  },
  region: {
    title: "Região",
    help: "Onde a conta está hospedada. Para contas pessoais, use a opção global/padrão.",
  },
  provider: {
    title: "Fornecedor",
    help: "Qual empresa fornece o armazenamento compatível com S3.",
  },
  env_auth: {
    title: "Pegar credenciais do ambiente?",
    help: "Responda Não para digitar as chaves de acesso a seguir.",
  },
  access_key_id: { title: "Access key ID", help: "Chave de acesso fornecida pelo serviço." },
  secret_access_key: { title: "Secret access key", help: "Chave secreta fornecida pelo serviço. Fica guardada na configuração do rclone." },
  endpoint: { title: "Endpoint", help: "Endereço do serviço. Deixe em branco para usar o padrão." },
  host: { title: "Servidor", help: "Endereço do servidor, por exemplo meuservidor.com ou 192.168.0.10." },
  user: { title: "Usuário", help: "Nome de usuário para entrar no servidor." },
  port: { title: "Porta", help: "Deixe em branco para usar a porta padrão." },
  pass: { title: "Senha", help: "A senha fica guardada na configuração do rclone, em formato ofuscado." },
  password: { title: "Senha", help: "A senha fica guardada na configuração do rclone, em formato ofuscado." },
  url: { title: "Endereço (URL)", help: "Endereço completo do servidor." },
  remote: {
    title: "Pasta ou conta de origem",
    help: "O que esta conta vai representar, no formato conta:pasta ou um caminho do computador.",
  },
  root_folder_id: {
    title: "ID da pasta raiz (opcional)",
    help: "Deixe em branco para começar pela raiz da conta.",
  },
};

export const YES_NO: Record<string, string> = { true: "Sim", false: "Não" };
