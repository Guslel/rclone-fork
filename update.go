package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The panel updates itself from the GitHub releases of its repository. A
// release is tagged vX.Y.Z and carries one executable per OS plus SHA256SUMS.
const releasesAPI = "https://api.github.com/repos/Guslel/rclone-web/releases/latest"

// updateCheckEvery limits GitHub API calls (60/hour without a token).
const updateCheckEvery = 6 * time.Hour

type UpdateInfo struct {
	Atual      string `json:"atual"`
	Nova       string `json:"nova,omitempty"`
	Notas      string `json:"notas,omitempty"`
	Disponivel bool   `json:"disponivel"`
	Erro       string `json:"erro,omitempty"`
}

type release struct {
	Tag    string `json:"tag_name"`
	Body   string `json:"body"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

type Updater struct {
	current string
	mu      sync.Mutex
	checked time.Time
	latest  *release
	err     error
}

func newUpdater(current string) *Updater {
	return &Updater{current: current}
}

// assetName is the release file for this OS, as build.sh names it.
func assetName() string {
	if runtime.GOOS == "windows" {
		return "rclone-painel.exe"
	}
	return "rclone-painel-" + runtime.GOOS
}

// Check returns what is known about the latest release, asking GitHub at most
// once per updateCheckEvery unless force is set.
func (u *Updater) Check(ctx context.Context, force bool) UpdateInfo {
	u.mu.Lock()
	defer u.mu.Unlock()
	if force || time.Since(u.checked) > updateCheckEvery {
		u.latest, u.err = fetchRelease(ctx)
		u.checked = time.Now()
	}
	info := UpdateInfo{Atual: u.current}
	if u.err != nil {
		info.Erro = u.err.Error()
		return info
	}
	info.Nova = strings.TrimPrefix(u.latest.Tag, "v")
	info.Notas = u.latest.Body
	info.Disponivel = newerVersion(info.Nova, u.current) && u.latest.asset(assetName()) != ""
	return info
}

func fetchRelease(ctx context.Context) (*release, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	raw, err := httpGet(ctx, releasesAPI, 1<<20)
	if err != nil {
		return nil, fmt.Errorf("não foi possível consultar as versões: %w", err)
	}
	var r release
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, err
	}
	if !versionRe.MatchString(r.Tag) {
		return nil, fmt.Errorf("versão inesperada: %q", r.Tag)
	}
	return &r, nil
}

func (r *release) asset(name string) string {
	for _, a := range r.Assets {
		if a.Name == name {
			return a.URL
		}
	}
	return ""
}

// newerVersion reports whether a ("1.2.0") is above b ("1.1.3").
func newerVersion(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x > y
		}
	}
	return false
}

// Install downloads the latest release's executable, checks it against the
// release's SHA256SUMS and puts it in place of the running one. The caller
// then restarts the panel.
func (u *Updater) Install(ctx context.Context) (string, error) {
	u.mu.Lock()
	r := u.latest
	u.mu.Unlock()
	if r == nil || !newerVersion(strings.TrimPrefix(r.Tag, "v"), u.current) {
		return "", errors.New("não há versão nova para instalar")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	name := assetName()
	binURL, sumsURL := r.asset(name), r.asset("SHA256SUMS")
	if binURL == "" || sumsURL == "" {
		return "", fmt.Errorf("a versão %s não tem %s e SHA256SUMS", r.Tag, name)
	}
	sums, err := httpGet(ctx, sumsURL, 1<<20)
	if err != nil {
		return "", err
	}
	want := ""
	for _, line := range strings.Split(string(sums), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && strings.TrimPrefix(f[1], "*") == name {
			want = strings.ToLower(f[0])
		}
	}
	if want == "" {
		return "", fmt.Errorf("%s não está no SHA256SUMS", name)
	}
	data, err := httpGet(ctx, binURL, 200<<20)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != want {
		return "", errors.New("o arquivo baixado não confere com o SHA256SUMS")
	}

	exe, err := currentExe()
	if err != nil {
		return "", err
	}
	tmp := exe + ".novo"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		return "", fmt.Errorf("não foi possível gravar a nova versão: %w", err)
	}
	// Windows can't overwrite a running .exe, but it can rename it.
	old := exe + ".old"
	_ = os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		os.Remove(tmp)
		return "", err
	}
	if err := os.Rename(tmp, exe); err != nil {
		_ = os.Rename(old, exe)
		return "", err
	}
	return r.Tag, nil
}

func currentExe() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

// removeOldExe deletes the copy left by the last update (on Windows it can
// only go once that version has exited).
func removeOldExe() {
	if exe, err := currentExe(); err == nil {
		_ = os.Remove(exe + ".old")
	}
}

// startUpdated launches the new executable; it waits for this process to free
// the port (see waitForPort) before starting.
func startUpdated() error {
	exe, err := currentExe()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, "--segundo-plano", "--apos-atualizar")
	hideWindow(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

// waitForPort waits up to 30 s for the previous version to release the port.
func waitForPort(port int) {
	for i := 0; i < 60; i++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			ln.Close()
			return
		}
		time.Sleep(500 * time.Millisecond)
	}
}
