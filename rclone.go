package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Rcd is the private `rclone rcd` the app talks to. It listens on a random
// 127.0.0.1 port with a random password; only this process knows both.
type Rcd struct {
	cmd    *exec.Cmd
	addr   string
	user   string
	pass   string
	client *http.Client
}

func randomString(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// ensureRclone returns the app's own rclone, downloading it on first use.
func ensureRclone(ctx context.Context, dir string) (string, error) {
	bin := filepath.Join(dir, "bin", "rclone"+exeSuffix)
	if fileExists(bin) {
		cmd := exec.Command(bin, "version")
		hideWindow(cmd)
		if err := cmd.Run(); err == nil {
			return bin, nil
		}
	}
	logInfo("baixando o rclone oficial…")
	version, err := downloadRclone(ctx, bin)
	if err != nil {
		return "", err
	}
	logInfo("rclone %s instalado em %s", version, bin)
	return bin, nil
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func startRcd(bin, logFile string) (*Rcd, error) {
	port, err := freePort()
	if err != nil {
		return nil, err
	}
	r := &Rcd{
		addr:   fmt.Sprintf("127.0.0.1:%d", port),
		user:   "app",
		pass:   randomString(24),
		client: &http.Client{Transport: &http.Transport{Proxy: nil}},
	}
	cmd := exec.Command(bin, "rcd",
		"--rc-addr", r.addr,
		"--rc-serve",
		"--rc-job-expire-duration", "24h",
		"--log-level", "NOTICE",
		"--log-file", logFile,
		"--log-file-max-size", "5M",
		"--log-file-max-backups", "1",
	)
	// Credentials go through the environment so they never show in the
	// process list; inherited RCLONE_RC_* settings are dropped.
	env := []string{}
	for _, e := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(e), "RCLONE_RC_") {
			env = append(env, e)
		}
	}
	cmd.Env = append(env, "RCLONE_RC_USER="+r.user, "RCLONE_RC_PASS="+r.pass)
	hideWindow(cmd)
	killWithParent(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	r.cmd = cmd

	exited := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(exited)
	}()
	for i := 0; i < 100; i++ {
		select {
		case <-exited:
			return nil, fmt.Errorf("o rclone fechou ao iniciar; veja %s", logFile)
		default:
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		err := r.Call(ctx, "rc/noopauth", nil, nil)
		cancel()
		if err == nil {
			return r, nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	_ = cmd.Process.Kill()
	return nil, fmt.Errorf("o rclone não respondeu; veja %s", logFile)
}

// Call runs one rc method and decodes the JSON reply into out (if not nil).
func (r *Rcd) Call(ctx context.Context, method string, in any, out any) error {
	if in == nil {
		in = map[string]any{}
	}
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+r.addr+"/"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(r.user, r.pass)
	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return fmt.Errorf("%s: resposta inválida", method)
	}
	if resp.StatusCode != http.StatusOK {
		msg, _ := raw["error"].(string)
		return fmt.Errorf("%s", msg)
	}
	if out != nil {
		b, _ := json.Marshal(raw)
		return json.Unmarshal(b, out)
	}
	return nil
}

func (r *Rcd) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	_ = r.Call(ctx, "core/quit", nil, nil)
	cancel()
	done := make(chan struct{})
	go func() {
		_, _ = r.cmd.Process.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		_ = r.cmd.Process.Kill()
	}
}

// runWithTimeout runs cmd and waits at most d for it to finish.
func runWithTimeout(cmd *exec.Cmd, d time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(d):
		return nil
	}
}
