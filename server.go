package main

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Server serves the panel and forwards rclone API calls to the private rcd.
//
// Security:
//   - listens on 127.0.0.1 only and checks the Host header (no DNS rebinding);
//   - the API needs a session cookie (HttpOnly, SameSite=Strict) obtained
//     through /entrar?t=<secret>, which only this app opens in the browser;
//   - state-changing requests from another origin are refused;
//   - the browser never sees rclone's own credentials.
type Server struct {
	dir     string
	port    int
	secret  string
	rcd     *Rcd
	auto    *Automations
	web     fs.FS
	version string
	quit    chan struct{}
	proxy   *httputil.ReverseProxy
}

const cookieName = "rclone_painel"

func newServer(dir string, port int, secret string, rcd *Rcd, auto *Automations, web fs.FS, version string) *Server {
	target := &url.URL{Scheme: "http", Host: rcd.addr}
	p := httputil.NewSingleHostReverseProxy(target)
	base := p.Director
	p.Director = func(r *http.Request) {
		base(r)
		r.Header.Del("Cookie")
		r.Header.Del("Origin")
		r.Header.Del("Referer")
		r.SetBasicAuth(rcd.user, rcd.pass)
		r.Host = rcd.addr
	}
	p.Transport = &http.Transport{Proxy: nil}
	p.FlushInterval = -1
	return &Server{dir: dir, port: port, secret: secret, rcd: rcd, auto: auto, web: web, version: version, quit: make(chan struct{}), proxy: p}
}

func (s *Server) allowedHost(h string) bool {
	host, port, err := net.SplitHostPort(h)
	if err != nil {
		return false
	}
	return (host == "127.0.0.1" || host == "localhost") && port == itoa(s.port)
}

func (s *Server) authed(r *http.Request) bool {
	if c, err := r.Cookie(cookieName); err == nil && subtle.ConstantTimeCompare([]byte(c.Value), []byte(s.secret)) == 1 {
		return true
	}
	if a := r.Header.Get("Authorization"); strings.HasPrefix(a, "Basic ") {
		raw, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(a, "Basic "))
		want := "painel:" + s.secret
		return subtle.ConstantTimeCompare(raw, []byte(want)) == 1
	}
	return false
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.allowedHost(r.Host) {
		http.Error(w, "host não permitido", http.StatusMisdirectedRequest)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		if o := r.Header.Get("Origin"); o != "" {
			u, err := url.Parse(o)
			if err != nil || !s.allowedHost(u.Host) {
				http.Error(w, "origem não permitida", http.StatusForbidden)
				return
			}
		}
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")

	switch {
	case r.URL.Path == "/entrar":
		s.login(w, r)
	case r.URL.Path == "/api/ping":
		writeJSON(w, map[string]string{"app": "rclone-painel"})
	case strings.HasPrefix(r.URL.Path, "/api/"):
		if !s.authed(r) {
			http.Error(w, `{"error":"não autenticado"}`, http.StatusUnauthorized)
			return
		}
		s.api(w, r)
	case r.Method == http.MethodPost || strings.HasPrefix(r.URL.Path, "/["):
		// rclone rc methods are POSTs; downloads are GET /[remote:]path.
		if !s.authed(r) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, `{"error":"não autenticado"}`)
			return
		}
		s.proxy.ServeHTTP(w, r)
	default:
		s.static(w, r)
	}
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	t := r.URL.Query().Get("t")
	if subtle.ConstantTimeCompare([]byte(t), []byte(s.secret)) != 1 {
		http.Error(w, "Link de acesso inválido. Abra o painel pelo aplicativo rclone-painel.", http.StatusForbidden)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    s.secret,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   30 * 24 * 3600,
	})
	home, _ := os.UserHomeDir()
	http.Redirect(w, r, "/#home="+url.QueryEscape(home), http.StatusSeeOther)
}

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if p == "" || !fileInFS(s.web, p) {
		p = "index.html"
	}
	if p == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	}
	http.ServeFileFS(w, r, s.web, p)
}

func fileInFS(f fs.FS, p string) bool {
	st, err := fs.Stat(f, p)
	return err == nil && !st.IsDir()
}

func (s *Server) api(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/api/info":
		home, _ := os.UserHomeDir()
		writeJSON(w, map[string]any{"home": home, "os": runtime.GOOS, "versao": s.version, "separador": string(os.PathSeparator), "drives": drives()})

	case r.URL.Path == "/api/automacoes" && r.Method == http.MethodGet:
		writeJSON(w, map[string]any{"automacoes": s.auto.List(), "estado": s.auto.States()})

	case r.URL.Path == "/api/automacoes" && r.Method == http.MethodPut:
		var list []Automation
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&list); err != nil {
			writeErr(w, "dados inválidos", http.StatusBadRequest)
			return
		}
		for i := range list {
			if list[i].CriadaEm.IsZero() {
				list[i].CriadaEm = time.Now()
			}
		}
		if err := s.auto.Replace(list); err != nil {
			writeErr(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"automacoes": s.auto.List(), "estado": s.auto.States()})

	case strings.HasPrefix(r.URL.Path, "/api/automacoes/") && strings.HasSuffix(r.URL.Path, "/rodar") && r.Method == http.MethodPost:
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/automacoes/"), "/rodar")
		if err := s.auto.RunNow(id); err != nil {
			writeErr(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})

	case r.URL.Path == "/api/logs":
		s.logs(w, r)

	case r.URL.Path == "/api/logs/baixar":
		s.downloadLog(w, r)

	case r.URL.Path == "/api/tarefas":
		writeJSON(w, automationJobLabels())

	case r.URL.Path == "/api/sistema":
		writeJSON(w, mountSupport())

	case r.URL.Path == "/api/sistema/instalar-montagem" && r.Method == http.MethodPost:
		msg, err := installMountSupport()
		if err != nil {
			writeErr(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"mensagem": msg})

	case r.URL.Path == "/api/inicio" && r.Method == http.MethodGet:
		on, supported := autostartEnabled()
		writeJSON(w, map[string]bool{"ativo": on, "suportado": supported})

	case r.URL.Path == "/api/inicio" && r.Method == http.MethodPost:
		var body struct {
			Ativo bool `json:"ativo"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body)
		if err := setAutostart(body.Ativo); err != nil {
			writeErr(w, err.Error(), http.StatusInternalServerError)
			return
		}
		on, supported := autostartEnabled()
		writeJSON(w, map[string]bool{"ativo": on, "suportado": supported})

	case r.URL.Path == "/api/encerrar" && r.Method == http.MethodPost:
		writeJSON(w, map[string]bool{"ok": true})
		go func() {
			time.Sleep(300 * time.Millisecond)
			close(s.quit)
		}()

	default:
		writeErr(w, "não encontrado", http.StatusNotFound)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

// drives lists Windows drive letters ("C:", "D:"…); empty elsewhere.
func drives() []string {
	out := []string{}
	if runtime.GOOS != "windows" {
		return out
	}
	for c := 'A'; c <= 'Z'; c++ {
		d := string(c) + ":"
		if _, err := os.Stat(d + `\`); err == nil {
			out = append(out, d)
		}
	}
	return out
}

// logs returns the lines of one of the two logs after byte offset "desde"
// (-1 = the last lines), plus the offset to ask from next time.
func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	path, ok := logFiles(s.dir)[r.URL.Query().Get("arquivo")]
	if !ok {
		writeErr(w, "log desconhecido", http.StatusBadRequest)
		return
	}
	since, err := strconv.ParseInt(r.URL.Query().Get("desde"), 10, 64)
	if err != nil {
		since = -1
	}
	lines, next, err := tailLines(path, since, 1000)
	if err != nil {
		writeErr(w, "não foi possível ler o log", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"linhas": lines, "proximo": next})
}

func (s *Server) downloadLog(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("arquivo")
	path, ok := logFiles(s.dir)[name]
	if !ok {
		writeErr(w, "log desconhecido", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`.log"`)
	http.ServeFile(w, r, path)
}
