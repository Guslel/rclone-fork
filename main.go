// Command rclone-painel is a local web panel for rclone. One executable per
// OS: it installs its own copy of rclone if needed, serves the panel on
// 127.0.0.1, opens the browser already signed in, and runs the automations
// in the background.
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

//go:embed all:dist
var distFS embed.FS

const appVersion = "1.0.0"

func main() {
	background := flag.Bool("segundo-plano", false, "não abrir o navegador (usado ao iniciar com o computador)")
	flag.Parse()

	port := 5572
	if p, err := strconv.Atoi(os.Getenv("RCLONE_PAINEL_PORT")); err == nil && p > 0 {
		port = p
	}

	dir, err := appDir()
	if err != nil {
		fatal("Não foi possível criar a pasta do aplicativo: %v", err)
	}
	if logFile, err := openRotating(filepath.Join(dir, "painel.log")); err == nil {
		log.SetOutput(io.MultiWriter(os.Stderr, logFile))
	}

	secret, err := loadSecret(filepath.Join(dir, "segredo"))
	if err != nil {
		fatal("Não foi possível preparar o acesso: %v", err)
	}
	loginURL := fmt.Sprintf("http://127.0.0.1:%d/entrar?t=%s", port, secret)

	// Already running (e.g. started with the computer): just open the panel.
	if alreadyRunning(port) {
		if !*background {
			if err := openBrowser(loginURL); err != nil {
				logAviso("não foi possível abrir o navegador: %v", err)
			}
		}
		return
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		fatal("A porta %d já está em uso por outro programa.", port)
	}

	ctx := context.Background()
	bin, err := ensureRclone(ctx, dir)
	if err != nil {
		fatal("Não foi possível instalar o rclone: %v\n\nConfira a conexão com a internet e tente de novo.", err)
	}
	rcd, err := startRcd(bin, filepath.Join(dir, "rclone.log"))
	if err != nil {
		fatal("Não foi possível iniciar o rclone: %v", err)
	}

	auto := newAutomations(dir, rcd)
	auto.Start(true)

	web, err := fs.Sub(distFS, "dist")
	if err != nil {
		fatal("Painel não encontrado no executável: %v", err)
	}
	srv := newServer(dir, port, secret, rcd, auto, web, appVersion)
	httpSrv := &http.Server{Handler: srv, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := httpSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logErro("servidor: %v", err)
		}
	}()
	logInfo("painel em http://127.0.0.1:%d", port)
	if !*background {
		go func() {
			if err := openBrowser(loginURL); err != nil {
				logAviso("não foi possível abrir o navegador: %v", err)
			}
		}()
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	select {
	case <-sig:
	case <-srv.quit:
	}
	logInfo("encerrando…")
	auto.Stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	_ = httpSrv.Shutdown(shutdownCtx)
	cancel()
	rcd.Stop()
}

// loadSecret returns the panel's login secret, creating it on first run. It
// lets a second launch (or the autostart copy) open the browser signed in.
func loadSecret(p string) (string, error) {
	if b, err := os.ReadFile(p); err == nil && len(strings.TrimSpace(string(b))) >= 32 {
		return strings.TrimSpace(string(b)), nil
	}
	s := randomString(32)
	return s, os.WriteFile(p, []byte(s), 0o600)
}

func alreadyRunning(port int) bool {
	c := http.Client{Timeout: time.Second, Transport: &http.Transport{Proxy: nil}}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/ping", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
	return strings.Contains(string(b), "rclone-painel")
}

func fatal(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	logErro("%s", msg)
	showError(msg)
	os.Exit(1)
}
