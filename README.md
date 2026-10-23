# Painel do rclone

Painel local para usar o rclone sem decorar comandos: contas, arquivos, cópia e sincronização com prévia, automações, montagem como disco e tarefas ao vivo. Funciona no navegador e é entregue como **um único executável por sistema**.

## Usar

- **Linux:** `rclone-painel` (ou "Painel do rclone" no menu de aplicativos).
- **Windows:** dois cliques em `rclone-painel.exe`.

Na primeira vez, o app baixa o rclone oficial (conferindo a assinatura digital) para a pasta dele. Depois abre o navegador já conectado. Abrir de novo, com o painel já rodando, só abre o navegador.

As contas são as mesmas do comando `rclone` (`~/.config/rclone/rclone.conf` no Linux, `%APPDATA%\rclone\rclone.conf` no Windows).

| | Linux | Windows |
|---|---|---|
| Pasta do app (rclone, automações, log) | `~/.config/rclone-painel` | `%APPDATA%\rclone-painel` |
| Iniciar com o computador | `~/.config/autostart/rclone-painel.desktop` | registro `HKCU\…\Run\RclonePainel` |
| Montar como disco | FUSE (já vem no Ubuntu) | WinFsp: o painel oferece instalar |

"Iniciar com o computador" (em Ajustes) guarda o caminho do executável. No Windows, deixe o `.exe` numa pasta fixa antes de ligar essa opção.

## Automações

Cada automação copia ou sincroniza uma pasta:

- **ao mudar:** o vigia nativo do sistema (inotify, ReadDirectoryChangesW ou FSEvents) avisa quando algo muda; o app espera 30 s sem novas mudanças e envia. Parado, não consome nada nem consulta a nuvem;
- **de tempos em tempos:** uma conferência a cada intervalo e logo depois que o app abre.

Regras ficam em `automacoes.json` e o histórico em `automacoes-estado.json`, na pasta do app.

## Gerar os executáveis

Requisitos: Node 22+, Go 1.26+.

```sh
npm install
./build.sh        # gera release/rclone-painel-linux e release/rclone-painel.exe
go test ./...
```

O `.exe` é gerado aqui mesmo (compilação cruzada), sem precisar de Windows.

Desenvolvimento da interface com recarregamento automático, contra um rclone separado:

```sh
RCLONE_RC_USER=dev RCLONE_RC_PASS=dev rclone rcd --rc-addr 127.0.0.1:5573 --rc-serve
RC_URL=http://127.0.0.1:5573 RC_AUTH=dev:dev npm run dev
```

## Como é por dentro

```
navegador ──▶ rclone-painel (127.0.0.1:5572) ──▶ rclone rcd (127.0.0.1:porta aleatória)
               │ serve o painel embutido
               │ /api/*: automações, iniciar com o PC, dependências
               └ repassa o resto ao rclone com a senha interna
```

- `main.go`: início, instância única, encerramento.
- `server.go`: segurança, painel embutido, repasse ao rclone, `/api`.
- `rclone.go` e `download.go`: cópia própria do rclone (download verificado) e o `rcd`.
- `automations.go`: vigia de pastas, agenda e histórico.
- `system_*.go` e `proc_*.go`: diferenças entre Linux, Windows e macOS.
- `src/`: interface (React + TypeScript).

## Segurança

- Só escuta em `127.0.0.1` e confere o cabeçalho `Host`, o que impede DNS rebinding.
- O acesso usa um cookie `HttpOnly`/`SameSite=Strict`, obtido pelo link `/entrar?t=…` que só o app abre. Pedidos que alteram algo, vindos de outro site, são recusados.
- O navegador nunca vê a senha do rclone interno, que é nova a cada início e passa por variável de ambiente.
- O rclone baixado precisa da assinatura PGP da chave de lançamento do rclone (fingerprint `FBF737EC…54FA`) e do SHA-256 assinado.
- Tudo o que apaga ou sobrescreve pede confirmação, e as transferências mostram prévia.
